/**
 * Autonomous Runtime API Routes
 *
 * These endpoints expose the new autonomous agent runtime.
 * They allow clients to:
 * - Submit briefs for intelligent processing
 * - Start autonomous workflows
 * - Monitor workflow progress
 * - Review and approve work
 * - Access agent learning/memory
 */

import { Router, Request, Response } from 'express';
import { logger } from '../utils/logger.js';
import { requireAuth } from '../middleware/auth.js';
import {
    workflowEngine,
    intakeService,
    memoryService,
    SupervisorAgent,
} from '../services/runtime/index.js';
import { pool } from '../database/db.js';

const router = Router();

// ============================================================================
// BRIEF PROCESSING
// ============================================================================

/**
 * POST /api/autonomous/brief
 * Process a brief like an agency account manager
 */
router.post('/brief', requireAuth, async (req: Request, res: Response) => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        const { goal, clientId, projectId, additionalContext, platforms, budget, timeline } = req.body;

        if (!goal) {
            return res.status(400).json({ error: 'Goal is required' });
        }

        logger.info(`[API] Processing brief for user ${userId}: ${goal.substring(0, 50)}...`);

        const processedBrief = await intakeService.processBrief({
            goal,
            clientId,
            projectId,
            additionalContext,
            platforms,
            budget,
            timeline,
        });

        // Store the processed brief
        await pool.query(
            `INSERT INTO processed_briefs (client_id, original_goal, enriched_brief, scope, clarification_questions, research, recommendations, confidence, status)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'draft')
             RETURNING id`,
            [
                clientId || userId,
                goal,
                JSON.stringify(processedBrief.enrichedBrief),
                JSON.stringify(processedBrief.scope),
                JSON.stringify(processedBrief.clarificationQuestions),
                JSON.stringify(processedBrief.research),
                JSON.stringify(processedBrief.recommendations),
                processedBrief.confidence,
            ]
        );

        res.json({
            success: true,
            brief: processedBrief,
            hasQuestions: processedBrief.clarificationQuestions.length > 0,
        });

    } catch (error: unknown) {
    const err = error as Error;
        logger.error('[API] Brief processing failed:', error);
        res.status(500).json({ error: err.message });
    }
});

/**
 * POST /api/autonomous/brief/:briefId/answers
 * Submit answers to clarification questions
 */
router.post('/brief/:briefId/answers', requireAuth, async (req: Request, res: Response) => {
    try {
        const { briefId } = req.params;
        const { answers } = req.body;

        // Get the existing brief
        const { rows } = await pool.query(
            `SELECT * FROM processed_briefs WHERE id = $1`,
            [briefId]
        );

        if (rows.length === 0) {
            return res.status(404).json({ error: 'Brief not found' });
        }

        const existingBrief = rows[0];

        // Continue processing with answers
        const processedBrief = {
            originalGoal: existingBrief.original_goal,
            enrichedBrief: existingBrief.enriched_brief,
            scope: existingBrief.scope,
            clarificationQuestions: existingBrief.clarification_questions,
            research: existingBrief.research,
            recommendations: existingBrief.recommendations,
            processedAt: existingBrief.created_at,
            confidence: existingBrief.confidence,
        };

        const updatedBrief = await intakeService.continueBriefWithAnswers(processedBrief as any, answers);

        // Update the stored brief
        await pool.query(
            `UPDATE processed_briefs
             SET enriched_brief = $1, clarification_questions = $2, confidence = $3, status = 'approved', updated_at = NOW()
             WHERE id = $4`,
            [
                JSON.stringify(updatedBrief.enrichedBrief),
                JSON.stringify(updatedBrief.clarificationQuestions),
                updatedBrief.confidence,
                briefId,
            ]
        );

        res.json({
            success: true,
            brief: updatedBrief,
        });

    } catch (error: unknown) {
    const err = error as Error;
        logger.error('[API] Brief answer processing failed:', error);
        res.status(500).json({ error: err.message });
    }
});

