/**
 * Calendar Events API
 *
 * Aggregates tasks, deliverables, and campaigns into calendar events
 * for display in the CalendarView component.
 */

import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth.js';
import {
  requireOrganization,
  getOrganizationId
} from '../middleware/multiTenancy.js';
import { pool } from '../database/db.js';
import { logger } from '../utils/logger.js';

const router = Router();

// ============================================================================
// Types
// ============================================================================

interface CalendarEvent {
  id: string;
  title: string;
  date: string; // ISO date string
  endDate?: string;
  type: 'video' | 'email' | 'image' | 'document' | 'launch' | 'milestone';
  status?: 'scheduled' | 'in_progress' | 'completed';
  deliverableId?: string;
  taskId?: string;
  campaignId?: string;
  departmentId?: string;
  workflowId?: string;
}

// Map deliverable types to calendar event types
const DELIVERABLE_TYPE_MAP: Record<string, CalendarEvent['type']> = {
  'video': 'video',
  'image': 'image',
  'email': 'email',
  'email_campaign': 'email',
  'landing_page': 'document',
  'blog_post': 'document',
  'social_post': 'image',
  'ad_copy': 'document',
  'document': 'document',
  'default': 'document'
};

// Map task statuses to calendar event statuses
const STATUS_MAP: Record<string, CalendarEvent['status']> = {
  'pending': 'scheduled',
  'queued': 'scheduled',
  'in_progress': 'in_progress',
  'running': 'in_progress',
  'waiting_for_approval': 'in_progress',
  'completed': 'completed',
  'failed': 'completed', // Show as completed (ended) but could be styled differently
  'default': 'scheduled'
};

// ============================================================================
// Routes
// ============================================================================

/**
 * GET /api/calendar/events
 *
 * Get calendar events for a date range
 *
 * Query params:
 * - start_date: ISO date string (required)
 * - end_date: ISO date string (required)
 * - workflow_id: Filter by workflow
 * - campaign_id: Filter by campaign
 * - department_id: Filter by department
 */
