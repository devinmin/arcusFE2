/**
 * Loyalty & Rewards API Routes
 *
 * Provides endpoints for:
 * - Loyalty program management
 * - Member enrollment and management
 * - Points tracking and redemption
 * - Reward catalog
 * - Personalized offers
 * - Referral program
 *
 * Phase 3.2 - Loyalty & Rewards Engine (DTC Critical)
 */

import { Router, Request, Response, NextFunction } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { loyaltyEngineService } from '../services/loyaltyEngineService.js';
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
        message: 'Organization context required'
      }
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

// =============================================================================
// LOYALTY PROGRAMS
// =============================================================================

/**
 * POST /api/v1/loyalty/programs
 * Create a new loyalty program
 */
router.post('/programs', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const {
      name,
      slug,
      description,
      type,
      pointsConfig,
      tierConfig,
      referralConfig,
      gamificationConfig,
      branding,
    } = req.body;

    if (!name || !slug || !type) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_REQUIRED_FIELDS',
          message: 'Name, slug, and type are required',
        },
      });
    }

    const program = await loyaltyEngineService.createProgram({
      organizationId,
      name,
      slug,
      description,
      type,
      pointsConfig,
      tierConfig,
      referralConfig,
      gamificationConfig,
      branding,
    });

    res.json({
      success: true,
      data: program,
    });
  } catch (error) {
    logger.error('Error creating loyalty program:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'PROGRAM_CREATE_ERROR',
        message: (error as Error).message,
      },
    });
  }
});

/**
 * GET /api/v1/loyalty/programs
 * List all loyalty programs
 */
router.get('/programs', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const programs = await loyaltyEngineService.listPrograms(organizationId);

    res.json({
      success: true,
      data: programs,
    });
  } catch (error) {
    logger.error('Error listing loyalty programs:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'PROGRAM_LIST_ERROR',
        message: (error as Error).message,
      },
    });
  }
});

/**
 * GET /api/v1/loyalty/programs/:id
 * Get loyalty program details
 */
router.get('/programs/:id', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const { id } = req.params;

    const program = await loyaltyEngineService.getProgram(id, organizationId);

    if (!program) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'PROGRAM_NOT_FOUND',
          message: 'Loyalty program not found',
        },
      });
    }

    res.json({
      success: true,
      data: program,
    });
  } catch (error) {
    logger.error('Error getting loyalty program:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'PROGRAM_GET_ERROR',
        message: (error as Error).message,
      },
    });
  }
});

/**
 * PUT /api/v1/loyalty/programs/:id
 * Update loyalty program
 */
router.put('/programs/:id', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const { id } = req.params;

    const program = await loyaltyEngineService.updateProgram(id, organizationId, req.body);

    res.json({
      success: true,
      data: program,
    });
  } catch (error) {
    logger.error('Error updating loyalty program:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'PROGRAM_UPDATE_ERROR',
        message: (error as Error).message,
      },
    });
  }
});

// =============================================================================
// LOYALTY MEMBERS
// =============================================================================

/**
 * POST /api/v1/loyalty/members
 * Enroll a member in a loyalty program
 */
router.post('/members', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const { programId, email, customerId, externalCustomerId, metadata } = req.body;

    if (!programId || !email) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_REQUIRED_FIELDS',
          message: 'Program ID and email are required',
        },
      });
    }

    const member = await loyaltyEngineService.enrollMember({
      programId,
      organizationId,
      email,
      customerId,
      externalCustomerId,
      metadata,
    });

    res.json({
      success: true,
      data: member,
    });
  } catch (error) {
    logger.error('Error enrolling member:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'MEMBER_ENROLL_ERROR',
        message: (error as Error).message,
      },
    });
  }
});

/**
 * GET /api/v1/loyalty/members/:id
 * Get member details
 */
router.get('/members/:id', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const { id } = req.params;

    const member = await loyaltyEngineService.getMember(id, organizationId);

    if (!member) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'MEMBER_NOT_FOUND',
          message: 'Member not found',
        },
      });
    }

    res.json({
      success: true,
      data: member,
    });
  } catch (error) {
    logger.error('Error getting member:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'MEMBER_GET_ERROR',
        message: (error as Error).message,
      },
    });
  }
});

/**
 * GET /api/v1/loyalty/members
 * Search members with filters
 */
router.get('/members', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const {
      programId,
      tier,
      status,
      minPoints,
      maxPoints,
      limit,
      offset,
    } = req.query;

    if (!programId) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_PROGRAM_ID',
          message: 'Program ID is required',
        },
      });
    }

    const result = await loyaltyEngineService.searchMembers({
      programId: programId as string,
      organizationId,
      tier: tier as string | undefined,
      status: status as string | undefined,
      minPoints: minPoints ? parseInt(minPoints as string, 10) : undefined,
      maxPoints: maxPoints ? parseInt(maxPoints as string, 10) : undefined,
      limit: limit ? parseInt(limit as string, 10) : undefined,
      offset: offset ? parseInt(offset as string, 10) : undefined,
    });

    res.json({
      success: true,
      data: result.members,
      meta: {
        total: result.total,
        limit: limit ? parseInt(limit as string, 10) : 50,
        offset: offset ? parseInt(offset as string, 10) : 0,
      },
    });
  } catch (error) {
    logger.error('Error searching members:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'MEMBER_SEARCH_ERROR',
        message: (error as Error).message,
      },
    });
  }
});