// ============================================================================
// WORKFLOW EXECUTION
// ============================================================================

/**
 * POST /api/autonomous/workflow
 * Start a new autonomous workflow
 */
router.post('/workflow', requireAuth, async (req: Request, res: Response) => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        const { goal, projectId, briefId, context } = req.body;

        if (!goal) {
            return res.status(400).json({ error: 'Goal is required' });
        }

        logger.info(`[API] Starting autonomous workflow for user ${userId}`);

        // If briefId provided, get the processed brief context
        let briefContext = context || {};
        if (briefId) {
            const { rows } = await pool.query(
                `SELECT * FROM processed_briefs WHERE id = $1`,
                [briefId]
            );

            if (rows.length > 0) {
                const brief = rows[0];
                briefContext = {
                    ...briefContext,
                    enrichedBrief: brief.enriched_brief,
                    scope: brief.scope,
                    research: brief.research,
                    recommendations: brief.recommendations,
                };

                // Update brief status
                await pool.query(
                    `UPDATE processed_briefs SET status = 'executing', campaign_id = $1, updated_at = NOW() WHERE id = $2`,
                    [projectId, briefId]
                );
            }
        }

        const workflowState = await workflowEngine.startWorkflow(
            userId,
            projectId,
            goal,
            briefContext
        );

        res.json({
            success: true,
            workflow: {
                id: workflowState.id,
                status: workflowState.status,
                taskCount: workflowState.tasks.length,
                intelligence: workflowState.intelligence,
            },
        });

    } catch (error: unknown) {
    const err = error as Error;
        logger.error('[API] Workflow start failed:', error);
        res.status(500).json({ error: err.message });
    }
});

/**
 * GET /api/autonomous/workflow/:workflowId
 * Get workflow status and progress
 */
router.get('/workflow/:workflowId', requireAuth, async (req: Request, res: Response) => {
    try {
        const { workflowId } = req.params;

        const workflowState = await workflowEngine.getWorkflowState(workflowId);

        if (!workflowState) {
            return res.status(404).json({ error: 'Workflow not found' });
        }

        // Calculate progress
        const completedTasks = workflowState.tasks.filter(t => t.status === 'completed').length;
        const totalTasks = workflowState.tasks.length;
        const progress = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

        res.json({
            success: true,
            workflow: {
                ...workflowState,
                progress,
                completedTasks,
                totalTasks,
            },
        });

    } catch (error: unknown) {
    const err = error as Error;
        logger.error('[API] Workflow status failed:', error);
        res.status(500).json({ error: err.message });
    }
});

/**
 * GET /api/autonomous/workflow/:workflowId/tasks
 * Get detailed task information
 */
router.get('/workflow/:workflowId/tasks', requireAuth, async (req: Request, res: Response) => {
    try {
        const { workflowId } = req.params;

        const { rows: tasks } = await pool.query(
            `SELECT t.*,
                    sr.quality_score as supervisor_score,
                    sr.decision as supervisor_decision,
                    sr.feedback as supervisor_feedback
             FROM tasks t
             LEFT JOIN supervisor_reviews sr ON sr.task_id = t.id
             WHERE t.workflow_id = $1
             ORDER BY t.created_at`,
            [workflowId]
        );

        res.json({
            success: true,
            tasks: tasks.map(t => ({
                id: t.id,
                agentId: t.agent_id,
                description: t.input_context,
                status: t.status,
                dependencies: t.dependencies,
                output: t.output_result,
                supervisorScore: t.supervisor_score,
                supervisorDecision: t.supervisor_decision,
                supervisorFeedback: t.supervisor_feedback,
                createdAt: t.created_at,
                updatedAt: t.updated_at,
            })),
        });

    } catch (error: unknown) {
    const err = error as Error;
        logger.error('[API] Task list failed:', error);
        res.status(500).json({ error: err.message });
    }
});