router.get('/events', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req)!;
    const {
      start_date,
      end_date,
      workflow_id,
      campaign_id,
      department_id
    } = req.query;

    // Default to current month if no dates provided
    const now = new Date();
    const defaultStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const defaultEnd = new Date(now.getFullYear(), now.getMonth() + 2, 0);

    const startDate = start_date ? new Date(start_date as string) : defaultStart;
    const endDate = end_date ? new Date(end_date as string) : defaultEnd;

    const events: CalendarEvent[] = [];

    // ========================================================================
    // 1. Fetch Tasks with scheduled_date
    // ========================================================================
    const tasksQuery = `
      SELECT
        t.id,
        t.agent_id,
        t.status,
        t.input_context,
        t.scheduled_date,
        t.due_date,
        t.department_id,
        t.category,
        t.workflow_id,
        w.goal as workflow_goal
      FROM tasks t
      LEFT JOIN workflows w ON t.workflow_id = w.id
      WHERE t.scheduled_date IS NOT NULL
        AND t.scheduled_date >= $1
        AND t.scheduled_date <= $2
        AND (w.organization_id = $3 OR w.client_id = $3)
        ${workflow_id ? 'AND t.workflow_id = $4' : ''}
        ${department_id ? `AND t.department_id = $${workflow_id ? 5 : 4}` : ''}
      ORDER BY t.scheduled_date ASC
    `;

    const taskParams: unknown[] = [startDate, endDate, organizationId];
    if (workflow_id) taskParams.push(workflow_id);
    if (department_id) taskParams.push(department_id);

    const tasksResult = await pool.query(tasksQuery, taskParams);

    for (const task of tasksResult.rows) {
      // Use input_context for title, truncated to first line/sentence
      const taskTitle = task.input_context
        ? task.input_context.split('\n')[0].substring(0, 80)
        : (task.agent_id || 'Task');
      events.push({
        id: `task-${task.id}`,
        title: taskTitle,
        date: task.scheduled_date.toISOString().split('T')[0],
        endDate: task.due_date ? task.due_date.toISOString().split('T')[0] : undefined,
        type: mapCategoryToType(task.category),
        status: STATUS_MAP[task.status] || STATUS_MAP['default'],
        taskId: task.id,
        departmentId: task.department_id,
        workflowId: task.workflow_id
      });
    }

    // ========================================================================
    // 2. Fetch Deliverables with scheduled_date
    // ========================================================================
    const deliverablesQuery = `
      SELECT
        d.id,
        d.type,
        d.scheduled_date,
        d.campaign_id,
        d.metadata,
        d.approval_status,
        t.workflow_id,
        t.department_id,
        c.name as campaign_name
      FROM deliverables d
      LEFT JOIN tasks t ON d.task_id = t.id
      LEFT JOIN campaigns c ON d.campaign_id = c.id
      LEFT JOIN workflows w ON t.workflow_id = w.id
      WHERE d.scheduled_date IS NOT NULL
        AND d.scheduled_date >= $1
        AND d.scheduled_date <= $2
        AND (
          c.organization_id = $3
          OR c.client_id = $3
          OR w.organization_id = $3
          OR w.client_id = $3
        )
        ${campaign_id ? 'AND d.campaign_id = $4' : ''}
        ${workflow_id && !campaign_id ? 'AND t.workflow_id = $4' : ''}
        ${workflow_id && campaign_id ? 'AND t.workflow_id = $5' : ''}
      ORDER BY d.scheduled_date ASC
    `;

    const deliverableParams: unknown[] = [startDate, endDate, organizationId];
    if (campaign_id) deliverableParams.push(campaign_id);
    if (workflow_id) deliverableParams.push(workflow_id);

    const deliverablesResult = await pool.query(deliverablesQuery, deliverableParams);

    for (const deliverable of deliverablesResult.rows) {
      const metadata = deliverable.metadata || {};
      events.push({
        id: `deliverable-${deliverable.id}`,
        title: metadata.title || metadata.name || `${deliverable.type} Deliverable`,
        date: deliverable.scheduled_date.toISOString().split('T')[0],
        type: DELIVERABLE_TYPE_MAP[deliverable.type] || DELIVERABLE_TYPE_MAP['default'],
        status: mapApprovalToStatus(deliverable.approval_status),
        deliverableId: deliverable.id,
        campaignId: deliverable.campaign_id,
        departmentId: deliverable.department_id,
        workflowId: deliverable.workflow_id
      });
    }

    // ========================================================================
    // 3. Fetch Campaign start/end dates as launch/milestone events
    // ========================================================================
    const campaignsQuery = `
      SELECT
        id,
        name,
        status,
        start_date,
        end_date
      FROM campaigns
      WHERE (organization_id = $1 OR client_id = $1)
        AND (
          (start_date >= $2 AND start_date <= $3)
          OR (end_date >= $2 AND end_date <= $3)
          OR (start_date <= $2 AND (end_date >= $3 OR end_date IS NULL))
        )
        ${campaign_id ? 'AND id = $4' : ''}
      ORDER BY start_date ASC
    `;

    const campaignParams: unknown[] = [organizationId, startDate, endDate];
    if (campaign_id) campaignParams.push(campaign_id);

    const campaignsResult = await pool.query(campaignsQuery, campaignParams);

    for (const campaign of campaignsResult.rows) {
      // Add campaign start as launch event
      if (campaign.start_date) {
        const startDateStr = campaign.start_date.toISOString().split('T')[0];
        events.push({
          id: `campaign-start-${campaign.id}`,
          title: `${campaign.name} Launch`,
          date: startDateStr,
          endDate: campaign.end_date ? campaign.end_date.toISOString().split('T')[0] : undefined,
          type: 'launch',
          status: mapCampaignStatus(campaign.status),
          campaignId: campaign.id
        });
      }

      // Add campaign end as milestone event (if different from start)
      if (campaign.end_date) {
        const endDateStr = campaign.end_date.toISOString().split('T')[0];
        const startDateStr = campaign.start_date?.toISOString().split('T')[0];
        if (endDateStr !== startDateStr) {
          events.push({
            id: `campaign-end-${campaign.id}`,
            title: `${campaign.name} End`,
            date: endDateStr,
            type: 'milestone',
            status: mapCampaignStatus(campaign.status),
            campaignId: campaign.id
          });
        }
      }
    }

    // Sort all events by date
    events.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    res.json({
      events,
      total: events.length,
      dateRange: {
        start: startDate.toISOString(),
        end: endDate.toISOString()
      }
    });

  } catch (error: unknown) {
    const err = error as Error;
    logger.error('Get calendar events error:', error);
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to fetch calendar events'
      }
    });
  }
});

/**
 * GET /api/calendar/events/:id
 *
 * Get details for a specific calendar event
 */
