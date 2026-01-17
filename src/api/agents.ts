/**
 * Agent Visibility Routes
 *
 * Exposes agent activity, performance, and attribution data to the frontend.
 * Users can see which agents worked on their deliverables and track agent performance.
 */

import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requireOrganization, getOrganizationId } from '../middleware/multiTenancy.js';
import { pool } from '../database/db.js';
import { logger } from '../utils/logger.js';

const router = Router();

// All routes require authentication
router.use(requireAuth);
router.use(requireOrganization);

/**
 * GET /api/agents/activity
 * Get recent agent activity for the organization
 */
router.get('/activity', async (req: Request, res: Response) => {
    try {
        const organizationId = getOrganizationId(req)!;
        const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);

        // Get recent agent activity from agent_learning_events and task progress
        const { rows } = await pool.query(`
            SELECT
                ale.id,
                ale.agent_id,
                ale.event_type,
                ale.context::text as context,
                ale.outcome::text as outcome,
                ale.created_at,
                t.description as task_description,
                w.goal as workflow_goal
            FROM agent_learning_events ale
            LEFT JOIN tasks t ON ale.context->>'taskId' = t.id::text
            LEFT JOIN workflows w ON t.workflow_id = w.id
            WHERE w.client_id IN (
                SELECT id FROM users WHERE organization_id = $1
            )
            ORDER BY ale.created_at DESC
            LIMIT $2
        `, [organizationId, limit]);

        // Transform to activity feed format
        const activities = rows.map(row => ({
            id: row.id,
            agent: formatAgentName(row.agent_id),
            agentId: row.agent_id,
            action: row.event_type === 'task_completed'
                ? `Completed: ${row.task_description || 'task'}`
                : row.event_type === 'task_started'
                    ? `Working on: ${row.task_description || 'task'}`
                    : row.event_type,
            status: row.event_type === 'task_completed' ? 'complete' : 'working',
            workflowGoal: row.workflow_goal,
            timestamp: formatRelativeTime(row.created_at),
            createdAt: row.created_at
        }));

        res.json({
            success: true,
            data: activities
        });
    } catch (error: unknown) {
        const err = error as Error;
        logger.error('Error fetching agent activity:', error);
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * GET /api/agents/stats
 * Get agent performance statistics
 */
router.get('/stats', async (req: Request, res: Response) => {
    try {
        const organizationId = getOrganizationId(req)!;

        // Get agent stats
        const { rows } = await pool.query(`
            SELECT
                ast.agent_id,
                ast.total_tasks,
                ast.successful_tasks,
                ast.avg_quality_score,
                ast.avg_execution_time_ms,
                ast.total_cost_usd,
                ast.updated_at
            FROM agent_stats ast
            WHERE ast.client_id IN (
                SELECT id FROM users WHERE organization_id = $1
            )
            ORDER BY ast.total_tasks DESC
        `, [organizationId]);

        // Transform and enrich
        const stats = rows.map(row => ({
            agentId: row.agent_id,
            agentName: formatAgentName(row.agent_id),
            totalTasks: row.total_tasks || 0,
            successfulTasks: row.successful_tasks || 0,
            successRate: row.total_tasks > 0
                ? Math.round((row.successful_tasks / row.total_tasks) * 100)
                : 0,
            avgQualityScore: Math.round(row.avg_quality_score || 0),
            avgExecutionTime: formatDuration(row.avg_execution_time_ms),
            totalCost: row.total_cost_usd?.toFixed(2) || '0.00',
            lastActive: row.updated_at
        }));

        res.json({
            success: true,
            data: stats
        });
    } catch (error: unknown) {
        const err = error as Error;
        logger.error('Error fetching agent stats:', error);
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * GET /api/agents/deliverables/:deliverableId
 * Get which agents contributed to a specific deliverable
 */
router.get('/deliverables/:deliverableId', async (req: Request, res: Response) => {
    try {
        const organizationId = getOrganizationId(req)!;
        const { deliverableId } = req.params;

        // Get deliverable and its agent attribution
        const { rows } = await pool.query(`
            SELECT
                d.id,
                d.type,
                d.metadata,
                d.created_at,
                t.description as task_description,
                w.goal as workflow_goal,
                pt.agent_id,
                pt.status as task_status,
                pt.quality_score
            FROM deliverables d
            LEFT JOIN tasks t ON d.task_id = t.id
            LEFT JOIN workflows w ON t.workflow_id = w.id
            LEFT JOIN project_tasks pt ON pt.workflow_id = w.id::text
            WHERE d.id = $1
            AND w.client_id IN (
                SELECT id FROM users WHERE organization_id = $2
            )
        `, [deliverableId, organizationId]);

        if (rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Deliverable not found'
            });
        }

        const deliverable = rows[0];
        const metadata = deliverable.metadata || {};

        // Collect unique agents
        const agentContributions = new Map<string, { agent: string; contribution: string; score?: number }>();

        // From metadata (if stored)
        if (metadata.agentId) {
            agentContributions.set(metadata.agentId, {
                agent: formatAgentName(metadata.agentId),
                contribution: 'Primary creator',
                score: metadata.qualityScore
            });
        }

        // From project_tasks
        for (const row of rows) {
            if (row.agent_id && !agentContributions.has(row.agent_id)) {
                agentContributions.set(row.agent_id, {
                    agent: formatAgentName(row.agent_id),
                    contribution: row.task_description || 'Contributing work',
                    score: row.quality_score
                });
            }
        }

        res.json({
            success: true,
            data: {
                deliverableId,
                type: deliverable.type,
                workflowGoal: deliverable.workflow_goal,
                createdAt: deliverable.created_at,
                agents: Array.from(agentContributions.values())
            }
        });
    } catch (error: unknown) {
        const err = error as Error;
        logger.error('Error fetching deliverable agents:', error);
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * GET /api/agents/roster
 * Get list of all available agents with descriptions
 */
router.get('/roster', async (_req: Request, res: Response) => {
    try {
        // Return static roster of known agents with descriptions
        const roster = [
            // Creative Division
            { id: 'cmo', name: 'Chief Marketing Officer', division: 'Creative', description: 'Strategic marketing leadership and brand oversight' },
            { id: 'acd-motion', name: 'Motion Designer', division: 'Creative', description: 'Video and animation production' },
            { id: 'acd-visual', name: 'Visual Designer', division: 'Creative', description: 'Static visual content and graphics' },

            // Marketing Division
            { id: 'tiktok-strategist', name: 'TikTok Strategist', division: 'Marketing', description: 'TikTok content strategy and viral optimization' },
            { id: 'instagram-curator', name: 'Instagram Curator', division: 'Marketing', description: 'Instagram content curation and visual storytelling' },
            { id: 'twitter-engager', name: 'Twitter Engager', division: 'Marketing', description: 'Twitter engagement and thought leadership' },
            { id: 'content-creator', name: 'Content Creator', division: 'Marketing', description: 'Multi-platform content production' },
            { id: 'growth-hacker', name: 'Growth Hacker', division: 'Marketing', description: 'Rapid growth experiments and viral loops' },

            // Design Division
            { id: 'cdo', name: 'Chief Design Officer', division: 'Design', description: 'Design system leadership and quality' },
            { id: 'ui-designer', name: 'UI Designer', division: 'Design', description: 'User interface design and component libraries' },
            { id: 'brand-guardian', name: 'Brand Guardian', division: 'Design', description: 'Brand consistency and identity protection' },

            // Strategy Division
            { id: 'strategist', name: 'Strategist', division: 'Strategy', description: 'Strategic planning and market analysis' },
            { id: 'trend-researcher', name: 'Trend Researcher', division: 'Strategy', description: 'Market intelligence and trend analysis' },

            // Engineering Division
            { id: 'frontend-dev', name: 'Frontend Developer', division: 'Engineering', description: 'React/Vue/Angular development' },
            { id: 'backend-architect', name: 'Backend Architect', division: 'Engineering', description: 'API design and database architecture' },

            // Quality Division
            { id: 'qa-gate', name: 'QA Gate Agent', division: 'Quality', description: 'Quality assurance and approval workflows' },
            { id: 'evidence-collector', name: 'Evidence Collector', division: 'Quality', description: 'Screenshot-based quality verification' },
        ];

        res.json({
            success: true,
            data: roster
        });
    } catch (error: unknown) {
        const err = error as Error;
        logger.error('Error fetching agent roster:', error);
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * GET /api/agents/:agentId/history
 * Get execution history for a specific agent
 */
router.get('/:agentId/history', async (req: Request, res: Response) => {
    try {
        const organizationId = getOrganizationId(req)!;
        const { agentId } = req.params;
        const limit = Math.min(parseInt(req.query.limit as string) || 20, 50);

        const { rows } = await pool.query(`
            SELECT
                ale.id,
                ale.event_type,
                ale.context::text as context,
                ale.outcome::text as outcome,
                ale.created_at,
                t.description as task_description,
                w.goal as workflow_goal
            FROM agent_learning_events ale
            LEFT JOIN tasks t ON ale.context->>'taskId' = t.id::text
            LEFT JOIN workflows w ON t.workflow_id = w.id
            WHERE ale.agent_id = $1
            AND w.client_id IN (
                SELECT id FROM users WHERE organization_id = $2
            )
            ORDER BY ale.created_at DESC
            LIMIT $3
        `, [agentId, organizationId, limit]);

        res.json({
            success: true,
            data: {
                agentId,
                agentName: formatAgentName(agentId),
                history: rows.map(row => ({
                    id: row.id,
                    eventType: row.event_type,
                    context: row.context ? JSON.parse(row.context) : null,
                    outcome: row.outcome ? JSON.parse(row.outcome) : null,
                    taskDescription: row.task_description,
                    workflowGoal: row.workflow_goal,
                    timestamp: row.created_at
                }))
            }
        });
    } catch (error: unknown) {
        const err = error as Error;
        logger.error('Error fetching agent history:', error);
        res.status(500).json({ success: false, error: err.message });
    }
});

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Format agent ID into human-readable name
 */
function formatAgentName(agentId: string): string {
    if (!agentId) return 'Unknown Agent';

    const knownNames: Record<string, string> = {
        'cmo': 'Chief Marketing Officer',
        'cdo': 'Chief Design Officer',
        'cto': 'Chief Technology Officer',
        'acd-motion': 'Motion Designer',
        'acd-visual': 'Visual Designer',
        'tiktok-strategist': 'TikTok Strategist',
        'instagram-curator': 'Instagram Curator',
        'twitter-engager': 'Twitter Engager',
        'content-creator': 'Content Creator',
        'growth-hacker': 'Growth Hacker',
        'ui-designer': 'UI Designer',
        'brand-guardian': 'Brand Guardian',
        'strategist': 'Strategist',
        'qa-gate': 'QA Gate Agent',
        'evidence-collector': 'Evidence Collector',
        'deliverable_modifier': 'Deliverable Editor',
        'system': 'System',
    };

    if (knownNames[agentId]) {
        return knownNames[agentId];
    }

    // Convert kebab-case or snake_case to Title Case
    return agentId
        .replace(/[-_]/g, ' ')
        .split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(' ');
}

/**
 * Format timestamp as relative time
 */
function formatRelativeTime(date: Date | string): string {
    const now = new Date();
    const then = new Date(date);
    const diffMs = now.getTime() - then.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return then.toLocaleDateString();
}

/**
 * Format milliseconds as human-readable duration
 */
function formatDuration(ms: number | null): string {
    if (!ms) return '-';
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${(ms / 60000).toFixed(1)}m`;
}

export default router;
