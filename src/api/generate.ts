import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requireOrganization } from '../middleware/multiTenancy.js';
import { generateDeliverables } from '../services/generationService.js';
import { logger } from '../utils/logger.js';
import { requireCredits } from '../middleware/credits.js';
import { CREDIT_COSTS } from '../services/creditService.js';
import { evaluateDeliverable, QualityResult } from '../services/qualityService.js';
import { runHardValidators, ValidatorResult } from '../services/validators.js';
import { quickFactCheck, factCheckContent, FactCheckReport } from '../services/factCheckService.js';
import { magicOrchestrator } from '../services/magicOrchestrator.js';
import { pipelineJobService } from '../services/pipelineJobService.js';
import { auditService } from '../services/auditService.js';
import { memoryService } from '../services/memoryService.js';

const router = Router();

/**
 * POST /api/generate/brief
 * Submit a creative brief for generation - requires authentication (SEC-001 fix)
 * This is an alias that routes to the magic orchestrator
 *
 * **IMPORTANT**: Now uses async job execution by default to prevent timeouts.
 */
router.post('/brief', requireAuth, requireOrganization, requireCredits(CREDIT_COSTS.GENERATE_DELIVERABLE || 10, 'brief_generation'), async (req: Request, res: Response) => {
    try {
        const { brief, context, sync } = req.body;

        if (!brief || typeof brief !== 'string') {
            return res.status(400).json({
                error: {
                    code: 'INVALID_INPUT',
                    message: 'Brief is required and must be a string'
                }
            });
        }

        const user = req.user!;
        const organizationId = (user as any).organizationId;

        // Set credit headers early
        if (res.locals?.newBalance !== undefined) {
            res.set('X-Credits-Remaining', String(res.locals.newBalance));
            res.set('X-Credits-Deducted', String(res.locals.creditsDeducted || 0));
        }

        // =====================================================================
        // ASYNC EXECUTION (DEFAULT) - No timeout issues!
        // =====================================================================
        if (sync !== true) {
            logger.info(`[Brief] Creating async job for ${user.id}: "${brief.substring(0, 100)}..."`);

            const { jobId, estimatedDurationMs } = await pipelineJobService.createJob(
                {
                    request: brief,
                    context: { ...context, organizationId },
                },
                user.id,
                organizationId
            );

            return res.status(202).json({
                success: true,
                async: true,
                jobId,
                statusUrl: `/api/jobs/pipeline/${jobId}`,
                streamUrl: `/api/jobs/pipeline/${jobId}/stream`,
                estimatedDurationMs,
                message: 'Brief processing started. Poll statusUrl for results.',
            });
        }

        // =====================================================================
        // SYNC EXECUTION (Legacy - only if explicitly requested)
        // =====================================================================
        logger.warn(`[Brief] Sync execution requested - may timeout for complex briefs`);
        logger.info(`[Brief] Processing brief from ${user.id}: "${brief.substring(0, 100)}..."`);

        // Initialize and route through magic orchestrator
        await magicOrchestrator.initialize();
        const result = await magicOrchestrator.execute({
            request: brief,
            context: { ...context, userId: user.id }
        });

        if (!result.success) {
            return res.status(422).json({
                success: false,
                async: false,
                error: { code: 'GENERATION_FAILED', message: result.error || 'Brief processing failed' }
            });
        }

        res.json({
            success: true,
            async: false,
            routing: result.routing,
            deliverables: result.deliverables
        });
    } catch (error: unknown) {
    const err = error as Error;
        logger.error('[Brief] Error:', error);
        res.status(500).json({
            error: { code: 'BRIEF_FAILED', message: err.message || 'Brief processing failed' }
        });
    }
});

// Quality thresholds
const QUALITY_PASS_THRESHOLD = 75; // Practical minimum for enterprise
const MAX_RETRIES = 2;

/**
 * @deprecated This endpoint bypasses the agent hierarchy and should not be used.
 * Use POST /api/generate/magic instead, which properly routes through department pipelines.
 *
 * This endpoint will be removed in a future version.
 */
