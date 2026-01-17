/**
 * Arcus Brain API Routes
 *
 * Main entry point for client projects. Clients describe what they need,
 * Arcus figures out everything required and delivers real work.
 */

import { Router, Request, Response } from 'express';
import { arcusBrain, ClientRequest, ExecutionPlan } from '../services/arcusBrain.js';
import { executionEngine } from '../services/arcusExecutionEngine.js';
import { pool } from '../database/db.js';
import { logger } from '../utils/logger.js';
import { requireAuth } from '../middleware/auth.js';
import { requireOrganization } from '../middleware/multiTenancy.js';

const router = Router();

// SEC-004 FIX: All Arcus Brain routes require authentication and organization context
router.use(requireAuth);
router.use(requireOrganization);

/**
 * POST /api/arcus/projects
 *
 * Start a new project. Client provides their request and context,
 * Arcus analyzes and creates a full execution plan.
 */
router.post('/projects', async (req: Request, res: Response) => {
    try {
        const clientRequest: ClientRequest = {
            request: req.body.request,
            clientId: req.body.clientId || (req as any).userId,
            context: req.body.context || {}
        };

        if (!clientRequest.request) {
            return res.status(400).json({ error: 'Request is required' });
        }

        logger.info(`[ArcusBrain API] New project request: "${clientRequest.request.substring(0, 100)}..."`);

        // Process the request through Arcus Brain
        const plan = await arcusBrain.processRequest(clientRequest);

        res.json({
            success: true,
            projectId: plan.projectId,
            analysis: plan.analysis,
            plan: {
                phases: plan.phases.map(p => ({
                    name: p.name,
                    description: p.description,
                    agentCount: p.agents.length,
                    agents: p.agents.map(a => ({
                        id: a.agentId,
                        role: a.role,
                        deliverables: a.expectedDeliverables
                    })),
                    deliverables: p.estimatedDeliverables
                })),
                totalAgents: plan.totalAgents,
                totalDeliverables: plan.totalDeliverables,
                qualityGates: plan.qualityGates
            },
            message: 'Project planned. Call /api/arcus/projects/:id/execute to start execution.'
        });

    } catch (error: unknown) {
    const err = error as Error;
        logger.error('[ArcusBrain API] Error processing project:', error);
        res.status(500).json({ error: err.message || 'Failed to process project' });
    }
});

/**
 * POST /api/arcus/projects/:id/execute
 *
 * Execute a planned project. This runs all agents and produces real deliverables.
 */
router.post('/projects/:id/execute', async (req: Request, res: Response) => {
    try {
        const { id } = req.params;

        // Get the project and its plan
        const { rows } = await pool.query(
            'SELECT * FROM projects WHERE id = $1',
            [id]
        );

        if (rows.length === 0) {
            return res.status(404).json({ error: 'Project not found' });
        }

        const project = rows[0];

        if (!project.execution_plan) {
            return res.status(400).json({ error: 'Project has no execution plan' });
        }

        const plan = project.execution_plan as ExecutionPlan;

        logger.info(`[ArcusBrain API] Starting execution of project ${id}`);

        // Execute the plan using the execution engine
        const result = await executionEngine.execute(plan);

        res.json({
            success: result.status !== 'failed',
            projectId: id,
            status: result.status,
            phases: result.phases,
            deliverables: result.deliverables.map(d => ({
                id: d.id,
                type: d.type,
                title: d.title,
                agentId: d.agentId,
                contentPreview: typeof d.content === 'string'
                    ? d.content.substring(0, 500) + (d.content.length > 500 ? '...' : '')
                    : JSON.stringify(d.content).substring(0, 500)
            })),
            totalDeliverables: result.deliverables.length,
            executionTime: result.executionTime,
            taskStats: {
                total: result.totalTasks,
                completed: result.completedTasks,
                failed: result.failedTasks
            }
        });

    } catch (error: unknown) {
    const err = error as Error;
        logger.error('[ArcusBrain API] Error executing project:', error);

        // Update status to failed
        try {
            await pool.query(
                `UPDATE projects SET status = 'failed', updated_at = NOW() WHERE id = $1`,
                [req.params.id]
            );
        } catch {}

        res.status(500).json({ error: err.message || 'Failed to execute project' });
    }
});

/**
 * GET /api/arcus/projects/:id
 *
 * Get project details including analysis and status.
 */
