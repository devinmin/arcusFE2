/**
 * Influencer Marketing Platform API Routes
 *
 * Provides endpoints for:
 * - Influencer CRUD operations
 * - AI-powered influencer discovery and matching
 * - Campaign brief generation
 * - Performance tracking and analytics
 * - Affiliate link management
 * - FTC compliance checking
 *
 * Phase 3.1 - Influencer Marketing Platform (DTC Critical)
 */

import { Router, Request, Response, NextFunction } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { influencerPlatformService } from '../services/influencerPlatformService.js';
import { pool } from '../database/db.js';
import { logger } from '../utils/logger.js';

const router = Router();

// =============================================================================
// MIDDLEWARE
// =============================================================================

/**
 * Middleware to ensure organization context is loaded
 */
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

/**
 * Helper to get organization ID from request
 */
function getOrganizationId(req: Request): string {
  const orgId = (req as any).organizationId || (req.user as any)?.organizationId;
  if (!orgId) {
    throw new Error('Organization ID not found');
  }
  return orgId;
}

// =============================================================================
// INFLUENCER CRUD ENDPOINTS
// =============================================================================

/**
 * GET /api/v1/influencers
 * List all influencers for the organization
 */
router.get('/', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const { tier, niche, status, limit = 50, offset = 0 } = req.query;

    const conditions: string[] = ['organization_id = $1'];
    const params: unknown[] = [organizationId];
    let paramIndex = 2;

    if (tier) {
      conditions.push(`tier = $${paramIndex}`);
      params.push(tier);
      paramIndex++;
    }

    if (niche) {
      conditions.push(`(primary_niche = $${paramIndex} OR $${paramIndex} = ANY(secondary_niches))`);
      params.push(niche);
      paramIndex++;
    }

    if (status) {
      conditions.push(`status = $${paramIndex}`);
      params.push(status);
      paramIndex++;
    }

    params.push(Number(limit));
    params.push(Number(offset));

    const query = `
      SELECT *
      FROM influencers
      WHERE ${conditions.join(' AND ')}
      ORDER BY created_at DESC
      LIMIT $${paramIndex}
      OFFSET $${paramIndex + 1}
    `;

    const result = await pool.query(query, params);

    const countQuery = `
      SELECT COUNT(*) as total
      FROM influencers
      WHERE ${conditions.join(' AND ')}
    `;

    const countResult = await pool.query(countQuery, params.slice(0, -2));

    res.json({
      success: true,
      data: {
        influencers: result.rows,
        total: parseInt(countResult.rows[0].total),
        limit: Number(limit),
        offset: Number(offset),
      },
    });
  } catch (error) {
    logger.error('Error fetching influencers:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'FETCH_ERROR',
        message: (error as Error).message,
      },
    });
  }
});

/**
 * GET /api/v1/influencers/:id
 * Get a specific influencer by ID
 */
router.get('/:id', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const { id } = req.params;

    const result = await pool.query(
      'SELECT * FROM influencers WHERE id = $1 AND organization_id = $2',
      [id, organizationId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Influencer not found',
        },
      });
    }

    res.json({
      success: true,
      data: result.rows[0],
    });
  } catch (error) {
    logger.error('Error fetching influencer:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'FETCH_ERROR',
        message: (error as Error).message,
      },
    });
  }
});

/**
 * POST /api/v1/influencers
 * Create a new influencer profile
 */
