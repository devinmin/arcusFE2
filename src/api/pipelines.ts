/**
 * Pipeline Routes
 *
 * Sprint 5: API endpoints for multi-pipeline CRM management.
 * Provides CRUD for pipelines, stages, deals, templates, metrics, and forecasting.
 */

import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requireOrganization, getOrganizationId, getUserId } from '../middleware/multiTenancy.js';
import { requireZoFeature } from '../middleware/featureFlags.js';
import { pipelineService, type DealOutcome } from '../services/pipelineService.js';
import { stageFieldsService } from '../services/stageFieldsService.js';
import { stageAutomationService } from '../services/stageAutomationService.js';
import { pipelineMetricsService } from '../services/pipelineMetricsService.js';
import { pipelineForecastService, type ForecastMethod } from '../services/pipelineForecastService.js';
import { logger } from '../utils/logger.js';

const router = Router();

// ============================================================================
// PIPELINE CRUD
// ============================================================================

/**
 * GET /api/pipelines
 * Get all pipelines for the organization
 */
router.get(
  '/',
  requireAuth,
  requireOrganization,
  requireZoFeature('crmFoundation'),
  async (req: Request, res: Response) => {
    try {
      const organizationId = getOrganizationId(req)!;
      const { includeArchived } = req.query;

      const pipelines = await pipelineService.getPipelines(organizationId, {
        includeArchived: includeArchived === 'true',
      });

      res.json({ pipelines });
    } catch (error: unknown) {
    const err = error as Error;
      logger.error('[PipelineRoutes] Error getting pipelines', { error });
      res.status(500).json({ error: 'Failed to get pipelines' });
    }
  }
);

/**
 * POST /api/pipelines
 * Create a new pipeline
 */
router.post(
  '/',
  requireAuth,
  requireOrganization,
  requireZoFeature('crmFoundation'),
  async (req: Request, res: Response) => {
    try {
      const organizationId = getOrganizationId(req)!;
      const userId = getUserId(req);
      const { name, description, pipelineType, stages, currency, isDefault } = req.body;

      if (!name) {
        return res.status(400).json({ error: 'name is required' });
      }

      const pipeline = await pipelineService.createPipeline(organizationId, {
        name,
        description,
        pipelineType,
        stages,
        currency,
        isDefault,
        createdByUserId: userId || undefined,
      });

      res.status(201).json(pipeline);
    } catch (error: unknown) {
    const err = error as Error;
      logger.error('[PipelineRoutes] Error creating pipeline', { error });
      res.status(500).json({ error: 'Failed to create pipeline' });
    }
  }
);

/**
 * GET /api/pipelines/default
 * Get or create the default pipeline
 */
router.get(
  '/default',
  requireAuth,
  requireOrganization,
  requireZoFeature('crmFoundation'),
  async (req: Request, res: Response) => {
    try {
      const organizationId = getOrganizationId(req)!;
      const pipeline = await pipelineService.getDefaultPipeline(organizationId);
      res.json(pipeline);
    } catch (error: unknown) {
    const err = error as Error;
      logger.error('[PipelineRoutes] Error getting default pipeline', { error });
      res.status(500).json({ error: 'Failed to get default pipeline' });
    }
  }
);

/**
 * GET /api/pipelines/:pipelineId
 * Get a single pipeline with stages
 */
router.get(
  '/:pipelineId',
  requireAuth,
  requireOrganization,
  requireZoFeature('crmFoundation'),
  async (req: Request, res: Response) => {
    try {
      const { pipelineId } = req.params;
      const pipeline = await pipelineService.getPipeline(pipelineId);
      res.json(pipeline);
    } catch (error: unknown) {
    const err = error as Error;
      logger.error('[PipelineRoutes] Error getting pipeline', { error });
      res.status(500).json({ error: 'Failed to get pipeline' });
    }
  }
);

/**
 * PATCH /api/pipelines/:pipelineId
 * Update a pipeline
 */
router.patch(
  '/:pipelineId',
  requireAuth,
  requireOrganization,
  requireZoFeature('crmFoundation'),
  async (req: Request, res: Response) => {
    try {
      const { pipelineId } = req.params;
      const { name, description, isDefault, isArchived, currency } = req.body;

      await pipelineService.updatePipeline(pipelineId, {
        name,
        description,
        isDefault,
        isArchived,
        currency,
      });

      const pipeline = await pipelineService.getPipeline(pipelineId);
      res.json(pipeline);
    } catch (error: unknown) {
    const err = error as Error;
      logger.error('[PipelineRoutes] Error updating pipeline', { error });
      res.status(500).json({ error: 'Failed to update pipeline' });
    }
  }
);

/**
 * DELETE /api/pipelines/:pipelineId
 * Delete a pipeline
 */
router.delete(
  '/:pipelineId',
  requireAuth,
  requireOrganization,
  requireZoFeature('crmFoundation'),
  async (req: Request, res: Response) => {
    try {
      const { pipelineId } = req.params;
      await pipelineService.deletePipeline(pipelineId);
      res.status(204).send();
    } catch (error: unknown) {
    const err = error as Error;
      logger.error('[PipelineRoutes] Error deleting pipeline', { error });
      if (err.message?.includes('Cannot delete')) {
        return res.status(400).json({ error: err.message });
      }
      res.status(500).json({ error: 'Failed to delete pipeline' });
    }
  }
);