router.post('/deliverables', requireAuth, requireOrganization, requireCredits(CREDIT_COSTS.GENERATE_DELIVERABLE, 'generate_deliverable'), async (req: Request, res: Response) => {
    // DEPRECATED - This endpoint bypasses the typed agent hierarchy
    // Prefer /api/generate/magic which routes through Chief→Director→Associate
    logger.warn('[DEPRECATED] /api/generate/deliverables called - consider using /api/generate/magic instead', {
        userId: req.user?.id,
        agent: req.body.agent,
        brief: req.body.brief?.substring(0, 100)
    });

    // Set deprecation headers but still execute
    res.set('Deprecation', 'true');
    res.set('Sunset', '2025-06-01');
    res.set('Link', '</api/generate/magic>; rel="successor-version"');

    try {
        const { agent, brief, context } = req.body;

        if (!agent || !brief) {
            return res.status(400).json({
                error: {
                    code: 'INVALID_INPUT',
                    message: 'Agent and brief are required. NOTE: This endpoint is deprecated, use /api/generate/magic instead.'
                }
            });
        }

        const user = req.user!;
        const projectContext = {
            ...(context || {}),
            clientId: user.id,
            brandGuidelines: context?.brandGuidelines,
            targetAudience: context?.targetAudience,
            campaignObjective: context?.campaignObjective,
            platforms: context?.platforms,
            industry: context?.industry
        };

        let attempt = 0;
        let deliverables: unknown[] = [];
        let usage: any = undefined;
        let qualityResults: Array<{
            deliverable: any;
            validationResults: ValidatorResult[];
            qualityScore: QualityResult;
            passed: boolean;
        }> = [];
        let qualityFeedback: string | undefined;

        // Quality validation loop with retries
        while (attempt <= MAX_RETRIES) {
            logger.info(`Generation attempt ${attempt + 1}/${MAX_RETRIES + 1}`, { agent, hasQualityFeedback: !!qualityFeedback });

            const result = await generateDeliverables(agent, brief, projectContext, qualityFeedback);
            deliverables = result.deliverables;
            usage = result.usage;

            // Validate each deliverable
            qualityResults = await Promise.all(
                deliverables.map(async (d: any) => {
                    // Run hard validators (structure, length, type-specific)
                    const validationResults = await runHardValidators(d, projectContext);
                    const hardValidationPassed = validationResults.every(v => v.pass);

                    // Run quality evaluation (LLM-based scoring)
                    const qualityScore = await evaluateDeliverable(d, projectContext);

                    const passed = hardValidationPassed && qualityScore.score >= QUALITY_PASS_THRESHOLD;

                    return {
                        deliverable: d,
                        validationResults,
                        qualityScore,
                        passed
                    };
                })
            );

            // Check if all deliverables pass
            const allPass = qualityResults.every(r => r.passed);

            if (allPass) {
                logger.info('All deliverables passed quality validation', {
                    attempt: attempt + 1,
                    avgScore: qualityResults.reduce((sum, r) => sum + r.qualityScore.score, 0) / qualityResults.length
                });
                break;
            }

            // Build feedback for retry
            if (attempt < MAX_RETRIES) {
                const failedItems = qualityResults.filter(r => !r.passed);
                qualityFeedback = buildQualityFeedback(failedItems);
                logger.warn('Quality validation failed, retrying with feedback', {
                    attempt: attempt + 1,
                    failedCount: failedItems.length,
                    feedback: qualityFeedback.substring(0, 500)
                });
            }

            attempt++;
        }

        // Set credit headers
        if (res.locals?.newBalance !== undefined) {
            res.set('X-Credits-Remaining', String(res.locals.newBalance));
            res.set('X-Credits-Deducted', String(res.locals.creditsDeducted || 0));
        }

        // Set usage headers
        if (usage) {
            const u: any = usage as any;
            const summary = [{
                provider: 'anthropic',
                model: u.model || 'unknown',
                input_tokens: u.inputTokens ?? u.input_tokens ?? 0,
                output_tokens: u.outputTokens ?? u.output_tokens ?? 0,
                cost_usd: u.costUsd ?? u.cost_usd ?? 0
            }];
            const total = summary.reduce((s, u) => s + (u.cost_usd || 0), 0);
            res.set('X-Usage-Cost-USD', total.toFixed(6));
            res.set('X-Usage-Summary', JSON.stringify(summary));
        }

        // Set quality headers
        const avgScore = qualityResults.length > 0
            ? qualityResults.reduce((sum, r) => sum + r.qualityScore.score, 0) / qualityResults.length
            : 0;
        const allPassed = qualityResults.every(r => r.passed);
        res.set('X-Quality-Score', avgScore.toFixed(1));
        res.set('X-Quality-Status', allPassed ? 'passed' : 'degraded');
        res.set('X-Generation-Attempts', String(attempt + 1));

        // Run fact-checking on content types that benefit from it
        let factCheckResults: Array<{
            deliverableIndex: number;
            quickCheck: Awaited<ReturnType<typeof quickFactCheck>>;
            fullReport?: FactCheckReport;
        }> = [];

        const factCheckEnabled = req.body.factCheck !== false; // Default enabled
        const typesToFactCheck = ['blog', 'article', 'whitepaper', 'case_study', 'landing_page', 'ad_copy'];

        if (factCheckEnabled) {
            const factCheckPromises = deliverables.map(async (d: any, index: number) => {
                // Only fact-check content types that typically contain verifiable claims
                if (!typesToFactCheck.includes(d.type?.toLowerCase())) {
                    return null;
                }

                const content = d.content || d.body || '';
                if (content.length < 100) return null;

                // Always do quick check
                const quickCheck = await quickFactCheck(content);

                // Do full check if quick check suggests it's needed and runFullFactCheck is requested
                let fullReport: FactCheckReport | undefined;
                if (quickCheck.suggestedReview && req.body.runFullFactCheck) {
                    fullReport = await factCheckContent(content, {
                        maxClaimsToCheck: 5,
                        industryContext: projectContext.industry,
                        companyContext: projectContext.brandGuidelines?.companyName
                    });
                }

                return { deliverableIndex: index, quickCheck, fullReport };
            });

            const results = await Promise.all(factCheckPromises);
            factCheckResults = results.filter(Boolean) as typeof factCheckResults;
        }

        // Return deliverables with quality metadata and fact-check results
        res.json({
            deliverables,
            quality: {
                overallScore: Math.round(avgScore),
                passed: allPassed,
                attempts: attempt + 1,
                details: qualityResults.map(r => ({
                    type: r.deliverable.type,
                    title: r.deliverable.title,
                    score: r.qualityScore.score,
                    passed: r.passed,
                    reasons: r.qualityScore.reasons,
                    suggestions: r.qualityScore.suggestions,
                    validationErrors: r.validationResults.filter(v => !v.pass).map(v => ({
                        validator: v.name,
                        details: v.details
                    }))
                }))
            },
            factCheck: factCheckResults.length > 0 ? {
                checked: true,
                results: factCheckResults.map(fc => ({
                    deliverableIndex: fc.deliverableIndex,
                    hasStatistics: fc.quickCheck.hasStatistics,
                    hasRegulatoryClamas: fc.quickCheck.hasRegulatoryClamas,
                    hasComparisonClaims: fc.quickCheck.hasComparisonClaims,
                    suggestedReview: fc.quickCheck.suggestedReview,
                    flaggedPhrases: fc.quickCheck.flaggedPhrases,
                    fullReport: fc.fullReport ? {
                        overallScore: fc.fullReport.overallScore,
                        totalClaims: fc.fullReport.totalClaims,
                        verifiedClaims: fc.fullReport.verifiedClaims,
                        disputedClaims: fc.fullReport.disputedClaims,
                        recommendations: fc.fullReport.recommendations
                    } : undefined
                }))
            } : { checked: false }
        });
    } catch (error: unknown) {
    const err = error as Error;
        logger.error('Generation error:', error);
        res.status(500).json({
            error: {
                code: 'GENERATION_FAILED',
                message: 'Failed to generate deliverables'
            }
        });
    }
});

