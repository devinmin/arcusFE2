import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requireOrganization } from '../middleware/multiTenancy.js';
import { pool } from '../database/db.js';
import path from 'path';
import fs from 'fs';
import { logger } from '../utils/logger.js';
import { orchestrator } from '../services/orchestrator.js';
import { DeliverableService } from '../services/deliverableService.js';
import { evaluateDeliverable, improveText } from '../services/qualityService.js';
import { runHardValidators } from '../services/validators.js';
import { deliverableModificationService } from '../services/deliverableModificationService.js';
import { recordRevisionRequest, recordDeliverableApproval } from '../services/qualityFeedbackHooks.js';
import { auditService } from '../services/auditService.js';
import { memoryService } from '../services/memoryService.js';

const router = Router();

/**
 * GET /api/deliverables
 * List deliverables for authenticated user - requires authentication (SEC-001 fix)
 */
router.get('/', requireAuth, requireOrganization, async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.id;
        const { rows } = await pool.query(
            `SELECT d.id, d.task_id, d.type, d.metadata, d.created_at
             FROM deliverables d
             JOIN tasks t ON t.id = d.task_id
             JOIN workflows w ON w.id = t.workflow_id
             WHERE w.user_id = $1
             ORDER BY d.created_at DESC
             LIMIT 50`,
            [userId]
        );
        res.json({
            data: { deliverables: rows },
            meta: { timestamp: new Date().toISOString(), total: rows.length }
        });
    } catch (error: unknown) {
    const err = error as Error;
        logger.error('List deliverables error:', error);
        res.status(500).json({
            error: { code: 'INTERNAL_ERROR', message: 'Failed to list deliverables' }
        });
    }
});

function contentTypeForExtension(ext: string): string {
  const map: Record<string, string> = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.mov': 'video/quicktime',
    '.md': 'text/markdown; charset=utf-8',
    '.html': 'text/html; charset=utf-8',
    '.txt': 'text/plain; charset=utf-8'
  };
  return map[ext.toLowerCase()] || 'application/octet-stream';
}

// Get deliverable metadata (ensures ownership)
router.get('/:id', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const { id } = req.params;

    const { rows } = await pool.query(
      `SELECT d.id, d.task_id, d.type, d.file_path, d.metadata, d.created_at
       FROM deliverables d
       JOIN tasks t ON t.id = d.task_id
       JOIN workflows w ON w.id = t.workflow_id
       WHERE d.id = $1 AND w.user_id = $2`,
      [id, userId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Deliverable not found' } });
    }

    const row = rows[0];
    const ext = path.extname(row.file_path);
    const isBinary = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.mp4', '.mov', '.webm'].includes(ext.toLowerCase());

    res.json({
      id: row.id,
      task_id: row.task_id,
      type: row.type,
      created_at: row.created_at,
      metadata: row.metadata,
      filename: path.basename(row.file_path),
      binary: isBinary,
      download_url: `/api/deliverables/${row.id}/download`
    });
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('Get deliverable metadata error:', error);
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch deliverable' } });
  }
});

// Download/stream deliverable file
router.get('/:id/download', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const { id } = req.params;

    const { rows } = await pool.query(
      `SELECT d.file_path, d.type
       FROM deliverables d
       JOIN tasks t ON t.id = d.task_id
       JOIN workflows w ON w.id = t.workflow_id
       WHERE d.id = $1 AND w.user_id = $2`,
      [id, userId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Deliverable not found' } });
    }

    const filePath = rows[0].file_path as string;

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'File not found' } });
    }

    const ext = path.extname(filePath);
    res.setHeader('Content-Type', contentTypeForExtension(ext));
    res.setHeader('Content-Disposition', `inline; filename="${path.basename(filePath)}"`);

    res.sendFile(path.resolve(filePath));
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('Deliverable download error:', error);
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to download deliverable' } });
  }
});

/**
 * POST /api/deliverables/:id/revise
 * Start a revision workflow for a deliverable based on natural-language instruction
 */
