/**
 * DCO (Dynamic Creative Optimization) Routes
 *
 * Endpoints for generating creative variants, running A/B tests,
 * detecting fatigue, and managing variant performance.
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import {
    requireOrganization,
    requirePermission,
    getOrganizationId,
    getUserId,
    createAuditLog
} from '../middleware/multiTenancy.js';
import { dcoOrchestrator, LaunchTestConfig } from '../services/dcoOrchestrator.js';
import { statisticalTestingService } from '../services/statisticalTestingService.js';
import { logger } from '../utils/logger.js';
import { query } from '../database/db.js';
import { BrandContext } from '../agents/base/types.js';

const router = Router();

/**
 * POST /api/dco/campaigns/:campaignId/generate-variants
 * Generate creative variants for a campaign
 */
router.post(
    '/campaigns/:campaignId/generate-variants',
    requireAuth,
    requireOrganization,
    requirePermission('campaigns.edit'),
    async (req: Request, res: Response) => {
        try {
            const { campaignId } = req.params;
            const organizationId = getOrganizationId(req)!;

            // Validate request body
            const variantConfigSchema = z.object({
                variantCount: z.number().min(1).max(100).default(50),
                vary: z.array(z.enum(['headlines', 'images', 'ctas', 'videos'])).min(1),
                constraints: z.object({
                    brand_voice: z.boolean().optional(),
                    max_text_length: z.number().optional(),
                    aspect_ratios: z.array(z.string()).optional()
                }).optional()
            });

            const parsedData = variantConfigSchema.parse(req.body);

            // Ensure required variantCount is present
            const config = {
                variantCount: parsedData.variantCount!,
                vary: parsedData.vary!,
                constraints: parsedData.constraints
            };

            // Get campaign to fetch brand context
            const campaignResult = await query<any>(
                `SELECT c.*, b.name as brand_name, b.industry, b.voice_tone, b.visual_style
                 FROM campaigns c
                 LEFT JOIN brands b ON c.brand_id = b.id
                 WHERE c.id = $1 AND c.organization_id = $2`,
                [campaignId, organizationId]
            );

            if (campaignResult.rows.length === 0) {
                return res.status(404).json({ error: 'Campaign not found' });
            }

            const campaign = campaignResult.rows[0];

            // Build brand context
            const brandContext: BrandContext = {
                name: campaign.brand_name || 'Brand',
                industry: campaign.industry || 'general',
                voiceTone: campaign.voice_tone || ['professional'],
                colors: {
                    primary: campaign.primary_color || '#000000',
                    secondary: campaign.secondary_color || '#FFFFFF'
                }
            };

            // Generate variants
            const variants = await dcoOrchestrator.generateVariantMatrix(
                campaignId,
                organizationId,
                brandContext,
                campaign.brief || 'Generate creative variants',
                config
            );

            // Audit log
            await createAuditLog(req, 'dco.variants_generated', 'campaign', campaignId, {
                variant_count: variants.length,
                vary: config.vary
            });

            logger.info(`[DCO] Generated ${variants.length} variants for campaign ${campaignId}`);

            res.json({
                success: true,
                variants,
                count: variants.length
            });
        } catch (error: unknown) {
    const err = error as Error;
            logger.error('[DCO] Variant generation failed:', error);
            res.status(500).json({
                error: 'Failed to generate variants',
                message: err.message
            });
        }
    }
);

/**
 * POST /api/dco/tests
 * Launch a new A/B test
 */
router.post(
    '/tests',
    requireAuth,
    requireOrganization,
    requirePermission('campaigns.edit'),
    async (req: Request, res: Response) => {
        try {
            const organizationId = getOrganizationId(req)!;

            // Validate request body
            const testConfigSchema = z.object({
                campaignId: z.string().uuid(),
                name: z.string().min(1),
                variantIds: z.array(z.string().uuid()).min(2),
                trafficAllocation: z.record(z.number().min(0).max(100)),
                confidenceTarget: z.number().min(0.5).max(0.99).optional(),
                minSampleSize: z.number().min(10).optional(),
                maxDurationHours: z.number().min(1).max(720).optional()
            });

            const parsedConfig = testConfigSchema.parse(req.body);

            // Ensure required fields are present (Zod validation ensures this, but TypeScript needs assurance)
            const config: LaunchTestConfig = {
                campaignId: parsedConfig.campaignId!,
                name: parsedConfig.name!,
                variantIds: parsedConfig.variantIds!,
                trafficAllocation: parsedConfig.trafficAllocation!,
                confidenceTarget: parsedConfig.confidenceTarget,
                minSampleSize: parsedConfig.minSampleSize,
                maxDurationHours: parsedConfig.maxDurationHours
            };

            // Verify campaign ownership
            const campaignResult = await query<any>(
                `SELECT id FROM campaigns WHERE id = $1 AND organization_id = $2`,
                [config.campaignId, organizationId]
            );

            if (campaignResult.rows.length === 0) {
                return res.status(404).json({ error: 'Campaign not found' });
            }

            // Verify all variants belong to this campaign
            const variantsResult = await query<any>(
                `SELECT id FROM creative_variants
                 WHERE id = ANY($1) AND campaign_id = $2 AND organization_id = $3`,
                [config.variantIds, config.campaignId, organizationId]
            );

            if (variantsResult.rows.length !== config.variantIds.length) {
                return res.status(400).json({ error: 'Some variants not found or do not belong to this campaign' });
            }

            // Launch test
            const test = await dcoOrchestrator.launchTest(config);

            // Audit log
            await createAuditLog(req, 'dco.test_launched', 'campaign', config.campaignId, {
                test_id: test.id,
                test_name: test.name,
                variant_count: config.variantIds.length
            });

            logger.info(`[DCO] Launched test ${test.id} for campaign ${config.campaignId}`);

            res.json({
                success: true,
                test
            });
        } catch (error: unknown) {
    const err = error as Error;
            logger.error('[DCO] Test launch failed:', error);
            res.status(500).json({
                error: 'Failed to launch test',
                message: err.message
            });
        }
    }
);

