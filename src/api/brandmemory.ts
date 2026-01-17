/**
 * Brand Memory AI Routes
 *
 * Phase 3A: Brand Memory AI
 *
 * Routes for:
 * - Learning statistics and dashboard
 * - Approval rate prediction
 * - Brand drift detection
 * - Preference insights
 * - Learning timeline
 */

import { Router, Request, Response } from 'express';
import { authenticateJWT } from '../middleware/auth.js';
import { requireOrganization } from '../middleware/multiTenancy.js';
import { approvalPredictorService } from '../services/approvalPredictorService.js';
import { brandDriftService } from '../services/brandDriftService.js';
import { learningDashboardService } from '../services/learningDashboardService.js';
import { logger } from '../utils/logger.js';

const router = Router();

// All routes require authentication and organization context
router.use(authenticateJWT);
router.use(requireOrganization);

// ============================================================================
// LEARNING DASHBOARD
// ============================================================================

/**
 * GET /api/brand-memory/stats
 * Get overall learning statistics
 */
router.get('/stats', async (req: Request, res: Response) => {
  try {
    const organizationId = req.org!.organization.id;

    const stats = await learningDashboardService.getLearningStats(organizationId);

    res.json({
      success: true,
      stats
    });
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('[BrandMemory] Failed to get stats', { error: err.message });
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve learning statistics'
    });
  }
});

/**
 * GET /api/brand-memory/insights
 * Get preference insights with trends and patterns
 */
router.get('/insights', async (req: Request, res: Response) => {
  try {
    const organizationId = req.org!.organization.id;

    const insights = await learningDashboardService.getPreferenceInsights(organizationId);

    res.json({
      success: true,
      insights
    });
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('[BrandMemory] Failed to get insights', { error: err.message });
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve preference insights'
    });
  }
});

/**
 * GET /api/brand-memory/timeline
 * Get learning timeline of significant events
 */
router.get('/timeline', async (req: Request, res: Response) => {
  try {
    const organizationId = req.org!.organization.id;
    const days = parseInt(req.query.days as string) || 90;

    const timeline = await learningDashboardService.getLearningTimeline(organizationId, days);

    res.json({
      success: true,
      timeline
    });
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('[BrandMemory] Failed to get timeline', { error: err.message });
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve learning timeline'
    });
  }
});

/**
 * GET /api/brand-memory/progress
 * Get learning progress over time
 */
router.get('/progress', async (req: Request, res: Response) => {
  try {
    const organizationId = req.org!.organization.id;
    const period = (req.query.period as '30d' | '90d' | '1y') || '30d';

    const progress = await learningDashboardService.getLearningProgress(organizationId, period);

    res.json({
      success: true,
      progress
    });
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('[BrandMemory] Failed to get progress', { error: err.message });
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve learning progress'
    });
  }
});

// ============================================================================
// APPROVAL PREDICTION
// ============================================================================

/**
 * GET /api/brand-memory/approval-trajectory
 * Get approval rate trajectory over time
 */
router.get('/approval-trajectory', async (req: Request, res: Response) => {
  try {
    const organizationId = req.org!.organization.id;
    const period = (req.query.period as '30d' | '90d' | '1y') || '30d';

    const trajectory = await approvalPredictorService.getApprovalTrajectory(
      organizationId,
      period
    );

    res.json({
      success: true,
      trajectory
    });
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('[BrandMemory] Failed to get trajectory', { error: err.message });
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve approval trajectory'
    });
  }
});

/**
 * GET /api/brand-memory/approval-stats
 * Get approval statistics for a time period
 */
router.get('/approval-stats', async (req: Request, res: Response) => {
  try {
    const organizationId = req.org!.organization.id;
    const department = req.query.department as string | undefined;
    const days = parseInt(req.query.days as string) || 30;

    const stats = await approvalPredictorService.getApprovalStats(
      organizationId,
      department,
      days
    );

    res.json({
      success: true,
      stats
    });
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('[BrandMemory] Failed to get approval stats', { error: err.message });
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve approval statistics'
    });
  }
});

/**
 * POST /api/brand-memory/predict
 * Predict approval rate for new content
 */