// Traces for a deliverable
router.get('/:id/traces', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const { id } = req.params;
    // Ownership check via join
    const own = await pool.query(
      `SELECT 1
       FROM deliverables d
       JOIN tasks t ON t.id = d.task_id
       JOIN workflows w ON w.id = t.workflow_id
       WHERE d.id = $1 AND w.user_id = $2 LIMIT 1`,
      [id, userId]
    );
    if (own.rowCount === 0) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Deliverable not found' } });

    const { rows } = await pool.query(
      `SELECT id, kind, payload, created_at FROM deliverable_traces WHERE deliverable_id = $1 ORDER BY created_at DESC LIMIT 500`,
      [id]
    );
    res.json({ traces: rows });
  } catch (e: any) {
    res.status(500).json({ error: { code: 'DB_ERROR', message: e.message } });
  }
});

/**
 * POST /api/deliverables/:id/modify
 * Direct natural language modification - processes immediately without workflow
 * This is the conversational "Hey Arcus, make this flashier" endpoint
 */
router.post('/:id/modify', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const { id } = req.params;
    const { instruction } = req.body || {};

    if (!instruction || typeof instruction !== 'string') {
      return res.status(400).json({ error: { code: 'INVALID_INPUT', message: 'instruction is required' } });
    }

    logger.info(`[Deliverables] Modify request for ${id}: "${instruction}"`);

    const result = await deliverableModificationService.processModification({
      deliverableId: id as string,
      instruction,
      userId,
      mode: 'direct',
    });

    if (result.success) {
      // Record revision request for quality learning (non-blocking)
      recordRevisionRequest(id as string, userId, instruction).catch(err =>
        logger.warn('[Deliverables] Failed to record revision feedback', { err: err.message })
      );

      // DATA MOAT: Record iteration for learning (non-blocking)
      setImmediate(async () => {
        try {
          // Get deliverable and organization context
          const { rows } = await pool.query(
            `SELECT d.organization_id, d.campaign_id, d.type, d.content, d.iteration_count
             FROM deliverables d WHERE d.id = $1`,
            [id]
          );

          if (rows.length > 0) {
            const del = rows[0];

            // Log to audit trail
            await auditService.log({
              eventType: 'deliverable.iterate',
              category: 'deliverable',
              action: 'iterate',
              description: `Deliverable modification requested: "${instruction.substring(0, 100)}..."`,
              actorId: userId,
              actorType: 'user',
              organizationId: del.organization_id,
              entityType: 'deliverable',
              entityId: id as string,
              metadata: {
                instruction,
                action: result.action,
                newDeliverableId: result.newDeliverableId,
                iterationCount: del.iteration_count + 1
              }
            });

            // Record interaction for memory system
            await memoryService.recordInteraction({
              organizationId: del.organization_id,
              interactionType: 'iteration',
              outcome: 'iterated',
              deliverableId: id as string,
              campaignId: del.campaign_id,
              originalContent: typeof del.content === 'string' ? del.content : JSON.stringify(del.content),
              feedbackContent: instruction,
              userId,
              deliverableType: del.type,
              iterationCount: del.iteration_count + 1
            });
          }
        } catch (error: unknown) {
    const err = error as Error;
          logger.warn('[Deliverables] Failed to record modification data', { error });
        }
      });

      return res.json({
        success: true,
        action: result.action,
        message: result.message,
        newDeliverableId: result.newDeliverableId,
        previewUrl: result.previewUrl,
        estimatedTime: result.estimatedTime,
        details: result.details,
      });
    } else {
      return res.status(422).json({
        success: false,
        error: { code: 'MODIFICATION_FAILED', message: result.message },
        details: result.details,
      });
    }
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('Modify deliverable error:', error);
    return res.status(500).json({ error: { code: 'MODIFICATION_FAILED', message: err.message || 'Failed to modify' } });
  }
});

/**
 * GET /api/deliverables/:id/suggestions
 * Get AI-powered suggestions for how to improve this deliverable
 */
router.get('/:id/suggestions', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const { id } = req.params;

    const suggestions = await deliverableModificationService.getSuggestions(id as string, userId);
    return res.json({ suggestions });
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('Get suggestions error:', error);
    return res.status(500).json({ error: { code: 'SUGGESTIONS_FAILED', message: err.message } });
  }
});

/**
 * GET /api/deliverables/:id/history
 * Get modification history for undo/review
 */
router.get('/:id/history', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const { id } = req.params;

    const history = await deliverableModificationService.getModificationHistory(id as string, userId);
    return res.json({ history });
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('Get history error:', error);
    return res.status(500).json({ error: { code: 'HISTORY_FAILED', message: err.message } });
  }
});

