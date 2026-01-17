/**
 * Client Quality Routes
 *
 * API endpoints for the Client Quality RAG system.
 * Enables clients to provide feedback, learn preferences, and personalize evaluations.
 */

import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { logger } from '../utils/logger.js';
import {
  clientQualityRAGService,
  ClientFeedback,
  RubricAdjustment
} from '../services/clientQualityRAGService.js';
import { Department } from '../services/knowledge/types.js';

const router = Router();

// Valid departments for validation (from knowledge/types.ts ALL_DEPARTMENTS)
const VALID_DEPARTMENTS: Department[] = [
  'creative', 'engineering', 'design', 'strategy',
  'project', 'product', 'operations', 'spatial', 'orchestrator'
];

// Note: 'quality' is a DepartmentId in departmentTypes.ts but not in knowledge/types.ts Department
// The knowledge layer uses a slightly different department set than the agent hierarchy

function isValidDepartment(dept: string): dept is Department {
  return VALID_DEPARTMENTS.includes(dept as Department);
}

// ============================================================================
// FEEDBACK RECORDING
// ============================================================================

/**
 * POST /api/clients/:clientId/quality/feedback
 * Record client feedback on an output
 */
router.post('/:clientId/quality/feedback', requireAuth, async (req: Request, res: Response) => {
  try {
    const { clientId } = req.params;
    const userId = req.user!.id;

    // Verify client access (must be the same client or have admin access)
    if (clientId !== userId && req.user!.role !== 'operator') {
      return res.status(403).json({
        error: {
          code: 'FORBIDDEN',
          message: 'Not authorized to record feedback for this client'
        }
      });
    }

    const {
      department,
      deliverableType,
      deliverableId,
      outputContent,
      briefContext,
      rating,
      feedbackType,
      feedbackText,
      specificIssues,
      preferredChanges,
      organizationId
    } = req.body;

    // Validate required fields
    if (!department || !feedbackType || !outputContent) {
      return res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'department, feedbackType, and outputContent are required'
        }
      });
    }

    if (!isValidDepartment(department)) {
      return res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: `Invalid department. Must be one of: ${VALID_DEPARTMENTS.join(', ')}`
        }
      });
    }

    const validFeedbackTypes = ['approval', 'revision_request', 'rejection', 'general'];
    if (!validFeedbackTypes.includes(feedbackType)) {
      return res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: `Invalid feedbackType. Must be one of: ${validFeedbackTypes.join(', ')}`
        }
      });
    }

    const feedback: ClientFeedback = {
      clientId,
      organizationId,
      department,
      deliverableType,
      deliverableId,
      outputContent,
      briefContext,
      rating: rating ? parseInt(rating) : undefined,
      feedbackType,
      feedbackText,
      specificIssues,
      preferredChanges
    };

    const feedbackId = await clientQualityRAGService.recordFeedback(feedback);

    logger.info(`[ClientQuality] Recorded feedback ${feedbackId} for client ${clientId}`);

    res.status(201).json({
      data: { feedbackId },
      meta: { timestamp: new Date().toISOString() }
    });
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('Record feedback error:', error);
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to record feedback'
      }
    });
  }
});

/**
 * POST /api/clients/:clientId/quality/examples
 * Record a client-approved example
 */
router.post('/:clientId/quality/examples', requireAuth, async (req: Request, res: Response) => {
  try {
    const { clientId } = req.params;
    const userId = req.user!.id;

    if (clientId !== userId && req.user!.role !== 'operator') {
      return res.status(403).json({
        error: {
          code: 'FORBIDDEN',
          message: 'Not authorized to record examples for this client'
        }
      });
    }

    const { department, brief, output, approvalNotes, organizationId } = req.body;

    if (!department || !brief || !output) {
      return res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'department, brief, and output are required'
        }
      });
    }

    if (!isValidDepartment(department)) {
      return res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: `Invalid department. Must be one of: ${VALID_DEPARTMENTS.join(', ')}`
        }
      });
    }

    const exampleId = await clientQualityRAGService.recordApprovedExample(
      clientId,
      department,
      brief,
      output,
      approvalNotes,
      organizationId
    );

    logger.info(`[ClientQuality] Recorded approved example ${exampleId} for client ${clientId}`);

    res.status(201).json({
      data: { exampleId },
      meta: { timestamp: new Date().toISOString() }
    });
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('Record example error:', error);
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to record approved example'
      }
    });
  }
});

// ============================================================================
// PREFERENCES MANAGEMENT
// ============================================================================

