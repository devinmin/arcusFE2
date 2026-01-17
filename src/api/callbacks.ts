import { Router, Request, Response } from 'express';
import { logger } from '../utils/logger.js';
import { pool } from '../database/db.js';

const router = Router();

/**
 * Correlate a callback taskId to a deliverable and update media URLs
 */
async function correlateAndPersist(
  taskId: string,
  mediaUrl: string,
  thumbnailUrl?: string,
  metadata?: Record<string, unknown>
): Promise<{ deliverableId?: string; success: boolean }> {
  try {
    // First, check if we have a pending media generation task with this taskId
    // The taskId would be stored in deliverables.metadata.pendingMediaTaskId
    const { rows: deliverables } = await pool.query(
      `SELECT id, metadata FROM deliverables
       WHERE metadata->>'pendingMediaTaskId' = $1
       OR metadata->'media'->>'taskId' = $1
       LIMIT 1`,
      [taskId]
    );

    if (deliverables.length > 0) {
      const deliverable = deliverables[0];
      const existingMetadata = deliverable.metadata || {};

      // Update the deliverable with the final media URL
      const updatedMetadata = {
        ...existingMetadata,
        mediaUrl,
        thumbnailUrl,
        mediaStatus: 'completed',
        mediaCompletedAt: new Date().toISOString(),
        callbackMetadata: metadata
      };

      // Remove pending task ID since it's now complete
      delete updatedMetadata.pendingMediaTaskId;

      await pool.query(
        `UPDATE deliverables
         SET metadata = $1, updated_at = NOW()
         WHERE id = $2`,
        [JSON.stringify(updatedMetadata), deliverable.id]
      );

      logger.info(`[Callback] Updated deliverable ${deliverable.id} with media URL`, {
        taskId,
        deliverableId: deliverable.id,
        mediaUrl
      });

      return { deliverableId: deliverable.id, success: true };
    }

    // Also check media_assets table
    const { rows: assets } = await pool.query(
      `SELECT id FROM media_assets WHERE external_id = $1 LIMIT 1`,
      [taskId]
    );

    if (assets.length > 0) {
      await pool.query(
        `UPDATE media_assets
         SET url = $1, thumbnail_url = $2, status = 'completed', updated_at = NOW()
         WHERE id = $3`,
        [mediaUrl, thumbnailUrl, assets[0].id]
      );

      logger.info(`[Callback] Updated media_asset ${assets[0].id} with final URL`, {
        taskId,
        assetId: assets[0].id
      });

      return { success: true };
    }

    logger.warn(`[Callback] No deliverable/asset found for taskId: ${taskId}`);
    return { success: false };
  } catch (error: unknown) {
    const err = error as Error;
    logger.error(`[Callback] Failed to correlate taskId ${taskId}:`, err.message);
    return { success: false };
  }
}

// Kie.ai Veo callback receiver (configure your callBackUrl to point here)
router.post('/kie/veo', async (req: Request, res: Response) => {
  try {
    const payload = req.body;
    logger.info('Received Kie.ai Veo callback', payload);

    // Extract taskId and media URLs from callback payload
    // Kie.ai typically sends: { taskId, status, videoUrl, thumbnailUrl, ... }
    const { taskId, status, videoUrl, thumbnailUrl, error } = payload;

    if (!taskId) {
      return res.status(400).json({ error: 'Missing taskId in callback' });
    }

    if (status === 'completed' && videoUrl) {
      const result = await correlateAndPersist(taskId, videoUrl, thumbnailUrl, {
        provider: 'kie.ai',
        originalPayload: payload
      });

      res.status(200).json({
        status: 'received',
        correlated: result.success,
        deliverableId: result.deliverableId
      });
    } else if (status === 'failed') {
      logger.warn(`[Callback] Kie.ai task ${taskId} failed:`, error);

      // Update deliverable status to failed
      await pool.query(
        `UPDATE deliverables
         SET metadata = jsonb_set(
           COALESCE(metadata, '{}'::jsonb),
           '{mediaStatus}',
           '"failed"'
         )
         WHERE metadata->>'pendingMediaTaskId' = $1`,
        [taskId]
      );

      res.status(200).json({ status: 'received', taskFailed: true });
    } else {
      // Pending or processing status - just acknowledge
      res.status(200).json({ status: 'received' });
    }
  } catch (e: any) {
    logger.error('[Callback] Error processing Kie.ai callback:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// Generic video callback for other providers (Runway, Luma, etc.)
router.post('/video/:provider', async (req: Request, res: Response) => {
  try {
    const { provider } = req.params;
    const payload = req.body;
    logger.info(`Received ${provider} video callback`, payload);

    const { taskId, videoUrl, thumbnailUrl, status } = payload;

    if (taskId && status === 'completed' && videoUrl) {
      const result = await correlateAndPersist(taskId, videoUrl, thumbnailUrl, {
        provider,
        originalPayload: payload
      });

      return res.status(200).json({
        status: 'received',
        correlated: result.success
      });
    }

    res.status(200).json({ status: 'received' });
  } catch (e: any) {
    logger.error('[Callback] Error processing video callback:', e.message);
    res.status(500).json({ error: e.message });
  }
});

export default router;
