/**
 * Print & Out-of-Home (OOH) Advertising API Routes
 *
 * Provides endpoints for:
 * - Print-ready file generation
 * - Print template management
 * - Print job tracking
 * - OOH campaign management
 * - OOH placement management
 * - QR code generation and tracking
 * - Vendor management
 *
 * Base URL: /api/v1/print-ooh
 *
 * Phase 4.2 - Print & OOH Advertising Platform
 */

import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requireOrganization, getOrganizationId } from '../middleware/multiTenancy.js';
import { logger } from '../utils/logger.js';
import {
  printOohService,
  MediaType,
  OOHPlacementType,
} from '../services/printOohService.js';

const router = Router();

// Helper to safely get organization ID
function safeGetOrganizationId(req: Request): string {
  const orgId = getOrganizationId(req);
  if (!orgId) {
    throw new Error('Organization ID not found');
  }
  return orgId;
}

// =============================================================================
// PRINT TEMPLATES
// =============================================================================

/**
 * GET /api/v1/print-ooh/templates
 * List print templates
 *
 * Query Parameters:
 *   - mediaType?: MediaType - Filter by media type
 *   - includePublic?: boolean - Include public templates
 */
router.get('/templates', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const organizationId = safeGetOrganizationId(req);
    const { mediaType, includePublic } = req.query;

    const templates = await printOohService.listPrintTemplates(organizationId, {
      mediaType: mediaType as MediaType,
      includePublic: includePublic === 'true',
    });

    res.json({
      success: true,
      data: templates,
    });
  } catch (error) {
    logger.error('Error listing print templates', { error });
    res.status(500).json({
      success: false,
      error: {
        code: 'LIST_TEMPLATES_ERROR',
        message: (error as Error).message,
      },
    });
  }
});

/**
 * POST /api/v1/print-ooh/templates
 * Create a new print template
 *
 * Request Body:
 *   - templateName: string
 *   - mediaType: MediaType
 *   - dimensions: {width, height, unit, orientation?}
 *   - resolutionDpi: number
 *   - colorMode: 'cmyk' | 'rgb' | 'spot' | 'pantone'
 *   - bleedSize?: {top, bottom, left, right, unit}
 *   - safeZone?: {top, bottom, left, right, unit}
 *   - fileFormats: string[]
 *   - vendorRequirements?: object
 *   - isPublic?: boolean
 *   - tags?: string[]
 *   - notes?: string
 */
router.post('/templates', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const organizationId = safeGetOrganizationId(req);
    const templateData = req.body;

    // Validate required fields
    if (!templateData.templateName) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_TEMPLATE_NAME', message: 'Template name is required' },
      });
    }

    if (!templateData.mediaType) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_MEDIA_TYPE', message: 'Media type is required' },
      });
    }

    if (!templateData.dimensions) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_DIMENSIONS', message: 'Dimensions are required' },
      });
    }

    const template = await printOohService.createPrintTemplate(organizationId, {
      templateName: templateData.templateName,
      mediaType: templateData.mediaType,
      dimensions: templateData.dimensions,
      resolutionDpi: templateData.resolutionDpi || 300,
      colorMode: templateData.colorMode || 'cmyk',
      bleedSize: templateData.bleedSize,
      safeZone: templateData.safeZone,
      fileFormats: templateData.fileFormats || ['pdf', 'eps', 'ai', 'tiff'],
      vendorRequirements: templateData.vendorRequirements || {},
      isPublic: templateData.isPublic || false,
      tags: templateData.tags || [],
      notes: templateData.notes,
    });

    res.status(201).json({
      success: true,
      data: template,
    });
  } catch (error) {
    logger.error('Error creating print template', { error });
    res.status(500).json({
      success: false,
      error: {
        code: 'CREATE_TEMPLATE_ERROR',
        message: (error as Error).message,
      },
    });
  }
});

/**
 * GET /api/v1/print-ooh/templates/:id
 * Get print template by ID
 */
router.get('/templates/:id', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const organizationId = safeGetOrganizationId(req);
    const { id } = req.params;

    const template = await printOohService.getPrintTemplate(id, organizationId);

    if (!template) {
      return res.status(404).json({
        success: false,
        error: { code: 'TEMPLATE_NOT_FOUND', message: 'Template not found' },
      });
    }

    res.json({
      success: true,
      data: template,
    });
  } catch (error) {
    logger.error('Error getting print template', { error });
    res.status(500).json({
      success: false,
      error: {
        code: 'GET_TEMPLATE_ERROR',
        message: (error as Error).message,
      },
    });
  }
});

