/**
 * Calendar Sync Routes
 *
 * REST API endpoints for external calendar integration and synchronization.
 * Handles OAuth flow, connection management, calendar discovery, and sync operations.
 */

import { Router, Request, Response, NextFunction } from 'express';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.js';
import { logger } from '../utils/logger.js';
import * as calendarSyncService from '../services/calendarSyncService.js';

const router = Router();

// ============================================================================
// OAuth Flow Routes
// ============================================================================

/**
 * GET /api/calendar-sync/auth/google
 * Initiate Google Calendar OAuth flow
 */
router.get(
  '/auth/google',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const organizationId = req.organizationId!;
      const userId = req.user!.id;

      // Create state token with user info for callback
      const state = Buffer.from(
        JSON.stringify({
          organizationId,
          userId,
          returnUrl: req.query.returnUrl || '/settings/integrations',
        })
      ).toString('base64');

      const authUrl = calendarSyncService.getGoogleAuthUrl(state);

      res.json({
        success: true,
        data: { authUrl },
      });
    } catch (error: unknown) {
    const err = error as Error;
      next(error);
    }
  }
);

/**
 * GET /api/calendar-sync/callback/google
 * Handle Google OAuth callback
 */
router.get('/callback/google', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { code, state, error } = req.query;

    if (error) {
      logger.error('Google OAuth error', { error });
      return res.redirect(`/settings/integrations?error=oauth_denied`);
    }

    if (!code || !state) {
      return res.redirect(`/settings/integrations?error=invalid_callback`);
    }

    // Decode state
    let stateData: { organizationId: string; userId: string; returnUrl: string };
    try {
      stateData = JSON.parse(Buffer.from(state as string, 'base64').toString());
    } catch {
      return res.redirect(`/settings/integrations?error=invalid_state`);
    }

    // Exchange code for tokens
    const tokens = await calendarSyncService.exchangeGoogleCode(code as string);

    // Create connection
    const connection = await calendarSyncService.createConnection(
      stateData.organizationId,
      stateData.userId,
      'google',
      tokens
    );

    // Discover calendars
    await calendarSyncService.discoverCalendars(connection.id);

    logger.info('Google Calendar connected', {
      connectionId: connection.id,
      organizationId: stateData.organizationId,
    });

    // Redirect back to app
    const returnUrl = stateData.returnUrl || '/settings/integrations';
    res.redirect(`${returnUrl}?connected=google`);
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('Google OAuth callback error', { error });
    res.redirect(`/settings/integrations?error=connection_failed`);
  }
});

// ============================================================================
// Connection Management Routes
// ============================================================================

/**
 * GET /api/calendar-sync/connections
 * List user's calendar connections
 */
router.get(
  '/connections',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const organizationId = req.organizationId!;
      const userId = req.user!.id;

      const connections = await calendarSyncService.getUserConnections(organizationId, userId);

      // Get stats for each connection
      const connectionsWithStats = await Promise.all(
        connections.map(async (conn) => {
          const stats = await calendarSyncService.getSyncStats(conn.id);
          return {
            ...conn,
            access_token: undefined, // Don't expose tokens
            refresh_token: undefined,
            stats,
          };
        })
      );

      res.json({
        success: true,
        data: connectionsWithStats,
      });
    } catch (error: unknown) {
    const err = error as Error;
      next(error);
    }
  }
);

/**
 * GET /api/calendar-sync/connections/:id
 * Get a specific connection
 */
router.get(
  '/connections/:id',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const connection = await calendarSyncService.getConnectionById(req.params.id);

      if (!connection || connection.organization_id !== req.organizationId) {
        return res.status(404).json({
          success: false,
          error: 'Connection not found',
        });
      }

      const stats = await calendarSyncService.getSyncStats(connection.id);
      const calendars = await calendarSyncService.getExternalCalendars(connection.id);

      res.json({
        success: true,
        data: {
          ...connection,
          access_token: undefined,
          refresh_token: undefined,
          stats,
          calendars,
        },
      });
    } catch (error: unknown) {
    const err = error as Error;
      next(error);
    }
  }
);

/**
 * PATCH /api/calendar-sync/connections/:id
 * Update connection settings
 */
router.patch(
  '/connections/:id',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const connection = await calendarSyncService.getConnectionById(req.params.id);

      if (!connection || connection.organization_id !== req.organizationId) {
        return res.status(404).json({
          success: false,
          error: 'Connection not found',
        });
      }

      const { sync_direction, auto_sync_enabled, sync_interval_minutes, selected_calendar_ids } =
        req.body;

      const updated = await calendarSyncService.updateConnection(connection.id, {
        sync_direction,
        auto_sync_enabled,
        sync_interval_minutes,
        selected_calendar_ids,
      });

      res.json({
        success: true,
        data: {
          ...updated,
          access_token: undefined,
          refresh_token: undefined,
        },
      });
    } catch (error: unknown) {
    const err = error as Error;
      next(error);
    }
  }
);