/**
 * GET /api/v1/loyalty/members/:id/tier
 * Get member tier information
 */
router.get('/members/:id/tier', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const { id } = req.params;

    const member = await loyaltyEngineService.getMember(id, organizationId);

    if (!member) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'MEMBER_NOT_FOUND',
          message: 'Member not found',
        },
      });
    }

    res.json({
      success: true,
      data: {
        currentTier: member.currentTier,
        tierPoints: member.tierPoints,
        tierQualifiedAt: member.tierQualifiedAt,
        nextTier: member.nextTier,
        nextTierThreshold: member.nextTierThreshold,
        pointsToNextTier: member.nextTierThreshold
          ? member.nextTierThreshold - member.tierPoints
          : null,
      },
    });
  } catch (error) {
    logger.error('Error getting member tier:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'MEMBER_TIER_ERROR',
        message: (error as Error).message,
      },
    });
  }
});

// =============================================================================
// POINTS MANAGEMENT
// =============================================================================

/**
 * GET /api/v1/loyalty/members/:id/points
 * Get member points balance and history
 */
router.get('/members/:id/points', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const { id } = req.params;
    const { limit, offset } = req.query;

    const member = await loyaltyEngineService.getMember(id, organizationId);

    if (!member) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'MEMBER_NOT_FOUND',
          message: 'Member not found',
        },
      });
    }

    const history = await loyaltyEngineService.getPointsHistory(
      id,
      organizationId,
      limit ? parseInt(limit as string, 10) : 50,
      offset ? parseInt(offset as string, 10) : 0
    );

    res.json({
      success: true,
      data: {
        balance: member.pointsBalance,
        earnedLifetime: member.pointsEarnedLifetime,
        redeemedLifetime: member.pointsRedeemedLifetime,
        expiredLifetime: member.pointsExpiredLifetime,
        transactions: history.transactions,
      },
      meta: {
        total: history.total,
        limit: limit ? parseInt(limit as string, 10) : 50,
        offset: offset ? parseInt(offset as string, 10) : 0,
      },
    });
  } catch (error) {
    logger.error('Error getting member points:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'POINTS_GET_ERROR',
        message: (error as Error).message,
      },
    });
  }
});

/**
 * POST /api/v1/loyalty/members/:id/points
 * Award points to a member
 */
router.post('/members/:id/points', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const { id } = req.params;
    const { programId, source, sourceId, points, description, metadata, expiryMonths } = req.body;

    if (!programId || !source || points === undefined) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_REQUIRED_FIELDS',
          message: 'Program ID, source, and points are required',
        },
      });
    }

    if (typeof points !== 'number' || points <= 0) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_POINTS',
          message: 'Points must be a positive number',
        },
      });
    }

    const transaction = await loyaltyEngineService.awardPoints({
      memberId: id,
      programId,
      organizationId,
      source,
      sourceId,
      points,
      description,
      metadata,
      expiryMonths,
    });

    res.json({
      success: true,
      data: transaction,
    });
  } catch (error) {
    logger.error('Error awarding points:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'POINTS_AWARD_ERROR',
        message: (error as Error).message,
      },
    });
  }
});

// =============================================================================
// REWARDS CATALOG
// =============================================================================

/**
 * POST /api/v1/loyalty/rewards
 * Create a new reward
 */
router.post('/rewards', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const {
      programId,
      name,
      description,
      type,
      pointsCost,
      discountConfig,
      productConfig,
      customConfig,
      imageUrl,
      status,
      tierRequired,
      stockQuantity,
      redemptionLimit,
      validFrom,
      validUntil,
      displayOrder,
      metadata,
    } = req.body;

    if (!programId || !name || !type || pointsCost === undefined) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_REQUIRED_FIELDS',
          message: 'Program ID, name, type, and points cost are required',
        },
      });
    }

    const reward = await loyaltyEngineService.createReward({
      organizationId,
      programId,
      name,
      description,
      type,
      pointsCost,
      discountConfig,
      productConfig,
      customConfig,
      imageUrl,
      status: status || 'active',
      tierRequired,
      stockQuantity,
      redemptionLimit,
      validFrom: validFrom ? new Date(validFrom) : undefined,
      validUntil: validUntil ? new Date(validUntil) : undefined,
      displayOrder: displayOrder || 0,
      metadata: metadata || {},
    });

    res.json({
      success: true,
      data: reward,
    });
  } catch (error) {
    logger.error('Error creating reward:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'REWARD_CREATE_ERROR',
        message: (error as Error).message,
      },
    });
  }
});

/**
 * GET /api/v1/loyalty/members/:id/rewards
 * Get available rewards for a member
 */
