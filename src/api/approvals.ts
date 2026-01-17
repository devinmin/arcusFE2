import { Router, Request, Response } from 'express';
import { pool, executeWithLock } from '../database/db.js';
import { requireAuth } from '../middleware/auth.js';
import { requireOrganization, getOrganizationId, createAuditLog } from '../middleware/multiTenancy.js';
import { logger, auditLogger } from '../utils/logger.js';
import { orchestrator } from '../services/orchestrator.js';
import { recordTaskApproval, recordTaskRejection } from '../services/qualityFeedbackHooks.js';
import { memoryService } from '../services/memoryService.js';
import { isZoFeatureEnabled } from '../config/index.js';
import { learnFromApprovalDecision } from '../services/creativeDirectorIntegration.js';

const router = Router();

/**
 * GET /api/approvals
 * Base route for approvals - requires authentication (SEC-001 fix)
 * Returns pending approvals for the current user
 */
router.get('/', requireAuth, requireOrganization, async (req: Request, res: Response) => {
    try {
        const organizationId = getOrganizationId(req);

        const { rows: tasks } = await pool.query(
            `SELECT t.id, t.agent_id, t.status, t.approval_requested_at, t.updated_at
             FROM tasks t
             JOIN workflows w ON t.workflow_id = w.id
             WHERE w.organization_id = $1
               AND t.status = 'waiting_for_approval'
             ORDER BY t.approval_requested_at ASC NULLS LAST
             LIMIT 50`,
            [organizationId]
        );

        res.json({
            data: { approvals: tasks },
            meta: { timestamp: new Date().toISOString(), total: tasks.length }
        });
    } catch (error: unknown) {
    const err = error as Error;
        logger.error('List approvals error:', error);
        res.status(500).json({
            error: { code: 'INTERNAL_ERROR', message: 'Failed to list approvals' }
        });
    }
});

interface TaskRow {
  id: string;
  workflow_id: string;
  status: string;
  agent_id: string;
  input_context: string;
  approval_requested_at: Date | null;
  approval_deadline: Date | null;
}

interface WorkflowRow {
  organization_id: string;
}

/**
 * POST /api/approvals/tasks/:taskId/approve
 * Approve a task that is waiting for approval
 *
 * SECURITY: Uses row-level locking to prevent race conditions
 */
