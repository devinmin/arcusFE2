/**
 * Deployment Routes - Phase 5: Zero-Friction Deployment
 * Endpoints for preview hosting, QR codes, and analytics
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
import { previewHostingService } from '../services/previewHostingService.js';
import { pool } from '../database/db.js';
import { logger } from '../utils/logger.js';

const router = Router();

// ============================================================================
// Preview Creation
// ============================================================================

/**
 * POST /api/deployments/preview
 * Create a quick preview deployment
 */
const createPreviewSchema = z.object({
  deliverableId: z.string().uuid(),
  campaignId: z.string().uuid().optional(),
  expiresHours: z.number().min(1).max(720).optional(), // Max 30 days
  accessType: z.enum(['public', 'link', 'password', 'authenticated']).optional(),
  password: z.string().min(4).optional(),
  versionId: z.string().uuid().optional()
});

router.post(
  '/preview',
  requireAuth,
  requireOrganization,
  requirePermission('campaigns.edit'),
  requireZoFeature('liveDeployment'),
  async (req: Request, res: Response) => {
    try {
      const organizationId = getOrganizationId(req)!;
      const userId = getUserId(req);

      const parsed = createPreviewSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: 'Invalid request', details: parsed.error.issues });
      }

      const deployment = await previewHostingService.createPreview(
        organizationId,
        parsed.data.deliverableId,
        userId ?? undefined,
        {
          campaignId: parsed.data.campaignId,
          expiresHours: parsed.data.expiresHours,
          accessType: parsed.data.accessType,
          password: parsed.data.password,
          versionId: parsed.data.versionId
        }
      );

      res.status(201).json({ deployment });
    } catch (error: unknown) {
      const err = error as Error;
      if (error instanceof Error && err.message === 'Deliverable not found') {
        return res.status(404).json({ error: 'Deliverable not found' });
      }
      logger.error('Failed to create preview', { error });
      res.status(500).json({ error: 'Failed to create preview' });
    }
  }
);

/**
 * POST /api/deployments/from-template
 * Create deployment from a template
 */
const createFromTemplateSchema = z.object({
  deliverableId: z.string().uuid(),
  templateId: z.string().uuid(),
  configOverrides: z.record(z.unknown()).optional()
});

router.post(
  '/from-template',
  requireAuth,
  requireOrganization,
  requirePermission('campaigns.edit'),
  requireZoFeature('liveDeployment'),
  async (req: Request, res: Response) => {
    try {
      const organizationId = getOrganizationId(req)!;
      const userId = getUserId(req);

      const parsed = createFromTemplateSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: 'Invalid request', details: parsed.error.issues });
      }

      const deployment = await previewHostingService.createFromTemplate(
        organizationId,
        parsed.data.deliverableId,
        parsed.data.templateId,
        userId ?? undefined,
        parsed.data.configOverrides
      );

      res.status(201).json({ deployment });
    } catch (error: unknown) {
      const err = error as Error;
      if (error instanceof Error && err.message === 'Template not found') {
        return res.status(404).json({ error: 'Template not found' });
      }
      logger.error('Failed to create from template', { error });
      res.status(500).json({ error: 'Failed to create from template' });
    }
  }
);

// ============================================================================
// Deployment Management
// ============================================================================

/**
 * GET /api/deployments
 * List deployments for the organization
 */
router.get(
  '/',
  requireAuth,
  requireOrganization,
  requirePermission('analytics.view'),
  requireZoFeature('liveDeployment'),
  async (req: Request, res: Response) => {
    try {
      const organizationId = getOrganizationId(req)!;
      const { deliverableId, campaignId, status, type, limit, offset } = req.query;

      const result = await previewHostingService.listDeployments(organizationId, {
        deliverableId: deliverableId as string | undefined,
        campaignId: campaignId as string | undefined,
        status: status as 'pending' | 'deploying' | 'active' | 'expired' | 'failed' | 'revoked' | undefined,
        type: type as 'preview' | 'staging' | 'production' | 'social' | 'ad_platform' | 'email' | undefined,
        limit: limit ? parseInt(limit as string) : undefined,
        offset: offset ? parseInt(offset as string) : undefined
      });

      res.json(result);
    } catch (error: unknown) {
    const err = error as Error;
      logger.error('Failed to list deployments', { error });
      res.status(500).json({ error: 'Failed to list deployments' });
    }
  }
);

