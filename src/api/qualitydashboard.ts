/**
 * Quality Dashboard API
 *
 * Endpoints for the quality monitoring dashboard.
 * These provide real-time visibility into quality metrics without running scripts.
 */

import { Router, Request, Response } from 'express';
import { qualityGateService } from '../services/qualityGateService.js';
import { qualityProofService } from '../services/qualityProofService.js';
import { goldenDatasetService } from '../services/goldenDatasetService.js';
import { pool } from '../database/db.js';
import { logger } from '../utils/logger.js';
import { requireAuth } from '../middleware/auth.js';
import { requireOrganization } from '../middleware/multiTenancy.js';

const router = Router();

// SEC-004 FIX: All quality dashboard routes require authentication and organization context
router.use(requireAuth);
router.use(requireOrganization);

// ============================================================================
// QUALITY METRICS
// ============================================================================

/**
 * GET /api/quality/metrics
 *
 * Get quality metrics for the dashboard
 */
router.get('/metrics', async (req: Request, res: Response) => {
    try {
        const timeRange = (req.query.range as '24h' | '7d' | '30d') || '7d';
        const metrics = await qualityGateService.getQualityMetrics(timeRange);

        res.json({
            success: true,
            data: metrics,
            timeRange
        });
    } catch (error: unknown) {
    const err = error as Error;
        logger.error('[QualityDashboard] Failed to get metrics:', error);
        res.status(500).json({
            success: false,
            error: err.message
        });
    }
});

/**
 * GET /api/quality/health
 *
 * Get current quality health status
 */
router.get('/health', async (req: Request, res: Response) => {
    try {
        // Get latest health check result
        const result = await pool.query(`
            SELECT * FROM quality_health_checks
            ORDER BY created_at DESC
            LIMIT 1
        `);

        if (result.rows.length === 0) {
            res.json({
                success: true,
                data: {
                    status: 'unknown',
                    message: 'No health check data yet',
                    lastCheck: null
                }
            });
            return;
        }

        res.json({
            success: true,
            data: {
                status: result.rows[0].status,
                averageQuality: result.rows[0].average_quality,
                clientsChecked: result.rows[0].clients_checked,
                alerts: result.rows[0].alerts,
                lastCheck: result.rows[0].created_at
            }
        });
    } catch (error: unknown) {
    const err = error as Error;
        logger.error('[QualityDashboard] Failed to get health:', error);
        res.status(500).json({
            success: false,
            error: err.message
        });
    }
});

/**
 * POST /api/quality/health/run
 *
 * Manually trigger a health check (admin only)
 */
router.post('/health/run', async (req: Request, res: Response) => {
    try {
        const result = await qualityGateService.runQualityHealthCheck();

        res.json({
            success: true,
            data: result
        });
    } catch (error: unknown) {
    const err = error as Error;
        logger.error('[QualityDashboard] Failed to run health check:', error);
        res.status(500).json({
            success: false,
            error: err.message
        });
    }
});

// ============================================================================
// GOLDEN BENCHMARK
// ============================================================================

/**
 * GET /api/quality/benchmark/latest
 *
 * Get latest golden benchmark results
 */
router.get('/benchmark/latest', async (req: Request, res: Response) => {
    try {
        const result = await pool.query(`
            SELECT * FROM quality_benchmarks
            ORDER BY created_at DESC
            LIMIT 1
        `);

        if (result.rows.length === 0) {
            res.json({
                success: true,
                data: null,
                message: 'No benchmark data yet'
            });
            return;
        }

        res.json({
            success: true,
            data: {
                winRate: result.rows[0].win_rate,
                matchesOrExceeds: result.rows[0].matches_exceeds,
                belowStandard: result.rows[0].below_standard,
                verdict: result.rows[0].verdict,
                recommendations: result.rows[0].recommendations,
                runAt: result.rows[0].created_at
            }
        });
    } catch (error: unknown) {
    const err = error as Error;
        logger.error('[QualityDashboard] Failed to get benchmark:', error);
        res.status(500).json({
            success: false,
            error: err.message
        });
    }
});

/**
 * GET /api/quality/benchmark/history
 *
 * Get benchmark history over time
 */
router.get('/benchmark/history', async (req: Request, res: Response) => {
    try {
        const limit = parseInt(req.query.limit as string) || 10;

        const result = await pool.query(`
            SELECT
                win_rate,
                matches_exceeds,
                below_standard,
                verdict,
                created_at
            FROM quality_benchmarks
            ORDER BY created_at DESC
            LIMIT $1
        `, [limit]);

        res.json({
            success: true,
            data: result.rows.map(row => ({
                winRate: row.win_rate,
                matchesOrExceeds: row.matches_exceeds,
                belowStandard: row.below_standard,
                verdict: row.verdict,
                date: row.created_at
            }))
        });
    } catch (error: unknown) {
    const err = error as Error;
        logger.error('[QualityDashboard] Failed to get benchmark history:', error);
        res.status(500).json({
            success: false,
            error: err.message
        });
    }
});

/**
 * POST /api/quality/benchmark/run
 *
 * Manually trigger a benchmark (admin only, expensive)
 */
