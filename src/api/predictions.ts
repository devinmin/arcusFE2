/**
 * Predictions Routes
 *
 * Phase 2A: Predictive Campaign Performance Engine
 * API endpoints for campaign ROI forecasting, budget optimization, and variant ranking
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { requireOrganization, getOrganizationId, getUserId, createAuditLog } from '../middleware/multiTenancy.js';
import { predictivePerformanceService } from '../services/predictivePerformanceService.js';
import { logger } from '../utils/logger.js';
import { pool } from '../database/db.js';

const router = Router();

// ============================================================================
// SCHEMAS
// ============================================================================

const campaignForecastSchema = z.object({
  budget: z.number().min(1000, 'Budget must be at least $10'),
  durationDays: z.number().min(1).max(365),
  channels: z.array(z.enum(['meta', 'google', 'linkedin', 'tiktok', 'twitter'])).min(1)
});

const budgetOptimizationSchema = z.object({
  totalBudget: z.number().min(1000, 'Total budget must be at least $10'),
  channels: z.array(z.string()).min(1),
  objectives: z.array(z.string()).min(1),
  targetAudience: z.any().optional()
});

const variantRankingSchema = z.object({
  campaignPredictionId: z.string().uuid(),
  variants: z.array(z.object({
    variantId: z.string(),
    variationIndex: z.number(),
    headline: z.string().optional(),
    bodyText: z.string().optional(),
    cta: z.string().optional(),
    imageUrl: z.string().optional(),
    imageQualityScore: z.number().optional(),
    metadata: z.any().optional()
  })).min(2, 'At least 2 variants required for ranking')
});

const feedbackSchema = z.object({
  predictionId: z.string().uuid(),
  actualMetrics: z.object({
    roi: z.number(),
    ctr: z.number(),
    cpc: z.number(),
    conversions: z.number(),
    revenue: z.number(),
    impressions: z.number(),
    clicks: z.number(),
    spend: z.number()
  })
});

// ============================================================================
// ROUTES
// ============================================================================

/**
 * POST /api/predictions/campaign/:campaignId/forecast
 * Generate comprehensive performance prediction for a campaign
 */
router.post(
  '/campaign/:campaignId/forecast',
  requireAuth,
  requireOrganization,
  async (req: Request, res: Response) => {
    try {
      const { campaignId } = req.params;
      const organizationId = getOrganizationId(req)!;
      const userId = getUserId(req);

      // Validate input
      const { budget, durationDays, channels } = campaignForecastSchema.parse(req.body);

      // Check campaign exists and belongs to organization
      const campaignResult = await pool.query(
        `SELECT id, organization_id FROM campaigns WHERE id = $1`,
        [campaignId]
      );

      if (campaignResult.rows.length === 0) {
        return res.status(404).json({
          error: { code: 'CAMPAIGN_NOT_FOUND', message: 'Campaign not found' }
        });
      }

      if (campaignResult.rows[0].organization_id !== organizationId) {
        return res.status(403).json({
          error: { code: 'FORBIDDEN', message: 'Access denied to this campaign' }
        });
      }

      // Generate prediction
      const prediction = await predictivePerformanceService.predictCampaignROI(
        campaignId,
        organizationId,
        budget,
        durationDays,
        channels
      );

      // Audit log
      await createAuditLog(req, 'prediction.created', 'campaign_prediction', prediction.id, {
        campaignId,
        predictedROI: prediction.predictedROI,
        confidence: prediction.confidenceScore
      });

      logger.info(`Prediction generated for campaign ${campaignId}`, {
        predictionId: prediction.id,
        roi: prediction.predictedROI,
        confidence: prediction.confidenceScore
      });

      res.json({
        success: true,
        prediction: {
          id: prediction.id,
          campaignId: prediction.campaignId,

          // Core predictions
          predictedROI: prediction.predictedROI,
          predictedCTR: prediction.predictedCTR,
          predictedCPC: prediction.predictedCPC / 100, // Convert to dollars
          predictedConversions: prediction.predictedConversions,
          predictedRevenue: prediction.predictedRevenue / 100, // Convert to dollars

          // Confidence
          confidence: {
            score: prediction.confidenceScore,
            level: prediction.confidenceScore >= 0.8 ? 'high' :
                   prediction.confidenceScore >= 0.6 ? 'medium' : 'low',
            interval: {
              lower: prediction.confidenceInterval.lower,
              upper: prediction.confidenceInterval.upper
            }
          },

          // Recommendations
          recommendations: {
            budget: prediction.recommendedBudget ? prediction.recommendedBudget / 100 : null,
            duration: prediction.recommendedDuration,
            budgetAllocation: prediction.budgetAllocation ?
              Object.fromEntries(
                Object.entries(prediction.budgetAllocation).map(([k, v]) => [k, v / 100])
              ) : null,
            channels: prediction.channelRecommendations
          },

          // Analysis
          riskFactors: prediction.riskFactors,
          opportunities: prediction.opportunities,

          // Industry comparison
          industryBenchmark: prediction.industryBenchmark,

          // Metadata
          modelVersion: prediction.modelVersion,
          predictionMethod: prediction.predictionMethod,
          createdAt: prediction.createdAt
        }
      });

    } catch (error: unknown) {
    const err = error as Error;
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          error: { code: 'VALIDATION_ERROR', message: 'Invalid input', details: error.errors }
        });
      }

      logger.error('Campaign forecast failed', { error, campaignId: req.params.campaignId });
      res.status(500).json({
        error: { code: 'PREDICTION_FAILED', message: 'Failed to generate prediction' }
      });
    }
  }
);

