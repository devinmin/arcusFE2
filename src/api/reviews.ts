/**
 * Review & Reputation Management API Routes
 *
 * Provides endpoints for:
 * - Multi-platform review aggregation
 * - AI-powered response generation
 * - Sentiment analysis and trending
 * - Review solicitation campaigns
 * - Alert system for negative reviews
 * - Competitive review monitoring
 *
 * Phase 3.3 - Review & Reputation Management (DTC Differentiation)
 */

import { Router, Request, Response, NextFunction } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { reviewManagementService } from '../services/reviewManagementService.js';
import { logger } from '../utils/logger.js';

const router = Router();

// Middleware to ensure organization context is loaded
function requireOrganization(req: Request, res: Response, next: NextFunction): void {
  const orgId = (req as any).organizationId || (req.user as any)?.organizationId;
  if (!orgId) {
    res.status(403).json({
      success: false,
      error: {
        code: 'NO_ORGANIZATION',
        message: 'Organization context required',
      },
    });
    return;
  }
  next();
}

// Helper to get organization ID from request
function getOrganizationId(req: Request): string {
  const orgId = (req as any).organizationId || (req.user as any)?.organizationId;
  if (!orgId) {
    throw new Error('Organization ID not found');
  }
  return orgId;
}

// Helper to get user ID from request
function getUserId(req: Request): string {
  const userId = (req.user as any)?.id || (req.user as any)?.userId;
  if (!userId) {
    throw new Error('User ID not found');
  }
  return userId;
}

// =============================================================================
// PLATFORM CONNECTION ENDPOINTS
// =============================================================================

/**
 * POST /api/v1/reviews/platforms
 * Connect a review platform
 */
router.post('/platforms', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const {
      platform,
      platformName,
      platformId,
      platformUrl,
      connectionType,
      apiKey,
      apiSecret,
      webhookUrl,
      syncFrequencyMinutes,
      settings,
    } = req.body;

    if (!platform || !platformName) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_REQUIRED_FIELDS',
          message: 'platform and platformName are required',
        },
      });
    }

    const connection = await reviewManagementService.connectPlatform({
      organizationId,
      platform,
      platformName,
      platformId,
      platformUrl,
      connectionType,
      apiKey,
      apiSecret,
      webhookUrl,
      syncFrequencyMinutes,
      settings,
    });

    res.json({
      success: true,
      data: connection,
    });
  } catch (error) {
    logger.error('Error connecting platform:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'PLATFORM_CONNECTION_ERROR',
        message: (error as Error).message,
      },
    });
  }
});

/**
 * POST /api/v1/reviews/platforms/:platformId/sync
 * Trigger manual sync for a platform
 */
router.post('/platforms/:platformId/sync', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const { platformId } = req.params;
    const { since, limit } = req.body;

    const result = await reviewManagementService.syncReviews({
      platformId,
      organizationId,
      since: since ? new Date(since) : undefined,
      limit,
    });

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    logger.error('Error syncing reviews:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'SYNC_ERROR',
        message: (error as Error).message,
      },
    });
  }
});

// =============================================================================
// REVIEW ENDPOINTS
// =============================================================================

/**
 * GET /api/v1/reviews
 * Get aggregated reviews with filtering and pagination
 */
router.get('/', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const {
      platformId,
      rating,
      sentiment,
      status,
      priority,
      requiresResponse,
      startDate,
      endDate,
      limit,
      offset,
      sortBy,
      sortOrder,
    } = req.query;

    const result = await reviewManagementService.getReviews({
      organizationId,
      platformId: platformId as string,
      rating: rating ? parseInt(rating as string) : undefined,
      sentiment: sentiment as any,
      status: status as any,
      priority: priority as any,
      requiresResponse: requiresResponse === 'true' ? true : requiresResponse === 'false' ? false : undefined,
      startDate: startDate ? new Date(startDate as string) : undefined,
      endDate: endDate ? new Date(endDate as string) : undefined,
      limit: limit ? parseInt(limit as string) : undefined,
      offset: offset ? parseInt(offset as string) : undefined,
      sortBy: sortBy as any,
      sortOrder: sortOrder as any,
    });

    res.json({
      success: true,
      data: result.reviews,
      pagination: {
        total: result.total,
        limit: limit ? parseInt(limit as string) : 50,
        offset: offset ? parseInt(offset as string) : 0,
      },
    });
  } catch (error) {
    logger.error('Error getting reviews:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'GET_REVIEWS_ERROR',
        message: (error as Error).message,
      },
    });
  }
});

