import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { runSafetyChecks } from '../middleware/safety.js';
import {
  requireOrganization,
  requirePermission,
  getOrganizationId,
  getUserId,
  createAuditLog
} from '../middleware/multiTenancy.js';
import {
  createCampaign,
  getCampaignById,
  getCampaignsByOrganizationId,
  updateCampaign,
  getExecutionsByCampaignId,
  updateExecutionMetrics,
  regenerateUTMConfig
} from '../services/campaignService.js';
import { findClientById } from '../services/clientService.js';
import {
  fetchAdInsights,
  decryptToken
} from '../services/metaApi.js';
import { executeCampaign } from '../services/executionEngine.js';
import { runCampaignPredictions } from '../services/predictor.js';
import { logger, auditLogger } from '../utils/logger.js';
import { magicOrchestrator } from '../services/magicOrchestrator.js';
import { ExecutionMetrics } from '../models/Execution.js';
import {
  campaignObjectiveSchema,
  platformSchema,
  budgetSchema
} from '../utils/validators.js';
import { executeIdempotent, pool } from '../database/db.js';

interface CampaignRow {
  id: string;
  organization_id: string;
  status: string;
  name: string;
  objective: string;
  target_platforms: string[];
  budget: number;
  start_date: Date | null;
  end_date: Date | null;
}

const router = Router();

/**
 * POST /api/campaigns
 * Create a new campaign
 */
router.post('/', requireAuth, requireOrganization, requirePermission('campaigns.create'), async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req)!;
    const userId = getUserId(req);
    const userEmail = req.org?.user.email || req.user!.email;

    // Validate request body
    const campaignSchema = z.object({
      name: z.string().min(1, 'Campaign name is required'),
      objective: campaignObjectiveSchema,
      platforms: z.array(platformSchema).min(1, 'At least one platform is required'),
      budget_daily: budgetSchema,
      target_audience: z.object({
        age_min: z.number().min(18),
        age_max: z.number().max(65),
        locations: z.array(z.string()).min(1),
        interests: z.array(z.string()).optional()
      }),
      brief: z.string().optional()
    });

    const data = campaignSchema.parse(req.body);

    // Get client_id by looking up the client by user email
    // Migration 070 made client_id nullable - use null when no client is found
    // This allows multi-tenant mode where organization_id is the primary reference
    const { findClientByEmail } = await import('../services/clientService.js');
    const client = await findClientByEmail(userEmail);
    const clientId = client?.id || null; // Use null for multi-tenant mode (not organizationId - that's not in clients table)

    // Create campaign record with organization context
    const campaign = await createCampaign({
      client_id: clientId,
      organization_id: organizationId,
      created_by: userId || undefined,
      ...data
    });

    // Audit log
    await createAuditLog(req, 'campaign.created', 'campaign', campaign.id, {
      name: campaign.name,
      objective: campaign.objective
    });

    logger.info(`Campaign created: ${campaign.id} by ${userEmail} in org ${organizationId}`);

    // Trigger AI generation pipeline asynchronously (don't await - run in background)
    magicOrchestrator.generateForCampaign({
      campaignId: campaign.id,
      clientId: campaign.client_id,
      organizationId,
      objective: campaign.objective,
      platforms: campaign.platforms,
      targetAudience: {
        age_min: campaign.target_audience.age_min || 18,
        age_max: campaign.target_audience.age_max || 65,
        locations: campaign.target_audience.locations || [],
        interests: campaign.target_audience.interests
      },
      budget: campaign.budget_daily,
      name: campaign.name,
      brief: data.brief
    }).catch(err => {
      logger.error('Campaign generation failed:', { campaignId: campaign.id, error: err });
    });

    // Return campaign preview with UTM tracking URLs
    res.status(201).json({
      id: campaign.id,
      name: campaign.name,
      objective: campaign.objective,
      status: campaign.status,
      platforms: campaign.platforms,
      budget_daily: campaign.budget_daily,
      target_audience: campaign.target_audience,
      deliverables: campaign.deliverables,
      predictions: campaign.predictions || [],
      utm_config: campaign.utm_config,
      created_at: campaign.created_at
    });
  } catch (error: unknown) {
    const err = error as Error;
    if ((error as any) instanceof z.ZodError) {
      return res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid input',
          details: (error as z.ZodError).errors
        }
      });
    }

    logger.error('Create campaign error:', error);
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to create campaign'
      }
    });
  }
});

