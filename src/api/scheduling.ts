import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { requireOrganization } from '../middleware/multiTenancy.js';
import { composioService } from '../services/composioService.js';
import { logger } from '../utils/logger.js';
import { pool } from '../database/db.js';

const router = Router();

const createEventSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  start_time: z.string().datetime(),
  end_time: z.string().datetime(),
  timezone: z.string().min(1),
  provider: z.string().default('google_calendar'),
  campaign_id: z.string().uuid().optional(),
  deliverable_id: z.string().uuid().optional(),
});

/**
 * POST /api/schedule/calendar
 * Create a calendar event via Composio
 */
router.post('/calendar', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const user = req.user!;
    const body = createEventSchema.parse(req.body);

    const result = await composioService.executeAction(
      user.id,
      body.provider,
      'create_event',
      {
        summary: body.title,
        description: body.description || '',
        start: { dateTime: body.start_time, timeZone: body.timezone },
        end: { dateTime: body.end_time, timeZone: body.timezone },
      },
      body.campaign_id
    );

    res.status(201).json({
      success: true,
      provider: body.provider,
      event: result,
    });
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('Schedule calendar event failed:', error);
    res.status(500).json({
      error: {
        code: 'SCHEDULE_ERROR',
        message: err.message || 'Failed to schedule calendar event',
      },
    });
  }
});

/**
 * GET /api/schedule/events
 * List scheduled calendar events (from execution logs)
 * Query: from (ISO), to (ISO)
 */
router.get('/events', requireAuth, async (req: Request, res: Response) => {
  try {
    const user = req.user!;
    const from = req.query.from ? new Date(String(req.query.from)) : new Date(Date.now() - 7 * 24 * 3600 * 1000);
    const to = req.query.to ? new Date(String(req.query.to)) : new Date(Date.now() + 30 * 24 * 3600 * 1000);

    const { rows } = await pool.query(
      `
      SELECT e.id, e.request_data, e.response_data, e.executed_at, c.tool_name
      FROM composio_executions e
      JOIN composio_connections c ON c.id = e.connection_id
      WHERE c.client_id = $1
        AND e.action = 'create_event'
        AND e.executed_at BETWEEN $2 AND $3
        AND e.status = 'success'
      ORDER BY e.executed_at DESC
      `,
      [user.id, from.toISOString(), to.toISOString()]
    );

    const events = rows.map((r) => {
      const req = r.request_data || {};
      const title = req.summary || 'Scheduled Item';
      const start = req.start?.dateTime || req.start_time || r.executed_at;
      const end = req.end?.dateTime || req.end_time || req.start?.dateTime || r.executed_at;
      return {
        id: r.id,
        title,
        start_time: start,
        end_time: end,
        provider: r.tool_name,
      };
    });

    res.json({ events });
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('List events failed:', error);
    res.status(500).json({
      error: { code: 'LIST_EVENTS_ERROR', message: err.message || 'Failed to list events' },
    });
  }
});

/**
 * PATCH /api/schedule/event/:id
 * Update scheduled event times (best-effort updates composio_executions request_data and executed_at)
 */
router.patch('/event/:id', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { start_time, end_time } = req.body || {};
    if (!start_time && !end_time) {
      return res.status(400).json({ error: { code: 'INVALID_INPUT', message: 'start_time or end_time required' } });
    }

    const { rows } = await pool.query(`
      UPDATE composio_executions
      SET request_data = COALESCE(request_data, '{}'::jsonb) || $1::jsonb,
          executed_at = COALESCE($2::timestamptz, executed_at),
          updated_at = NOW()
      WHERE id = $3
      RETURNING id
    `, [JSON.stringify({ start_time, end_time }), start_time ? new Date(start_time).toISOString() : null, id]);

    if (rows.length === 0) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Event not found' } });
    }

    res.json({ success: true });
  } catch (error: unknown) {
    const err = error as Error;
    res.status(500).json({ error: { code: 'UPDATE_FAILED', message: err.message || 'Failed to update event' } });
  }
});

export default router;