router.post('/predict', async (req: Request, res: Response) => {
  try {
    const organizationId = req.org!.organization.id;
    const { department, deliverableType, contentFeatures } = req.body;

    if (!department || !deliverableType) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: department, deliverableType'
      });
    }

    const prediction = await approvalPredictorService.predictApprovalRate(
      organizationId,
      department,
      deliverableType,
      contentFeatures || {}
    );

    res.json({
      success: true,
      prediction
    });
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('[BrandMemory] Failed to predict approval', { error: err.message });
    res.status(500).json({
      success: false,
      error: 'Failed to generate approval prediction'
    });
  }
});

/**
 * POST /api/brand-memory/record-outcome
 * Record approval outcome (called by system after approval/rejection)
 */
router.post('/record-outcome', async (req: Request, res: Response) => {
  try {
    const organizationId = req.org!.organization.id;
    const { deliverableId, approved, iterationCount, timeToApprovalHours, feedbackSummary } = req.body;

    if (!deliverableId || typeof approved !== 'boolean' || !iterationCount) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: deliverableId, approved, iterationCount'
      });
    }

    await approvalPredictorService.recordApprovalOutcome(
      organizationId,
      deliverableId,
      approved,
      iterationCount,
      {
        timeToApprovalHours,
        feedbackSummary
      }
    );

    res.json({
      success: true,
      message: 'Approval outcome recorded successfully'
    });
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('[BrandMemory] Failed to record outcome', { error: err.message });
    res.status(500).json({
      success: false,
      error: 'Failed to record approval outcome'
    });
  }
});

// ============================================================================
// BRAND DRIFT DETECTION
// ============================================================================

/**
 * GET /api/brand-memory/drift
 * Get current brand drift analysis
 */
router.get('/drift', async (req: Request, res: Response) => {
  try {
    const organizationId = req.org!.organization.id;
    const timeWindowDays = parseInt(req.query.timeWindow as string) || 30;

    const driftAnalysis = await brandDriftService.detectDrift(
      organizationId,
      timeWindowDays
    );

    res.json({
      success: true,
      drift: driftAnalysis
    });
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('[BrandMemory] Failed to get drift', { error: err.message });
    res.status(500).json({
      success: false,
      error: 'Failed to analyze brand drift'
    });
  }
});

/**
 * GET /api/brand-memory/drift/history
 * Get drift history over time
 */
router.get('/drift/history', async (req: Request, res: Response) => {
  try {
    const organizationId = req.org!.organization.id;
    const days = parseInt(req.query.days as string) || 30;

    const history = await brandDriftService.getDriftHistory(organizationId, days);

    res.json({
      success: true,
      history
    });
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('[BrandMemory] Failed to get drift history', { error: err.message });
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve drift history'
    });
  }
});

/**
 * POST /api/brand-memory/anchors
 * Set brand anchors for drift detection
 */
router.post('/anchors', async (req: Request, res: Response) => {
  try {
    const organizationId = req.org!.organization.id;
    const { approvedDeliverables, brandGuidelines, toneExamples } = req.body;

    if (!approvedDeliverables && !brandGuidelines && !toneExamples) {
      return res.status(400).json({
        success: false,
        error: 'At least one anchor type must be provided'
      });
    }

    await brandDriftService.setBrandAnchors(organizationId, {
      approvedDeliverables: approvedDeliverables || [],
      brandGuidelines: brandGuidelines || '',
      toneExamples: toneExamples || []
    });

    res.json({
      success: true,
      message: 'Brand anchors set successfully'
    });
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('[BrandMemory] Failed to set anchors', { error: err.message });
    res.status(500).json({
      success: false,
      error: 'Failed to set brand anchors'
    });
  }
});

/**
 * POST /api/brand-memory/drift/check
 * Trigger drift check and alert if necessary
 */
router.post('/drift/check', async (req: Request, res: Response) => {
  try {
    const organizationId = req.org!.organization.id;

    await brandDriftService.checkAndAlert(organizationId);

    res.json({
      success: true,
      message: 'Drift check completed'
    });
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('[BrandMemory] Failed to check drift', { error: err.message });
    res.status(500).json({
      success: false,
      error: 'Failed to check brand drift'
    });
  }
});

// ============================================================================
// EXPORT
// ============================================================================

export default router;
