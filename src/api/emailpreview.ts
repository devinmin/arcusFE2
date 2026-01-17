/**
 * Email Preview Routes
 *
 * Provides email client preview functionality using Litmus integration.
 * Supports caching for cost optimization.
 */

import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { litmusService, POPULAR_EMAIL_CLIENTS } from '../services/litmusService.js';
import { pool } from '../database/db.js';
import { logger } from '../utils/logger.js';

const router = Router();

/**
 * GET /api/email-preview/clients
 * Get available email clients for preview
 */
router.get('/clients', requireAuth, async (req: Request, res: Response) => {
  try {
    const { clients, popular } = await litmusService.getAvailableClients();

    res.json({
      data: {
        clients,
        popular,
        isConfigured: litmusService.isConfigured(),
      },
      meta: { timestamp: new Date().toISOString() },
    });
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('Get email clients error:', error);
    res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: 'Failed to get email clients' },
    });
  }
});

/**
 * POST /api/email-preview/create
 * Create a new email preview test
 */
router.post('/create', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const organizationId = (req as any).user.organization_id;
    const { deliverableId, htmlContent, subject, clientIds } = req.body;

    if (!deliverableId || !htmlContent) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'deliverableId and htmlContent are required' },
      });
    }

    // Verify user owns the deliverable
    const { rows } = await pool.query(
      `SELECT d.id, d.type
       FROM deliverables d
       JOIN tasks t ON t.id = d.task_id
       JOIN workflows w ON w.id = t.workflow_id
       WHERE d.id = $1 AND w.user_id = $2`,
      [deliverableId, userId]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Deliverable not found' },
      });
    }

    // Create preview
    const result = await litmusService.createPreview(
      deliverableId,
      htmlContent,
      subject || 'Email Preview',
      organizationId,
      clientIds || POPULAR_EMAIL_CLIENTS.map(c => c.id)
    );

    res.json({
      data: result,
      meta: { timestamp: new Date().toISOString() },
    });
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('Create email preview error:', error);
    res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: err.message || 'Failed to create email preview' },
    });
  }
});

/**
 * GET /api/email-preview/:id
 * Get preview results (poll for completion)
 */
router.get('/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const { id } = req.params;

    // Verify ownership through deliverable
    const { rows } = await pool.query(
      `SELECT ep.id
       FROM email_previews ep
       JOIN deliverables d ON d.id = ep.deliverable_id
       JOIN tasks t ON t.id = d.task_id
       JOIN workflows w ON w.id = t.workflow_id
       WHERE ep.id = $1 AND w.user_id = $2`,
      [id, userId]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Preview not found' },
      });
    }

    const result = await litmusService.getPreviewResults(id);

    res.json({
      data: result,
      meta: { timestamp: new Date().toISOString() },
    });
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('Get email preview error:', error);
    res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: err.message || 'Failed to get preview results' },
    });
  }
});

/**
 * GET /api/email-preview/deliverable/:deliverableId
 * Get latest preview for a deliverable
 */
router.get('/deliverable/:deliverableId', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const { deliverableId } = req.params;

    // Verify ownership
    const { rows } = await pool.query(
      `SELECT d.id
       FROM deliverables d
       JOIN tasks t ON t.id = d.task_id
       JOIN workflows w ON w.id = t.workflow_id
       WHERE d.id = $1 AND w.user_id = $2`,
      [deliverableId, userId]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Deliverable not found' },
      });
    }

    const result = await litmusService.getLatestPreview(deliverableId);

    if (!result) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'No preview found for this deliverable' },
      });
    }

    res.json({
      data: result,
      meta: { timestamp: new Date().toISOString() },
    });
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('Get latest preview error:', error);
    res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: err.message || 'Failed to get latest preview' },
    });
  }
});

/**
 * DELETE /api/email-preview/:id
 * Delete a preview
 */
router.delete('/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const { id } = req.params;

    // Verify ownership
    const { rows } = await pool.query(
      `SELECT ep.id
       FROM email_previews ep
       JOIN deliverables d ON d.id = ep.deliverable_id
       JOIN tasks t ON t.id = d.task_id
       JOIN workflows w ON w.id = t.workflow_id
       WHERE ep.id = $1 AND w.user_id = $2`,
      [id, userId]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Preview not found' },
      });
    }

    await litmusService.deletePreview(id);

    res.json({
      data: { success: true },
      meta: { timestamp: new Date().toISOString() },
    });
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('Delete email preview error:', error);
    res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: 'Failed to delete preview' },
    });
  }
});

export default router;
