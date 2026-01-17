import { Router, Request, Response } from 'express';
import { lovableExportService } from '../services/lovableExportService.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

/**
 * POST /api/lovable/export
 * Body: { artifactUrl: string, projectName: string }
 */
router.post('/export', requireAuth, async (req: Request, res: Response) => {
  try {
    const { artifactUrl, projectName } = req.body;
    if (!artifactUrl || !projectName) {
      return res.status(400).json({ error: 'artifactUrl and projectName are required' });
    }
    const filePath = await lovableExportService.exportFromUrl(artifactUrl, projectName);
    res.json({ success: true, filePath });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
