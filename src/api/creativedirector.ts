/**
 * AI Creative Director Routes
 *
 * API endpoints for brand taste learning and creative direction
 */

import express, { Request, Response } from 'express';
import { aiCreativeDirector } from '../services/aiCreativeDirectorService.js';
import { logger } from '../utils/logger.js';
import { authMiddleware } from '../middleware/auth.js';
import { requireOrganization } from '../middleware/multiTenancy.js';

const router = express.Router();

// SEC-004 FIX: All routes require authentication and organization context
router.use(authMiddleware);
router.use(requireOrganization);

// ============================================================================
// Brand Creative DNA
// ============================================================================

/**
 * GET /api/brands/:brandId/creative-dna
 * Get brand creative DNA profile
 */
router.get('/:brandId/creative-dna', async (req: Request, res: Response) => {
    try {
        const { brandId } = req.params;
        const dna = await aiCreativeDirector.getBrandDNA(brandId);

        res.json({
            success: true,
            data: dna
        });
    } catch (error: unknown) {
    const err = error as Error;
        logger.error('Failed to get brand creative DNA:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to retrieve brand creative DNA'
        });
    }
});

/**
 * GET /api/brands/:brandId/creative-direction
 * Get creative direction for content generation
 */
router.get('/:brandId/creative-direction', async (req: Request, res: Response) => {
    try {
        const { brandId } = req.params;
        const { contentType } = req.query;

        const direction = await aiCreativeDirector.getCreativeDirection(
            brandId,
            contentType as string
        );

        res.json({
            success: true,
            data: direction
        });
    } catch (error: unknown) {
    const err = error as Error;
        logger.error('Failed to get creative direction:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to retrieve creative direction'
        });
    }
});

// ============================================================================
// Learning & Predictions
// ============================================================================

/**
 * POST /api/brands/:brandId/creative-dna/learn
 * Record approval decision for learning
 *
 * Body: {
 *   deliverableId: string,
 *   deliverableType: 'image' | 'video' | 'copy' | 'email' | 'social_post',
 *   decision: 'approved' | 'rejected' | 'approved_with_changes',
 *   features: CreativeFeatures,
 *   feedback?: string,
 *   changes?: object
 * }
 */
router.post('/:brandId/creative-dna/learn', async (req: Request, res: Response) => {
    try {
        const { brandId } = req.params;
        const { deliverableId, deliverableType, decision, features, feedback, changes } = req.body;
        const userId = (req as any).user?.id;

        if (!deliverableId || !deliverableType || !decision || !features) {
            return res.status(400).json({
                success: false,
                error: 'Missing required fields: deliverableId, deliverableType, decision, features'
            });
        }

        if (!['approved', 'rejected', 'approved_with_changes'].includes(decision)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid decision. Must be: approved, rejected, or approved_with_changes'
            });
        }

        await aiCreativeDirector.learnFromApproval(
            brandId,
            deliverableId,
            deliverableType,
            decision,
            features,
            userId,
            feedback,
            changes
        );

        res.json({
            success: true,
            message: 'Learning recorded successfully'
        });
    } catch (error: unknown) {
    const err = error as Error;
        logger.error('Failed to record learning:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to record approval learning'
        });
    }
});

/**
 * POST /api/brands/:brandId/creative-dna/predict
 * Predict approval for content before showing to user
 *
 * Body: {
 *   features: CreativeFeatures,
 *   savePredict?: boolean
 * }
 */
router.post('/:brandId/creative-dna/predict', async (req: Request, res: Response) => {
    try {
        const { brandId } = req.params;
        const { features, savePredict = true } = req.body;

        if (!features) {
            return res.status(400).json({
                success: false,
                error: 'Missing required field: features'
            });
        }

        const prediction = await aiCreativeDirector.predictApproval(
            brandId,
            features,
            savePredict
        );

        res.json({
            success: true,
            data: prediction
        });
    } catch (error: unknown) {
    const err = error as Error;
        logger.error('Failed to predict approval:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to predict approval'
        });
    }
});

/**
 * PUT /api/brands/:brandId/creative-dna/predict/:predictionId
 * Update prediction with actual outcome
 *
 * Body: {
 *   actualDecision: 'approved' | 'rejected' | 'approved_with_changes'
 * }
 */
router.put('/:brandId/creative-dna/predict/:predictionId', async (req: Request, res: Response) => {
    try {
        const { predictionId } = req.params;
        const { actualDecision } = req.body;

        if (!actualDecision || !['approved', 'rejected', 'approved_with_changes'].includes(actualDecision)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid actualDecision. Must be: approved, rejected, or approved_with_changes'
            });
        }

        await aiCreativeDirector.updatePredictionOutcome(predictionId, actualDecision);

        res.json({
            success: true,
            message: 'Prediction outcome updated'
        });
    } catch (error: unknown) {
    const err = error as Error;
        logger.error('Failed to update prediction outcome:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to update prediction outcome'
        });
    }
});

/**
 * POST /api/brands/:brandId/creative-dna/extract-features
 * Extract creative features from content
 *
 * Body: {
 *   type: 'image' | 'video' | 'copy' | 'email' | 'social_post',
 *   url?: string,
 *   text?: string,
 *   metadata?: object
 * }
 */
router.post('/:brandId/creative-dna/extract-features', async (req: Request, res: Response) => {
    try {
        const { type, url, text, metadata } = req.body;

        if (!type) {
            return res.status(400).json({
                success: false,
                error: 'Missing required field: type'
            });
        }

        const features = await aiCreativeDirector.extractFeatures({
            type,
            url,
            text,
            metadata
        });

        res.json({
            success: true,
            data: features
        });
    } catch (error: unknown) {
    const err = error as Error;
        logger.error('Failed to extract features:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to extract creative features'
        });
    }
});

