/**
 * Lead Routes
 *
 * Phase 6: API endpoints for CRM lead management.
 * Protected by requireZoFeature('crmFoundation') middleware.
 */

import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requireOrganization, getOrganizationId, getUserId } from '../middleware/multiTenancy.js';
import { requireZoFeature } from '../middleware/featureFlags.js';
import { leadService } from '../services/leadService.js';
import { logger } from '../utils/logger.js';
import { MagicOrchestrator } from '../services/magicOrchestrator.js';

const router = Router();

// ============================================================================
// LEADS CRUD
// ============================================================================

/**
 * GET /api/leads
 * Get leads with filters
 */
router.get(
  '/',
  requireAuth,
  requireOrganization,
  requireZoFeature('crmFoundation'),
  async (req: Request, res: Response) => {
    try {
      const organizationId = getOrganizationId(req)!;
      const {
        search,
        lifecycleStage,
        leadStatus,
        tags,
        ownerUserId,
        source,
        campaignId,
        scoreMin,
        scoreMax,
        createdAfter,
        createdBefore,
        limit,
        offset,
        orderBy,
        orderDir,
      } = req.query;

      const result = await leadService.getLeads(organizationId, {
        search: search as string,
        lifecycleStage: lifecycleStage as any,
        leadStatus: leadStatus as any,
        tags: tags ? (Array.isArray(tags) ? tags : [tags]) as string[] : undefined,
        ownerUserId: ownerUserId as string,
        source: source as string,
        campaignId: campaignId as string,
        scoreMin: scoreMin ? parseInt(scoreMin as string, 10) : undefined,
        scoreMax: scoreMax ? parseInt(scoreMax as string, 10) : undefined,
        createdAfter: createdAfter ? new Date(createdAfter as string) : undefined,
        createdBefore: createdBefore ? new Date(createdBefore as string) : undefined,
        limit: limit ? parseInt(limit as string, 10) : undefined,
        offset: offset ? parseInt(offset as string, 10) : undefined,
        orderBy: orderBy as any,
        orderDir: orderDir as any,
      });

      res.json(result);
    } catch (error: unknown) {
    const err = error as Error;
      logger.error('[LeadRoutes] Error getting leads', { error });
      res.status(500).json({ error: 'Failed to get leads' });
    }
  }
);

/**
 * POST /api/leads
 * Create a new lead
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
      const {
        email,
        phone,
        firstName,
        lastName,
        company,
        jobTitle,
        website,
        linkedinUrl,
        source,
        sourceDetail,
        sourceCampaignId,
        visitorId,
        tags,
        customFields,
        emailConsent,
        smsConsent,
        gdprConsent,
      } = req.body;

      const lead = await leadService.createLead(
        organizationId,
        {
          email,
          phone,
          firstName,
          lastName,
          company,
          jobTitle,
          website,
          linkedinUrl,
          source,
          sourceDetail,
          sourceCampaignId,
          visitorId,
          tags,
          customFields,
          emailConsent,
          smsConsent,
          gdprConsent,
        },
        userId || undefined
      );

      res.status(201).json(lead);
    } catch (error: unknown) {
    const err = error as Error;
      logger.error('[LeadRoutes] Error creating lead', { error });
      res.status(500).json({ error: 'Failed to create lead' });
    }
  }
);

/**
 * GET /api/leads/:leadId
 * Get a single lead
 */
router.get(
  '/:leadId',
  requireAuth,
  requireOrganization,
  requireZoFeature('crmFoundation'),
  async (req: Request, res: Response) => {
    try {
      const { leadId } = req.params;
      const lead = await leadService.getLead(leadId);
      res.json(lead);
    } catch (error: unknown) {
    const err = error as Error;
      logger.error('[LeadRoutes] Error getting lead', { error });
      res.status(500).json({ error: 'Failed to get lead' });
    }
  }
);

/**
 * PATCH /api/leads/:leadId
 * Update a lead
 */
router.patch(
  '/:leadId',
  requireAuth,
  requireOrganization,
  requireZoFeature('crmFoundation'),
  async (req: Request, res: Response) => {
    try {
      const { leadId } = req.params;
      const userId = getUserId(req);
      const lead = await leadService.updateLead(leadId, req.body, userId || undefined);
      res.json(lead);
    } catch (error: unknown) {
    const err = error as Error;
      logger.error('[LeadRoutes] Error updating lead', { error });
      res.status(500).json({ error: 'Failed to update lead' });
    }
  }
);