/**
 * GET /api/deployments/:id
 * Get a specific deployment
 */
router.get(
  '/:id',
  requireAuth,
  requireOrganization,
  requirePermission('analytics.view'),
  requireZoFeature('liveDeployment'),
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;

      const deployment = await previewHostingService.getDeployment(id);

      res.json({ deployment });
    } catch (error: unknown) {
      const err = error as Error;
      if (error instanceof Error && err.message === 'Deployment not found') {
        return res.status(404).json({ error: 'Deployment not found' });
      }
      logger.error('Failed to get deployment', { error });
      res.status(500).json({ error: 'Failed to get deployment' });
    }
  }
);

/**
 * POST /api/deployments/:id/revoke
 * Revoke a deployment
 */
const revokeSchema = z.object({
  reason: z.string().optional()
});

router.post(
  '/:id/revoke',
  requireAuth,
  requireOrganization,
  requirePermission('campaigns.edit'),
  requireZoFeature('liveDeployment'),
  async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req)!;
      const { id } = req.params;

      const parsed = revokeSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: 'Invalid request', details: parsed.error.issues });
      }

      await previewHostingService.revokeDeployment(id, userId, parsed.data.reason);

      res.json({ success: true, message: 'Deployment revoked' });
    } catch (error: unknown) {
    const err = error as Error;
      logger.error('Failed to revoke deployment', { error });
      res.status(500).json({ error: 'Failed to revoke deployment' });
    }
  }
);

/**
 * POST /api/deployments/:id/extend
 * Extend deployment expiration
 */
const extendSchema = z.object({
  additionalHours: z.number().min(1).max(720)
});

router.post(
  '/:id/extend',
  requireAuth,
  requireOrganization,
  requirePermission('campaigns.edit'),
  requireZoFeature('liveDeployment'),
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;

      const parsed = extendSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: 'Invalid request', details: parsed.error.issues });
      }

      const deployment = await previewHostingService.extendExpiration(
        id,
        parsed.data.additionalHours
      );

      res.json({ deployment });
    } catch (error: unknown) {
    const err = error as Error;
      logger.error('Failed to extend deployment', { error });
      res.status(500).json({ error: 'Failed to extend deployment' });
    }
  }
);

// ============================================================================
// Analytics
// ============================================================================

/**
 * GET /api/deployments/:id/analytics
 * Get analytics for a deployment
 */
router.get(
  '/:id/analytics',
  requireAuth,
  requireOrganization,
  requirePermission('analytics.view'),
  requireZoFeature('liveDeployment'),
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { days } = req.query;

      const analytics = await previewHostingService.getAnalytics(
        id,
        days ? parseInt(days as string) : undefined
      );

      res.json({ analytics });
    } catch (error: unknown) {
    const err = error as Error;
      logger.error('Failed to get analytics', { error });
      res.status(500).json({ error: 'Failed to get analytics' });
    }
  }
);

// ============================================================================
// Preview Tokens
// ============================================================================

/**
 * POST /api/deployments/:id/tokens
 * Create a preview token for sharing
 */
const createTokenSchema = z.object({
  tokenType: z.enum(['view', 'edit', 'comment', 'approve']).optional(),
  maxUses: z.number().min(1).max(1000).optional(),
  expiresHours: z.number().min(1).max(720).optional(),
  forEmail: z.string().email().optional()
});

router.post(
  '/:id/tokens',
  requireAuth,
  requireOrganization,
  requirePermission('campaigns.edit'),
  requireZoFeature('liveDeployment'),
  async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req)!;
      const { id } = req.params;

      const parsed = createTokenSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: 'Invalid request', details: parsed.error.issues });
      }

      const token = await previewHostingService.createPreviewToken(
        id,
        userId,
        parsed.data
      );

      res.status(201).json({ token });
    } catch (error: unknown) {
    const err = error as Error;
      logger.error('Failed to create token', { error });
      res.status(500).json({ error: 'Failed to create token' });
    }
  }
);

// ============================================================================
// Templates
// ============================================================================

/**
 * GET /api/deployments/templates
 * List available deployment templates
 */
