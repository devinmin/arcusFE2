/**
 * Partner Marketing API Routes
 *
 * Provides endpoints for:
 * - Partner CRUD operations
 * - Co-branded asset generation
 * - MDF tracking and allocation
 * - Partner performance analytics
 * - Channel conflict management
 *
 * Phase 2.2 - Partner/Channel Marketing (B2B Differentiation)
 */

import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { partnerMarketingService } from '../services/partnerMarketingService.js';
import { logger } from '../utils/logger.js';

const router = Router();

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
  const userId = req.user?.id;
  if (!userId) {
    throw new Error('User ID not found');
  }
  return userId;
}

// =============================================================================
// PARTNER CRUD ENDPOINTS
// =============================================================================

/**
 * POST /api/v1/partners
 * Create a new partner
 */
router.post('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const {
      partnerName,
      partnerType,
      tier,
      primaryContactEmail,
      primaryContactName,
      website,
      territories,
      regions,
      verticals,
      annualMdfBudget,
      contractStartDate,
      contractEndDate,
    } = req.body;

    if (!partnerName || !partnerType || !tier) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_INPUT',
          message: 'Partner name, type, and tier are required',
        },
      });
    }

    const partner = await partnerMarketingService.createPartner({
      organizationId,
      partnerName,
      partnerType,
      tier,
      primaryContactEmail,
      primaryContactName,
      website,
      territories,
      regions,
      verticals,
      annualMdfBudget,
      contractStartDate: contractStartDate ? new Date(contractStartDate) : undefined,
      contractEndDate: contractEndDate ? new Date(contractEndDate) : undefined,
    });

    res.status(201).json({
      success: true,
      data: partner,
    });
  } catch (error) {
    logger.error('Create partner error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to create partner',
      },
    });
  }
});

/**
 * GET /api/v1/partners
 * List all partners
 */
router.get('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const { tier, status, partnerType } = req.query;

    const partners = await partnerMarketingService.listPartners(organizationId, {
      tier: tier as any,
      status: status as any,
      partnerType: partnerType as any,
    });

    res.json({
      success: true,
      data: {
        partners,
        total: partners.length,
      },
    });
  } catch (error) {
    logger.error('List partners error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to retrieve partners',
      },
    });
  }
});

/**
 * GET /api/v1/partners/:id
 * Get a specific partner
 */
router.get('/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const { id } = req.params;

    const partner = await partnerMarketingService.getPartner(id, organizationId);

    if (!partner) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Partner not found',
        },
      });
    }

    res.json({
      success: true,
      data: partner,
    });
  } catch (error) {
    logger.error('Get partner error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to retrieve partner',
      },
    });
  }
});

/**
 * PUT /api/v1/partners/:id
 * Update a partner
 */
router.put('/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const { id } = req.params;

    const partner = await partnerMarketingService.updatePartner(
      id,
      organizationId,
      req.body
    );

    if (!partner) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Partner not found',
        },
      });
    }

    res.json({
      success: true,
      data: partner,
    });
  } catch (error) {
    logger.error('Update partner error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to update partner',
      },
    });
  }
});

// =============================================================================
// CO-BRANDED ASSET ENDPOINTS
// =============================================================================

/**
 * POST /api/v1/partners/:id/assets
 * Generate co-branded content for a partner
 */
router.post('/:id/assets', requireAuth, async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const userId = getUserId(req);
    const { id: partnerId } = req.params;
    const {
      assetName,
      assetType,
      coBrandingMethod,
      deliverableId,
      campaignId,
      brandingProfile,
    } = req.body;

    if (!assetName || !assetType) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_INPUT',
          message: 'Asset name and type are required',
        },
      });
    }

    const asset = await partnerMarketingService.createCoBrandedAsset({
      organizationId,
      partnerId,
      assetName,
      assetType,
      coBrandingMethod,
      deliverableId,
      campaignId,
      brandingProfile,
      createdBy: userId,
    });

    res.status(201).json({
      success: true,
      data: asset,
    });
  } catch (error) {
    logger.error('Create co-branded asset error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: (error as Error).message,
      },
    });
  }
});

/**
 * GET /api/v1/partners/:id/assets
 * Get partner assets
 */