/**
 * POST /api/pipelines/:pipelineId/clone
 * Clone a pipeline
 */
router.post(
  '/:pipelineId/clone',
  requireAuth,
  requireOrganization,
  requireZoFeature('crmFoundation'),
  async (req: Request, res: Response) => {
    try {
      const { pipelineId } = req.params;
      const { newName } = req.body;

      if (!newName) {
        return res.status(400).json({ error: 'newName is required' });
      }

      const newPipeline = await pipelineService.clonePipeline(pipelineId, newName);
      res.status(201).json(newPipeline);
    } catch (error: unknown) {
    const err = error as Error;
      logger.error('[PipelineRoutes] Error cloning pipeline', { error });
      res.status(500).json({ error: 'Failed to clone pipeline' });
    }
  }
);

// ============================================================================
// STAGE MANAGEMENT
// ============================================================================

/**
 * POST /api/pipelines/:pipelineId/stages
 * Create a new stage
 */
router.post(
  '/:pipelineId/stages',
  requireAuth,
  requireOrganization,
  requireZoFeature('crmFoundation'),
  async (req: Request, res: Response) => {
    try {
      const { pipelineId } = req.params;
      const {
        name,
        stageKey,
        color,
        stageType,
        orderIndex,
        dealProbability,
        dealRotting,
        requiredFields,
        automations,
      } = req.body;

      if (!name) {
        return res.status(400).json({ error: 'name is required' });
      }

      const stage = await pipelineService.createStage(pipelineId, {
        name,
        stageKey,
        color,
        stageType,
        orderIndex,
        dealProbability,
        dealRotting,
        requiredFields,
        automations,
      });

      res.status(201).json(stage);
    } catch (error: unknown) {
    const err = error as Error;
      logger.error('[PipelineRoutes] Error creating stage', { error });
      res.status(500).json({ error: 'Failed to create stage' });
    }
  }
);

/**
 * PATCH /api/pipelines/:pipelineId/stages/:stageId
 * Update a stage
 */
router.patch(
  '/:pipelineId/stages/:stageId',
  requireAuth,
  requireOrganization,
  requireZoFeature('crmFoundation'),
  async (req: Request, res: Response) => {
    try {
      const { stageId } = req.params;
      const {
        name,
        color,
        stageType,
        dealProbability,
        dealRotting,
        requiredFields,
        automations,
      } = req.body;

      await pipelineService.updateStage(stageId, {
        name,
        color,
        stageType,
        dealProbability,
        dealRotting,
        requiredFields,
        automations,
      });

      res.json({ success: true });
    } catch (error: unknown) {
    const err = error as Error;
      logger.error('[PipelineRoutes] Error updating stage', { error });
      res.status(500).json({ error: 'Failed to update stage' });
    }
  }
);

/**
 * DELETE /api/pipelines/:pipelineId/stages/:stageId
 * Delete a stage
 */
router.delete(
  '/:pipelineId/stages/:stageId',
  requireAuth,
  requireOrganization,
  requireZoFeature('crmFoundation'),
  async (req: Request, res: Response) => {
    try {
      const { stageId } = req.params;
      const { targetStageId } = req.query;

      await pipelineService.deleteStage(stageId, targetStageId as string);
      res.status(204).send();
    } catch (error: unknown) {
    const err = error as Error;
      logger.error('[PipelineRoutes] Error deleting stage', { error });
      if (err.message?.includes('Cannot delete') || err.message?.includes('must provide')) {
        return res.status(400).json({ error: err.message });
      }
      res.status(500).json({ error: 'Failed to delete stage' });
    }
  }
);

/**
 * POST /api/pipelines/:pipelineId/stages/reorder
 * Reorder stages
 */
router.post(
  '/:pipelineId/stages/reorder',
  requireAuth,
  requireOrganization,
  requireZoFeature('crmFoundation'),
  async (req: Request, res: Response) => {
    try {
      const { pipelineId } = req.params;
      const { stageOrder } = req.body;

      if (!stageOrder || !Array.isArray(stageOrder)) {
        return res.status(400).json({ error: 'stageOrder array is required' });
      }

      await pipelineService.reorderStages(pipelineId, stageOrder);
      const pipeline = await pipelineService.getPipeline(pipelineId);
      res.json(pipeline);
    } catch (error: unknown) {
    const err = error as Error;
      logger.error('[PipelineRoutes] Error reordering stages', { error });
      res.status(500).json({ error: 'Failed to reorder stages' });
    }
  }
);

// ============================================================================
// DEAL MANAGEMENT
// ============================================================================

/**
 * GET /api/pipelines/:pipelineId/deals
 * Get deals in a pipeline
 */
