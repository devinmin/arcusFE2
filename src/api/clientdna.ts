/**
 * Client DNA API Routes
 *
 * Sprint 7: Client DNA & Memory
 *
 * Endpoints for managing client DNA profiles and memory system.
 */

import { Router, Response } from 'express';
import { body, param, query, validationResult } from 'express-validator';
import { clientDNAService } from '../services/clientDNAService.js';
import { memoryDecayService } from '../services/memoryDecayService.js';
import { memoryConsolidationService } from '../services/memoryConsolidationService.js';
import { memoryPruningService } from '../services/memoryPruningService.js';
import { memoryDecayWorker } from '../workers/memoryDecayWorker.js';
import { logger } from '../utils/logger.js';
import { AuthenticatedRequest, requireAuth } from '../middleware/auth.js';
import { requireOrganization } from '../middleware/multiTenancy.js';

const router = Router();

// SEC-004 FIX: All client DNA routes require authentication and organization context
router.use(requireAuth);
router.use(requireOrganization);

// ============================================================================
// Client DNA Profile Endpoints
// ============================================================================

/**
 * GET /api/client-dna
 * Get Client DNA profile for organization/campaign
 */
router.get(
  '/',
  [
    query('campaignId').optional().isUUID()
  ],
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const organizationId = req.organizationId!;
      const campaignId = req.query.campaignId as string | undefined;

      const profile = await clientDNAService.getFullDNAProfile(organizationId, campaignId);

      return res.json(profile);
    } catch (error: unknown) {
    const err = error as Error;
      logger.error('Failed to get client DNA', { error });
      return res.status(500).json({ error: 'Failed to get client DNA profile' });
    }
  }
);

/**
 * GET /api/client-dna/context
 * Get DNA context string for content generation
 */
router.get(
  '/context',
  [
    query('campaignId').optional().isUUID()
  ],
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const organizationId = req.organizationId!;
      const campaignId = req.query.campaignId as string | undefined;

      const context = await clientDNAService.buildDNAContext(organizationId, campaignId);

      return res.json({ context });
    } catch (error: unknown) {
    const err = error as Error;
      logger.error('Failed to build DNA context', { error });
      return res.status(500).json({ error: 'Failed to build DNA context' });
    }
  }
);

/**
 * POST /api/client-dna/override
 * Set a manual preference override
 */
router.post(
  '/override',
  [
    body('section').isIn(['communication_style', 'timing_preferences', 'content_preferences', 'industry_context', 'visual_preferences']),
    body('key').isString().notEmpty(),
    body('value').exists(),
    body('campaignId').optional().isUUID()
  ],
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const organizationId = req.organizationId!;
      const { section, key, value, campaignId } = req.body;

      await clientDNAService.setManualOverride(
        organizationId,
        section,
        key,
        value,
        campaignId
      );

      return res.json({ success: true });
    } catch (error: unknown) {
    const err = error as Error;
      logger.error('Failed to set DNA override', { error });
      return res.status(500).json({ error: 'Failed to set override' });
    }
  }
);

/**
 * GET /api/client-dna/optimal-times
 * Get optimal send times based on learned preferences
 */
router.get(
  '/optimal-times',
  [
    query('campaignId').optional().isUUID()
  ],
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const organizationId = req.organizationId!;
      const campaignId = req.query.campaignId as string | undefined;

      const optimalTimes = await clientDNAService.getOptimalTimes(organizationId, campaignId);

      return res.json(optimalTimes);
    } catch (error: unknown) {
    const err = error as Error;
      logger.error('Failed to get optimal times', { error });
      return res.status(500).json({ error: 'Failed to get optimal times' });
    }
  }
);

/**
 * GET /api/client-dna/recommended-content
 * Get recommended content types based on performance
 */