router.get('/events/:id', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req)!;
    const { id } = req.params;

    // Parse event ID to determine type
    const [type, ...idParts] = id.split('-');
    const entityId = idParts.join('-');

    let event: CalendarEvent | null = null;

    if (type === 'task') {
      const result = await pool.query(`
        SELECT t.*, w.goal as workflow_goal
        FROM tasks t
        LEFT JOIN workflows w ON t.workflow_id = w.id
        WHERE t.id = $1 AND (w.organization_id = $2 OR w.client_id = $2)
      `, [entityId, organizationId]);

      if (result.rows[0]) {
        const task = result.rows[0];
        event = {
          id,
          title: task.description || task.agent_id,
          date: task.scheduled_date?.toISOString().split('T')[0] || '',
          endDate: task.due_date?.toISOString().split('T')[0],
          type: mapCategoryToType(task.category),
          status: STATUS_MAP[task.status] || 'scheduled',
          taskId: task.id,
          departmentId: task.department_id,
          workflowId: task.workflow_id
        };
      }
    } else if (type === 'deliverable') {
      const result = await pool.query(`
        SELECT d.*, t.workflow_id, t.department_id, c.name as campaign_name
        FROM deliverables d
        LEFT JOIN tasks t ON d.task_id = t.id
        LEFT JOIN campaigns c ON d.campaign_id = c.id
        LEFT JOIN workflows w ON t.workflow_id = w.id
        WHERE d.id = $1
          AND (c.organization_id = $2 OR c.client_id = $2 OR w.organization_id = $2 OR w.client_id = $2)
      `, [entityId, organizationId]);

      if (result.rows[0]) {
        const d = result.rows[0];
        const metadata = d.metadata || {};
        event = {
          id,
          title: metadata.title || metadata.name || `${d.type} Deliverable`,
          date: d.scheduled_date?.toISOString().split('T')[0] || '',
          type: DELIVERABLE_TYPE_MAP[d.type] || 'document',
          status: mapApprovalToStatus(d.approval_status),
          deliverableId: d.id,
          campaignId: d.campaign_id,
          departmentId: d.department_id,
          workflowId: d.workflow_id
        };
      }
    } else if (type === 'campaign') {
      const result = await pool.query(`
        SELECT * FROM campaigns
        WHERE id = $1 AND (organization_id = $2 OR client_id = $2)
      `, [entityId, organizationId]);

      if (result.rows[0]) {
        const campaign = result.rows[0];
        event = {
          id,
          title: campaign.name,
          date: campaign.start_date?.toISOString().split('T')[0] || '',
          endDate: campaign.end_date?.toISOString().split('T')[0],
          type: 'launch',
          status: mapCampaignStatus(campaign.status),
          campaignId: campaign.id
        };
      }
    }

    if (!event) {
      return res.status(404).json({
        error: {
          code: 'EVENT_NOT_FOUND',
          message: 'Calendar event not found'
        }
      });
    }

    res.json(event);
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('Get calendar event error:', error);
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to fetch calendar event'
      }
    });
  }
});

/**
 * PATCH /api/calendar/events/:id
 *
 * Update a calendar event (reschedule)
 */
router.patch('/events/:id', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req)!;
    const { id } = req.params;
    const { date, endDate } = req.body;

    // Parse event ID to determine type
    const [type, ...idParts] = id.split('-');
    const entityId = idParts.join('-');

    if (type === 'task') {
      await pool.query(`
        UPDATE tasks t
        SET
          scheduled_date = COALESCE($1, scheduled_date),
          due_date = COALESCE($2, due_date),
          updated_at = NOW()
        FROM workflows w
        WHERE t.id = $3
          AND t.workflow_id = w.id
          AND (w.organization_id = $4 OR w.client_id = $4)
      `, [date, endDate, entityId, organizationId]);
    } else if (type === 'deliverable') {
      await pool.query(`
        UPDATE deliverables d
        SET scheduled_date = COALESCE($1, scheduled_date)
        FROM tasks t
        LEFT JOIN workflows w ON t.workflow_id = w.id
        LEFT JOIN campaigns c ON d.campaign_id = c.id
        WHERE d.id = $2
          AND d.task_id = t.id
          AND (w.organization_id = $3 OR w.client_id = $3 OR c.organization_id = $3 OR c.client_id = $3)
      `, [date, entityId, organizationId]);
    } else if (type === 'campaign') {
      const isStartEvent = id.includes('-start-');
      if (isStartEvent) {
        await pool.query(`
          UPDATE campaigns
          SET start_date = COALESCE($1, start_date), updated_at = NOW()
          WHERE id = $2 AND (organization_id = $3 OR client_id = $3)
        `, [date, entityId, organizationId]);
      } else {
        await pool.query(`
          UPDATE campaigns
          SET end_date = COALESCE($1, end_date), updated_at = NOW()
          WHERE id = $2 AND (organization_id = $3 OR client_id = $3)
        `, [date, entityId, organizationId]);
      }
    }

    res.json({ success: true, id, date, endDate });
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('Update calendar event error:', error);
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to update calendar event'
      }
    });
  }
});

// ============================================================================
// Helper Functions
// ============================================================================

function mapCategoryToType(category: string | null): CalendarEvent['type'] {
  if (!category) return 'document';
  const map: Record<string, CalendarEvent['type']> = {
    'strategy': 'milestone',
    'creative': 'image',
    'dev': 'document',
    'tech': 'email',
    'video': 'video',
    'design': 'image',
    'marketing': 'email',
    'content': 'document'
  };
  return map[category.toLowerCase()] || 'document';
}

function mapApprovalToStatus(approvalStatus: string | null): CalendarEvent['status'] {
  if (!approvalStatus) return 'scheduled';
  const map: Record<string, CalendarEvent['status']> = {
    'draft': 'scheduled',
    'pending_review': 'in_progress',
    'approved': 'completed',
    'rejected': 'in_progress',
    'revision_requested': 'in_progress'
  };
  return map[approvalStatus] || 'scheduled';
}

function mapCampaignStatus(status: string | null): CalendarEvent['status'] {
  if (!status) return 'scheduled';
  const map: Record<string, CalendarEvent['status']> = {
    'draft': 'scheduled',
    'active': 'in_progress',
    'launching': 'in_progress',
    'paused': 'in_progress',
    'completed': 'completed',
    'failed': 'completed'
  };
  return map[status] || 'scheduled';
}

export default router;