router.post('/', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const {
      name,
      email,
      phone,
      bio,
      profileImageUrl,
      location,
      tier,
      primaryNiche,
      secondaryNiches,
      instagramHandle,
      instagramFollowers,
      instagramEngagementRate,
      tiktokHandle,
      tiktokFollowers,
      tiktokEngagementRate,
      youtubeHandle,
      youtubeSubscribers,
      youtubeAvgViews,
      twitterHandle,
      twitterFollowers,
      rates,
      preferredCollaborationTypes,
      notes,
      tags,
    } = req.body;

    if (!name || !tier || !primaryNiche) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_REQUIRED_FIELDS',
          message: 'Name, tier, and primaryNiche are required',
        },
      });
    }

    // Calculate total followers
    const totalFollowers =
      (instagramFollowers || 0) +
      (tiktokFollowers || 0) +
      (youtubeSubscribers || 0) +
      (twitterFollowers || 0);

    // Calculate average engagement rate
    const engagementRates = [
      instagramEngagementRate,
      tiktokEngagementRate,
    ].filter((rate) => rate !== undefined && rate !== null);
    const avgEngagementRate =
      engagementRates.length > 0
        ? engagementRates.reduce((sum, rate) => sum + rate, 0) / engagementRates.length
        : null;

    const query = `
      INSERT INTO influencers (
        organization_id,
        name,
        email,
        phone,
        bio,
        profile_image_url,
        location,
        tier,
        primary_niche,
        secondary_niches,
        instagram_handle,
        instagram_followers,
        instagram_engagement_rate,
        tiktok_handle,
        tiktok_followers,
        tiktok_engagement_rate,
        youtube_handle,
        youtube_subscribers,
        youtube_avg_views,
        twitter_handle,
        twitter_followers,
        total_followers,
        avg_engagement_rate,
        rates,
        preferred_collaboration_types,
        notes,
        tags,
        discovered_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, NOW())
      RETURNING *
    `;

    const result = await pool.query(query, [
      organizationId,
      name,
      email,
      phone,
      bio,
      profileImageUrl,
      location,
      tier,
      primaryNiche,
      secondaryNiches,
      instagramHandle,
      instagramFollowers,
      instagramEngagementRate,
      tiktokHandle,
      tiktokFollowers,
      tiktokEngagementRate,
      youtubeHandle,
      youtubeSubscribers,
      youtubeAvgViews,
      twitterHandle,
      twitterFollowers,
      totalFollowers,
      avgEngagementRate,
      rates,
      preferredCollaborationTypes,
      notes,
      tags,
    ]);

    res.status(201).json({
      success: true,
      data: result.rows[0],
    });
  } catch (error) {
    logger.error('Error creating influencer:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'CREATE_ERROR',
        message: (error as Error).message,
      },
    });
  }
});

/**
 * PUT /api/v1/influencers/:id
 * Update an influencer profile
 */
router.put('/:id', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const { id } = req.params;

    // Check if influencer exists
    const checkResult = await pool.query(
      'SELECT id FROM influencers WHERE id = $1 AND organization_id = $2',
      [id, organizationId]
    );

    if (checkResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Influencer not found',
        },
      });
    }

    const updates: string[] = [];
    const params: unknown[] = [];
    let paramIndex = 1;

    const allowedFields = [
      'name',
      'email',
      'phone',
      'bio',
      'profile_image_url',
      'location',
      'tier',
      'primary_niche',
      'secondary_niches',
      'instagram_handle',
      'instagram_followers',
      'instagram_engagement_rate',
      'tiktok_handle',
      'tiktok_followers',
      'tiktok_engagement_rate',
      'youtube_handle',
      'youtube_subscribers',
      'youtube_avg_views',
      'twitter_handle',
      'twitter_followers',
      'rates',
      'preferred_collaboration_types',
      'status',
      'notes',
      'tags',
    ];

    for (const field of allowedFields) {
      const snakeField = field;
      const camelField = snakeField.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());

      if (req.body[camelField] !== undefined) {
        updates.push(`${snakeField} = $${paramIndex}`);
        params.push(req.body[camelField]);
        paramIndex++;
      }
    }

    if (updates.length === 0) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'NO_UPDATES',
          message: 'No valid fields to update',
        },
      });
    }

    updates.push('updated_at = NOW()');
    params.push(id);
    params.push(organizationId);

    const query = `
      UPDATE influencers
      SET ${updates.join(', ')}
      WHERE id = $${paramIndex} AND organization_id = $${paramIndex + 1}
      RETURNING *
    `;

    const result = await pool.query(query, params);

    res.json({
      success: true,
      data: result.rows[0],
    });
  } catch (error) {
    logger.error('Error updating influencer:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'UPDATE_ERROR',
        message: (error as Error).message,
      },
    });
  }
});

