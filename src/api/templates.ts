/**
 * Campaign Templates Routes
 *
 * REST API endpoints for campaign template management.
 * Supports CRUD, cloning, application, ratings, and analytics.
 */

import { Router, Response, NextFunction } from 'express';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.js';
import { logger } from '../utils/logger.js';
import * as templateService from '../services/templateService.js';

const router = Router();

// Apply auth to all routes
router.use(authMiddleware);

// ============================================================================
// Template CRUD Routes
// ============================================================================

/**
 * GET /api/templates
 * List templates with filters
 */
router.get('/', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const organizationId = req.organizationId!;

    const filters: templateService.TemplateFilters = {
      category: req.query.category as string,
      tags: req.query.tags ? (req.query.tags as string).split(',') : undefined,
      is_public: req.query.is_public === 'true' ? true : req.query.is_public === 'false' ? false : undefined,
      is_featured: req.query.is_featured === 'true' ? true : undefined,
      search: req.query.search as string,
      sortBy: req.query.sortBy as 'name' | 'created_at' | 'use_count' | 'avg_rating',
      sortOrder: req.query.sortOrder as 'asc' | 'desc',
      limit: req.query.limit ? parseInt(req.query.limit as string, 10) : undefined,
      offset: req.query.offset ? parseInt(req.query.offset as string, 10) : undefined,
    };

    const { templates, total } = await templateService.listTemplates(organizationId, filters);

    res.json({
      success: true,
      data: templates,
      pagination: {
        total,
        limit: filters.limit || 20,
        offset: filters.offset || 0,
      },
    });
  } catch (error: unknown) {
    const err = error as Error;
    next(error);
  }
});

/**
 * GET /api/templates/featured
 * Get featured templates
 */
router.get('/featured', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const organizationId = req.organizationId!;
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 10;

    const templates = await templateService.getFeaturedTemplates(organizationId, limit);

    res.json({
      success: true,
      data: templates,
    });
  } catch (error: unknown) {
    const err = error as Error;
    next(error);
  }
});

/**
 * GET /api/templates/popular
 * Get most used templates
 */
router.get('/popular', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const organizationId = req.organizationId!;
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 10;

    const templates = await templateService.getMostUsedTemplates(organizationId, limit);

    res.json({
      success: true,
      data: templates,
    });
  } catch (error: unknown) {
    const err = error as Error;
    next(error);
  }
});

/**
 * GET /api/templates/categories
 * List template categories
 */
router.get('/categories', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const categories = await templateService.listCategories(req.organizationId);

    res.json({
      success: true,
      data: categories,
    });
  } catch (error: unknown) {
    const err = error as Error;
    next(error);
  }
});

/**
 * POST /api/templates/categories
 * Create a category
 */
router.post('/categories', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const organizationId = req.organizationId!;
    const { name, slug, description, icon, color, parent_category_id, display_order } = req.body;

    if (!name || !slug) {
      return res.status(400).json({
        success: false,
        error: 'Name and slug are required',
      });
    }

    const category = await templateService.createCategory(organizationId, {
      name,
      slug,
      description,
      icon,
      color,
      parent_category_id,
      display_order,
    });

    res.status(201).json({
      success: true,
      data: category,
    });
  } catch (error: unknown) {
    const err = error as Error;
    next(error);
  }
});

/**
 * GET /api/templates/:id
 * Get template by ID
 */
router.get('/:id', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const template = await templateService.getTemplateById(req.params.id);

    if (!template) {
      return res.status(404).json({
        success: false,
        error: 'Template not found',
      });
    }

    // Check access (must be public or same org)
    if (!template.is_public && template.organization_id !== req.organizationId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied',
      });
    }

    // Get stats
    const stats = await templateService.getTemplateStats(template.id);

    res.json({
      success: true,
      data: { ...template, stats },
    });
  } catch (error: unknown) {
    const err = error as Error;
    next(error);
  }
});

/**
 * POST /api/templates
 * Create a new template
 */
router.post('/', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const organizationId = req.organizationId!;
    const userId = req.user!.id;

    const {
      name,
      description,
      category,
      tags,
      is_public,
      thumbnail_url,
      preview_data,
      campaign_config,
      deliverable_configs,
      workflow_config,
      style_config,
      variables,
    } = req.body;

    if (!name) {
      return res.status(400).json({
        success: false,
        error: 'Name is required',
      });
    }

    const template = await templateService.createTemplate(organizationId, userId, {
      name,
      description,
      category,
      tags,
      is_public,
      thumbnail_url,
      preview_data,
      campaign_config,
      deliverable_configs,
      workflow_config,
      style_config,
      variables,
    });

    res.status(201).json({
      success: true,
      data: template,
    });
  } catch (error: unknown) {
    const err = error as Error;
    next(error);
  }
});

/**
 * PATCH /api/templates/:id
 * Update a template
 */
router.patch('/:id', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const organizationId = req.organizationId!;

    const template = await templateService.updateTemplate(req.params.id, organizationId, req.body);

    res.json({
      success: true,
      data: template,
    });
  } catch (error: unknown) {
    const err = error as Error;
    if (error instanceof Error && err.message.includes('not found')) {
      return res.status(404).json({
        success: false,
        error: 'Template not found',
      });
    }
    next(error);
  }
});