router.post('/tasks/:taskId/approve', requireAuth, requireOrganization, async (req: Request, res: Response) => {
    try {
        const taskId = req.params.taskId!;
        const organizationId = getOrganizationId(req);
        const userId = req.org?.user.id || req.user!.id;
        const { comments } = req.body;

        if (!organizationId) {
            return res.status(403).json({
                error: {
                    code: 'NO_ORGANIZATION',
                    message: 'Organization context required for approvals'
                }
            });
        }

        // Use row-level locking to prevent race conditions
        const result = await executeWithLock<TaskRow, { success: boolean; workflowId: string }>(
            'tasks',
            'id = $1',
            [taskId],
            async (client, tasks) => {
                if (tasks.length === 0) {
                    throw { status: 404, error: 'Task not found' };
                }

                const task = tasks[0]!;

                // Verify the task belongs to this organization
                const { rows: workflows } = await client.query<WorkflowRow>(
                    `SELECT organization_id FROM workflows WHERE id = $1`,
                    [task.workflow_id]
                );

                const workflow = workflows[0];
                if (!workflow || workflow.organization_id !== organizationId) {
                    auditLogger.warn('Unauthorized approval attempt', {
                        taskId,
                        userId,
                        organizationId,
                        workflowOrgId: workflow?.organization_id
                    });
                    throw { status: 403, error: 'Unauthorized' };
                }

                if (task.status !== 'waiting_for_approval') {
                    throw {
                        status: 400,
                        error: `Task is not waiting for approval (status: ${task.status})`
                    };
                }

                // Record approval with unique constraint to prevent duplicates
                await client.query(
                    `INSERT INTO task_approvals (task_id, client_id, action, comments)
                     VALUES ($1, $2, 'approve', $3)
                     ON CONFLICT (task_id, client_id) DO UPDATE SET
                       action = 'approve',
                       comments = EXCLUDED.comments,
                       approved_at = NOW()`,
                    [taskId, userId, comments || '']
                );

                // Update task status atomically
                await client.query(
                    `UPDATE tasks SET status = 'pending', updated_at = NOW() WHERE id = $1`,
                    [taskId]
                );

                return { success: true, workflowId: task.workflow_id };
            }
        );

        logger.info(`Task ${taskId} approved by ${userId} in org ${organizationId}`);

        // Create audit log
        await createAuditLog(req, 'task.approved', 'task', taskId, {
            comments,
            workflowId: result.workflowId
        });

        // Trigger orchestrator to resume (schedule next tasks)
        // This ensures the approved task gets picked up immediately
        await orchestrator.scheduleNextTasks(result.workflowId);

        // Record feedback for quality learning (non-blocking)
        recordTaskApproval(taskId, userId, comments).catch(err =>
            logger.warn('[Approvals] Failed to record quality feedback', { err: err.message })
        );

        // AI Creative Director: Learn from approval (non-blocking)
        learnFromApprovalDecision(taskId, 'approved', userId, comments).catch(err =>
            logger.warn('[Approvals] Failed to record creative director learning', { err: err.message })
        );

        // Phase 3: Record approval for accumulated memory (non-blocking)
        if (isZoFeatureEnabled('accumulatedMemory')) {
            pool.query(
                `SELECT d.id, d.organization_id, d.campaign_id, d.type, d.content, d.iteration_count
                 FROM deliverables d
                 JOIN tasks t ON t.output_data->>'deliverable_id' = d.id::text
                 WHERE t.id = $1`,
                [taskId]
            ).then(({ rows }) => {
                if (rows.length > 0) {
                    const del = rows[0];
                    memoryService.recordInteraction({
                        organizationId: del.organization_id,
                        interactionType: 'approval',
                        outcome: del.iteration_count > 0 ? 'approved_with_changes' : 'approved',
                        deliverableId: del.id,
                        campaignId: del.campaign_id,
                        originalContent: typeof del.content === 'string' ? del.content : JSON.stringify(del.content),
                        feedbackContent: comments || 'Approved',
                        userId,
                        deliverableType: del.type,
                        iterationCount: del.iteration_count || 0
                    }).catch(err => logger.warn('[Approvals] Failed to record memory', { err: err.message }));
                }
            }).catch(err => logger.warn('[Approvals] Failed to get deliverable for memory', { err: err.message }));
        }

        res.json({ success: true, message: 'Task approved' });

    } catch (error: unknown) {
        const err = error as any;
        if (err.status) {
            return res.status(err.status).json({ error: err.error });
        }
        logger.error('Error approving task:', error);
        res.status(500).json({ error: 'Failed to approve task' });
    }
});

/**
 * POST /api/approvals/tasks/:taskId/reject
 * Reject a task that is waiting for approval
 *
 * SECURITY: Uses row-level locking to prevent race conditions
 */
