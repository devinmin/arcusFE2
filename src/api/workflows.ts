import { Router, Request, Response } from 'express';
import { orchestrator } from '../services/orchestrator.js';
import { workspaceSessionService } from '../services/workspaceSessionService.js';
import { pool } from '../database/db.js';
import { DeliverableService } from '../services/deliverableService.js';
import { exportService } from '../services/exportService.js';
import { logger } from '../utils/logger.js';
import { requireAuth } from '../middleware/auth.js';
import { requireOrganization } from '../middleware/multiTenancy.js';
import { swarmCoordinator } from '../services/swarmCoordinator.js';
import { DeliverableIterationService } from '../services/deliverableIterationService.js';

const router = Router();

// Start a new workflow
router.post('/', requireAuth, requireOrganization, async (req: Request, res: Response) => {
    try {
        const { goal, projectId: rawProjectId, workspaceSessionId } = req.body || {};
        const userId = (req as any).user.id;

        if (!goal) {
            res.status(400).json({ error: 'Goal is required' });
            return;
        }

        // Optionally load workspace context (Phase 1 follow-up)
        let workspaceContext: any | undefined;
        let projectId = rawProjectId as string | undefined;
        try {
            if (workspaceSessionId) {
                workspaceContext = await workspaceSessionService.buildArcContext(workspaceSessionId);
                // If projectId is not provided, use active campaign from workspace
                if (!projectId && workspaceContext?.activeCampaign?.id) {
                    projectId = workspaceContext.activeCampaign.id;
                }
            }
        } catch (e) {
            // Non-fatal: continue without workspace context
        }

        const result = await orchestrator.startWorkflow(userId, projectId || null, goal, { workspaceContext });
        res.json(result);
    } catch (error: unknown) {
    const err = error as Error;
        res.status(500).json({ error: err.message });
    }
});

// Get strategic proposals (Managing Director)
router.get('/proposals', requireAuth, requireOrganization, async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.id;
        // Always use the authenticated user's ID to prevent IDOR
        const clientId = userId;

        const proposals = await orchestrator.proposeNextSteps(clientId);
        res.json(proposals);
    } catch (error: unknown) {
    const err = error as Error;
        res.status(500).json({ error: err.message });
    }
});