// =============================================================================
// PRINT-READY FILE GENERATION
// =============================================================================

/**
 * POST /api/v1/print-ooh/print/generate
 * Generate print-ready file from source image
 *
 * Request Body:
 *   - sourceImageUrl: string - URL of source image
 *   - templateId: string - Print template ID
 *   - outputFormat?: 'pdf' | 'eps' | 'ai' | 'tiff'
 *   - colorMode?: 'cmyk' | 'rgb' | 'spot' | 'pantone'
 *   - includeBleed?: boolean
 *   - includeTrimMarks?: boolean
 *   - includeColorBars?: boolean
 *   - embedFonts?: boolean
 */
router.post('/print/generate', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const organizationId = safeGetOrganizationId(req);
    const {
      sourceImageUrl,
      templateId,
      outputFormat,
      colorMode,
      includeBleed,
      includeTrimMarks,
      includeColorBars,
      embedFonts,
    } = req.body;

    if (!sourceImageUrl) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_SOURCE_IMAGE', message: 'Source image URL is required' },
      });
    }

    if (!templateId) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_TEMPLATE_ID', message: 'Template ID is required' },
      });
    }

    const result = await printOohService.generatePrintReadyFile(organizationId, {
      sourceImageUrl,
      templateId,
      outputFormat,
      colorMode,
      includeBleed,
      includeTrimMarks,
      includeColorBars,
      embedFonts,
    });

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'GENERATION_FAILED',
          message: 'Failed to generate print-ready file',
          details: result.errors,
        },
      });
    }

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    logger.error('Error generating print-ready file', { error });
    res.status(500).json({
      success: false,
      error: {
        code: 'GENERATION_ERROR',
        message: (error as Error).message,
      },
    });
  }
});

// =============================================================================
// PRINT JOBS
// =============================================================================

/**
 * POST /api/v1/print-ooh/print/jobs
 * Create a new print job
 *
 * Request Body:
 *   - jobName: string
 *   - jobType: 'print' | 'digital_display' | 'hybrid'
 *   - specification: object
 *   - deliverableId?: string
 *   - templateId?: string
 *   - printReadyUrl?: string
 *   - vendor?: string
 *   - quantity?: number
 *   - shippingAddress?: object
 */
router.post('/print/jobs', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const organizationId = safeGetOrganizationId(req);
    const jobData = req.body;

    if (!jobData.jobName) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_JOB_NAME', message: 'Job name is required' },
      });
    }

    if (!jobData.specification) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_SPECIFICATION', message: 'Specification is required' },
      });
    }

    const job = await printOohService.createPrintJob(organizationId, {
      jobName: jobData.jobName,
      jobType: jobData.jobType || 'print',
      specification: jobData.specification,
      deliverableId: jobData.deliverableId,
      templateId: jobData.templateId,
      printReadyUrl: jobData.printReadyUrl,
      printReadyHash: jobData.printReadyHash,
      proofUrl: jobData.proofUrl,
      sourceFiles: jobData.sourceFiles || [],
      proofStatus: 'pending',
      revisions: [],
      vendor: jobData.vendor,
      vendorOrderId: jobData.vendorOrderId,
      quantity: jobData.quantity,
      unitCost: jobData.unitCost,
      totalCost: jobData.totalCost,
      currency: jobData.currency || 'USD',
      shippingAddress: jobData.shippingAddress,
      status: 'created',
      notes: jobData.notes,
      tags: jobData.tags || [],
    });

    res.status(201).json({
      success: true,
      data: job,
    });
  } catch (error) {
    logger.error('Error creating print job', { error });
    res.status(500).json({
      success: false,
      error: {
        code: 'CREATE_JOB_ERROR',
        message: (error as Error).message,
      },
    });
  }
});

/**
 * GET /api/v1/print-ooh/print/jobs/:id
 * Get print job by ID
 */
router.get('/print/jobs/:id', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const organizationId = safeGetOrganizationId(req);
    const { id } = req.params;

    const job = await printOohService.getPrintJob(id, organizationId);

    if (!job) {
      return res.status(404).json({
        success: false,
        error: { code: 'JOB_NOT_FOUND', message: 'Print job not found' },
      });
    }

    res.json({
      success: true,
      data: job,
    });
  } catch (error) {
    logger.error('Error getting print job', { error });
    res.status(500).json({
      success: false,
      error: {
        code: 'GET_JOB_ERROR',
        message: (error as Error).message,
      },
    });
  }
});

/**
 * PATCH /api/v1/print-ooh/print/jobs/:id
 * Update print job
 */
