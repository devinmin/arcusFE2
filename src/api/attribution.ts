/**
 * Attribution Routes
 *
 * Phase 6: API endpoints for attribution tracking and conversion measurement.
 * Protected by requireZoFeature('attributionTracking') middleware.
 *
 * Cross-Channel Attribution Engine: Unified attribution that connects every touchpoint to revenue
 * using 6 attribution models (first_touch, last_touch, linear, time_decay, position_based, data_driven)
 */

import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requireOrganization, getOrganizationId } from '../middleware/multiTenancy.js';
import { requireZoFeature } from '../middleware/featureFlags.js';
import { attributionService, TrackTouchInput, RecordConversionInput } from '../services/attributionService.js';
import { crossChannelAttribution } from '../services/crossChannelAttributionService.js';
import { logger } from '../utils/logger.js';

const router = Router();

// ============================================================================
// PUBLIC TRACKING ENDPOINT (for client-side tracking)
// ============================================================================

/**
 * POST /api/attribution/track
 * Record an attribution touch (public endpoint for tracking scripts)
 *
 * This endpoint is intentionally public to allow client-side tracking.
 * The organizationId is required in the body and validated.
 */
router.post('/track', async (req: Request, res: Response) => {
  try {
    const {
      organizationId,
      visitorId,
      touchType,
      channel,
      campaignId,
      utmSource,
      utmMedium,
      utmCampaign,
      utmContent,
      utmTerm,
      landingPage,
      referrer,
      deviceType,
      sessionId,
    } = req.body;

    if (!organizationId) {
      return res.status(400).json({ error: 'organizationId is required' });
    }

    if (!visitorId) {
      return res.status(400).json({ error: 'visitorId is required' });
    }

    if (!touchType) {
      return res.status(400).json({ error: 'touchType is required' });
    }

    const touchId = await attributionService.trackTouch(organizationId, {
      visitorId,
      touchType,
      channel,
      campaignId,
      utmSource,
      utmMedium,
      utmCampaign,
      utmContent,
      utmTerm,
      landingPage,
      referrer,
      deviceType,
      sessionId,
    });

    res.status(201).json({ touchId });
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('[AttributionRoutes] Error tracking touch', { error });
    res.status(500).json({ error: 'Failed to track touch' });
  }
});

// ============================================================================
// AUTHENTICATED ENDPOINTS
// ============================================================================

/**
 * GET /api/attribution/touches
 * Get attribution touches with filters
 */
router.get(
  '/touches',
  requireAuth,
  requireOrganization,
  requireZoFeature('attributionTracking'),
  async (req: Request, res: Response) => {
    try {
      const organizationId = getOrganizationId(req)!; // Guaranteed by requireOrganization
      const {
        visitorId,
        leadId,
        campaignId,
        dateFrom,
        dateTo,
        limit,
        offset,
      } = req.query;

      const result = await attributionService.getTouches(organizationId, {
        visitorId: visitorId as string,
        leadId: leadId as string,
        campaignId: campaignId as string,
        dateFrom: dateFrom ? new Date(dateFrom as string) : undefined,
        dateTo: dateTo ? new Date(dateTo as string) : undefined,
        limit: limit ? parseInt(limit as string, 10) : undefined,
        offset: offset ? parseInt(offset as string, 10) : undefined,
      });

      res.json(result);
    } catch (error: unknown) {
    const err = error as Error;
      logger.error('[AttributionRoutes] Error getting touches', { error });
      res.status(500).json({ error: 'Failed to get touches' });
    }
  }
);

/**
 * POST /api/attribution/conversions
 * Record a conversion (authenticated - usually from form submissions or backend)
 */
