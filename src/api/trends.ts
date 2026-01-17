/**
 * Trends Routes
 *
 * API endpoints for the Trend Spotter system
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import {
  requireOrganization,
  requirePermission,
  getOrganizationId,
  getUserId,
} from '../middleware/multiTenancy.js';
import {
  trendSpotterService,
  Platform,
  TrendType,
  TrendStatus,
} from '../services/trendSpotterService.js';
import { logger } from '../utils/logger.js';

const router = Router();

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

const platformSchema = z.enum(['tiktok', 'instagram', 'youtube', 'linkedin']);
const trendTypeSchema = z.enum(['sound', 'format', 'topic', 'meme', 'challenge', 'effect']);
const trendStatusSchema = z.enum(['rising', 'peak', 'declining', 'expired', 'archived']);

const getTrendsQuerySchema = z.object({
  platform: platformSchema.optional(),
  trendType: trendTypeSchema.optional(),
  status: trendStatusSchema.optional(),
  minVirality: z.coerce.number().min(0).max(100).default(50),
  limit: z.coerce.number().min(1).max(100).default(20),
  offset: z.coerce.number().min(0).default(0),
});

const generateContentSchema = z.object({
  platform: platformSchema.optional(),
  customInstructions: z.string().optional(),
});

const schedulePostSchema = z.object({
  scheduledFor: z.string().datetime(),
  platform: platformSchema,
  customMessage: z.string().optional(),
});

// ============================================================================
// ROUTES
// ============================================================================

/**
 * GET /api/trends
 * Get current trends across all platforms (or filtered by platform)
 */
router.get('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const query = getTrendsQuerySchema.parse(req.query);

    const result = await trendSpotterService.getTrends({
      platform: query.platform as Platform | undefined,
      trendType: query.trendType as TrendType | undefined,
      status: query.status as TrendStatus | undefined,
      minVirality: query.minVirality,
      limit: query.limit,
      offset: query.offset,
    });

    res.json({
      success: true,
      data: {
        trends: result.trends,
        pagination: {
          total: result.total,
          limit: query.limit,
          offset: query.offset,
          hasMore: query.offset + query.limit < result.total,
        },
      },
    });
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('[Trends API] Error fetching trends', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? err.message : 'Failed to fetch trends',
    });
  }
});

/**
 * GET /api/trends/relevant
 * Get brand-relevant trends for the authenticated organization
 */
router.get(
  '/relevant',
  requireAuth,
  requireOrganization,
  async (req: Request, res: Response) => {
    try {
      const organizationId = getOrganizationId(req)!;

      const querySchema = z.object({
        platforms: z.string().optional().transform((val) =>
          val ? val.split(',').map((p) => p.trim() as Platform) : undefined
        ),
        minRelevanceScore: z.coerce.number().min(0).max(100).default(60),
        limit: z.coerce.number().min(1).max(50).default(10),
      });

      const query = querySchema.parse(req.query);

      const relevantTrends = await trendSpotterService.findRelevantTrends(organizationId, {
        platforms: query.platforms,
        minRelevanceScore: query.minRelevanceScore,
        limit: query.limit,
      });

      res.json({
        success: true,
        data: {
          trends: relevantTrends,
          count: relevantTrends.length,
        },
      });
    } catch (error: unknown) {
    const err = error as Error;
      logger.error('[Trends API] Error fetching relevant trends', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? err.message : 'Failed to fetch relevant trends',
      });
    }
  }
);

/**
 * GET /api/trends/sounds
 * Get trending sounds/audio
 */
router.get('/sounds', requireAuth, async (req: Request, res: Response) => {
  try {
    const querySchema = z.object({
      platform: platformSchema,
      commercialOnly: z.coerce.boolean().default(false),
      limit: z.coerce.number().min(1).max(100).default(20),
    });

    const query = querySchema.parse(req.query);

    const sounds = await trendSpotterService.getTrendingSounds(query.platform as Platform, {
      commercialOnly: query.commercialOnly,
      limit: query.limit,
    });

    res.json({
      success: true,
      data: {
        sounds,
        count: sounds.length,
      },
    });
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('[Trends API] Error fetching trending sounds', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? err.message : 'Failed to fetch trending sounds',
    });
  }
});