/**
 * GET /api/campaigns
 * Get all campaigns for authenticated user's organization
 *
 * Query params:
 * - start_date: Filter campaigns starting on or after this date
 * - end_date: Filter campaigns ending on or before this date
 * - status: Comma-separated list of statuses (e.g., "active,completed,paused")
 * - sort: Sort field (start_date, created_at, name) - default: created_at
 * - order: Sort order (asc, desc) - default: desc
 * - limit: Number of results per page (default: 50, max: 100)
 * - offset: Number of results to skip (default: 0)
 */
router.get('/', requireAuth, requireOrganization, requirePermission('analytics.view'), async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req)!;
    const { start_date, end_date, status, sort = 'created_at', order = 'desc', limit: rawLimit = '50', offset: rawOffset = '0' } = req.query;

    // Parse and validate pagination params
    const limit = Math.min(Math.max(1, parseInt(rawLimit as string, 10) || 50), 100);
    const offset = Math.max(0, parseInt(rawOffset as string, 10) || 0);

    // Build query with filters
    let query = `
      SELECT
        id, name, objective, status, platforms,
        budget_daily, budget_total, target_audience,
        deliverables, utm_config, start_date, end_date,
        created_at, updated_at, organization_id, client_id
      FROM campaigns
      WHERE (organization_id = $1 OR client_id = $1)
    `;
    const params: unknown[] = [organizationId];
    let paramIndex = 2;

    // Filter by status
    if (status) {
      const statuses = (status as string).split(',').map(s => s.trim());
      query += ` AND status = ANY($${paramIndex})`;
      params.push(statuses);
      paramIndex++;
    }

    // Filter by date range
    if (start_date) {
      query += ` AND (start_date >= $${paramIndex} OR created_at >= $${paramIndex})`;
      params.push(start_date);
      paramIndex++;
    }
    if (end_date) {
      query += ` AND (
        end_date <= $${paramIndex}
        OR (end_date IS NULL AND start_date <= $${paramIndex})
        OR created_at <= $${paramIndex}
      )`;
      params.push(end_date);
      paramIndex++;
    }

    // Sort
    const validSorts = ['start_date', 'created_at', 'name', 'updated_at'];
    const sortField = validSorts.includes(sort as string) ? sort : 'created_at';
    const sortOrder = order === 'asc' ? 'ASC' : 'DESC';
    query += ` ORDER BY ${sortField} ${sortOrder}`;

    // Add pagination
    query += ` LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limit, offset);

    const { rows: campaigns } = await pool.query(query, params);

    // Get total count for pagination (without limit/offset)
    let countQuery = `
      SELECT COUNT(*) as total
      FROM campaigns
      WHERE (organization_id = $1 OR client_id = $1)
    `;
    const countParams: unknown[] = [organizationId];
    let countParamIndex = 2;

    if (status) {
      const statuses = (status as string).split(',').map(s => s.trim());
      countQuery += ` AND status = ANY($${countParamIndex})`;
      countParams.push(statuses);
      countParamIndex++;
    }
    if (start_date) {
      countQuery += ` AND (start_date >= $${countParamIndex} OR created_at >= $${countParamIndex})`;
      countParams.push(start_date);
      countParamIndex++;
    }
    if (end_date) {
      countQuery += ` AND (
        end_date <= $${countParamIndex}
        OR (end_date IS NULL AND start_date <= $${countParamIndex})
        OR created_at <= $${countParamIndex}
      )`;
      countParams.push(end_date);
    }

    const { rows: countRows } = await pool.query(countQuery, countParams);
    const totalCount = parseInt(countRows[0]?.total || '0', 10);

    // Get status counts for the organization (unfiltered)
    const countsResult = await pool.query(`
      SELECT status, COUNT(*) as count
      FROM campaigns
      WHERE (organization_id = $1 OR client_id = $1)
      GROUP BY status
    `, [organizationId]);

    const statusCounts: Record<string, number> = {};
    for (const row of countsResult.rows) {
      statusCounts[row.status] = parseInt(row.count, 10);
    }

    res.json({
      campaigns,
      total: totalCount,
      count: campaigns.length,
      limit,
      offset,
      hasMore: offset + campaigns.length < totalCount,
      statusCounts,
      filters: {
        start_date: start_date || null,
        end_date: end_date || null,
        status: status || null,
        sort: sortField,
        order: sortOrder
      }
    });
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('Get campaigns error:', error);
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to fetch campaigns'
      }
    });
  }
});

/**
 * GET /api/campaigns/:id
 * Get campaign by ID
 */
router.get('/:id', requireAuth, requireOrganization, requirePermission('analytics.view'), async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req)!;
    const { id } = req.params;

    const campaign = await getCampaignById(id, organizationId);

    if (!campaign) {
      return res.status(404).json({
        error: {
          code: 'CAMPAIGN_NOT_FOUND',
          message: 'Campaign not found'
        }
      });
    }

    res.json(campaign);
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('Get campaign error:', error);
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to fetch campaign'
      }
    });
  }
});

/**
 * PATCH /api/campaigns/:id
 * Update campaign details
 */
router.patch('/:id', requireAuth, requireOrganization, requirePermission('campaigns.edit'), async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req)!;
    const { id } = req.params;
    const updates = req.body;

    // Check if campaign exists and belongs to organization
    const campaign = await getCampaignById(id, organizationId);
    if (!campaign) {
      return res.status(404).json({
        error: {
          code: 'CAMPAIGN_NOT_FOUND',
          message: 'Campaign not found'
        }
      });
    }

    // Don't allow updating status directly via this endpoint if it involves complex logic
    // (e.g. launching), but for simple updates it's fine.
    // Prevent updating critical fields if campaign is active? 
    // For now, allow updates but log it.

    // Validate launch_config if provided
    if (updates && typeof updates.launch_config !== 'undefined') {
      const lc = updates.launch_config;
      if (lc !== null && typeof lc === 'object') {
        const budgets = (lc as any).platform_budgets;
        if (typeof budgets !== 'undefined') {
          if (typeof budgets !== 'object' || budgets === null || Array.isArray(budgets)) {
            return res.status(400).json({ error: { code: 'INVALID_LAUNCH_CONFIG', message: 'launch_config.platform_budgets must be an object' } });
          }
          const entries = Object.entries(budgets);
          if (entries.length === 0) {
            return res.status(400).json({ error: { code: 'INVALID_LAUNCH_CONFIG', message: 'platform_budgets cannot be empty' } });
          }
          let sum = 0;
          for (const [p, v] of entries) {
            // Ensure key is a valid platform for this campaign
            if (!campaign.platforms?.includes(p as any)) {
              return res.status(400).json({ error: { code: 'INVALID_LAUNCH_CONFIG', message: `Unknown platform in budgets: ${p}` } });
            }
            const num = Number(v);
            if (!Number.isFinite(num) || num < 0 || num > 100) {
              return res.status(400).json({ error: { code: 'INVALID_LAUNCH_CONFIG', message: `Invalid budget percent for ${p}` } });
            }
            sum += num;
          }
          if (Math.round(sum) !== 100) {
            return res.status(400).json({ error: { code: 'INVALID_LAUNCH_CONFIG', message: 'platform_budgets must sum to 100%' } });
          }
        }
      } else if (lc !== null) {
        return res.status(400).json({ error: { code: 'INVALID_LAUNCH_CONFIG', message: 'launch_config must be an object' } });
      }
    }

    const updatedCampaign = await updateCampaign(id, updates);

    // Audit log
    await createAuditLog(req, 'campaign.updated', 'campaign', id, { updates });

    logger.info(`Campaign updated: ${id} by ${req.org?.user.email || req.user!.email}`);

    res.json(updatedCampaign);
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('Update campaign error:', error);
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to update campaign'
      }
    });
  }
});

/**
 * POST /api/campaigns/:id/predict
 * Run prediction engine on campaign deliverables
 */
router.post('/:id/predict', requireAuth, requireOrganization, requirePermission('analytics.view'), async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req)!;
    const { id } = req.params;

    const campaign = await getCampaignById(id, organizationId);
    if (!campaign) {
      return res.status(404).json({
        error: {
          code: 'CAMPAIGN_NOT_FOUND',
          message: 'Campaign not found'
        }
      });
    }

    if (!campaign.deliverables || campaign.deliverables.length === 0) {
      return res.status(400).json({
        error: {
          code: 'NO_DELIVERABLES',
          message: 'Generate deliverables before running predictions'
        }
      });
    }

    const predictions = await runCampaignPredictions(id);

    res.json({
      campaign_id: id,
      predictions
    });
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('Prediction error:', error);
    res.status(500).json({
      error: {
        code: 'PREDICTION_FAILED',
        message: 'Failed to generate predictions'
      }
    });
  }
});

/**
 * POST /api/campaigns/:id/launch
 * Launch campaign on specified platforms
 *
 * SECURITY: Uses row-level locking to prevent race conditions
 * IDEMPOTENCY: Uses idempotency keys to prevent duplicate launches on retry
 */
router.post('/:id/launch', requireAuth, requireOrganization, requirePermission('campaigns.publish'), runSafetyChecks, async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req)!;
    const userId = getUserId(req);
    const { id } = req.params;
    const { platforms, platform_budgets } = req.body;

    // Generate or use provided idempotency key
    const idempotencyKey = req.headers['idempotency-key'] as string || `launch-${id}-${Date.now()}`;

    // Validate platform budgets if provided
    if (platform_budgets !== undefined) {
      if (typeof platform_budgets !== 'object' || Array.isArray(platform_budgets)) {
        return res.status(400).json({ error: { code: 'INVALID_LAUNCH_CONFIG', message: 'platform_budgets must be an object' } });
      }
      const entries = Object.entries(platform_budgets);
      if (entries.length === 0) {
        return res.status(400).json({ error: { code: 'INVALID_LAUNCH_CONFIG', message: 'platform_budgets cannot be empty' } });
      }
      // Ensure only chosen platforms have budgets and values are 0..100
      let sum = 0;
      for (const [p, v] of entries) {
        if (!platforms?.includes(p)) {
          return res.status(400).json({ error: { code: 'INVALID_LAUNCH_CONFIG', message: `Budget provided for unselected platform: ${p}` } });
        }
        const num = Number(v);
        if (!Number.isFinite(num) || num < 0 || num > 100) {
          return res.status(400).json({ error: { code: 'INVALID_LAUNCH_CONFIG', message: `Invalid budget percent for ${p}` } });
        }
        sum += num;
      }
      if (Math.round(sum) !== 100) {
        return res.status(400).json({ error: { code: 'INVALID_LAUNCH_CONFIG', message: 'platform_budgets must sum to 100%' } });
      }
    }

    // Get client/org to access API keys first (outside the transaction)
    const client = await findClientById(organizationId);
    if (!client || !client.api_keys) {
      return res.status(403).json({
        error: {
          code: 'NO_API_KEYS',
          message: 'Please connect your ad accounts first'
        }
      });
    }

    // Use idempotent execution with row-level locking to prevent race conditions
    const { fromCache } = await executeIdempotent(
      idempotencyKey,
      organizationId,
      'campaign_launch',
      async (client) => {
        // Lock the campaign row to prevent concurrent launches
        const lockResult = await client.query<CampaignRow>(
          `SELECT id, organization_id, status, name
           FROM campaigns
           WHERE id = $1 AND organization_id = $2
           FOR UPDATE NOWAIT`,
          [id, organizationId]
        );

        if (lockResult.rows.length === 0) {
          throw { status: 404, code: 'CAMPAIGN_NOT_FOUND', message: 'Campaign not found' };
        }

        const campaign = lockResult.rows[0]!;

        // Check campaign status within the lock
        if (campaign.status !== 'draft') {
          throw {
            status: 400,
            code: 'CAMPAIGN_ALREADY_LAUNCHED',
            message: `Campaign cannot be launched (status: ${campaign.status})`
          };
        }

        // Record state transition for audit trail
        await client.query(
          `INSERT INTO campaign_status_transitions
           (campaign_id, from_status, to_status, triggered_by, reason)
           VALUES ($1, $2, $3, $4, $5)`,
          [id, 'draft', 'launching', userId || 'system', 'User initiated launch']
        );

        // Update status to 'launching' to prevent concurrent attempts
        await client.query(
          `UPDATE campaigns
           SET status = 'launching', updated_at = NOW()
           WHERE id = $1`,
          [id]
        );

        // Optionally persist launch config within transaction
        if (platform_budgets) {
          await client.query(
            `UPDATE campaigns
             SET launch_config = $1, updated_at = NOW()
             WHERE id = $2`,
            [JSON.stringify({ platform_budgets }), id]
          );
        }

        return { campaignId: id, status: 'launching' };
      }
    );

    if (fromCache) {
      // This was a duplicate request - return the cached result
      logger.info(`Campaign launch deduplicated: ${id}, idempotency key: ${idempotencyKey}`);
      return res.json({
        campaign_id: id,
        message: 'Campaign launch already in progress (deduplicated request)',
        deduplicated: true
      });
    }

    // Now execute the actual campaign launch (outside the transaction since it's long-running)
    try {
      const executions = await executeCampaign(id);

      // Update status to 'active' after successful launch
      await pool.query(
        `UPDATE campaigns SET status = 'active', updated_at = NOW() WHERE id = $1`,
        [id]
      );

      // Record successful transition
      await pool.query(
        `INSERT INTO campaign_status_transitions
         (campaign_id, from_status, to_status, triggered_by, reason)
         VALUES ($1, $2, $3, $4, $5)`,
        [id, 'launching', 'active', userId || 'system', `Launched with ${executions.length} executions`]
      );

      // Create audit log
      await createAuditLog(req, 'campaign.launched', 'campaign', id, {
        executionCount: executions.length,
        platforms: platforms || [],
        platform_budgets
      });

      logger.info(`Campaign launched: ${id} with ${executions.length} executions`);

      res.json({
        campaign_id: id,
        executions,
        message: 'Campaign launched successfully'
      });
    } catch (launchError: any) {
      // Rollback status on failure
      await pool.query(
        `UPDATE campaigns SET status = 'draft', updated_at = NOW() WHERE id = $1`,
        [id]
      );

      // Record failed transition
      await pool.query(
        `INSERT INTO campaign_status_transitions
         (campaign_id, from_status, to_status, triggered_by, reason)
         VALUES ($1, $2, $3, $4, $5)`,
        [id, 'launching', 'draft', 'system', `Launch failed: ${launchError.message}`]
      );

      auditLogger.error('Campaign launch failed', {
        campaignId: id,
        organizationId,
        error: launchError.message
      });

      throw launchError;
    }
  } catch (error: unknown) {
    const err = error as Error;
    // Handle NOWAIT lock failure (another request is already processing)
    if ((err as any).code === '55P03') {
      return res.status(409).json({
        error: {
          code: 'LAUNCH_IN_PROGRESS',
          message: 'Campaign launch is already in progress. Please wait.'
        }
      });
    }

    // Handle structured errors from within the transaction
    if ((err as any).status && (err as any).code) {
      return res.status((err as any).status).json({
        error: {
          code: (err as any).code,
          message: err.message
        }
      });
    }

    logger.error('Launch campaign error:', error);
    res.status(500).json({
      error: {
        code: 'LAUNCH_ERROR',
        message: err.message || 'Failed to launch campaign'
      }
    });
  }
});

/**
 * GET /api/campaigns/:id/metrics
 * Get real-time campaign metrics
 */
router.get('/:id/metrics', requireAuth, requireOrganization, requirePermission('analytics.view'), async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req)!;
    const { id } = req.params;

    // Get campaign
    const campaign = await getCampaignById(id, organizationId);
    if (!campaign) {
      return res.status(404).json({
        error: {
          code: 'CAMPAIGN_NOT_FOUND',
          message: 'Campaign not found'
        }
      });
    }

    // Get executions
    const executions = await getExecutionsByCampaignId(id);

    // Get client/org for API keys
    const client = await findClientById(organizationId);

    // Aggregate metrics across all platforms
    const overall = {
      impressions: 0,
      clicks: 0,
      ctr: 0,
      cpc: 0,
      conversions: 0,
      spend: 0,
      revenue: 0,
      roi: 0
    };

    const byPlatform: any = {};
    const byAd: unknown[] = [];

    // PERFORMANCE FIX: Use cached metrics instead of fetching from external APIs on every request
    // This eliminates the N+1 query problem that causes 20-46 second load times
    // Metrics should be updated by a background job instead
    for (const execution of executions) {
      const metrics = execution.metrics as ExecutionMetrics;

      // Aggregate metrics from stored data (already fetched by background sync)
      if (metrics) {
        overall.impressions += metrics.impressions || 0;
        overall.clicks += metrics.clicks || 0;
        overall.spend += metrics.spend || 0;
        overall.conversions += metrics.conversions || 0;
        overall.revenue += metrics.revenue || 0;

        // Platform breakdown
        if (!byPlatform[execution.platform]) {
          byPlatform[execution.platform] = {
            impressions: 0,
            clicks: 0,
            conversions: 0,
            spend: 0,
            revenue: 0
          };
        }
        byPlatform[execution.platform].impressions += metrics.impressions || 0;
        byPlatform[execution.platform].clicks += metrics.clicks || 0;
        byPlatform[execution.platform].conversions += metrics.conversions || 0;
        byPlatform[execution.platform].spend += metrics.spend || 0;
        byPlatform[execution.platform].revenue += metrics.revenue || 0;
      }
    }

    // Calculate overall averages
    overall.ctr = overall.impressions > 0 ? (overall.clicks / overall.impressions) * 100 : 0;
    overall.cpc = overall.clicks > 0 ? overall.spend / overall.clicks : 0;
    overall.roi = overall.spend > 0 ? overall.revenue / overall.spend : 0;

    // Round values
    overall.ctr = parseFloat(overall.ctr.toFixed(2));
    overall.cpc = parseFloat(overall.cpc.toFixed(2));
    overall.roi = parseFloat(overall.roi.toFixed(2));

    res.json({
      campaign_id: id,
      overall,
      by_platform: byPlatform,
      by_ad: byAd,
      last_updated: new Date().toISOString()
    });
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('Get campaign metrics error:', error);
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to fetch campaign metrics'
      }
    });
  }
});

/**
 * GET /api/campaigns/:id/deliverables
 * Get deliverables linked to a campaign
 */
router.get('/:id/deliverables', requireAuth, requireOrganization, requirePermission('analytics.view'), async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req)!;
    const { id } = req.params;

    // Ensure campaign belongs to organization
    const campaign = await getCampaignById(id, organizationId);
    if (!campaign) {
      return res.status(404).json({
        error: { code: 'CAMPAIGN_NOT_FOUND', message: 'Campaign not found' },
      });
    }

    const { DeliverableService } = await import('../services/deliverableService.js');
    const items = await DeliverableService.getDeliverablesForCampaign(id);

    res.json({ campaign_id: id, count: items.length, items });
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('Get campaign deliverables error:', error);
    res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch deliverables' },
    });
  }
});

/**
 * POST /api/campaigns/:id/duplicate
 * Duplicate an existing campaign with a new name
 */
router.post('/:id/duplicate', requireAuth, requireOrganization, requirePermission('campaigns.create'), async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req)!;
    const userId = getUserId(req);
    const { id } = req.params;
    const { name } = req.body;

    // Get the original campaign
    const originalCampaign = await getCampaignById(id, organizationId);
    if (!originalCampaign) {
      return res.status(404).json({
        error: {
          code: 'CAMPAIGN_NOT_FOUND',
          message: 'Campaign not found'
        }
      });
    }

    // Create new campaign with duplicated data
    const newName = name || `${originalCampaign.name} (Copy)`;
    const duplicatedCampaign = await createCampaign({
      client_id: originalCampaign.client_id,
      organization_id: organizationId,
      created_by: userId || undefined,
      name: newName,
      objective: originalCampaign.objective as any,
      platforms: originalCampaign.platforms,
      budget_daily: originalCampaign.budget_daily,
      target_audience: originalCampaign.target_audience as any,
      brief: (originalCampaign as any).brief
    });

    // Audit log
    await createAuditLog(req, 'campaign.duplicated', 'campaign', duplicatedCampaign.id, {
      originalCampaignId: id,
      originalName: originalCampaign.name,
      newName
    });

    logger.info(`Campaign duplicated: ${id} -> ${duplicatedCampaign.id}`);

    res.status(201).json({
      id: duplicatedCampaign.id,
      name: duplicatedCampaign.name,
      status: duplicatedCampaign.status,
      originalCampaignId: id,
      message: 'Campaign duplicated successfully'
    });
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('Duplicate campaign error:', error);
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to duplicate campaign'
      }
    });
  }
});

/**
 * GET /api/campaigns/:id/analytics
 * Get detailed analytics for a specific campaign
 * Includes performance metrics, trends, and insights
 */
router.get('/:id/analytics', requireAuth, requireOrganization, requirePermission('analytics.view'), async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req)!;
    const { id } = req.params;
    const { timeRange = '7d' } = req.query;

    // Get campaign
    const campaign = await getCampaignById(id, organizationId);
    if (!campaign) {
      return res.status(404).json({
        error: {
          code: 'CAMPAIGN_NOT_FOUND',
          message: 'Campaign not found'
        }
      });
    }

    // Get executions for this campaign
    const executions = await getExecutionsByCampaignId(id);

    // Calculate time range
    let startDate = new Date();
    if (timeRange === '24h') {
      startDate.setHours(startDate.getHours() - 24);
    } else if (timeRange === '7d') {
      startDate.setDate(startDate.getDate() - 7);
    } else if (timeRange === '30d') {
      startDate.setDate(startDate.getDate() - 30);
    } else if (timeRange === '90d') {
      startDate.setDate(startDate.getDate() - 90);
    }

    // Aggregate metrics
    const analytics = {
      campaign_id: id,
      campaign_name: campaign.name,
      status: campaign.status,
      timeRange,
      startDate: startDate.toISOString(),
      endDate: new Date().toISOString(),

      // Overall metrics
      metrics: {
        impressions: 0,
        clicks: 0,
        conversions: 0,
        spend: 0,
        revenue: 0,
        ctr: 0,
        cpc: 0,
        cpa: 0,
        roi: 0,
        roas: 0
      },

      // Platform breakdown
      byPlatform: {} as Record<string, any>,

      // Time series data for trends
      daily: [] as any[],

      // Top performing ads
      topAds: [] as any[],

      // Insights and recommendations
      insights: [] as string[]
    };

    // Process executions
    for (const execution of executions) {
      const metrics = execution.metrics as ExecutionMetrics;

      analytics.metrics.impressions += metrics.impressions || 0;
      analytics.metrics.clicks += metrics.clicks || 0;
      analytics.metrics.conversions += metrics.conversions || 0;
      analytics.metrics.spend += metrics.spend || 0;
      analytics.metrics.revenue += metrics.revenue || 0;

      // Platform breakdown
      if (!analytics.byPlatform[execution.platform]) {
        analytics.byPlatform[execution.platform] = {
          impressions: 0,
          clicks: 0,
          conversions: 0,
          spend: 0,
          revenue: 0
        };
      }
      analytics.byPlatform[execution.platform].impressions += metrics.impressions || 0;
      analytics.byPlatform[execution.platform].clicks += metrics.clicks || 0;
      analytics.byPlatform[execution.platform].conversions += metrics.conversions || 0;
      analytics.byPlatform[execution.platform].spend += metrics.spend || 0;
      analytics.byPlatform[execution.platform].revenue += metrics.revenue || 0;
    }

    // Calculate derived metrics
    if (analytics.metrics.impressions > 0) {
      analytics.metrics.ctr = (analytics.metrics.clicks / analytics.metrics.impressions) * 100;
    }
    if (analytics.metrics.clicks > 0) {
      analytics.metrics.cpc = analytics.metrics.spend / analytics.metrics.clicks;
    }
    if (analytics.metrics.conversions > 0) {
      analytics.metrics.cpa = analytics.metrics.spend / analytics.metrics.conversions;
    }
    if (analytics.metrics.spend > 0) {
      analytics.metrics.roi = ((analytics.metrics.revenue - analytics.metrics.spend) / analytics.metrics.spend) * 100;
      analytics.metrics.roas = analytics.metrics.revenue / analytics.metrics.spend;
    }

    // Round values
    analytics.metrics.ctr = parseFloat(analytics.metrics.ctr.toFixed(2));
    analytics.metrics.cpc = parseFloat(analytics.metrics.cpc.toFixed(2));
    analytics.metrics.cpa = parseFloat(analytics.metrics.cpa.toFixed(2));
    analytics.metrics.roi = parseFloat(analytics.metrics.roi.toFixed(2));
    analytics.metrics.roas = parseFloat(analytics.metrics.roas.toFixed(2));

    // Generate insights
    if (analytics.metrics.ctr > 2) {
      analytics.insights.push('Strong CTR performance - your creative is resonating with the audience');
    }
    if (analytics.metrics.roi > 200) {
      analytics.insights.push('Excellent ROI - this campaign is highly profitable');
    }
    if (analytics.metrics.ctr < 0.5) {
      analytics.insights.push('Low CTR - consider testing new creative variations');
    }
    if (analytics.metrics.conversions === 0 && analytics.metrics.clicks > 100) {
      analytics.insights.push('No conversions yet despite traffic - review your landing page and offer');
    }

    // Find best performing platform
    let bestPlatform = '';
    let bestRevenue = 0;
    for (const [platform, metrics] of Object.entries(analytics.byPlatform)) {
      if (metrics.revenue > bestRevenue) {
        bestRevenue = metrics.revenue;
        bestPlatform = platform;
      }
    }
    if (bestPlatform) {
      analytics.insights.push(`${bestPlatform} is your top performing platform`);
    }

    res.json(analytics);
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('Get campaign analytics error:', error);
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to fetch campaign analytics'
      }
    });
  }
});

/**
 * POST /api/campaigns/:id/utm/regenerate
 * Regenerate UTM tracking configuration for a campaign
 */
router.post('/:id/utm/regenerate', requireAuth, requireOrganization, requirePermission('campaigns.edit'), async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req)!;
    const { id } = req.params;
    const { landing_page_url } = req.body;

    // Check if campaign exists and belongs to organization
    const campaign = await getCampaignById(id, organizationId);
    if (!campaign) {
      return res.status(404).json({
        error: {
          code: 'CAMPAIGN_NOT_FOUND',
          message: 'Campaign not found'
        }
      });
    }

    // Regenerate UTM config
    const utmConfig = await regenerateUTMConfig(id, landing_page_url);

    if (!utmConfig) {
      return res.status(500).json({
        error: {
          code: 'UTM_GENERATION_FAILED',
          message: 'Failed to generate UTM configuration'
        }
      });
    }

    // Audit log
    await createAuditLog(req, 'campaign.utm_regenerated', 'campaign', id, {
      landing_page_url
    });

    logger.info(`UTM config regenerated for campaign: ${id}`);

    res.json({
      campaign_id: id,
      utm_config: utmConfig,
      message: 'UTM configuration regenerated successfully'
    });
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('Regenerate UTM config error:', error);
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to regenerate UTM configuration'
      }
    });
  }
});

export default router;

