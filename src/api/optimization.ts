/**
 * Real-Time Campaign Optimization API Routes
 */

import { Router, Request, Response } from 'express';
import { realtimeOptimization } from '../services/realtimeOptimizationService.js';
import { requireAuth } from '../middleware/auth.js';
import { requireOrganization, getOrganizationId, getUserId } from '../middleware/multiTenancy.js';
import { logger } from '../utils/logger.js';

const router = Router();

// Apply auth and multi-tenant middleware to all routes
router.use(requireAuth);
router.use(requireOrganization);

/**
 * Create optimization rule
 */
router.post('/rules', async (req: Request, res: Response) => {
  try {
    const {
      name,
      description,
      ruleType,
      triggerMetric,
      triggerOperator,
      triggerValue,
      triggerValueHigh,
      triggerPeriodHours,
      actionConfig,
      maxDailyActions,
      minDataPoints,
      cooldownHours,
      priority,
    } = req.body;

    if (!name || !ruleType || !triggerMetric || !triggerOperator || triggerValue === undefined || !actionConfig) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const ruleId = await realtimeOptimization.createRule(getOrganizationId(req)!, {
      name,
      description,
      ruleType,
      triggerMetric,
      triggerOperator,
      triggerValue,
      triggerValueHigh,
      triggerPeriodHours,
      actionConfig,
      maxDailyActions,
      minDataPoints,
      cooldownHours,
      priority,
    });

    res.json({ ruleId, message: 'Optimization rule created successfully' });
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('Error creating optimization rule:', error);
    res.status(500).json({ error: 'Failed to create optimization rule' });
  }
});

/**
 * Get optimization rules
 */
router.get('/rules', async (req: Request, res: Response) => {
  try {
    const rules = await realtimeOptimization.getRules(getOrganizationId(req)!);
    res.json({ rules });
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('Error fetching optimization rules:', error);
    res.status(500).json({ error: 'Failed to fetch optimization rules' });
  }
});

/**
 * Update optimization rule
 */
router.patch('/rules/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    await realtimeOptimization.updateRule(id, getOrganizationId(req)!, updates);
    res.json({ message: 'Optimization rule updated successfully' });
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('Error updating optimization rule:', error);
    res.status(500).json({ error: 'Failed to update optimization rule' });
  }
});

/**
 * Delete optimization rule
 */
router.delete('/rules/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    await realtimeOptimization.deleteRule(id, getOrganizationId(req)!);
    res.json({ message: 'Optimization rule deleted successfully' });
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('Error deleting optimization rule:', error);
    res.status(500).json({ error: 'Failed to delete optimization rule' });
  }
});

/**
 * Trigger rule evaluation for a campaign
 */
router.post('/evaluate/:campaignId', async (req: Request, res: Response) => {
  try {
    const { campaignId } = req.params;

    const actions = await realtimeOptimization.evaluateRules(getOrganizationId(req)!, campaignId);

    res.json({
      message: 'Evaluation complete',
      actionsExecuted: actions.length,
      actions,
    });
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('Error evaluating optimization rules:', error);
    res.status(500).json({ error: 'Failed to evaluate optimization rules' });
  }
});

/**
 * Record performance snapshot
 */
router.post('/snapshot/:campaignId', async (req: Request, res: Response) => {
  try {
    const { campaignId } = req.params;
    const { metrics, breakdowns } = req.body;

    if (!metrics) {
      return res.status(400).json({ error: 'Missing metrics' });
    }

    await realtimeOptimization.recordPerformanceSnapshot(
      getOrganizationId(req)!,
      campaignId,
      metrics,
      breakdowns
    );

    res.json({ message: 'Performance snapshot recorded successfully' });
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('Error recording performance snapshot:', error);
    res.status(500).json({ error: 'Failed to record performance snapshot' });
  }
});

/**
 * Get recent optimization actions
 */
router.get('/actions', async (req: Request, res: Response) => {
  try {
    const { campaignId, limit } = req.query;

    const actions = await realtimeOptimization.getRecentActions(
      getOrganizationId(req)!,
      campaignId as string | undefined,
      limit ? parseInt(limit as string) : 20
    );

    res.json({ actions });
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('Error fetching optimization actions:', error);
    res.status(500).json({ error: 'Failed to fetch optimization actions' });
  }
});

/**
 * Revert an optimization action
 */
router.post('/actions/:id/revert', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    if (!reason) {
      return res.status(400).json({ error: 'Revert reason is required' });
    }

    await realtimeOptimization.revertAction(id, getOrganizationId(req)!, reason);
    res.json({ message: 'Action reverted successfully' });
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('Error reverting optimization action:', error);
    res.status(500).json({ error: 'Failed to revert optimization action' });
  }
});