/**
 * DELETE /api/leads/:leadId
 * Delete a lead
 */
router.delete(
  '/:leadId',
  requireAuth,
  requireOrganization,
  requireZoFeature('crmFoundation'),
  async (req: Request, res: Response) => {
    try {
      const { leadId } = req.params;
      await leadService.deleteLead(leadId);
      res.status(204).send();
    } catch (error: unknown) {
    const err = error as Error;
      logger.error('[LeadRoutes] Error deleting lead', { error });
      res.status(500).json({ error: 'Failed to delete lead' });
    }
  }
);

// ============================================================================
// LIFECYCLE & TAGS
// ============================================================================

/**
 * POST /api/leads/:leadId/stage
 * Update lead lifecycle stage
 */
router.post(
  '/:leadId/stage',
  requireAuth,
  requireOrganization,
  requireZoFeature('crmFoundation'),
  async (req: Request, res: Response) => {
    try {
      const { leadId } = req.params;
      const { stage, reason } = req.body;
      const userId = getUserId(req);

      if (!stage) {
        return res.status(400).json({ error: 'stage is required' });
      }

      await leadService.updateStage(leadId, stage, reason, userId || undefined);
      const lead = await leadService.getLead(leadId);
      res.json(lead);
    } catch (error: unknown) {
    const err = error as Error;
      logger.error('[LeadRoutes] Error updating stage', { error });
      res.status(500).json({ error: 'Failed to update stage' });
    }
  }
);

/**
 * POST /api/leads/:leadId/tags
 * Add tags to a lead
 */
router.post(
  '/:leadId/tags',
  requireAuth,
  requireOrganization,
  requireZoFeature('crmFoundation'),
  async (req: Request, res: Response) => {
    try {
      const { leadId } = req.params;
      const { tags } = req.body;
      const userId = getUserId(req);

      if (!tags || !Array.isArray(tags)) {
        return res.status(400).json({ error: 'tags array is required' });
      }

      await leadService.addTags(leadId, tags, userId || undefined);
      const lead = await leadService.getLead(leadId);
      res.json(lead);
    } catch (error: unknown) {
    const err = error as Error;
      logger.error('[LeadRoutes] Error adding tags', { error });
      res.status(500).json({ error: 'Failed to add tags' });
    }
  }
);

/**
 * DELETE /api/leads/:leadId/tags
 * Remove tags from a lead
 */
router.delete(
  '/:leadId/tags',
  requireAuth,
  requireOrganization,
  requireZoFeature('crmFoundation'),
  async (req: Request, res: Response) => {
    try {
      const { leadId } = req.params;
      const { tags } = req.body;
      const userId = getUserId(req);

      if (!tags || !Array.isArray(tags)) {
        return res.status(400).json({ error: 'tags array is required' });
      }

      await leadService.removeTags(leadId, tags, userId || undefined);
      const lead = await leadService.getLead(leadId);
      res.json(lead);
    } catch (error: unknown) {
    const err = error as Error;
      logger.error('[LeadRoutes] Error removing tags', { error });
      res.status(500).json({ error: 'Failed to remove tags' });
    }
  }
);

// ============================================================================
// ACTIVITIES
// ============================================================================

/**
 * GET /api/leads/:leadId/activities
 * Get activities for a lead
 */
router.get(
  '/:leadId/activities',
  requireAuth,
  requireOrganization,
  requireZoFeature('crmFoundation'),
  async (req: Request, res: Response) => {
    try {
      const { leadId } = req.params;
      const { activityTypes, limit, offset } = req.query;

      const result = await leadService.getActivities(leadId, {
        activityTypes: activityTypes
          ? (Array.isArray(activityTypes) ? activityTypes : [activityTypes]) as any[]
          : undefined,
        limit: limit ? parseInt(limit as string, 10) : undefined,
        offset: offset ? parseInt(offset as string, 10) : undefined,
      });

      res.json(result);
    } catch (error: unknown) {
    const err = error as Error;
      logger.error('[LeadRoutes] Error getting activities', { error });
      res.status(500).json({ error: 'Failed to get activities' });
    }
  }
);

