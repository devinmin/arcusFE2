/**
 * Memory Routes - Phase 3: Accumulated Memory
 * Endpoints for learned preferences and interaction history
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import {
  requireOrganization,
  getOrganizationId,
  getUserId
} from '../middleware/multiTenancy.js';
import { requireZoFeature } from '../middleware/featureFlags.js';
import { memoryService } from '../services/memoryService.js';
import { logger } from '../utils/logger.js';

const router = Router();

// ============================================================================
// Preferences
// ============================================================================

/**
 * GET /api/memory/preferences
 * Get learned preferences for the organization
 */
router.get(
  '/preferences',
  requireAuth,
  requireOrganization,
  requireZoFeature('accumulatedMemory'),
  async (req: Request, res: Response) => {
    try {
      const organizationId = getOrganizationId(req)!;
      const { brandId, minConfidence } = req.query;

      const preferences = await memoryService.getPreferences(
        organizationId,
        brandId as string | undefined,
        minConfidence ? parseFloat(minConfidence as string) : undefined
      );

      res.json({ preferences });
    } catch (error: unknown) {
    const err = error as Error;
      logger.error('Failed to get preferences', { error });
      res.status(500).json({ error: 'Failed to get preferences' });
    }
  }
);

/**
 * PUT /api/memory/preferences
 * Set a manual preference override
 */
const setPreferenceSchema = z.object({
  brandId: z.string().uuid().nullable().optional(),
  category: z.enum(['tone', 'style', 'length', 'vocabulary', 'visual', 'format', 'timing']),
  key: z.string().min(1).max(100),
  value: z.unknown()
});

router.put(
  '/preferences',
  requireAuth,
  requireOrganization,
  requireZoFeature('accumulatedMemory'),
  async (req: Request, res: Response) => {
    try {
      const organizationId = getOrganizationId(req)!;
      const userId = getUserId(req)!;

      const parsed = setPreferenceSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: 'Invalid request', details: parsed.error.issues });
      }

      const { brandId, category, key, value } = parsed.data;

      await memoryService.setPreference(
        organizationId,
        brandId ?? null,
        category,
        key,
        value,
        userId
      );

      res.json({ success: true });
    } catch (error: unknown) {
    const err = error as Error;
      logger.error('Failed to set preference', { error });
      res.status(500).json({ error: 'Failed to set preference' });
    }
  }
);

// ============================================================================
// Memory Context
// ============================================================================

/**
 * GET /api/memory/context
 * Get memory context for injection into prompts
 */
router.get(
  '/context',
  requireAuth,
  requireOrganization,
  requireZoFeature('accumulatedMemory'),
  async (req: Request, res: Response) => {
    try {
      const organizationId = getOrganizationId(req)!;
      const { brandId } = req.query;

      const context = await memoryService.buildMemoryContext(
        organizationId,
        brandId as string | undefined
      );

      // Also return formatted version for direct prompt injection
      const formatted = memoryService.formatMemoryForPrompt(context);

      res.json({ context, formatted });
    } catch (error: unknown) {
    const err = error as Error;
      logger.error('Failed to get memory context', { error });
      res.status(500).json({ error: 'Failed to get memory context' });
    }
  }
);

// ============================================================================
// Interaction History
// ============================================================================

/**
 * GET /api/memory/deliverables/:id/history
 * Get interaction history for a specific deliverable
 */
router.get(
  '/deliverables/:id/history',
  requireAuth,
  requireOrganization,
  requireZoFeature('accumulatedMemory'),
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;

      const history = await memoryService.getDeliverableHistory(id);

      res.json({ history });
    } catch (error: unknown) {
    const err = error as Error;
      logger.error('Failed to get deliverable history', { error });
      res.status(500).json({ error: 'Failed to get deliverable history' });
    }
  }
);

/**
 * POST /api/memory/interactions
 * Record a new interaction (usually called internally, but exposed for manual testing)
 */
const recordInteractionSchema = z.object({
  interactionType: z.enum(['generation', 'iteration', 'approval', 'rejection', 'feedback', 'preference_set']),
  outcome: z.enum(['approved', 'approved_with_changes', 'iterated', 'rejected', 'abandoned']),
  deliverableId: z.string().uuid().optional(),
  campaignId: z.string().uuid().optional(),
  workflowId: z.string().uuid().optional(),
  originalContent: z.string().optional(),
  feedbackContent: z.string().optional(),
  resultingContent: z.string().optional(),
  agentId: z.string().optional(),
  deliverableType: z.string().optional(),
  iterationCount: z.number().optional()
});

router.post(
  '/interactions',
  requireAuth,
  requireOrganization,
  requireZoFeature('accumulatedMemory'),
  async (req: Request, res: Response) => {
    try {
      const organizationId = getOrganizationId(req)!;
      const userId = getUserId(req);

      const parsed = recordInteractionSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: 'Invalid request', details: parsed.error.issues });
      }

      const interactionId = await memoryService.recordInteraction({
        organizationId,
        userId: userId ?? undefined,
        ...parsed.data
      });

      res.json({ interactionId });
    } catch (error: unknown) {
    const err = error as Error;
      logger.error('Failed to record interaction', { error });
      res.status(500).json({ error: 'Failed to record interaction' });
    }
  }
);

export default router;