// ============================================================================
// Creative Suggestions
// ============================================================================

/**
 * GET /api/brands/:brandId/creative-suggestions
 * Get AI-generated creative suggestions
 */
router.get('/:brandId/creative-suggestions', async (req: Request, res: Response) => {
    try {
        const { brandId } = req.params;
        const { status = 'pending' } = req.query;

        let suggestions;
        if (status === 'pending') {
            suggestions = await aiCreativeDirector.getPendingSuggestions(brandId);
        } else {
            // Generate new suggestions
            suggestions = await aiCreativeDirector.generateCreativeSuggestions(brandId);
        }

        res.json({
            success: true,
            data: suggestions
        });
    } catch (error: unknown) {
    const err = error as Error;
        logger.error('Failed to get creative suggestions:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to retrieve creative suggestions'
        });
    }
});

/**
 * POST /api/brands/:brandId/creative-suggestions/generate
 * Generate new creative suggestions
 */
router.post('/:brandId/creative-suggestions/generate', async (req: Request, res: Response) => {
    try {
        const { brandId } = req.params;

        const suggestions = await aiCreativeDirector.generateCreativeSuggestions(brandId);

        res.json({
            success: true,
            data: suggestions
        });
    } catch (error: unknown) {
    const err = error as Error;
        logger.error('Failed to generate creative suggestions:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to generate creative suggestions'
        });
    }
});

/**
 * PUT /api/brands/:brandId/creative-suggestions/:suggestionId
 * Update suggestion status (accept/dismiss)
 *
 * Body: {
 *   status: 'accepted' | 'dismissed',
 *   feedback?: string
 * }
 */
router.put('/:brandId/creative-suggestions/:suggestionId', async (req: Request, res: Response) => {
    try {
        const { suggestionId } = req.params;
        const { status, feedback } = req.body;

        if (!status || !['accepted', 'dismissed'].includes(status)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid status. Must be: accepted or dismissed'
            });
        }

        await aiCreativeDirector.updateSuggestionStatus(suggestionId, status, feedback);

        res.json({
            success: true,
            message: `Suggestion ${status}`
        });
    } catch (error: unknown) {
    const err = error as Error;
        logger.error('Failed to update suggestion status:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to update suggestion status'
        });
    }
});

// ============================================================================
// Style Evolution
// ============================================================================

/**
 * GET /api/brands/:brandId/style-evolution
 * Get style evolution history
 */
router.get('/:brandId/style-evolution', async (req: Request, res: Response) => {
    try {
        const { brandId } = req.params;
        const { limit = 12 } = req.query;

        const evolution = await aiCreativeDirector.getStyleEvolution(
            brandId,
            parseInt(limit as string)
        );

        res.json({
            success: true,
            data: evolution
        });
    } catch (error: unknown) {
    const err = error as Error;
        logger.error('Failed to get style evolution:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to retrieve style evolution'
        });
    }
});

/**
 * POST /api/brands/:brandId/style-evolution/snapshot
 * Take manual style snapshot
 *
 * Body: {
 *   trigger?: string,
 *   notes?: string
 * }
 */
router.post('/:brandId/style-evolution/snapshot', async (req: Request, res: Response) => {
    try {
        const { brandId } = req.params;
        const { trigger, notes } = req.body;

        await aiCreativeDirector.snapshotStyleEvolution(brandId, trigger, notes);

        res.json({
            success: true,
            message: 'Style snapshot created'
        });
    } catch (error: unknown) {
    const err = error as Error;
        logger.error('Failed to create style snapshot:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to create style snapshot'
        });
    }
});

// ============================================================================
// Analytics & Metrics
// ============================================================================

/**
 * GET /api/brands/:brandId/prediction-accuracy
 * Get prediction accuracy metrics
 */
router.get('/:brandId/prediction-accuracy', async (req: Request, res: Response) => {
    try {
        const { brandId } = req.params;

        const accuracy = await aiCreativeDirector.getPredictionAccuracy(brandId);

        res.json({
            success: true,
            data: accuracy
        });
    } catch (error: unknown) {
    const err = error as Error;
        logger.error('Failed to get prediction accuracy:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to retrieve prediction accuracy'
        });
    }
});

/**
 * GET /api/brands/:brandId/creative-insights
 * Get comprehensive creative insights dashboard
 */
router.get('/:brandId/creative-insights', async (req: Request, res: Response) => {
    try {
        const { brandId } = req.params;

        // Get all relevant data
        const [dna, accuracy, suggestions, evolution] = await Promise.all([
            aiCreativeDirector.getBrandDNA(brandId),
            aiCreativeDirector.getPredictionAccuracy(brandId),
            aiCreativeDirector.getPendingSuggestions(brandId),
            aiCreativeDirector.getStyleEvolution(brandId, 6)
        ]);

        res.json({
            success: true,
            data: {
                dna,
                accuracy,
                suggestions,
                evolution,
                insights: {
                    learningStage: dna.confidenceScore < 0.3 ? 'early' :
                                  dna.confidenceScore < 0.7 ? 'developing' : 'mature',
                    samplesNeeded: Math.max(0, 100 - dna.samplesAnalyzed),
                    predictionReliability: accuracy.accuracyRate > 70 ? 'high' :
                                          accuracy.accuracyRate > 50 ? 'medium' : 'low'
                }
            }
        });
    } catch (error: unknown) {
    const err = error as Error;
        logger.error('Failed to get creative insights:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to retrieve creative insights'
        });
    }
});

export default router;
