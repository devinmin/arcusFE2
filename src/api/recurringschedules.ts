/**
 * Recurring Schedules API Routes
 *
 * CRUD operations for recurring schedules, occurrences, and skip dates
 */

import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requireOrganization, getOrganizationId } from '../middleware/multiTenancy.js';
import { logger } from '../utils/logger.js';
import {
  createSchedule,
  getScheduleById,
  listSchedules,
  updateSchedule,
  deleteSchedule,
  getOccurrences,
  skipOccurrence,
  addSkipDate,
  getSkipDatesForSchedule,
  getOrgWideSkipDates,
  removeSkipDate,
  validatePattern,
  previewOccurrences,
  describePattern,
  generateOccurrencesForSchedule,
  RecurrencePattern,
  CreateScheduleInput
} from '../services/recurrenceService.js';
import { triggerSingleOccurrence } from '../workers/occurrenceWorker.js';

const router = Router();

// ============================================================================
// Schedule CRUD Routes
// ============================================================================

/**
 * POST /api/recurring-schedules
 * Create a new recurring schedule
 */
router.post('/', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req)!;
    const userId = (req as any).user?.id;

    const {
      name,
      description,
      entity_type,
      entity_template,
      recurrence_pattern,
      start_date,
      end_date,
      max_occurrences,
      campaign_id,
      workflow_id
    } = req.body;

    // Validate required fields
    if (!name || !entity_type || !recurrence_pattern || !start_date) {
      return res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Missing required fields: name, entity_type, recurrence_pattern, start_date'
        }
      });
    }

    // Validate pattern
    const patternValidation = validatePattern(recurrence_pattern);
    if (!patternValidation.valid) {
      return res.status(400).json({
        error: {
          code: 'INVALID_PATTERN',
          message: patternValidation.errors.join(', ')
        }
      });
    }

    const input: CreateScheduleInput = {
      organization_id: organizationId,
      name,
      description,
      entity_type,
      entity_template: entity_template || {},
      recurrence_pattern,
      start_date: new Date(start_date),
      end_date: end_date ? new Date(end_date) : undefined,
      max_occurrences,
      campaign_id,
      workflow_id,
      created_by: userId
    };

    const schedule = await createSchedule(input);

    res.status(201).json({
      schedule,
      pattern_description: describePattern(recurrence_pattern)
    });
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('Create recurring schedule error:', error);
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: err.message || 'Failed to create recurring schedule'
      }
    });
  }
});

/**
 * GET /api/recurring-schedules
 * List all recurring schedules
 */
router.get('/', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req)!;
    const {
      status,
      entity_type,
      campaign_id,
      limit = '50',
      offset = '0'
    } = req.query;

    const result = await listSchedules(organizationId, {
      status: status as string,
      entity_type: entity_type as string,
      campaign_id: campaign_id as string,
      limit: parseInt(limit as string),
      offset: parseInt(offset as string)
    });

    // Add pattern descriptions to each schedule
    const schedulesWithDescriptions = result.schedules.map(s => ({
      ...s,
      pattern_description: describePattern(s.recurrence_pattern as RecurrencePattern)
    }));

    res.json({
      schedules: schedulesWithDescriptions,
      total: result.total,
      limit: parseInt(limit as string),
      offset: parseInt(offset as string)
    });
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('List recurring schedules error:', error);
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to list recurring schedules'
      }
    });
  }
});

/**
 * GET /api/recurring-schedules/:id
 * Get a specific recurring schedule
 */
router.get('/:id', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req)!;
    const { id } = req.params;

    const schedule = await getScheduleById(id, organizationId);

    if (!schedule) {
      return res.status(404).json({
        error: {
          code: 'NOT_FOUND',
          message: 'Recurring schedule not found'
        }
      });
    }

    res.json({
      schedule,
      pattern_description: describePattern(schedule.recurrence_pattern as RecurrencePattern)
    });
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('Get recurring schedule error:', error);
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to get recurring schedule'
      }
    });
  }
});

/**
 * PATCH /api/recurring-schedules/:id
 * Update a recurring schedule
 */