/**
 * GET /api/trends/formats
 * Get trending video formats
 */
router.get('/formats', requireAuth, async (req: Request, res: Response) => {
  try {
    const querySchema = z.object({
      platforms: z.string().optional().transform((val) =>
        val ? val.split(',').map((p) => p.trim() as Platform) : undefined
      ),
      brandSafe: z.coerce.boolean().default(true),
      limit: z.coerce.number().min(1).max(100).default(20),
    });

    const query = querySchema.parse(req.query);

    const formats = await trendSpotterService.getTrendingFormats({
      platforms: query.platforms,
      brandSafe: query.brandSafe,
      limit: query.limit,
    });

    res.json({
      success: true,
      data: {
        formats,
        count: formats.length,
      },
    });
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('[Trends API] Error fetching trending formats', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? err.message : 'Failed to fetch trending formats',
    });
  }
});

/**
 * GET /api/trends/:id
 * Get a specific trend by ID
 */
router.get('/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const trend = await trendSpotterService.getTrendById(id);

    if (!trend) {
      return res.status(404).json({
        success: false,
        error: 'Trend not found',
      });
    }

    res.json({
      success: true,
      data: { trend },
    });
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('[Trends API] Error fetching trend', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? err.message : 'Failed to fetch trend',
    });
  }
});

/**
 * POST /api/trends/:id/generate
 * Generate brand content from a trend
 */
router.post(
  '/:id/generate',
  requireAuth,
  requireOrganization,
  requirePermission('campaigns.create'),
  async (req: Request, res: Response) => {
    try {
      const { id: trendId } = req.params;
      const organizationId = getOrganizationId(req)!;

      const body = generateContentSchema.parse(req.body);

      const generatedContent = await trendSpotterService.generateTrendContent(
        organizationId,
        trendId,
        {
          platform: body.platform as Platform | undefined,
          customInstructions: body.customInstructions,
        }
      );

      res.json({
        success: true,
        data: {
          content: generatedContent,
          message: 'Content generated successfully. Review and approve before publishing.',
        },
      });
    } catch (error: unknown) {
    const err = error as Error;
      logger.error('[Trends API] Error generating content', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? err.message : 'Failed to generate content',
      });
    }
  }
);

/**
 * GET /api/trends/:id/preview
 * Preview how a trend would look for this brand
 */
router.get(
  '/:id/preview',
  requireAuth,
  requireOrganization,
  async (req: Request, res: Response) => {
    try {
      const { id: trendId } = req.params;
      const organizationId = getOrganizationId(req)!;

      // Fetch the trend
      const trend = await trendSpotterService.getTrendById(trendId);

      if (!trend) {
        return res.status(404).json({
          success: false,
          error: 'Trend not found',
        });
      }

      // Fetch brand profile for customization
      const { query } = await import('../database/db.js');
      const brandResult = await query<{ name: string; metadata: Record<string, unknown>; colors: Record<string, string> | null; voice_tone: string | null }>(
        `SELECT o.name, o.metadata, bt.colors, bt.voice_tone
         FROM organizations o
         LEFT JOIN brand_tokens bt ON bt.client_id = o.id
         WHERE o.id = $1
         LIMIT 1`,
        [organizationId]
      );

      const brand = brandResult.rows[0];

      // Generate preview data based on trend type
      const previewData = {
        trendInfo: {
          title: trend.title,
          platform: trend.platform,
          trendType: trend.trend_type,
          viralityScore: trend.virality_score,
          estimatedShelfLife: trend.estimated_shelf_life_hours,
          status: trend.status,
        },
        brandAdaptation: {
          suggestedCaption: generateSuggestedCaption(trend, brand?.name || 'Your Brand'),
          recommendedHashtags: trend.hashtags?.slice(0, 10) || [],
          optimalPostingWindow: {
            start: new Date().toISOString(),
            end: new Date(Date.now() + trend.estimated_shelf_life_hours * 60 * 60 * 1000).toISOString(),
          },
          platformSpecificTips: getPlatformTips(trend.platform),
        },
        mockupConfig: {
          brandName: brand?.name || 'Your Brand',
          brandColors: brand?.colors || { primary: '#000000', secondary: '#ffffff' },
          voiceTone: brand?.voice_tone || 'professional',
          contentUrl: trend.content_url,
        },
        relevanceMetrics: {
          trendVelocity: trend.velocity_score,
          engagementRate: trend.engagement_rate,
          projectedReach: estimateReach(trend),
        },
      };

      res.json({
        success: true,
        data: {
          trend,
          preview: previewData,
        },
      });
    } catch (error: unknown) {
    const err = error as Error;
      logger.error('[Trends API] Error generating preview', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? err.message : 'Failed to generate preview',
      });
    }
  }
);