/**
 * POST /api/autonomous/workflow/:workflowId/approve
 * Approve a workflow for client delivery
 */
router.post('/workflow/:workflowId/approve', requireAuth, async (req: Request, res: Response) => {
    try {
        const { workflowId } = req.params;

        await pool.query(
            `UPDATE workflows
             SET status = 'completed', supervisor_approved = true, completed_at = NOW(), updated_at = NOW()
             WHERE id = $1`,
            [workflowId]
        );

        res.json({ success: true, message: 'Workflow approved' });

    } catch (error: unknown) {
    const err = error as Error;
        logger.error('[API] Workflow approval failed:', error);
        res.status(500).json({ error: err.message });
    }
});

/**
 * POST /api/autonomous/workflow/:workflowId/replan
 * Request a replan of the workflow
 */
router.post('/workflow/:workflowId/replan', requireAuth, async (req: Request, res: Response) => {
    try {
        const { workflowId } = req.params;
        const { reason } = req.body;

        await workflowEngine.replanWorkflow(workflowId, reason || 'Manual replan request');

        res.json({ success: true, message: 'Replan initiated' });

    } catch (error: unknown) {
    const err = error as Error;
        logger.error('[API] Workflow replan failed:', error);
        res.status(500).json({ error: err.message });
    }
});

// ============================================================================
// TASK OPERATIONS
// ============================================================================

/**
 * POST /api/autonomous/task/:taskId/approve
 * Approve a specific task
 */
router.post('/task/:taskId/approve', requireAuth, async (req: Request, res: Response) => {
    try {
        const { taskId } = req.params;

        await pool.query(
            `UPDATE tasks SET status = 'completed', updated_at = NOW() WHERE id = $1`,
            [taskId]
        );

        // Get workflow and schedule next tasks
        const { rows } = await pool.query(
            `SELECT workflow_id FROM tasks WHERE id = $1`,
            [taskId]
        );

        if (rows.length > 0) {
            await workflowEngine.scheduleReadyTasks(rows[0].workflow_id, {});
        }

        res.json({ success: true, message: 'Task approved' });

    } catch (error: unknown) {
    const err = error as Error;
        logger.error('[API] Task approval failed:', error);
        res.status(500).json({ error: err.message });
    }
});

/**
 * POST /api/autonomous/task/:taskId/revision
 * Request a revision for a task
 */
router.post('/task/:taskId/revision', requireAuth, async (req: Request, res: Response) => {
    try {
        const { taskId } = req.params;
        const { feedback } = req.body;

        await pool.query(
            `UPDATE tasks
             SET status = 'waiting_for_revision',
                 output_result = COALESCE(output_result, '{}'::jsonb) || $1::jsonb,
                 updated_at = NOW()
             WHERE id = $2`,
            [JSON.stringify({ revisionFeedback: feedback }), taskId]
        );

        res.json({ success: true, message: 'Revision requested' });

    } catch (error: unknown) {
    const err = error as Error;
        logger.error('[API] Task revision request failed:', error);
        res.status(500).json({ error: err.message });
    }
});

// ============================================================================
// AGENT MEMORY & LEARNING
// ============================================================================

/**
 * GET /api/autonomous/agent/:agentId/memory
 * Get agent's learned memory for a client
 */
router.get('/agent/:agentId/memory', requireAuth, async (req: Request, res: Response) => {
    try {
        const { agentId } = req.params;
        const { clientId } = req.query;

        if (!clientId) {
            return res.status(400).json({ error: 'clientId is required' });
        }

        const memory = await memoryService.getRelevantMemories(agentId, clientId as string, '');

        res.json({
            success: true,
            memory,
        });

    } catch (error: unknown) {
    const err = error as Error;
        logger.error('[API] Agent memory retrieval failed:', error);
        res.status(500).json({ error: err.message });
    }
});

/**
 * GET /api/autonomous/agent/:agentId/performance
 * Get agent's performance trends
 */
