import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { composioService } from '../services/composioService.js';
import { pool } from '../database/db.js';
import { logger } from '../utils/logger.js';

const router = Router();

router.use(requireAuth);

/**
 * GET /api/cms/providers
 * List connected CMS-capable providers for this client (e.g. webflow, wordpress, ghost, shopify, squarespace)
 */
router.get('/providers', async (req: Request, res: Response) => {
  try {
    const tools = await composioService.getConnectedTools(req.user!.id);
    const cms = tools.filter(t => ['webflow','wordpress','ghost','shopify','squarespace'].includes(t));
    res.json({ providers: cms });
  } catch (e:any) {
    logger.error('Providers fetch failed', e);
    res.status(500).json({ error: { message: e.message || 'Failed to fetch providers' } });
  }
});

/**
 * GET /api/cms/webflow/sites
 * Proxy to Composio to list sites (if available for the client connection)
 */
router.get('/webflow/sites', async (req: Request, res: Response) => {
  try {
    const data = await composioService.executeAction(req.user!.id, 'webflow', 'list_sites', {});
    res.json({ sites: data?.sites || data || [] });
  } catch (e:any) {
    logger.error('Webflow sites fetch failed', e);
    res.status(500).json({ error: { message: e.message || 'Failed to fetch Webflow sites' } });
  }
});

/**
 * GET /api/cms/webflow/sites/:siteId/collections
 */
router.get('/webflow/sites/:siteId/collections', async (req: Request, res: Response) => {
  try {
    const data = await composioService.executeAction(req.user!.id, 'webflow', 'list_collections', { site_id: req.params.siteId });
    res.json({ collections: data?.collections || data || [] });
  } catch (e:any) {
    logger.error('Webflow collections fetch failed', e);
    res.status(500).json({ error: { message: e.message || 'Failed to fetch Webflow collections' } });
  }
});

/**
 * GET /api/cms/settings
 * Returns per-client CMS defaults (stored in composio_connections.metadata for the tool)
 */
router.get('/settings', async (req: Request, res: Response) => {
  try {
    const clientId = req.user!.id;
    const { rows } = await pool.query(
      `SELECT tool_name, metadata
       FROM composio_connections
       WHERE client_id = $1 AND status = 'active'`,
      [clientId]
    );

    const settings: Record<string, unknown> = {};
    for (const r of rows) {
      const meta = r.metadata || {};
      if (meta?.defaults) settings[r.tool_name] = meta.defaults;
    }
    res.json({ settings });
  } catch (e:any) {
    logger.error('CMS settings get failed', e);
    res.status(500).json({ error: { message: e.message || 'Failed to get CMS settings' } });
  }
});

/**
 * POST /api/cms/settings
 * Body: { provider: 'webflow'|'wordpress'|..., defaults: {...} }
 * Saves defaults into composio_connections.metadata for the provider
 */
router.post('/settings', async (req: Request, res: Response) => {
  try {
    const clientId = req.user!.id;
    const { provider, defaults } = req.body || {};
    if (!provider || typeof defaults !== 'object') {
      return res.status(400).json({ error: { message: 'provider and defaults are required' } });
    }

    const { rows } = await pool.query(
      `SELECT id, metadata FROM composio_connections
       WHERE client_id = $1 AND tool_name = $2 AND status = 'active'
       ORDER BY updated_at DESC LIMIT 1`,
      [clientId, provider]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: { message: `${provider} not connected` } });
    }

    const id = rows[0].id;
    const metadata = rows[0].metadata || {};
    metadata.defaults = { ...(metadata.defaults || {}), ...defaults };

    await pool.query(
      `UPDATE composio_connections SET metadata = $1, updated_at = NOW() WHERE id = $2`,
      [metadata, id]
    );

    res.json({ success: true });
  } catch (e:any) {
    logger.error('CMS settings save failed', e);
    res.status(500).json({ error: { message: e.message || 'Failed to save CMS settings' } });
  }
});

export default router;