router.post('/tasks/:taskId/reject', requireAuth, requireOrganization, async (req: Request, res: Response) => {
    try {
        const taskId = req.params.taskId!;
        const organizationId = getOrganizationId(req);
        const userId = req.org?.user.id || req.user!.id;
        const { comments, reason } = req.body;

        if (!organizationId) {
            return res.status(403).json({
                error: {
                    code: 'NO_ORGANIZATION',
                    message: 'Organization context required for approvals'
                }
            });
        }

        // Use row-level locking to prevent race conditions
        const result = await executeWithLock<TaskRow, { success: boolean; workflowId: string }>(
            'tasks',
            'id = $1',
            [taskId],
            async (client, tasks) => {
                if (tasks.length === 0) {
                    throw { status: 404, error: 'Task not found' };
                }

                const task = tasks[0]!;

                // Verify the task belongs to this organization
                const { rows: workflows } = await client.query<WorkflowRow>(
                    `SELECT organization_id FROM workflows WHERE id = $1`,
                    [task.workflow_id]
                );

                const workflow = workflows[0];
                if (!workflow || workflow.organization_id !== organizationId) {
                    auditLogger.warn('Unauthorized rejection attempt', {
                        taskId,
                        userId,
                        organizationId,
                        workflowOrgId: workflow?.organization_id
                    });
                    throw { status: 403, error: 'Unauthorized' };
                }

                if (task.status !== 'waiting_for_approval') {
                    throw {
                        status: 400,
                        error: `Task is not waiting for approval (status: ${task.status})`
                    };
                }

                // Record rejection with unique constraint to prevent duplicates
                await client.query(
                    `INSERT INTO task_approvals (task_id, client_id, action, comments)
                     VALUES ($1, $2, 'reject', $3)
                     ON CONFLICT (task_id, client_id) DO UPDATE SET
                       action = 'reject',
                       comments = EXCLUDED.comments,
                       approved_at = NOW()`,
                    [taskId, userId, comments || reason || '']
                );

                // Update task status to rejected (not failed - rejected is a valid end state)
                await client.query(
                    `UPDATE tasks SET
                       status = 'rejected',
                       output_result = $1,
                       updated_at = NOW()
                     WHERE id = $2`,
                    [JSON.stringify({
                        error: 'Rejected by user',
                        reason: reason || 'User rejected the task',
                        comments,
                        rejectedBy: userId,
                        rejectedAt: new Date().toISOString()
                    }), taskId]
                );

                // Mark downstream tasks as blocked
                await client.query(
                    `UPDATE tasks
                     SET status = 'blocked',
                         output_result = $1,
                         updated_at = NOW()
                     WHERE workflow_id = $2
                       AND status = 'pending'
                       AND dependencies::jsonb ? $3`,
                    [
                        JSON.stringify({ blockedReason: 'Upstream task was rejected' }),
                        task.workflow_id,
                        taskId
                    ]
                );

                return { success: true, workflowId: task.workflow_id };
            }
        );

        logger.info(`Task ${taskId} rejected by ${userId} in org ${organizationId}`);

        // Create audit log
        await createAuditLog(req, 'task.rejected', 'task', taskId, {
            comments,
            reason,
            workflowId: result.workflowId
        });

        // Record feedback for quality learning (non-blocking)
        recordTaskRejection(taskId, userId, reason, comments).catch(err =>
            logger.warn('[Approvals] Failed to record rejection feedback', { err: err.message })
        );

        // AI Creative Director: Learn from rejection (non-blocking)
        const rejectionFeedback = reason ? `${reason}: ${comments || ''}` : comments;
        learnFromApprovalDecision(taskId, 'rejected', userId, rejectionFeedback).catch(err =>
            logger.warn('[Approvals] Failed to record creative director learning', { err: err.message })
        );

        // Phase 3: Record rejection for accumulated memory (non-blocking)
        if (isZoFeatureEnabled('accumulatedMemory')) {
            pool.query(
                `SELECT d.id, d.organization_id, d.campaign_id, d.type, d.content, d.iteration_count
                 FROM deliverables d
                 JOIN tasks t ON t.output_data->>'deliverable_id' = d.id::text
                 WHERE t.id = $1`,
                [taskId]
            ).then(({ rows }) => {
                if (rows.length > 0) {
                    const del = rows[0];
                    memoryService.recordInteraction({
                        organizationId: del.organization_id,
                        interactionType: 'rejection',
                        outcome: 'rejected',
                        deliverableId: del.id,
                        campaignId: del.campaign_id,
                        originalContent: typeof del.content === 'string' ? del.content : JSON.stringify(del.content),
                        feedbackContent: `${reason || 'Rejected'}: ${comments || ''}`,
                        userId,
                        deliverableType: del.type,
                        iterationCount: del.iteration_count || 0
                    }).catch(err => logger.warn('[Approvals] Failed to record rejection memory', { err: err.message }));
                }
            }).catch(err => logger.warn('[Approvals] Failed to get deliverable for rejection memory', { err: err.message }));
        }

        res.json({ success: true, message: 'Task rejected' });

    } catch (error: unknown) {
        const err = error as any;
        if (err.status) {
            return res.status(err.status).json({ error: err.error });
        }
        logger.error('Error rejecting task:', error);
        res.status(500).json({ error: 'Failed to reject task' });
    }
});

/**
 * GET /api/approvals/pending
 * Get all tasks pending approval for the current organization
 *
 * Query params:
 * - limit: Number of results per page (default: 50, max: 100)
 * - offset: Number of results to skip (default: 0)
 */
