/**
 * Proactive Suggestions Routes
 * Sprint 10: Final Polish
 *
 * API endpoints for proactive suggestions: fetching, interacting, and managing preferences.
 */

import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requireOrganization } from '../middleware/multiTenancy.js';
import { getUserId, getOrganizationId } from '../middleware/multiTenancy.js';
import { proactiveSuggestionService } from '../services/proactiveSuggestionService.js';
import { queueRealTimeTrigger, triggerEvaluation } from '../workers/suggestionWorker.js';
import { logger } from '../utils/logger.js';

const router = Router();

const VALID_INTERACTION_TYPES = ['click', 'dismiss', 'snooze'];
const VALID_SUGGESTION_TYPES = ['optimize', 'new_feature', 'fix_issue', 'insight'];

/**
 * GET /api/suggestions
 * Get active suggestions for the current user
 */
router.get('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req)!;
    const organizationId = getOrganizationId(req);
    const limit = Math.min(parseInt(req.query.limit as string) || 5, 20);

    if (!organizationId) {
      return res.status(400).json({
        error: { code: 'MISSING_ORG', message: 'Organization context required' },
      });
    }

    const suggestions = await proactiveSuggestionService.getSuggestionsForUser(
      userId,
      organizationId,
      limit
    );

    res.json({ suggestions });
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('[SuggestionsRoutes] Failed to get suggestions', { error });
    res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: 'Failed to get suggestions' },
    });
  }
});

/**
 * POST /api/suggestions/:id/shown
 * Mark a suggestion as shown to the user
 */
router.post('/:id/shown', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    if (!id || !/^[0-9a-f-]{36}$/i.test(id)) {
      return res.status(400).json({
        error: { code: 'INVALID_ID', message: 'Invalid suggestion ID' },
      });
    }

    await proactiveSuggestionService.markShown(id);

    res.json({ success: true });
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('[SuggestionsRoutes] Failed to mark suggestion as shown', { error });
    res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: 'Failed to mark suggestion as shown' },
    });
  }
});

/**
 * POST /api/suggestions/:id/interact
 * Record user interaction with a suggestion
 */
router.post('/:id/interact', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { interactionType, snoozeHours } = req.body;

    if (!id || !/^[0-9a-f-]{36}$/i.test(id)) {
      return res.status(400).json({
        error: { code: 'INVALID_ID', message: 'Invalid suggestion ID' },
      });
    }

    if (!VALID_INTERACTION_TYPES.includes(interactionType)) {
      return res.status(400).json({
        error: {
          code: 'INVALID_INTERACTION',
          message: `Invalid interaction type. Must be one of: ${VALID_INTERACTION_TYPES.join(', ')}`,
        },
      });
    }

    if (interactionType === 'snooze') {
      const validSnoozeHours = [1, 4, 24, 168]; // 1 hour, 4 hours, 1 day, 1 week
      if (snoozeHours && !validSnoozeHours.includes(snoozeHours)) {
        return res.status(400).json({
          error: {
            code: 'INVALID_SNOOZE',
            message: `Invalid snooze duration. Must be one of: ${validSnoozeHours.join(', ')} hours`,
          },
        });
      }
    }

    await proactiveSuggestionService.recordInteraction(
      id,
      interactionType,
      interactionType === 'snooze' ? snoozeHours || 24 : undefined
    );

    res.json({ success: true });
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('[SuggestionsRoutes] Failed to record interaction', { error });
    res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: 'Failed to record interaction' },
    });
  }
});

/**
 * GET /api/suggestions/preferences
 * Get suggestion preferences for the current user
 */
router.get('/preferences', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req)!;
    const organizationId = getOrganizationId(req);

    if (!organizationId) {
      return res.status(400).json({
        error: { code: 'MISSING_ORG', message: 'Organization context required' },
      });
    }

    const preferences = await proactiveSuggestionService.getPreferences(userId, organizationId);

    res.json({ preferences });
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('[SuggestionsRoutes] Failed to get preferences', { error });
    res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: 'Failed to get suggestion preferences' },
    });
  }
});

/**
 * PUT /api/suggestions/preferences
 * Update suggestion preferences for the current user
 */