/**
 * DELETE /api/calendar-sync/connections/:id
 * Delete a connection
 */
router.delete(
  '/connections/:id',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const connection = await calendarSyncService.getConnectionById(req.params.id);

      if (!connection || connection.organization_id !== req.organizationId) {
        return res.status(404).json({
          success: false,
          error: 'Connection not found',
        });
      }

      await calendarSyncService.deleteConnection(connection.id);

      res.json({
        success: true,
        message: 'Connection deleted',
      });
    } catch (error: unknown) {
    const err = error as Error;
      next(error);
    }
  }
);

/**
 * POST /api/calendar-sync/connections/:id/test
 * Test connection health
 */
router.post(
  '/connections/:id/test',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const connection = await calendarSyncService.getConnectionById(req.params.id);

      if (!connection || connection.organization_id !== req.organizationId) {
        return res.status(404).json({
          success: false,
          error: 'Connection not found',
        });
      }

      const result = await calendarSyncService.testConnection(connection.id);

      res.json({
        success: true,
        data: result,
      });
    } catch (error: unknown) {
    const err = error as Error;
      next(error);
    }
  }
);

// ============================================================================
// Calendar Discovery Routes
// ============================================================================

/**
 * POST /api/calendar-sync/connections/:id/discover
 * Refresh calendar list from provider
 */
router.post(
  '/connections/:id/discover',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const connection = await calendarSyncService.getConnectionById(req.params.id);

      if (!connection || connection.organization_id !== req.organizationId) {
        return res.status(404).json({
          success: false,
          error: 'Connection not found',
        });
      }

      const calendars = await calendarSyncService.discoverCalendars(connection.id);

      res.json({
        success: true,
        data: calendars,
      });
    } catch (error: unknown) {
    const err = error as Error;
      next(error);
    }
  }
);

/**
 * GET /api/calendar-sync/connections/:id/calendars
 * List calendars for a connection
 */
router.get(
  '/connections/:id/calendars',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const connection = await calendarSyncService.getConnectionById(req.params.id);

      if (!connection || connection.organization_id !== req.organizationId) {
        return res.status(404).json({
          success: false,
          error: 'Connection not found',
        });
      }

      const calendars = await calendarSyncService.getExternalCalendars(connection.id);

      res.json({
        success: true,
        data: calendars,
      });
    } catch (error: unknown) {
    const err = error as Error;
      next(error);
    }
  }
);

/**
 * PATCH /api/calendar-sync/calendars/:id
 * Update calendar selection
 */
router.patch(
  '/calendars/:id',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { is_selected } = req.body;

      if (typeof is_selected !== 'boolean') {
        return res.status(400).json({
          success: false,
          error: 'is_selected must be a boolean',
        });
      }

      const calendar = await calendarSyncService.updateCalendarSelection(
        req.params.id,
        is_selected
      );

      res.json({
        success: true,
        data: calendar,
      });
    } catch (error: unknown) {
    const err = error as Error;
      next(error);
    }
  }
);

// ============================================================================
// Sync Operations Routes
// ============================================================================

/**
 * POST /api/calendar-sync/connections/:id/sync
 * Trigger a full sync for a connection
 */
router.post(
  '/connections/:id/sync',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const connection = await calendarSyncService.getConnectionById(req.params.id);

      if (!connection || connection.organization_id !== req.organizationId) {
        return res.status(404).json({
          success: false,
          error: 'Connection not found',
        });
      }

      const result = await calendarSyncService.fullSync(connection.id);

      res.json({
        success: true,
        data: result,
      });
    } catch (error: unknown) {
    const err = error as Error;
      next(error);
    }
  }
);

/**
 * POST /api/calendar-sync/push
 * Push an internal entity to external calendar
 */
router.post(
  '/push',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { connection_id, calendar_id, entity_type, entity_id, event } = req.body;

      if (!connection_id || !calendar_id || !entity_type || !entity_id || !event) {
        return res.status(400).json({
          success: false,
          error: 'Missing required fields',
        });
      }

      const connection = await calendarSyncService.getConnectionById(connection_id);

      if (!connection || connection.organization_id !== req.organizationId) {
        return res.status(404).json({
          success: false,
          error: 'Connection not found',
        });
      }

      // Parse dates
      const calendarEvent = {
        ...event,
        start: new Date(event.start),
        end: new Date(event.end),
      };

      const externalEventId = await calendarSyncService.pushToExternalCalendar(
        connection_id,
        calendar_id,
        entity_type,
        entity_id,
        calendarEvent
      );

      res.json({
        success: true,
        data: { external_event_id: externalEventId },
      });
    } catch (error: unknown) {
    const err = error as Error;
      next(error);
    }
  }
);