// Get all workflows for user
router.get('/', requireAuth, requireOrganization, async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.id;
        const { limit: rawLimit = '50', offset: rawOffset = '0', status } = req.query;

        // Parse and validate pagination params
        const limit = Math.min(Math.max(1, parseInt(rawLimit as string, 10) || 50), 100);
        const offset = Math.max(0, parseInt(rawOffset as string, 10) || 0);

        // Build query with optional filters
        let query = 'SELECT * FROM workflows WHERE client_id = $1';
        const params: unknown[] = [userId];
        let paramIndex = 2;

        // Filter by status if provided
        if (status) {
            query += ` AND status = $${paramIndex}`;
            params.push(status);
            paramIndex++;
        }

        query += ' ORDER BY created_at DESC';
        query += ` LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
        params.push(limit, offset);

        const { rows } = await pool.query(query, params);

        // Get total count
        let countQuery = 'SELECT COUNT(*) as total FROM workflows WHERE client_id = $1';
        const countParams: unknown[] = [userId];
        if (status) {
            countQuery += ' AND status = $2';
            countParams.push(status);
        }
        const { rows: countRows } = await pool.query(countQuery, countParams);
        const totalCount = parseInt(countRows[0]?.total || '0', 10);

        res.json({
            workflows: rows,
            total: totalCount,
            count: rows.length,
            limit,
            offset,
            hasMore: offset + rows.length < totalCount
        });
    } catch (error: unknown) {
    const err = error as Error;
        res.status(500).json({ error: err.message });
    }
});

// Get workflow details (including tasks)
router.get('/:id', requireAuth, requireOrganization, async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const userId = (req as any).user.id;

        // Get workflow
        const { rows: workflows } = await pool.query(
            'SELECT * FROM workflows WHERE id = $1 AND client_id = $2',
            [id, userId]
        );

        if (workflows.length === 0) {
            res.status(404).json({ error: 'Workflow not found' });
            return;
        }

        // Get tasks
        const { rows: tasks } = await pool.query(
            'SELECT * FROM tasks WHERE workflow_id = $1 ORDER BY created_at ASC',
            [id]
        );

        res.json({
            ...workflows[0],
            tasks
        });
    } catch (error: unknown) {
    const err = error as Error;
        res.status(500).json({ error: err.message });
    }
});

/**
 * GET /api/workflows/tasks/:taskId/deliverables
 * Get deliverables for a specific task
 */
router.get('/tasks/:taskId/deliverables', requireAuth, async (req: Request, res: Response) => {
    try {
const { taskId } = req.params;
        const userId = (req as any).user.id;
        // Verify ownership of task -> workflow
        const { rows } = await pool.query(
            `SELECT t.id FROM tasks t JOIN workflows w ON w.id = t.workflow_id WHERE t.id = $1 AND w.client_id = $2`,
            [taskId, userId]
        );
        if (rows.length === 0) {
            return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Task not found' } });
        }
        const deliverables = await DeliverableService.getDeliverables(taskId);

        res.json({
            success: true,
            deliverables
        });
    } catch (error: unknown) {
    const err = error as Error;
        logger.error('Error fetching deliverables:', error);
        res.status(500).json({
            error: {
                message: err.message || 'Failed to fetch deliverables'
            }
        });
    }
});

/**
 * GET /api/workflows/:id/export
 * Package and export all deliverables for a workflow into a test-run folder
 */
router.get('/:id/export', requireAuth, async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const userId = (req as any).user.id;

        const { rows } = await pool.query(
            'SELECT id FROM workflows WHERE id = $1 AND client_id = $2',
            [id, userId]
        );
        if (rows.length === 0) {
            return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Workflow not found' } });
        }

        const exported = await exportService.exportWorkflow(id);
        res.json({
            success: true,
            outputDir: exported.outputDir,
            manifest: exported.manifestPath,
            scorecard: exported.scorecardPath
        });
    } catch (error: unknown) {
    const err = error as Error;
        logger.error('Error exporting workflow:', error);
        res.status(500).json({ error: { message: err.message || 'Failed to export workflow' } });
    }
});

/**
 * GET /api/workflows/:id/swarm-status
 * Get the current swarm execution status for a workflow
 */
router.get('/:id/swarm-status', requireAuth, async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const userId = (req as any).user.id;

        // Verify ownership
        const { rows } = await pool.query(
            'SELECT id FROM workflows WHERE id = $1 AND client_id = $2',
            [id, userId]
        );
        if (rows.length === 0) {
            return res.status(404).json({ error: 'Workflow not found' });
        }

        const status = await swarmCoordinator.getSwarmStatus(id);
        if (!status) {
            return res.status(404).json({ error: 'Swarm status not found' });
        }

        res.json(status);
    } catch (error: unknown) {
    const err = error as Error;
        logger.error('Error fetching swarm status:', error);
        res.status(500).json({ error: err.message });
    }
});

/**
 * POST /api/workflows/:id/sse-token
 * SEC-005 FIX: Generate short-lived SSE token for EventSource connections
 * EventSource doesn't support Authorization headers, so we generate a one-time token
 */
router.post('/:id/sse-token', requireAuth, async (req: Request, res: Response) => {
    const { id } = req.params;
    const userId = (req as any).user.id;

    try {
        // Verify workflow ownership
        const { rows } = await pool.query(
            'SELECT id FROM workflows WHERE id = $1 AND client_id = $2',
            [id, userId]
        );
        if (rows.length === 0) {
            return res.status(404).json({ error: 'Workflow not found' });
        }

        // Generate short-lived SSE token (valid for 30 seconds)
        const crypto = await import('crypto');
        const sseToken = crypto.randomBytes(32).toString('base64url');

        // Store token in Redis with 30 second TTL
        const { redisClient, isRedisAvailable } = await import('../database/redis.js');
        if (isRedisAvailable()) {
            const key = `sse:${sseToken}`;
            const value = JSON.stringify({ workflowId: id, userId, createdAt: Date.now() });
            await redisClient.setEx(key, 30, value); // 30 second expiry
        }

        res.json({ sseToken });
    } catch (error: unknown) {
    const err = error as Error;
        logger.error('Failed to generate SSE token:', error);
        res.status(500).json({ error: 'Failed to generate SSE token' });
    }
});

/**
 * GET /api/workflows/:id/swarm-status/stream
 * Server-Sent Events stream for real-time swarm updates
 * SEC-005 FIX: Validates short-lived SSE token from query params
 */
router.get('/:id/swarm-status/stream', async (req: Request, res: Response) => {
    const { id } = req.params;
    const sseToken = req.query.sse as string;

    try {
        // SEC-005 FIX: Validate SSE token and extract user info
        let userId: string;

        if (!sseToken) {
            return res.status(401).json({ error: 'Missing SSE token' });
        }

        const { redisClient, isRedisAvailable } = await import('../database/redis.js');
        if (isRedisAvailable()) {
            const key = `sse:${sseToken}`;
            const data = await redisClient.get(key);

            if (!data) {
                return res.status(401).json({ error: 'Invalid or expired SSE token' });
            }

            // Parse token data and delete it (one-time use)
            const tokenData = JSON.parse(data);
            userId = tokenData.userId;

            // Verify workflow ID matches
            if (tokenData.workflowId !== id) {
                return res.status(403).json({ error: 'Token workflow mismatch' });
            }

            // Delete token after use (one-time use)
            await redisClient.del(key);
        } else {
            // Fallback if Redis unavailable - reject for security
            return res.status(503).json({ error: 'SSE service unavailable' });
        }

        // Verify ownership
        const { rows } = await pool.query(
            'SELECT id FROM workflows WHERE id = $1 AND client_id = $2',
            [id, userId]
        );
        if (rows.length === 0) {
            return res.status(404).json({ error: 'Workflow not found' });
        }

        // Set up SSE headers
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering
        res.flushHeaders();

        // Send initial status
        const initialStatus = await swarmCoordinator.getSwarmStatus(id);
        if (initialStatus) {
            res.write(`event: status\ndata: ${JSON.stringify(initialStatus)}\n\n`);
        }

        // Listen for events
        const eventHandler = (event: any) => {
            try {
                res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
            } catch (e) {
                // Client disconnected
            }
        };

        swarmCoordinator.on(`workflow:${id}`, eventHandler);

        // Keep connection alive with heartbeat
        const heartbeat = setInterval(() => {
            try {
                res.write(': heartbeat\n\n');
            } catch (e) {
                clearInterval(heartbeat);
            }
        }, 30000);

        // Cleanup on close
        req.on('close', () => {
            clearInterval(heartbeat);
            swarmCoordinator.off(`workflow:${id}`, eventHandler);
            logger.debug(`SSE connection closed for workflow ${id}`);
        });

    } catch (error: unknown) {
    const err = error as Error;
        logger.error('Error setting up SSE stream:', error);
        res.status(500).json({ error: err.message });
    }
});

/**
 * GET /api/workflows/:id/status
 * Get the current status of a workflow
 * Returns workflow details, task counts, and overall progress
 */
router.get('/:id/status', requireAuth, requireOrganization, async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const userId = (req as any).user.id;

        // Get workflow with ownership check
        const { rows: workflows } = await pool.query(
            'SELECT * FROM workflows WHERE id = $1 AND client_id = $2',
            [id, userId]
        );

        if (workflows.length === 0) {
            return res.status(404).json({ error: 'Workflow not found' });
        }

        const workflow = workflows[0];

        // Get task statistics
        const { rows: taskStats } = await pool.query(
            `SELECT
                status,
                COUNT(*) as count
             FROM tasks
             WHERE workflow_id = $1
             GROUP BY status`,
            [id]
        );

        const stats = {
            total: 0,
            pending: 0,
            in_progress: 0,
            completed: 0,
            failed: 0,
            queued: 0
        };

        for (const row of taskStats) {
            const count = parseInt(row.count, 10);
            stats.total += count;
            if (row.status === 'pending') stats.pending = count;
            else if (row.status === 'in_progress') stats.in_progress = count;
            else if (row.status === 'completed') stats.completed = count;
            else if (row.status === 'failed') stats.failed = count;
            else if (row.status === 'queued') stats.queued = count;
        }

        // Calculate progress percentage
        const progress = stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0;

        // Determine overall status
        let overallStatus = 'unknown';
        if (stats.failed > 0) {
            overallStatus = 'failed';
        } else if (stats.in_progress > 0 || stats.queued > 0) {
            overallStatus = 'in_progress';
        } else if (stats.completed === stats.total && stats.total > 0) {
            overallStatus = 'completed';
        } else if (stats.pending > 0) {
            overallStatus = 'pending';
        }

        res.json({
            id: workflow.id,
            status: workflow.status || overallStatus,
            goal: workflow.goal,
            created_at: workflow.created_at,
            updated_at: workflow.updated_at,
            progress,
            tasks: stats,
            project_id: workflow.project_id
        });
    } catch (error: unknown) {
    const err = error as Error;
        logger.error('Error fetching workflow status:', error);
        res.status(500).json({ error: err.message });
    }
});

/**
 * POST /api/workflows/:id/retry
 * Retry a failed workflow or specific failed tasks
 * Useful for recovering from transient errors
 */
router.post('/:id/retry', requireAuth, requireOrganization, async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const userId = (req as any).user.id;
        const { taskIds } = req.body;

        // Verify workflow ownership
        const { rows: workflows } = await pool.query(
            'SELECT * FROM workflows WHERE id = $1 AND client_id = $2',
            [id, userId]
        );

        if (workflows.length === 0) {
            return res.status(404).json({ error: 'Workflow not found' });
        }

        const workflow = workflows[0];

        // If specific task IDs provided, retry only those
        if (taskIds && Array.isArray(taskIds) && taskIds.length > 0) {
            // Reset failed tasks to pending
            await pool.query(
                `UPDATE tasks
                 SET status = 'pending', updated_at = NOW()
                 WHERE workflow_id = $1 AND id = ANY($2) AND status = 'failed'`,
                [id, taskIds]
            );

            logger.info(`Retrying ${taskIds.length} failed tasks for workflow ${id}`);

            res.json({
                success: true,
                workflow_id: id,
                message: `Retrying ${taskIds.length} tasks`,
                retried_tasks: taskIds
            });
        } else {
            // Retry all failed tasks
            const { rows: failedTasks } = await pool.query(
                'SELECT id FROM tasks WHERE workflow_id = $1 AND status = $2',
                [id, 'failed']
            );

            if (failedTasks.length === 0) {
                return res.status(400).json({
                    error: 'No failed tasks to retry',
                    message: 'This workflow has no failed tasks'
                });
            }

            // Reset failed tasks to pending
            await pool.query(
                `UPDATE tasks
                 SET status = 'pending', updated_at = NOW()
                 WHERE workflow_id = $1 AND status = 'failed'`,
                [id]
            );

            // Update workflow status if it was failed
            if (workflow.status === 'failed') {
                await pool.query(
                    `UPDATE workflows SET status = 'in_progress', updated_at = NOW() WHERE id = $1`,
                    [id]
                );
            }

            logger.info(`Retrying ${failedTasks.length} failed tasks for workflow ${id}`);

            res.json({
                success: true,
                workflow_id: id,
                message: `Retrying ${failedTasks.length} failed tasks`,
                retried_count: failedTasks.length
            });
        }
    } catch (error: unknown) {
    const err = error as Error;
        logger.error('Error retrying workflow:', error);
        res.status(500).json({ error: err.message });
    }
});

/**
 * GET /api/workflows/:id/tasks
 * Get all tasks for a workflow (for ProjectHub kanban)
 *
 * Query params:
 * - department_id: Filter tasks by department
 * - start_date: Filter tasks scheduled on or after this date
 * - end_date: Filter tasks scheduled on or before this date
 * - include_calendar: Include scheduled_date and due_date in response
 */
router.get('/:id/tasks', requireAuth, async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const userId = (req as any).user.id;
        const { department_id, start_date, end_date, include_calendar } = req.query;

        // Verify ownership
        const { rows: workflows } = await pool.query(
            'SELECT id FROM workflows WHERE id = $1 AND client_id = $2',
            [id, userId]
        );
        if (workflows.length === 0) {
            return res.status(404).json({ error: 'Workflow not found' });
        }

        // Build dynamic query with optional filters
        let query = `
            SELECT
                t.id,
                t.agent_id,
                t.status,
                t.input_context as description,
                t.output_result,
                t.created_at,
                t.updated_at,
                t.scheduled_date,
                t.due_date,
                t.department_id,
                t.category
             FROM tasks t
             WHERE t.workflow_id = $1
        `;
        const params: unknown[] = [id];
        let paramIndex = 2;

        // Filter by department
        if (department_id) {
            query += ` AND t.department_id = $${paramIndex}`;
            params.push(department_id);
            paramIndex++;
        }

        // Filter by date range
        if (start_date) {
            query += ` AND (t.scheduled_date >= $${paramIndex} OR t.created_at >= $${paramIndex})`;
            params.push(start_date);
            paramIndex++;
        }
        if (end_date) {
            query += ` AND (t.scheduled_date <= $${paramIndex} OR t.created_at <= $${paramIndex})`;
            params.push(end_date);
            paramIndex++;
        }

        query += ' ORDER BY COALESCE(t.scheduled_date, t.created_at) ASC';

        const { rows: tasks } = await pool.query(query, params);

        // Transform tasks to include title from description or agent_id
        const transformedTasks = tasks.map(t => ({
            id: t.id,
            agent: t.agent_id,
            agent_id: t.agent_id,
            status: t.status,
            title: t.description?.substring(0, 100) || t.agent_id || 'Task',
            description: t.description,
            output_result: t.output_result,
            created_at: t.created_at,
            updated_at: t.updated_at,
            scheduled_date: t.scheduled_date,
            due_date: t.due_date,
            department_id: t.department_id,
            category: t.category || inferCategoryFromAgent(t.agent_id)
        }));

        // Group by status for kanban
        const grouped = {
            todo: transformedTasks.filter(t => t.status === 'pending'),
            inProgress: transformedTasks.filter(t => t.status === 'in_progress' || t.status === 'queued'),
            review: transformedTasks.filter(t => t.status === 'waiting_for_approval'),
            done: transformedTasks.filter(t => t.status === 'completed'),
            failed: transformedTasks.filter(t => t.status === 'failed'),
        };

        // Get department counts
        const departmentCounts: Record<string, number> = {};
        for (const task of transformedTasks) {
            const dept = task.department_id || 'unassigned';
            departmentCounts[dept] = (departmentCounts[dept] || 0) + 1;
        }

        res.json({
            tasks: transformedTasks,
            grouped,
            departmentCounts,
            total: transformedTasks.length,
            filters: {
                department_id: department_id || null,
                start_date: start_date || null,
                end_date: end_date || null
            }
        });
    } catch (error: unknown) {
    const err = error as Error;
        logger.error('Error fetching tasks:', error);
        res.status(500).json({ error: err.message });
    }
});

// Helper to infer category from agent_id for legacy tasks without category
function inferCategoryFromAgent(agentId: string | null): string {
    if (!agentId) return 'tech';
    const agent = agentId.toLowerCase();
    if (agent.includes('research') || agent.includes('strateg')) return 'strategy';
    if (agent.includes('creative') || agent.includes('design') || agent.includes('copy')) return 'creative';
    if (agent.includes('dev') || agent.includes('engineer') || agent.includes('code')) return 'dev';
    return 'tech';
}

/**
 * POST /api/deliverables/:id/iterate
 * Create an iteration based on user feedback (conversational regeneration)
 */
router.post('/deliverables/:id/iterate', requireAuth, requireOrganization, async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { feedback } = req.body;
        const userId = (req as any).user.id;

        if (!feedback || typeof feedback !== 'string') {
            return res.status(400).json({ error: 'Feedback is required' });
        }

        // Verify ownership via task -> workflow chain
        const { rows } = await pool.query(
            `SELECT d.id 
             FROM deliverables d 
             JOIN tasks t ON t.id = d.task_id 
             JOIN workflows w ON w.id = t.workflow_id 
             WHERE d.id = $1 AND w.client_id = $2`,
            [id, userId]
        );
        if (rows.length === 0) {
            return res.status(404).json({ error: 'Deliverable not found' });
        }

        const result = await DeliverableIterationService.createIteration({
            deliverableId: id,
            feedback,
        });

        res.json(result);
    } catch (error: unknown) {
    const err = error as Error;
        logger.error('Error creating iteration:', error);
        res.status(500).json({ error: err.message });
    }
});

/**
 * GET /api/deliverables/:id/iterations
 * Get iteration history for a deliverable
 */
router.get('/deliverables/:id/iterations', requireAuth, async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const userId = (req as any).user.id;

        // Verify ownership
        const { rows } = await pool.query(
            `SELECT d.id 
             FROM deliverables d 
             JOIN tasks t ON t.id = d.task_id 
             JOIN workflows w ON w.id = t.workflow_id 
             WHERE d.id = $1 AND w.client_id = $2`,
            [id, userId]
        );
        if (rows.length === 0) {
            return res.status(404).json({ error: 'Deliverable not found' });
        }

        const iterations = await DeliverableIterationService.getDeliverableIterations(id);
        // Get the actual deliverable type from the query result
        const deliverableType = rows[0]?.type || 'general';
        const suggestions = DeliverableIterationService.getFeedbackSuggestions(deliverableType);

        res.json({ iterations, suggestions });
    } catch (error: unknown) {
    const err = error as Error;
        logger.error('Error fetching iterations:', error);
        res.status(500).json({ error: err.message });
    }
});

/**
 * GET /api/iterations/:id/status
 * Get status of a specific iteration (for polling)
 */
router.get('/iterations/:id/status', requireAuth, async (req: Request, res: Response) => {
    try {
        const { id } = req.params;

        const iteration = await DeliverableIterationService.getIterationStatus(id);
        if (!iteration) {
            return res.status(404).json({ error: 'Iteration not found' });
        }

        res.json(iteration);
    } catch (error: unknown) {
    const err = error as Error;
        logger.error('Error fetching iteration status:', error);
        res.status(500).json({ error: err.message });
    }
});

export const workflowRoutes = router;
