/**
 * Internal Quality Dashboard Routes
 *
 * PLATFORM OWNER ONLY - Hidden from customers.
 * Uses separate API key authentication, not customer auth.
 *
 * Access: /api/internal/quality/*
 * Auth: X-Internal-Key header with INTERNAL_API_KEY env var
 */

import { Router, Request, Response, NextFunction } from 'express';
import { internalQualityDashboardService } from '../services/internalQualityDashboardService.js';
import { logger } from '../utils/logger.js';
import { Department } from '../services/knowledge/types.js';

const router = Router();

// ============================================================================
// INTERNAL API KEY MIDDLEWARE
// ============================================================================

/**
 * Validate internal API key - this keeps the dashboard hidden from customers
 */
const requireInternalKey = (req: Request, res: Response, next: NextFunction) => {
  const internalKey = process.env.INTERNAL_API_KEY;

  if (!internalKey) {
    logger.error('[InternalQuality] INTERNAL_API_KEY not configured');
    return res.status(503).json({
      error: 'Internal dashboard not configured'
    });
  }

  const providedKey = req.headers['x-internal-key'] as string;

  if (!providedKey || providedKey !== internalKey) {
    // Return 404 instead of 401 to hide the endpoint's existence
    return res.status(404).json({
      error: 'Not found'
    });
  }

  next();
};

// Apply internal key requirement to all routes
router.use(requireInternalKey);

// ============================================================================
// OVERVIEW ENDPOINTS
// ============================================================================

/**
 * GET /api/internal/quality/overview
 * Get high-level quality metrics overview
 */
router.get('/overview', async (req: Request, res: Response) => {
  try {
    const period = (req.query.period as '24h' | '7d' | '30d' | '90d') || '7d';
    const overview = await internalQualityDashboardService.getQualityOverview(period);
    res.json(overview);
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('[InternalQuality] Overview error:', error);
    res.status(500).json({ error: 'Failed to fetch quality overview' });
  }
});

/**
 * GET /api/internal/quality/departments
 * Get all department metrics
 */
router.get('/departments', async (req: Request, res: Response) => {
  try {
    const period = (req.query.period as '24h' | '7d' | '30d' | '90d') || '7d';
    const overview = await internalQualityDashboardService.getQualityOverview(period);
    res.json(overview.byDepartment);
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('[InternalQuality] Departments error:', error);
    res.status(500).json({ error: 'Failed to fetch department metrics' });
  }
});

/**
 * GET /api/internal/quality/departments/:department
 * Get detailed metrics for a specific department
 */
router.get('/departments/:department', async (req: Request, res: Response) => {
  try {
    const department = req.params.department as Department;
    const validDepartments: Department[] = [
      'creative', 'engineering', 'design', 'strategy',
      'project', 'product', 'operations', 'spatial', 'orchestrator'
    ];

    if (!validDepartments.includes(department)) {
      return res.status(400).json({ error: 'Invalid department' });
    }

    const period = (req.query.period as '24h' | '7d' | '30d' | '90d') || '7d';
    const details = await internalQualityDashboardService.getDepartmentDetails(department, period);
    res.json(details);
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('[InternalQuality] Department details error:', error);
    res.status(500).json({ error: 'Failed to fetch department details' });
  }
});

// ============================================================================
// ITERATION ANALYTICS
// ============================================================================

/**
 * GET /api/internal/quality/iterations
 * Get iteration loop analytics (retry effectiveness)
 */
router.get('/iterations', async (req: Request, res: Response) => {
  try {
    const period = (req.query.period as '24h' | '7d' | '30d' | '90d') || '7d';
    const analytics = await internalQualityDashboardService.getIterationAnalytics(period);
    res.json(analytics);
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('[InternalQuality] Iterations error:', error);
    res.status(500).json({ error: 'Failed to fetch iteration analytics' });
  }
});

// ============================================================================
// GOLDEN DATASET HEALTH
// ============================================================================

/**
 * GET /api/internal/quality/golden
 * Get health status of golden datasets
 */
router.get('/golden', async (_req: Request, res: Response) => {
  try {
    const health = await internalQualityDashboardService.getGoldenDatasetHealth();
    res.json(health);
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('[InternalQuality] Golden health error:', error);
    res.status(500).json({ error: 'Failed to fetch golden dataset health' });
  }
});

// ============================================================================
// RUBRIC ANALYSIS
// ============================================================================

/**
 * GET /api/internal/quality/rubrics/:department
 * Get rubric effectiveness analysis for a department
 */
router.get('/rubrics/:department', async (req: Request, res: Response) => {
  try {
    const department = req.params.department as Department;
    const validDepartments: Department[] = [
      'creative', 'engineering', 'design', 'strategy',
      'project', 'product', 'operations', 'spatial', 'orchestrator'
    ];

    if (!validDepartments.includes(department)) {
      return res.status(400).json({ error: 'Invalid department' });
    }

    const analysis = await internalQualityDashboardService.getRubricAnalysis(department);
    res.json(analysis);
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('[InternalQuality] Rubric analysis error:', error);
    res.status(500).json({ error: 'Failed to fetch rubric analysis' });
  }
});

// ============================================================================
// ISSUES & ALERTS
// ============================================================================

/**
 * GET /api/internal/quality/issues
 * Get recent quality issues
 */
router.get('/issues', async (req: Request, res: Response) => {
  try {
    const period = (req.query.period as '24h' | '7d' | '30d' | '90d') || '7d';
    const overview = await internalQualityDashboardService.getQualityOverview(period);
    res.json(overview.recentIssues);
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('[InternalQuality] Issues error:', error);
    res.status(500).json({ error: 'Failed to fetch quality issues' });
  }
});

// ============================================================================
// HEALTH CHECK (for monitoring)
// ============================================================================

/**
 * GET /api/internal/quality/health
 * Simple health check for the internal dashboard
 */
router.get('/health', async (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'internal-quality-dashboard'
  });
});

export default router;
