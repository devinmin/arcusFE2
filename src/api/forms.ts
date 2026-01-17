/**
 * Form Builder Routes
 *
 * Provides form creation, management, and submission handling.
 * Integrates with lead capture system.
 */

import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requireOrganization } from '../middleware/multiTenancy.js';
import { formBuilderService, type FormDefinitionInput } from '../services/formBuilderService.js';
import { logger } from '../utils/logger.js';

const router = Router();

// ============================================================================
// Form Definition Routes (Authenticated)
// ============================================================================

/**
 * GET /api/forms
 * List forms for authenticated user's organization
 */
router.get('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const organizationId = (req as any).user.organization_id;
    const { includeDrafts, search, limit, offset } = req.query;

    const result = await formBuilderService.listForms(organizationId, {
      isActive: includeDrafts === 'true' ? undefined : true, // include drafts means don't filter by isActive
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
    logger.error('List forms error:', error);
    res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: 'Failed to list forms' },
    });
  }
});

/**
 * GET /api/forms/:id
 * Get a specific form by ID
 */
router.get('/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const organizationId = (req as any).user.organization_id;
    const { id } = req.params;

    const form = await formBuilderService.getFormById(id, organizationId);

    if (!form) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Form not found' },
      });
    }

    res.json({
      data: form,
      meta: { timestamp: new Date().toISOString() },
    });
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('Get form error:', error);
    res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: 'Failed to get form' },
    });
  }
});

/**
 * POST /api/forms
 * Create a new form
 */
router.post('/', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const organizationId = (req as any).user.organization_id;
    const input: FormDefinitionInput = req.body;

    if (!input.name) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'Form name is required' },
      });
    }

    const form = await formBuilderService.createForm(organizationId, userId, input);

    res.status(201).json({
      data: form,
      meta: { timestamp: new Date().toISOString() },
    });
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('Create form error:', error);
    res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: err.message || 'Failed to create form' },
    });
  }
});

/**
 * PATCH /api/forms/:id
 * Update a form
 */
router.patch('/:id', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const organizationId = (req as any).user.organization_id;
    const { id } = req.params;
    const input: Partial<FormDefinitionInput> = req.body;

    const form = await formBuilderService.updateForm(id, organizationId, input);

    if (!form) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Form not found' },
      });
    }

    res.json({
      data: form,
      meta: { timestamp: new Date().toISOString() },
    });
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('Update form error:', error);
    res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: err.message || 'Failed to update form' },
    });
  }
});

/**
 * DELETE /api/forms/:id
 * Delete a form
 */
router.delete('/:id', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const organizationId = (req as any).user.organization_id;
    const { id } = req.params;

    await formBuilderService.deleteForm(id, organizationId);

    res.json({
      data: { success: true },
      meta: { timestamp: new Date().toISOString() },
    });
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('Delete form error:', error);
    res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: 'Failed to delete form' },
    });
  }
});

/**
 * POST /api/forms/:id/clone
 * Clone a form
 */
router.post('/:id/clone', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const organizationId = (req as any).user.organization_id;
    const { id } = req.params;

    const form = await formBuilderService.cloneForm(id, organizationId, userId);

    if (!form) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Form not found' },
      });
    }

    res.status(201).json({
      data: form,
      meta: { timestamp: new Date().toISOString() },
    });
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('Clone form error:', error);
    res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: err.message || 'Failed to clone form' },
    });
  }
});

/**
 * GET /api/forms/:id/submissions
 * Get submissions for a form
 */
router.get('/:id/submissions', requireAuth, async (req: Request, res: Response) => {
  try {
    const organizationId = (req as any).user.organization_id;
    const { id } = req.params;
    const { status, startDate, endDate, limit, offset } = req.query;

    // Verify form ownership
    const form = await formBuilderService.getFormById(id, organizationId);
    if (!form) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Form not found' },
      });
    }

    const result = await formBuilderService.getSubmissions(id, organizationId, {
      status: status as string,
      startDate: startDate ? new Date(startDate as string) : undefined,
      endDate: endDate ? new Date(endDate as string) : undefined,
      limit: limit ? parseInt(limit as string, 10) : undefined,
      offset: offset ? parseInt(offset as string, 10) : undefined,
    });

    res.json({
      data: result,
      meta: { timestamp: new Date().toISOString() },
    });
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('Get submissions error:', error);
    res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: 'Failed to get submissions' },
    });
  }
});

/**
 * GET /api/forms/:id/analytics
 * Get form analytics
 */
router.get('/:id/analytics', requireAuth, async (req: Request, res: Response) => {
  try {
    const organizationId = (req as any).user.organization_id;
    const { id } = req.params;

    const form = await formBuilderService.getFormById(id, organizationId);
    if (!form) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Form not found' },
      });
    }

    const analytics = await formBuilderService.getFormAnalytics(id, organizationId);

    res.json({
      data: analytics,
      meta: { timestamp: new Date().toISOString() },
    });
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('Get form analytics error:', error);
    res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: 'Failed to get analytics' },
    });
  }
});

// ============================================================================
// Public Form Routes (Unauthenticated)
// ============================================================================

/**
 * GET /api/public/forms/:id
 * Get public form definition for rendering
 */
router.get('/public/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const form = await formBuilderService.getPublicForm(id);

    if (!form) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Form not found' },
      });
    }

    // Track form view
    await formBuilderService.trackFormView(id);

    res.json({
      data: form,
      meta: { timestamp: new Date().toISOString() },
    });
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('Get public form error:', error);
    res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: 'Failed to get form' },
    });
  }
});

/**
 * POST /api/public/forms/:id/submit
 * Submit a public form
 */
router.post('/public/:id/submit', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { data, landingPageId, campaignId, sourceUrl, utmParams } = req.body;

    if (!data || typeof data !== 'object') {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'Form data is required' },
      });
    }

    // Validate submission
    const validation = await formBuilderService.validateSubmission(id, data);

    if (!validation.valid) {
      return res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Form validation failed',
          details: validation.errors,
        },
      });
    }

    // Get form to access settings
    const form = await formBuilderService.getFormById(id);

    // Submit form
    const submission = await formBuilderService.submitForm(id, data, {
      landingPageId,
      campaignId,
      sourceUrl: sourceUrl || req.headers.referer,
      utmParams: utmParams || {},
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    res.status(201).json({
      data: {
        submissionId: submission.id,
        success: true,
        message: form?.settings?.successMessage || 'Form submitted successfully',
        redirectUrl: form?.settings?.redirectUrl,
      },
      meta: { timestamp: new Date().toISOString() },
    });
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('Submit form error:', error);
    res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: err.message || 'Failed to submit form' },
    });
  }
});

export default router;
