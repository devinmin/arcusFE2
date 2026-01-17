import { Router, Request, Response } from 'express';
import { composeBrief, getFamilyOverlay } from '../services/context/composer.js';
import { checkBrief } from '../services/checker.js';
import { selectAgent } from '../services/router.js';
import { PacketBrief } from '../schemas/types.js';
import { logger } from '../utils/logger.js';
import { v4 as uuidv4 } from 'uuid';
import { requireAuth } from '../middleware/auth.js';
import { requireOrganization } from '../middleware/multiTenancy.js';

const router = Router();

// SEC-004 FIX: All intake routes require authentication and organization context
router.use(requireAuth);
router.use(requireOrganization);

/**
 * POST /api/intake/launch
 * Body: {
 *   brand, campaign, product, family, audience, markets, dropDate?, embargo?, assets?, approvals?, packets? (optional override)
 * }
 */
router.post('/launch', async (req: Request, res: Response) => {
  try {
    const taskId = uuidv4();
    const {
      brand,
      campaign,
      product,
      family,
      audience,
      markets,
      dropDate,
      embargo,
      assets = [],
      approvals = [],
      packets,
    } = req.body ?? {};

    if (!brand || !campaign || !product || !family || !audience || !markets) {
      return res.status(400).json({ error: { message: 'Missing required fields: brand, campaign, product, family, audience, markets' } });
    }

    const packetTypes: PacketBrief['packetType'][] = packets && Array.isArray(packets) && packets.length > 0
      ? packets
      : ['SocialPack', 'PDPLanding', 'PaidSocialAds', 'HeroVideoCutdowns', 'AnalyticsTracking'];

    const overlay = await getFamilyOverlay(family);

    const results = await Promise.all(packetTypes.map(async (packetType) => {
      const brief = await composeBrief({
        packetType,
        family,
        brand,
        campaign,
        product,
        audience,
        markets,
        dropDate,
        embargo,
        assetLinks: assets,
        approvals,
      });

      const check = checkBrief(brief, overlay);
      const route = await selectAgent(packetType);

      return { packetType, agent: route.selectedAgent, brief, check };
    }));

    logger.info('Intake created packets', { taskId, count: results.length, families: family });

    return res.json({ taskId, results });
  } catch (err: any) {
    logger.error('Intake error', { error: err?.message });
    return res.status(500).json({ error: { message: 'Failed to create launch packets' } });
  }
});

export default router;