router.get('/pending', requireAuth, requireOrganization, async (req: Request, res: Response) => {
    try {
        const organizationId = getOrganizationId(req);
        const { limit: rawLimit = '50', offset: rawOffset = '0' } = req.query;

        // Parse and validate pagination params
        const limit = Math.min(Math.max(1, parseInt(rawLimit as string, 10) || 50), 100);
        const offset = Math.max(0, parseInt(rawOffset as string, 10) || 0);

        const { rows: tasks } = await pool.query(
            `SELECT t.*, w.goal as workflow_goal
             FROM tasks t
             JOIN workflows w ON t.workflow_id = w.id
             WHERE w.organization_id = $1
               AND t.status = 'waiting_for_approval'
             ORDER BY t.approval_requested_at ASC NULLS LAST, t.updated_at ASC
             LIMIT $2 OFFSET $3`,
            [organizationId, limit, offset]
        );

        // Get total count
        const { rows: countRows } = await pool.query(
            `SELECT COUNT(*) as total
             FROM tasks t
             JOIN workflows w ON t.workflow_id = w.id
             WHERE w.organization_id = $1
               AND t.status = 'waiting_for_approval'`,
            [organizationId]
        );
        const totalCount = parseInt(countRows[0]?.total || '0', 10);

        // Calculate SLA status for each task
        const tasksWithSla = tasks.map(task => {
            const now = new Date();
            const requestedAt = task.approval_requested_at ? new Date(task.approval_requested_at) : new Date(task.updated_at);
            const deadline = task.approval_deadline ? new Date(task.approval_deadline) : null;

            const hoursWaiting = (now.getTime() - requestedAt.getTime()) / (1000 * 60 * 60);

            let slaStatus = 'on_track';
            if (deadline) {
                if (now > deadline) {
                    slaStatus = 'overdue';
                } else if (now.getTime() > deadline.getTime() - 60 * 60 * 1000) {
                    slaStatus = 'urgent';
                }
            } else if (hoursWaiting > 24) {
                slaStatus = 'overdue';
            } else if (hoursWaiting > 12) {
                slaStatus = 'urgent';
            }

            return {
                ...task,
                hoursWaiting: Math.round(hoursWaiting * 10) / 10,
                slaStatus
            };
        });

        res.json({
            tasks: tasksWithSla,
            total: totalCount,
            count: tasksWithSla.length,
            limit,
            offset,
            hasMore: offset + tasksWithSla.length < totalCount,
            overdue: tasksWithSla.filter(t => t.slaStatus === 'overdue').length,
            urgent: tasksWithSla.filter(t => t.slaStatus === 'urgent').length
        });

    } catch (error: unknown) {
    const err = error as Error;
        logger.error('Error fetching pending approvals:', error);
        res.status(500).json({ error: 'Failed to fetch pending approvals' });
    }
});

// ============================================================================
// BULK OPERATIONS
// ============================================================================

/**
 * POST /api/approvals/bulk/approve
 * Bulk approve multiple tasks
 */
router.post('/bulk/approve', requireAuth, requireOrganization, async (req: Request, res: Response) => {
    try {
        const organizationId = getOrganizationId(req);
        const userId = req.org?.user.id || req.user!.id;
        const { taskIds, comments } = req.body;

        if (!taskIds || !Array.isArray(taskIds)) {
            return res.status(400).json({ error: 'taskIds array is required' });
        }

        if (!organizationId) {
            return res.status(403).json({
                error: { code: 'NO_ORGANIZATION', message: 'Organization context required' }
            });
        }

        const results = {
            approved: 0,
            errors: [] as { taskId: string; error: string }[],
        };

        for (const taskId of taskIds) {
            try {
                // Get task and verify ownership
                const { rows: tasks } = await pool.query<TaskRow>(
                    `SELECT t.*, w.organization_id
                     FROM tasks t
                     JOIN workflows w ON t.workflow_id = w.id
                     WHERE t.id = $1`,
                    [taskId]
                );

                if (tasks.length === 0) {
                    results.errors.push({ taskId, error: 'Task not found' });
                    continue;
                }

                const task = tasks[0]!;
                if ((task as any).organization_id !== organizationId) {
                    results.errors.push({ taskId, error: 'Unauthorized' });
                    continue;
                }

                if (task.status !== 'waiting_for_approval') {
                    results.errors.push({ taskId, error: `Task status is ${task.status}` });
                    continue;
                }

                // Record approval
                await pool.query(
                    `INSERT INTO task_approvals (task_id, client_id, action, comments)
                     VALUES ($1, $2, 'approve', $3)
                     ON CONFLICT (task_id, client_id) DO UPDATE SET
                       action = 'approve',
                       comments = EXCLUDED.comments,
                       approved_at = NOW()`,
                    [taskId, userId, comments || '']
                );

                // Update task status
                await pool.query(
                    `UPDATE tasks SET status = 'pending', updated_at = NOW() WHERE id = $1`,
                    [taskId]
                );

                // Trigger orchestrator
                await orchestrator.scheduleNextTasks(task.workflow_id);

                results.approved++;
            } catch (error: unknown) {
                const err = error as Error;
                results.errors.push({ taskId, error: err.message || 'Unknown error' });
            }
        }

        // Create audit log
        await createAuditLog(req, 'tasks.bulk_approved', 'task', null, {
            taskIds,
            approved: results.approved,
            comments
        });

        logger.info(`Bulk approved ${results.approved} tasks by ${userId} in org ${organizationId}`);

        res.json({
            success: true,
            results,
            totalProcessed: taskIds.length,
        });
    } catch (error: unknown) {
    const err = error as Error;
        logger.error('Error bulk approving tasks:', error);
        res.status(500).json({ error: 'Failed to bulk approve tasks' });
    }
});