/**
 * GET /api/predictions/campaign/:campaignId
 * Get existing predictions for a campaign
 */
router.get(
  '/campaign/:campaignId',
  requireAuth,
  requireOrganization,
  async (req: Request, res: Response) => {
    try {
      const { campaignId } = req.params;
      const organizationId = getOrganizationId(req)!;

      const result = await pool.query(
        `SELECT
          id, campaign_id, organization_id,
          predicted_roi, predicted_ctr, predicted_cpc_cents,
          predicted_conversions, predicted_revenue_cents,
          predicted_impressions, predicted_clicks,
          confidence_score, confidence_interval_lower, confidence_interval_upper,
          recommended_budget_cents, recommended_duration_days,
          budget_allocation, channel_recommendations,
          risk_factors, opportunities, similar_campaign_ids,
          industry_avg_roi, industry_avg_ctr, industry_avg_cpc_cents,
          performance_vs_industry,
          model_version, features_used, prediction_method,
          created_at, expires_at
         FROM campaign_predictions
         WHERE campaign_id = $1 AND organization_id = $2
         ORDER BY created_at DESC
         LIMIT 10`,
        [campaignId, organizationId]
      );

      const predictions = result.rows.map(row => ({
        id: row.id,
        campaignId: row.campaign_id,
        predictedROI: parseFloat(row.predicted_roi),
        predictedCTR: parseFloat(row.predicted_ctr),
        predictedCPC: parseInt(row.predicted_cpc_cents) / 100,
        predictedConversions: parseInt(row.predicted_conversions),
        predictedRevenue: parseInt(row.predicted_revenue_cents) / 100,
        predictedImpressions: parseInt(row.predicted_impressions),
        predictedClicks: parseInt(row.predicted_clicks),
        confidence: {
          score: parseFloat(row.confidence_score),
          level: parseFloat(row.confidence_score) >= 0.8 ? 'high' :
                 parseFloat(row.confidence_score) >= 0.6 ? 'medium' : 'low',
          interval: {
            lower: parseFloat(row.confidence_interval_lower),
            upper: parseFloat(row.confidence_interval_upper)
          }
        },
        recommendations: {
          budget: row.recommended_budget_cents ? parseInt(row.recommended_budget_cents) / 100 : null,
          duration: row.recommended_duration_days,
          budgetAllocation: row.budget_allocation,
          channels: row.channel_recommendations
        },
        riskFactors: row.risk_factors,
        opportunities: row.opportunities,
        industryBenchmark: row.industry_avg_roi ? {
          avgROI: parseFloat(row.industry_avg_roi),
          avgCTR: parseFloat(row.industry_avg_ctr),
          avgCPC: parseInt(row.industry_avg_cpc_cents) / 100,
          performanceVsIndustry: row.performance_vs_industry
        } : null,
        modelVersion: row.model_version,
        predictionMethod: row.prediction_method,
        createdAt: row.created_at,
        expiresAt: row.expires_at
      }));

      res.json({ success: true, predictions });

    } catch (error: unknown) {
    const err = error as Error;
      logger.error('Failed to get predictions', { error, campaignId: req.params.campaignId });
      res.status(500).json({
        error: { code: 'QUERY_FAILED', message: 'Failed to retrieve predictions' }
      });
    }
  }
);

/**
 * POST /api/predictions/variants/rank
 * Rank creative variants by predicted performance
 */
