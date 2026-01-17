/**
 * Marketplace Routes
 *
 * Template marketplace endpoints for discovery, purchasing, and creator management
 */

import { Router, Request, Response } from 'express';
import { authenticateJWT } from '../middleware/auth.js';
import { requireOrganization } from '../middleware/multiTenancy.js';
import marketplaceService from '../services/marketplaceService.js';
import * as stripeService from '../services/stripeService.js';
import { logger } from '../utils/logger.js';

const router = Router();

// All routes require authentication and organization context
router.use(authenticateJWT);
router.use(requireOrganization);

// ============================================================================
// Template Discovery
// ============================================================================

/**
 * Search/browse templates in marketplace
 * GET /api/marketplace/templates
 */
router.get('/templates', async (req: Request, res: Response) => {
  try {
    const organizationId = req.org!.organization.id;
    const query = (req.query.q as string) || '';

    const filters = {
      category: req.query.category as string | undefined,
      priceRange: req.query.minPrice && req.query.maxPrice
        ? {
            min: parseInt(req.query.minPrice as string, 10),
            max: parseInt(req.query.maxPrice as string, 10),
          }
        : undefined,
      rating: req.query.rating ? parseFloat(req.query.rating as string) : undefined,
      sortBy: req.query.sortBy as any,
      limit: req.query.limit ? parseInt(req.query.limit as string, 10) : 20,
      offset: req.query.offset ? parseInt(req.query.offset as string, 10) : 0,
    };

    const result = await marketplaceService.searchTemplates(
      organizationId,
      query,
      filters
    );

    res.json(result);
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('Failed to search templates', { error: err.message });
    res.status(500).json({ error: 'Failed to search templates' });
  }
});

/**
 * Get featured templates
 * GET /api/marketplace/featured
 */
router.get('/featured', async (req: Request, res: Response) => {
  try {
    const organizationId = req.org!.organization.id;
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 10;

    const templates = await marketplaceService.getFeaturedTemplates(organizationId, limit);

    res.json({ templates });
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('Failed to get featured templates', { error: err.message });
    res.status(500).json({ error: 'Failed to get featured templates' });
  }
});

/**
 * Get trending templates
 * GET /api/marketplace/trending
 */
router.get('/trending', async (req: Request, res: Response) => {
  try {
    const organizationId = req.org!.organization.id;
    const period = (req.query.period as '7d' | '30d') || '7d';
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 10;

    const templates = await marketplaceService.getTrendingTemplates(
      organizationId,
      period,
      limit
    );

    res.json({ templates });
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('Failed to get trending templates', { error: err.message });
    res.status(500).json({ error: 'Failed to get trending templates' });
  }
});

/**
 * Get all collections
 * GET /api/marketplace/collections
 */
router.get('/collections', async (req: Request, res: Response) => {
  try {
    const collections = await marketplaceService.getCollections();
    res.json({ collections });
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('Failed to get collections', { error: err.message });
    res.status(500).json({ error: 'Failed to get collections' });
  }
});

/**
 * Get collection by ID or slug
 * GET /api/marketplace/collections/:id
 */
router.get('/collections/:id', async (req: Request, res: Response) => {
  try {
    const collection = await marketplaceService.getCollection(req.params.id);

    if (!collection) {
      return res.status(404).json({ error: 'Collection not found' });
    }

    res.json(collection);
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('Failed to get collection', { error: err.message });
    res.status(500).json({ error: 'Failed to get collection' });
  }
});

/**
 * Get template details with pricing
 * GET /api/marketplace/templates/:id
 */
router.get('/templates/:id', async (req: Request, res: Response) => {
  try {
    const organizationId = req.org!.organization.id;
    const templateId = req.params.id;

    // Search for single template
    const result = await marketplaceService.searchTemplates(
      organizationId,
      '',
      { limit: 1, offset: 0 }
    );

    const template = result.templates.find(t => t.id === templateId);

    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }

    // Get pricing
    const pricing = await marketplaceService.getTemplatePrice(templateId);

    // Check access
    const hasAccess = await marketplaceService.checkAccess(organizationId, templateId);

    res.json({
      ...template,
      pricing,
      has_access: hasAccess,
    });
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('Failed to get template', { error: err.message });
    res.status(500).json({ error: 'Failed to get template' });
  }
});

/**
 * Get template preview
 * GET /api/marketplace/templates/:id/preview
 */