router.get(
  '/recommended-content',
  [
    query('campaignId').optional().isUUID()
  ],
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const organizationId = req.organizationId!;
      const campaignId = req.query.campaignId as string | undefined;

      const recommended = await clientDNAService.getRecommendedContentTypes(organizationId, campaignId);

      return res.json(recommended);
    } catch (error: unknown) {
    const err = error as Error;
      logger.error('Failed to get recommended content', { error });
      return res.status(500).json({ error: 'Failed to get recommended content types' });
    }
  }
);

/**
 * POST /api/client-dna/learn/style
 * Submit content for style learning
 */
router.post(
  '/learn/style',
  [
    body('content').isString().notEmpty(),
    body('wasApproved').isBoolean(),
    body('iterationCount').isInt({ min: 0 }),
    body('deliverableId').optional().isUUID(),
    body('campaignId').optional().isUUID()
  ],
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const organizationId = req.organizationId!;
      const { content, wasApproved, iterationCount, deliverableId, campaignId } = req.body;

      await clientDNAService.learnCommunicationStyle(
        organizationId,
        { content, wasApproved, iterationCount, deliverableId },
        campaignId
      );

      return res.json({ success: true });
    } catch (error: unknown) {
    const err = error as Error;
      logger.error('Failed to learn style', { error });
      return res.status(500).json({ error: 'Failed to process style learning' });
    }
  }
);

/**
 * POST /api/client-dna/learn/timing
 * Record a timing interaction
 */
router.post(
  '/learn/timing',
  [
    body('interactionType').isIn(['approval', 'feedback', 'view', 'edit', 'login']),
    body('timestamp').optional().isISO8601(),
    body('previousEventAt').optional().isISO8601(),
    body('campaignId').optional().isUUID()
  ],
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const organizationId = req.organizationId!;
      const userId = req.user!.id;
      const { interactionType, timestamp, previousEventAt, campaignId } = req.body;

      await clientDNAService.recordTimingInteraction(
        organizationId,
        {
          interactionType,
          timestamp: timestamp ? new Date(timestamp) : undefined,
          previousEventAt: previousEventAt ? new Date(previousEventAt) : undefined,
          userId
        },
        campaignId
      );

      return res.json({ success: true });
    } catch (error: unknown) {
    const err = error as Error;
      logger.error('Failed to record timing', { error });
      return res.status(500).json({ error: 'Failed to record timing interaction' });
    }
  }
);

/**
 * POST /api/client-dna/learn/content-performance
 * Track content performance
 */
router.post(
  '/learn/content-performance',
  [
    body('deliverableId').isUUID(),
    body('contentType').isString().notEmpty(),
    body('contentFormat').optional().isString(),
    body('approvalStatus').isIn(['approved', 'rejected', 'iterated']),
    body('iterationCount').isInt({ min: 0 }),
    body('timeToApprovalHours').optional().isFloat({ min: 0 }),
    body('feedbackSentiment').optional().isIn(['positive', 'neutral', 'negative']),
    body('campaignId').optional().isUUID()
  ],
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const organizationId = req.organizationId!;
      const {
        deliverableId,
        contentType,
        contentFormat,
        approvalStatus,
        iterationCount,
        timeToApprovalHours,
        feedbackSentiment,
        campaignId
      } = req.body;

      await clientDNAService.trackContentPerformance(
        organizationId,
        {
          deliverableId,
          contentType,
          contentFormat,
          approvalStatus,
          iterationCount,
          timeToApprovalHours,
          feedbackSentiment
        },
        campaignId
      );

      return res.json({ success: true });
    } catch (error: unknown) {
    const err = error as Error;
      logger.error('Failed to track content performance', { error });
      return res.status(500).json({ error: 'Failed to track content performance' });
    }
  }
);

// ============================================================================
// Memory Management Endpoints
// ============================================================================

/**
 * GET /api/client-dna/memory/health
 * Get memory health summary
 */