/**
 * GET /api/dco/tests/:testId
 * Get test details and current results
 */
router.get(
    '/tests/:testId',
    requireAuth,
    requireOrganization,
    requirePermission('analytics.view'),
    async (req: Request, res: Response) => {
        try {
            const { testId } = req.params;
            const organizationId = getOrganizationId(req)!;

            // Get test
            const testResult = await query<any>(
                `SELECT * FROM variant_tests WHERE id = $1 AND organization_id = $2`,
                [testId, organizationId]
            );

            if (testResult.rows.length === 0) {
                return res.status(404).json({ error: 'Test not found' });
            }

            const test = testResult.rows[0];

            // Evaluate current state
            const evaluation = await dcoOrchestrator.evaluateTest(testId);

            res.json({
                success: true,
                test,
                evaluation
            });
        } catch (error: unknown) {
    const err = error as Error;
            logger.error('[DCO] Test retrieval failed:', error);
            res.status(500).json({
                error: 'Failed to retrieve test',
                message: err.message
            });
        }
    }
);

/**
 * PUT /api/dco/tests/:testId/pause
 * Pause a running test
 */
router.put(
    '/tests/:testId/pause',
    requireAuth,
    requireOrganization,
    requirePermission('campaigns.edit'),
    async (req: Request, res: Response) => {
        try {
            const { testId } = req.params;
            const organizationId = getOrganizationId(req)!;

            // Update test status
            const result = await query<any>(
                `UPDATE variant_tests
                 SET status = 'terminated', completed_at = NOW()
                 WHERE id = $1 AND organization_id = $2 AND status = 'running'
                 RETURNING *`,
                [testId, organizationId]
            );

            if (result.rows.length === 0) {
                return res.status(404).json({ error: 'Test not found or not running' });
            }

            // Pause all variants
            await query(
                `UPDATE creative_variants
                 SET status = 'paused'
                 WHERE id = ANY((SELECT variant_ids FROM variant_tests WHERE id = $1))`,
                [testId]
            );

            // Audit log
            await createAuditLog(req, 'dco.test_paused', 'variant_test', testId, {
                test_id: testId
            });

            logger.info(`[DCO] Paused test ${testId}`);

            res.json({
                success: true,
                test: result.rows[0]
            });
        } catch (error: unknown) {
    const err = error as Error;
            logger.error('[DCO] Test pause failed:', error);
            res.status(500).json({
                error: 'Failed to pause test',
                message: err.message
            });
        }
    }
);

/**
 * PUT /api/dco/tests/:testId/declare-winner
 * Declare test winner and reallocate budget
 */
router.put(
    '/tests/:testId/declare-winner',
    requireAuth,
    requireOrganization,
    requirePermission('campaigns.edit'),
    async (req: Request, res: Response) => {
        try {
            const { testId } = req.params;
            const organizationId = getOrganizationId(req)!;

            // Verify test ownership
            const testResult = await query<any>(
                `SELECT campaign_id FROM variant_tests WHERE id = $1 AND organization_id = $2`,
                [testId, organizationId]
            );

            if (testResult.rows.length === 0) {
                return res.status(404).json({ error: 'Test not found' });
            }

            // Declare winner
            await dcoOrchestrator.declareWinner(testId);

            // Get updated test
            const updatedTest = await query<any>(
                `SELECT * FROM variant_tests WHERE id = $1`,
                [testId]
            );

            // Audit log
            await createAuditLog(req, 'dco.winner_declared', 'variant_test', testId, {
                test_id: testId,
                winner_variant_id: updatedTest.rows[0].winner_variant_id,
                confidence: updatedTest.rows[0].winner_confidence
            });

            logger.info(`[DCO] Declared winner for test ${testId}: ${updatedTest.rows[0].winner_variant_id}`);

            res.json({
                success: true,
                test: updatedTest.rows[0]
            });
        } catch (error: unknown) {
    const err = error as Error;
            logger.error('[DCO] Winner declaration failed:', error);
            res.status(500).json({
                error: 'Failed to declare winner',
                message: err.message
            });
        }
    }
);