router.get('/members/:id/rewards', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const { id } = req.params;
    const { programId } = req.query;

    if (!programId) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_PROGRAM_ID',
          message: 'Program ID is required',
        },
      });
    }

    const rewards = await loyaltyEngineService.getAvailableRewards(
      id,
      programId as string,
      organizationId
    );

    res.json({
      success: true,
      data: rewards,
    });
  } catch (error) {
    logger.error('Error getting available rewards:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'REWARDS_GET_ERROR',
        message: (error as Error).message,
      },
    });
  }
});

// =============================================================================
// REDEMPTIONS
// =============================================================================

/**
 * POST /api/v1/loyalty/redeem
 * Redeem a reward
 */
router.post('/redeem', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const { memberId, rewardId, programId } = req.body;

    if (!memberId || !rewardId || !programId) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_REQUIRED_FIELDS',
          message: 'Member ID, reward ID, and program ID are required',
        },
      });
    }

    const redemption = await loyaltyEngineService.redeemReward({
      memberId,
      rewardId,
      programId,
      organizationId,
    });

    res.json({
      success: true,
      data: redemption,
    });
  } catch (error) {
    logger.error('Error redeeming reward:', error);
    const statusCode = (error as Error).message.includes('Insufficient points')
      ? 400
      : (error as Error).message.includes('not found')
      ? 404
      : 500;

    res.status(statusCode).json({
      success: false,
      error: {
        code: 'REDEMPTION_ERROR',
        message: (error as Error).message,
      },
    });
  }
});

// =============================================================================
// PERSONALIZED OFFERS
// =============================================================================

/**
 * GET /api/v1/loyalty/members/:id/offers
 * Get personalized offers for a member
 */
router.get('/members/:id/offers', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const { id } = req.params;
    const { programId } = req.query;

    if (!programId) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_PROGRAM_ID',
          message: 'Program ID is required',
        },
      });
    }

    // Get existing offers
    const offers = await loyaltyEngineService.getMemberOffers(
      id,
      programId as string,
      organizationId
    );

    res.json({
      success: true,
      data: offers,
    });
  } catch (error) {
    logger.error('Error getting member offers:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'OFFERS_GET_ERROR',
        message: (error as Error).message,
      },
    });
  }
});

/**
 * POST /api/v1/loyalty/members/:id/offers/generate
 * Generate personalized offers for a member
 */
router.post('/members/:id/offers/generate', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const { id } = req.params;
    const { programId } = req.body;

    if (!programId) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_PROGRAM_ID',
          message: 'Program ID is required',
        },
      });
    }

    const offers = await loyaltyEngineService.generatePersonalizedOffers(
      id,
      programId,
      organizationId
    );

    res.json({
      success: true,
      data: offers,
      meta: {
        generated: offers.length,
      },
    });
  } catch (error) {
    logger.error('Error generating personalized offers:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'OFFERS_GENERATE_ERROR',
        message: (error as Error).message,
      },
    });
  }
});

// =============================================================================
// REFERRAL PROGRAM
// =============================================================================

/**
 * POST /api/v1/loyalty/referrals
 * Process a referral
 */
router.post('/referrals', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const { programId, referralCode, newMemberEmail, purchaseAmount } = req.body;

    if (!programId || !referralCode || !newMemberEmail) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_REQUIRED_FIELDS',
          message: 'Program ID, referral code, and new member email are required',
        },
      });
    }

    const result = await loyaltyEngineService.processReferral(
      programId,
      organizationId,
      referralCode,
      newMemberEmail,
      purchaseAmount
    );

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    logger.error('Error processing referral:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'REFERRAL_ERROR',
        message: (error as Error).message,
      },
    });
  }
});

// =============================================================================
// WEBHOOKS & INTEGRATIONS
// =============================================================================

/**
 * POST /api/v1/loyalty/webhooks/purchase
 * Process a purchase event (for e-commerce integration)
 */
router.post('/webhooks/purchase', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const { programId, email, orderTotal, orderId } = req.body;

    if (!programId || !email || orderTotal === undefined || !orderId) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_REQUIRED_FIELDS',
          message: 'Program ID, email, order total, and order ID are required',
        },
      });
    }

    const transaction = await loyaltyEngineService.processPurchase(
      programId,
      organizationId,
      email,
      orderTotal,
      orderId
    );

    res.json({
      success: true,
      data: transaction,
    });
  } catch (error) {
    logger.error('Error processing purchase webhook:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'PURCHASE_WEBHOOK_ERROR',
        message: (error as Error).message,
      },
    });
  }
});

/**
 * POST /api/v1/loyalty/maintenance
 * Run daily maintenance tasks (expire points, offers, etc.)
 * Internal endpoint - should be called by cron job
 */
router.post('/maintenance', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);

    const result = await loyaltyEngineService.runDailyMaintenance(organizationId);

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    logger.error('Error running loyalty maintenance:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'MAINTENANCE_ERROR',
        message: (error as Error).message,
      },
    });
  }
});

export const loyaltyRoutes = router;