router.post(
  '/conversions',
  requireAuth,
  requireOrganization,
  requireZoFeature('attributionTracking'),
  async (req: Request, res: Response) => {
    try {
      const organizationId = getOrganizationId(req)!; // Guaranteed by requireOrganization
      const {
        visitorId,
        leadId,
        conversionType,
        conversionValue,
        currency,
        attributionModel,
        sourceFormId,
        sourcePage,
      } = req.body;

      if (!conversionType) {
        return res.status(400).json({ error: 'conversionType is required' });
      }

      const conversion = await attributionService.recordConversion(
        organizationId,
        {
          visitorId,
          leadId,
          conversionType,
          conversionValue,
          currency,
          attributionModel,
          sourceFormId,
          sourcePage,
        }
      );

      res.status(201).json(conversion);
    } catch (error: unknown) {
    const err = error as Error;
      logger.error('[AttributionRoutes] Error recording conversion', { error });
      res.status(500).json({ error: 'Failed to record conversion' });
    }
  }
);

/**
 * GET /api/attribution/conversions
 * Get conversions with filters
 */
router.get(
  '/conversions',
  requireAuth,
  requireOrganization,
  requireZoFeature('attributionTracking'),
  async (req: Request, res: Response) => {
    try {
      const organizationId = getOrganizationId(req)!; // Guaranteed by requireOrganization
      const {
        leadId,
        conversionType,
        dateFrom,
        dateTo,
        limit,
        offset,
      } = req.query;

      const result = await attributionService.getConversions(organizationId, {
        leadId: leadId as string,
        conversionType: conversionType as any,
        dateFrom: dateFrom ? new Date(dateFrom as string) : undefined,
        dateTo: dateTo ? new Date(dateTo as string) : undefined,
        limit: limit ? parseInt(limit as string, 10) : undefined,
        offset: offset ? parseInt(offset as string, 10) : undefined,
      });

      res.json(result);
    } catch (error: unknown) {
    const err = error as Error;
      logger.error('[AttributionRoutes] Error getting conversions', { error });
      res.status(500).json({ error: 'Failed to get conversions' });
    }
  }
);

/**
 * GET /api/attribution/summary
 * Get attribution summary by channel
 */
router.get(
  '/summary',
  requireAuth,
  requireOrganization,
  requireZoFeature('attributionTracking'),
  async (req: Request, res: Response) => {
    try {
      const organizationId = getOrganizationId(req)!; // Guaranteed by requireOrganization
      const { dateFrom, dateTo, model } = req.query;

      const summary = await attributionService.getAttributionSummary(
        organizationId,
        {
          dateFrom: dateFrom ? new Date(dateFrom as string) : undefined,
          dateTo: dateTo ? new Date(dateTo as string) : undefined,
          model: model as any,
        }
      );

      res.json({ channels: summary });
    } catch (error: unknown) {
    const err = error as Error;
      logger.error('[AttributionRoutes] Error getting summary', { error });
      res.status(500).json({ error: 'Failed to get attribution summary' });
    }
  }
);

/**
 * GET /api/attribution/journey/:leadId
 * Get the full customer journey for a lead
 */
router.get(
  '/journey/:leadId',
  requireAuth,
  requireOrganization,
  requireZoFeature('attributionTracking'),
  async (req: Request, res: Response) => {
    try {
      const organizationId = getOrganizationId(req)!; // Guaranteed by requireOrganization
      const { leadId } = req.params;

      const journey = await attributionService.getCustomerJourney(
        organizationId,
        leadId
      );

      res.json(journey);
    } catch (error: unknown) {
    const err = error as Error;
      logger.error('[AttributionRoutes] Error getting journey', { error });
      res.status(500).json({ error: 'Failed to get customer journey' });
    }
  }
);

/**
 * POST /api/attribution/link
 * Link a visitor to a lead (called after lead identification)
 */
