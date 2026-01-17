/**
 * Notification Preferences Routes
 *
 * API endpoints for notification settings: channels, types, frequency, digests.
 */

import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requireOrganization } from '../middleware/multiTenancy.js';
import { getUserId } from '../middleware/multiTenancy.js';
import { notificationPreferencesService, DigestFrequency, NotificationChannel } from '../services/notificationPreferencesService.js';
import { logger } from '../utils/logger.js';

const router = Router();

const VALID_CHANNELS: NotificationChannel[] = ['email', 'push', 'sms', 'slack'];
const VALID_FREQUENCIES = ['immediate', 'hourly', 'daily', 'weekly', 'never'];
const VALID_DIGEST_FREQUENCIES: DigestFrequency[] = ['daily', 'weekly', 'never'];

/**
 * GET /api/notifications/preferences
 * Get notification preferences for the current user
 */
router.get(
  '/preferences',
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req)!;
      const preferences = await notificationPreferencesService.getPreferences(userId);
      const notificationTypes = notificationPreferencesService.getNotificationTypes();

      res.json({ preferences, notificationTypes });
    } catch (error: unknown) {
    const err = error as Error;
      logger.error('[NotificationRoutes] Failed to get preferences', { error });
      res.status(500).json({
        error: { code: 'INTERNAL_ERROR', message: 'Failed to get notification preferences' },
      });
    }
  }
);

/**
 * PUT /api/notifications/preferences
 * Save all notification preferences
 */
router.put(
  '/preferences',
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req)!;
      const input = req.body;

      // Validate digest frequency if provided
      if (input.digestFrequency && !VALID_DIGEST_FREQUENCIES.includes(input.digestFrequency)) {
        return res.status(400).json({
          error: { code: 'INVALID_FREQUENCY', message: 'Invalid digest frequency' },
        });
      }

      // Validate day of week
      if (input.digestDayOfWeek !== undefined && (input.digestDayOfWeek < 0 || input.digestDayOfWeek > 6)) {
        return res.status(400).json({
          error: { code: 'INVALID_DAY', message: 'Day of week must be 0-6 (Sunday-Saturday)' },
        });
      }

      // Validate time format
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
      if (input.digestTime && !timeRegex.test(input.digestTime)) {
        return res.status(400).json({
          error: { code: 'INVALID_TIME', message: 'Digest time must be in HH:mm format' },
        });
      }

      const preferences = await notificationPreferencesService.savePreferences(userId, input);

      res.json({ preferences });
    } catch (error: unknown) {
    const err = error as Error;
      logger.error('[NotificationRoutes] Failed to save preferences', { error });
      res.status(500).json({
        error: { code: 'INTERNAL_ERROR', message: 'Failed to save notification preferences' },
      });
    }
  }
);

/**
 * PATCH /api/notifications/preferences
 * Update specific notification preference fields
 */
router.patch(
  '/preferences',
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req)!;
      const updates = req.body;

      const preferences = await notificationPreferencesService.savePreferences(userId, updates);

      res.json({ preferences });
    } catch (error: unknown) {
    const err = error as Error;
      logger.error('[NotificationRoutes] Failed to update preferences', { error });
      res.status(500).json({
        error: { code: 'INTERNAL_ERROR', message: 'Failed to update notification preferences' },
      });
    }
  }
);

/**
 * PATCH /api/notifications/preferences/type/:type
 * Update preferences for a specific notification type
 */
router.patch(
  '/preferences/type/:type',
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req)!;
      const { type } = req.params;
      const config = req.body;

      // Validate frequency if provided
      if (config.frequency && !VALID_FREQUENCIES.includes(config.frequency)) {
        return res.status(400).json({
          error: { code: 'INVALID_FREQUENCY', message: 'Invalid notification frequency' },
        });
      }

      const preferences = await notificationPreferencesService.updateTypePreference(userId, type, config);

      res.json({ preferences });
    } catch (error: unknown) {
    const err = error as Error;
      logger.error('[NotificationRoutes] Failed to update type preference', { error });
      res.status(500).json({
        error: { code: 'INTERNAL_ERROR', message: 'Failed to update notification type preferences' },
      });
    }
  }
);

/**
 * POST /api/notifications/preferences/channel/:channel/toggle
 * Toggle a notification channel on/off for all types
 */
router.post(
  '/preferences/channel/:channel/toggle',
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req)!;
      const { channel } = req.params;
      const { enabled } = req.body;

      if (!VALID_CHANNELS.includes(channel as NotificationChannel)) {
        return res.status(400).json({
          error: { code: 'INVALID_CHANNEL', message: 'Invalid notification channel' },
        });
      }

      if (typeof enabled !== 'boolean') {
        return res.status(400).json({
          error: { code: 'INVALID_INPUT', message: 'enabled must be a boolean' },
        });
      }

      const preferences = await notificationPreferencesService.toggleChannel(
        userId,
        channel as NotificationChannel,
        enabled
      );

      res.json({ preferences });
    } catch (error: unknown) {
    const err = error as Error;
      logger.error('[NotificationRoutes] Failed to toggle channel', { error });
      res.status(500).json({
        error: { code: 'INTERNAL_ERROR', message: 'Failed to toggle notification channel' },
      });
    }
  }
);

/**
 * DELETE /api/notifications/preferences
 * Reset notification preferences to defaults
 */
router.delete(
  '/preferences',
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req)!;
      const preferences = await notificationPreferencesService.resetToDefaults(userId);

      res.json({ preferences, message: 'Notification preferences reset to defaults' });
    } catch (error: unknown) {
    const err = error as Error;
      logger.error('[NotificationRoutes] Failed to reset preferences', { error });
      res.status(500).json({
        error: { code: 'INTERNAL_ERROR', message: 'Failed to reset notification preferences' },
      });
    }
  }
);

/**
 * GET /api/notifications/types
 * Get available notification types metadata (no auth required)
 */
router.get(
  '/types',
  async (_req: Request, res: Response) => {
    const types = notificationPreferencesService.getNotificationTypes();
    res.json({ types });
  }
);

export default router;