router.get(
  '/:pipelineId/deals',
  requireAuth,
  requireOrganization,
  requireZoFeature('crmFoundation'),
  async (req: Request, res: Response) => {
    try {
      const { pipelineId } = req.params;
      const {
        stageId,
        leadId,
        ownerUserId,
        isOpen,
        search,
        minValue,
        maxValue,
        expectedCloseBefore,
        expectedCloseAfter,
        limit,
        offset,
        orderBy,
        orderDir,
      } = req.query;

      const result = await pipelineService.getDeals(pipelineId, {
        stageId: stageId as string,
        leadId: leadId as string,
        ownerUserId: ownerUserId as string,
        isOpen: isOpen === undefined ? undefined : isOpen === 'true',
        search: search as string,
        minValue: minValue ? parseFloat(minValue as string) : undefined,
        maxValue: maxValue ? parseFloat(maxValue as string) : undefined,
        expectedCloseBefore: expectedCloseBefore ? new Date(expectedCloseBefore as string) : undefined,
        expectedCloseAfter: expectedCloseAfter ? new Date(expectedCloseAfter as string) : undefined,
        limit: limit ? parseInt(limit as string, 10) : undefined,
        offset: offset ? parseInt(offset as string, 10) : undefined,
        orderBy: orderBy as any,
        orderDir: orderDir as any,
      });

      res.json(result);
    } catch (error: unknown) {
    const err = error as Error;
      logger.error('[PipelineRoutes] Error getting deals', { error });
      res.status(500).json({ error: 'Failed to get deals' });
    }
  }
);

/**
 * POST /api/pipelines/:pipelineId/deals
 * Create a new deal
 */
router.post(
  '/:pipelineId/deals',
  requireAuth,
  requireOrganization,
  requireZoFeature('crmFoundation'),
  async (req: Request, res: Response) => {
    try {
      const organizationId = getOrganizationId(req)!;
      const { pipelineId } = req.params;
      const {
        name,
        leadId,
        stageId,
        dealValue,
        currency,
        expectedCloseDate,
        probability,
        notes,
        ownerUserId,
        customFields,
      } = req.body;

      if (!stageId) {
        return res.status(400).json({ error: 'stageId is required' });
      }

      const deal = await pipelineService.createDeal(organizationId, pipelineId, {
        name,
        leadId,
        stageId,
        dealValue,
        currency,
        expectedCloseDate: expectedCloseDate ? new Date(expectedCloseDate) : undefined,
        probability,
        notes,
        ownerUserId,
        customFields,
      });

      res.status(201).json(deal);
    } catch (error: unknown) {
    const err = error as Error;
      logger.error('[PipelineRoutes] Error creating deal', { error });
      res.status(500).json({ error: 'Failed to create deal' });
    }
  }
);

/**
 * GET /api/pipelines/deals/:dealId
 * Get a single deal
 */
router.get(
  '/deals/:dealId',
  requireAuth,
  requireOrganization,
  requireZoFeature('crmFoundation'),
  async (req: Request, res: Response) => {
    try {
      const { dealId } = req.params;
      const deal = await pipelineService.getDeal(dealId);
      res.json(deal);
    } catch (error: unknown) {
    const err = error as Error;
      logger.error('[PipelineRoutes] Error getting deal', { error });
      res.status(500).json({ error: 'Failed to get deal' });
    }
  }
);

/**
 * PATCH /api/pipelines/deals/:dealId
 * Update a deal
 */
router.patch(
  '/deals/:dealId',
  requireAuth,
  requireOrganization,
  requireZoFeature('crmFoundation'),
  async (req: Request, res: Response) => {
    try {
      const { dealId } = req.params;
      const {
        name,
        dealValue,
        currency,
        expectedCloseDate,
        probability,
        notes,
        ownerUserId,
        customFields,
      } = req.body;

      await pipelineService.updateDeal(dealId, {
        name,
        dealValue,
        currency,
        expectedCloseDate: expectedCloseDate ? new Date(expectedCloseDate) : undefined,
        probability,
        notes,
        ownerUserId,
        customFields,
      });

      const deal = await pipelineService.getDeal(dealId);
      res.json(deal);
    } catch (error: unknown) {
    const err = error as Error;
      logger.error('[PipelineRoutes] Error updating deal', { error });
      res.status(500).json({ error: 'Failed to update deal' });
    }
  }
);

/**
 * POST /api/pipelines/deals/:dealId/move
 * Move a deal to a different stage (with validation)
 */
router.post(
  '/deals/:dealId/move',
  requireAuth,
  requireOrganization,
  requireZoFeature('crmFoundation'),
  async (req: Request, res: Response) => {
    try {
      const { dealId } = req.params;
      const userId = getUserId(req);
      const { targetStageId, bypasses, skipValidation } = req.body;

      if (!targetStageId) {
        return res.status(400).json({ error: 'targetStageId is required' });
      }

      // Check if validation should be performed
      if (!skipValidation) {
        const { allowed, validation } = await stageFieldsService.canMoveToStage(
          dealId,
          targetStageId
        );

        if (!allowed && !bypasses) {
          return res.status(400).json({
            error: 'Stage requirements not met',
            validation,
          });
        }

        // Record bypasses if provided
        if (!allowed && bypasses && Array.isArray(bypasses)) {
          await stageFieldsService.recordMultipleBypasses(
            dealId,
            targetStageId,
            bypasses,
            userId!
          );
        }
      }

      // Move the deal
      await pipelineService.moveDealToStage(dealId, targetStageId, userId || undefined);

      // Trigger stage automation
      await stageAutomationService.onStageEnter(dealId, targetStageId, userId || undefined);

      const deal = await pipelineService.getDeal(dealId);
      res.json(deal);
    } catch (error: unknown) {
    const err = error as Error;
      logger.error('[PipelineRoutes] Error moving deal', { error });
      res.status(500).json({ error: 'Failed to move deal' });
    }
  }
);

