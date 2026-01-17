/**
 * Trade Marketing API Routes
 *
 * Provides endpoints for:
 * - Retailer profile management
 * - Trade promotion planning
 * - Retailer-specific asset generation
 * - Promotion calendar
 * - Co-op spend analysis
 *
 * Phase 4.1 - Trade Marketing for CPG
 */

import { Router, Request, Response, NextFunction } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { tradeMarketingService } from '../services/tradeMarketingService.js';
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

// =============================================================================
// RETAILER MANAGEMENT
// =============================================================================

/**
 * GET /api/v1/trade/retailers
 * List all retailers
 */
router.get('/retailers', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const { retailerType, status, relationshipTier } = req.query;

    const retailers = await tradeMarketingService.listRetailers(organizationId, {
      retailerType: retailerType as string,
      status: status as string,
      relationshipTier: relationshipTier as string,
    });

    res.json({
      success: true,
      data: retailers,
    });
  } catch (error) {
    logger.error('Error listing retailers:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'RETAILER_LIST_ERROR',
        message: (error as Error).message,
      },
    });
  }
});

/**
 * POST /api/v1/trade/retailers
 * Create a new retailer profile
 */
router.post('/retailers', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const retailer = await tradeMarketingService.createRetailer(organizationId, req.body);

    res.status(201).json({
      success: true,
      data: retailer,
    });
  } catch (error) {
    logger.error('Error creating retailer:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'RETAILER_CREATE_ERROR',
        message: (error as Error).message,
      },
    });
  }
});

/**
 * GET /api/v1/trade/retailers/:id
 * Get retailer details
 */
router.get('/retailers/:id', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const { id } = req.params;

    const retailer = await tradeMarketingService.getRetailer(id, organizationId);

    if (!retailer) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'RETAILER_NOT_FOUND',
          message: 'Retailer not found',
        },
      });
    }

    res.json({
      success: true,
      data: retailer,
    });
  } catch (error) {
    logger.error('Error getting retailer:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'RETAILER_GET_ERROR',
        message: (error as Error).message,
      },
    });
  }
});

/**
 * PUT /api/v1/trade/retailers/:id
 * Update retailer profile
 */
router.put('/retailers/:id', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const { id } = req.params;

    const retailer = await tradeMarketingService.updateRetailer(id, organizationId, req.body);

    res.json({
      success: true,
      data: retailer,
    });
  } catch (error) {
    logger.error('Error updating retailer:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'RETAILER_UPDATE_ERROR',
        message: (error as Error).message,
      },
    });
  }
});

/**
 * GET /api/v1/trade/retailers/:id/category-insights
 * Get category insights for a retailer
 */
router.get(
  '/retailers/:id/category-insights',
  requireAuth,
  requireOrganization,
  async (req: Request, res: Response) => {
    try {
      const organizationId = getOrganizationId(req);
      const { id } = req.params;
      const { category } = req.query;

      if (!category) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'MISSING_CATEGORY',
            message: 'Category parameter is required',
          },
        });
      }

      const insights = await tradeMarketingService.getCategoryInsights(
        organizationId,
        id,
        category as string
      );

      res.json({
        success: true,
        data: insights,
      });
    } catch (error) {
      logger.error('Error getting category insights:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'CATEGORY_INSIGHTS_ERROR',
          message: (error as Error).message,
        },
      });
    }
  }
);

// =============================================================================
// TRADE PROMOTIONS
// =============================================================================

/**
 * POST /api/v1/trade/promotions
 * Create a new trade promotion
 */
router.post('/promotions', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);

    // Convert date strings to Date objects
    const input = {
      ...req.body,
      startDate: new Date(req.body.startDate),
      endDate: new Date(req.body.endDate),
      submissionDeadline: req.body.submissionDeadline
        ? new Date(req.body.submissionDeadline)
        : undefined,
    };

    const promotion = await tradeMarketingService.createPromotion(organizationId, input);

    res.status(201).json({
      success: true,
      data: promotion,
    });
  } catch (error) {
    logger.error('Error creating promotion:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'PROMOTION_CREATE_ERROR',
        message: (error as Error).message,
      },
    });
  }
});

// =============================================================================
// RETAILER-SPECIFIC ASSET GENERATION
// =============================================================================