router.post(
  '/variants/rank',
  requireAuth,
  requireOrganization,
  async (req: Request, res: Response) => {
    try {
      const organizationId = getOrganizationId(req)!;
      const userId = getUserId(req);

      // Validate input
      const { variants, campaignPredictionId } = variantRankingSchema.parse(req.body);

      // Verify prediction exists and belongs to organization
      const predictionResult = await pool.query(
        `SELECT id FROM campaign_predictions WHERE id = $1 AND organization_id = $2`,
        [campaignPredictionId, organizationId]
      );

      if (predictionResult.rows.length === 0) {
        return res.status(404).json({
          error: { code: 'PREDICTION_NOT_FOUND', message: 'Campaign prediction not found' }
        });
      }

      // Rank variants
      const rankedVariants = await predictivePerformanceService.predictVariantWinners(
        campaignPredictionId,
        variants
      );

      // Audit log
      await createAuditLog(req, 'variants.ranked', 'campaign_prediction', campaignPredictionId, {
        variantCount: variants.length,
        topScore: rankedVariants[0]?.predictedPerformanceScore
      });

      logger.info(`Ranked ${variants.length} variants for prediction ${campaignPredictionId}`);

      res.json({
        success: true,
        rankedVariants: rankedVariants.map(v => ({
          variantId: v.variantId,
          variationIndex: v.variationIndex,
          headline: v.headline,
          cta: v.cta,
          rank: v.rank,
          percentile: v.percentile,
          predictions: {
            performanceScore: v.predictedPerformanceScore,
            ctr: v.predictedCTR,
            engagementRate: v.predictedEngagementRate,
            winProbability: v.winProbability
          },
          scores: {
            headline: v.headlineScore,
            cta: v.ctaScore,
            visual: v.visualScore,
            relevance: v.relevanceScore
          },
          analysis: {
            strengths: v.strengths,
            weaknesses: v.weaknesses,
            suggestions: v.optimizationSuggestions
          }
        }))
      });

    } catch (error: unknown) {
    const err = error as Error;
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          error: { code: 'VALIDATION_ERROR', message: 'Invalid input', details: error.errors }
        });
      }

      logger.error('Variant ranking failed', { error });
      res.status(500).json({
        error: { code: 'RANKING_FAILED', message: 'Failed to rank variants' }
      });
    }
  }
);

/**
 * POST /api/predictions/budget/optimize
 * Optimize budget allocation across channels
 */
router.post(
  '/budget/optimize',
  requireAuth,
  requireOrganization,
  async (req: Request, res: Response) => {
    try {
      const organizationId = getOrganizationId(req)!;
      const userId = getUserId(req);

      // Validate input
      const { totalBudget, channels, objectives, targetAudience } = budgetOptimizationSchema.parse(req.body);

      // Optimize budget allocation
      const optimization = await predictivePerformanceService.optimizeBudgetAllocation(
        organizationId,
        totalBudget,
        channels,
        objectives,
        targetAudience
      );

      // Audit log
      await createAuditLog(req, 'budget.optimized', 'organization', organizationId, {
        totalBudget,
        channels: channels.length,
        expectedROI: optimization.expectedTotalROI
      });

      logger.info(`Budget optimization completed for organization ${organizationId}`, {
        totalBudget,
        expectedROI: optimization.expectedTotalROI
      });

      res.json({
        success: true,
        optimization: {
          totalBudget: optimization.totalBudget / 100, // Convert to dollars
          allocation: Object.fromEntries(
            Object.entries(optimization.recommendedAllocation).map(([channel, data]: [string, any]) => [
              channel,
              {
                budget: data.budget / 100,
                expectedROI: data.expectedROI,
                expectedConversions: data.expectedConversions,
                expectedRevenue: data.expectedRevenue / 100
              }
            ])
          ),
          expectedResults: {
            totalROI: optimization.expectedTotalROI,
            totalConversions: optimization.expectedTotalConversions,
            totalRevenue: optimization.expectedTotalRevenue / 100
          },
          confidence: {
            score: optimization.confidenceScore,
            level: optimization.confidenceScore >= 0.8 ? 'high' :
                   optimization.confidenceScore >= 0.6 ? 'medium' : 'low'
          },
          method: optimization.optimizationMethod
        }
      });

    } catch (error: unknown) {
    const err = error as Error;
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          error: { code: 'VALIDATION_ERROR', message: 'Invalid input', details: error.errors }
        });
      }

      logger.error('Budget optimization failed', { error });
      res.status(500).json({
        error: { code: 'OPTIMIZATION_FAILED', message: 'Failed to optimize budget' }
      });
    }
  }
);

/**
 * GET /api/predictions/benchmarks/:industry
 * Get industry benchmarks for comparison
 */