/**
 * POST /api/pipelines/deals/:dealId/close
 * Close a deal (won or lost)
 */
router.post(
  '/deals/:dealId/close',
  requireAuth,
  requireOrganization,
  requireZoFeature('crmFoundation'),
  async (req: Request, res: Response) => {
    try {
      const { dealId } = req.params;
      const userId = getUserId(req);
      const { outcome, reason, reasonCategory, actualValue, competitorName, notes } = req.body;

      if (!outcome || !['won', 'lost'].includes(outcome)) {
        return res.status(400).json({ error: 'outcome must be "won" or "lost"' });
      }

      await pipelineService.closeDeal(dealId, {
        outcome: outcome as DealOutcome,
        reason,
        reasonCategory,
        actualValue,
        competitorName,
        notes,
        closedByUserId: userId || undefined,
      });

      const deal = await pipelineService.getDeal(dealId);
      res.json(deal);
    } catch (error: unknown) {
    const err = error as Error;
      logger.error('[PipelineRoutes] Error closing deal', { error });
      res.status(500).json({ error: 'Failed to close deal' });
    }
  }
);

/**
 * GET /api/pipelines/deals/:dealId/transitions
 * Get stage transition history for a deal
 */
router.get(
  '/deals/:dealId/transitions',
  requireAuth,
  requireOrganization,
  requireZoFeature('crmFoundation'),
  async (req: Request, res: Response) => {
    try {
      const { dealId } = req.params;
      const transitions = await pipelineService.getDealTransitions(dealId);
      res.json({ transitions });
    } catch (error: unknown) {
    const err = error as Error;
      logger.error('[PipelineRoutes] Error getting deal transitions', { error });
      res.status(500).json({ error: 'Failed to get deal transitions' });
    }
  }
);

/**
 * GET /api/pipelines/deals/:dealId/completion
 * Get deal completion status and stage readiness
 */
router.get(
  '/deals/:dealId/completion',
  requireAuth,
  requireOrganization,
  requireZoFeature('crmFoundation'),
  async (req: Request, res: Response) => {
    try {
      const { dealId } = req.params;
      const status = await stageFieldsService.getDealCompletionStatus(dealId);
      res.json(status);
    } catch (error: unknown) {
    const err = error as Error;
      logger.error('[PipelineRoutes] Error getting deal completion', { error });
      res.status(500).json({ error: 'Failed to get deal completion status' });
    }
  }
);

/**
 * GET /api/pipelines/deals/:dealId/bypasses
 * Get field bypass history for a deal
 */
router.get(
  '/deals/:dealId/bypasses',
  requireAuth,
  requireOrganization,
  requireZoFeature('crmFoundation'),
  async (req: Request, res: Response) => {
    try {
      const { dealId } = req.params;
      const bypasses = await stageFieldsService.getDealBypasses(dealId);
      res.json({ bypasses });
    } catch (error: unknown) {
    const err = error as Error;
      logger.error('[PipelineRoutes] Error getting deal bypasses', { error });
      res.status(500).json({ error: 'Failed to get deal bypasses' });
    }
  }
);

// ============================================================================
// STAGE FIELD REQUIREMENTS
// ============================================================================

/**
 * GET /api/pipelines/:pipelineId/field-configs
 * Get field requirement configurations for all stages
 */
router.get(
  '/:pipelineId/field-configs',
  requireAuth,
  requireOrganization,
  requireZoFeature('crmFoundation'),
  async (req: Request, res: Response) => {
    try {
      const { pipelineId } = req.params;
      const configs = await stageFieldsService.getStageFieldConfigs(pipelineId);
      res.json({ configs });
    } catch (error: unknown) {
    const err = error as Error;
      logger.error('[PipelineRoutes] Error getting field configs', { error });
      res.status(500).json({ error: 'Failed to get field configurations' });
    }
  }
);

/**
 * PUT /api/pipelines/:pipelineId/stages/:stageId/required-fields
 * Update required fields for a stage
 */
router.put(
  '/:pipelineId/stages/:stageId/required-fields',
  requireAuth,
  requireOrganization,
  requireZoFeature('crmFoundation'),
  async (req: Request, res: Response) => {
    try {
      const { stageId } = req.params;
      const { requiredFields } = req.body;

      if (!requiredFields || !Array.isArray(requiredFields)) {
        return res.status(400).json({ error: 'requiredFields array is required' });
      }

      await stageFieldsService.updateStageRequiredFields(stageId, requiredFields);
      res.json({ success: true });
    } catch (error: unknown) {
    const err = error as Error;
      logger.error('[PipelineRoutes] Error updating required fields', { error });
      res.status(500).json({ error: 'Failed to update required fields' });
    }
  }
);

/**
 * GET /api/pipelines/available-fields
 * Get list of available fields that can be made required
 */