/**
 * POST /api/v1/trade/assets/generate
 * Generate retailer-specific asset
 */
router.post(
  '/assets/generate',
  requireAuth,
  requireOrganization,
  async (req: Request, res: Response) => {
    try {
      const organizationId = getOrganizationId(req);
      const { retailerId, promotionId, assetType, name, description, products, customPrompt } =
        req.body;

      if (!retailerId || !assetType || !name) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'MISSING_REQUIRED_FIELDS',
            message: 'retailerId, assetType, and name are required',
          },
        });
      }

      const asset = await tradeMarketingService.generateRetailerAsset(organizationId, {
        retailerId,
        promotionId,
        assetType,
        name,
        description,
        products,
        customPrompt,
      });

      res.status(201).json({
        success: true,
        data: asset,
        message: 'Asset generation request created. The asset will be generated by the creative pipeline.',
      });
    } catch (error) {
      logger.error('Error generating retailer asset:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'ASSET_GENERATION_ERROR',
          message: (error as Error).message,
        },
      });
    }
  }
);

/**
 * GET /api/v1/trade/retailers/:id/assets
 * List assets for a retailer
 */
router.get(
  '/retailers/:id/assets',
  requireAuth,
  requireOrganization,
  async (req: Request, res: Response) => {
    try {
      const organizationId = getOrganizationId(req);
      const { id } = req.params;
      const { assetType, promotionId, status, approvalStatus } = req.query;

      const assets = await tradeMarketingService.listRetailerAssets(organizationId, id, {
        assetType: assetType as string,
        promotionId: promotionId as string,
        status: status as string,
        approvalStatus: approvalStatus as string,
      });

      res.json({
        success: true,
        data: assets,
      });
    } catch (error) {
      logger.error('Error listing retailer assets:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'ASSET_LIST_ERROR',
          message: (error as Error).message,
        },
      });
    }
  }
);

// =============================================================================
// PROMOTION CALENDAR
// =============================================================================

/**
 * GET /api/v1/trade/calendar
 * Get promotion calendar
 */
router.get('/calendar', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const { year, quarter, month } = req.query;

    if (!year) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_YEAR',
          message: 'Year parameter is required',
        },
      });
    }

    const calendar = await tradeMarketingService.getPromotionCalendar(
      organizationId,
      parseInt(year as string),
      quarter ? parseInt(quarter as string) : undefined,
      month ? parseInt(month as string) : undefined
    );

    res.json({
      success: true,
      data: calendar,
    });
  } catch (error) {
    logger.error('Error getting promotion calendar:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'CALENDAR_ERROR',
        message: (error as Error).message,
      },
    });
  }
});

// =============================================================================
// CO-OP SPEND TRACKING
// =============================================================================

/**
 * POST /api/v1/trade/funds
 * Create a trade fund entry
 */
router.post('/funds', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);

    // Convert date strings to Date objects
    const input = {
      ...req.body,
      startDate: new Date(req.body.startDate),
      endDate: new Date(req.body.endDate),
    };

    const fund = await tradeMarketingService.createTradeFund(organizationId, input);

    res.status(201).json({
      success: true,
      data: fund,
    });
  } catch (error) {
    logger.error('Error creating trade fund:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'FUND_CREATE_ERROR',
        message: (error as Error).message,
      },
    });
  }
});

/**
 * GET /api/v1/trade/spend-analysis
 * Get spend analysis
 */
router.get(
  '/spend-analysis',
  requireAuth,
  requireOrganization,
  async (req: Request, res: Response) => {
    try {
      const organizationId = getOrganizationId(req);
      const { fiscalYear, fiscalQuarter } = req.query;

      if (!fiscalYear) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'MISSING_FISCAL_YEAR',
            message: 'fiscalYear parameter is required',
          },
        });
      }

      const analysis = await tradeMarketingService.getSpendAnalysis(
        organizationId,
        parseInt(fiscalYear as string),
        fiscalQuarter ? parseInt(fiscalQuarter as string) : undefined
      );

      res.json({
        success: true,
        data: analysis,
      });
    } catch (error) {
      logger.error('Error getting spend analysis:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'SPEND_ANALYSIS_ERROR',
          message: (error as Error).message,
        },
      });
    }
  }
);

// =============================================================================
// EXPORT
// =============================================================================

export const tradeMarketingRoutes = router;
