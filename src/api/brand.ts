import { Router, Request, Response } from 'express';
import { brandExtractionService } from '../services/brandExtractionService.js';
import { requireAuth } from '../middleware/auth.js';
import { requireOrganization } from '../middleware/multiTenancy.js';

const router = Router();

router.post('/extract', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: { code: 'INVALID_INPUT', message: 'url required' } });
  const user = req.user!;
  const { jobId } = await brandExtractionService.startScan(user.id, url);
  res.json({ jobId });
});

router.get('/extract/:id', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const data = await brandExtractionService.getScan(req.params.id);
    res.json(data);
  } catch (e: any) {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: e.message } });
  }
});

router.post('/approve', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  const { id, tokens } = req.body || {};
  if (!id || !tokens) return res.status(400).json({ error: { code: 'INVALID_INPUT', message: 'id and tokens required' } });
  const data = await brandExtractionService.approveTokens(id, tokens);
  res.json(data);
});

export default router;