router.get(
  '/memory/health',
  [
    query('campaignId').optional().isUUID()
  ],
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const organizationId = req.organizationId!;
      const campaignId = req.query.campaignId as string | undefined;

      const health = await memoryDecayService.getMemoryHealthSummary(organizationId, campaignId);

      return res.json(health);
    } catch (error: unknown) {
    const err = error as Error;
      logger.error('Failed to get memory health', { error });
      return res.status(500).json({ error: 'Failed to get memory health' });
    }
  }
);

/**
 * GET /api/client-dna/memory/strength-distribution
 * Get memory strength distribution
 */
router.get(
  '/memory/strength-distribution',
  [
    query('campaignId').optional().isUUID()
  ],
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const organizationId = req.organizationId!;
      const campaignId = req.query.campaignId as string | undefined;

      const distribution = await memoryDecayService.getStrengthDistribution(organizationId, campaignId);

      return res.json(distribution);
    } catch (error: unknown) {
    const err = error as Error;
      logger.error('Failed to get strength distribution', { error });
      return res.status(500).json({ error: 'Failed to get strength distribution' });
    }
  }
);

/**
 * GET /api/client-dna/memory/decay-history
 * Get decay metrics history
 */
router.get(
  '/memory/decay-history',
  [
    query('days').optional().isInt({ min: 1, max: 365 })
  ],
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const organizationId = req.organizationId!;
      const days = parseInt(req.query.days as string) || 30;

      const history = await memoryDecayService.getDecayMetricsHistory(organizationId, days);

      return res.json(history);
    } catch (error: unknown) {
    const err = error as Error;
      logger.error('Failed to get decay history', { error });
      return res.status(500).json({ error: 'Failed to get decay history' });
    }
  }
);

/**
 * GET /api/client-dna/memory/weak
 * Get weak memories (pruning candidates)
 */
router.get(
  '/memory/weak',
  [
    query('threshold').optional().isFloat({ min: 0, max: 1 })
  ],
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const organizationId = req.organizationId!;
      const threshold = parseFloat(req.query.threshold as string) || 0.2;

      const weakMemories = await memoryDecayService.getWeakMemories(organizationId, threshold);

      return res.json(weakMemories);
    } catch (error: unknown) {
    const err = error as Error;
      logger.error('Failed to get weak memories', { error });
      return res.status(500).json({ error: 'Failed to get weak memories' });
    }
  }
);

/**
 * POST /api/client-dna/memory
 * Create a new memory
 */
router.post(
  '/memory',
  [
    body('content').isString().notEmpty(),
    body('contentType').isIn(['fact', 'preference', 'pattern', 'instruction', 'context']),
    body('importance').optional().isInt({ min: 1, max: 10 }),
    body('category').optional().isString(),
    body('tags').optional().isArray(),
    body('campaignId').optional().isUUID()
  ],
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const organizationId = req.organizationId!;
      const { content, contentType, importance, category, tags, campaignId } = req.body;

      const memoryId = await memoryDecayService.createMemory(
        organizationId,
        content,
        contentType,
        { campaignId, importance, category, tags }
      );

      return res.status(201).json({ id: memoryId });
    } catch (error: unknown) {
    const err = error as Error;
      logger.error('Failed to create memory', { error });
      return res.status(500).json({ error: 'Failed to create memory' });
    }
  }
);

/**
 * POST /api/client-dna/memory/:id/touch
 * Touch a memory (record access)
 */
router.post(
  '/memory/:id/touch',
  [
    param('id').isUUID(),
    body('boostImportance').optional().isBoolean()
  ],
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { id } = req.params;
      const { boostImportance } = req.body;

      await memoryDecayService.touchMemory(id, boostImportance || false);

      return res.json({ success: true });
    } catch (error: unknown) {
    const err = error as Error;
      logger.error('Failed to touch memory', { error });
      return res.status(500).json({ error: 'Failed to touch memory' });
    }
  }
);