/**
 * Build quality feedback string for retry attempts
 */
function buildQualityFeedback(failedItems: Array<{
    deliverable: any;
    validationResults: ValidatorResult[];
    qualityScore: QualityResult;
}>): string {
    const feedbackParts: string[] = [];

    for (const item of failedItems) {
        const issues: string[] = [];

        // Add validation failures
        for (const v of item.validationResults) {
            if (!v.pass) {
                issues.push(`[${v.name}] ${JSON.stringify(v.details)}`);
            }
        }

        // Add quality suggestions
        if (item.qualityScore.suggestions?.length > 0) {
            issues.push(...item.qualityScore.suggestions);
        }

        // Add quality reasons for low score
        if (item.qualityScore.reasons?.length > 0 && item.qualityScore.score < QUALITY_PASS_THRESHOLD) {
            issues.push(...item.qualityScore.reasons);
        }

        if (issues.length > 0) {
            feedbackParts.push(
                `## Issues with "${item.deliverable.title || item.deliverable.type}":\n` +
                issues.map(i => `- ${i}`).join('\n')
            );
        }
    }

    return feedbackParts.join('\n\n');
}

/**
 * POST /api/generate/calendar
 * Generate a content calendar from a brief
 */
router.post('/calendar', requireAuth, requireOrganization, requireCredits(CREDIT_COSTS.GENERATE_DELIVERABLE || 5, 'calendar_generation'), async (req: Request, res: Response) => {
    try {
        const { brief, startDate, endDate, platforms, frequency } = req.body;
        const user = req.user!;
        const organizationId = (user as any).organizationId;

        if (!brief) {
            return res.status(400).json({
                error: {
                    code: 'INVALID_INPUT',
                    message: 'Brief is required'
                }
            });
        }

        logger.info('[Calendar] Generating content calendar', {
            userId: user.id,
            organizationId,
            platforms,
            frequency
        });

        // Use magic orchestrator to generate calendar
        await magicOrchestrator.initialize();
        const result = await magicOrchestrator.execute({
            request: `Generate a content calendar: ${brief}. Start: ${startDate || 'next week'}, End: ${endDate || 'in 3 months'}, Platforms: ${platforms?.join(', ') || 'all'}, Frequency: ${frequency || 'weekly'}`,
            context: {
                organizationId,
                intent: 'calendar',
                calendarParams: { startDate, endDate, platforms, frequency }
            } as any
        });

        res.json({
            success: true,
            calendar: result.deliverables,
            routing: result.routing
        });
    } catch (error: unknown) {
    const err = error as Error;
        logger.error('[Calendar] Generation failed', { error: err.message });
        res.status(500).json({
            error: {
                code: 'GENERATION_FAILED',
                message: err.message
            }
        });
    }
});

