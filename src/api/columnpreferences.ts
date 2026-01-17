/**
 * Column Preferences Routes
 *
 * API endpoints for column visibility, ordering, and width persistence.
 */

import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requireOrganization, getOrganizationId, getUserId } from '../middleware/multiTenancy.js';
import { columnPreferencesService, ViewType } from '../services/columnPreferencesService.js';
import { logger } from '../utils/logger.js';

const router = Router();

const VALID_VIEW_TYPES: ViewType[] = ['campaigns', 'leads', 'deliverables', 'analytics', 'calendar', 'workflows'];

/**
 * GET /api/column-preferences/:viewType
 * Get column preferences for a specific view
 */
router.get(
  '/:viewType',
  requireAuth,
  requireOrganization,
  async (req: Request, res: Response) => {
    try {
      const organizationId = getOrganizationId(req)!;
      const userId = getUserId(req)!;
      const { viewType } = req.params;

      if (!VALID_VIEW_TYPES.includes(viewType as ViewType)) {
        return res.status(400).json({
          error: { code: 'INVALID_VIEW_TYPE', message: 'Invalid view type' },
        });
      }

      const preferences = await columnPreferencesService.getPreferences(
        organizationId,
        userId,
        viewType as ViewType
      );

      res.json({ preferences });
    } catch (error: unknown) {
    const err = error as Error;
      logger.error('[ColumnPreferences] Failed to get preferences', { error });
      res.status(500).json({
        error: { code: 'INTERNAL_ERROR', message: 'Failed to get column preferences' },
      });
    }
  }
);

/**
 * GET /api/column-preferences
 * Get all column preferences for the current user
 */
router.get(
  '/',
  requireAuth,
  requireOrganization,
  async (req: Request, res: Response) => {
    try {
      const organizationId = getOrganizationId(req)!;
      const userId = getUserId(req)!;

      const preferences = await columnPreferencesService.getAllPreferences(organizationId, userId);

      res.json({ preferences });
    } catch (error: unknown) {
    const err = error as Error;
      logger.error('[ColumnPreferences] Failed to get all preferences', { error });
      res.status(500).json({
        error: { code: 'INTERNAL_ERROR', message: 'Failed to get column preferences' },
      });
    }
  }
);

/**
 * PUT /api/column-preferences/:viewType
 * Save column preferences for a specific view
 */
router.put(
  '/:viewType',
  requireAuth,
  requireOrganization,
  async (req: Request, res: Response) => {
    try {
      const organizationId = getOrganizationId(req)!;
      const userId = getUserId(req)!;
      const { viewType } = req.params;
      const { columns } = req.body;

      if (!VALID_VIEW_TYPES.includes(viewType as ViewType)) {
        return res.status(400).json({
          error: { code: 'INVALID_VIEW_TYPE', message: 'Invalid view type' },
        });
      }

      if (!Array.isArray(columns)) {
        return res.status(400).json({
          error: { code: 'INVALID_COLUMNS', message: 'columns must be an array' },
        });
      }

      // Validate column structure
      for (const col of columns) {
        if (!col.id || typeof col.visible !== 'boolean' || typeof col.order !== 'number') {
          return res.status(400).json({
            error: {
              code: 'INVALID_COLUMN_FORMAT',
              message: 'Each column must have id (string), visible (boolean), and order (number)',
            },
          });
        }
      }

      const preferences = await columnPreferencesService.savePreferences(
        organizationId,
        userId,
        viewType as ViewType,
        columns
      );

      res.json({ preferences });
    } catch (error: unknown) {
    const err = error as Error;
      logger.error('[ColumnPreferences] Failed to save preferences', { error });
      res.status(500).json({
        error: { code: 'INTERNAL_ERROR', message: 'Failed to save column preferences' },
      });
    }
  }
);

/**
 * DELETE /api/column-preferences/:viewType
 * Reset column preferences to defaults for a specific view
 */
router.delete(
  '/:viewType',
  requireAuth,
  requireOrganization,
  async (req: Request, res: Response) => {
    try {
      const organizationId = getOrganizationId(req)!;
      const userId = getUserId(req)!;
      const { viewType } = req.params;

      if (!VALID_VIEW_TYPES.includes(viewType as ViewType)) {
        return res.status(400).json({
          error: { code: 'INVALID_VIEW_TYPE', message: 'Invalid view type' },
        });
      }

      const preferences = await columnPreferencesService.resetPreferences(
        organizationId,
        userId,
        viewType as ViewType
      );

      res.json({ preferences, message: 'Column preferences reset to defaults' });
    } catch (error: unknown) {
    const err = error as Error;
      logger.error('[ColumnPreferences] Failed to reset preferences', { error });
      res.status(500).json({
        error: { code: 'INTERNAL_ERROR', message: 'Failed to reset column preferences' },
      });
    }
  }
);

/**
 * GET /api/column-preferences/:viewType/defaults
 * Get default columns for a view type (no auth required)
 */
router.get(
  '/:viewType/defaults',
  async (req: Request, res: Response) => {
    try {
      const { viewType } = req.params;

      if (!VALID_VIEW_TYPES.includes(viewType as ViewType)) {
        return res.status(400).json({
          error: { code: 'INVALID_VIEW_TYPE', message: 'Invalid view type' },
        });
      }

      const columns = columnPreferencesService.getDefaultColumns(viewType as ViewType);

      res.json({ columns });
    } catch (error: unknown) {
    const err = error as Error;
      logger.error('[ColumnPreferences] Failed to get defaults', { error });
      res.status(500).json({
        error: { code: 'INTERNAL_ERROR', message: 'Failed to get default columns' },
      });
    }
  }
);

export default router;