router.post('/:id/revise', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const { id } = req.params;
    const { instruction, targetVariant, mode } = req.body || {};
    if (!instruction || typeof instruction !== 'string') {
      return res.status(400).json({ error: { code: 'INVALID_INPUT', message: 'instruction is required' } });
    }

    // If mode is 'direct', use the new modification service for immediate processing
    if (mode === 'direct') {
      const result = await deliverableModificationService.processModification({
        deliverableId: id as string,
        instruction,
        userId,
        mode: 'direct',
      });

      if (result.success) {
        return res.json({
          success: true,
          action: result.action,
          message: result.message,
          newDeliverableId: result.newDeliverableId,
          previewUrl: result.previewUrl,
        });
      } else {
        return res.status(422).json({ success: false, error: { code: 'REVISION_FAILED', message: result.message } });
      }
    }

    // Default: queue as workflow (background processing)
    const q = await pool.query(
      `SELECT w.id as workflow_id, w.project_id as project_id
       FROM deliverables d
       JOIN tasks t ON t.id = d.task_id
       JOIN workflows w ON w.id = t.workflow_id
       WHERE d.id = $1 LIMIT 1`,
      [id]
    );

    const projectId: string | null = q.rows[0]?.project_id || null;
    const goal = `Revise deliverable ${id}: ${instruction}` + (targetVariant?.aspect ? ` (aspect=${targetVariant.aspect})` : '');

    const result = await orchestrator.startWorkflow(userId, projectId, goal);

    // Mark deliverable as pending revision (optional metadata)
    try { await DeliverableService.updateMetadata(id as string, { status_hint: 'revising', last_instruction: instruction }); } catch {}

    return res.status(202).json({ success: true, workflowId: result.workflowId });
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('Revise deliverable error:', error);
    return res.status(500).json({ error: { code: 'REVISION_FAILED', message: err.message || 'Failed to start revision' } });
  }
});

/**
 * POST /api/deliverables/:id/variants
 * Request a pack of channel/aspect variants for a deliverable
 */
router.post('/:id/variants', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const { id } = req.params;
    const { pack, aspects } = req.body || {};
    if (!pack && (!aspects || !Array.isArray(aspects))) {
      return res.status(400).json({ error: { code: 'INVALID_INPUT', message: 'pack or aspects[] required' } });
    }

    const q = await pool.query(
      `SELECT w.project_id as project_id
       FROM deliverables d
       JOIN tasks t ON t.id = d.task_id
       JOIN workflows w ON w.id = t.workflow_id
       WHERE d.id = $1 LIMIT 1`,
      [id]
    );
    const projectId: string | null = q.rows[0]?.project_id || null;

    const goal = `Create variants for deliverable ${id}: ` + (pack ? `pack=${pack}` : `aspects=${(aspects||[]).join(',')}`);
    const result = await orchestrator.startWorkflow(userId, projectId, goal);

    try { await DeliverableService.updateMetadata(id as string, { status_hint: 'variants_requested', variant_pack: pack || aspects }); } catch {}

    return res.status(202).json({ success: true, workflowId: result.workflowId });
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('Variants request error:', error);
    return res.status(500).json({ error: { code: 'VARIANTS_FAILED', message: err.message || 'Failed to request variants' } });
  }
});

/**
 * POST /api/deliverables/publish
 * Publish or schedule publishing of a deliverable to a target
 */