/**
 * POST /api/generate/analysis
 * Generate analysis/insights from data or content
 */
router.post('/analysis', requireAuth, requireOrganization, requireCredits(CREDIT_COSTS.GENERATE_DELIVERABLE || 3, 'analysis_generation'), async (req: Request, res: Response) => {
    try {
        const { content, dataUrl, analysisType } = req.body;
        const user = req.user!;
        const organizationId = (user as any).organizationId;

        if (!content && !dataUrl) {
            return res.status(400).json({
                error: {
                    code: 'INVALID_INPUT',
                    message: 'Content or dataUrl is required'
                }
            });
        }

        logger.info('[Analysis] Generating analysis', {
            userId: user.id,
            organizationId,
            analysisType: analysisType || 'general'
        });

        // Use magic orchestrator to generate analysis
        await magicOrchestrator.initialize();
        const result = await magicOrchestrator.execute({
            request: `Analyze this ${analysisType || 'content'}: ${content || `Data from ${dataUrl}`}`,
            context: {
                organizationId,
                intent: 'analysis',
                analysisParams: { analysisType, dataUrl }
            } as any
        });

        res.json({
            success: true,
            analysis: result.deliverables,
            routing: result.routing
        });
    } catch (error: unknown) {
    const err = error as Error;
        logger.error('[Analysis] Generation failed', { error: err.message });
        res.status(500).json({
            error: {
                code: 'GENERATION_FAILED',
                message: err.message
            }
        });
    }
});

// ============================================================================
// MAGIC ORCHESTRATOR ENDPOINT
// ============================================================================