router.get('/templates/:id/preview', async (req: Request, res: Response) => {
  try {
    const templateId = req.params.id;

    // Import templateService for preview
    const templateService = await import('../services/templateService.js');
    const template = await templateService.getTemplateById(templateId);

    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }

    // Return preview data
    res.json({
      name: template.name,
      description: template.description,
      preview_data: template.preview_data,
      thumbnail_url: template.thumbnail_url,
      deliverable_configs: template.deliverable_configs,
    });
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('Failed to get template preview', { error: err.message });
    res.status(500).json({ error: 'Failed to get template preview' });
  }
});

// ============================================================================
// Purchases
// ============================================================================

/**
 * Purchase a template
 * POST /api/marketplace/templates/:id/purchase
 */
router.post('/templates/:id/purchase', async (req: Request, res: Response) => {
  try {
    const organizationId = req.org!.organization.id;
    const userId = req.user!.id;
    const templateId = req.params.id;
    const { payment_method_id } = req.body;

    const result = await marketplaceService.purchaseTemplate(
      organizationId,
      userId,
      templateId,
      payment_method_id
    );

    res.json(result);
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('Failed to purchase template', { error: err.message });
    res.status(400).json({ error: err.message });
  }
});

/**
 * Get purchase history
 * GET /api/marketplace/purchases
 */
router.get('/purchases', async (req: Request, res: Response) => {
  try {
    const organizationId = req.org!.organization.id;
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 20;
    const offset = req.query.offset ? parseInt(req.query.offset as string, 10) : 0;

    const result = await marketplaceService.getPurchaseHistory(
      organizationId,
      limit,
      offset
    );

    res.json(result);
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('Failed to get purchase history', { error: err.message });
    res.status(500).json({ error: 'Failed to get purchase history' });
  }
});

/**
 * Check template access
 * GET /api/marketplace/templates/:id/access
 */
router.get('/templates/:id/access', async (req: Request, res: Response) => {
  try {
    const organizationId = req.org!.organization.id;
    const templateId = req.params.id;

    const hasAccess = await marketplaceService.checkAccess(organizationId, templateId);

    res.json({ has_access: hasAccess });
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('Failed to check template access', { error: err.message });
    res.status(500).json({ error: 'Failed to check access' });
  }
});

// ============================================================================
// Creator Portal
// ============================================================================

/**
 * Get own creator profile
 * GET /api/creators/profile
 */
router.get('/creators/profile', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;

    const profile = await marketplaceService.getCreatorProfile(userId);

    if (!profile) {
      return res.status(404).json({ error: 'Creator profile not found' });
    }

    res.json(profile);
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('Failed to get creator profile', { error: err.message });
    res.status(500).json({ error: 'Failed to get creator profile' });
  }
});

/**
 * Create creator profile
 * POST /api/creators/profile
 */
router.post('/creators/profile', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const organizationId = req.org!.organization.id;

    const profile = await marketplaceService.createCreatorProfile(
      userId,
      organizationId,
      req.body
    );

    res.status(201).json(profile);
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('Failed to create creator profile', { error: err.message });
    res.status(400).json({ error: err.message });
  }
});

/**
 * Update creator profile
 * PUT /api/creators/profile
 */
router.put('/creators/profile', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;

    // Get current profile
    const currentProfile = await marketplaceService.getCreatorProfile(userId);
    if (!currentProfile) {
      return res.status(404).json({ error: 'Creator profile not found' });
    }

    const updatedProfile = await marketplaceService.updateCreatorProfile(
      currentProfile.id,
      req.body
    );

    res.json(updatedProfile);
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('Failed to update creator profile', { error: err.message });
    res.status(400).json({ error: err.message });
  }
});

/**
 * List own templates
 * GET /api/creators/templates
 */
router.get('/creators/templates', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const organizationId = req.org!.organization.id;

    // Import templateService
    const templateService = await import('../services/templateService.js');

    const result = await templateService.listTemplates(organizationId, {
      limit: req.query.limit ? parseInt(req.query.limit as string, 10) : 20,
      offset: req.query.offset ? parseInt(req.query.offset as string, 10) : 0,
    });

    res.json(result);
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('Failed to list creator templates', { error: err.message });
    res.status(500).json({ error: 'Failed to list templates' });
  }
});

/**
 * Get earnings dashboard
 * GET /api/creators/earnings
 */