router.post(
  '/link',
  requireAuth,
  requireOrganization,
  requireZoFeature('attributionTracking'),
  async (req: Request, res: Response) => {
    try {
      const { visitorId, leadId } = req.body;

      if (!visitorId || !leadId) {
        return res.status(400).json({ error: 'visitorId and leadId are required' });
      }

      const updatedCount = await attributionService.linkVisitorToLead(
        visitorId,
        leadId
      );

      res.json({ linked: updatedCount });
    } catch (error: unknown) {
    const err = error as Error;
      logger.error('[AttributionRoutes] Error linking visitor', { error });
      res.status(500).json({ error: 'Failed to link visitor to lead' });
    }
  }
);

// ============================================================================
// CROSS-CHANNEL ATTRIBUTION ENDPOINTS
// ============================================================================

/**
 * POST /api/attribution/cc/touchpoint
 * Record a customer touchpoint (cross-channel)
 */
router.post(
  '/cc/touchpoint',
  requireAuth,
  requireOrganization,
  async (req: Request, res: Response) => {
    try {
      const organizationId = getOrganizationId(req)!;

      const {
        brandId,
        anonymousId,
        customerId,
        email,
        phone,
        channel,
        source,
        medium,
        campaignId,
        deliverableId,
        utmSource,
        utmMedium,
        utmCampaign,
        utmContent,
        utmTerm,
        pageUrl,
        referrer,
        deviceType,
        geoCountry,
        geoCity,
        engagementType,
        engagementValue,
        sessionId
      } = req.body;

      if (!brandId || !channel || !engagementType) {
        return res.status(400).json({
          error: 'Missing required fields: brandId, channel, engagementType'
        });
      }

      if (!anonymousId && !customerId) {
        return res.status(400).json({
          error: 'Either anonymousId or customerId must be provided'
        });
      }

      const touchpointId = await crossChannelAttribution.recordTouchpoint(
        organizationId,
        brandId,
        {
          anonymousId,
          customerId,
          email,
          phone,
          channel,
          source,
          medium,
          campaignId,
          deliverableId,
          utmSource,
          utmMedium,
          utmCampaign,
          utmContent,
          utmTerm,
          pageUrl,
          referrer,
          deviceType,
          geoCountry,
          geoCity,
          engagementType,
          engagementValue,
          sessionId
        }
      );

      res.json({
        success: true,
        touchpointId,
        message: 'Touchpoint recorded successfully'
      });
    } catch (error: unknown) {
    const err = error as Error;
      logger.error('[AttributionRoutes] Error recording CC touchpoint', { error });
      res.status(500).json({ error: 'Failed to record touchpoint' });
    }
  }
);

/**
 * POST /api/attribution/cc/conversion
 * Record a conversion event with multi-model attribution
 */
router.post(
  '/cc/conversion',
  requireAuth,
  requireOrganization,
  async (req: Request, res: Response) => {
    try {
      const organizationId = getOrganizationId(req)!;

      const {
        brandId,
        customerId,
        email,
        conversionType,
        conversionValue,
        currency,
        productId,
        productName,
        quantity,
        metadata
      } = req.body;

      if (!brandId || !customerId || !conversionType || conversionValue === undefined) {
        return res.status(400).json({
          error: 'Missing required fields: brandId, customerId, conversionType, conversionValue'
        });
      }

      const result = await crossChannelAttribution.recordConversion(
        organizationId,
        brandId,
        {
          customerId,
          email,
          conversionType,
          conversionValue: parseFloat(conversionValue),
          currency,
          productId,
          productName,
          quantity,
          metadata
        }
      );

      res.json({
        success: true,
        conversionId: result.conversionId,
        attributions: result.attributions,
        message: 'Conversion recorded and attributed successfully'
      });
    } catch (error: unknown) {
    const err = error as Error;
      logger.error('[AttributionRoutes] Error recording CC conversion', { error });
      res.status(500).json({ error: 'Failed to record conversion' });
    }
  }
);

/**
 * GET /api/attribution/cc/channels
 * Get channel attribution report
 */