router.get(
  '/available-fields',
  requireAuth,
  requireOrganization,
  requireZoFeature('crmFoundation'),
  async (req: Request, res: Response) => {
    try {
      const organizationId = getOrganizationId(req)!;

      const standardFields = stageFieldsService.getAvailableFields();
      const customFields = await stageFieldsService.getCustomFields(organizationId);

      res.json({
        standardFields,
        customFields,
      });
    } catch (error: unknown) {
    const err = error as Error;
      logger.error('[PipelineRoutes] Error getting available fields', { error });
      res.status(500).json({ error: 'Failed to get available fields' });
    }
  }
);

// ============================================================================
// STAGE AUTOMATIONS
// ============================================================================

/**
 * GET /api/pipelines/:pipelineId/stages/:stageId/automations
 * Get automations for a stage
 */
router.get(
  '/:pipelineId/stages/:stageId/automations',
  requireAuth,
  requireOrganization,
  requireZoFeature('crmFoundation'),
  async (req: Request, res: Response) => {
    try {
      const { pipelineId } = req.params;
      const { stageId } = req.params;

      const pipeline = await pipelineService.getPipeline(pipelineId);
      const stage = pipeline.stages.find((s) => s.id === stageId || s.stageKey === stageId);

      if (!stage) {
        return res.status(404).json({ error: 'Stage not found' });
      }

      res.json({ automations: stage.automations || [] });
    } catch (error: unknown) {
    const err = error as Error;
      logger.error('[PipelineRoutes] Error getting automations', { error });
      res.status(500).json({ error: 'Failed to get automations' });
    }
  }
);

/**
 * POST /api/pipelines/:pipelineId/stages/:stageId/automations
 * Add an automation to a stage
 */
router.post(
  '/:pipelineId/stages/:stageId/automations',
  requireAuth,
  requireOrganization,
  requireZoFeature('crmFoundation'),
  async (req: Request, res: Response) => {
    try {
      const { stageId } = req.params;
      const { trigger, action, config, name, description } = req.body;

      if (!trigger || !action) {
        return res.status(400).json({ error: 'trigger and action are required' });
      }

      await stageAutomationService.addAutomation(stageId, {
        trigger,
        action,
        config,
        name,
        description,
      });

      res.status(201).json({ success: true });
    } catch (error: unknown) {
    const err = error as Error;
      logger.error('[PipelineRoutes] Error adding automation', { error });
      res.status(500).json({ error: 'Failed to add automation' });
    }
  }
);

/**
 * PATCH /api/pipelines/:pipelineId/stages/:stageId/automations/:automationId
 * Update an automation
 */
router.patch(
  '/:pipelineId/stages/:stageId/automations/:automationId',
  requireAuth,
  requireOrganization,
  requireZoFeature('crmFoundation'),
  async (req: Request, res: Response) => {
    try {
      const { stageId, automationId } = req.params;
      const updates = req.body;

      await stageAutomationService.updateAutomation(stageId, automationId, updates);
      res.json({ success: true });
    } catch (error: unknown) {
    const err = error as Error;
      logger.error('[PipelineRoutes] Error updating automation', { error });
      res.status(500).json({ error: 'Failed to update automation' });
    }
  }
);

/**
 * DELETE /api/pipelines/:pipelineId/stages/:stageId/automations/:automationId
 * Remove an automation
 */
router.delete(
  '/:pipelineId/stages/:stageId/automations/:automationId',
  requireAuth,
  requireOrganization,
  requireZoFeature('crmFoundation'),
  async (req: Request, res: Response) => {
    try {
      const { stageId, automationId } = req.params;

      await stageAutomationService.removeAutomation(stageId, automationId);
      res.status(204).send();
    } catch (error: unknown) {
    const err = error as Error;
      logger.error('[PipelineRoutes] Error removing automation', { error });
      res.status(500).json({ error: 'Failed to remove automation' });
    }
  }
);

/**
 * POST /api/pipelines/:pipelineId/stages/:stageId/automations/:automationId/toggle
 * Enable/disable an automation
 */
router.post(
  '/:pipelineId/stages/:stageId/automations/:automationId/toggle',
  requireAuth,
  requireOrganization,
  requireZoFeature('crmFoundation'),
  async (req: Request, res: Response) => {
    try {
      const { stageId, automationId } = req.params;
      const { enabled } = req.body;

      if (typeof enabled !== 'boolean') {
        return res.status(400).json({ error: 'enabled boolean is required' });
      }

      await stageAutomationService.toggleAutomation(stageId, automationId, enabled);
      res.json({ success: true });
    } catch (error: unknown) {
    const err = error as Error;
      logger.error('[PipelineRoutes] Error toggling automation', { error });
      res.status(500).json({ error: 'Failed to toggle automation' });
    }
  }
);

/**
 * GET /api/pipelines/:pipelineId/aging-deals
 * Get deals that have exceeded time-in-stage thresholds
 */
router.get(
  '/:pipelineId/aging-deals',
  requireAuth,
  requireOrganization,
  requireZoFeature('crmFoundation'),
  async (req: Request, res: Response) => {
    try {
      const { pipelineId } = req.params;
      const agingDeals = await stageAutomationService.getAgingDeals(pipelineId);
      res.json({ agingDeals });
    } catch (error: unknown) {
    const err = error as Error;
      logger.error('[PipelineRoutes] Error getting aging deals', { error });
      res.status(500).json({ error: 'Failed to get aging deals' });
    }
  }
);