/**
 * DELETE /api/v1/influencers/:id
 * Delete an influencer profile
 */
router.delete('/:id', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const { id } = req.params;

    const result = await pool.query(
      'DELETE FROM influencers WHERE id = $1 AND organization_id = $2 RETURNING id',
      [id, organizationId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Influencer not found',
        },
      });
    }

    res.json({
      success: true,
      data: { id: result.rows[0].id },
    });
  } catch (error) {
    logger.error('Error deleting influencer:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'DELETE_ERROR',
        message: (error as Error).message,
      },
    });
  }
});

// =============================================================================
// INFLUENCER DISCOVERY ENDPOINTS
// =============================================================================

/**
 * POST /api/v1/influencers/discover
 * AI-powered influencer discovery and matching
 */
router.post('/discover', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const {
      niches,
      tiers,
      minFollowers,
      maxFollowers,
      minEngagementRate,
      platforms,
      location,
      demographics,
      limit = 20,
    } = req.body;

    const influencers = await influencerPlatformService.discoverInfluencers({
      organizationId,
      niches,
      tiers,
      minFollowers,
      maxFollowers,
      minEngagementRate,
      platforms,
      location,
      demographics,
      excludeExistingInfluencers: false,
      limit,
    });

    res.json({
      success: true,
      data: {
        influencers,
        count: influencers.length,
      },
    });
  } catch (error) {
    logger.error('Error discovering influencers:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'DISCOVERY_ERROR',
        message: (error as Error).message,
      },
    });
  }
});

// =============================================================================
// CAMPAIGN BRIEF GENERATION
// =============================================================================

/**
 * POST /api/v1/influencers/:id/brief
 * Generate AI-powered campaign brief for an influencer
 */
router.post('/:id/brief', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const { id: influencerId } = req.params;
    const {
      campaignId,
      campaignName,
      campaignType,
      brandContext,
      productDetails,
      targetAudience,
      keyMessages,
      deliverables,
      dosAndDonts,
      compensationType,
      budgetRange,
    } = req.body;

    if (!campaignName || !campaignType) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_REQUIRED_FIELDS',
          message: 'campaignName and campaignType are required',
        },
      });
    }

    // Verify influencer exists
    const influencerResult = await pool.query(
      'SELECT * FROM influencers WHERE id = $1 AND organization_id = $2',
      [influencerId, organizationId]
    );

    if (influencerResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Influencer not found',
        },
      });
    }

    const brief = await influencerPlatformService.generateCampaignBrief({
      organizationId,
      campaignId,
      campaignName,
      campaignType,
      brandContext,
      productDetails,
      targetAudience,
      keyMessages,
      deliverables,
      dosAndDonts,
      compensationType,
      budgetRange,
    });

    res.json({
      success: true,
      data: {
        brief,
        influencer: influencerResult.rows[0],
      },
    });
  } catch (error) {
    logger.error('Error generating brief:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'BRIEF_GENERATION_ERROR',
        message: (error as Error).message,
      },
    });
  }
});

// =============================================================================
// PERFORMANCE TRACKING
// =============================================================================

/**
 * GET /api/v1/influencers/:id/performance
 * Get performance metrics for an influencer
 */