/**
 * GET /api/v1/reviews/:reviewId
 * Get a specific review by ID
 */
router.get('/:reviewId', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const { reviewId } = req.params;

    const result = await reviewManagementService.getReviews({
      organizationId,
      limit: 1,
    });

    const review = result.reviews.find((r) => r.id === reviewId);

    if (!review) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'REVIEW_NOT_FOUND',
          message: 'Review not found',
        },
      });
    }

    res.json({
      success: true,
      data: review,
    });
  } catch (error) {
    logger.error('Error getting review:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'GET_REVIEW_ERROR',
        message: (error as Error).message,
      },
    });
  }
});

/**
 * POST /api/v1/reviews/:reviewId/analyze
 * Analyze a review with AI (sentiment, topics, categorization)
 */
router.post('/:reviewId/analyze', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const { reviewId } = req.params;
    const { forceReanalysis } = req.body;

    const review = await reviewManagementService.analyzeReview({
      reviewId,
      organizationId,
      forceReanalysis,
    });

    res.json({
      success: true,
      data: review,
    });
  } catch (error) {
    logger.error('Error analyzing review:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'ANALYSIS_ERROR',
        message: (error as Error).message,
      },
    });
  }
});

// =============================================================================
// RESPONSE GENERATION ENDPOINTS
// =============================================================================

/**
 * POST /api/v1/reviews/:reviewId/respond
 * Generate an AI-powered response to a review
 */
router.post('/:reviewId/respond', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const userId = getUserId(req);
    const { reviewId } = req.params;
    const {
      tone,
      personalizationLevel,
      templateId,
      customInstructions,
      autoApprove,
    } = req.body;

    const response = await reviewManagementService.generateResponse({
      reviewId,
      organizationId,
      userId,
      tone,
      personalizationLevel,
      templateId,
      customInstructions,
      autoApprove,
    });

    res.json({
      success: true,
      data: response,
    });
  } catch (error) {
    logger.error('Error generating response:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'RESPONSE_GENERATION_ERROR',
        message: (error as Error).message,
      },
    });
  }
});

// =============================================================================
// SENTIMENT ANALYSIS ENDPOINTS
// =============================================================================

/**
 * GET /api/v1/reviews/sentiment
 * Get sentiment analysis and trending data
 */
router.get('/sentiment/analysis', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const { platformId, periodType, startDate, endDate } = req.query;

    if (!periodType) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_PERIOD_TYPE',
          message: 'periodType is required (hourly, daily, weekly, monthly, quarterly, yearly)',
        },
      });
    }

    const sentiment = await reviewManagementService.getSentiment({
      organizationId,
      platformId: platformId as string,
      periodType: periodType as any,
      startDate: startDate ? new Date(startDate as string) : undefined,
      endDate: endDate ? new Date(endDate as string) : undefined,
    });

    res.json({
      success: true,
      data: sentiment,
    });
  } catch (error) {
    logger.error('Error getting sentiment:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'SENTIMENT_ERROR',
        message: (error as Error).message,
      },
    });
  }
});

/**
 * POST /api/v1/reviews/sentiment/calculate
 * Calculate sentiment analysis for a specific time period
 */
router.post('/sentiment/calculate', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const { platformId, periodType, periodStart, periodEnd } = req.body;

    if (!periodType || !periodStart || !periodEnd) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_REQUIRED_FIELDS',
          message: 'periodType, periodStart, and periodEnd are required',
        },
      });
    }

    const sentiment = await reviewManagementService.calculateSentiment(
      organizationId,
      platformId || null,
      periodType,
      new Date(periodStart),
      new Date(periodEnd)
    );

    res.json({
      success: true,
      data: sentiment,
    });
  } catch (error) {
    logger.error('Error calculating sentiment:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'SENTIMENT_CALCULATION_ERROR',
        message: (error as Error).message,
      },
    });
  }
});

// =============================================================================
// CAMPAIGN ENDPOINTS
// =============================================================================

/**
 * GET /api/v1/reviews/campaigns
 * Get review solicitation campaigns
 */
