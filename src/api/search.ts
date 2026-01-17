/**
 * Global Search Routes
 *
 * API endpoints for global search across all entity types.
 */

import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requireOrganization, getOrganizationId, getUserId } from '../middleware/multiTenancy.js';
import { globalSearchService, SearchEntityType } from '../services/globalSearchService.js';
import { logger } from '../utils/logger.js';

const router = Router();

/**
 * GET /api/search
 * Execute a global search across all entity types
 *
 * Query params:
 * - q: Search query string (required)
 * - types: Comma-separated entity types to search (optional)
 * - limit: Max results per category (default: 5, max: 20)
 * - offset: Pagination offset (default: 0)
 */
router.get(
  '/',
  requireAuth,
  requireOrganization,
  async (req: Request, res: Response) => {
    try {
      const organizationId = getOrganizationId(req)!;
      const userId = getUserId(req);
      const { q, types, limit, offset } = req.query;

      if (!q || typeof q !== 'string') {
        return res.status(400).json({
          error: { code: 'MISSING_QUERY', message: 'Search query is required' },
        });
      }

      // Parse entity types if provided
      let entityTypes: SearchEntityType[] | undefined;
      if (types && typeof types === 'string') {
        entityTypes = types.split(',').map((t) => t.trim()) as SearchEntityType[];
        const validTypes: SearchEntityType[] = ['campaign', 'deliverable', 'lead', 'document', 'workflow'];
        entityTypes = entityTypes.filter((t) => validTypes.includes(t));
      }

      const result = await globalSearchService.search({
        organizationId,
        userId: userId || undefined,
        query: q,
        entityTypes,
        limit: limit ? parseInt(limit as string, 10) : undefined,
        offset: offset ? parseInt(offset as string, 10) : undefined,
        includeRecentSearches: true,
      });

      res.json(result);
    } catch (error: unknown) {
    const err = error as Error;
      logger.error('[SearchRoutes] Search failed', { error });
      res.status(500).json({
        error: { code: 'SEARCH_FAILED', message: 'Failed to execute search' },
      });
    }
  }
);

/**
 * GET /api/search/recent
 * Get recent searches for the current user
 */
router.get(
  '/recent',
  requireAuth,
  requireOrganization,
  async (req: Request, res: Response) => {
    try {
      const organizationId = getOrganizationId(req)!;
      const userId = getUserId(req);
      const { limit } = req.query;

      if (!userId) {
        return res.status(401).json({
          error: { code: 'UNAUTHORIZED', message: 'User ID required' },
        });
      }

      const recentSearches = await globalSearchService.getRecentSearches(
        organizationId,
        userId,
        limit ? parseInt(limit as string, 10) : 5
      );

      res.json({ recentSearches });
    } catch (error: unknown) {
    const err = error as Error;
      logger.error('[SearchRoutes] Failed to get recent searches', { error });
      res.status(500).json({
        error: { code: 'INTERNAL_ERROR', message: 'Failed to get recent searches' },
      });
    }
  }
);

/**
 * DELETE /api/search/recent
 * Clear recent searches for the current user
 */
router.delete(
  '/recent',
  requireAuth,
  requireOrganization,
  async (req: Request, res: Response) => {
    try {
      const organizationId = getOrganizationId(req)!;
      const userId = getUserId(req);

      if (!userId) {
        return res.status(401).json({
          error: { code: 'UNAUTHORIZED', message: 'User ID required' },
        });
      }

      await globalSearchService.clearRecentSearches(organizationId, userId);

      res.json({ success: true });
    } catch (error: unknown) {
    const err = error as Error;
      logger.error('[SearchRoutes] Failed to clear recent searches', { error });
      res.status(500).json({
        error: { code: 'INTERNAL_ERROR', message: 'Failed to clear recent searches' },
      });
    }
  }
);

/**
 * GET /api/search/analytics
 * Get search analytics for the organization (admin only)
 */
router.get(
  '/analytics',
  requireAuth,
  requireOrganization,
  async (req: Request, res: Response) => {
    try {
      const organizationId = getOrganizationId(req)!;
      const { startDate, endDate } = req.query;

      const analytics = await globalSearchService.getSearchAnalytics(
        organizationId,
        startDate ? new Date(startDate as string) : undefined,
        endDate ? new Date(endDate as string) : undefined
      );

      res.json(analytics);
    } catch (error: unknown) {
    const err = error as Error;
      logger.error('[SearchRoutes] Failed to get search analytics', { error });
      res.status(500).json({
        error: { code: 'INTERNAL_ERROR', message: 'Failed to get search analytics' },
      });
    }
  }
);

export default router;