router.post('/publish', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const { deliverable_id, target, when, metadata } = req.body || {};
    if (!deliverable_id || !target) {
      return res.status(400).json({ error: { code: 'INVALID_INPUT', message: 'deliverable_id and target are required' } });
    }

    // Arcus-hosted = immediate URL
    let url: string | undefined;
    const lower = String(target).toLowerCase();
    if (lower === 'arcus_hosted') {
      url = `/api/deliverables/${deliverable_id}/download`;
      await DeliverableService.updateMetadata(deliverable_id, { published: { target: 'arcus_hosted', url, at: new Date().toISOString() } });

      // Record approval for quality learning (non-blocking)
      recordDeliverableApproval(deliverable_id, userId, 'Published to Arcus').catch(err =>
        logger.warn('[Deliverables] Failed to record approval feedback', { err: err.message })
      );

      return res.json({ success: true, url });
    }

    // Webflow direct publish via Composio (best-effort)
    if (lower === 'webflow') {
      try {
        const { composioService } = await import('../services/composioService.js');
        // Minimal payload: site/collection identifiers should be set in metadata or env.
        const meta = (metadata || {}) as any;
        const payload = {
          site_id: meta.site_id,
          collection_id: meta.collection_id,
          item: {
            name: meta.title || 'Arcus Post',
            slug: meta.slug || `arcus-post-${Date.now()}`,
            _archived: false,
            _draft: false,
            body: meta.html || meta.body || '',
            description: meta.description || ''
          }
        };
        const result = await composioService.executeAction((req as any).user.id, 'webflow', 'create_cms_item', payload);
        const itemUrl = result?.item?.url || result?.url || undefined;
        await DeliverableService.updateMetadata(deliverable_id, { published: { target: 'webflow', url: itemUrl, at: new Date().toISOString() } });
        return res.json({ success: true, url: itemUrl });
      } catch (e) {
        logger.warn('Webflow direct publish failed, falling back to workflow', e);
        // fallthrough to workflow enqueue
      }
    }

    // For other targets (or Webflow fallback), enqueue a workflow for publishing
    const q = await pool.query(
      `SELECT w.project_id as project_id
       FROM deliverables d
       JOIN tasks t ON t.id = d.task_id
       JOIN workflows w ON w.id = t.workflow_id
       WHERE d.id = $1 LIMIT 1`,
      [deliverable_id]
    );
    const projectId: string | null = q.rows[0]?.project_id || null;

    const scheduleNote = when ? ` at ${when}` : '';
    const goal = `Publish deliverable ${deliverable_id} to ${target}${scheduleNote}`;
    const result = await orchestrator.startWorkflow(userId, projectId, goal);

    try { await DeliverableService.updateMetadata(deliverable_id, { publish_requested: { target, when, metadata, workflowId: result.workflowId } }); } catch {}

    return res.status(202).json({ success: true, workflowId: result.workflowId });
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('Publish error:', error);
    return res.status(500).json({ error: { code: 'PUBLISH_FAILED', message: err.message || 'Failed to publish' } });
  }
});

/**
 * PATCH /api/deliverables/:id/metadata
 * Merge-patch metadata for a deliverable
 */
router.patch('/:id/metadata', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const { id } = req.params;
    const patch = req.body || {};

    // Verify deliverable belongs to the user via workflow ownership
    const { rows } = await pool.query(
      `SELECT w.user_id FROM deliverables d
       JOIN tasks t ON t.id = d.task_id
       JOIN workflows w ON w.id = t.workflow_id
       WHERE d.id = $1 LIMIT 1`,
      [id]
    );
    if (rows.length === 0 || rows[0].user_id !== userId) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Deliverable not found' } });
    }

    await DeliverableService.updateMetadata(id as string, patch);
    res.json({ success: true });
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('Update deliverable metadata failed:', error);
    res.status(500).json({ error: { code: 'UPDATE_FAILED', message: err.message || 'Failed to update metadata' } });
  }
});

/**
 * POST /api/deliverables/:id/approve
 * Approve a deliverable for publication
 * Marks the deliverable as approved and optionally records feedback
 */
router.post('/:id/approve', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const { id } = req.params;
    const { feedback, autoPublish } = req.body;

    // Verify deliverable belongs to the user via workflow ownership
    const { rows } = await pool.query(
      `SELECT d.id, d.task_id, d.type, w.id as workflow_id, w.project_id
       FROM deliverables d
       JOIN tasks t ON t.id = d.task_id
       JOIN workflows w ON w.id = t.workflow_id
       WHERE d.id = $1 AND w.user_id = $2
       LIMIT 1`,
      [id, userId]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Deliverable not found' }
      });
    }

    const deliverable = rows[0];

    // Update deliverable metadata to mark as approved
    await DeliverableService.updateMetadata(id as string, {
      status: 'approved',
      approved_at: new Date().toISOString(),
      approved_by: userId,
      approval_feedback: feedback || null
    });

    // Record approval for quality learning (non-blocking)
    recordDeliverableApproval(id as string, userId, feedback || 'Approved').catch(err =>
      logger.warn('[Deliverables] Failed to record approval feedback', { err: err.message })
    );

    logger.info(`Deliverable approved: ${id} by user ${userId}`);

    // If autoPublish is requested, trigger publish workflow
    let publishResult = null;
    if (autoPublish) {
      try {
        // Trigger publish to default target (Arcus hosted)
        const url = `/api/deliverables/${id}/download`;
        await DeliverableService.updateMetadata(id as string, {
          published: {
            target: 'arcus_hosted',
            url,
            at: new Date().toISOString()
          }
        });
        publishResult = { target: 'arcus_hosted', url };
        logger.info(`Deliverable auto-published: ${id}`);
      } catch (publishError) {
        logger.warn('Auto-publish failed:', publishError);
        // Non-fatal - approval still succeeded
      }
    }

    res.json({
      success: true,
      deliverable_id: id,
      status: 'approved',
      message: 'Deliverable approved successfully',
      published: publishResult
    });
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('Approve deliverable error:', error);
    return res.status(500).json({
      error: { code: 'APPROVAL_FAILED', message: err.message || 'Failed to approve deliverable' }
    });
  }
});