/**
 * GET /api/clients/:clientId/quality/preferences
 * Get learned preferences for a client
 */
router.get('/:clientId/quality/preferences', requireAuth, async (req: Request, res: Response) => {
  try {
    const { clientId } = req.params;
    const userId = req.user!.id;
    const { department } = req.query;

    if (clientId !== userId && req.user!.role !== 'operator') {
      return res.status(403).json({
        error: {
          code: 'FORBIDDEN',
          message: 'Not authorized to view preferences for this client'
        }
      });
    }

    if (!department || !isValidDepartment(department as string)) {
      return res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: `department query param required. Must be one of: ${VALID_DEPARTMENTS.join(', ')}`
        }
      });
    }

    const preferences = await clientQualityRAGService.getClientPreferences(
      clientId,
      department as Department
    );

    res.json({
      data: { preferences },
      meta: { timestamp: new Date().toISOString() }
    });
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('Get preferences error:', error);
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to fetch preferences'
      }
    });
  }
});

/**
 * POST /api/clients/:clientId/quality/preferences
 * Manually set a preference for a client
 */
router.post('/:clientId/quality/preferences', requireAuth, async (req: Request, res: Response) => {
  try {
    const { clientId } = req.params;
    const userId = req.user!.id;

    if (clientId !== userId && req.user!.role !== 'operator') {
      return res.status(403).json({
        error: {
          code: 'FORBIDDEN',
          message: 'Not authorized to set preferences for this client'
        }
      });
    }

    const { department, preferenceType, preferenceValue, organizationId } = req.body;

    if (!department || !preferenceType || preferenceValue === undefined) {
      return res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'department, preferenceType, and preferenceValue are required'
        }
      });
    }

    if (!isValidDepartment(department)) {
      return res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: `Invalid department. Must be one of: ${VALID_DEPARTMENTS.join(', ')}`
        }
      });
    }

    await clientQualityRAGService.setClientPreference(
      clientId,
      department,
      preferenceType,
      preferenceValue,
      organizationId
    );

    logger.info(`[ClientQuality] Set preference ${preferenceType} for client ${clientId}`);

    res.json({
      data: { success: true },
      meta: { timestamp: new Date().toISOString() }
    });
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('Set preference error:', error);
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to set preference'
      }
    });
  }
});

// ============================================================================
// RUBRIC ADJUSTMENTS
// ============================================================================

/**
 * GET /api/clients/:clientId/quality/rubric-adjustments
 * Get client-specific rubric adjustments
 */
router.get('/:clientId/quality/rubric-adjustments', requireAuth, async (req: Request, res: Response) => {
  try {
    const { clientId } = req.params;
    const userId = req.user!.id;
    const { department, taskType } = req.query;

    if (clientId !== userId && req.user!.role !== 'operator') {
      return res.status(403).json({
        error: {
          code: 'FORBIDDEN',
          message: 'Not authorized to view rubric adjustments for this client'
        }
      });
    }

    if (!department || !isValidDepartment(department as string)) {
      return res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: `department query param required. Must be one of: ${VALID_DEPARTMENTS.join(', ')}`
        }
      });
    }

    const adjustments = await clientQualityRAGService.getClientRubricAdjustments(
      clientId,
      department as Department,
      (taskType as string) || 'general'
    );

    res.json({
      data: { adjustments },
      meta: { timestamp: new Date().toISOString() }
    });
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('Get rubric adjustments error:', error);
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to fetch rubric adjustments'
      }
    });
  }
});

/**
 * POST /api/clients/:clientId/quality/rubric-adjustments
 * Set client-specific rubric adjustments
 */
router.post('/:clientId/quality/rubric-adjustments', requireAuth, async (req: Request, res: Response) => {
  try {
    const { clientId } = req.params;
    const userId = req.user!.id;

    if (clientId !== userId && req.user!.role !== 'operator') {
      return res.status(403).json({
        error: {
          code: 'FORBIDDEN',
          message: 'Not authorized to set rubric adjustments for this client'
        }
      });
    }

    const {
      department,
      taskType,
      dimensionWeights,
      additionalCriteria,
      removedCriteria,
      thresholdAdjustment,
      organizationId
    } = req.body;

    if (!department) {
      return res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'department is required'
        }
      });
    }

    if (!isValidDepartment(department)) {
      return res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: `Invalid department. Must be one of: ${VALID_DEPARTMENTS.join(', ')}`
        }
      });
    }

    const adjustments: RubricAdjustment = {
      dimensionWeights,
      additionalCriteria,
      removedCriteria,
      thresholdAdjustment
    };

    await clientQualityRAGService.setRubricAdjustments(
      clientId,
      department,
      adjustments,
      taskType || 'general',
      organizationId
    );

    logger.info(`[ClientQuality] Set rubric adjustments for client ${clientId}/${department}`);

    res.json({
      data: { success: true },
      meta: { timestamp: new Date().toISOString() }
    });
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('Set rubric adjustments error:', error);
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to set rubric adjustments'
      }
    });
  }
});