router.get(
  '/templates',
  requireAuth,
  requireOrganization,
  requireZoFeature('liveDeployment'),
  async (req: Request, res: Response) => {
    try {
      const organizationId = getOrganizationId(req)!;

      const templates = await previewHostingService.listTemplates(organizationId);

      res.json({ templates });
    } catch (error: unknown) {
    const err = error as Error;
      logger.error('Failed to list templates', { error });
      res.status(500).json({ error: 'Failed to list templates' });
    }
  }
);

// ============================================================================
// Public Preview Access (no auth required)
// ============================================================================

/**
 * GET /api/preview/:slug
 * Access a preview (public endpoint)
 */
router.get(
  '/preview/:slug',
  async (req: Request, res: Response) => {
    try {
      const { slug } = req.params;
      const { token } = req.query;

      const deployment = await previewHostingService.getDeploymentBySlug(slug);

      if (!deployment) {
        return res.status(404).json({ error: 'Preview not found or expired' });
      }

      // Check access
      if (deployment.accessType === 'password') {
        // Password-protected - require token
        if (!token) {
          return res.status(401).json({
            error: 'Password required',
            requiresPassword: true
          });
        }

        const validation = await previewHostingService.validateToken(token as string);
        if (!validation.valid) {
          return res.status(401).json({ error: validation.error });
        }
      } else if (deployment.accessType === 'authenticated') {
        // Require logged in user - this would check session
        return res.status(401).json({
          error: 'Authentication required',
          requiresAuth: true
        });
      }

      // Record view (would normally have more viewer info from request headers)
      await previewHostingService.recordView(deployment.id, {
        referrer: req.headers.referer || undefined
      });

      // Return deployment info (actual content would be fetched separately)
      res.json({
        deployment: {
          id: deployment.id,
          deliverableId: deployment.deliverableId,
          previewUrl: deployment.previewUrl,
          qrCodeUrl: deployment.qrCodeUrl,
          expiresAt: deployment.expiresAt
        }
      });
    } catch (error: unknown) {
    const err = error as Error;
      logger.error('Failed to access preview', { error });
      res.status(500).json({ error: 'Failed to access preview' });
    }
  }
);

/**
 * POST /api/preview/:slug/verify
 * Verify password for password-protected preview
 */
const verifyPasswordSchema = z.object({
  password: z.string()
});

router.post(
  '/preview/:slug/verify',
  async (req: Request, res: Response) => {
    try {
      const { slug } = req.params;

      const parsed = verifyPasswordSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: 'Password required' });
      }

      const { password } = parsed.data;

      // Get the deployment
      const deployment = await previewHostingService.getDeploymentBySlug(slug);

      if (!deployment) {
        return res.status(404).json({ error: 'Preview not found or expired' });
      }

      if (deployment.accessType !== 'password') {
        return res.status(400).json({ error: 'This preview is not password-protected' });
      }

      // Get the password hash from database
      const result = await pool.query(
        `SELECT access_password_hash FROM deliverable_deployments WHERE id = $1`,
        [deployment.id]
      );

      if (result.rows.length === 0 || !result.rows[0].access_password_hash) {
        logger.error('Password-protected deployment missing password hash', { deploymentId: deployment.id });
        return res.status(500).json({ error: 'Server configuration error' });
      }

      const passwordHash = result.rows[0].access_password_hash;

      // Verify password using bcrypt
      const bcrypt = await import('bcrypt');
      const isValid = await bcrypt.compare(password, passwordHash);

      if (!isValid) {
        return res.status(401).json({
          valid: false,
          error: 'Incorrect password'
        });
      }

      // Generate a temporary access token
      // Use a system user ID since this is password-based authentication
      const systemUserId = '00000000-0000-0000-0000-000000000000';
      const tokenRecord = await previewHostingService.createPreviewToken(
        deployment.id,
        systemUserId,
        {
          tokenType: 'view',
          expiresHours: 24,
          maxUses: undefined
        }
      );

      res.json({
        valid: true,
        token: tokenRecord.token,
        expiresAt: tokenRecord.expiresAt
      });
    } catch (error: unknown) {
    const err = error as Error;
      logger.error('Failed to verify password', { error });
      res.status(500).json({ error: 'Failed to verify password' });
    }
  }
);

export default router;