/**
 * GET /api/dco/campaigns/:campaignId/performance
 * Get variant performance for a campaign
 */
router.get(
    '/campaigns/:campaignId/performance',
    requireAuth,
    requireOrganization,
    requirePermission('analytics.view'),
    async (req: Request, res: Response) => {
        try {
            const { campaignId } = req.params;
            const organizationId = getOrganizationId(req)!;

            // Get all variants for campaign
            const variants = await dcoOrchestrator.getVariantsByCampaign(campaignId);

            // Calculate metrics for each variant
            const performance = variants.map(variant => {
                const ctr = variant.impressions > 0 ? (variant.clicks / variant.impressions) * 100 : 0;
                const cvr = variant.clicks > 0 ? (variant.conversions / variant.clicks) * 100 : 0;
                const cpa_cents = variant.conversions > 0 ? Math.round(variant.spend_cents / variant.conversions) : 0;

                return {
                    variant_id: variant.id,
                    variant_type: variant.variant_type,
                    status: variant.status,
                    content: variant.content,
                    metrics: {
                        impressions: variant.impressions,
                        clicks: variant.clicks,
                        conversions: variant.conversions,
                        ctr: parseFloat(ctr.toFixed(2)),
                        cvr: parseFloat(cvr.toFixed(2)),
                        cpa_cents,
                        spend_cents: variant.spend_cents
                    },
                    created_at: variant.created_at
                };
            });

            // Sort by CTR descending
            performance.sort((a, b) => b.metrics.ctr - a.metrics.ctr);

            res.json({
                success: true,
                campaign_id: campaignId,
                variants: performance,
                count: performance.length
            });
        } catch (error: unknown) {
    const err = error as Error;
            logger.error('[DCO] Performance retrieval failed:', error);
            res.status(500).json({
                error: 'Failed to retrieve performance',
                message: err.message
            });
        }
    }
);

/**
 * GET /api/dco/campaigns/:campaignId/fatigue-signals
 * Get creative fatigue signals
 */
router.get(
    '/campaigns/:campaignId/fatigue-signals',
    requireAuth,
    requireOrganization,
    requirePermission('analytics.view'),
    async (req: Request, res: Response) => {
        try {
            const { campaignId } = req.params;
            const organizationId = getOrganizationId(req)!;

            // Detect fatigue
            const signals = await dcoOrchestrator.detectFatigue(campaignId);

            res.json({
                success: true,
                campaign_id: campaignId,
                signals,
                count: signals.length
            });
        } catch (error: unknown) {
    const err = error as Error;
            logger.error('[DCO] Fatigue detection failed:', error);
            res.status(500).json({
                error: 'Failed to detect fatigue',
                message: err.message
            });
        }
    }
);

/**
 * POST /api/dco/campaigns/:campaignId/refresh-creatives
 * Rotate fatigued creatives with fresh variants
 */
router.post(
    '/campaigns/:campaignId/refresh-creatives',
    requireAuth,
    requireOrganization,
    requirePermission('campaigns.edit'),
    async (req: Request, res: Response) => {
        try {
            const { campaignId } = req.params;
            const organizationId = getOrganizationId(req)!;

            // Verify campaign ownership
            const campaignResult = await query<any>(
                `SELECT id FROM campaigns WHERE id = $1 AND organization_id = $2`,
                [campaignId, organizationId]
            );

            if (campaignResult.rows.length === 0) {
                return res.status(404).json({ error: 'Campaign not found' });
            }

            // Rotate creatives
            const newVariants = await dcoOrchestrator.rotateCreatives(campaignId, organizationId);

            // Audit log
            await createAuditLog(req, 'dco.creatives_refreshed', 'campaign', campaignId, {
                new_variant_count: newVariants.length
            });

            logger.info(`[DCO] Refreshed ${newVariants.length} creatives for campaign ${campaignId}`);

            res.json({
                success: true,
                new_variants: newVariants,
                count: newVariants.length
            });
        } catch (error: unknown) {
    const err = error as Error;
            logger.error('[DCO] Creative refresh failed:', error);
            res.status(500).json({
                error: 'Failed to refresh creatives',
                message: err.message
            });
        }
    }
);

/**
 * GET /api/dco/campaigns/:campaignId/tests
 * Get all tests for a campaign
 */
router.get(
    '/campaigns/:campaignId/tests',
    requireAuth,
    requireOrganization,
    requirePermission('analytics.view'),
    async (req: Request, res: Response) => {
        try {
            const { campaignId } = req.params;
            const organizationId = getOrganizationId(req)!;

            const tests = await dcoOrchestrator.getTestsByCampaign(campaignId);

            res.json({
                success: true,
                campaign_id: campaignId,
                tests,
                count: tests.length
            });
        } catch (error: unknown) {
    const err = error as Error;
            logger.error('[DCO] Tests retrieval failed:', error);
            res.status(500).json({
                error: 'Failed to retrieve tests',
                message: err.message
            });
        }
    }
);

export default router;