/**
 * POST /api/generate/magic
 *
 * The "magic" endpoint that accepts any natural language request and
 * automatically routes it to the correct department pipeline.
 *
 * This is the unified frontend entry point for all content generation.
 *
 * **IMPORTANT**: This endpoint now uses async job execution by default to
 * eliminate timeout issues. The response includes a jobId for tracking progress.
 *
 * Request body:
 * - request: string (required) - Natural language description of what to create
 * - context: object (optional) - Brand context, target audience, etc.
 *   - brandContext: { name, industry, voiceTone, colors, targetAudience, guidelines }
 *   - campaignId: string
 *   - projectId: string
 * - sync: boolean (optional) - Force synchronous execution (NOT recommended, may timeout)
 *
 * Response (async mode - default):
 * - success: true
 * - async: true
 * - jobId: string - Use this to poll /api/jobs/pipeline/:jobId for results
 * - statusUrl: string - URL to poll for status
 * - streamUrl: string - URL for SSE progress stream
 * - estimatedDurationMs: number - Estimated completion time
 *
 * Response (sync mode - legacy, may timeout):
 * - success: true
 * - async: false
 * - routing: object
 * - deliverables: array
 */
router.post('/magic', requireAuth, requireOrganization, requireCredits(CREDIT_COSTS.GENERATE_DELIVERABLE || 10, 'magic_generation'), async (req: Request, res: Response) => {
    try {
        const { request, context, hints, sync } = req.body;

        if (!request || typeof request !== 'string') {
            return res.status(400).json({
                error: {
                    code: 'INVALID_INPUT',
                    message: 'Request is required and must be a string'
                }
            });
        }

        const user = req.user!;
        const organizationId = (user as any).organizationId;

        // Set credit headers early
        if (res.locals?.newBalance !== undefined) {
            res.set('X-Credits-Remaining', String(res.locals.newBalance));
            res.set('X-Credits-Deducted', String(res.locals.creditsDeducted || 0));
        }

        // =====================================================================
        // ASYNC EXECUTION (DEFAULT) - No timeout issues, ever!
        // =====================================================================
        if (sync !== true) {
            logger.info(`[Magic] Creating async job for ${user.id}: "${request.substring(0, 100)}..."`);

            const { jobId, estimatedDurationMs } = await pipelineJobService.createJob(
                {
                    request,
                    context: {
                        ...context,
                        organizationId,
                    },
                    hints,
                },
                user.id,
                organizationId
            );

            // Return immediately with job info
            return res.status(202).json({
                success: true,
                async: true,
                jobId,
                statusUrl: `/api/jobs/pipeline/${jobId}`,
                streamUrl: `/api/jobs/pipeline/${jobId}/stream`,
                estimatedDurationMs,
                message: 'Pipeline job started. Poll statusUrl for results or connect to streamUrl for real-time progress.',
            });
        }

        // =====================================================================
        // SYNC EXECUTION (Legacy - only if explicitly requested)
        // WARNING: May timeout for complex requests!
        // =====================================================================
        logger.warn(`[Magic] Sync execution requested by ${user.id} - may timeout for complex requests`);
        logger.info(`[Magic] Processing request from ${user.id}: "${request.substring(0, 100)}..."`);

        // Initialize the magic orchestrator if needed
        await magicOrchestrator.initialize();

        // Execute the magic orchestration
        const result = await magicOrchestrator.execute({
            request,
            context: {
                ...context,
                userId: user.id,
            },
            hints,
        });

        // Set routing headers
        res.set('X-Magic-Department', result.routing.primaryDepartment);
        res.set('X-Magic-Confidence', result.routing.confidence.toFixed(2));
        res.set('X-Magic-Departments', result.routing.departments.join(','));

        if (!result.success) {
            return res.status(422).json({
                success: false,
                async: false,
                error: {
                    code: 'GENERATION_FAILED',
                    message: result.error || 'Magic generation failed'
                },
                routing: {
                    primaryDepartment: result.routing.primaryDepartment,
                    departments: result.routing.departments,
                    deliverableTypes: result.routing.deliverableTypes,
                    intent: result.routing.intent,
                    confidence: result.routing.confidence
                }
            });
        }

        // DATA MOAT: Record generation interaction for learning (non-blocking)
        if (result.success && result.deliverables && result.deliverables.length > 0) {
            setImmediate(async () => {
                try {
                    // Log generation event to audit trail
                    await auditService.log({
                        eventType: 'generation.magic_complete',
                        category: 'deliverable',
                        action: 'generate',
                        description: `Magic generation completed: ${result.routing.primaryDepartment} department`,
                        actorId: user.id,
                        actorType: 'user',
                        organizationId,
                        entityType: 'generation',
                        metadata: {
                            department: result.routing.primaryDepartment,
                            departments: result.routing.departments,
                            deliverableTypes: result.routing.deliverableTypes,
                            deliverableCount: result.deliverables?.length || 0,
                            intent: result.routing.intent,
                            confidence: result.routing.confidence
                        },
                        ipAddress: req.ip,
                        userAgent: req.get('user-agent')
                    });

                    // Record each deliverable generation for memory system
                    for (const deliverable of result.deliverables || []) {
                        await memoryService.recordInteraction({
                            organizationId,
                            interactionType: 'generation',
                            outcome: 'iterated', // Initial generation, waiting for approval
                            deliverableId: deliverable.id,
                            originalContent: typeof deliverable.content === 'string' ? deliverable.content : JSON.stringify(deliverable.content),
                            userId: user.id,
                            deliverableType: deliverable.type
                        });
                    }
                } catch (error: unknown) {
    const err = error as Error;
                    logger.warn('[Magic] Failed to record generation data', { error });
                }
            });
        }

        // Return successful result
        res.json({
            success: true,
            async: false,
            strategicPlan: result.routing.strategicPlan,
            routing: {
                primaryDepartment: result.routing.primaryDepartment,
                departments: result.routing.departments,
                deliverableTypes: result.routing.deliverableTypes,
                intent: result.routing.intent,
                tasks: result.routing.tasks,
                confidence: result.routing.confidence,
                reasoning: result.routing.reasoning,
                strategicPlan: result.routing.strategicPlan
            },
            deliverables: result.deliverables,
            pipelineResults: result.pipelineResults.map(pr => ({
                department: pr.department,
                success: pr.result?.success || false,
                deliverableCount: pr.result?.deliverables?.length || 0
            })),
            trace: {
                startTime: result.trace?.startTime,
                stages: result.trace?.stages?.map(s => ({
                    name: s.name,
                    status: s.status,
                    durationMs: s.durationMs
                }))
            }
        });

    } catch (error: unknown) {
    const err = error as Error;
        logger.error('[Magic] Error:', error);
        res.status(500).json({
            success: false,
            error: {
                code: 'MAGIC_FAILED',
                message: err.message || 'Magic orchestration failed'
            }
        });
    }
});

