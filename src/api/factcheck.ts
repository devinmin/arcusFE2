/**
 * Fact-Check API Routes
 *
 * Endpoints for verifying claims in marketing content.
 */

import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requireOrganization } from '../middleware/multiTenancy.js';
import { logger } from '../utils/logger.js';
import {
  factCheckContent,
  quickFactCheck,
  extractClaims,
  suggestCorrections,
  FactCheckOptions
} from '../services/factCheckService.js';

const router = Router();

/**
 * POST /api/factcheck
 * Full fact-check of content
 */
router.post('/', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const {
      content,
      strictMode,
      checkStatistics,
      checkCompanyInfo,
      checkRegulatory,
      maxClaimsToCheck,
      industryContext,
      companyContext
    } = req.body;

    if (!content || typeof content !== 'string') {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'Content is required' }
      });
    }

    if (content.length > 50000) {
      return res.status(400).json({
        error: { code: 'CONTENT_TOO_LONG', message: 'Content exceeds 50,000 character limit' }
      });
    }

    const options: FactCheckOptions = {
      strictMode: strictMode === true,
      checkStatistics: checkStatistics !== false, // Default true
      checkCompanyInfo: checkCompanyInfo === true,
      checkRegulatory: checkRegulatory !== false, // Default true
      maxClaimsToCheck: maxClaimsToCheck || 10,
      industryContext,
      companyContext
    };

    logger.info('[FactCheck API] Starting fact-check', {
      contentLength: content.length,
      options
    });

    const report = await factCheckContent(content, options);

    res.json({
      success: true,
      report
    });

  } catch (error: unknown) {
    const err = error as Error;
    logger.error('[FactCheck API] Error:', error);
    res.status(500).json({
      error: {
        code: 'FACTCHECK_FAILED',
        message: 'Failed to fact-check content'
      }
    });
  }
});

/**
 * POST /api/factcheck/quick
 * Quick scan for potential issues without full verification
 */
router.post('/quick', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const { content } = req.body;

    if (!content || typeof content !== 'string') {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'Content is required' }
      });
    }

    const result = await quickFactCheck(content);

    res.json({
      success: true,
      ...result
    });

  } catch (error: unknown) {
    const err = error as Error;
    logger.error('[FactCheck API] Quick check error:', error);
    res.status(500).json({
      error: {
        code: 'QUICKCHECK_FAILED',
        message: 'Failed to quick-check content'
      }
    });
  }
});

/**
 * POST /api/factcheck/extract
 * Extract claims from content without verification
 */
router.post('/extract', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const { content, industryContext, companyContext, maxClaims } = req.body;

    if (!content || typeof content !== 'string') {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'Content is required' }
      });
    }

    const claims = await extractClaims(content, {
      industryContext,
      companyContext,
      maxClaimsToCheck: maxClaims || 20
    });

    res.json({
      success: true,
      claims,
      totalFound: claims.length
    });

  } catch (error: unknown) {
    const err = error as Error;
    logger.error('[FactCheck API] Extract claims error:', error);
    res.status(500).json({
      error: {
        code: 'EXTRACTION_FAILED',
        message: 'Failed to extract claims'
      }
    });
  }
});

/**
 * POST /api/factcheck/correct
 * Suggest corrections for a fact-check report
 */
router.post('/correct', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const { content, report } = req.body;

    if (!content || !report) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'Content and report are required' }
      });
    }

    const corrections = await suggestCorrections(content, report);

    res.json({
      success: true,
      ...corrections
    });

  } catch (error: unknown) {
    const err = error as Error;
    logger.error('[FactCheck API] Corrections error:', error);
    res.status(500).json({
      error: {
        code: 'CORRECTIONS_FAILED',
        message: 'Failed to generate corrections'
      }
    });
  }
});

export default router;