router.get(
  '/benchmarks/:industry',
  requireAuth,
  requireOrganization,
  async (req: Request, res: Response) => {
    try {
      const { industry } = req.params;
      const { objective } = req.query;

      if (!objective || typeof objective !== 'string') {
        return res.status(400).json({
          error: { code: 'MISSING_OBJECTIVE', message: 'objective query parameter is required' }
        });
      }

      const benchmark = await predictivePerformanceService.getIndustryBenchmarks(
        industry,
        objective
      );

      if (!benchmark) {
        return res.status(404).json({
          error: { code: 'BENCHMARK_NOT_FOUND', message: 'No benchmarks found for this industry/objective' }
        });
      }

      res.json({
        success: true,
        benchmark: {
          industry: benchmark.industry,
          objective: benchmark.objective,
          averages: {
            roi: benchmark.avgROI,
            ctr: benchmark.avgCTR,
            cpc: benchmark.avgCPC / 100 // Convert to dollars
          },
          medians: {
            roi: benchmark.medianROI,
            ctr: benchmark.medianCTR,
            cpc: benchmark.medianCPC / 100
          },
          percentiles: {
            roi: benchmark.percentiles.roi,
            ctr: benchmark.percentiles.ctr
          },
          sampleSize: benchmark.sampleSize,
          lastUpdated: benchmark.lastUpdated
        }
      });

    } catch (error: unknown) {
    const err = error as Error;
      logger.error('Failed to get benchmarks', { error, industry: req.params.industry });
      res.status(500).json({
        error: { code: 'QUERY_FAILED', message: 'Failed to retrieve benchmarks' }
      });
    }
  }
);

/**
 * POST /api/predictions/feedback
 * Record actual campaign outcomes for model improvement
 */
router.post(
  '/feedback',
  requireAuth,
  requireOrganization,
  async (req: Request, res: Response) => {
    try {
      const organizationId = getOrganizationId(req)!;
      const userId = getUserId(req);

      // Validate input
      const { predictionId, actualMetrics } = feedbackSchema.parse(req.body);

      // Verify prediction exists and belongs to organization
      const predictionResult = await pool.query(
        `SELECT id, campaign_id FROM campaign_predictions WHERE id = $1 AND organization_id = $2`,
        [predictionId, organizationId]
      );

      if (predictionResult.rows.length === 0) {
        return res.status(404).json({
          error: { code: 'PREDICTION_NOT_FOUND', message: 'Prediction not found' }
        });
      }

      // Record actual outcome
      await predictivePerformanceService.recordActualOutcome(predictionId, actualMetrics);

      // Audit log
      await createAuditLog(req, 'prediction.feedback', 'campaign_prediction', predictionId, {
        actualROI: actualMetrics.roi
      });

      logger.info(`Feedback recorded for prediction ${predictionId}`);

      res.json({
        success: true,
        message: 'Feedback recorded successfully'
      });

    } catch (error: unknown) {
    const err = error as Error;
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          error: { code: 'VALIDATION_ERROR', message: 'Invalid input', details: error.errors }
        });
      }

      logger.error('Failed to record feedback', { error });
      res.status(500).json({
        error: { code: 'FEEDBACK_FAILED', message: 'Failed to record feedback' }
      });
    }
  }
);

/**
 * GET /api/predictions/model/performance
 * Get prediction model accuracy metrics
 */
router.get(
  '/model/performance',
  requireAuth,
  requireOrganization,
  async (req: Request, res: Response) => {
    try {
      const { modelVersion = 'v1.0.0', days = 30 } = req.query;

      const result = await pool.query(
        `SELECT * FROM prediction_model_performance
         WHERE model_version = $1
         ORDER BY evaluation_period_end DESC
         LIMIT 1`,
        [modelVersion]
      );

      if (result.rows.length === 0) {
        return res.json({
          success: true,
          message: 'No performance data available yet',
          performance: null
        });
      }

      const perf = result.rows[0];

      res.json({
        success: true,
        performance: {
          modelVersion: perf.model_version,
          evaluationPeriod: {
            start: perf.evaluation_period_start,
            end: perf.evaluation_period_end
          },
          accuracy: {
            overall: parseFloat(perf.overall_accuracy_score),
            roiError: parseFloat(perf.avg_roi_error_percent),
            ctrError: parseFloat(perf.avg_ctr_error_percent),
            cpcError: parseFloat(perf.avg_cpc_error_percent)
          },
          byConfidence: {
            high: parseFloat(perf.high_confidence_accuracy),
            medium: parseFloat(perf.medium_confidence_accuracy),
            low: parseFloat(perf.low_confidence_accuracy)
          },
          sampleSize: {
            totalPredictions: parseInt(perf.total_predictions),
            predictionsWithFeedback: parseInt(perf.predictions_with_feedback)
          }
        }
      });

    } catch (error: unknown) {
    const err = error as Error;
      logger.error('Failed to get model performance', { error });
      res.status(500).json({
        error: { code: 'QUERY_FAILED', message: 'Failed to retrieve model performance' }
      });
    }
  }
);

export default router;
