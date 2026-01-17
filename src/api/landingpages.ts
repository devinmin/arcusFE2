/**
 * Landing Page Routes
 *
 * Provides landing page template management and rendering.
 * Supports industry-specific templates with variable substitution.
 */

import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requireOrganization } from '../middleware/multiTenancy.js';
import {
  landingPageTemplateService,
  type LandingPageTemplateInput,
  type LandingPageInput,
} from '../services/landingPageTemplateService.js';
import { logger } from '../utils/logger.js';

const router = Router();

// ============================================================================
// Template Routes
// ============================================================================

/**
 * GET /api/landing-pages/templates
 * List landing page templates
 */
router.get('/templates', requireAuth, async (req: Request, res: Response) => {
  try {
    const organizationId = (req as any).user.organization_id;
    const { industry, search, limit, offset } = req.query;

    const result = await landingPageTemplateService.listTemplates(organizationId, {
      industry: industry as string,
      search: search as string,
      limit: limit ? parseInt(limit as string, 10) : undefined,
      offset: offset ? parseInt(offset as string, 10) : undefined,
    });

    res.json({
      data: result,
      meta: { timestamp: new Date().toISOString() },
    });
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('List templates error:', error);
    res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: 'Failed to list templates' },
    });
  }
});

/**
 * GET /api/landing-pages/templates/public
 * List public/system templates
 */
router.get('/templates/public', requireAuth, async (req: Request, res: Response) => {
  try {
    const { industry, search, limit, offset } = req.query;

    const result = await landingPageTemplateService.getPublicTemplates({
      industry: industry as string,
      search: search as string,
      limit: limit ? parseInt(limit as string, 10) : undefined,
      offset: offset ? parseInt(offset as string, 10) : undefined,
    });

    res.json({
      data: result,
      meta: { timestamp: new Date().toISOString() },
    });
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('List public templates error:', error);
    res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: 'Failed to list public templates' },
    });
  }
});

/**
 * GET /api/landing-pages/industries
 * Get available industries
 */
router.get('/industries', requireAuth, async (req: Request, res: Response) => {
  try {
    const industries = await landingPageTemplateService.getIndustries();

    res.json({
      data: { industries },
      meta: { timestamp: new Date().toISOString() },
    });
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('Get industries error:', error);
    res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: 'Failed to get industries' },
    });
  }
});

/**
 * GET /api/landing-pages/templates/:id
 * Get a specific template
 */
router.get('/templates/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const organizationId = (req as any).user.organization_id;
    const { id } = req.params;

    const template = await landingPageTemplateService.getTemplateById(id, organizationId);

    if (!template) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Template not found' },
      });
    }

    res.json({
      data: template,
      meta: { timestamp: new Date().toISOString() },
    });
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('Get template error:', error);
    res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: 'Failed to get template' },
    });
  }
});

/**
 * POST /api/landing-pages/templates
 * Create a new template
 */
router.post('/templates', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const organizationId = (req as any).user.organization_id;
    const input: LandingPageTemplateInput = req.body;

    if (!input.name || !input.industry) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'Template name and industry are required' },
      });
    }

    const template = await landingPageTemplateService.createTemplate(organizationId, userId, input);

    res.status(201).json({
      data: template,
      meta: { timestamp: new Date().toISOString() },
    });
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('Create template error:', error);
    res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: err.message || 'Failed to create template' },
    });
  }
});

/**
 * PATCH /api/landing-pages/templates/:id
 * Update a template
 */
router.patch('/templates/:id', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const organizationId = (req as any).user.organization_id;
    const { id } = req.params;
    const input: Partial<LandingPageTemplateInput> = req.body;

    const template = await landingPageTemplateService.updateTemplate(id, organizationId, input);

    if (!template) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Template not found' },
      });
    }

    res.json({
      data: template,
      meta: { timestamp: new Date().toISOString() },
    });
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('Update template error:', error);
    res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: err.message || 'Failed to update template' },
    });
  }
});

/**
 * DELETE /api/landing-pages/templates/:id
 * Delete a template
 */
router.delete('/templates/:id', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const organizationId = (req as any).user.organization_id;
    const { id } = req.params;

    await landingPageTemplateService.deleteTemplate(id, organizationId);

    res.json({
      data: { success: true },
      meta: { timestamp: new Date().toISOString() },
    });
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('Delete template error:', error);
    res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: 'Failed to delete template' },
    });
  }
});

/**
 * POST /api/landing-pages/templates/:id/clone
 * Clone a template
 */
router.post('/templates/:id/clone', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const organizationId = (req as any).user.organization_id;
    const { id } = req.params;

    const template = await landingPageTemplateService.cloneTemplate(id, organizationId, userId);

    if (!template) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Template not found' },
      });
    }

    res.status(201).json({
      data: template,
      meta: { timestamp: new Date().toISOString() },
    });
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('Clone template error:', error);
    res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: err.message || 'Failed to clone template' },
    });
  }
});

/**
 * POST /api/landing-pages/templates/:id/preview
 * Preview a template with variables
 */