/**
 * POST /api/leads/:leadId/activities
 * Record an activity for a lead
 */
router.post(
  '/:leadId/activities',
  requireAuth,
  requireOrganization,
  requireZoFeature('crmFoundation'),
  async (req: Request, res: Response) => {
    try {
      const { leadId } = req.params;
      const { activityType, activityData, scoreChange } = req.body;
      const userId = getUserId(req);

      if (!activityType) {
        return res.status(400).json({ error: 'activityType is required' });
      }

      const activityId = await leadService.recordActivity(
        leadId,
        activityType,
        activityData || {},
        scoreChange || 0,
        userId || undefined
      );

      res.status(201).json({ activityId });
    } catch (error: unknown) {
    const err = error as Error;
      logger.error('[LeadRoutes] Error recording activity', { error });
      res.status(500).json({ error: 'Failed to record activity' });
    }
  }
);

// ============================================================================
// PIPELINES
// ============================================================================

/**
 * GET /api/leads/pipelines
 * Get pipelines for the organization
 */
router.get(
  '/pipelines/list',
  requireAuth,
  requireOrganization,
  requireZoFeature('crmFoundation'),
  async (req: Request, res: Response) => {
    try {
      const organizationId = getOrganizationId(req)!;
      const pipelines = await leadService.getPipelines(organizationId);
      res.json({ pipelines });
    } catch (error: unknown) {
    const err = error as Error;
      logger.error('[LeadRoutes] Error getting pipelines', { error });
      res.status(500).json({ error: 'Failed to get pipelines' });
    }
  }
);

/**
 * GET /api/leads/pipelines/default
 * Get or create default pipeline
 */
router.get(
  '/pipelines/default',
  requireAuth,
  requireOrganization,
  requireZoFeature('crmFoundation'),
  async (req: Request, res: Response) => {
    try {
      const organizationId = getOrganizationId(req)!;
      const pipeline = await leadService.getOrCreateDefaultPipeline(organizationId);
      res.json(pipeline);
    } catch (error: unknown) {
    const err = error as Error;
      logger.error('[LeadRoutes] Error getting default pipeline', { error });
      res.status(500).json({ error: 'Failed to get default pipeline' });
    }
  }
);

/**
 * GET /api/leads/pipelines/:pipelineId/deals
 * Get deals in a pipeline
 */
router.get(
  '/pipelines/:pipelineId/deals',
  requireAuth,
  requireOrganization,
  requireZoFeature('crmFoundation'),
  async (req: Request, res: Response) => {
    try {
      const { pipelineId } = req.params;
      const { stageId, limit, offset } = req.query;

      const result = await leadService.getPipelineDeals(pipelineId, {
        stageId: stageId as string,
        limit: limit ? parseInt(limit as string, 10) : undefined,
        offset: offset ? parseInt(offset as string, 10) : undefined,
      });

      res.json(result);
    } catch (error: unknown) {
    const err = error as Error;
      logger.error('[LeadRoutes] Error getting pipeline deals', { error });
      res.status(500).json({ error: 'Failed to get pipeline deals' });
    }
  }
);

/**
 * POST /api/leads/pipelines/:pipelineId/deals
 * Create a deal in a pipeline
 */
router.post(
  '/pipelines/:pipelineId/deals',
  requireAuth,
  requireOrganization,
  requireZoFeature('crmFoundation'),
  async (req: Request, res: Response) => {
    try {
      const organizationId = getOrganizationId(req)!;
      const { pipelineId } = req.params;
      const { leadId, name, stageId, dealValue, currency, expectedCloseDate, probability, notes } =
        req.body;

      if (!leadId) {
        return res.status(400).json({ error: 'leadId is required' });
      }
      if (!stageId) {
        return res.status(400).json({ error: 'stageId is required' });
      }

      const deal = await leadService.createDeal(organizationId, pipelineId, leadId, {
        name,
        stageId,
        dealValue,
        currency,
        expectedCloseDate: expectedCloseDate ? new Date(expectedCloseDate) : undefined,
        probability,
        notes,
      });

      res.status(201).json(deal);
    } catch (error: unknown) {
    const err = error as Error;
      logger.error('[LeadRoutes] Error creating deal', { error });
      res.status(500).json({ error: 'Failed to create deal' });
    }
  }
);