/**
 * POST /api/generate/magic/analyze
 *
 * Analyze a request WITHOUT executing it.
 * Returns routing analysis and estimated work breakdown.
 * Useful for showing the user what will happen before execution.
 */
router.post('/magic/analyze', requireAuth, requireOrganization, async (req: Request, res: Response) => {
    try {
        const { request, context } = req.body;

        if (!request || typeof request !== 'string') {
            return res.status(400).json({
                error: {
                    code: 'INVALID_INPUT',
                    message: 'Request is required and must be a string'
                }
            });
        }

        // Initialize the magic orchestrator if needed
        await magicOrchestrator.initialize();

        // Analyze without executing
        const analysis = await magicOrchestrator.analyzeRequest(request, context);

        res.json({
            success: true,
            analysis: {
                primaryDepartment: analysis.primaryDepartment,
                departments: analysis.departments,
                deliverableTypes: analysis.deliverableTypes,
                intent: analysis.intent,
                tasks: analysis.tasks,
                confidence: analysis.confidence,
                reasoning: analysis.reasoning,
                estimatedAgents: analysis.tasks?.length || 1,
                estimatedTime: estimateExecutionTime(analysis)
            }
        });

    } catch (error: unknown) {
    const err = error as Error;
        logger.error('[Magic Analyze] Error:', error);
        res.status(500).json({
            success: false,
            error: {
                code: 'ANALYSIS_FAILED',
                message: err.message || 'Request analysis failed'
            }
        });
    }
});

/**
 * Estimate execution time based on analysis
 */
function estimateExecutionTime(analysis: any): string {
    const taskCount = analysis.tasks?.length || 1;
    const departments = analysis.departments?.length || 1;

    // Base estimates in seconds
    const baseTime = 10;
    const perTask = 5;
    const perDepartment = 8;

    const totalSeconds = baseTime + (taskCount * perTask) + (departments * perDepartment);

    if (totalSeconds < 60) {
        return `~${totalSeconds}s`;
    } else {
        return `~${Math.ceil(totalSeconds / 60)}m`;
    }
}

export default router;
