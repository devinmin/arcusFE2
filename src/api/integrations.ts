import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { integrationHubService } from '../services/integrationHubService.js';
import { logger } from '../utils/logger.js';
import { pool } from '../database/db.js';

const router = Router();

/**
 * GET /api/integrations
 * List available integrations with connection status
 */
router.get('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const organizationId = req.user!.organizationId;

    if (!organizationId) {
      return res.status(400).json({
        error: {
          code: 'NO_ORGANIZATION',
          message: 'User does not belong to an organization'
        }
      });
    }

    const integrations = await integrationHubService.listIntegrations(organizationId);

    res.json({
      data: {
        integrations
      }
    });
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('Failed to list integrations:', error);
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to list integrations'
      }
    });
  }
});

/**
 * GET /api/integrations/:platform/status
 * Get connection status for a specific platform
 */
router.get('/:platform/status', requireAuth, async (req: Request, res: Response) => {
  try {
    const { platform } = req.params;
    const organizationId = req.user!.organizationId;

    if (!organizationId) {
      return res.status(400).json({
        error: {
          code: 'NO_ORGANIZATION',
          message: 'User does not belong to an organization'
        }
      });
    }

    const { rows } = await pool.query(
      `SELECT ic.id, ic.status, ic.last_verified_at, ic.error_message, ic.created_at,
              i.display_name
       FROM integration_connections ic
       JOIN integrations i ON ic.integration_id = i.id
       WHERE ic.organization_id = $1 AND i.platform = $2`,
      [organizationId, platform]
    );

    if (rows.length === 0) {
      return res.json({
        data: {
          connected: false,
          platform
        }
      });
    }

    const connection = rows[0];

    // Check health if connected
    let health = null;
    if (connection.status === 'connected') {
      try {
        health = await integrationHubService.checkConnectionHealth(connection.id);
      } catch (error: unknown) {
    const err = error as Error;
        logger.warn('Failed to check connection health:', error);
      }
    }

    res.json({
      data: {
        connected: connection.status === 'connected',
        platform,
        display_name: connection.display_name,
        connection_id: connection.id,
        status: connection.status,
        last_verified_at: connection.last_verified_at,
        error_message: connection.error_message,
        connected_at: connection.created_at,
        health
      }
    });
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('Failed to get integration status:', error);
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to get integration status'
      }
    });
  }
});

/**
 * POST /api/integrations/:platform/connect
 * Initiate OAuth flow for a platform
 */
router.post('/:platform/connect', requireAuth, async (req: Request, res: Response) => {
  try {
    const { platform } = req.params;
    const organizationId = req.user!.organizationId;

    if (!organizationId) {
      return res.status(400).json({
        error: {
          code: 'NO_ORGANIZATION',
          message: 'User does not belong to an organization'
        }
      });
    }

    const { authUrl } = await integrationHubService.initiateConnection(organizationId, platform);

    res.json({
      data: {
        auth_url: authUrl
      }
    });
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('Failed to initiate connection:', error);
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: err.message || 'Failed to initiate connection'
      }
    });
  }
});

/**
 * POST /api/integrations/:platform/callback
 * OAuth callback handler
 */
router.post('/:platform/callback', async (req: Request, res: Response) => {
  try {
    const { platform } = req.params;
    const { code, state } = req.body;

    if (!code) {
      return res.status(400).json({
        error: {
          code: 'MISSING_CODE',
          message: 'Authorization code is required'
        }
      });
    }

    // Parse state to get organization and connection info
    let stateData: any = {};
    try {
      stateData = state ? JSON.parse(state) : {};
    } catch (e) {
      logger.warn('Failed to parse state:', state);
    }

    // For now, require organizationId to be passed in state or body
    const organizationId = stateData.organizationId || req.body.organization_id;
    if (!organizationId) {
      return res.status(400).json({
        error: {
          code: 'NO_ORGANIZATION',
          message: 'Organization ID required in state or body'
        }
      });
    }

    const connection = await integrationHubService.completeConnection(
      organizationId,
      platform,
      code,
      stateData.connectionId,
      stateData.codeVerifier
    );

    res.json({
      data: {
        message: 'Integration connected successfully',
        connection_id: connection.id,
        platform: connection.platform,
        status: connection.status
      }
    });
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('Failed to complete OAuth callback:', error);
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: err.message || 'Failed to complete connection'
      }
    });
  }
});