router.patch('/:id', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req)!;
    const { id } = req.params;
    const updates = req.body;

    // Validate pattern if provided
    if (updates.recurrence_pattern) {
      const patternValidation = validatePattern(updates.recurrence_pattern);
      if (!patternValidation.valid) {
        return res.status(400).json({
          error: {
            code: 'INVALID_PATTERN',
            message: patternValidation.errors.join(', ')
          }
        });
      }
    }

    const schedule = await updateSchedule(id, organizationId, updates);

    if (!schedule) {
      return res.status(404).json({
        error: {
          code: 'NOT_FOUND',
          message: 'Recurring schedule not found'
        }
      });
    }

    res.json({
      schedule,
      pattern_description: describePattern(schedule.recurrence_pattern as RecurrencePattern)
    });
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('Update recurring schedule error:', error);
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: err.message || 'Failed to update recurring schedule'
      }
    });
  }
});

/**
 * DELETE /api/recurring-schedules/:id
 * Delete a recurring schedule
 */
router.delete('/:id', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req)!;
    const { id } = req.params;

    const deleted = await deleteSchedule(id, organizationId);

    if (!deleted) {
      return res.status(404).json({
        error: {
          code: 'NOT_FOUND',
          message: 'Recurring schedule not found'
        }
      });
    }

    res.json({ success: true, id });
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('Delete recurring schedule error:', error);
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to delete recurring schedule'
      }
    });
  }
});

// ============================================================================
// Pattern Preview Routes
// ============================================================================

/**
 * POST /api/recurring-schedules/preview
 * Preview occurrences for a pattern without saving
 */
router.post('/preview', requireAuth, async (req: Request, res: Response) => {
  try {
    const { recurrence_pattern, start_date, count = 10, skip_dates = [] } = req.body;

    if (!recurrence_pattern || !start_date) {
      return res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Missing required fields: recurrence_pattern, start_date'
        }
      });
    }

    // Validate pattern
    const patternValidation = validatePattern(recurrence_pattern);
    if (!patternValidation.valid) {
      return res.status(400).json({
        error: {
          code: 'INVALID_PATTERN',
          message: patternValidation.errors.join(', ')
        }
      });
    }

    const skipDateSet: Set<string> = new Set(skip_dates.map((d: string) => d.split('T')[0]));
    const dates = previewOccurrences(
      recurrence_pattern,
      new Date(start_date),
      Math.min(count, 50), // Cap at 50 for preview
      skipDateSet
    );

    res.json({
      pattern_description: describePattern(recurrence_pattern),
      count: dates.length,
      dates: dates.map(d => d.toISOString().split('T')[0])
    });
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('Preview occurrences error:', error);
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to preview occurrences'
      }
    });
  }
});

/**
 * POST /api/recurring-schedules/describe
 * Get human-readable description of a pattern
 */
router.post('/describe', requireAuth, async (req: Request, res: Response) => {
  try {
    const { recurrence_pattern } = req.body;

    if (!recurrence_pattern) {
      return res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Missing recurrence_pattern'
        }
      });
    }

    const patternValidation = validatePattern(recurrence_pattern);

    res.json({
      valid: patternValidation.valid,
      errors: patternValidation.errors,
      description: patternValidation.valid ? describePattern(recurrence_pattern) : null
    });
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('Describe pattern error:', error);
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to describe pattern'
      }
    });
  }
});

// ============================================================================
// Occurrence Routes
// ============================================================================

/**
 * GET /api/recurring-schedules/:id/occurrences
 * Get occurrences for a schedule
 */
router.get('/:id/occurrences', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req)!;
    const { id } = req.params;
    const {
      status,
      from_date,
      to_date,
      limit = '50',
      offset = '0'
    } = req.query;

    const result = await getOccurrences(id, organizationId, {
      status: status as string,
      from_date: from_date ? new Date(from_date as string) : undefined,
      to_date: to_date ? new Date(to_date as string) : undefined,
      limit: parseInt(limit as string),
      offset: parseInt(offset as string)
    });

    res.json({
      occurrences: result.occurrences,
      total: result.total,
      limit: parseInt(limit as string),
      offset: parseInt(offset as string)
    });
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('Get occurrences error:', error);
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to get occurrences'
      }
    });
  }
});

/**
 * POST /api/recurring-schedules/:id/occurrences/:occurrenceId/skip
 * Skip an occurrence
 */