router.get('/campaigns/list', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);

    // TODO: Implement getCampaigns method in service
    res.json({
      success: true,
      data: [],
      message: 'Campaign listing not yet implemented',
    });
  } catch (error) {
    logger.error('Error getting campaigns:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'GET_CAMPAIGNS_ERROR',
        message: (error as Error).message,
      },
    });
  }
});

/**
 * POST /api/v1/reviews/campaigns
 * Create a review solicitation campaign
 */
router.post('/campaigns', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const userId = getUserId(req);
    const {
      name,
      description,
      campaignType,
      targetPlatforms,
      targetRating,
      triggerType,
      triggerDelayDays,
      triggerConditions,
      emailSubject,
      emailBody,
      smsBody,
      inAppMessage,
      incentiveEnabled,
      incentiveType,
      incentiveValue,
      startDate,
      endDate,
    } = req.body;

    if (!name || !campaignType || !targetPlatforms || !triggerType) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_REQUIRED_FIELDS',
          message: 'name, campaignType, targetPlatforms, and triggerType are required',
        },
      });
    }

    const campaign = await reviewManagementService.createCampaign({
      organizationId,
      userId,
      name,
      description,
      campaignType,
      targetPlatforms,
      targetRating,
      triggerType,
      triggerDelayDays,
      triggerConditions,
      emailSubject,
      emailBody,
      smsBody,
      inAppMessage,
      incentiveEnabled,
      incentiveType,
      incentiveValue,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
    });

    res.json({
      success: true,
      data: campaign,
    });
  } catch (error) {
    logger.error('Error creating campaign:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'CAMPAIGN_CREATION_ERROR',
        message: (error as Error).message,
      },
    });
  }
});

/**
 * GET /api/v1/reviews/campaigns/:campaignId
 * Get campaign details
 */
router.get('/campaigns/:campaignId', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const { campaignId } = req.params;

    // TODO: Implement getCampaignById method in service
    res.json({
      success: true,
      data: null,
      message: 'Campaign details not yet implemented',
    });
  } catch (error) {
    logger.error('Error getting campaign:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'GET_CAMPAIGN_ERROR',
        message: (error as Error).message,
      },
    });
  }
});

/**
 * PUT /api/v1/reviews/campaigns/:campaignId/activate
 * Activate a campaign
 */
router.put('/campaigns/:campaignId/activate', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const { campaignId } = req.params;

    // TODO: Implement activateCampaign method in service
    res.json({
      success: true,
      message: 'Campaign activation not yet implemented',
    });
  } catch (error) {
    logger.error('Error activating campaign:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'CAMPAIGN_ACTIVATION_ERROR',
        message: (error as Error).message,
      },
    });
  }
});

/**
 * PUT /api/v1/reviews/campaigns/:campaignId/pause
 * Pause a campaign
 */
router.put('/campaigns/:campaignId/pause', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const { campaignId } = req.params;

    // TODO: Implement pauseCampaign method in service
    res.json({
      success: true,
      message: 'Campaign pause not yet implemented',
    });
  } catch (error) {
    logger.error('Error pausing campaign:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'CAMPAIGN_PAUSE_ERROR',
        message: (error as Error).message,
      },
    });
  }
});

/**
 * GET /api/v1/reviews/campaigns/:campaignId/analytics
 * Get campaign performance analytics
 */
router.get('/campaigns/:campaignId/analytics', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const { campaignId } = req.params;

    // TODO: Implement getCampaignAnalytics method in service
    res.json({
      success: true,
      data: {
        requestsSent: 0,
        reviewsReceived: 0,
        responseRate: 0,
        averageRating: 0,
      },
      message: 'Campaign analytics not yet implemented',
    });
  } catch (error) {
    logger.error('Error getting campaign analytics:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'CAMPAIGN_ANALYTICS_ERROR',
        message: (error as Error).message,
      },
    });
  }
});

// =============================================================================
// ALERT ENDPOINTS
// =============================================================================

/**
 * GET /api/v1/reviews/alerts
 * Get alert rules
 */
router.get('/alerts/list', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);

    // TODO: Implement getAlerts method in service
    res.json({
      success: true,
      data: [],
      message: 'Alert listing not yet implemented',
    });
  } catch (error) {
    logger.error('Error getting alerts:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'GET_ALERTS_ERROR',
        message: (error as Error).message,
      },
    });
  }
});