/**
 * GET /api/integrations/:platform/callback
 * OAuth callback handler (GET version for browser redirects)
 */
router.get('/:platform/callback', async (req: Request, res: Response) => {
  try {
    const { platform } = req.params;
    const { code, state, error, error_description } = req.query;

    // Handle OAuth errors
    if (error) {
      logger.error('OAuth error:', { error, error_description });
      return res.redirect(
        `${process.env.FRONTEND_URL}/settings?integration_error=${encodeURIComponent(error_description as string || error as string)}`
      );
    }

    if (!code) {
      return res.redirect(
        `${process.env.FRONTEND_URL}/settings?integration_error=No authorization code received`
      );
    }

    // Parse state
    let stateData: any = {};
    try {
      stateData = state ? JSON.parse(state as string) : {};
    } catch (e) {
      logger.warn('Failed to parse state:', state);
    }

    // Extract organizationId from state
    const organizationId = stateData.organizationId;
    if (!organizationId) {
      return res.redirect(
        `${process.env.FRONTEND_URL}/settings?integration_error=Missing organization ID in state`
      );
    }

    const connection = await integrationHubService.completeConnection(
      organizationId,
      stateData.platform || platform,
      code as string,
      stateData.connectionId,
      stateData.codeVerifier
    );

    // Redirect to success page
    res.redirect(
      `${process.env.FRONTEND_URL}/settings?integration_success=${encodeURIComponent(platform)}&connection_id=${connection.id}`
    );
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('Failed to complete OAuth callback:', error);
    res.redirect(
      `${process.env.FRONTEND_URL}/settings?integration_error=${encodeURIComponent(err.message)}`
    );
  }
});

/**
 * POST /api/integrations/:platform/disconnect
 * Disconnect a platform integration
 */
router.post('/:platform/disconnect', requireAuth, async (req: Request, res: Response) => {
  try {
    const { platform } = req.params;
    const organizationId = req.user!.organizationId;

    if (!organizationId) {
      return res.status(400).json({
        error: {
          code: 'NO_ORGANIZATION',
          message: 'User does not belong to an organization'
        }
      });
    }

    // Find connection
    const { rows } = await pool.query(
      `SELECT ic.id
       FROM integration_connections ic
       JOIN integrations i ON ic.integration_id = i.id
       WHERE ic.organization_id = $1 AND i.platform = $2`,
      [organizationId, platform]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        error: {
          code: 'NOT_FOUND',
          message: 'Integration not connected'
        }
      });
    }

    await integrationHubService.disconnect(rows[0].id);

    res.json({
      data: {
        message: 'Integration disconnected successfully'
      }
    });
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('Failed to disconnect integration:', error);
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to disconnect integration'
      }
    });
  }
});

/**
 * GET /api/integrations/:platform/sync-history
 * Get sync history for a platform
 */
router.get('/:platform/sync-history', requireAuth, async (req: Request, res: Response) => {
  try {
    const { platform } = req.params;
    const organizationId = req.user!.organizationId;

    if (!organizationId) {
      return res.status(400).json({
        error: {
          code: 'NO_ORGANIZATION',
          message: 'User does not belong to an organization'
        }
      });
    }

    // Find connection
    const { rows } = await pool.query(
      `SELECT ic.id
       FROM integration_connections ic
       JOIN integrations i ON ic.integration_id = i.id
       WHERE ic.organization_id = $1 AND i.platform = $2`,
      [organizationId, platform]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        error: {
          code: 'NOT_FOUND',
          message: 'Integration not connected'
        }
      });
    }

    const syncHistory = await integrationHubService.getSyncHistory(rows[0].id);

    res.json({
      data: {
        syncs: syncHistory
      }
    });
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('Failed to get sync history:', error);
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to get sync history'
      }
    });
  }
});

/**
 * POST /api/integrations/:platform/sync
 * Trigger a manual sync
 */