router.get('/:id/assets', requireAuth, async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const { id: partnerId } = req.params;
    const { assetType, complianceStatus } = req.query;

    const assets = await partnerMarketingService.getPartnerAssets(
      partnerId,
      organizationId,
      {
        assetType: assetType as any,
        complianceStatus: complianceStatus as any,
      }
    );

    res.json({
      success: true,
      data: {
        assets,
        total: assets.length,
      },
    });
  } catch (error) {
    logger.error('Get partner assets error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to retrieve assets',
      },
    });
  }
});

/**
 * PUT /api/v1/partners/:partnerId/assets/:assetId/approve
 * Approve asset compliance
 */
router.put(
  '/:partnerId/assets/:assetId/approve',
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const organizationId = getOrganizationId(req);
      const userId = getUserId(req);
      const { assetId } = req.params;
      const { notes } = req.body;

      const asset = await partnerMarketingService.approveAssetCompliance(
        assetId,
        organizationId,
        userId,
        notes
      );

      if (!asset) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Asset not found',
          },
        });
      }

      res.json({
        success: true,
        data: asset,
      });
    } catch (error) {
      logger.error('Approve asset compliance error:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to approve asset',
        },
      });
    }
  }
);

// =============================================================================
// MDF ENDPOINTS
// =============================================================================

/**
 * GET /api/v1/partners/:id/mdf
 * Get MDF allocations for a partner
 */
router.get('/:id/mdf', requireAuth, async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const { id: partnerId } = req.params;
    const { status } = req.query;

    const allocations = await partnerMarketingService.getMDFAllocations(
      partnerId,
      organizationId,
      status as string | undefined
    );

    res.json({
      success: true,
      data: {
        allocations,
        total: allocations.length,
      },
    });
  } catch (error) {
    logger.error('Get MDF allocations error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to retrieve MDF allocations',
      },
    });
  }
});

/**
 * POST /api/v1/partners/:id/mdf
 * Create MDF allocation for a partner
 */
router.post('/:id/mdf', requireAuth, async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const userId = getUserId(req);
    const { id: partnerId } = req.params;
    const {
      allocationName,
      fiscalYear,
      fiscalQuarter,
      allocatedAmount,
      currency,
      fundType,
      validFrom,
      validUntil,
      preApprovalRequired,
    } = req.body;

    if (!allocationName || !fiscalYear || !allocatedAmount || !validFrom || !validUntil) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_INPUT',
          message: 'Allocation name, fiscal year, amount, and validity dates are required',
        },
      });
    }

    const allocation = await partnerMarketingService.createMDFAllocation({
      organizationId,
      partnerId,
      allocationName,
      fiscalYear,
      fiscalQuarter,
      allocatedAmount,
      currency,
      fundType,
      validFrom: new Date(validFrom),
      validUntil: new Date(validUntil),
      preApprovalRequired,
      createdBy: userId,
    });

    res.status(201).json({
      success: true,
      data: allocation,
    });
  } catch (error) {
    logger.error('Create MDF allocation error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to create MDF allocation',
      },
    });
  }
});

/**
 * GET /api/v1/partners/:id/mdf/summary
 * Get MDF budget summary for a partner
 */
router.get('/:id/mdf/summary', requireAuth, async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const { id: partnerId } = req.params;
    const fiscalYear = parseInt(req.query.fiscalYear as string) || new Date().getFullYear();

    const summary = await partnerMarketingService.getMDFBudgetSummary(
      partnerId,
      organizationId,
      fiscalYear
    );

    res.json({
      success: true,
      data: {
        fiscalYear,
        ...summary,
      },
    });
  } catch (error) {
    logger.error('Get MDF summary error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to retrieve MDF summary',
      },
    });
  }
});

// =============================================================================
// PARTNER ANALYTICS ENDPOINTS
// =============================================================================

/**
 * GET /api/v1/partners/:id/analytics
 * Get comprehensive partner analytics
 */
router.get('/:id/analytics', requireAuth, async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const { id: partnerId } = req.params;

    const analytics = await partnerMarketingService.getPartnerAnalytics(
      partnerId,
      organizationId
    );

    res.json({
      success: true,
      data: analytics,
    });
  } catch (error) {
    logger.error('Get partner analytics error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: (error as Error).message,
      },
    });
  }
});

/**
 * GET /api/v1/partners/analytics/overview
 * Get analytics overview for all partners
 */