router.get(
  '/cc/channels',
  requireAuth,
  requireOrganization,
  async (req: Request, res: Response) => {
    try {
      const organizationId = getOrganizationId(req)!;

      const {
        brandId,
        startDate,
        endDate,
        model = 'data_driven'
      } = req.query;

      if (!startDate || !endDate) {
        return res.status(400).json({
          error: 'Missing required parameters: startDate, endDate'
        });
      }

      const start = new Date(startDate as string);
      const end = new Date(endDate as string);

      const report = await crossChannelAttribution.getChannelReport(
        organizationId,
        brandId as string | null,
        start,
        end,
        model as any
      );

      res.json({
        success: true,
        model,
        startDate: start,
        endDate: end,
        channels: report
      });
    } catch (error: unknown) {
    const err = error as Error;
      logger.error('[AttributionRoutes] Error getting CC channel report', { error });
      res.status(500).json({ error: 'Failed to get channel report' });
    }
  }
);

/**
 * GET /api/attribution/cc/campaigns/:campaignId
 * Get campaign attribution with ROI metrics
 */
router.get(
  '/cc/campaigns/:campaignId',
  requireAuth,
  requireOrganization,
  async (req: Request, res: Response) => {
    try {
      const organizationId = getOrganizationId(req)!;
      const { campaignId } = req.params;

      const {
        startDate,
        endDate
      } = req.query;

      if (!startDate || !endDate) {
        return res.status(400).json({
          error: 'Missing required parameters: startDate, endDate'
        });
      }

      const start = new Date(startDate as string);
      const end = new Date(endDate as string);

      const attribution = await crossChannelAttribution.getCampaignAttribution(
        organizationId,
        campaignId,
        start,
        end
      );

      res.json({
        success: true,
        campaignId,
        startDate: start,
        endDate: end,
        attribution
      });
    } catch (error: unknown) {
    const err = error as Error;
      logger.error('[AttributionRoutes] Error getting CC campaign attribution', { error });
      res.status(500).json({ error: 'Failed to get campaign attribution' });
    }
  }
);

/**
 * GET /api/attribution/cc/journeys/:customerId
 * Get complete customer journey with all touchpoints
 */
router.get(
  '/cc/journeys/:customerId',
  requireAuth,
  requireOrganization,
  async (req: Request, res: Response) => {
    try {
      const organizationId = getOrganizationId(req)!;
      const { customerId } = req.params;

      const journey = await crossChannelAttribution.getCustomerJourney(
        organizationId,
        customerId
      );

      if (!journey) {
        return res.status(404).json({
          error: 'Customer journey not found'
        });
      }

      res.json({
        success: true,
        journey
      });
    } catch (error: unknown) {
    const err = error as Error;
      logger.error('[AttributionRoutes] Error getting CC journey', { error });
      res.status(500).json({ error: 'Failed to get customer journey' });
    }
  }
);

/**
 * POST /api/attribution/cc/identify
 * Identify anonymous user (merge anonymous touchpoints with identified customer)
 */
router.post(
  '/cc/identify',
  requireAuth,
  requireOrganization,
  async (req: Request, res: Response) => {
    try {
      const organizationId = getOrganizationId(req)!;

      const {
        anonymousId,
        customerId,
        email
      } = req.body;

      if (!anonymousId || !customerId) {
        return res.status(400).json({
          error: 'Missing required fields: anonymousId, customerId'
        });
      }

      await crossChannelAttribution.identifyUser(
        organizationId,
        anonymousId,
        customerId,
        email
      );

      res.json({
        success: true,
        message: 'User identified successfully',
        anonymousId,
        customerId
      });
    } catch (error: unknown) {
    const err = error as Error;
      logger.error('[AttributionRoutes] Error identifying CC user', { error });
      res.status(500).json({ error: 'Failed to identify user' });
    }
  }
);

/**
 * GET /api/attribution/cc/models
 * List all available attribution models with descriptions
 */
