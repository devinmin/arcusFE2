import { Router, Request, Response } from 'express';
import { councilService } from '../services/councilService.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

/**
 * POST /council/run
 * Start a council run. If async=true in body, returns immediately with runId.
 * Otherwise blocks and returns full result.
 */
router.post('/run', requireAuth, async (req: Request, res: Response) => {
  const { prompt, context, importance, models, async: isAsync } = req.body || {};
  if (!prompt) return res.status(400).json({ error: { code: 'INVALID_INPUT', message: 'prompt required' } });
  
  const userId = req.user?.id;
  
  try {
    if (isAsync) {
      // Async mode: return immediately with runId for polling
      const { runId } = await councilService.startRun({ prompt, context, importance, models, userId });
      res.json({ runId, status: 'running' });
    } else {
      // Sync mode: block until complete
      const result = await councilService.run({ prompt, context, importance, models, userId });
      res.json(result);
    }
  } catch (e: any) {
    res.status(500).json({ error: { code: 'COUNCIL_FAILED', message: e.message } });
  }
});

/**
 * GET /council/run/:id
 * Get the status and results of a council run.
 */
router.get('/run/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const result = await councilService.getRunStatus(req.params.id);
    res.json(result);
  } catch (e: any) {
    if (e.message === 'Council run not found') {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: e.message } });
    } else {
      res.status(500).json({ error: { code: 'COUNCIL_FAILED', message: e.message } });
    }
  }
});

export default router;