router.get('/analytics/overview', requireAuth, async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);

    const partners = await partnerMarketingService.listPartners(organizationId, {
      status: 'active',
    });

    const analyticsPromises = partners.map((partner) =>
      partnerMarketingService.getPartnerAnalytics(partner.id, organizationId)
    );

    const allAnalytics = await Promise.all(analyticsPromises);

    // Aggregate metrics
    const overview = {
      totalPartners: partners.length,
      partnersByTier: {
        platinum: partners.filter((p) => p.tier === 'platinum').length,
        gold: partners.filter((p) => p.tier === 'gold').length,
        silver: partners.filter((p) => p.tier === 'silver').length,
        bronze: partners.filter((p) => p.tier === 'bronze').length,
        registered: partners.filter((p) => p.tier === 'registered').length,
      },
      totalPerformance: {
        leadsGenerated: allAnalytics.reduce((sum, a) => sum + a.performance.leadsGenerated, 0),
        opportunitiesCreated: allAnalytics.reduce(
          (sum, a) => sum + a.performance.opportunitiesCreated,
          0
        ),
        dealsClosed: allAnalytics.reduce((sum, a) => sum + a.performance.dealsClosed, 0),
        revenueContribution: allAnalytics.reduce(
          (sum, a) => sum + a.performance.revenueContribution,
          0
        ),
      },
      totalMDF: {
        allocated: allAnalytics.reduce((sum, a) => sum + a.mdf.allocatedAmount, 0),
        spent: allAnalytics.reduce((sum, a) => sum + a.mdf.spentAmount, 0),
        available: allAnalytics.reduce((sum, a) => sum + a.mdf.availableAmount, 0),
      },
      topPartners: allAnalytics
        .sort((a, b) => b.performance.revenueContribution - a.performance.revenueContribution)
        .slice(0, 10)
        .map((a) => ({
          partnerId: a.partnerId,
          partnerName: a.partnerName,
          tier: a.tier,
          revenueContribution: a.performance.revenueContribution,
          dealsClosed: a.performance.dealsClosed,
        })),
    };

    res.json({
      success: true,
      data: overview,
    });
  } catch (error) {
    logger.error('Get analytics overview error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to retrieve analytics overview',
      },
    });
  }
});

// =============================================================================
// CHANNEL CONFLICT ENDPOINTS
// =============================================================================

/**
 * GET /api/v1/partners/conflicts
 * Get active channel conflicts
 */
router.get('/conflicts/active', requireAuth, async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);

    const conflicts = await partnerMarketingService.getActiveConflicts(organizationId);

    res.json({
      success: true,
      data: {
        conflicts,
        total: conflicts.length,
      },
    });
  } catch (error) {
    logger.error('Get active conflicts error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to retrieve conflicts',
      },
    });
  }
});

/**
 * POST /api/v1/partners/conflicts/detect
 * Detect potential channel conflicts
 */
router.post('/conflicts/detect', requireAuth, async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const { accountName, territory, partnerIds } = req.body;

    const conflicts = await partnerMarketingService.detectChannelConflicts(
      organizationId,
      {
        accountName,
        territory,
        partnerIds,
      }
    );

    res.json({
      success: true,
      data: {
        conflicts,
        total: conflicts.length,
      },
    });
  } catch (error) {
    logger.error('Detect conflicts error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to detect conflicts',
      },
    });
  }
});

/**
 * PUT /api/v1/partners/conflicts/:id/resolve
 * Resolve a channel conflict
 */
router.put('/conflicts/:id/resolve', requireAuth, async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const userId = getUserId(req);
    const { id: conflictId } = req.params;
    const { resolutionApproach, resolutionNotes } = req.body;

    if (!resolutionApproach || !resolutionNotes) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_INPUT',
          message: 'Resolution approach and notes are required',
        },
      });
    }

    const conflict = await partnerMarketingService.resolveConflict(
      conflictId,
      organizationId,
      {
        resolutionApproach,
        resolutionNotes,
        resolvedBy: userId,
      }
    );

    if (!conflict) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Conflict not found',
        },
      });
    }

    res.json({
      success: true,
      data: conflict,
    });
  } catch (error) {
    logger.error('Resolve conflict error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to resolve conflict',
      },
    });
  }
});

// =============================================================================
// EXPORT
// =============================================================================

export const partnerRoutes = router;