router.put('/preferences', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req)!;
    const organizationId = getOrganizationId(req);
    const input = req.body;

    if (!organizationId) {
      return res.status(400).json({
        error: { code: 'MISSING_ORG', message: 'Organization context required' },
      });
    }

    // Validate enabled types
    if (input.enabledTypes) {
      const invalidTypes = input.enabledTypes.filter(
        (t: string) => !VALID_SUGGESTION_TYPES.includes(t)
      );
      if (invalidTypes.length > 0) {
        return res.status(400).json({
          error: {
            code: 'INVALID_TYPES',
            message: `Invalid suggestion types: ${invalidTypes.join(', ')}`,
          },
        });
      }
    }

    // Validate max suggestions per day
    if (input.maxSuggestionsPerDay !== undefined) {
      if (input.maxSuggestionsPerDay < 0 || input.maxSuggestionsPerDay > 50) {
        return res.status(400).json({
          error: {
            code: 'INVALID_MAX',
            message: 'Max suggestions per day must be between 0 and 50',
          },
        });
      }
    }

    // Validate min priority
    if (input.minPriority !== undefined) {
      if (input.minPriority < 1 || input.minPriority > 100) {
        return res.status(400).json({
          error: {
            code: 'INVALID_PRIORITY',
            message: 'Min priority must be between 1 and 100',
          },
        });
      }
    }

    // Validate quiet hours format
    const timeRegex = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;
    if (input.quietHoursStart && !timeRegex.test(input.quietHoursStart)) {
      return res.status(400).json({
        error: { code: 'INVALID_TIME', message: 'Quiet hours start must be in HH:mm format' },
      });
    }
    if (input.quietHoursEnd && !timeRegex.test(input.quietHoursEnd)) {
      return res.status(400).json({
        error: { code: 'INVALID_TIME', message: 'Quiet hours end must be in HH:mm format' },
      });
    }

    // Validate default snooze hours
    if (input.defaultSnoozeHours !== undefined) {
      const validSnoozeHours = [1, 4, 24, 168];
      if (!validSnoozeHours.includes(input.defaultSnoozeHours)) {
        return res.status(400).json({
          error: {
            code: 'INVALID_SNOOZE',
            message: `Default snooze must be one of: ${validSnoozeHours.join(', ')} hours`,
          },
        });
      }
    }

    const preferences = await proactiveSuggestionService.updatePreferences(
      userId,
      organizationId,
      input
    );

    res.json({ preferences });
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('[SuggestionsRoutes] Failed to update preferences', { error });
    res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: 'Failed to update suggestion preferences' },
    });
  }
});

/**
 * GET /api/suggestions/triggers
 * Get active suggestion triggers for the organization
 */
router.get('/triggers', requireAuth, async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);

    if (!organizationId) {
      return res.status(400).json({
        error: { code: 'MISSING_ORG', message: 'Organization context required' },
      });
    }

    const triggers = await proactiveSuggestionService.getActiveTriggers(organizationId);

    res.json({ triggers });
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('[SuggestionsRoutes] Failed to get triggers', { error });
    res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: 'Failed to get suggestion triggers' },
    });
  }
});

/**
 * POST /api/suggestions/triggers/:triggerId/mute
 * Mute a specific trigger for the current user
 */
router.post('/triggers/:triggerId/mute', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req)!;
    const organizationId = getOrganizationId(req);
    const { triggerId } = req.params;

    if (!organizationId) {
      return res.status(400).json({
        error: { code: 'MISSING_ORG', message: 'Organization context required' },
      });
    }

    if (!triggerId || !/^[0-9a-f-]{36}$/i.test(triggerId)) {
      return res.status(400).json({
        error: { code: 'INVALID_ID', message: 'Invalid trigger ID' },
      });
    }

    // Get current preferences and add trigger to muted list
    const currentPrefs = await proactiveSuggestionService.getPreferences(userId, organizationId);
    const mutedTriggers = [...(currentPrefs?.mutedTriggerIds || [])];

    if (!mutedTriggers.includes(triggerId)) {
      mutedTriggers.push(triggerId);
      await proactiveSuggestionService.updatePreferences(userId, organizationId, {
        mutedTriggerIds: mutedTriggers,
      });
    }

    res.json({ success: true, mutedTriggers });
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('[SuggestionsRoutes] Failed to mute trigger', { error });
    res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: 'Failed to mute trigger' },
    });
  }
});