// ============================================================================
// TEMPLATES
// ============================================================================

/**
 * GET /api/pipelines/templates
 * Get available pipeline templates
 */
router.get(
  '/templates',
  requireAuth,
  requireOrganization,
  requireZoFeature('crmFoundation'),
  async (req: Request, res: Response) => {
    try {
      const organizationId = getOrganizationId(req)!;
      const { includeSystem } = req.query;

      const templates = await pipelineService.getTemplates(organizationId, {
        includeSystem: includeSystem !== 'false',
      });

      res.json({ templates });
    } catch (error: unknown) {
    const err = error as Error;
      logger.error('[PipelineRoutes] Error getting templates', { error });
      res.status(500).json({ error: 'Failed to get templates' });
    }
  }
);

/**
 * POST /api/pipelines/templates
 * Create a template from an existing pipeline
 */
router.post(
  '/templates',
  requireAuth,
  requireOrganization,
  requireZoFeature('crmFoundation'),
  async (req: Request, res: Response) => {
    try {
      const organizationId = getOrganizationId(req)!;
      const { pipelineId, templateName, templateDescription, category } = req.body;

      if (!pipelineId || !templateName) {
        return res.status(400).json({ error: 'pipelineId and templateName are required' });
      }

      const template = await pipelineService.createTemplateFromPipeline(
        pipelineId,
        templateName,
        templateDescription,
        category
      );

      res.status(201).json(template);
    } catch (error: unknown) {
    const err = error as Error;
      logger.error('[PipelineRoutes] Error creating template', { error });
      res.status(500).json({ error: 'Failed to create template' });
    }
  }
);

/**
 * POST /api/pipelines/templates/:templateId/apply
 * Create a new pipeline from a template
 */
router.post(
  '/templates/:templateId/apply',
  requireAuth,
  requireOrganization,
  requireZoFeature('crmFoundation'),
  async (req: Request, res: Response) => {
    try {
      const organizationId = getOrganizationId(req)!;
      const userId = getUserId(req);
      const { templateId } = req.params;
      const { name } = req.body;

      if (!name) {
        return res.status(400).json({ error: 'name is required' });
      }

      // Get template and create pipeline
      const templates = await pipelineService.getTemplates(organizationId, { includeSystem: true });
      const template = templates.find((t) => t.id === templateId);

      if (!template) {
        return res.status(404).json({ error: 'Template not found' });
      }

      const pipeline = await pipelineService.createPipeline(organizationId, {
        name,
        description: template.description,
        pipelineType: template.category,
        stages: template.stages,
        createdByUserId: userId || undefined,
      });

      res.status(201).json(pipeline);
    } catch (error: unknown) {
    const err = error as Error;
      logger.error('[PipelineRoutes] Error applying template', { error });
      res.status(500).json({ error: 'Failed to apply template' });
    }
  }
);

/**
 * DELETE /api/pipelines/templates/:templateId
 * Delete a custom template
 */
router.delete(
  '/templates/:templateId',
  requireAuth,
  requireOrganization,
  requireZoFeature('crmFoundation'),
  async (req: Request, res: Response) => {
    try {
      const { templateId } = req.params;

      await pipelineService.deleteTemplate(templateId);
      res.status(204).send();
    } catch (error: unknown) {
    const err = error as Error;
      logger.error('[PipelineRoutes] Error deleting template', { error });
      if (err.message?.includes('Cannot delete')) {
        return res.status(400).json({ error: err.message });
      }
      res.status(500).json({ error: 'Failed to delete template' });
    }
  }
);

// ============================================================================
// METRICS
// ============================================================================

/**
 * GET /api/pipelines/:pipelineId/metrics
 * Get pipeline metrics
 */
router.get(
  '/:pipelineId/metrics',
  requireAuth,
  requireOrganization,
  requireZoFeature('crmFoundation'),
  async (req: Request, res: Response) => {
    try {
      const { pipelineId } = req.params;
      const { startDate, endDate } = req.query;

      const metrics = await pipelineMetricsService.getPipelineMetrics(
        pipelineId,
        startDate ? new Date(startDate as string) : undefined,
        endDate ? new Date(endDate as string) : undefined
      );

      res.json(metrics);
    } catch (error: unknown) {
    const err = error as Error;
      logger.error('[PipelineRoutes] Error getting metrics', { error });
      res.status(500).json({ error: 'Failed to get metrics' });
    }
  }
);

/**
 * GET /api/pipelines/:pipelineId/stage-metrics
 * Get detailed stage-by-stage metrics
 */
router.get(
  '/:pipelineId/stage-metrics',
  requireAuth,
  requireOrganization,
  requireZoFeature('crmFoundation'),
  async (req: Request, res: Response) => {
    try {
      const { pipelineId } = req.params;
      const { startDate, endDate } = req.query;

      // Note: getStageMetrics returns current stage metrics, not historical
      // For historical data, use getPipelineMetrics with date range
      const stageMetrics = await pipelineMetricsService.getStageMetrics(pipelineId);

      res.json({ stageMetrics });
    } catch (error: unknown) {
    const err = error as Error;
      logger.error('[PipelineRoutes] Error getting stage metrics', { error });
      res.status(500).json({ error: 'Failed to get stage metrics' });
    }
  }
);