router.post('/benchmark/run', async (req: Request, res: Response) => {
    try {
        const testCount = parseInt(req.body.testCount) || 10;

        // Run async - this takes several minutes
        res.json({
            success: true,
            message: 'Benchmark started. Results will be available in /benchmark/latest',
            estimatedTime: `${testCount * 30}s`
        });

        // Run in background
        qualityGateService.runGoldenBenchmark()
            .then(result => {
                logger.info('[QualityDashboard] Manual benchmark complete', result);
            })
            .catch(err => {
                logger.error('[QualityDashboard] Manual benchmark failed', err);
            });

    } catch (error: unknown) {
    const err = error as Error;
        logger.error('[QualityDashboard] Failed to start benchmark:', error);
        res.status(500).json({
            success: false,
            error: err.message
        });
    }
});

// ============================================================================
// GOLDEN DATASET
// ============================================================================

/**
 * GET /api/quality/golden/stats
 *
 * Get golden dataset statistics
 */
router.get('/golden/stats', async (req: Request, res: Response) => {
    try {
        const stats = await goldenDatasetService.getStats();

        res.json({
            success: true,
            data: stats
        });
    } catch (error: unknown) {
    const err = error as Error;
        logger.error('[QualityDashboard] Failed to get golden stats:', error);
        res.status(500).json({
            success: false,
            error: err.message
        });
    }
});

/**
 * GET /api/quality/golden/examples
 *
 * List golden examples with pagination
 */
router.get('/golden/examples', async (req: Request, res: Response) => {
    try {
        const type = req.query.type as string;
        const limit = parseInt(req.query.limit as string) || 20;
        const offset = parseInt(req.query.offset as string) || 0;

        let query = `
            SELECT id, type, name, input_prompt, quality_score, dimensions, created_at
            FROM golden_examples
        `;
        const params: unknown[] = [];

        if (type) {
            query += ` WHERE type = $1`;
            params.push(type);
        }

        query += ` ORDER BY quality_score DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
        params.push(limit, offset);

        const result = await pool.query(query, params);

        res.json({
            success: true,
            data: result.rows,
            pagination: {
                limit,
                offset,
                hasMore: result.rows.length === limit
            }
        });
    } catch (error: unknown) {
    const err = error as Error;
        logger.error('[QualityDashboard] Failed to list golden examples:', error);
        res.status(500).json({
            success: false,
            error: err.message
        });
    }
});

// ============================================================================
// QUALITY PROOF (Full Report)
// ============================================================================

/**
 * POST /api/quality/proof/run
 *
 * Run full quality proof (for investor reports, etc.)
 */
router.post('/proof/run', async (req: Request, res: Response) => {
    try {
        const testCount = parseInt(req.body.testCount) || 10;
        const temporalDays = parseInt(req.body.temporalDays) || 30;

        // This is expensive - run async
        res.json({
            success: true,
            message: 'Quality proof started. This may take several minutes.',
            estimatedTime: `${testCount * 45}s`
        });

        // Run in background and store result
        qualityProofService.runFullProof({
            blindTestCount: testCount,
            temporalDays
        })
            .then(async (report) => {
                // Store the report
                await pool.query(`
                    INSERT INTO quality_proof_reports (report, created_at)
                    VALUES ($1, NOW())
                `, [JSON.stringify(report)]);

                logger.info('[QualityDashboard] Quality proof complete', {
                    verdict: report.summary.overallVerdict,
                    winRate: report.summary.arcusWinRate
                });
            })
            .catch(err => {
                logger.error('[QualityDashboard] Quality proof failed', err);
            });

    } catch (error: unknown) {
    const err = error as Error;
        logger.error('[QualityDashboard] Failed to start quality proof:', error);
        res.status(500).json({
            success: false,
            error: err.message
        });
    }
});

/**
 * GET /api/quality/proof/latest
 *
 * Get latest quality proof report
 */
router.get('/proof/latest', async (req: Request, res: Response) => {
    try {
        const result = await pool.query(`
            SELECT report, created_at
            FROM quality_proof_reports
            ORDER BY created_at DESC
            LIMIT 1
        `);

        if (result.rows.length === 0) {
            res.json({
                success: true,
                data: null,
                message: 'No quality proof reports yet. Run POST /api/quality/proof/run'
            });
            return;
        }

        res.json({
            success: true,
            data: result.rows[0].report,
            generatedAt: result.rows[0].created_at
        });
    } catch (error: unknown) {
    const err = error as Error;
        logger.error('[QualityDashboard] Failed to get proof report:', error);
        res.status(500).json({
            success: false,
            error: err.message
        });
    }
});

// ============================================================================
// SUMMARY ENDPOINT
// ============================================================================

/**
 * GET /api/quality/summary
 *
 * Get a complete quality summary for the dashboard
 */
router.get('/summary', async (req: Request, res: Response) => {
    try {
        // Get all data in parallel
        const [metrics, health, benchmark] = await Promise.all([
            qualityGateService.getQualityMetrics('7d'),
            pool.query(`SELECT * FROM quality_health_checks ORDER BY created_at DESC LIMIT 1`),
            pool.query(`SELECT * FROM quality_benchmarks ORDER BY created_at DESC LIMIT 1`)
        ]);

        res.json({
            success: true,
            data: {
                metrics,
                health: health.rows[0] || null,
                benchmark: benchmark.rows[0] || null,
                qualitySystem: {
                    status: 'active',
                    features: [
                        'Built-in quality gates on every generation',
                        'Auto-retry with feedback for low-quality outputs',
                        'Client preference learning',
                        'Daily health checks',
                        'Weekly golden benchmarks'
                    ]
                }
            }
        });
    } catch (error: unknown) {
    const err = error as Error;
        logger.error('[QualityDashboard] Failed to get summary:', error);
        res.status(500).json({
            success: false,
            error: err.message
        });
    }
});

export default router;