router.get('/:id/performance', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const { id: influencerId } = req.params;
    const { campaignId, periodStart, periodEnd } = req.query;

    // Verify influencer exists
    const influencerResult = await pool.query(
      'SELECT * FROM influencers WHERE id = $1 AND organization_id = $2',
      [influencerId, organizationId]
    );

    if (influencerResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Influencer not found',
        },
      });
    }

    const performance = await influencerPlatformService.calculatePerformance(
      influencerId,
      organizationId,
      campaignId as string | undefined,
      periodStart ? new Date(periodStart as string) : undefined,
      periodEnd ? new Date(periodEnd as string) : undefined
    );

    res.json({
      success: true,
      data: {
        influencer: influencerResult.rows[0],
        performance,
      },
    });
  } catch (error) {
    logger.error('Error calculating performance:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'PERFORMANCE_ERROR',
        message: (error as Error).message,
      },
    });
  }
});

// =============================================================================
// CAMPAIGN MANAGEMENT
// =============================================================================

/**
 * POST /api/v1/influencers/campaigns
 * Create a new influencer campaign
 */
router.post('/campaigns', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const userId = (req.user as any)?.userId;
    const {
      name,
      description,
      campaignType,
      targetNiches,
      targetTiers,
      minFollowers,
      maxFollowers,
      minEngagementRate,
      requiredDemographics,
      brief,
      briefUrl,
      deliverablesRequired,
      hashtags,
      mentions,
      keyMessages,
      dosAndDonts,
      approvalRequired = true,
      totalBudget,
      compensationModel,
      startDate,
      endDate,
      contentDueDate,
      postingStartDate,
      postingEndDate,
      goalImpressions,
      goalEngagement,
      goalClicks,
      goalConversions,
      goalUgcPieces,
    } = req.body;

    if (!name || !campaignType) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_REQUIRED_FIELDS',
          message: 'name and campaignType are required',
        },
      });
    }

    const query = `
      INSERT INTO influencer_campaigns (
        organization_id,
        name,
        description,
        campaign_type,
        target_niches,
        target_tiers,
        min_followers,
        max_followers,
        min_engagement_rate,
        required_demographics,
        brief,
        brief_url,
        deliverables_required,
        hashtags,
        mentions,
        key_messages,
        dos_and_donts,
        approval_required,
        total_budget,
        compensation_model,
        start_date,
        end_date,
        content_due_date,
        posting_start_date,
        posting_end_date,
        goal_impressions,
        goal_engagement,
        goal_clicks,
        goal_conversions,
        goal_ugc_pieces,
        created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31)
      RETURNING *
    `;

    const result = await pool.query(query, [
      organizationId,
      name,
      description,
      campaignType,
      targetNiches,
      targetTiers,
      minFollowers,
      maxFollowers,
      minEngagementRate,
      requiredDemographics,
      brief,
      briefUrl,
      deliverablesRequired,
      hashtags,
      mentions,
      keyMessages,
      dosAndDonts,
      approvalRequired,
      totalBudget,
      compensationModel,
      startDate,
      endDate,
      contentDueDate,
      postingStartDate,
      postingEndDate,
      goalImpressions,
      goalEngagement,
      goalClicks,
      goalConversions,
      goalUgcPieces,
      userId,
    ]);

    res.status(201).json({
      success: true,
      data: result.rows[0],
    });
  } catch (error) {
    logger.error('Error creating campaign:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'CREATE_ERROR',
        message: (error as Error).message,
      },
    });
  }
});

/**
 * GET /api/v1/influencers/campaigns
 * List all influencer campaigns
 */
