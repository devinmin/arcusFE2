/**
 * Competitive Intelligence API Routes
 *
 * Endpoints for managing competitor tracking, viewing insights,
 * and accessing competitive intelligence data.
 */

import { Router, Request, Response } from 'express';
import { competitiveIntelligence } from '../services/competitiveIntelligenceService.js';
import { authenticateJWT } from '../middleware/auth.js';
import { logger } from '../utils/logger.js';

const router = Router();

// All routes require authentication
router.use(authenticateJWT);

/**
 * POST /api/competitors
 * Add a new competitor to track
 */
router.post('/', async (req: Request, res: Response) => {
    try {
        const { organizationId, brandId } = req.user as any;
        const {
            name,
            website,
            facebookHandle,
            instagramHandle,
            twitterHandle,
            linkedinHandle,
            tiktokHandle,
            youtubeChannel,
            trackAds,
            trackSocial,
            trackEmail,
            trackWebsite,
            trackPricing
        } = req.body;

        if (!name) {
            return res.status(400).json({ error: 'Competitor name is required' });
        }

        const competitorId = await competitiveIntelligence.addCompetitor(
            organizationId,
            brandId,
            {
                name,
                website,
                facebookHandle,
                instagramHandle,
                twitterHandle,
                linkedinHandle,
                tiktokHandle,
                youtubeChannel,
                trackAds,
                trackSocial,
                trackEmail,
                trackWebsite,
                trackPricing
            }
        );

        res.status(201).json({
            success: true,
            competitorId,
            message: 'Competitor added successfully. Initial scan is running.'
        });
    } catch (error: unknown) {
    const err = error as Error & { code?: string };
        logger.error('Failed to add competitor:', error);

        if (err.code === '23505') {  // Unique constraint violation
            return res.status(409).json({ error: 'Competitor already exists' });
        }

        res.status(500).json({ error: 'Failed to add competitor' });
    }
});

/**
 * GET /api/competitors
 * List all tracked competitors
 */
router.get('/', async (req: Request, res: Response) => {
    try {
        const { organizationId, brandId } = req.user as any;

        const competitors = await competitiveIntelligence.getCompetitors(
            organizationId,
            brandId
        );

        res.json({ competitors });
    } catch (error: unknown) {
    const err = error as Error;
        logger.error('Failed to get competitors:', error);
        res.status(500).json({ error: 'Failed to get competitors' });
    }
});

/**
 * GET /api/competitors/:id
 * Get competitor details and stats
 */
router.get('/:id', async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { organizationId } = req.user as any;

        // Get competitor details
        const competitors = await competitiveIntelligence.getCompetitors(organizationId);
        const competitor = competitors.find(c => c.id === id);

        if (!competitor) {
            return res.status(404).json({ error: 'Competitor not found' });
        }

        // Get statistics
        const stats = await competitiveIntelligence.getCompetitorStats(id);

        res.json({
            competitor,
            stats
        });
    } catch (error: unknown) {
    const err = error as Error;
        logger.error('Failed to get competitor details:', error);
        res.status(500).json({ error: 'Failed to get competitor details' });
    }
});

/**
 * PATCH /api/competitors/:id
 * Update competitor settings
 */
router.patch('/:id', async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { organizationId } = req.user as any;

        // Verify ownership
        const competitors = await competitiveIntelligence.getCompetitors(organizationId);
        const competitor = competitors.find(c => c.id === id);

        if (!competitor) {
            return res.status(404).json({ error: 'Competitor not found' });
        }

        const {
            name,
            website,
            socialHandles,
            trackingConfig,
            isActive
        } = req.body;

        await competitiveIntelligence.updateCompetitor(id, {
            name,
            website,
            socialHandles,
            trackingConfig,
            isActive
        });

        res.json({ success: true, message: 'Competitor updated successfully' });
    } catch (error: unknown) {
    const err = error as Error;
        logger.error('Failed to update competitor:', error);
        res.status(500).json({ error: 'Failed to update competitor' });
    }
});

/**
 * DELETE /api/competitors/:id
 * Remove a competitor from tracking
 */