// Helper functions for preview generation
function generateSuggestedCaption(trend: { title?: string; hashtags?: string[]; platform: string }, brandName: string): string {
  const trendTitle = trend.title || 'this trend';
  const topHashtags = trend.hashtags?.slice(0, 3).join(' ') || '';

  const templates = [
    `${brandName} is jumping on ${trendTitle}! ${topHashtags}`,
    `We couldn't resist! ${brandName} tries ${trendTitle} ${topHashtags}`,
    `${trendTitle} - ${brandName} style! ${topHashtags}`,
  ];

  return templates[Math.floor(Math.random() * templates.length)];
}

function getPlatformTips(platform: string): string[] {
  const tips: Record<string, string[]> = {
    tiktok: [
      'Post within 24-48 hours for maximum relevance',
      'Use trending sounds if applicable',
      'Keep video under 60 seconds for Shorts format',
      'Engage with comments in the first hour',
    ],
    instagram: [
      'Post as a Reel for maximum visibility',
      'Use up to 30 relevant hashtags',
      'Post during peak hours (11am-1pm, 7pm-9pm)',
      'Add a compelling hook in the first 3 seconds',
    ],
    youtube: [
      'Create a Short (under 60 seconds) for trending content',
      'Use a catchy thumbnail',
      'Include trending keywords in title and description',
      'Engage with early comments to boost algorithm',
    ],
    linkedin: [
      'Add a professional angle to the trend',
      'Post during business hours (8am-10am, 12pm)',
      'Include 3-5 relevant hashtags',
      'Write a thoughtful caption with insights',
    ],
  };

  return tips[platform] || ['Act quickly while the trend is hot', 'Stay authentic to your brand voice'];
}

function estimateReach(trend: { views_count: number; virality_score: number; velocity_score: number }): { min: number; max: number; confidence: string } {
  const baseReach = trend.views_count || 10000;
  const viralityMultiplier = 1 + (trend.virality_score / 100);
  const velocityMultiplier = 1 + (trend.velocity_score / 100);

  const estimatedMin = Math.round(baseReach * 0.01 * viralityMultiplier);
  const estimatedMax = Math.round(baseReach * 0.05 * viralityMultiplier * velocityMultiplier);

  let confidence = 'low';
  if (trend.virality_score > 70 && trend.velocity_score > 70) confidence = 'high';
  else if (trend.virality_score > 50 || trend.velocity_score > 50) confidence = 'medium';

  return { min: estimatedMin, max: estimatedMax, confidence };
}

/**
 * POST /api/trends/:id/schedule
 * Schedule a trend-based post
 */