router.get('/agent/:agentId/performance', requireAuth, async (req: Request, res: Response) => {
    try {
        const { agentId } = req.params;
        const { clientId } = req.query;

        const trends = await memoryService.getPerformanceTrends(agentId, clientId as string | undefined);

        res.json({
            success: true,
            performance: trends,
        });

    } catch (error: unknown) {
    const err = error as Error;
        logger.error('[API] Agent performance retrieval failed:', error);
        res.status(500).json({ error: err.message });
    }
});

/**
 * POST /api/autonomous/agent/:agentId/preference
 * Store a client preference for an agent
 */
router.post('/agent/:agentId/preference', requireAuth, async (req: Request, res: Response) => {
    try {
        const { agentId } = req.params;
        const { clientId, preference, source } = req.body;

        if (!clientId || !preference) {
            return res.status(400).json({ error: 'clientId and preference are required' });
        }

        await memoryService.storeClientPreference(agentId, clientId, preference, source || 'feedback');

        res.json({ success: true, message: 'Preference stored' });

    } catch (error: unknown) {
    const err = error as Error;
        logger.error('[API] Preference storage failed:', error);
        res.status(500).json({ error: err.message });
    }
});

// ============================================================================
// SUPERVISOR OPERATIONS
// ============================================================================

/**
 * POST /api/autonomous/supervisor/review-workflow
 * Trigger a supervisor review of a workflow
 */
router.post('/supervisor/review-workflow', requireAuth, async (req: Request, res: Response) => {
    try {
        const { workflowId } = req.body;

        if (!workflowId) {
            return res.status(400).json({ error: 'workflowId is required' });
        }

        const supervisor = new SupervisorAgent();
        const review = await supervisor.reviewWorkflow(workflowId);

        res.json({
            success: true,
            review,
        });

    } catch (error: unknown) {
    const err = error as Error;
        logger.error('[API] Supervisor review failed:', error);
        res.status(500).json({ error: err.message });
    }
});

/**
 * GET /api/autonomous/supervisor/reviews
 * Get recent supervisor reviews
 */
router.get('/supervisor/reviews', requireAuth, async (req: Request, res: Response) => {
    try {
        const { limit = 20 } = req.query;

        const { rows } = await pool.query(
            `SELECT sr.*, t.input_context as task_description, w.goal as workflow_goal
             FROM supervisor_reviews sr
             JOIN tasks t ON sr.task_id = t.id
             JOIN workflows w ON t.workflow_id = w.id
             ORDER BY sr.reviewed_at DESC
             LIMIT $1`,
            [parseInt(limit as string)]
        );

        res.json({
            success: true,
            reviews: rows,
        });

    } catch (error: unknown) {
    const err = error as Error;
        logger.error('[API] Review list failed:', error);
        res.status(500).json({ error: err.message });
    }
});

// ============================================================================
// ORCHESTRATION INTELLIGENCE
// ============================================================================

/**
 * GET /api/autonomous/intelligence/:workflowId
 * Get orchestration intelligence for a workflow
 */
router.get('/intelligence/:workflowId', requireAuth, async (req: Request, res: Response) => {
    try {
        const { workflowId } = req.params;

        const { rows } = await pool.query(
            `SELECT * FROM orchestration_intelligence WHERE workflow_id = $1`,
            [workflowId]
        );

        if (rows.length === 0) {
            return res.status(404).json({ error: 'Intelligence not found' });
        }

        res.json({
            success: true,
            intelligence: {
                reasoning: rows[0].reasoning,
                discoveries: rows[0].discoveries,
                agentAssignments: rows[0].agent_assignments,
                qualityExpectations: rows[0].quality_expectations,
                createdAt: rows[0].created_at,
            },
        });

    } catch (error: unknown) {
    const err = error as Error;
        logger.error('[API] Intelligence retrieval failed:', error);
        res.status(500).json({ error: err.message });
    }
});

export default router;