/**
 * POST /api/suggestions/triggers/:triggerId/unmute
 * Unmute a specific trigger for the current user
 */
router.post('/triggers/:triggerId/unmute', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req)!;
    const organizationId = getOrganizationId(req);
    const { triggerId } = req.params;

    if (!organizationId) {
      return res.status(400).json({
        error: { code: 'MISSING_ORG', message: 'Organization context required' },
      });
    }

    if (!triggerId || !/^[0-9a-f-]{36}$/i.test(triggerId)) {
      return res.status(400).json({
        error: { code: 'INVALID_ID', message: 'Invalid trigger ID' },
      });
    }

    // Get current preferences and remove trigger from muted list
    const currentPrefs = await proactiveSuggestionService.getPreferences(userId, organizationId);
    const mutedTriggers = (currentPrefs?.mutedTriggerIds || []).filter(
      (id: string) => id !== triggerId
    );

    await proactiveSuggestionService.updatePreferences(userId, organizationId, {
      mutedTriggerIds: mutedTriggers,
    });

    res.json({ success: true, mutedTriggers });
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('[SuggestionsRoutes] Failed to unmute trigger', { error });
    res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: 'Failed to unmute trigger' },
    });
  }
});

/**
 * POST /api/suggestions/evaluate
 * Manually trigger suggestion evaluation for the organization (admin only)
 */
router.post('/evaluate', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);

    if (!organizationId) {
      return res.status(400).json({
        error: { code: 'MISSING_ORG', message: 'Organization context required' },
      });
    }

    // Queue the evaluation job
    await triggerEvaluation(organizationId);

    res.json({
      success: true,
      message: 'Suggestion evaluation queued',
    });
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('[SuggestionsRoutes] Failed to queue evaluation', { error });
    res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: 'Failed to queue suggestion evaluation' },
    });
  }
});

/**
 * POST /api/suggestions/event
 * Queue a real-time event trigger (internal use)
 */
router.post('/event', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const { eventType, entityId, entityType, metadata } = req.body;

    if (!organizationId) {
      return res.status(400).json({
        error: { code: 'MISSING_ORG', message: 'Organization context required' },
      });
    }

    if (!eventType) {
      return res.status(400).json({
        error: { code: 'MISSING_EVENT_TYPE', message: 'Event type is required' },
      });
    }

    // Queue the real-time trigger
    await queueRealTimeTrigger({
      eventType,
      organizationId,
      entityId,
      entityType,
      metadata,
    });

    res.json({
      success: true,
      message: 'Event trigger queued',
    });
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('[SuggestionsRoutes] Failed to queue event trigger', { error });
    res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: 'Failed to queue event trigger' },
    });
  }
});

/**
 * GET /api/suggestions/analytics
 * Get suggestion analytics for the organization
 */
router.get('/analytics', requireAuth, async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const periodType = (req.query.period as string) || 'daily';
    const limit = Math.min(parseInt(req.query.limit as string) || 30, 90);

    if (!organizationId) {
      return res.status(400).json({
        error: { code: 'MISSING_ORG', message: 'Organization context required' },
      });
    }

    const validPeriodTypes = ['hourly', 'daily', 'weekly'];
    if (!validPeriodTypes.includes(periodType)) {
      return res.status(400).json({
        error: {
          code: 'INVALID_PERIOD',
          message: `Invalid period type. Must be one of: ${validPeriodTypes.join(', ')}`,
        },
      });
    }

    const analytics = await proactiveSuggestionService.getAnalytics(
      organizationId,
      periodType as 'hourly' | 'daily' | 'weekly',
      limit
    );

    res.json({ analytics });
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('[SuggestionsRoutes] Failed to get analytics', { error });
    res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: 'Failed to get suggestion analytics' },
    });
  }
});

export default router;
