import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requireOrganization } from '../middleware/multiTenancy.js';
import { getClientAnalytics } from '../services/analyticsService.js';
import { logger } from '../utils/logger.js';

const router = Router();

/**
 * GET /api/analytics
 * Get aggregated analytics for the authenticated client
 */
router.get('/', requireAuth, requireOrganization, async (req: Request, res: Response) => {
    try {
        const user = req.user!;
        const period = (req.query.period as '7d' | '30d' | '90d' | 'all') || '30d';

        const analytics = await getClientAnalytics(user.id, period);

        res.json(analytics);
    } catch (error: unknown) {
    const err = error as Error;
        logger.error('Get analytics error:', error);
        res.status(500).json({
            error: {
                code: 'INTERNAL_ERROR',
                message: 'Failed to fetch analytics'
            }
        });
    }
});

export default router;