/**
 * DELETE /api/templates/:id
 * Delete a template (soft delete)
 */
router.delete('/:id', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const organizationId = req.organizationId!;
    const permanent = req.query.permanent === 'true';

    if (permanent) {
      await templateService.hardDeleteTemplate(req.params.id, organizationId);
    } else {
      await templateService.deleteTemplate(req.params.id, organizationId);
    }

    res.json({
      success: true,
      message: 'Template deleted',
    });
  } catch (error: unknown) {
    const err = error as Error;
    if (error instanceof Error && err.message.includes('not found')) {
      return res.status(404).json({
        success: false,
        error: 'Template not found',
      });
    }
    next(error);
  }
});

// ============================================================================
// Template Clone & Apply Routes
// ============================================================================

/**
 * POST /api/templates/:id/clone
 * Clone a template
 */
router.post('/:id/clone', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const organizationId = req.organizationId!;
    const userId = req.user!.id;
    const { name } = req.body;

    const template = await templateService.cloneTemplate(
      req.params.id,
      organizationId,
      userId,
      name
    );

    res.status(201).json({
      success: true,
      data: template,
    });
  } catch (error: unknown) {
    const err = error as Error;
    if (error instanceof Error && err.message.includes('not found')) {
      return res.status(404).json({
        success: false,
        error: 'Template not found',
      });
    }
    if (error instanceof Error && err.message.includes('Cannot clone')) {
      return res.status(403).json({
        success: false,
        error: err.message,
      });
    }
    next(error);
  }
});

/**
 * POST /api/templates/:id/preview
 * Preview template with variables
 */
router.post('/:id/preview', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { variables = {} } = req.body;

    const preview = await templateService.previewTemplate(req.params.id, variables);

    res.json({
      success: true,
      data: preview,
    });
  } catch (error: unknown) {
    const err = error as Error;
    if (error instanceof Error && err.message.includes('not found')) {
      return res.status(404).json({
        success: false,
        error: 'Template not found',
      });
    }
    next(error);
  }
});

/**
 * POST /api/templates/:id/validate
 * Validate variables for a template
 */
router.post('/:id/validate', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { variables = {} } = req.body;

    const template = await templateService.getTemplateById(req.params.id);

    if (!template) {
      return res.status(404).json({
        success: false,
        error: 'Template not found',
      });
    }

    const validation = templateService.validateVariables(template, variables);

    res.json({
      success: true,
      data: validation,
    });
  } catch (error: unknown) {
    const err = error as Error;
    next(error);
  }
});

/**
 * POST /api/templates/:id/apply
 * Apply template to create a campaign
 */
router.post('/:id/apply', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const organizationId = req.organizationId!;
    const userId = req.user!.id;
    const { client_id, variables = {} } = req.body;

    if (!client_id) {
      return res.status(400).json({
        success: false,
        error: 'client_id is required',
      });
    }

    const result = await templateService.applyTemplate(
      req.params.id,
      organizationId,
      userId,
      client_id,
      variables
    );

    res.status(201).json({
      success: true,
      data: result,
    });
  } catch (error: unknown) {
    const err = error as Error;
    if (error instanceof Error && err.message.includes('not found')) {
      return res.status(404).json({
        success: false,
        error: 'Template not found',
      });
    }
    if (error instanceof Error && err.message.includes('Invalid variables')) {
      return res.status(400).json({
        success: false,
        error: err.message,
      });
    }
    next(error);
  }
});

// ============================================================================
// Template Rating Routes
// ============================================================================

/**
 * GET /api/templates/:id/ratings
 * Get template ratings
 */
router.get('/:id/ratings', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const ratings = await templateService.getTemplateRatings(req.params.id);

    res.json({
      success: true,
      data: ratings,
    });
  } catch (error: unknown) {
    const err = error as Error;
    next(error);
  }
});

/**
 * POST /api/templates/:id/ratings
 * Rate a template
 */
router.post('/:id/ratings', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const organizationId = req.organizationId!;
    const userId = req.user!.id;
    const { rating, review } = req.body;

    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({
        success: false,
        error: 'Rating must be between 1 and 5',
      });
    }

    const result = await templateService.rateTemplate(
      req.params.id,
      organizationId,
      userId,
      rating,
      review
    );

    res.json({
      success: true,
      data: result,
    });
  } catch (error: unknown) {
    const err = error as Error;
    next(error);
  }
});

// ============================================================================
// Template Stats Routes
// ============================================================================

/**
 * GET /api/templates/:id/stats
 * Get template statistics
 */
router.get('/:id/stats', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const stats = await templateService.getTemplateStats(req.params.id);

    res.json({
      success: true,
      data: stats,
    });
  } catch (error: unknown) {
    const err = error as Error;
    if (error instanceof Error && err.message.includes('not found')) {
      return res.status(404).json({
        success: false,
        error: 'Template not found',
      });
    }
    next(error);
  }
});

export default router;
