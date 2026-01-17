import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { MetaAdLibraryService } from '../services/metaAdLibraryService.js';
import { similarWebService } from '../services/similarWebService.js';
import { logger } from '../utils/logger.js';

const router = Router();

router.post('/meta-ads/search', requireAuth, async (req: Request, res: Response) => {
  try {
    const { term, country, status, limit } = req.body;
    if (!term) return res.status(400).json({ error: 'term is required' });
    const data = await MetaAdLibraryService.searchAdsByTerm(term, { country, ad_active_status: status, limit });
    res.json(data);
  } catch (e: any) {
    logger.error('Meta Ad search failed:', e);
    res.status(500).json({ error: e.message });
  }
});

router.post('/meta-ads/page', requireAuth, async (req: Request, res: Response) => {
  try {
    const { pageId, country, limit } = req.body;
    if (!pageId) return res.status(400).json({ error: 'pageId is required' });
    const data = await MetaAdLibraryService.adsByPage(pageId, { country, limit });
    res.json(data);
  } catch (e: any) {
    logger.error('Meta Ad by page failed:', e);
    res.status(500).json({ error: e.message });
  }
});

router.post('/similarweb/traffic', requireAuth, async (req: Request, res: Response) => {
  try {
    const { domain } = req.body;
    if (!domain) return res.status(400).json({ error: 'domain is required' });
    const data = await similarWebService.getTotalTraffic(domain);
    res.json(data);
  } catch (e: any) {
    logger.error('SimilarWeb traffic check failed:', e);
    res.status(500).json({ error: e.message });
  }
});

export default router;