router.post(
  '/:id/schedule',
  requireAuth,
  requireOrganization,
  requirePermission('campaigns.publish'),
  async (req: Request, res: Response) => {
    try {
      const { id: trendId } = req.params;
      const organizationId = getOrganizationId(req)!;
      const userId = getUserId(req);

      const body = schedulePostSchema.parse(req.body);

      const trend = await trendSpotterService.getTrendById(trendId);

      if (!trend) {
        return res.status(404).json({
          success: false,
          error: 'Trend not found',
        });
      }

      // Check if trend is still viable
      const shelfLifeEnd = new Date(
        trend.detected_at.getTime() + trend.estimated_shelf_life_hours * 60 * 60 * 1000
      );

      if (new Date(body.scheduledFor) > shelfLifeEnd) {
        return res.status(400).json({
          success: false,
          error: 'Scheduled time is beyond the trend shelf life. This trend may be expired by then.',
          data: {
            trendExpiresAt: shelfLifeEnd.toISOString(),
            requestedScheduleTime: body.scheduledFor,
          },
        });
      }

      // Import database query function
      const { query } = await import('../database/db.js');

      // Generate caption using trend data
      const generatedCaption = (body as any).customCaption || generateSuggestedCaption(trend, (body as any).brandName || 'Your Brand');
      const selectedHashtags = (body as any).hashtags || trend.hashtags?.slice(0, 10) || [];

      // Create scheduled post in trend_generated_content table
      const insertResult = await query<{ id: string }>(
        `INSERT INTO trend_generated_content (
          organization_id,
          trending_content_id,
          platform,
          content_type,
          caption,
          hashtags,
          status,
          scheduled_for,
          generation_metadata
        ) VALUES ($1, $2, $3, $4, $5, $6, 'scheduled', $7, $8)
        RETURNING id`,
        [
          organizationId,
          trendId,
          body.platform,
          'video',
          generatedCaption,
          selectedHashtags,
          body.scheduledFor,
          JSON.stringify({
            scheduledBy: userId,
            trendTitle: trend.title,
            trendViralityScore: trend.virality_score,
            scheduledAt: new Date().toISOString(),
            brandName: (body as any).brandName,
          }),
        ]
      );

      const scheduledPostId = insertResult.rows[0].id;

      // Update brand_trend_matches if exists
      await query(
        `UPDATE brand_trend_matches
         SET status = 'generated', updated_at = NOW()
         WHERE organization_id = $1 AND trending_content_id = $2`,
        [organizationId, trendId]
      );

      logger.info('[Trends API] Scheduled trend post', {
        scheduledPostId,
        trendId,
        organizationId,
        scheduledFor: body.scheduledFor,
        platform: body.platform,
      });

      res.json({
        success: true,
        data: {
          scheduledPostId,
          message: 'Post scheduled successfully',
          scheduledFor: body.scheduledFor,
          platform: body.platform,
          caption: generatedCaption,
          hashtags: selectedHashtags,
          trend: {
            id: trend.id,
            title: trend.title,
            expiresAt: shelfLifeEnd.toISOString(),
          },
        },
      });
    } catch (error: unknown) {
    const err = error as Error;
      logger.error('[Trends API] Error scheduling post', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? err.message : 'Failed to schedule post',
      });
    }
  }
);

/**
 * POST /api/trends/scan
 * Manually trigger a trend scan (admin only)
 */
router.post(
  '/scan',
  requireAuth,
  requireOrganization,
  requirePermission('org.manage'),
  async (req: Request, res: Response) => {
    try {
      const bodySchema = z.object({
        platform: platformSchema,
        region: z.string().length(2).default('US'),
      });

      const body = bodySchema.parse(req.body);

      logger.info('[Trends API] Manual trend scan triggered', {
        platform: body.platform,
        region: body.region,
      });

      // Trigger async scan based on platform
      let trends: unknown[] = [];
      switch (body.platform) {
        case 'tiktok':
          trends = await trendSpotterService.scanTikTokTrends(body.region);
          break;
        case 'instagram':
          trends = await trendSpotterService.scanInstagramTrends(body.region);
          break;
        case 'youtube':
          trends = await trendSpotterService.scanYouTubeTrends(body.region);
          break;
        case 'linkedin':
          trends = await trendSpotterService.scanLinkedInTrends(body.region);
          break;
      }

      res.json({
        success: true,
        data: {
          message: 'Trend scan completed',
          platform: body.platform,
          region: body.region,
          trendsFound: trends.length,
        },
      });
    } catch (error: unknown) {
    const err = error as Error;
      logger.error('[Trends API] Error scanning trends', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? err.message : 'Failed to scan trends',
      });
    }
  }
);

/**
 * POST /api/trends/update-metrics
 * Update trend metrics (admin only)
 */
router.post(
  '/update-metrics',
  requireAuth,
  requireOrganization,
  requirePermission('org.manage'),
  async (req: Request, res: Response) => {
    try {
      await trendSpotterService.updateTrendMetrics();

      res.json({
        success: true,
        data: {
          message: 'Trend metrics updated successfully',
        },
      });
    } catch (error: unknown) {
    const err = error as Error;
      logger.error('[Trends API] Error updating metrics', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? err.message : 'Failed to update metrics',
      });
    }
  }
);

export default router;