router.get('/projects/:id', async (req: Request, res: Response) => {
    try {
        const { id } = req.params;

        const { rows } = await pool.query(
            'SELECT * FROM projects WHERE id = $1',
            [id]
        );

        if (rows.length === 0) {
            return res.status(404).json({ error: 'Project not found' });
        }

        const project = rows[0];

        res.json({
            id: project.id,
            request: project.request,
            status: project.status,
            projectType: project.project_type,
            complexity: project.complexity,
            analysis: project.analysis,
            plan: project.execution_plan,
            totalAgents: project.total_agents,
            totalDeliverables: project.total_deliverables,
            startedAt: project.started_at,
            completedAt: project.completed_at,
            createdAt: project.created_at
        });

    } catch (error: unknown) {
    const err = error as Error;
        logger.error('[ArcusBrain API] Error getting project:', error);
        res.status(500).json({ error: err.message || 'Failed to get project' });
    }
});

/**
 * GET /api/arcus/projects/:id/deliverables
 *
 * Get all deliverables for a project.
 */
router.get('/projects/:id/deliverables', async (req: Request, res: Response) => {
    try {
        const { id } = req.params;

        const { rows } = await pool.query(
            `SELECT * FROM project_deliverables WHERE project_id = $1 ORDER BY created_at`,
            [id]
        );

        res.json({
            projectId: id,
            deliverables: rows.map(d => ({
                id: d.id,
                type: d.type,
                title: d.title,
                agentId: d.agent_id,
                content: d.content,
                metadata: d.metadata,
                status: d.status,
                qualityScore: d.quality_score,
                createdAt: d.created_at
            })),
            total: rows.length
        });

    } catch (error: unknown) {
    const err = error as Error;
        logger.error('[ArcusBrain API] Error getting deliverables:', error);
        res.status(500).json({ error: err.message || 'Failed to get deliverables' });
    }
});

/**
 * GET /api/arcus/projects/:id/deliverables/:deliverableId
 *
 * Get a single deliverable with full content.
 */
router.get('/projects/:id/deliverables/:deliverableId', async (req: Request, res: Response) => {
    try {
        const { id, deliverableId } = req.params;

        const { rows } = await pool.query(
            `SELECT * FROM project_deliverables WHERE id = $1 AND project_id = $2`,
            [deliverableId, id]
        );

        if (rows.length === 0) {
            return res.status(404).json({ error: 'Deliverable not found' });
        }

        const d = rows[0];

        res.json({
            id: d.id,
            projectId: d.project_id,
            type: d.type,
            title: d.title,
            agentId: d.agent_id,
            content: d.content,
            contentFormat: d.content_format,
            metadata: d.metadata,
            status: d.status,
            qualityScore: d.quality_score,
            qualityFeedback: d.quality_feedback,
            version: d.version,
            createdAt: d.created_at,
            updatedAt: d.updated_at
        });

    } catch (error: unknown) {
    const err = error as Error;
        logger.error('[ArcusBrain API] Error getting deliverable:', error);
        res.status(500).json({ error: err.message || 'Failed to get deliverable' });
    }
});

/**
 * GET /api/arcus/agents
 *
 * List all available agents with their capabilities.
 */
router.get('/agents', async (_req: Request, res: Response) => {
    try {
        const { DynamicPlaybookService } = await import('../services/dynamicPlaybookService.js');
        const agents = DynamicPlaybookService.loadAgents();

        // Group by category
        const byCategory: Record<string, any[]> = {};
        for (const agent of agents) {
            const cat = agent.category || 'general';
            if (!byCategory[cat]) byCategory[cat] = [];
            byCategory[cat].push({
                id: agent.id,
                name: agent.name,
                role: agent.role,
                description: agent.description?.substring(0, 200)
            });
        }

        res.json({
            totalAgents: agents.length,
            categories: Object.keys(byCategory).length,
            agents: byCategory
        });

    } catch (error: unknown) {
    const err = error as Error;
        logger.error('[ArcusBrain API] Error listing agents:', error);
        res.status(500).json({ error: err.message || 'Failed to list agents' });
    }
});

/**
 * POST /api/arcus/analyze
 *
 * Just analyze a request without creating a project.
 * Useful for previewing what Arcus would do.
 */
router.post('/analyze', async (req: Request, res: Response) => {
    try {
        const { request, context } = req.body;

        if (!request) {
            return res.status(400).json({ error: 'Request is required' });
        }

        // Use the brain's analysis without creating a project
        const clientRequest: ClientRequest = {
            request,
            context: context || {}
        };

        const plan = await arcusBrain.processRequest(clientRequest);

        res.json({
            analysis: plan.analysis,
            recommendedApproach: {
                projectType: plan.analysis.projectType,
                complexity: plan.analysis.complexity,
                phases: plan.phases.length,
                agents: plan.totalAgents,
                deliverables: plan.totalDeliverables
            },
            expandedScope: plan.analysis.expandedScope,
            channels: plan.analysis.channelStrategy,
            message: 'This is what Arcus would do for this request.'
        });

    } catch (error: unknown) {
    const err = error as Error;
        logger.error('[ArcusBrain API] Error analyzing request:', error);
        res.status(500).json({ error: err.message || 'Failed to analyze request' });
    }
});

export default router;
