/**
 * Brief Analysis Routes
 *
 * Endpoints for analyzing and improving briefs before work begins.
 */

import { Router, Request, Response, NextFunction } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requireOrganization } from '../middleware/multiTenancy.js';
import { briefClarificationService } from '../services/briefClarificationService.js';
import { logger } from '../utils/logger.js';

const router = Router();

/**
 * POST /brief-analysis/analyze
 * Analyze a brief for completeness and get clarifying questions
 */
router.post('/analyze', requireAuth, requireOrganization, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { brief, briefType, existingContext } = req.body;
    const clientId = (req as any).user?.id;
    const organizationId = (req as any).org?.id;

    if (!brief || typeof brief !== 'string') {
      return res.status(400).json({
        error: { code: 'INVALID_BRIEF', message: 'Brief text is required' }
      });
    }

    const analysis = await briefClarificationService.analyzeBrief({
      brief,
      briefType,
      existingContext,
      clientId,
      organizationId,
    });

    res.json({
      data: {
        isComplete: analysis.isComplete,
        completenessScore: analysis.completenessScore,
        missingElements: analysis.missingElements,
        ambiguities: analysis.ambiguities,
        clarifyingQuestions: analysis.clarifyingQuestions,
        recommendations: analysis.recommendations,
      }
    });
  } catch (error: unknown) {
    const err = error as Error;
    next(error);
  }
});

/**
 * POST /brief-analysis/validate
 * Check if a brief is ready for work to begin
 */
router.post('/validate', requireAuth, requireOrganization, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { brief, briefType, answers } = req.body;

    if (!brief || typeof brief !== 'string') {
      return res.status(400).json({
        error: { code: 'INVALID_BRIEF', message: 'Brief text is required' }
      });
    }

    const validation = await briefClarificationService.validateBriefReadiness({
      brief,
      briefType,
      answers,
    });

    res.json({
      data: {
        ready: validation.ready,
        score: validation.score,
        blockers: validation.blockers,
        warnings: validation.warnings,
      }
    });
  } catch (error: unknown) {
    const err = error as Error;
    next(error);
  }
});

/**
 * POST /brief-analysis/enhance
 * Enhance a brief with answers to clarifying questions
 */
router.post('/enhance', requireAuth, requireOrganization, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { brief, answers, briefType } = req.body;

    if (!brief || typeof brief !== 'string') {
      return res.status(400).json({
        error: { code: 'INVALID_BRIEF', message: 'Brief text is required' }
      });
    }

    if (!answers || typeof answers !== 'object') {
      return res.status(400).json({
        error: { code: 'INVALID_ANSWERS', message: 'Answers object is required' }
      });
    }

    const enhancedBrief = await briefClarificationService.enhanceBrief({
      originalBrief: brief,
      answers,
      briefType,
    });

    res.json({
      data: {
        enhancedBrief,
      }
    });
  } catch (error: unknown) {
    const err = error as Error;
    next(error);
  }
});

export default router;