/**
 * PATCH /api/leads/deals/:dealId/stage
 * Update deal stage (for drag-and-drop)
 */
router.patch(
  '/deals/:dealId/stage',
  requireAuth,
  requireOrganization,
  requireZoFeature('crmFoundation'),
  async (req: Request, res: Response) => {
    try {
      const { dealId } = req.params;
      const { stageId } = req.body;

      if (!stageId) {
        return res.status(400).json({ error: 'stageId is required' });
      }

      const deal = await leadService.updateDealStage(dealId, stageId);
      res.json(deal);
    } catch (error: unknown) {
    const err = error as Error;
      logger.error('[LeadRoutes] Error updating deal stage', { error });
      res.status(500).json({ error: 'Failed to update deal stage' });
    }
  }
);

// ============================================================================
// CONTEXT FOR GENERATION
// ============================================================================

/**
 * GET /api/leads/context
 * Get lead context for generation prompts
 */
router.get(
  '/context',
  requireAuth,
  requireOrganization,
  requireZoFeature('crmFoundation'),
  async (req: Request, res: Response) => {
    try {
      const organizationId = getOrganizationId(req)!;
      const { tags, lifecycleStage, campaignId } = req.query;

      const context = await leadService.buildLeadContext(organizationId, {
        tags: tags ? (Array.isArray(tags) ? tags : [tags]) as string[] : undefined,
        lifecycleStage: lifecycleStage as any,
        campaignId: campaignId as string,
      });

      res.json(context);
    } catch (error: unknown) {
    const err = error as Error;
      logger.error('[LeadRoutes] Error getting lead context', { error });
      res.status(500).json({ error: 'Failed to get lead context' });
    }
  }
);

// ============================================================================
// PERSONALIZED CONTENT GENERATION
// ============================================================================

/**
 * POST /api/leads/generate
 * Generate personalized content for a lead segment
 */
router.post(
  '/generate',
  requireAuth,
  requireOrganization,
  requireZoFeature('crmFoundation'),
  async (req: Request, res: Response) => {
    try {
      const organizationId = getOrganizationId(req)!;
      const {
        request,
        leadId,
        targetTags,
        targetStage,
        campaignId,
      } = req.body;

      if (!request) {
        return res.status(400).json({ error: 'request is required' });
      }

      const orchestrator = MagicOrchestrator.getInstance();

      const result = await orchestrator.execute({
        request,
        context: {
          organizationId,
        },
        leadPersonalization: {
          leadId,
          targetTags,
          targetStage,
          campaignId,
          includeLeadContext: true,
        },
        hints: {
          skipAmbiguityCheck: false,
        },
      });

      // Track the generation for the lead if specific lead was targeted
      if (leadId && result.success && result.deliverables.length > 0) {
        await leadService.recordActivity(
          leadId,
          'deliverable_sent',
          {
            deliverableCount: result.deliverables.length,
            deliverableTypes: result.deliverables.map((d: any) => d.type),
            campaignId,
          },
          5 // Score bump for receiving personalized content
        );
      }

      res.json({
        success: result.success,
        deliverables: result.deliverables,
        leadContext: result.leadContext,
        routing: result.routing,
        error: result.error,
      });
    } catch (error: unknown) {
    const err = error as Error;
      logger.error('[LeadRoutes] Error generating personalized content', { error });
      res.status(500).json({ error: 'Failed to generate personalized content' });
    }
  }
);

/**
 * POST /api/leads/:leadId/send
 * Record that a deliverable was sent to a lead
 */
router.post(
  '/:leadId/send',
  requireAuth,
  requireOrganization,
  requireZoFeature('crmFoundation'),
  async (req: Request, res: Response) => {
    try {
      const { leadId } = req.params;
      const { deliverableId, deliverableType, channel, campaignId } = req.body;
      const userId = getUserId(req);

      if (!deliverableId) {
        return res.status(400).json({ error: 'deliverableId is required' });
      }

      const activityId = await leadService.recordActivity(
        leadId,
        'deliverable_sent',
        {
          deliverableId,
          deliverableType,
          channel,
          campaignId,
        },
        10, // Score bump for outreach
        userId || undefined
      );

      // Update last contacted timestamp
      await leadService.updateLead(leadId, {}, userId || undefined);

      res.json({ success: true, activityId });
    } catch (error: unknown) {
    const err = error as Error;
      logger.error('[LeadRoutes] Error recording deliverable send', { error });
      res.status(500).json({ error: 'Failed to record deliverable send' });
    }
  }
);