/**
 * Get optimization recommendations
 */
router.get('/recommendations', async (req: Request, res: Response) => {
  try {
    const { status } = req.query;

    const recommendations = await realtimeOptimization.getRecommendations(
      getOrganizationId(req)!,
      (status as string) || 'pending'
    );

    res.json({ recommendations });
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('Error fetching optimization recommendations:', error);
    res.status(500).json({ error: 'Failed to fetch optimization recommendations' });
  }
});

/**
 * Decide on optimization recommendation
 */
router.post('/recommendations/:id/decide', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { decision, notes } = req.body;

    if (!decision || !['approved', 'rejected'].includes(decision)) {
      return res.status(400).json({ error: 'Valid decision (approved/rejected) is required' });
    }

    await realtimeOptimization.decideRecommendation(
      id,
      getOrganizationId(req)!,
      getUserId(req)!,
      decision,
      notes
    );

    res.json({ message: `Recommendation ${decision} successfully` });
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('Error deciding on recommendation:', error);
    res.status(500).json({ error: 'Failed to decide on recommendation' });
  }
});

/**
 * Detect performance anomalies
 */
router.post('/anomalies/detect/:campaignId', async (req: Request, res: Response) => {
  try {
    const { campaignId } = req.params;

    const anomalies = await realtimeOptimization.detectAnomalies(getOrganizationId(req)!, campaignId);

    res.json({
      message: 'Anomaly detection complete',
      anomaliesFound: anomalies.length,
      anomalies,
    });
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('Error detecting anomalies:', error);
    res.status(500).json({ error: 'Failed to detect anomalies' });
  }
});

/**
 * Get performance anomalies
 */
router.get('/anomalies', async (req: Request, res: Response) => {
  try {
    const { campaignId, status } = req.query;

    const anomalies = await realtimeOptimization.getAnomalies(
      getOrganizationId(req)!,
      campaignId as string | undefined,
      status as string | undefined
    );

    res.json({ anomalies });
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('Error fetching anomalies:', error);
    res.status(500).json({ error: 'Failed to fetch anomalies' });
  }
});

/**
 * Update anomaly status
 */
router.patch('/anomalies/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { status, notes } = req.body;

    if (!status || !['investigating', 'resolved', 'ignored'].includes(status)) {
      return res.status(400).json({
        error: 'Valid status (investigating/resolved/ignored) is required',
      });
    }

    await realtimeOptimization.updateAnomalyStatus(
      id,
      getOrganizationId(req)!,
      status,
      getUserId(req) ?? undefined,
      notes
    );

    res.json({ message: 'Anomaly status updated successfully' });
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('Error updating anomaly status:', error);
    res.status(500).json({ error: 'Failed to update anomaly status' });
  }
});

/**
 * Get budget pacing for campaign
 */
router.get('/pacing/:campaignId', async (req: Request, res: Response) => {
  try {
    const { campaignId } = req.params;

    const pacing = await realtimeOptimization.getBudgetPacing(campaignId);

    if (!pacing) {
      return res.status(404).json({ error: 'Budget pacing data not found' });
    }

    res.json({ pacing });
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('Error fetching budget pacing:', error);
    res.status(500).json({ error: 'Failed to fetch budget pacing' });
  }
});

/**
 * Update budget pacing for campaign
 */
router.post('/pacing/:campaignId/update', async (req: Request, res: Response) => {
  try {
    const { campaignId } = req.params;

    const pacing = await realtimeOptimization.updateBudgetPacing(getOrganizationId(req)!, campaignId);

    res.json({
      message: 'Budget pacing updated successfully',
      pacing,
    });
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('Error updating budget pacing:', error);
    res.status(500).json({ error: 'Failed to update budget pacing' });
  }
});

/**
 * Generate optimization recommendations for campaign
 */
router.post('/recommendations/generate/:campaignId', async (req: Request, res: Response) => {
  try {
    const { campaignId } = req.params;
    const { performance } = req.body;

    if (!performance) {
      return res.status(400).json({ error: 'Performance data is required' });
    }

    await realtimeOptimization.generateRecommendation(
      getOrganizationId(req)!,
      campaignId,
      performance
    );

    res.json({ message: 'Recommendations generated successfully' });
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('Error generating recommendations:', error);
    res.status(500).json({ error: 'Failed to generate recommendations' });
  }
});

export default router;
