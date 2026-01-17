import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requireOrganization } from '../middleware/multiTenancy.js';
import { documentAnalysisService } from '../services/documentAnalysisService.js';
import { llmRouter } from '../services/llmRouter.js';
import { mediaAnalysisService } from '../services/mediaAnalysisService.js';
import { logger } from '../utils/logger.js';

const router = Router();

// POST /api/analysis/pdf
router.post('/pdf', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const { filePathOrUrl, prompt } = req.body;
    if (!filePathOrUrl || !prompt) {
      return res.status(400).json({ error: 'filePathOrUrl and prompt are required' });
    }
    const result = await documentAnalysisService.analyzeDocument(filePathOrUrl, prompt);
    res.json(result);
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('PDF analysis failed:', error);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/analysis/image
router.post('/image', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const { imageUrl, prompt } = req.body;
    if (!imageUrl || !prompt) {
      return res.status(400).json({ error: 'imageUrl and prompt are required' });
    }
    const result = await llmRouter.analyzeImage(prompt, imageUrl);
    res.json(result);
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('Image analysis failed:', error);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/analysis/audio
router.post('/audio', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const { filePathOrBase64, prompt, format } = req.body;
    if (!filePathOrBase64 || !prompt) {
      return res.status(400).json({ error: 'filePathOrBase64 and prompt are required' });
    }
    const result = await mediaAnalysisService.analyzeAudio(prompt, filePathOrBase64, format);
    res.json(result);
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('Audio analysis failed:', error);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/analysis/video
router.post('/video', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const { urlOrBase64, prompt } = req.body;
    if (!urlOrBase64 || !prompt) {
      return res.status(400).json({ error: 'urlOrBase64 and prompt are required' });
    }
    const result = await mediaAnalysisService.analyzeVideo(prompt, urlOrBase64);
    res.json(result);
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('Video analysis failed:', error);
    res.status(500).json({ error: err.message });
  }
});

export default router;