/**
 * POST /api/v1/reviews/alerts
 * Create an alert rule
 */
router.post('/alerts', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const userId = getUserId(req);
    const {
      name,
      description,
      triggerType,
      triggerConditions,
      severity,
      notifyEmail,
      notifySlack,
      recipientEmails,
      slackWebhookUrl,
    } = req.body;

    if (!name || !triggerType || !triggerConditions) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_REQUIRED_FIELDS',
          message: 'name, triggerType, and triggerConditions are required',
        },
      });
    }

    const alert = await reviewManagementService.createAlert({
      organizationId,
      userId,
      name,
      description,
      triggerType,
      triggerConditions,
      severity,
      notifyEmail,
      notifySlack,
      recipientEmails,
      slackWebhookUrl,
    });

    res.json({
      success: true,
      data: alert,
    });
  } catch (error) {
    logger.error('Error creating alert:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'ALERT_CREATION_ERROR',
        message: (error as Error).message,
      },
    });
  }
});

/**
 * GET /api/v1/reviews/alerts/:alertId
 * Get alert details
 */
router.get('/alerts/:alertId', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const { alertId } = req.params;

    // TODO: Implement getAlertById method in service
    res.json({
      success: true,
      data: null,
      message: 'Alert details not yet implemented',
    });
  } catch (error) {
    logger.error('Error getting alert:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'GET_ALERT_ERROR',
        message: (error as Error).message,
      },
    });
  }
});

/**
 * PUT /api/v1/reviews/alerts/:alertId/enable
 * Enable an alert
 */
router.put('/alerts/:alertId/enable', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const { alertId } = req.params;

    // TODO: Implement enableAlert method in service
    res.json({
      success: true,
      message: 'Alert enable not yet implemented',
    });
  } catch (error) {
    logger.error('Error enabling alert:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'ALERT_ENABLE_ERROR',
        message: (error as Error).message,
      },
    });
  }
});

/**
 * PUT /api/v1/reviews/alerts/:alertId/disable
 * Disable an alert
 */
router.put('/alerts/:alertId/disable', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const { alertId } = req.params;

    // TODO: Implement disableAlert method in service
    res.json({
      success: true,
      message: 'Alert disable not yet implemented',
    });
  } catch (error) {
    logger.error('Error disabling alert:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'ALERT_DISABLE_ERROR',
        message: (error as Error).message,
      },
    });
  }
});

/**
 * GET /api/v1/reviews/alerts/instances
 * Get triggered alert instances
 */
router.get('/alerts/instances/list', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const { status, severity, startDate, endDate, limit, offset } = req.query;

    // TODO: Implement getAlertInstances method in service
    res.json({
      success: true,
      data: [],
      message: 'Alert instances not yet implemented',
    });
  } catch (error) {
    logger.error('Error getting alert instances:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'GET_ALERT_INSTANCES_ERROR',
        message: (error as Error).message,
      },
    });
  }
});

// =============================================================================
// STATISTICS & DASHBOARD ENDPOINTS
// =============================================================================

/**
 * GET /api/v1/reviews/stats/overview
 * Get overall review statistics and KPIs
 */
router.get('/stats/overview', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const { platformId, startDate, endDate } = req.query;

    // TODO: Implement getOverviewStats method in service
    res.json({
      success: true,
      data: {
        totalReviews: 0,
        averageRating: 0,
        sentimentBreakdown: {
          veryPositive: 0,
          positive: 0,
          neutral: 0,
          negative: 0,
          veryNegative: 0,
        },
        requiresResponse: 0,
        responseRate: 0,
        averageResponseTime: 0,
        trend: 'stable',
      },
      message: 'Overview stats not yet implemented',
    });
  } catch (error) {
    logger.error('Error getting overview stats:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'STATS_ERROR',
        message: (error as Error).message,
      },
    });
  }
});

/**
 * GET /api/v1/reviews/stats/topics
 * Get top review topics and themes
 */
router.get('/stats/topics', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const { platformId, startDate, endDate, limit } = req.query;

    // TODO: Implement getTopTopics method in service
    res.json({
      success: true,
      data: [],
      message: 'Topic stats not yet implemented',
    });
  } catch (error) {
    logger.error('Error getting topic stats:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'TOPIC_STATS_ERROR',
        message: (error as Error).message,
      },
    });
  }
});

// Export router
export { router as reviewRoutes };