// ============================================================================
// CONTEXT RETRIEVAL
// ============================================================================

/**
 * POST /api/clients/:clientId/quality/context
 * Get full quality context for evaluation (preferences, examples, similar feedback)
 */
router.post('/:clientId/quality/context', requireAuth, async (req: Request, res: Response) => {
  try {
    const { clientId } = req.params;
    const userId = req.user!.id;

    if (clientId !== userId && req.user!.role !== 'operator') {
      return res.status(403).json({
        error: {
          code: 'FORBIDDEN',
          message: 'Not authorized to view quality context for this client'
        }
      });
    }

    const { department, briefOrContext, limit } = req.body;

    if (!department || !briefOrContext) {
      return res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'department and briefOrContext are required'
        }
      });
    }

    if (!isValidDepartment(department)) {
      return res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: `Invalid department. Must be one of: ${VALID_DEPARTMENTS.join(', ')}`
        }
      });
    }

    const context = await clientQualityRAGService.getClientQualityContext(
      clientId,
      department,
      briefOrContext,
      limit || 5
    );

    // Also generate a context prompt for easy integration
    const contextPrompt = clientQualityRAGService.generateContextPrompt(context);

    res.json({
      data: {
        context,
        contextPrompt
      },
      meta: { timestamp: new Date().toISOString() }
    });
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('Get quality context error:', error);
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to fetch quality context'
      }
    });
  }
});

// ============================================================================
// SEARCH / SIMILARITY
// ============================================================================

/**
 * POST /api/clients/:clientId/quality/search/feedback
 * Search for similar past feedback
 */
router.post('/:clientId/quality/search/feedback', requireAuth, async (req: Request, res: Response) => {
  try {
    const { clientId } = req.params;
    const userId = req.user!.id;

    if (clientId !== userId && req.user!.role !== 'operator') {
      return res.status(403).json({
        error: {
          code: 'FORBIDDEN',
          message: 'Not authorized to search feedback for this client'
        }
      });
    }

    const { department, queryText, limit } = req.body;

    if (!department || !queryText) {
      return res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'department and queryText are required'
        }
      });
    }

    if (!isValidDepartment(department)) {
      return res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: `Invalid department. Must be one of: ${VALID_DEPARTMENTS.join(', ')}`
        }
      });
    }

    const results = await clientQualityRAGService.findSimilarFeedback(
      clientId,
      department,
      queryText,
      limit || 5
    );

    res.json({
      data: { results },
      meta: { timestamp: new Date().toISOString() }
    });
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('Search feedback error:', error);
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to search feedback'
      }
    });
  }
});

/**
 * POST /api/clients/:clientId/quality/search/examples
 * Search for similar approved examples
 */
router.post('/:clientId/quality/search/examples', requireAuth, async (req: Request, res: Response) => {
  try {
    const { clientId } = req.params;
    const userId = req.user!.id;

    if (clientId !== userId && req.user!.role !== 'operator') {
      return res.status(403).json({
        error: {
          code: 'FORBIDDEN',
          message: 'Not authorized to search examples for this client'
        }
      });
    }

    const { department, queryText, limit } = req.body;

    if (!department || !queryText) {
      return res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'department and queryText are required'
        }
      });
    }

    if (!isValidDepartment(department)) {
      return res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: `Invalid department. Must be one of: ${VALID_DEPARTMENTS.join(', ')}`
        }
      });
    }

    const results = await clientQualityRAGService.findSimilarApprovedExamples(
      clientId,
      department,
      queryText,
      limit || 5
    );

    res.json({
      data: { results },
      meta: { timestamp: new Date().toISOString() }
    });
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('Search examples error:', error);
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to search examples'
      }
    });
  }
});

// ============================================================================
// ANALYTICS
// ============================================================================

/**
 * GET /api/clients/:clientId/quality/stats
 * Get feedback statistics for a client
 */
