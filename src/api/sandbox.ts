import { Router, Request, Response } from 'express';
import { sandboxService, SandboxTask } from '../services/sandboxService.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

// SEC-002: Removed 'code_execute' to prevent arbitrary code execution
// Only allow safe data transformation tasks
const VALID_TASKS: SandboxTask[] = ['html_to_markdown', 'csv_clean', 'file_transform'];

/**
 * POST /sandbox/run
 * Execute a sandbox task.
 */
router.post('/run', requireAuth, async (req: Request, res: Response) => {
  const { taskType, inputs } = req.body || {};
  
  if (!taskType) {
    return res.status(400).json({ error: { code: 'INVALID_INPUT', message: 'taskType required' } });
  }
  
  if (!VALID_TASKS.includes(taskType)) {
    return res.status(400).json({ 
      error: { code: 'INVALID_INPUT', message: `Invalid taskType. Valid: ${VALID_TASKS.join(', ')}` } 
    });
  }
  
  try {
    const result = await sandboxService.run(taskType, inputs || {});
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: { code: 'SANDBOX_FAILED', message: e.message } });
  }
});

/**
 * GET /sandbox/session/:id
 * Get status and results of a sandbox session.
 */
router.get('/session/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const session = await sandboxService.getSession(req.params.id);
    res.json(session);
  } catch (e: any) {
    if (e.message === 'Session not found') {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: e.message } });
    } else {
      res.status(500).json({ error: { code: 'SANDBOX_FAILED', message: e.message } });
    }
  }
});

/**
 * GET /sandbox/sessions
 * List recent sandbox sessions (for monitoring).
 */
router.get('/sessions', requireAuth, async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 20;
    const sessions = await sandboxService.listSessions(limit);
    res.json({ sessions });
  } catch (e: any) {
    res.status(500).json({ error: { code: 'SANDBOX_FAILED', message: e.message } });
  }
});

export default router;