router.delete('/:id', async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { organizationId } = req.user as any;

        // Verify ownership
        const competitors = await competitiveIntelligence.getCompetitors(organizationId);
        const competitor = competitors.find(c => c.id === id);

        if (!competitor) {
            return res.status(404).json({ error: 'Competitor not found' });
        }

        await competitiveIntelligence.deleteCompetitor(id);

        res.json({ success: true, message: 'Competitor deleted successfully' });
    } catch (error: unknown) {
    const err = error as Error;
        logger.error('Failed to delete competitor:', error);
        res.status(500).json({ error: 'Failed to delete competitor' });
    }
});

/**
 * POST /api/competitors/:id/scan
 * Trigger manual scan for a competitor
 */
router.post('/:id/scan', async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { organizationId } = req.user as any;

        // Verify ownership
        const competitors = await competitiveIntelligence.getCompetitors(organizationId);
        const competitor = competitors.find(c => c.id === id);

        if (!competitor) {
            return res.status(404).json({ error: 'Competitor not found' });
        }

        // Trigger scan asynchronously
        setImmediate(() => {
            competitiveIntelligence.scanCompetitor(id).catch(err =>
                logger.error(`Manual scan failed for competitor ${id}:`, err)
            );
        });

        res.json({
            success: true,
            message: 'Scan triggered. Results will be available shortly.'
        });
    } catch (error: unknown) {
    const err = error as Error;
        logger.error('Failed to trigger scan:', error);
        res.status(500).json({ error: 'Failed to trigger scan' });
    }
});

/**
 * GET /api/competitors/:id/content
 * Get captured content for a competitor
 */
router.get('/:id/content', async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { organizationId } = req.user as any;
        const { platform, contentType, limit } = req.query;

        // Verify ownership
        const competitors = await competitiveIntelligence.getCompetitors(organizationId);
        const competitor = competitors.find(c => c.id === id);

        if (!competitor) {
            return res.status(404).json({ error: 'Competitor not found' });
        }

        const content = await competitiveIntelligence.getContentFeed(organizationId, {
            competitorId: id,
            platform: platform as string,
            contentType: contentType as string,
            limit: limit ? parseInt(limit as string) : undefined
        });

        res.json({ content });
    } catch (error: unknown) {
    const err = error as Error;
        logger.error('Failed to get competitor content:', error);
        res.status(500).json({ error: 'Failed to get competitor content' });
    }
});

/**
 * GET /api/competitors/:id/ads
 * Get active ads for a competitor
 */
router.get('/:id/ads', async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { organizationId } = req.user as any;
        const { platform, isActive, limit } = req.query;

        // Verify ownership
        const competitors = await competitiveIntelligence.getCompetitors(organizationId);
        const competitor = competitors.find(c => c.id === id);

        if (!competitor) {
            return res.status(404).json({ error: 'Competitor not found' });
        }

        const ads = await competitiveIntelligence.getCompetitorAds(organizationId, {
            competitorId: id,
            platform: platform as string,
            isActive: isActive !== undefined ? isActive === 'true' : undefined,
            limit: limit ? parseInt(limit as string) : undefined
        });

        res.json({ ads });
    } catch (error: unknown) {
    const err = error as Error;
        logger.error('Failed to get competitor ads:', error);
        res.status(500).json({ error: 'Failed to get competitor ads' });
    }
});

/**
 * GET /api/competitors/insights
 * Get all competitive insights
 */
router.get('/insights/all', async (req: Request, res: Response) => {
    try {
        const { organizationId } = req.user as any;
        const { competitorId, status, limit } = req.query;

        const insights = await competitiveIntelligence.getInsights(organizationId, {
            competitorId: competitorId as string,
            status: status as string,
            limit: limit ? parseInt(limit as string) : undefined
        });

        res.json({ insights });
    } catch (error: unknown) {
    const err = error as Error;
        logger.error('Failed to get insights:', error);
        res.status(500).json({ error: 'Failed to get insights' });
    }
});

/**
 * PATCH /api/competitors/insights/:id
 * Update insight status (reviewed, actioned, dismissed)
 */