/**
 * POST /api/deliverables/:id/fix-and-recheck
 * Auto-fix minor issues and re-evaluate gates. Returns the new revision's id and status.
 */
router.post('/:id/fix-and-recheck', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const { id } = req.params;

    // Fetch deliverable with ownership
    const q = await pool.query(
      `SELECT d.id, d.type, d.file_path, d.metadata, t.id as task_id, w.id as workflow_id, w.project_id
       FROM deliverables d
       JOIN tasks t ON t.id = d.task_id
       JOIN workflows w ON w.id = t.workflow_id
       WHERE d.id = $1 AND w.user_id = $2
       LIMIT 1`,
      [id, userId]
    );
    if (q.rowCount === 0) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Deliverable not found' } });

    const row = q.rows[0];
    const ext = path.extname(row.file_path).toLowerCase();
    const isBinary = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.mp4', '.mov', '.webm'].includes(ext);
    if (isBinary) return res.status(400).json({ error: { code: 'UNSUPPORTED', message: 'Auto-fix supported for text deliverables only' } });

    // Read content
    let content = '';
    try { content = fs.readFileSync(row.file_path, 'utf-8'); } catch (e) { return res.status(500).json({ error: { code: 'READ_FAILED', message: 'Failed to read deliverable content' } }); }

    // Build minimal project context (brand guidelines)
    let projectContext: any = {};
    if (row.project_id) {
      try {
        const pc = await pool.query(`SELECT cl.brand_guidelines FROM campaigns c JOIN clients cl ON cl.id = c.client_id WHERE c.id = $1`, [row.project_id]);
        if ((pc.rowCount ?? 0) > 0) projectContext.brandGuidelines = pc.rows[0].brand_guidelines;
      } catch {}
    }

    // Evaluate current content to get suggestions (fallback if none in metadata)
    let qc = await evaluateDeliverable({ type: row.type, title: row.metadata?.title, content }, projectContext);
    const suggestions: string[] = Array.isArray(row.metadata?.quality?.suggestions) && row.metadata.quality.suggestions.length > 0
      ? row.metadata.quality.suggestions
      : (qc.suggestions || ['Improve clarity, brand tone match, and platform readiness.']);

    // Improve
    const improved = await improveText(content, suggestions, projectContext);

    // Save revision
    const revId = await DeliverableService.saveDeliverable(row.task_id, row.type, improved, { ...row.metadata, revision_of: row.id, fixed_by: 'auto_fix' });

    // Re-evaluate and run hard validators
    qc = await evaluateDeliverable({ type: row.type, title: row.metadata?.title, content: improved }, projectContext);
    const validators = await runHardValidators({ type: row.type, title: row.metadata?.title, content: improved }, projectContext);
    await DeliverableService.updateMetadata(revId, { quality: { ...qc, evaluated_at: new Date().toISOString() }, validators });

    // Link revision id on original (optional)
    try { await DeliverableService.updateMetadata(row.id, { last_revision_id: revId }); } catch {}

    return res.json({ success: true, revision_id: revId, verified: qc.pass && validators.every(v => v.pass), quality: qc, validators });
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('Fix-and-recheck error:', error);
    return res.status(500).json({ error: { code: 'FIX_FAILED', message: err.message || 'Failed to fix and recheck' } });
  }
});

export default router;