/**
 * POST /api/leads/:leadId/view
 * Record that a lead viewed a deliverable (tracking pixel/webhook)
 */
router.post(
  '/:leadId/view',
  requireAuth,
  requireOrganization,
  requireZoFeature('crmFoundation'),
  async (req: Request, res: Response) => {
    try {
      const { leadId } = req.params;
      const { deliverableId, deliverableType, source } = req.body;

      const activityId = await leadService.recordActivity(
        leadId,
        'deliverable_viewed',
        {
          deliverableId,
          deliverableType,
          source,
        },
        15 // Higher score for engagement
      );

      res.json({ success: true, activityId });
    } catch (error: unknown) {
    const err = error as Error;
      logger.error('[LeadRoutes] Error recording deliverable view', { error });
      res.status(500).json({ error: 'Failed to record deliverable view' });
    }
  }
);

// ============================================================================
// BULK OPERATIONS
// ============================================================================

/**
 * POST /api/leads/bulk/import
 * Bulk import leads from CSV data
 */
router.post(
  '/bulk/import',
  requireAuth,
  requireOrganization,
  requireZoFeature('crmFoundation'),
  async (req: Request, res: Response) => {
    try {
      const organizationId = getOrganizationId(req)!;
      const userId = getUserId(req);
      const { leads, source, sourceDetail, tags, skipDuplicates } = req.body;

      if (!leads || !Array.isArray(leads)) {
        return res.status(400).json({ error: 'leads array is required' });
      }

      const results = {
        created: 0,
        skipped: 0,
        errors: [] as { index: number; email?: string; error: string }[],
      };

      for (let i = 0; i < leads.length; i++) {
        const leadData = leads[i];
        try {
          // Check for existing lead by email if skipDuplicates
          if (skipDuplicates && leadData.email) {
            const existing = await leadService.getLeads(organizationId, {
              search: leadData.email,
              limit: 1,
            });
            if (existing.leads.length > 0) {
              results.skipped++;
              continue;
            }
          }

          await leadService.createLead(
            organizationId,
            {
              email: leadData.email,
              phone: leadData.phone,
              firstName: leadData.firstName || leadData.first_name,
              lastName: leadData.lastName || leadData.last_name,
              company: leadData.company,
              jobTitle: leadData.jobTitle || leadData.job_title,
              website: leadData.website,
              linkedinUrl: leadData.linkedinUrl || leadData.linkedin_url,
              source: source || leadData.source || 'bulk_import',
              sourceDetail: sourceDetail || leadData.sourceDetail,
              tags: tags ? [...(tags || []), ...(leadData.tags || [])] : leadData.tags,
              customFields: leadData.customFields || leadData.custom_fields,
            },
            userId || undefined
          );
          results.created++;
        } catch (error: unknown) {
    const err = error as Error;
          results.errors.push({
            index: i,
            email: leadData.email,
            error: err.message || 'Unknown error',
          });
        }
      }

      res.json({
        success: true,
        results,
        totalProcessed: leads.length,
      });
    } catch (error: unknown) {
    const err = error as Error;
      logger.error('[LeadRoutes] Error bulk importing leads', { error });
      res.status(500).json({ error: 'Failed to bulk import leads' });
    }
  }
);

/**
 * POST /api/leads/bulk/delete
 * Bulk delete leads
 */
router.post(
  '/bulk/delete',
  requireAuth,
  requireOrganization,
  requireZoFeature('crmFoundation'),
  async (req: Request, res: Response) => {
    try {
      const { leadIds } = req.body;

      if (!leadIds || !Array.isArray(leadIds)) {
        return res.status(400).json({ error: 'leadIds array is required' });
      }

      const results = {
        deleted: 0,
        errors: [] as { leadId: string; error: string }[],
      };

      for (const leadId of leadIds) {
        try {
          await leadService.deleteLead(leadId);
          results.deleted++;
        } catch (error: unknown) {
    const err = error as Error;
          results.errors.push({
            leadId,
            error: err.message || 'Unknown error',
          });
        }
      }

      res.json({
        success: true,
        results,
        totalProcessed: leadIds.length,
      });
    } catch (error: unknown) {
    const err = error as Error;
      logger.error('[LeadRoutes] Error bulk deleting leads', { error });
      res.status(500).json({ error: 'Failed to bulk delete leads' });
    }
  }
);