router.post('/:id/occurrences/:occurrenceId/skip', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req)!;
    const { occurrenceId } = req.params;
    const { reason } = req.body;

    const skipped = await skipOccurrence(occurrenceId, organizationId, reason);

    if (!skipped) {
      return res.status(400).json({
        error: {
          code: 'SKIP_FAILED',
          message: 'Could not skip occurrence. It may already be processed or not found.'
        }
      });
    }

    res.json({ success: true, occurrenceId });
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('Skip occurrence error:', error);
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to skip occurrence'
      }
    });
  }
});

/**
 * POST /api/recurring-schedules/:id/occurrences/:occurrenceId/generate
 * Manually trigger generation for an occurrence
 */
router.post('/:id/occurrences/:occurrenceId/generate', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const { occurrenceId } = req.params;

    await triggerSingleOccurrence(occurrenceId);

    res.json({
      success: true,
      message: 'Generation triggered. Check occurrence status for result.',
      occurrenceId
    });
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('Trigger occurrence generation error:', error);
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to trigger occurrence generation'
      }
    });
  }
});

/**
 * POST /api/recurring-schedules/:id/regenerate
 * Regenerate future occurrences for a schedule
 */
router.post('/:id/regenerate', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req)!;
    const { id } = req.params;
    const { days_ahead = 90 } = req.body;

    const count = await generateOccurrencesForSchedule(
      id,
      organizationId,
      Math.min(days_ahead, 365) // Cap at 1 year
    );

    res.json({
      success: true,
      occurrencesGenerated: count,
      scheduleId: id
    });
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('Regenerate occurrences error:', error);
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to regenerate occurrences'
      }
    });
  }
});

// ============================================================================
// Skip Date Routes
// ============================================================================

/**
 * GET /api/recurring-schedules/:id/skip-dates
 * Get skip dates for a schedule
 */
router.get('/:id/skip-dates', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req)!;
    const { id } = req.params;

    const skipDates = await getSkipDatesForSchedule(id, organizationId);

    res.json({ skip_dates: skipDates });
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('Get skip dates error:', error);
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to get skip dates'
      }
    });
  }
});

/**
 * POST /api/recurring-schedules/:id/skip-dates
 * Add a skip date for a schedule
 */
router.post('/:id/skip-dates', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req)!;
    const userId = (req as any).user?.id;
    const { id } = req.params;
    const { date, reason } = req.body;

    if (!date) {
      return res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Missing required field: date'
        }
      });
    }

    const skipDate = await addSkipDate(organizationId, new Date(date), {
      schedule_id: id,
      reason,
      created_by: userId
    });

    res.status(201).json({ skip_date: skipDate });
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('Add skip date error:', error);
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to add skip date'
      }
    });
  }
});

/**
 * DELETE /api/recurring-schedules/:id/skip-dates/:skipDateId
 * Remove a skip date
 */
router.delete('/:id/skip-dates/:skipDateId', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req)!;
    const { skipDateId } = req.params;

    const removed = await removeSkipDate(skipDateId, organizationId);

    if (!removed) {
      return res.status(404).json({
        error: {
          code: 'NOT_FOUND',
          message: 'Skip date not found'
        }
      });
    }

    res.json({ success: true, id: skipDateId });
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('Remove skip date error:', error);
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to remove skip date'
      }
    });
  }
});

// ============================================================================
// Organization-Wide Skip Dates
// ============================================================================

/**
 * GET /api/recurring-schedules/org-skip-dates
 * Get organization-wide skip dates (holidays, etc.)
 */
router.get('/org-skip-dates', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req)!;
    const { from_date, to_date } = req.query;

    const skipDates = await getOrgWideSkipDates(
      organizationId,
      from_date ? new Date(from_date as string) : undefined,
      to_date ? new Date(to_date as string) : undefined
    );

    res.json({ skip_dates: skipDates });
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('Get org skip dates error:', error);
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to get organization skip dates'
      }
    });
  }
});

/**
 * POST /api/recurring-schedules/org-skip-dates
 * Add an organization-wide skip date (holiday)
 */
router.post('/org-skip-dates', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req)!;
    const userId = (req as any).user?.id;
    const { date, reason } = req.body;

    if (!date) {
      return res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Missing required field: date'
        }
      });
    }

    const skipDate = await addSkipDate(organizationId, new Date(date), {
      is_org_wide: true,
      reason,
      created_by: userId
    });

    res.status(201).json({ skip_date: skipDate });
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('Add org skip date error:', error);
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to add organization skip date'
      }
    });
  }
});

export default router;
