/**
 * Version Routes - Phase 4: Campaign Version Control
 * Endpoints for snapshots, rollbacks, branches, and comparisons
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import {
  requireOrganization,
  requirePermission,
  getOrganizationId,
  getUserId
} from '../middleware/multiTenancy.js';
import { requireZoFeature } from '../middleware/featureFlags.js';
import { campaignVersionService } from '../services/campaignVersionService.js';
import { logger } from '../utils/logger.js';

const router = Router();

// ============================================================================
// Version Creation
// ============================================================================

/**
 * POST /api/campaigns/:campaignId/versions
 * Create a new version snapshot
 */
const createVersionSchema = z.object({
  versionType: z.enum(['snapshot', 'milestone']).optional(),
  versionName: z.string().max(255).optional(),
  versionTag: z.string().max(100).optional(),
  changeSummary: z.string().optional()
});

router.post(
  '/campaigns/:campaignId/versions',
  requireAuth,
  requireOrganization,
  requirePermission('campaigns.edit'),
  requireZoFeature('campaignVersioning'),
  async (req: Request, res: Response) => {
    try {
      const organizationId = getOrganizationId(req)!;
      const userId = getUserId(req);
      const { campaignId } = req.params;

      const parsed = createVersionSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: 'Invalid request', details: parsed.error.issues });
      }

      const version = await campaignVersionService.createVersion(
        campaignId,
        organizationId,
        userId ?? undefined,
        parsed.data
      );

      res.status(201).json({ version });
    } catch (error: unknown) {
    const err = error as Error;
      logger.error('Failed to create version', { error });
      res.status(500).json({ error: 'Failed to create version' });
    }
  }
);

// ============================================================================
// Version Retrieval
// ============================================================================

/**
 * GET /api/campaigns/:campaignId/versions
 * List versions for a campaign
 */
router.get(
  '/campaigns/:campaignId/versions',
  requireAuth,
  requireOrganization,
  requirePermission('analytics.view'),
  requireZoFeature('campaignVersioning'),
  async (req: Request, res: Response) => {
    try {
      const { campaignId } = req.params;
      const { branchName, limit, offset } = req.query;

      const result = await campaignVersionService.listVersions(campaignId, {
        branchName: branchName as string | undefined,
        limit: limit ? parseInt(limit as string) : undefined,
        offset: offset ? parseInt(offset as string) : undefined
      });

      res.json(result);
    } catch (error: unknown) {
    const err = error as Error;
      logger.error('Failed to list versions', { error });
      res.status(500).json({ error: 'Failed to list versions' });
    }
  }
);

/**
 * GET /api/campaigns/:campaignId/versions/latest
 * Get the latest version
 */
router.get(
  '/campaigns/:campaignId/versions/latest',
  requireAuth,
  requireOrganization,
  requirePermission('analytics.view'),
  requireZoFeature('campaignVersioning'),
  async (req: Request, res: Response) => {
    try {
      const { campaignId } = req.params;

      const version = await campaignVersionService.getLatestVersion(campaignId);

      if (!version) {
        return res.status(404).json({ error: 'No versions found' });
      }

      res.json({ version });
    } catch (error: unknown) {
    const err = error as Error;
      logger.error('Failed to get latest version', { error });
      res.status(500).json({ error: 'Failed to get latest version' });
    }
  }
);

/**
 * GET /api/versions/:versionId
 * Get a specific version
 */
router.get(
  '/versions/:versionId',
  requireAuth,
  requireOrganization,
  requirePermission('analytics.view'),
  requireZoFeature('campaignVersioning'),
  async (req: Request, res: Response) => {
    try {
      const { versionId } = req.params;

      const version = await campaignVersionService.getVersion(versionId);

      res.json({ version });
    } catch (error: unknown) {
      const err = error as Error;
      if (error instanceof Error && err.message === 'Version not found') {
        return res.status(404).json({ error: 'Version not found' });
      }
      logger.error('Failed to get version', { error });
      res.status(500).json({ error: 'Failed to get version' });
    }
  }
);

/**
 * GET /api/versions/:versionId/deliverables
 * Get deliverable snapshots for a version
 */
router.get(
  '/versions/:versionId/deliverables',
  requireAuth,
  requireOrganization,
  requirePermission('analytics.view'),
  requireZoFeature('campaignVersioning'),
  async (req: Request, res: Response) => {
    try {
      const { versionId } = req.params;

      const deliverables = await campaignVersionService.getVersionDeliverables(versionId);

      res.json({ deliverables });
    } catch (error: unknown) {
    const err = error as Error;
      logger.error('Failed to get version deliverables', { error });
      res.status(500).json({ error: 'Failed to get version deliverables' });
    }
  }
);