/**
 * POST /api/client-dna/memory/:id/reinforce
 * Reinforce a memory
 */
router.post(
  '/memory/:id/reinforce',
  [
    param('id').isUUID(),
    body('strength').optional().isFloat({ min: 0.1, max: 1 })
  ],
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { id } = req.params;
      const { strength } = req.body;

      await memoryDecayService.reinforceMemory(id, strength || 0.5);

      return res.json({ success: true });
    } catch (error: unknown) {
    const err = error as Error;
      logger.error('Failed to reinforce memory', { error });
      return res.status(500).json({ error: 'Failed to reinforce memory' });
    }
  }
);

/**
 * DELETE /api/client-dna/memory/:id
 * Archive a memory
 */
router.delete(
  '/memory/:id',
  [
    param('id').isUUID(),
    body('reason').optional().isString()
  ],
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { id } = req.params;
      const { reason } = req.body;

      await memoryDecayService.archiveMemory(id, reason || 'user_request');

      return res.json({ success: true });
    } catch (error: unknown) {
    const err = error as Error;
      logger.error('Failed to archive memory', { error });
      return res.status(500).json({ error: 'Failed to archive memory' });
    }
  }
);

/**
 * POST /api/client-dna/memory/:id/restore
 * Restore an archived memory
 */
router.post(
  '/memory/:id/restore',
  [
    param('id').isUUID()
  ],
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { id } = req.params;

      const success = await memoryDecayService.restoreMemory(id);

      if (success) {
        return res.json({ success: true });
      } else {
        return res.status(404).json({ error: 'Memory not found or cannot be restored' });
      }
    } catch (error: unknown) {
    const err = error as Error;
      logger.error('Failed to restore memory', { error });
      return res.status(500).json({ error: 'Failed to restore memory' });
    }
  }
);

// ============================================================================
// Consolidation Endpoints
// ============================================================================

/**
 * GET /api/client-dna/memory/consolidation/candidates
 * Get consolidation candidates
 */
router.get(
  '/memory/consolidation/candidates',
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const organizationId = req.organizationId!;

      const candidates = await memoryConsolidationService.findSimilarMemoriesContent(organizationId);

      return res.json(candidates);
    } catch (error: unknown) {
    const err = error as Error;
      logger.error('Failed to find consolidation candidates', { error });
      return res.status(500).json({ error: 'Failed to find consolidation candidates' });
    }
  }
);

/**
 * POST /api/client-dna/memory/consolidation
 * Execute memory consolidation
 */
router.post(
  '/memory/consolidation',
  [
    body('memoryIds').isArray({ min: 2, max: 10 }),
    body('memoryIds.*').isUUID(),
    body('strategy').isIn(['merge', 'summarize', 'keep_newest', 'keep_strongest'])
  ],
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const organizationId = req.organizationId!;
      const { memoryIds, strategy } = req.body;

      const result = await memoryConsolidationService.consolidateMemories(
        memoryIds,
        strategy,
        organizationId
      );

      return res.json(result);
    } catch (error: unknown) {
    const err = error as Error;
      logger.error('Failed to consolidate memories', { error });
      return res.status(500).json({ error: 'Failed to consolidate memories' });
    }
  }
);

/**
 * GET /api/client-dna/memory/consolidation/history
 * Get consolidation history
 */
router.get(
  '/memory/consolidation/history',
  [
    query('limit').optional().isInt({ min: 1, max: 100 })
  ],
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const organizationId = req.organizationId!;
      const limit = parseInt(req.query.limit as string) || 50;

      const history = await memoryConsolidationService.getConsolidationHistory(organizationId, limit);

      return res.json(history);
    } catch (error: unknown) {
    const err = error as Error;
      logger.error('Failed to get consolidation history', { error });
      return res.status(500).json({ error: 'Failed to get consolidation history' });
    }
  }
);

// ============================================================================
// Pruning Endpoints
// ============================================================================