/**
 * GET /api/pipelines/:pipelineId/win-loss
 * Get win/loss analysis
 */
router.get(
  '/:pipelineId/win-loss',
  requireAuth,
  requireOrganization,
  requireZoFeature('crmFoundation'),
  async (req: Request, res: Response) => {
    try {
      const { pipelineId } = req.params;
      const { startDate, endDate } = req.query;

      const analysis = await pipelineMetricsService.getWinLossAnalysis(
        pipelineId,
        startDate ? new Date(startDate as string) : undefined,
        endDate ? new Date(endDate as string) : undefined
      );

      res.json(analysis);
    } catch (error: unknown) {
    const err = error as Error;
      logger.error('[PipelineRoutes] Error getting win/loss analysis', { error });
      res.status(500).json({ error: 'Failed to get win/loss analysis' });
    }
  }
);

/**
 * GET /api/pipelines/:pipelineId/trends
 * Get pipeline trends over time
 */
router.get(
  '/:pipelineId/trends',
  requireAuth,
  requireOrganization,
  requireZoFeature('crmFoundation'),
  async (req: Request, res: Response) => {
    try {
      const { pipelineId } = req.params;
      const { startDate, endDate, granularity } = req.query;

      const trends = await pipelineMetricsService.getPipelineTrends(
        pipelineId,
        startDate ? new Date(startDate as string) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        endDate ? new Date(endDate as string) : new Date(),
        (granularity as 'daily' | 'weekly' | 'monthly') || 'daily'
      );

      res.json({ trends });
    } catch (error: unknown) {
    const err = error as Error;
      logger.error('[PipelineRoutes] Error getting trends', { error });
      res.status(500).json({ error: 'Failed to get trends' });
    }
  }
);

/**
 * GET /api/pipelines/cross-metrics
 * Get cross-pipeline comparison metrics
 */
router.get(
  '/cross-metrics',
  requireAuth,
  requireOrganization,
  requireZoFeature('crmFoundation'),
  async (req: Request, res: Response) => {
    try {
      const organizationId = getOrganizationId(req)!;
      const { pipelineIds, startDate, endDate } = req.query;

      // Note: getCrossPipelineMetrics doesn't filter by pipelineIds, it returns all pipelines in org
      // The pipelineIds param is ignored for now - could be added to filter results client-side
      const metrics = await pipelineMetricsService.getCrossPipelineMetrics(
        organizationId,
        startDate ? new Date(startDate as string) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        endDate ? new Date(endDate as string) : new Date()
      );

      res.json(metrics);
    } catch (error: unknown) {
    const err = error as Error;
      logger.error('[PipelineRoutes] Error getting cross-pipeline metrics', { error });
      res.status(500).json({ error: 'Failed to get cross-pipeline metrics' });
    }
  }
);

/**
 * POST /api/pipelines/:pipelineId/snapshots
 * Create a daily snapshot (usually called by cron)
 */
router.post(
  '/:pipelineId/snapshots',
  requireAuth,
  requireOrganization,
  requireZoFeature('crmFoundation'),
  async (req: Request, res: Response) => {
    try {
      const { pipelineId } = req.params;

      await pipelineMetricsService.createDailySnapshot(pipelineId);
      res.status(201).json({ success: true });
    } catch (error: unknown) {
    const err = error as Error;
      logger.error('[PipelineRoutes] Error creating snapshot', { error });
      res.status(500).json({ error: 'Failed to create snapshot' });
    }
  }
);

/**
 * GET /api/pipelines/:pipelineId/snapshots
 * Get historical snapshots
 */
router.get(
  '/:pipelineId/snapshots',
  requireAuth,
  requireOrganization,
  requireZoFeature('crmFoundation'),
  async (req: Request, res: Response) => {
    try {
      const { pipelineId } = req.params;
      const { startDate, endDate } = req.query;

      const snapshots = await pipelineMetricsService.getSnapshots(
        pipelineId,
        startDate ? new Date(startDate as string) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        endDate ? new Date(endDate as string) : new Date()
      );

      res.json({ snapshots });
    } catch (error: unknown) {
    const err = error as Error;
      logger.error('[PipelineRoutes] Error getting snapshots', { error });
      res.status(500).json({ error: 'Failed to get snapshots' });
    }
  }
);

// ============================================================================
// FORECASTING
// ============================================================================

/**
 * GET /api/pipelines/:pipelineId/forecast
 * Generate pipeline forecast
 */
router.get(
  '/:pipelineId/forecast',
  requireAuth,
  requireOrganization,
  requireZoFeature('crmFoundation'),
  async (req: Request, res: Response) => {
    try {
      const { pipelineId } = req.params;
      const { method, periodMonths } = req.query;

      // Calculate periodEnd based on periodMonths (default 3 months)
      const months = periodMonths ? parseInt(periodMonths as string, 10) : 3;
      const periodEnd = new Date();
      periodEnd.setMonth(periodEnd.getMonth() + months);

      const forecast = await pipelineForecastService.generateForecast(
        pipelineId,
        periodEnd,
        (method as ForecastMethod) || 'weighted_probability'
      );

      res.json(forecast);
    } catch (error: unknown) {
    const err = error as Error;
      logger.error('[PipelineRoutes] Error generating forecast', { error });
      res.status(500).json({ error: 'Failed to generate forecast' });
    }
  }
);