router.patch('/print/jobs/:id', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const organizationId = safeGetOrganizationId(req);
    const { id } = req.params;
    const updates = req.body;

    const job = await printOohService.updatePrintJob(id, organizationId, updates);

    res.json({
      success: true,
      data: job,
    });
  } catch (error) {
    logger.error('Error updating print job', { error });
    res.status(500).json({
      success: false,
      error: {
        code: 'UPDATE_JOB_ERROR',
        message: (error as Error).message,
      },
    });
  }
});

// =============================================================================
// OOH CAMPAIGNS
// =============================================================================

/**
 * POST /api/v1/print-ooh/ooh/campaigns
 * Create a new OOH campaign
 *
 * Request Body:
 *   - campaignName: string
 *   - startDate: date
 *   - endDate: date
 *   - campaignObjective?: string
 *   - totalBudget?: number
 *   - targetMarkets?: array
 *   - creativeStrategy?: string
 *   - impressionGoal?: number
 *   - reachGoal?: number
 *   - frequencyGoal?: number
 */
router.post('/ooh/campaigns', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const organizationId = safeGetOrganizationId(req);
    const campaignData = req.body;

    if (!campaignData.campaignName) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_CAMPAIGN_NAME', message: 'Campaign name is required' },
      });
    }

    if (!campaignData.startDate || !campaignData.endDate) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_DATES', message: 'Start date and end date are required' },
      });
    }

    const campaign = await printOohService.createOOHCampaign(organizationId, {
      campaignId: campaignData.campaignId,
      campaignName: campaignData.campaignName,
      campaignObjective: campaignData.campaignObjective,
      startDate: new Date(campaignData.startDate),
      endDate: new Date(campaignData.endDate),
      totalBudget: campaignData.totalBudget,
      currency: campaignData.currency || 'USD',
      spendToDate: 0,
      targetMarkets: campaignData.targetMarkets || [],
      creativeStrategy: campaignData.creativeStrategy,
      creativeVariants: campaignData.creativeVariants || [],
      impressionGoal: campaignData.impressionGoal,
      reachGoal: campaignData.reachGoal,
      frequencyGoal: campaignData.frequencyGoal,
      totalImpressions: 0,
      totalReach: 0,
      averageFrequency: 0,
      status: 'planning',
      tags: campaignData.tags || [],
      notes: campaignData.notes,
    });

    res.status(201).json({
      success: true,
      data: campaign,
    });
  } catch (error) {
    logger.error('Error creating OOH campaign', { error });
    res.status(500).json({
      success: false,
      error: {
        code: 'CREATE_CAMPAIGN_ERROR',
        message: (error as Error).message,
      },
    });
  }
});

/**
 * GET /api/v1/print-ooh/ooh/campaigns/:id
 * Get OOH campaign by ID
 */
router.get('/ooh/campaigns/:id', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const organizationId = safeGetOrganizationId(req);
    const { id } = req.params;

    const campaign = await printOohService.getOOHCampaign(id, organizationId);

    if (!campaign) {
      return res.status(404).json({
        success: false,
        error: { code: 'CAMPAIGN_NOT_FOUND', message: 'OOH campaign not found' },
      });
    }

    res.json({
      success: true,
      data: campaign,
    });
  } catch (error) {
    logger.error('Error getting OOH campaign', { error });
    res.status(500).json({
      success: false,
      error: {
        code: 'GET_CAMPAIGN_ERROR',
        message: (error as Error).message,
      },
    });
  }
});

// =============================================================================
// OOH PLACEMENTS
// =============================================================================

/**
 * GET /api/v1/print-ooh/ooh/placements
 * List OOH placements
 *
 * Query Parameters:
 *   - campaignId?: string - Filter by campaign
 *   - placementType?: OOHPlacementType - Filter by placement type
 *   - status?: string - Filter by status
 */
router.get('/ooh/placements', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const organizationId = safeGetOrganizationId(req);
    const { campaignId, placementType, status } = req.query;

    const placements = await printOohService.getOOHPlacements(organizationId, {
      campaignId: campaignId as string,
      placementType: placementType as OOHPlacementType,
      status: status as string,
    });

    res.json({
      success: true,
      data: placements,
    });
  } catch (error) {
    logger.error('Error listing OOH placements', { error });
    res.status(500).json({
      success: false,
      error: {
        code: 'LIST_PLACEMENTS_ERROR',
        message: (error as Error).message,
      },
    });
  }
});