router.get('/:clientId/quality/stats', requireAuth, async (req: Request, res: Response) => {
  try {
    const { clientId } = req.params;
    const userId = req.user!.id;

    if (clientId !== userId && req.user!.role !== 'operator') {
      return res.status(403).json({
        error: {
          code: 'FORBIDDEN',
          message: 'Not authorized to view stats for this client'
        }
      });
    }

    const stats = await clientQualityRAGService.getClientFeedbackStats(clientId);

    res.json({
      data: { stats },
      meta: { timestamp: new Date().toISOString() }
    });
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('Get stats error:', error);
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to fetch stats'
      }
    });
  }
});

/**
 * GET /api/clients/:clientId/quality/analytics/trends
 * Get preference and feedback trends over time
 */
router.get('/:clientId/quality/analytics/trends', requireAuth, async (req: Request, res: Response) => {
  try {
    const { clientId } = req.params;
    const userId = req.user!.id;
    const { days = '30', department } = req.query;

    if (clientId !== userId && req.user!.role !== 'operator') {
      return res.status(403).json({
        error: {
          code: 'FORBIDDEN',
          message: 'Not authorized to view analytics for this client'
        }
      });
    }

    const daysNum = parseInt(days as string) || 30;
    const trends = await clientQualityRAGService.getPreferenceTrends(
      clientId,
      daysNum,
      department as Department | undefined
    );

    res.json({
      data: { trends },
      meta: {
        timestamp: new Date().toISOString(),
        period: `${daysNum} days`
      }
    });
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('Get trends error:', error);
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to fetch preference trends'
      }
    });
  }
});

/**
 * GET /api/clients/:clientId/quality/analytics/dashboard
 * Get comprehensive dashboard data for client quality
 */
router.get('/:clientId/quality/analytics/dashboard', requireAuth, async (req: Request, res: Response) => {
  try {
    const { clientId } = req.params;
    const userId = req.user!.id;

    if (clientId !== userId && req.user!.role !== 'operator') {
      return res.status(403).json({
        error: {
          code: 'FORBIDDEN',
          message: 'Not authorized to view dashboard for this client'
        }
      });
    }

    const dashboard = await clientQualityRAGService.getDashboardData(clientId);

    res.json({
      data: { dashboard },
      meta: { timestamp: new Date().toISOString() }
    });
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('Get dashboard error:', error);
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to fetch dashboard data'
      }
    });
  }
});

/**
 * GET /api/clients/:clientId/quality/analytics/top-preferences
 * Get top preferences by confidence across all departments
 */
router.get('/:clientId/quality/analytics/top-preferences', requireAuth, async (req: Request, res: Response) => {
  try {
    const { clientId } = req.params;
    const userId = req.user!.id;
    const { limit = '10' } = req.query;

    if (clientId !== userId && req.user!.role !== 'operator') {
      return res.status(403).json({
        error: {
          code: 'FORBIDDEN',
          message: 'Not authorized to view preferences for this client'
        }
      });
    }

    const topPreferences = await clientQualityRAGService.getTopPreferences(
      clientId,
      parseInt(limit as string) || 10
    );

    res.json({
      data: { topPreferences },
      meta: { timestamp: new Date().toISOString() }
    });
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('Get top preferences error:', error);
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to fetch top preferences'
      }
    });
  }
});

/**
 * GET /api/clients/:clientId/quality/analytics/feedback-history
 * Get paginated feedback history with filters
 */
router.get('/:clientId/quality/analytics/feedback-history', requireAuth, async (req: Request, res: Response) => {
  try {
    const { clientId } = req.params;
    const userId = req.user!.id;
    const {
      page = '1',
      limit = '20',
      department,
      feedbackType,
      startDate,
      endDate
    } = req.query;

    if (clientId !== userId && req.user!.role !== 'operator') {
      return res.status(403).json({
        error: {
          code: 'FORBIDDEN',
          message: 'Not authorized to view feedback history for this client'
        }
      });
    }

    const pageNum = parseInt(page as string) || 1;
    const limitNum = Math.min(parseInt(limit as string) || 20, 100);

    const history = await clientQualityRAGService.getFeedbackHistory(
      clientId,
      pageNum,
      limitNum,
      {
        department: department as Department | undefined,
        feedbackType: feedbackType as string | undefined,
        startDate: startDate ? new Date(startDate as string) : undefined,
        endDate: endDate ? new Date(endDate as string) : undefined
      }
    );

    res.json({
      data: history,
      meta: {
        timestamp: new Date().toISOString(),
        page: pageNum,
        limit: limitNum
      }
    });
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('Get feedback history error:', error);
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to fetch feedback history'
      }
    });
  }
});

export default router;