router.get('/campaigns', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const { status, campaignType, limit = 50, offset = 0 } = req.query;

    const conditions: string[] = ['organization_id = $1'];
    const params: unknown[] = [organizationId];
    let paramIndex = 2;

    if (status) {
      conditions.push(`status = $${paramIndex}`);
      params.push(status);
      paramIndex++;
    }

    if (campaignType) {
      conditions.push(`campaign_type = $${paramIndex}`);
      params.push(campaignType);
      paramIndex++;
    }

    params.push(Number(limit));
    params.push(Number(offset));

    const query = `
      SELECT *
      FROM influencer_campaigns
      WHERE ${conditions.join(' AND ')}
      ORDER BY created_at DESC
      LIMIT $${paramIndex}
      OFFSET $${paramIndex + 1}
    `;

    const result = await pool.query(query, params);

    const countQuery = `
      SELECT COUNT(*) as total
      FROM influencer_campaigns
      WHERE ${conditions.join(' AND ')}
    `;

    const countResult = await pool.query(countQuery, params.slice(0, -2));

    res.json({
      success: true,
      data: {
        campaigns: result.rows,
        total: parseInt(countResult.rows[0].total),
        limit: Number(limit),
        offset: Number(offset),
      },
    });
  } catch (error) {
    logger.error('Error fetching campaigns:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'FETCH_ERROR',
        message: (error as Error).message,
      },
    });
  }
});

/**
 * GET /api/v1/influencers/campaigns/:campaignId
 * Get a specific campaign
 */
router.get('/campaigns/:campaignId', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const { campaignId } = req.params;

    const result = await pool.query(
      'SELECT * FROM influencer_campaigns WHERE id = $1 AND organization_id = $2',
      [campaignId, organizationId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Campaign not found',
        },
      });
    }

    res.json({
      success: true,
      data: result.rows[0],
    });
  } catch (error) {
    logger.error('Error fetching campaign:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'FETCH_ERROR',
        message: (error as Error).message,
      },
    });
  }
});

// =============================================================================
// FTC COMPLIANCE
// =============================================================================

/**
 * POST /api/v1/influencers/content/ftc-check
 * Check content for FTC compliance
 */
router.post('/content/ftc-check', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const { caption, hashtags, platform, contentType } = req.body;

    if (!platform || !contentType) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_REQUIRED_FIELDS',
          message: 'platform and contentType are required',
        },
      });
    }

    const result = await influencerPlatformService.checkFTCCompliance({
      caption,
      hashtags,
      platform,
      contentType,
    });

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    logger.error('Error checking FTC compliance:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'FTC_CHECK_ERROR',
        message: (error as Error).message,
      },
    });
  }
});

// =============================================================================
// AFFILIATE LINKS
// =============================================================================

/**
 * POST /api/v1/influencers/:id/affiliate-links
 * Generate affiliate link for an influencer
 */
router.post('/:id/affiliate-links', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const { id: influencerId } = req.params;
    const {
      campaignId,
      originalUrl,
      promoCode,
      commissionRate,
      commissionType,
      validFrom,
      validUntil,
    } = req.body;

    if (!originalUrl) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_REQUIRED_FIELDS',
          message: 'originalUrl is required',
        },
      });
    }

    const affiliateLink = await influencerPlatformService.generateAffiliateLink(
      influencerId,
      organizationId,
      campaignId,
      originalUrl,
      {
        promoCode,
        commissionRate,
        commissionType,
        validFrom: validFrom ? new Date(validFrom) : undefined,
        validUntil: validUntil ? new Date(validUntil) : undefined,
      }
    );

    res.status(201).json({
      success: true,
      data: affiliateLink,
    });
  } catch (error) {
    logger.error('Error generating affiliate link:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'AFFILIATE_LINK_ERROR',
        message: (error as Error).message,
      },
    });
  }
});

/**
 * GET /api/v1/influencers/:id/affiliate-links
 * Get all affiliate links for an influencer
 */
router.get('/:id/affiliate-links', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const { id: influencerId } = req.params;

    const result = await pool.query(
      `SELECT * FROM influencer_affiliate_links
       WHERE influencer_id = $1 AND organization_id = $2
       ORDER BY created_at DESC`,
      [influencerId, organizationId]
    );

    res.json({
      success: true,
      data: {
        affiliateLinks: result.rows,
        count: result.rows.length,
      },
    });
  } catch (error) {
    logger.error('Error fetching affiliate links:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'FETCH_ERROR',
        message: (error as Error).message,
      },
    });
  }
});

export default router;