/**
 * POST /api/v1/print-ooh/ooh/placements
 * Create a new OOH placement
 *
 * Request Body:
 *   - placementType: OOHPlacementType
 *   - dimensions: {width, height, unit}
 *   - campaignId?: string
 *   - vendor?: string
 *   - locationName?: string
 *   - geoCoordinates?: {latitude, longitude, address, city, state}
 *   - startDate?: date
 *   - endDate?: date
 *   - impressionsEstimated?: number
 *   - cost?: number
 */
router.post('/ooh/placements', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const organizationId = safeGetOrganizationId(req);
    const placementData = req.body;

    if (!placementData.placementType) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_PLACEMENT_TYPE', message: 'Placement type is required' },
      });
    }

    if (!placementData.dimensions) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_DIMENSIONS', message: 'Dimensions are required' },
      });
    }

    const placement = await printOohService.createOOHPlacement(organizationId, {
      campaignId: placementData.campaignId,
      placementType: placementData.placementType,
      vendor: placementData.vendor,
      vendorId: placementData.vendorId,
      locationName: placementData.locationName,
      locationDescription: placementData.locationDescription,
      geoCoordinates: placementData.geoCoordinates,
      dimensions: placementData.dimensions,
      startDate: placementData.startDate ? new Date(placementData.startDate) : undefined,
      endDate: placementData.endDate ? new Date(placementData.endDate) : undefined,
      impressionsEstimated: placementData.impressionsEstimated,
      impressionsActual: placementData.impressionsActual,
      viewabilityScore: placementData.viewabilityScore,
      cost: placementData.cost,
      currency: placementData.currency || 'USD',
      costPerThousand: placementData.costPerThousand,
      creativeId: placementData.creativeId,
      creativeUrl: placementData.creativeUrl,
      status: 'planned',
      notes: placementData.notes,
      tags: placementData.tags || [],
    });

    res.status(201).json({
      success: true,
      data: placement,
    });
  } catch (error) {
    logger.error('Error creating OOH placement', { error });
    res.status(500).json({
      success: false,
      error: {
        code: 'CREATE_PLACEMENT_ERROR',
        message: (error as Error).message,
      },
    });
  }
});

/**
 * POST /api/v1/print-ooh/ooh/locations/recommend
 * Get OOH location recommendations
 *
 * Request Body:
 *   - targetMarkets: string[]
 *   - budget: number
 *   - startDate: date
 *   - endDate: date
 *   - placementTypes?: OOHPlacementType[]
 *   - targetDemographics?: object
 *   - impressionGoal?: number
 */
router.post('/ooh/locations/recommend', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const organizationId = safeGetOrganizationId(req);
    const {
      targetMarkets,
      budget,
      startDate,
      endDate,
      placementTypes,
      targetDemographics,
      impressionGoal,
    } = req.body;

    if (!targetMarkets || !Array.isArray(targetMarkets) || targetMarkets.length === 0) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_TARGET_MARKETS', message: 'Target markets are required' },
      });
    }

    if (!budget || budget <= 0) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_BUDGET', message: 'Valid budget is required' },
      });
    }

    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_DATES', message: 'Start date and end date are required' },
      });
    }

    const recommendations = await printOohService.getOOHLocationRecommendations(organizationId, {
      targetMarkets,
      budget,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      placementTypes,
      targetDemographics,
      impressionGoal,
    });

    res.json({
      success: true,
      data: recommendations,
    });
  } catch (error) {
    logger.error('Error getting OOH location recommendations', { error });
    res.status(500).json({
      success: false,
      error: {
        code: 'RECOMMENDATIONS_ERROR',
        message: (error as Error).message,
      },
    });
  }
});

// =============================================================================
// QR CODE GENERATION
// =============================================================================

/**
 * POST /api/v1/print-ooh/qr-codes
 * Generate QR code for print/OOH campaign
 *
 * Request Body:
 *   - destinationUrl: string - The URL the QR code points to
 *   - printJobId?: string - Link to print job
 *   - oohPlacementId?: string - Link to OOH placement
 *   - campaignId?: string - Link to campaign
 *   - utmParams?: {source, medium, campaign, content, term}
 *   - expiresAt?: date
 */