/**
 * GET /api/client-dna/memory/pruning/summary
 * Get pruning summary
 */
router.get(
  '/memory/pruning/summary',
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const organizationId = req.organizationId!;

      const summary = await memoryPruningService.getPruningSummary(organizationId);

      return res.json(summary);
    } catch (error: unknown) {
    const err = error as Error;
      logger.error('Failed to get pruning summary', { error });
      return res.status(500).json({ error: 'Failed to get pruning summary' });
    }
  }
);

/**
 * GET /api/client-dna/memory/pruning/candidates
 * Get pruning candidates
 */
router.get(
  '/memory/pruning/candidates',
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const organizationId = req.organizationId!;

      const candidates = await memoryPruningService.findPruningCandidates(organizationId);

      return res.json(candidates);
    } catch (error: unknown) {
    const err = error as Error;
      logger.error('Failed to find pruning candidates', { error });
      return res.status(500).json({ error: 'Failed to find pruning candidates' });
    }
  }
);

/**
 * POST /api/client-dna/memory/pruning/execute
 * Execute pruning
 */
router.post(
  '/memory/pruning/execute',
  [
    body('dryRun').optional().isBoolean()
  ],
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const organizationId = req.organizationId!;
      const { dryRun } = req.body;

      const result = await memoryPruningService.executePruning(
        organizationId,
        undefined,
        { dryRun }
      );

      return res.json(result);
    } catch (error: unknown) {
    const err = error as Error;
      logger.error('Failed to execute pruning', { error });
      return res.status(500).json({ error: 'Failed to execute pruning' });
    }
  }
);

/**
 * GET /api/client-dna/memory/restorable
 * Get restorable memories
 */
router.get(
  '/memory/restorable',
  [
    query('limit').optional().isInt({ min: 1, max: 100 })
  ],
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const organizationId = req.organizationId!;
      const limit = parseInt(req.query.limit as string) || 50;

      const restorable = await memoryPruningService.getRestorableMemories(organizationId, limit);

      return res.json(restorable);
    } catch (error: unknown) {
    const err = error as Error;
      logger.error('Failed to get restorable memories', { error });
      return res.status(500).json({ error: 'Failed to get restorable memories' });
    }
  }
);

/**
 * POST /api/client-dna/memory/restore-batch
 * Restore multiple memories
 */
router.post(
  '/memory/restore-batch',
  [
    body('memoryIds').isArray({ min: 1, max: 50 }),
    body('memoryIds.*').isUUID()
  ],
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const organizationId = req.organizationId!;
      const { memoryIds } = req.body;

      const result = await memoryPruningService.restoreMemories(memoryIds, organizationId);

      return res.json(result);
    } catch (error: unknown) {
    const err = error as Error;
      logger.error('Failed to restore memories', { error });
      return res.status(500).json({ error: 'Failed to restore memories' });
    }
  }
);

// ============================================================================
// Worker Status Endpoint
// ============================================================================

/**
 * GET /api/client-dna/memory/worker/status
 * Get decay worker status
 */
router.get(
  '/memory/worker/status',
  async (_req: AuthenticatedRequest, res: Response) => {
    try {
      const status = memoryDecayWorker.getStatus();

      return res.json(status);
    } catch (error: unknown) {
    const err = error as Error;
      logger.error('Failed to get worker status', { error });
      return res.status(500).json({ error: 'Failed to get worker status' });
    }
  }
);

/**
 * POST /api/client-dna/memory/worker/trigger
 * Manually trigger decay run
 */
router.post(
  '/memory/worker/trigger',
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const organizationId = req.organizationId!;

      const result = await memoryDecayWorker.trigger(organizationId);

      return res.json(result);
    } catch (error: unknown) {
    const err = error as Error;
      logger.error('Failed to trigger decay run', { error });
      return res.status(500).json({ error: 'Failed to trigger decay run' });
    }
  }
);

export default router;
