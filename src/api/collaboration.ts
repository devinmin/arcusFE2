/**
 * Collaboration Routes
 *
 * HTTP endpoints for presentation collaboration features.
 * Real-time communication is handled via Socket.io.
 */

import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requireOrganization } from '../middleware/multiTenancy.js';
import {
  collaborationService,
  createShareLink,
  getShareByToken,
  revokeShare,
  getDeliverableShares,
  getCommentsByDeliverable,
  addCommentHTTP,
  resolveCommentHTTP,
} from '../services/collaborationService.js';
import { pool } from '../database/db.js';
import { logger } from '../utils/logger.js';

const router = Router();

// ============================================================================
// Session Routes
// ============================================================================

/**
 * POST /api/presentations/:deliverableId/sessions
 * Start or get active collaboration session
 */
router.post('/:deliverableId/sessions', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const organizationId = (req as any).user.organization_id;
    const { deliverableId } = req.params;

    // Verify ownership
    const { rows } = await pool.query(
      `SELECT d.id FROM deliverables d
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

    // Session management is handled by Socket.io
    // Return connection instructions
    res.json({
      data: {
        socketUrl: process.env.SOCKET_URL || '/',
        deliverableId,
        organizationId,
        message: 'Connect via Socket.io with auth token to join session',
      },
      meta: { timestamp: new Date().toISOString() },
    });
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('Start session error:', error);
    res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: 'Failed to start session' },
    });
  }
});

// ============================================================================
// Comment Routes
// ============================================================================

/**
 * GET /api/presentations/:deliverableId/comments
 * Get all comments for a presentation
 */
router.get('/:deliverableId/comments', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const organizationId = (req as any).user.organization_id;
    const { deliverableId } = req.params;

    // Verify ownership
    const { rows } = await pool.query(
      `SELECT d.id FROM deliverables d
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

    const comments = await getCommentsByDeliverable(deliverableId, organizationId);

    res.json({
      data: { comments },
      meta: { timestamp: new Date().toISOString() },
    });
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('Get comments error:', error);
    res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: 'Failed to get comments' },
    });
  }
});

/**
 * POST /api/presentations/:deliverableId/comments
 * Add a comment to a presentation
 */
router.post('/:deliverableId/comments', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const userName = (req as any).user.name || (req as any).user.email?.split('@')[0] || 'User';
    const organizationId = (req as any).user.organization_id;
    const { deliverableId } = req.params;
    const { slideId, content, positionX, positionY, parentCommentId } = req.body;

    if (!slideId || !content) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'slideId and content are required' },
      });
    }

    // Verify ownership
    const { rows } = await pool.query(
      `SELECT d.id FROM deliverables d
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

    const comment = await addCommentHTTP(deliverableId, organizationId, userId, userName, {
      slideId,
      content,
      positionX,
      positionY,
      parentCommentId,
    });

    res.status(201).json({
      data: comment,
      meta: { timestamp: new Date().toISOString() },
    });
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('Add comment error:', error);
    res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: 'Failed to add comment' },
    });
  }
});

/**
 * PATCH /api/presentations/comments/:id/resolve
 * Resolve a comment
 */
router.patch('/comments/:id/resolve', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    await resolveCommentHTTP(id);

    res.json({
      data: { success: true },
      meta: { timestamp: new Date().toISOString() },
    });
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('Resolve comment error:', error);
    res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: 'Failed to resolve comment' },
    });
  }
});

// ============================================================================
// Sharing Routes
// ============================================================================

/**
 * POST /api/presentations/:deliverableId/share
 * Create a share link
 */
router.post('/:deliverableId/share', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const organizationId = (req as any).user.organization_id;
    const { deliverableId } = req.params;
    const { sharedWithEmail, sharedWithUserId, permissionLevel, expiresInDays } = req.body;

    // Verify ownership
    const { rows } = await pool.query(
      `SELECT d.id FROM deliverables d
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

    const share = await createShareLink(deliverableId, organizationId, {
      sharedWithEmail,
      sharedWithUserId,
      permissionLevel,
      expiresInDays,
    });

    res.status(201).json({
      data: {
        ...share,
        shareUrl: `${process.env.FRONTEND_URL}/shared/${share.shareToken}`,
      },
      meta: { timestamp: new Date().toISOString() },
    });
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('Create share error:', error);
    res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: 'Failed to create share link' },
    });
  }
});

/**
 * GET /api/presentations/:deliverableId/shares
 * Get all shares for a presentation
 */
router.get('/:deliverableId/shares', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const organizationId = (req as any).user.organization_id;
    const { deliverableId } = req.params;

    // Verify ownership
    const { rows } = await pool.query(
      `SELECT d.id FROM deliverables d
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

    const shares = await getDeliverableShares(deliverableId, organizationId);

    res.json({
      data: { shares },
      meta: { timestamp: new Date().toISOString() },
    });
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('Get shares error:', error);
    res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: 'Failed to get shares' },
    });
  }
});

/**
 * DELETE /api/presentations/shares/:id
 * Revoke a share
 */
router.delete('/shares/:id', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const organizationId = (req as any).user.organization_id;
    const { id } = req.params;

    await revokeShare(id, organizationId);

    res.json({
      data: { success: true },
      meta: { timestamp: new Date().toISOString() },
    });
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('Revoke share error:', error);
    res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: 'Failed to revoke share' },
    });
  }
});

/**
 * GET /api/presentations/shared/:token
 * Access a presentation via share token
 */
router.get('/shared/:token', async (req: Request, res: Response) => {
  try {
    const { token } = req.params;

    const share = await getShareByToken(token);

    if (!share) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Share not found or expired' },
      });
    }

    // Get deliverable info
    const { rows } = await pool.query(
      `SELECT d.id, d.type, d.metadata, d.file_path
       FROM deliverables d
       WHERE d.id = $1`,
      [share.deliverableId]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Deliverable not found' },
      });
    }

    res.json({
      data: {
        deliverable: rows[0],
        permissionLevel: share.permissionLevel,
      },
      meta: { timestamp: new Date().toISOString() },
    });
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('Access shared error:', error);
    res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: 'Failed to access shared content' },
    });
  }
});

export default router;