/**
 * GET /api/pipelines/organization-forecast
 * Get organization-wide forecast across all pipelines
 */
router.get(
  '/organization-forecast',
  requireAuth,
  requireOrganization,
  requireZoFeature('crmFoundation'),
  async (req: Request, res: Response) => {
    try {
      const organizationId = getOrganizationId(req)!;
      const { method, periodMonths } = req.query;

      // Calculate periodEnd based on periodMonths (default 3 months)
      const months = periodMonths ? parseInt(periodMonths as string, 10) : 3;
      const periodEnd = new Date();
      periodEnd.setMonth(periodEnd.getMonth() + months);

      const forecast = await pipelineForecastService.generateOrganizationForecast(
        organizationId,
        periodEnd
      );

      res.json(forecast);
    } catch (error: unknown) {
    const err = error as Error;
      logger.error('[PipelineRoutes] Error generating organization forecast', { error });
      res.status(500).json({ error: 'Failed to generate organization forecast' });
    }
  }
);

/**
 * POST /api/pipelines/:pipelineId/forecast/scenarios
 * Run scenario analysis
 */
router.post(
  '/:pipelineId/forecast/scenarios',
  requireAuth,
  requireOrganization,
  requireZoFeature('crmFoundation'),
  async (req: Request, res: Response) => {
    try {
      const { pipelineId } = req.params;
      const { scenarios, periodMonths } = req.body;

      // Calculate periodEnd based on periodMonths (default 3 months)
      const months = periodMonths ? parseInt(periodMonths as string, 10) : 3;
      const periodEnd = new Date();
      periodEnd.setMonth(periodEnd.getMonth() + months);

      let results;

      if (scenarios && Array.isArray(scenarios)) {
        // Run custom scenarios
        results = await Promise.all(
          scenarios.map((s: any) => pipelineForecastService.runScenario(pipelineId, periodEnd, s))
        );
      } else {
        // Run standard scenarios (conservative, baseline, optimistic)
        results = await pipelineForecastService.runStandardScenarios(pipelineId, periodEnd);
      }

      res.json({ scenarios: results });
    } catch (error: unknown) {
    const err = error as Error;
      logger.error('[PipelineRoutes] Error running scenarios', { error });
      res.status(500).json({ error: 'Failed to run scenarios' });
    }
  }
);

/**
 * GET /api/pipelines/:pipelineId/forecast/accuracy
 * Get historical forecast accuracy
 */
router.get(
  '/:pipelineId/forecast/accuracy',
  requireAuth,
  requireOrganization,
  requireZoFeature('crmFoundation'),
  async (req: Request, res: Response) => {
    try {
      const { pipelineId } = req.params;
      const { lookbackMonths } = req.query;

      const accuracy = await pipelineForecastService.getHistoricalAccuracy(
        pipelineId,
        lookbackMonths ? parseInt(lookbackMonths as string, 10) : undefined
      );

      res.json(accuracy);
    } catch (error: unknown) {
    const err = error as Error;
      logger.error('[PipelineRoutes] Error getting forecast accuracy', { error });
      res.status(500).json({ error: 'Failed to get forecast accuracy' });
    }
  }
);

/**
 * GET /api/pipelines/:pipelineId/forecast/history
 * Get forecast history
 */
router.get(
  '/:pipelineId/forecast/history',
  requireAuth,
  requireOrganization,
  requireZoFeature('crmFoundation'),
  async (req: Request, res: Response) => {
    try {
      const { pipelineId } = req.params;
      const { limit, method } = req.query;

      // Note: method filter not currently supported by getForecastHistory
      const history = await pipelineForecastService.getForecastHistory(
        pipelineId,
        limit ? parseInt(limit as string, 10) : undefined
      );

      res.json({ forecasts: history });
    } catch (error: unknown) {
    const err = error as Error;
      logger.error('[PipelineRoutes] Error getting forecast history', { error });
      res.status(500).json({ error: 'Failed to get forecast history' });
    }
  }
);

/**
 * POST /api/pipelines/:pipelineId/forecast/store
 * Store a forecast for accuracy tracking
 */
router.post(
  '/:pipelineId/forecast/store',
  requireAuth,
  requireOrganization,
  requireZoFeature('crmFoundation'),
  async (req: Request, res: Response) => {
    try {
      const { pipelineId } = req.params;
      const { method, periodMonths } = req.body;

      // Calculate periodEnd based on periodMonths (default 3 months)
      const months = periodMonths ? parseInt(periodMonths as string, 10) : 3;
      const periodEnd = new Date();
      periodEnd.setMonth(periodEnd.getMonth() + months);

      const forecast = await pipelineForecastService.generateForecast(
        pipelineId,
        periodEnd,
        (method as ForecastMethod) || 'weighted_probability'
      );

      await pipelineForecastService.storeForecast(pipelineId, forecast);

      res.status(201).json({ success: true, forecast });
    } catch (error: unknown) {
    const err = error as Error;
      logger.error('[PipelineRoutes] Error storing forecast', { error });
      res.status(500).json({ error: 'Failed to store forecast' });
    }
  }
);

export default router;