router.post('/qr-codes', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const organizationId = safeGetOrganizationId(req);
    const {
      destinationUrl,
      printJobId,
      oohPlacementId,
      campaignId,
      utmParams,
      expiresAt,
    } = req.body;

    if (!destinationUrl) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_DESTINATION_URL', message: 'Destination URL is required' },
      });
    }

    const qrCode = await printOohService.generateQRCode(organizationId, destinationUrl, {
      printJobId,
      oohPlacementId,
      campaignId,
      utmParams,
      expiresAt: expiresAt ? new Date(expiresAt) : undefined,
    });

    res.status(201).json({
      success: true,
      data: qrCode,
    });
  } catch (error) {
    logger.error('Error generating QR code', { error });
    res.status(500).json({
      success: false,
      error: {
        code: 'QR_CODE_ERROR',
        message: (error as Error).message,
      },
    });
  }
});

/**
 * GET /api/v1/print-ooh/qr-codes/:id/analytics
 * Get QR code analytics
 */
router.get('/qr-codes/:id/analytics', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const organizationId = safeGetOrganizationId(req);
    const { id } = req.params;

    const analytics = await printOohService.getQRCodeAnalytics(id, organizationId);

    if (!analytics) {
      return res.status(404).json({
        success: false,
        error: { code: 'QR_CODE_NOT_FOUND', message: 'QR code not found' },
      });
    }

    res.json({
      success: true,
      data: analytics,
    });
  } catch (error) {
    logger.error('Error getting QR code analytics', { error });
    res.status(500).json({
      success: false,
      error: {
        code: 'ANALYTICS_ERROR',
        message: (error as Error).message,
      },
    });
  }
});

/**
 * POST /api/v1/print-ooh/qr-codes/:shortCode/scan
 * Track QR code scan (public endpoint, no auth required)
 */
router.post('/qr-codes/:shortCode/scan', async (req: Request, res: Response) => {
  try {
    const { shortCode } = req.params;
    const scanData = req.body;

    await printOohService.trackQRCodeScan(shortCode, scanData);

    res.json({
      success: true,
      message: 'Scan tracked',
    });
  } catch (error) {
    logger.error('Error tracking QR code scan', { error });
    res.status(500).json({
      success: false,
      error: {
        code: 'SCAN_TRACKING_ERROR',
        message: (error as Error).message,
      },
    });
  }
});

// =============================================================================
// VENDOR MANAGEMENT
// =============================================================================

/**
 * GET /api/v1/print-ooh/vendors
 * List vendor specifications
 *
 * Query Parameters:
 *   - vendorType?: 'print' | 'ooh' | 'both'
 */
router.get('/vendors', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const organizationId = safeGetOrganizationId(req);
    const { vendorType } = req.query;

    const vendors = await printOohService.getVendorSpecs(
      organizationId,
      vendorType as 'print' | 'ooh' | 'both'
    );

    res.json({
      success: true,
      data: vendors,
    });
  } catch (error) {
    logger.error('Error listing vendors', { error });
    res.status(500).json({
      success: false,
      error: {
        code: 'LIST_VENDORS_ERROR',
        message: (error as Error).message,
      },
    });
  }
});

/**
 * POST /api/v1/print-ooh/vendors
 * Create vendor specification
 *
 * Request Body:
 *   - vendorName: string
 *   - vendorType: 'print' | 'ooh' | 'both'
 *   - contactInfo?: object
 *   - printSpecs?: object
 *   - oohSpecs?: object
 *   - pricingInfo?: object
 *   - preferredVendor?: boolean
 *   - qualityRating?: number
 */
router.post('/vendors', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const organizationId = safeGetOrganizationId(req);
    const vendorData = req.body;

    if (!vendorData.vendorName) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_VENDOR_NAME', message: 'Vendor name is required' },
      });
    }

    if (!vendorData.vendorType) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_VENDOR_TYPE', message: 'Vendor type is required' },
      });
    }

    const vendor = await printOohService.createVendorSpec(organizationId, {
      vendorName: vendorData.vendorName,
      vendorType: vendorData.vendorType,
      contactInfo: vendorData.contactInfo || {},
      printSpecs: vendorData.printSpecs || {},
      oohSpecs: vendorData.oohSpecs || {},
      pricingInfo: vendorData.pricingInfo || {},
      preferredVendor: vendorData.preferredVendor || false,
      qualityRating: vendorData.qualityRating,
      lastOrderDate: vendorData.lastOrderDate,
      totalOrders: 0,
      status: 'active',
      notes: vendorData.notes,
    });

    res.status(201).json({
      success: true,
      data: vendor,
    });
  } catch (error) {
    logger.error('Error creating vendor', { error });
    res.status(500).json({
      success: false,
      error: {
        code: 'CREATE_VENDOR_ERROR',
        message: (error as Error).message,
      },
    });
  }
});

// =============================================================================
// EXPORT
// =============================================================================

export const printOohRoutes = router;
