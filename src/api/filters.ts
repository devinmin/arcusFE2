/**
 * Saved Filters Routes
 *
 * API endpoints for filter persistence and management.
 */

import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requireOrganization, getOrganizationId, getUserId } from '../middleware/multiTenancy.js';
import { savedFiltersService, ViewType } from '../services/savedFiltersService.js';
import { logger } from '../utils/logger.js';

const router = Router();

const VALID_VIEW_TYPES: ViewType[] = ['campaigns', 'leads', 'deliverables', 'analytics', 'calendar', 'workflows'];

/**
 * GET /api/filters
 * Get all saved filters for the current user
 *
 * Query params:
 * - viewType: Optional filter by view type
 */
router.get(
  '/',
  requireAuth,
  requireOrganization,
  async (req: Request, res: Response) => {
    try {
      const organizationId = getOrganizationId(req)!;
      const userId = getUserId(req)!;
      const { viewType } = req.query;

      if (viewType && !VALID_VIEW_TYPES.includes(viewType as ViewType)) {
        return res.status(400).json({
          error: { code: 'INVALID_VIEW_TYPE', message: 'Invalid view type' },
        });
      }

      const filters = await savedFiltersService.getFilters(
        organizationId,
        userId,
        viewType as ViewType | undefined
      );

      res.json({ filters });
    } catch (error: unknown) {
    const err = error as any;
      logger.error('[FiltersRoutes] Failed to get filters', { error });
      res.status(500).json({
        error: { code: 'INTERNAL_ERROR', message: 'Failed to get filters' },
      });
    }
  }
);

/**
 * GET /api/filters/:viewType/default
 * Get the default filter for a specific view
 */
router.get(
  '/:viewType/default',
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

      const filter = await savedFiltersService.getDefaultFilter(
        organizationId,
        userId,
        viewType as ViewType
      );

      res.json({ filter });
    } catch (error: unknown) {
    const err = error as any;
      logger.error('[FiltersRoutes] Failed to get default filter', { error });
      res.status(500).json({
        error: { code: 'INTERNAL_ERROR', message: 'Failed to get default filter' },
      });
    }
  }
);

/**
 * GET /api/filters/:filterId
 * Get a specific filter by ID
 */
router.get(
  '/:filterId',
  requireAuth,
  requireOrganization,
  async (req: Request, res: Response) => {
    try {
      const organizationId = getOrganizationId(req)!;
      const userId = getUserId(req)!;
      const { filterId } = req.params;

      // Skip if filterId is a view type (handled by other route)
      if (VALID_VIEW_TYPES.includes(filterId as ViewType)) {
        return res.status(400).json({
          error: { code: 'INVALID_FILTER_ID', message: 'Invalid filter ID' },
        });
      }

      const filter = await savedFiltersService.getFilter(filterId, organizationId, userId);

      if (!filter) {
        return res.status(404).json({
          error: { code: 'NOT_FOUND', message: 'Filter not found' },
        });
      }

      res.json({ filter });
    } catch (error: unknown) {
    const err = error as any;
      logger.error('[FiltersRoutes] Failed to get filter', { error });
      res.status(500).json({
        error: { code: 'INTERNAL_ERROR', message: 'Failed to get filter' },
      });
    }
  }
);

/**
 * POST /api/filters
 * Create a new saved filter
 */
router.post(
  '/',
  requireAuth,
  requireOrganization,
  async (req: Request, res: Response) => {
    try {
      const organizationId = getOrganizationId(req)!;
      const userId = getUserId(req)!;
      const { name, viewType, filters, isDefault, isShared } = req.body;

      if (!name || !viewType || !filters) {
        return res.status(400).json({
          error: { code: 'MISSING_FIELDS', message: 'name, viewType, and filters are required' },
        });
      }

      if (!VALID_VIEW_TYPES.includes(viewType)) {
        return res.status(400).json({
          error: { code: 'INVALID_VIEW_TYPE', message: 'Invalid view type' },
        });
      }

      const filter = await savedFiltersService.createFilter(organizationId, userId, {
        name,
        viewType,
        filters,
        isDefault,
        isShared,
      });

      res.status(201).json({ filter });
    } catch (error: unknown) {
    const err = error as Error & { code?: string };
      // Handle unique constraint violation
      if (err.code === '23505') {
        return res.status(409).json({
          error: { code: 'DUPLICATE_NAME', message: 'A filter with this name already exists for this view' },
        });
      }

      logger.error('[FiltersRoutes] Failed to create filter', { error });
      res.status(500).json({
        error: { code: 'INTERNAL_ERROR', message: 'Failed to create filter' },
      });
    }
  }
);

/**
 * POST /api/filters/save
 * Alias for POST /api/filters
 * Create or update a saved filter configuration
 */