router.get(
  '/cc/models',
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const models = [
        {
          name: 'first_touch',
          displayName: 'First Touch',
          description: 'Gives 100% credit to the first interaction in the customer journey',
          useCase: 'Understanding which channels are best at creating awareness'
        },
        {
          name: 'last_touch',
          displayName: 'Last Touch',
          description: 'Gives 100% credit to the last interaction before conversion',
          useCase: 'Understanding which channels are best at closing sales'
        },
        {
          name: 'linear',
          displayName: 'Linear',
          description: 'Distributes credit equally across all touchpoints',
          useCase: 'Valuing all touchpoints equally in the customer journey'
        },
        {
          name: 'time_decay',
          displayName: 'Time Decay',
          description: 'Gives more credit to touchpoints closer to conversion (7-day half-life)',
          useCase: 'Emphasizing recent interactions while still valuing earlier ones'
        },
        {
          name: 'position_based',
          displayName: 'Position-Based (U-Shaped)',
          description: 'Gives 40% to first touch, 40% to last touch, 20% distributed to middle',
          useCase: 'Valuing both awareness and conversion touchpoints highly'
        },
        {
          name: 'data_driven',
          displayName: 'Data-Driven',
          description: 'Uses machine learning based on historical conversion patterns to determine credit',
          useCase: 'Most accurate attribution based on your actual conversion data (recommended)'
        }
      ];

      res.json({
        success: true,
        models
      });
    } catch (error: unknown) {
    const err = error as Error;
      logger.error('[AttributionRoutes] Error listing CC models', { error });
      res.status(500).json({ error: 'Failed to list models' });
    }
  }
);

/**
 * GET /api/attribution/cc/compare
 * Compare all attribution models side-by-side
 */
router.get(
  '/cc/compare',
  requireAuth,
  requireOrganization,
  async (req: Request, res: Response) => {
    try {
      const organizationId = getOrganizationId(req)!;

      const {
        brandId,
        startDate,
        endDate
      } = req.query;

      if (!startDate || !endDate) {
        return res.status(400).json({
          error: 'Missing required parameters: startDate, endDate'
        });
      }

      const start = new Date(startDate as string);
      const end = new Date(endDate as string);

      const comparison = await crossChannelAttribution.compareModels(
        organizationId,
        brandId as string | null,
        start,
        end
      );

      res.json({
        success: true,
        startDate: start,
        endDate: end,
        comparison
      });
    } catch (error: unknown) {
    const err = error as Error;
      logger.error('[AttributionRoutes] Error comparing CC models', { error });
      res.status(500).json({ error: 'Failed to compare models' });
    }
  }
);

/**
 * POST /api/attribution/cc/bulk-touchpoints
 * Batch record multiple touchpoints (for data import/migration)
 */
router.post(
  '/cc/bulk-touchpoints',
  requireAuth,
  requireOrganization,
  async (req: Request, res: Response) => {
    try {
      const organizationId = getOrganizationId(req)!;
      const { touchpoints } = req.body;

      if (!Array.isArray(touchpoints) || touchpoints.length === 0) {
        return res.status(400).json({
          error: 'touchpoints must be a non-empty array'
        });
      }

      const results = [];
      const errors = [];

      for (let i = 0; i < touchpoints.length; i++) {
        try {
          const tp = touchpoints[i];
          const touchpointId = await crossChannelAttribution.recordTouchpoint(
            organizationId,
            tp.brandId,
            tp
          );
          results.push({ index: i, touchpointId, success: true });
        } catch (error: unknown) {
    const err = error as Error;
          errors.push({ index: i, error: (error as Error).message });
        }
      }

      res.json({
        success: errors.length === 0,
        totalProcessed: touchpoints.length,
        successful: results.length,
        failed: errors.length,
        results,
        errors
      });
    } catch (error: unknown) {
    const err = error as Error;
      logger.error('[AttributionRoutes] Error bulk recording CC touchpoints', { error });
      res.status(500).json({ error: 'Failed to bulk record touchpoints' });
    }
  }
);

export default router;
