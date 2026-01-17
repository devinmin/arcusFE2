import { Router, Request, Response } from 'express';
import { avatarService } from '../services/avatarService.js';
import { requireAuth } from '../middleware/auth.js';
import { requireOrganization } from '../middleware/multiTenancy.js';

const router = Router();

// SEC-004 FIX: All avatar routes require authentication and organization context
router.use(requireAuth);
router.use(requireOrganization);

/**
 * POST /avatar/session
 * Start a new avatar session (live, mic, record, or script mode).
 */
router.post('/session', async (req: Request, res: Response) => {
  const { avatarId, mode, script, refImageUrl, deliverableId, workspaceId } = req.body || {};
  
  if (!avatarId) {
    return res.status(400).json({ error: { code: 'INVALID_INPUT', message: 'avatarId required' } });
  }
  
  const validModes = ['live', 'mic', 'record', 'script'];
  if (!mode || !validModes.includes(mode)) {
    return res.status(400).json({ error: { code: 'INVALID_INPUT', message: 'mode must be one of: live, mic, record, script' } });
  }

  try {
    const session = await avatarService.startSession({
      avatarId,
      mode,
      script,
      refImageUrl,
      deliverableId,
      workspaceId
    });
    res.json(session);
  } catch (e: any) {
    if (e.message.includes('not enabled')) {
      return res.status(403).json({ error: { code: 'FEATURE_DISABLED', message: e.message } });
    }
    if (e.message.includes('Script required') || e.message.includes('SFU')) {
      return res.status(400).json({ error: { code: 'INVALID_INPUT', message: e.message } });
    }
    res.status(500).json({ error: { code: 'SESSION_FAILED', message: e.message } });
  }
});

/**
 * GET /avatar/session/:id
 * Get session status by ID.
 */
router.get('/session/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    const session = await avatarService.getSession(id);
    res.json(session);
  } catch (e: any) {
    if (e.message === 'Session not found') {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Session not found' } });
    }
    res.status(500).json({ error: { code: 'DB_ERROR', message: e.message } });
  }
});

/**
 * POST /avatar/session/:id/end
 * End an active session.
 */
router.post('/session/:id/end', async (req: Request, res: Response) => {
  const { id } = req.params;
  const { saveRecording } = req.body || {};
  
  try {
    const session = await avatarService.endSession(id, saveRecording);
    res.json(session);
  } catch (e: any) {
    if (e.message === 'Session not found') {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Session not found' } });
    }
    res.status(500).json({ error: { code: 'END_FAILED', message: e.message } });
  }
});

/**
 * POST /avatar/session/:id/metrics
 * Report QoS metrics from SFU.
 */
router.post('/session/:id/metrics', async (req: Request, res: Response) => {
  const { id } = req.params;
  const { glassToglassP95Ms, frameCount, totalDurationMs } = req.body || {};
  
  try {
    await avatarService.reportMetrics(id, { glassToglassP95Ms, frameCount, totalDurationMs });
    res.json({ success: true });
  } catch (e: any) {
    if (e.message === 'Session not found') {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Session not found' } });
    }
    res.status(500).json({ error: { code: 'METRICS_FAILED', message: e.message } });
  }
});

/**
 * GET /avatar/sessions
 * List sessions for a workspace.
 */
router.get('/sessions', async (req: Request, res: Response) => {
  const { limit } = req.query;
  try {
    const sessions = await avatarService.listSessions(
      limit ? parseInt(limit as string, 10) : 50
    );
    res.json({ sessions });
  } catch (e: any) {
    res.status(500).json({ error: { code: 'DB_ERROR', message: e.message } });
  }
});

export default router;