router.patch('/insights/:id', async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { userId } = req.user as any;
        const { status } = req.body;

        if (!['reviewed', 'actioned', 'dismissed'].includes(status)) {
            return res.status(400).json({
                error: 'Invalid status. Must be: reviewed, actioned, or dismissed'
            });
        }

        await competitiveIntelligence.updateInsightStatus(id, userId, status);

        res.json({ success: true, message: 'Insight status updated' });
    } catch (error: unknown) {
    const err = error as Error;
        logger.error('Failed to update insight status:', error);
        res.status(500).json({ error: 'Failed to update insight status' });
    }
});

/**
 * GET /api/competitors/benchmark
 * Get competitive benchmark for your brand vs competitors
 */
router.get('/benchmark/current', async (req: Request, res: Response) => {
    try {
        const { organizationId, brandId } = req.user as any;
        const { startDate, endDate } = req.query;

        const start = startDate
            ? new Date(startDate as string)
            : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // 30 days ago

        const end = endDate
            ? new Date(endDate as string)
            : new Date();

        const benchmark = await competitiveIntelligence.getBenchmark(
            organizationId,
            brandId,
            start,
            end
        );

        res.json({ benchmark });
    } catch (error: unknown) {
    const err = error as Error;
        logger.error('Failed to get benchmark:', error);
        res.status(500).json({ error: 'Failed to get benchmark' });
    }
});

/**
 * GET /api/competitors/feed
 * Get combined content feed from all competitors
 */
router.get('/feed/all', async (req: Request, res: Response) => {
    try {
        const { organizationId } = req.user as any;
        const { platform, contentType, limit } = req.query;

        const content = await competitiveIntelligence.getContentFeed(organizationId, {
            platform: platform as string,
            contentType: contentType as string,
            limit: limit ? parseInt(limit as string) : 50
        });

        res.json({ content });
    } catch (error: unknown) {
    const err = error as Error;
        logger.error('Failed to get content feed:', error);
        res.status(500).json({ error: 'Failed to get content feed' });
    }
});

/**
 * POST /api/competitors/alerts
 * Create an alert rule for competitor activity
 */
router.post('/alerts', async (req: Request, res: Response) => {
    try {
        const { organizationId, userId } = req.user as any;
        const {
            competitorId,
            alertType,
            conditions,
            notifyUsers,
            notifyEmail,
            notifySlack,
            slackChannel
        } = req.body;

        if (!competitorId || !alertType || !conditions) {
            return res.status(400).json({
                error: 'competitorId, alertType, and conditions are required'
            });
        }

        const ruleId = await competitiveIntelligence.createAlertRule(
            organizationId,
            competitorId,
            {
                alertType,
                conditions,
                notifyUsers: notifyUsers || [userId],
                notifyEmail,
                notifySlack,
                slackChannel
            }
        );

        res.status(201).json({
            success: true,
            ruleId,
            message: 'Alert rule created successfully'
        });
    } catch (error: unknown) {
    const err = error as Error;
        logger.error('Failed to create alert rule:', error);
        res.status(500).json({ error: 'Failed to create alert rule' });
    }
});

/**
 * GET /api/competitors/dashboard
 * Get comprehensive dashboard data
 */
router.get('/dashboard/overview', async (req: Request, res: Response) => {
    try {
        const { organizationId, brandId } = req.user as any;

        // Get all competitors
        const competitors = await competitiveIntelligence.getCompetitors(
            organizationId,
            brandId
        );

        // Get recent insights (last 7 days)
        const insights = await competitiveIntelligence.getInsights(organizationId, {
            status: 'new',
            limit: 10
        });

        // Get recent content
        const content = await competitiveIntelligence.getContentFeed(organizationId, {
            limit: 20
        });

        // Get benchmark
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const benchmark = await competitiveIntelligence.getBenchmark(
            organizationId,
            brandId,
            thirtyDaysAgo,
            new Date()
        );

        res.json({
            competitors: {
                total: competitors.length,
                active: competitors.filter(c => c.isActive).length,
                list: competitors
            },
            insights: {
                total: insights.length,
                highOpportunity: insights.filter(i => i.opportunityScore > 0.7).length,
                list: insights
            },
            recentActivity: {
                contentCount: content.length,
                content: content.slice(0, 10)  // Top 10
            },
            benchmark
        });
    } catch (error: unknown) {
    const err = error as Error;
        logger.error('Failed to get dashboard overview:', error);
        res.status(500).json({ error: 'Failed to get dashboard overview' });
    }
});

export default router;