/**
 * POST /api/leads/bulk/tags
 * Bulk add/remove tags from leads
 */
router.post(
  '/bulk/tags',
  requireAuth,
  requireOrganization,
  requireZoFeature('crmFoundation'),
  async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);
      const { leadIds, addTags, removeTags } = req.body;

      if (!leadIds || !Array.isArray(leadIds)) {
        return res.status(400).json({ error: 'leadIds array is required' });
      }

      if (!addTags && !removeTags) {
        return res.status(400).json({ error: 'addTags or removeTags is required' });
      }

      const results = {
        updated: 0,
        errors: [] as { leadId: string; error: string }[],
      };

      for (const leadId of leadIds) {
        try {
          if (addTags && Array.isArray(addTags) && addTags.length > 0) {
            await leadService.addTags(leadId, addTags, userId || undefined);
          }
          if (removeTags && Array.isArray(removeTags) && removeTags.length > 0) {
            await leadService.removeTags(leadId, removeTags, userId || undefined);
          }
          results.updated++;
        } catch (error: unknown) {
    const err = error as Error;
          results.errors.push({
            leadId,
            error: err.message || 'Unknown error',
          });
        }
      }

      res.json({
        success: true,
        results,
        totalProcessed: leadIds.length,
      });
    } catch (error: unknown) {
    const err = error as Error;
      logger.error('[LeadRoutes] Error bulk updating tags', { error });
      res.status(500).json({ error: 'Failed to bulk update tags' });
    }
  }
);

/**
 * POST /api/leads/bulk/stage
 * Bulk update lead lifecycle stage
 */
router.post(
  '/bulk/stage',
  requireAuth,
  requireOrganization,
  requireZoFeature('crmFoundation'),
  async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);
      const { leadIds, stage, reason } = req.body;

      if (!leadIds || !Array.isArray(leadIds)) {
        return res.status(400).json({ error: 'leadIds array is required' });
      }

      if (!stage) {
        return res.status(400).json({ error: 'stage is required' });
      }

      const results = {
        updated: 0,
        errors: [] as { leadId: string; error: string }[],
      };

      for (const leadId of leadIds) {
        try {
          await leadService.updateStage(leadId, stage, reason, userId || undefined);
          results.updated++;
        } catch (error: unknown) {
    const err = error as Error;
          results.errors.push({
            leadId,
            error: err.message || 'Unknown error',
          });
        }
      }

      res.json({
        success: true,
        results,
        totalProcessed: leadIds.length,
      });
    } catch (error: unknown) {
    const err = error as Error;
      logger.error('[LeadRoutes] Error bulk updating stage', { error });
      res.status(500).json({ error: 'Failed to bulk update stage' });
    }
  }
);

/**
 * POST /api/leads/bulk/assign
 * Bulk assign leads to an owner
 */
router.post(
  '/bulk/assign',
  requireAuth,
  requireOrganization,
  requireZoFeature('crmFoundation'),
  async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);
      const { leadIds, ownerUserId } = req.body;

      if (!leadIds || !Array.isArray(leadIds)) {
        return res.status(400).json({ error: 'leadIds array is required' });
      }

      if (!ownerUserId) {
        return res.status(400).json({ error: 'ownerUserId is required' });
      }

      const results = {
        assigned: 0,
        errors: [] as { leadId: string; error: string }[],
      };

      for (const leadId of leadIds) {
        try {
          await leadService.updateLead(leadId, { ownerUserId }, userId || undefined);
          results.assigned++;
        } catch (error: unknown) {
    const err = error as Error;
          results.errors.push({
            leadId,
            error: err.message || 'Unknown error',
          });
        }
      }

      res.json({
        success: true,
        results,
        totalProcessed: leadIds.length,
      });
    } catch (error: unknown) {
    const err = error as Error;
      logger.error('[LeadRoutes] Error bulk assigning leads', { error });
      res.status(500).json({ error: 'Failed to bulk assign leads' });
    }
  }
);

export default router;