router.post(
  '/save',
  requireAuth,
  requireOrganization,
  async (req: Request, res: Response) => {
    try {
      const organizationId = getOrganizationId(req)!;
      const userId = getUserId(req)!;
      const { id, name, viewType, filters, isDefault, isShared } = req.body;

      if (!name || !viewType || !filters) {
        return res.status(400).json({
          error: { code: 'MISSING_FIELDS', message: 'name, viewType, and filters are required' },
        });
      }

      if (!VALID_VIEW_TYPES.includes(viewType)) {
        return res.status(400).json({
          error: { code: 'INVALID_VIEW_TYPE', message: 'Invalid view type' },
        });
      }

      // If ID is provided, update existing filter
      if (id) {
        const filter = await savedFiltersService.updateFilter(id, organizationId, userId, {
          name,
          filters,
          isDefault,
          isShared,
        });

        if (!filter) {
          return res.status(404).json({
            error: { code: 'NOT_FOUND', message: 'Filter not found or not owned by you' },
          });
        }

        return res.json({
          success: true,
          filter,
          message: 'Filter updated successfully'
        });
      }

      // Otherwise, create new filter
      const filter = await savedFiltersService.createFilter(organizationId, userId, {
        name,
        viewType,
        filters,
        isDefault,
        isShared,
      });

      res.status(201).json({
        success: true,
        filter,
        message: 'Filter saved successfully'
      });
    } catch (error: unknown) {
    const err = error as Error & { code?: string };
      // Handle unique constraint violation
      if (err.code === '23505') {
        return res.status(409).json({
          error: { code: 'DUPLICATE_NAME', message: 'A filter with this name already exists for this view' },
        });
      }

      logger.error('[FiltersRoutes] Failed to save filter', { error });
      res.status(500).json({
        error: { code: 'INTERNAL_ERROR', message: 'Failed to save filter' },
      });
    }
  }
);

/**
 * PATCH /api/filters/:filterId
 * Update a saved filter
 */
router.patch(
  '/:filterId',
  requireAuth,
  requireOrganization,
  async (req: Request, res: Response) => {
    try {
      const organizationId = getOrganizationId(req)!;
      const userId = getUserId(req)!;
      const { filterId } = req.params;
      const { name, filters, isDefault, isShared } = req.body;

      const filter = await savedFiltersService.updateFilter(filterId, organizationId, userId, {
        name,
        filters,
        isDefault,
        isShared,
      });

      if (!filter) {
        return res.status(404).json({
          error: { code: 'NOT_FOUND', message: 'Filter not found or not owned by you' },
        });
      }

      res.json({ filter });
    } catch (error: unknown) {
    const err = error as Error & { code?: string };
      if (err.code === '23505') {
        return res.status(409).json({
          error: { code: 'DUPLICATE_NAME', message: 'A filter with this name already exists for this view' },
        });
      }

      logger.error('[FiltersRoutes] Failed to update filter', { error });
      res.status(500).json({
        error: { code: 'INTERNAL_ERROR', message: 'Failed to update filter' },
      });
    }
  }
);

/**
 * DELETE /api/filters/:filterId
 * Delete a saved filter
 */
router.delete(
  '/:filterId',
  requireAuth,
  requireOrganization,
  async (req: Request, res: Response) => {
    try {
      const organizationId = getOrganizationId(req)!;
      const userId = getUserId(req)!;
      const { filterId } = req.params;

      const deleted = await savedFiltersService.deleteFilter(filterId, organizationId, userId);

      if (!deleted) {
        return res.status(404).json({
          error: { code: 'NOT_FOUND', message: 'Filter not found or not owned by you' },
        });
      }

      res.status(204).send();
    } catch (error: unknown) {
    const err = error as Error;
      logger.error('[FiltersRoutes] Failed to delete filter', { error });
      res.status(500).json({
        error: { code: 'INTERNAL_ERROR', message: 'Failed to delete filter' },
      });
    }
  }
);

/**
 * POST /api/filters/:filterId/default
 * Set a filter as the default for its view
 */
router.post(
  '/:filterId/default',
  requireAuth,
  requireOrganization,
  async (req: Request, res: Response) => {
    try {
      const organizationId = getOrganizationId(req)!;
      const userId = getUserId(req)!;
      const { filterId } = req.params;

      const success = await savedFiltersService.setDefaultFilter(filterId, organizationId, userId);

      if (!success) {
        return res.status(404).json({
          error: { code: 'NOT_FOUND', message: 'Filter not found or not owned by you' },
        });
      }

      res.json({ success: true });
    } catch (error: unknown) {
    const err = error as Error;
      logger.error('[FiltersRoutes] Failed to set default filter', { error });
      res.status(500).json({
        error: { code: 'INTERNAL_ERROR', message: 'Failed to set default filter' },
      });
    }
  }
);

/**
 * POST /api/filters/:filterId/duplicate
 * Duplicate a filter (useful for copying shared filters)
 */
router.post(
  '/:filterId/duplicate',
  requireAuth,
  requireOrganization,
  async (req: Request, res: Response) => {
    try {
      const organizationId = getOrganizationId(req)!;
      const userId = getUserId(req)!;
      const { filterId } = req.params;
      const { name } = req.body;

      const filter = await savedFiltersService.duplicateFilter(filterId, organizationId, userId, name);

      if (!filter) {
        return res.status(404).json({
          error: { code: 'NOT_FOUND', message: 'Filter not found' },
        });
      }

      res.status(201).json({ filter });
    } catch (error: unknown) {
    const err = error as Error;
      logger.error('[FiltersRoutes] Failed to duplicate filter', { error });
      res.status(500).json({
        error: { code: 'INTERNAL_ERROR', message: 'Failed to duplicate filter' },
      });
    }
  }
);

export default router;