router.get('/creators/earnings', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;

    // Get creator profile
    const profile = await marketplaceService.getCreatorProfile(userId);
    if (!profile) {
      return res.status(404).json({ error: 'Creator profile not found' });
    }

    // Get earnings with optional date range
    const period = req.query.start && req.query.end
      ? {
          start: new Date(req.query.start as string),
          end: new Date(req.query.end as string),
        }
      : undefined;

    const earnings = await marketplaceService.getCreatorEarnings(profile.id, period);

    res.json(earnings);
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('Failed to get creator earnings', { error: err.message });
    res.status(500).json({ error: 'Failed to get earnings' });
  }
});

/**
 * Request payout
 * POST /api/creators/payout
 */
router.post('/creators/payout', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;

    // Get creator profile
    const profile = await marketplaceService.getCreatorProfile(userId);
    if (!profile) {
      return res.status(404).json({ error: 'Creator profile not found' });
    }

    const earnings = await marketplaceService.requestPayout(profile.id);

    res.json(earnings);
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('Failed to request payout', { error: err.message });
    res.status(400).json({ error: err.message });
  }
});

/**
 * Set up Stripe Connect account
 * POST /api/creators/stripe-connect
 */
router.post('/creators/stripe-connect', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;

    // Get creator profile
    const profile = await marketplaceService.getCreatorProfile(userId);
    if (!profile) {
      return res.status(404).json({ error: 'Creator profile not found' });
    }

    // Check if already has Connect account
    if (profile.stripe_connect_id) {
      // Create dashboard link
      const dashboardLink = await stripeService.createConnectDashboardLink(
        profile.stripe_connect_id
      );
      return res.json({ dashboard_url: dashboardLink.url });
    }

    // Create new Connect account
    const account = await stripeService.createConnectAccount(
      profile.payout_email || req.user!.email,
      {
        creator_id: profile.id,
        user_id: userId,
      }
    );

    // Update creator profile with Connect ID
    await marketplaceService.updateCreatorProfile(profile.id, {
      stripe_connect_id: account.id,
    });

    // Create onboarding link
    const refreshUrl = `${process.env.FRONTEND_URL}/creators/stripe-connect`;
    const returnUrl = `${process.env.FRONTEND_URL}/creators/earnings`;

    const accountLink = await stripeService.createConnectAccountLink(
      account.id,
      refreshUrl,
      returnUrl
    );

    res.json({ onboarding_url: accountLink.url });
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('Failed to set up Stripe Connect', { error: err.message });
    res.status(500).json({ error: 'Failed to set up Stripe Connect' });
  }
});

/**
 * Get Stripe Connect account status
 * GET /api/creators/stripe-connect/status
 */
router.get('/creators/stripe-connect/status', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;

    const profile = await marketplaceService.getCreatorProfile(userId);
    if (!profile || !profile.stripe_connect_id) {
      return res.json({ connected: false });
    }

    const account = await stripeService.getConnectAccount(profile.stripe_connect_id);

    res.json({
      connected: true,
      charges_enabled: account.charges_enabled,
      payouts_enabled: account.payouts_enabled,
      details_submitted: account.details_submitted,
    });
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('Failed to get Connect status', { error: err.message });
    res.status(500).json({ error: 'Failed to get Connect status' });
  }
});

// ============================================================================
// Template Pricing (Creator only)
// ============================================================================

/**
 * Set template pricing
 * PUT /api/creators/templates/:id/pricing
 */
router.put('/creators/templates/:id/pricing', async (req: Request, res: Response) => {
  try {
    const templateId = req.params.id;
    const { pricing_type, price_cents, currency, creator_share_percent } = req.body;

    if (!pricing_type || price_cents === undefined) {
      return res.status(400).json({ error: 'pricing_type and price_cents are required' });
    }

    const pricing = await marketplaceService.setTemplatePrice(templateId, {
      pricing_type,
      price_cents,
      currency,
      creator_share_percent,
    });

    res.json(pricing);
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('Failed to set template pricing', { error: err.message });
    res.status(400).json({ error: err.message });
  }
});

/**
 * Get template pricing
 * GET /api/creators/templates/:id/pricing
 */
router.get('/creators/templates/:id/pricing', async (req: Request, res: Response) => {
  try {
    const templateId = req.params.id;

    const pricing = await marketplaceService.getTemplatePrice(templateId);

    if (!pricing) {
      return res.status(404).json({ error: 'Pricing not found' });
    }

    res.json(pricing);
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('Failed to get template pricing', { error: err.message });
    res.status(500).json({ error: 'Failed to get pricing' });
  }
});

export default router;