/**
 * POST /api/approvals/bulk/reject
 * Bulk reject multiple tasks
 */
router.post('/bulk/reject', requireAuth, requireOrganization, async (req: Request, res: Response) => {
    try {
        const organizationId = getOrganizationId(req);
        const userId = req.org?.user.id || req.user!.id;
        const { taskIds, comments, reason } = req.body;

        if (!taskIds || !Array.isArray(taskIds)) {
            return res.status(400).json({ error: 'taskIds array is required' });
        }

        if (!organizationId) {
            return res.status(403).json({
                error: { code: 'NO_ORGANIZATION', message: 'Organization context required' }
            });
        }

        const results = {
            rejected: 0,
            errors: [] as { taskId: string; error: string }[],
        };

        for (const taskId of taskIds) {
            try {
                // Get task and verify ownership
                const { rows: tasks } = await pool.query<TaskRow>(
                    `SELECT t.*, w.organization_id
                     FROM tasks t
                     JOIN workflows w ON t.workflow_id = w.id
                     WHERE t.id = $1`,
                    [taskId]
                );

                if (tasks.length === 0) {
                    results.errors.push({ taskId, error: 'Task not found' });
                    continue;
                }

                const task = tasks[0]!;
                if ((task as any).organization_id !== organizationId) {
                    results.errors.push({ taskId, error: 'Unauthorized' });
                    continue;
                }

                if (task.status !== 'waiting_for_approval') {
                    results.errors.push({ taskId, error: `Task status is ${task.status}` });
                    continue;
                }

                // Record rejection
                await pool.query(
                    `INSERT INTO task_approvals (task_id, client_id, action, comments)
                     VALUES ($1, $2, 'reject', $3)
                     ON CONFLICT (task_id, client_id) DO UPDATE SET
                       action = 'reject',
                       comments = EXCLUDED.comments,
                       approved_at = NOW()`,
                    [taskId, userId, comments || reason || '']
                );

                // Update task status
                await pool.query(
                    `UPDATE tasks SET
                       status = 'rejected',
                       output_result = $1,
                       updated_at = NOW()
                     WHERE id = $2`,
                    [JSON.stringify({
                        error: 'Rejected by user (bulk)',
                        reason: reason || 'User rejected the task',
                        comments,
                        rejectedBy: userId,
                        rejectedAt: new Date().toISOString()
                    }), taskId]
                );

                results.rejected++;
            } catch (error: unknown) {
                const err = error as Error;
                results.errors.push({ taskId, error: err.message || 'Unknown error' });
            }
        }

        // Create audit log
        await createAuditLog(req, 'tasks.bulk_rejected', 'task', null, {
            taskIds,
            rejected: results.rejected,
            reason,
            comments
        });

        logger.info(`Bulk rejected ${results.rejected} tasks by ${userId} in org ${organizationId}`);

        res.json({
            success: true,
            results,
            totalProcessed: taskIds.length,
        });
    } catch (error: unknown) {
    const err = error as Error;
        logger.error('Error bulk rejecting tasks:', error);
        res.status(500).json({ error: 'Failed to bulk reject tasks' });
    }
});

export const approvalRoutes = router;