router.post('/templates/:id/preview', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const organizationId = (req as any).user.organization_id;
    const { id } = req.params;
    const { variables } = req.body;

    const preview = await landingPageTemplateService.previewTemplate(id, organizationId, variables || {});

    if (!preview) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Template not found' },
      });
    }

    res.json({
      data: preview,
      meta: { timestamp: new Date().toISOString() },
    });
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('Preview template error:', error);
    res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: err.message || 'Failed to preview template' },
    });
  }
});

/**
 * POST /api/landing-pages/templates/:id/apply
 * Apply a template to create a landing page
 */
router.post('/templates/:id/apply', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const organizationId = (req as any).user.organization_id;
    const { id } = req.params;
    const { campaignId, variables, name } = req.body;

    const landingPage = await landingPageTemplateService.applyTemplate(
      id,
      organizationId,
      userId,
      campaignId,
      variables || {},
      name
    );

    if (!landingPage) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Template not found' },
      });
    }

    res.status(201).json({
      data: landingPage,
      meta: { timestamp: new Date().toISOString() },
    });
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('Apply template error:', error);
    res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: err.message || 'Failed to apply template' },
    });
  }
});

// ============================================================================
// Landing Page Instance Routes
// ============================================================================

/**
 * GET /api/landing-pages
 * List landing pages
 */
router.get('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const organizationId = (req as any).user.organization_id;
    const { campaignId, status, search, limit, offset } = req.query;

    const result = await landingPageTemplateService.listLandingPages(organizationId, {
      campaignId: campaignId as string,
      status: status as string,
      search: search as string,
      limit: limit ? parseInt(limit as string, 10) : undefined,
      offset: offset ? parseInt(offset as string, 10) : undefined,
    });

    res.json({
      data: result,
      meta: { timestamp: new Date().toISOString() },
    });
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('List landing pages error:', error);
    res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: 'Failed to list landing pages' },
    });
  }
});

/**
 * GET /api/landing-pages/:id
 * Get a specific landing page
 */
router.get('/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const organizationId = (req as any).user.organization_id;
    const { id } = req.params;

    const landingPage = await landingPageTemplateService.getLandingPageById(id, organizationId);

    if (!landingPage) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Landing page not found' },
      });
    }

    res.json({
      data: landingPage,
      meta: { timestamp: new Date().toISOString() },
    });
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('Get landing page error:', error);
    res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: 'Failed to get landing page' },
    });
  }
});

/**
 * PATCH /api/landing-pages/:id
 * Update a landing page
 */
router.patch('/:id', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const organizationId = (req as any).user.organization_id;
    const { id } = req.params;
    const input: Partial<LandingPageInput> = req.body;

    const landingPage = await landingPageTemplateService.updateLandingPage(id, organizationId, input);

    if (!landingPage) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Landing page not found' },
      });
    }

    res.json({
      data: landingPage,
      meta: { timestamp: new Date().toISOString() },
    });
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('Update landing page error:', error);
    res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: err.message || 'Failed to update landing page' },
    });
  }
});

/**
 * DELETE /api/landing-pages/:id
 * Delete a landing page
 */
router.delete('/:id', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const organizationId = (req as any).user.organization_id;
    const { id } = req.params;

    await landingPageTemplateService.deleteLandingPage(id, organizationId);

    res.json({
      data: { success: true },
      meta: { timestamp: new Date().toISOString() },
    });
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('Delete landing page error:', error);
    res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: 'Failed to delete landing page' },
    });
  }
});

/**
 * POST /api/landing-pages/:id/publish
 * Publish a landing page
 */
router.post('/:id/publish', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const organizationId = (req as any).user.organization_id;
    const { id } = req.params;

    const landingPage = await landingPageTemplateService.publishLandingPage(id, organizationId);

    if (!landingPage) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Landing page not found' },
      });
    }

    res.json({
      data: landingPage,
      meta: { timestamp: new Date().toISOString() },
    });
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('Publish landing page error:', error);
    res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: err.message || 'Failed to publish landing page' },
    });
  }
});

/**
 * POST /api/landing-pages/:id/unpublish
 * Unpublish a landing page
 */
router.post('/:id/unpublish', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const organizationId = (req as any).user.organization_id;
    const { id } = req.params;

    const landingPage = await landingPageTemplateService.unpublishLandingPage(id, organizationId);

    if (!landingPage) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Landing page not found' },
      });
    }

    res.json({
      data: landingPage,
      meta: { timestamp: new Date().toISOString() },
    });
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('Unpublish landing page error:', error);
    res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: err.message || 'Failed to unpublish landing page' },
    });
  }
});

// ============================================================================
// Public Landing Page Routes (Unauthenticated)
// ============================================================================

/**
 * GET /api/public/landing-pages/:slug
 * Get a published landing page by slug
 */
router.get('/public/:slug', async (req: Request, res: Response) => {
  try {
    const { slug } = req.params;

    const landingPage = await landingPageTemplateService.getPublicLandingPage(slug);

    if (!landingPage) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Landing page not found' },
      });
    }

    // Track view
    await landingPageTemplateService.trackLandingPageView(landingPage.id);

    res.json({
      data: landingPage,
      meta: { timestamp: new Date().toISOString() },
    });
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('Get public landing page error:', error);
    res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: 'Failed to get landing page' },
    });
  }
});

export default router;