// ============================================================================
// Rollback
// ============================================================================

/**
 * POST /api/campaigns/:campaignId/rollback
 * Rollback campaign to a specific version
 */
const rollbackSchema = z.object({
  targetVersionId: z.string().uuid()
});

router.post(
  '/campaigns/:campaignId/rollback',
  requireAuth,
  requireOrganization,
  requirePermission('campaigns.edit'),
  requireZoFeature('campaignVersioning'),
  async (req: Request, res: Response) => {
    try {
      const organizationId = getOrganizationId(req)!;
      const userId = getUserId(req);
      const { campaignId } = req.params;

      const parsed = rollbackSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: 'Invalid request', details: parsed.error.issues });
      }

      const { targetVersionId } = parsed.data;

      const newVersion = await campaignVersionService.rollbackToVersion(
        campaignId,
        organizationId,
        targetVersionId,
        userId ?? undefined
      );

      res.json({ version: newVersion, message: 'Campaign rolled back successfully' });
    } catch (error: unknown) {
      const err = error as Error;
      if (error instanceof Error && err.message === 'Version does not belong to this campaign') {
        return res.status(400).json({ error: err.message });
      }
      logger.error('Failed to rollback', { error });
      res.status(500).json({ error: 'Failed to rollback' });
    }
  }
);

// ============================================================================
// Branching
// ============================================================================

/**
 * POST /api/campaigns/:campaignId/branches
 * Create a new branch
 */
const createBranchSchema = z.object({
  branchName: z.string().min(1).max(100),
  sourceVersionId: z.string().uuid(),
  description: z.string().optional()
});

router.post(
  '/campaigns/:campaignId/branches',
  requireAuth,
  requireOrganization,
  requirePermission('campaigns.edit'),
  requireZoFeature('campaignVersioning'),
  async (req: Request, res: Response) => {
    try {
      const organizationId = getOrganizationId(req)!;
      const userId = getUserId(req);
      const { campaignId } = req.params;

      const parsed = createBranchSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: 'Invalid request', details: parsed.error.issues });
      }

      const { branchName, sourceVersionId, description } = parsed.data;

      const branch = await campaignVersionService.createBranch(
        campaignId,
        organizationId,
        branchName,
        sourceVersionId,
        userId ?? undefined,
        description
      );

      res.status(201).json({ branch });
    } catch (error: unknown) {
      const err = error as Error;
      if (error instanceof Error && err.message.includes('Source version')) {
        return res.status(400).json({ error: err.message });
      }
      logger.error('Failed to create branch', { error });
      res.status(500).json({ error: 'Failed to create branch' });
    }
  }
);

/**
 * GET /api/campaigns/:campaignId/branches
 * List branches for a campaign
 */
router.get(
  '/campaigns/:campaignId/branches',
  requireAuth,
  requireOrganization,
  requirePermission('analytics.view'),
  requireZoFeature('campaignVersioning'),
  async (req: Request, res: Response) => {
    try {
      const { campaignId } = req.params;
      const { status } = req.query;

      const branches = await campaignVersionService.listBranches(
        campaignId,
        status as 'active' | 'merged' | 'abandoned' | 'archived' | undefined
      );

      res.json({ branches });
    } catch (error: unknown) {
    const err = error as Error;
      logger.error('Failed to list branches', { error });
      res.status(500).json({ error: 'Failed to list branches' });
    }
  }
);

// ============================================================================
// Comparison
// ============================================================================

/**
 * GET /api/versions/compare
 * Compare two versions
 */
router.get(
  '/versions/compare',
  requireAuth,
  requireOrganization,
  requirePermission('analytics.view'),
  requireZoFeature('campaignVersioning'),
  async (req: Request, res: Response) => {
    try {
      const { versionA, versionB } = req.query;

      if (!versionA || !versionB) {
        return res.status(400).json({ error: 'versionA and versionB are required' });
      }

      const comparison = await campaignVersionService.compareVersions(
        versionA as string,
        versionB as string
      );

      res.json({ comparison });
    } catch (error: unknown) {
    const err = error as Error;
      logger.error('Failed to compare versions', { error });
      res.status(500).json({ error: 'Failed to compare versions' });
    }
  }
);

export default router;