router.post('/:platform/sync', requireAuth, async (req: Request, res: Response) => {
  try {
    const { platform } = req.params;
    const { sync_type } = req.body;
    const organizationId = req.user!.organizationId;

    if (!organizationId) {
      return res.status(400).json({
        error: {
          code: 'NO_ORGANIZATION',
          message: 'User does not belong to an organization'
        }
      });
    }

    const syncTypeValue = sync_type || 'manual';
    if (!['full', 'incremental', 'manual'].includes(syncTypeValue)) {
      return res.status(400).json({
        error: {
          code: 'INVALID_SYNC_TYPE',
          message: 'Sync type must be full, incremental, or manual'
        }
      });
    }

    // Find connection
    const { rows } = await pool.query(
      `SELECT ic.id
       FROM integration_connections ic
       JOIN integrations i ON ic.integration_id = i.id
       WHERE ic.organization_id = $1 AND i.platform = $2 AND ic.status = 'connected'`,
      [organizationId, platform]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        error: {
          code: 'NOT_CONNECTED',
          message: 'Integration not connected'
        }
      });
    }

    const sync = await integrationHubService.triggerSync(rows[0].id, syncTypeValue);

    res.json({
      data: {
        sync_id: sync.id,
        status: sync.status,
        started_at: sync.started_at
      }
    });
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('Failed to trigger sync:', error);
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to trigger sync'
      }
    });
  }
});

/**
 * POST /api/integrations/webhooks/:platform
 * Incoming webhook handler for platform events
 */
router.post('/webhooks/:platform', async (req: Request, res: Response) => {
  try {
    const { platform } = req.params;
    const payload = req.body;

    logger.info('Received integration webhook', { platform, payload });

    // Find the connection for this platform
    const connectionResult = await pool.query(
      `SELECT ic.id, ic.organization_id, iw.id as webhook_id, iw.webhook_type
       FROM integration_connections ic
       JOIN integrations i ON ic.integration_id = i.id
       LEFT JOIN integration_webhooks iw ON iw.connection_id = ic.id
       WHERE i.platform = $1 AND ic.status = 'connected'
       LIMIT 1`,
      [platform]
    );

    if (connectionResult.rows.length === 0) {
      logger.warn('No connection found for webhook', { platform });
      return res.status(404).json({
        error: {
          code: 'CONNECTION_NOT_FOUND',
          message: 'No active connection found for this platform'
        }
      });
    }

    const connection = connectionResult.rows[0];

    // Update last received timestamp
    if (connection.webhook_id) {
      await pool.query(
        `UPDATE integration_webhooks SET last_received_at = NOW() WHERE id = $1`,
        [connection.webhook_id]
      );
    }

    // Log webhook event
    await pool.query(
      `INSERT INTO webhook_events (
        organization_id,
        source,
        event_type,
        payload,
        received_at
      ) VALUES ($1, $2, $3, $4, NOW())`,
      [
        connection.organization_id,
        platform,
        payload.type || payload.event_type || 'unknown',
        payload
      ]
    );

    // Platform-specific handling
    switch (platform) {
      case 'meta_ads':
        // Handle Meta Ads webhooks (ad status changes, campaign updates, etc.)
        if (payload.entry) {
          logger.info('Meta Ads webhook event', { changes: payload.entry });
          // Trigger sync for affected campaigns
          await integrationHubService.triggerSync(connection.id, 'incremental');
        }
        break;

      case 'google_ads':
        // Handle Google Ads webhooks
        if (payload.event) {
          logger.info('Google Ads webhook event', { event: payload.event });
          await integrationHubService.triggerSync(connection.id, 'incremental');
        }
        break;

      case 'sendgrid':
        // Handle SendGrid email events (delivered, opened, clicked, etc.)
        if (payload.event) {
          logger.info('SendGrid email event', { event: payload.event, email: payload.email });
          // Could trigger email metrics update
        }
        break;

      case 'hubspot':
      case 'salesforce':
        // Handle CRM webhooks (contact updates, deal changes, etc.)
        if (payload.objectType) {
          logger.info('CRM webhook event', { objectType: payload.objectType, platform });
          await integrationHubService.triggerSync(connection.id, 'incremental');
        }
        break;

      case 'shopify':
        // Handle Shopify webhooks (order created, product updated, etc.)
        if (payload.topic) {
          logger.info('Shopify webhook event', { topic: payload.topic });
        }
        break;

      default:
        logger.info('Generic webhook handling', { platform, payload });
    }

    res.json({
      data: {
        message: 'Webhook processed successfully',
        platform,
        received_at: new Date().toISOString()
      }
    });
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('Failed to process webhook:', error);
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to process webhook'
      }
    });
  }
});

export default router;