/**
 * DELETE /api/calendar-sync/push/:connectionId/:entityType/:entityId
 * Delete an entity from external calendar
 */
router.delete(
  '/push/:connectionId/:entityType/:entityId',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { connectionId, entityType, entityId } = req.params;

      const connection = await calendarSyncService.getConnectionById(connectionId);

      if (!connection || connection.organization_id !== req.organizationId) {
        return res.status(404).json({
          success: false,
          error: 'Connection not found',
        });
      }

      await calendarSyncService.deleteFromExternalCalendar(connectionId, entityType, entityId);

      res.json({
        success: true,
        message: 'Event deleted from external calendar',
      });
    } catch (error: unknown) {
    const err = error as Error;
      next(error);
    }
  }
);

// ============================================================================
// Conflict Resolution Routes
// ============================================================================

/**
 * GET /api/calendar-sync/conflicts
 * List sync conflicts
 */
router.get(
  '/conflicts',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const conflicts = await calendarSyncService.getConflicts(req.organizationId!);

      res.json({
        success: true,
        data: conflicts,
      });
    } catch (error: unknown) {
    const err = error as Error;
      next(error);
    }
  }
);

/**
 * POST /api/calendar-sync/conflicts/:id/resolve
 * Resolve a sync conflict
 */
router.post(
  '/conflicts/:id/resolve',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { resolution, merged_data } = req.body;

      if (!['internal_wins', 'external_wins', 'merged'].includes(resolution)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid resolution type',
        });
      }

      await calendarSyncService.resolveConflict(req.params.id, resolution, merged_data);

      res.json({
        success: true,
        message: 'Conflict resolved',
      });
    } catch (error: unknown) {
    const err = error as Error;
      next(error);
    }
  }
);

// ============================================================================
// Webhook Routes
// ============================================================================

/**
 * POST /api/calendar-sync/connections/:id/webhooks
 * Setup webhook for a calendar
 */
router.post(
  '/connections/:id/webhooks',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { calendar_id } = req.body;

      const connection = await calendarSyncService.getConnectionById(req.params.id);

      if (!connection || connection.organization_id !== req.organizationId) {
        return res.status(404).json({
          success: false,
          error: 'Connection not found',
        });
      }

      const webhook = await calendarSyncService.setupWebhook(connection.id, calendar_id);

      res.json({
        success: true,
        data: webhook,
      });
    } catch (error: unknown) {
    const err = error as Error;
      next(error);
    }
  }
);

/**
 * POST /api/calendar-sync/webhook/google
 * Handle Google Calendar webhook notifications (no auth - called by Google)
 */
router.post('/webhook/google', async (req: Request, res: Response) => {
  try {
    const channelId = req.headers['x-goog-channel-id'] as string;
    const resourceId = req.headers['x-goog-resource-id'] as string;
    const resourceState = req.headers['x-goog-resource-state'] as string;

    if (!channelId) {
      return res.status(400).send('Missing channel ID');
    }

    logger.info('Google Calendar webhook received', {
      channelId,
      resourceId,
      resourceState,
    });

    await calendarSyncService.handleWebhookNotification(channelId, resourceId, resourceState);

    // Google expects 200 OK within 30 seconds
    res.status(200).send('OK');
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('Webhook processing error', { error });
    // Still return 200 to prevent Google from retrying
    res.status(200).send('OK');
  }
});

/**
 * DELETE /api/calendar-sync/webhooks/:id
 * Stop a webhook
 */
router.delete(
  '/webhooks/:id',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      await calendarSyncService.stopWebhook(req.params.id);

      res.json({
        success: true,
        message: 'Webhook stopped',
      });
    } catch (error: unknown) {
    const err = error as Error;
      next(error);
    }
  }
);

// ============================================================================
// Stats and History Routes
// ============================================================================

/**
 * GET /api/calendar-sync/connections/:id/stats
 * Get sync statistics for a connection
 */
router.get(
  '/connections/:id/stats',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const connection = await calendarSyncService.getConnectionById(req.params.id);

      if (!connection || connection.organization_id !== req.organizationId) {
        return res.status(404).json({
          success: false,
          error: 'Connection not found',
        });
      }

      const stats = await calendarSyncService.getSyncStats(connection.id);

      res.json({
        success: true,
        data: stats,
      });
    } catch (error: unknown) {
    const err = error as Error;
      next(error);
    }
  }
);

export default router;
