/**
 * Multi-Channel Routes
 *
 * API endpoints for multi-channel communication management.
 *
 * Webhooks (no auth required - signature verified):
 * - POST /api/channels/webhooks/sms/inbound - Twilio incoming SMS
 * - POST /api/channels/webhooks/email/inbound - SendGrid inbound parse
 *
 * Contact Method Management (authenticated):
 * - GET    /api/channels/contact-methods - List user's contact methods
 * - POST   /api/channels/contact-methods - Add new contact method
 * - DELETE /api/channels/contact-methods/:id - Remove contact method
 * - POST   /api/channels/contact-methods/:id/verify - Verify with code
 * - POST   /api/channels/contact-methods/:id/resend - Resend verification
 * - PATCH  /api/channels/contact-methods/:id/preferences - Update preferences
 *
 * Conversation Management (authenticated):
 * - GET /api/channels/conversations - List conversations
 * - GET /api/channels/conversations/:threadId - Get thread details
 * - GET /api/channels/conversations/:threadId/messages - Get message history
 */

import { Router, Request, Response } from 'express';
import express from 'express';
import multer from 'multer';
import twilio from 'twilio';
import { logger } from '../utils/logger.js';
import { multiChannelService } from '../services/multiChannelService.js';
import { identityResolutionService } from '../services/identityResolutionService.js';
import { pool } from '../database/db.js';
import { authenticateJWT } from '../middleware/auth.js';

const router = Router();
const upload = multer();

// ============================================================================
// WEBHOOK ENDPOINTS (No Auth - Signature Verified)
// ============================================================================

/**
 * POST /api/channels/webhooks/sms/inbound
 *
 * Receive inbound SMS from Twilio
 * This replaces the old /api/inbound/sms endpoint with multi-channel awareness
 */
router.post('/webhooks/sms/inbound', async (req: Request, res: Response) => {
  try {
    logger.info('[Channels] Received SMS webhook');

    // Verify Twilio signature (optional but recommended)
    const twilioAuthToken = process.env.TWILIO_AUTH_TOKEN;
    const twilioSignature = req.headers['x-twilio-signature'] as string;

    if (twilioAuthToken && twilioSignature) {
      const protocol = req.headers['x-forwarded-proto'] || req.protocol;
      const host = req.headers['x-forwarded-host'] || req.headers.host;
      const url = `${protocol}://${host}${req.originalUrl}`;

      const isValid = twilio.validateRequest(
        twilioAuthToken,
        twilioSignature,
        url,
        req.body
      );

      if (!isValid) {
        logger.warn('[Channels] Invalid Twilio signature');
        return res.status(403).send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
      }
    }

    const { From, Body } = req.body;

    if (!From || !Body) {
      logger.warn('[Channels] Invalid SMS webhook payload');
      return res.status(400).send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
    }

    // Process through multi-channel service (async - don't wait)
    multiChannelService.handleInboundSMS(From, Body).catch((error) => {
      logger.error('[Channels] Error processing SMS:', error);
    });

    // Return empty TwiML immediately
    res.type('text/xml');
    res.send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('[Channels] SMS webhook error:', error);
    res.type('text/xml');
    res.send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
  }
});

/**
 * POST /api/channels/webhooks/email/inbound
 *
 * Receive inbound email from SendGrid
 * This replaces the old /api/inbound/email endpoint with multi-channel awareness
 */
router.post('/webhooks/email/inbound', upload.any(), async (req: Request, res: Response) => {
  try {
    logger.info('[Channels] Received email webhook');

    const { from, subject, text, html } = req.body;

    if (!from || !text) {
      logger.warn('[Channels] Invalid email webhook payload');
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Process through multi-channel service (async - don't wait)
    multiChannelService
      .handleInboundEmail(from, subject || '(no subject)', text, html)
      .catch((error) => {
        logger.error('[Channels] Error processing email:', error);
      });

    // Acknowledge receipt immediately
    res.status(200).json({ status: 'received' });
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('[Channels] Email webhook error:', error);
    res.status(200).json({ status: 'error' });
  }
});

// ============================================================================
// CONTACT METHOD MANAGEMENT (Authenticated)
// ============================================================================

/**
 * GET /api/channels/contact-methods
 *
 * Get user's contact methods
 */
router.get('/contact-methods', authenticateJWT, async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const contactMethods = await identityResolutionService.getUserContactMethods(userId);

    res.json({
      contact_methods: contactMethods,
    });
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('[Channels] Error getting contact methods:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/channels/contact-methods
 *
 * Add new contact method
 */
router.post('/contact-methods', authenticateJWT, async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { type, value, label, is_primary } = req.body;

    // Validate
    if (!type || !value) {
      return res.status(400).json({ error: 'Missing type or value' });
    }

    if (!['phone', 'email'].includes(type)) {
      return res.status(400).json({ error: 'Invalid type. Must be phone or email' });
    }

    // Validate format
    if (type === 'phone' && !identityResolutionService.isValidPhoneNumber(value)) {
      return res.status(400).json({ error: 'Invalid phone number format' });
    }

    if (type === 'email' && !identityResolutionService.isValidEmail(value)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }

    // Register contact method
    const contactMethod = await identityResolutionService.registerContactMethod(
      userId,
      type,
      value,
      {
        label,
        is_primary,
      }
    );

    res.status(201).json({
      contact_method: contactMethod,
      message: 'Verification code sent',
    });
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('[Channels] Error adding contact method:', error);

    if (err.message.includes('duplicate')) {
      return res.status(409).json({ error: 'Contact method already exists' });
    }

    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/channels/contact-methods/:id/verify
 *
 * Verify contact method with code
 */
router.post(
  '/contact-methods/:id/verify',
  authenticateJWT,
  async (req: Request, res: Response) => {
    try {
      const userId = req.user?.id;
      const { id } = req.params;
      const { code } = req.body;

      if (!userId || !id || !code) {
        return res.status(400).json({ error: 'Missing required fields' });
      }

      // Verify ownership
      const contactMethods = await identityResolutionService.getUserContactMethods(userId);
      const contactMethod = contactMethods.find((cm) => cm.id === id);

      if (!contactMethod) {
        return res.status(404).json({ error: 'Contact method not found' });
      }

      // Verify code
      const result = await identityResolutionService.verifyContactMethod(id, code);

      if (!result.success) {
        return res.status(400).json({ error: result.error });
      }

      res.json({
        success: true,
        contact_method: result.contact_method,
        message: 'Contact method verified',
      });
    } catch (error: unknown) {
    const err = error as Error;
      logger.error('[Channels] Error verifying contact method:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

/**
 * POST /api/channels/contact-methods/:id/resend
 *
 * Resend verification code
 */
router.post(
  '/contact-methods/:id/resend',
  authenticateJWT,
  async (req: Request, res: Response) => {
    try {
      const userId = req.user?.id;
      const { id } = req.params;

      if (!userId || !id) {
        return res.status(400).json({ error: 'Missing required fields' });
      }

      // Verify ownership
      const contactMethods = await identityResolutionService.getUserContactMethods(userId);
      const contactMethod = contactMethods.find((cm) => cm.id === id);

      if (!contactMethod) {
        return res.status(404).json({ error: 'Contact method not found' });
      }

      // Resend verification
      await identityResolutionService.sendVerificationCode(
        id,
        contactMethod.type,
        contactMethod.value
      );

      res.json({
        success: true,
        message: 'Verification code sent',
      });
    } catch (error: unknown) {
    const err = error as Error;
      logger.error('[Channels] Error resending verification:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

/**
 * DELETE /api/channels/contact-methods/:id
 *
 * Remove contact method
 */
router.delete(
  '/contact-methods/:id',
  authenticateJWT,
  async (req: Request, res: Response) => {
    try {
      const userId = req.user?.id;
      const { id } = req.params;

      if (!userId || !id) {
        return res.status(400).json({ error: 'Missing required fields' });
      }

      await identityResolutionService.deleteContactMethod(id, userId);

      res.json({
        success: true,
        message: 'Contact method deleted',
      });
    } catch (error: unknown) {
    const err = error as Error;
      logger.error('[Channels] Error deleting contact method:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

/**
 * PATCH /api/channels/contact-methods/:id/preferences
 *
 * Update notification preferences
 */
router.patch(
  '/contact-methods/:id/preferences',
  authenticateJWT,
  async (req: Request, res: Response) => {
    try {
      const userId = req.user?.id;
      const { id } = req.params;
      const { preferences } = req.body;

      if (!userId || !id || !preferences) {
        return res.status(400).json({ error: 'Missing required fields' });
      }

      // Verify ownership
      const contactMethods = await identityResolutionService.getUserContactMethods(userId);
      const contactMethod = contactMethods.find((cm) => cm.id === id);

      if (!contactMethod) {
        return res.status(404).json({ error: 'Contact method not found' });
      }

      // Update preferences
      await identityResolutionService.updateNotificationPreferences(id, preferences);

      res.json({
        success: true,
        message: 'Preferences updated',
      });
    } catch (error: unknown) {
    const err = error as Error;
      logger.error('[Channels] Error updating preferences:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// ============================================================================
// CONVERSATION MANAGEMENT (Authenticated)
// ============================================================================

/**
 * GET /api/channels/conversations
 *
 * Get user's conversation threads
 */
router.get('/conversations', authenticateJWT, async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const organizationId = req.user?.organizationId;

    if (!userId || !organizationId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { channel, status, limit = 20, offset = 0 } = req.query;

    let query = `
      SELECT
        ct.*,
        (
          SELECT COUNT(*)
          FROM inbound_messages im
          WHERE im.thread_id = ct.id
        ) as inbound_count,
        (
          SELECT COUNT(*)
          FROM outbound_messages om
          WHERE om.thread_id = ct.id
        ) as outbound_count
      FROM conversation_threads ct
      WHERE ct.organization_id = $1
    `;

    const params: unknown[] = [organizationId];
    let paramIndex = 2;

    if (channel) {
      query += ` AND ct.channel = $${paramIndex}`;
      params.push(channel);
      paramIndex++;
    }

    if (status) {
      query += ` AND ct.status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }

    query += `
      ORDER BY ct.last_message_at DESC NULLS LAST
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;
    params.push(limit, offset);

    const result = await pool.query(query, params);

    res.json({
      conversations: result.rows,
      total: result.rowCount,
    });
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('[Channels] Error getting conversations:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/channels/conversations/:threadId
 *
 * Get conversation thread details
 */
router.get('/conversations/:threadId', authenticateJWT, async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const organizationId = req.user?.organizationId;
    const { threadId } = req.params;

    if (!userId || !organizationId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Get thread with context
    const result = await pool.query(
      `SELECT
        ct.*,
        cc.active_campaign_id,
        cc.active_deliverable_id,
        cc.active_workflow_id,
        cc.last_intent,
        cc.state,
        cc.preferences
      FROM conversation_threads ct
      LEFT JOIN conversation_context cc ON cc.thread_id = ct.id
      WHERE ct.id = $1 AND ct.organization_id = $2`,
      [threadId, organizationId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    res.json({
      conversation: result.rows[0],
    });
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('[Channels] Error getting conversation:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/channels/conversations/:threadId/messages
 *
 * Get message history for a thread
 */
router.get(
  '/conversations/:threadId/messages',
  authenticateJWT,
  async (req: Request, res: Response) => {
    try {
      const userId = req.user?.id;
      const organizationId = req.user?.organizationId;
      const { threadId } = req.params;
      const { limit = 50, offset = 0 } = req.query;

      if (!userId || !organizationId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      // Verify thread belongs to user's org
      const threadCheck = await pool.query(
        `SELECT id FROM conversation_threads
         WHERE id = $1 AND organization_id = $2`,
        [threadId, organizationId]
      );

      if (threadCheck.rows.length === 0) {
        return res.status(404).json({ error: 'Conversation not found' });
      }

      // Get messages
      const result = await pool.query(
        `(
          SELECT
            'inbound' as direction,
            id,
            sender as contact,
            subject,
            content,
            content_html,
            received_at as timestamp,
            status
          FROM inbound_messages
          WHERE thread_id = $1
        )
        UNION ALL
        (
          SELECT
            'outbound' as direction,
            id,
            recipient as contact,
            subject,
            content,
            content_html,
            sent_at as timestamp,
            status
          FROM outbound_messages
          WHERE thread_id = $1
        )
        ORDER BY timestamp DESC
        LIMIT $2 OFFSET $3`,
        [threadId, limit, offset]
      );

      res.json({
        messages: result.rows.reverse(), // Return in chronological order
        total: result.rowCount,
      });
    } catch (error: unknown) {
    const err = error as Error;
      logger.error('[Channels] Error getting messages:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// ============================================================================
// HEALTH CHECK
// ============================================================================

/**
 * GET /api/channels/health
 *
 * Health check for multi-channel endpoints
 */
router.get('/health', (req: Request, res: Response) => {
  res.json({
    status: 'healthy',
    service: 'multi-channel-communication',
    endpoints: {
      webhooks: {
        sms: '/api/channels/webhooks/sms/inbound',
        email: '/api/channels/webhooks/email/inbound',
      },
      contactMethods: {
        list: 'GET /api/channels/contact-methods',
        add: 'POST /api/channels/contact-methods',
        verify: 'POST /api/channels/contact-methods/:id/verify',
        delete: 'DELETE /api/channels/contact-methods/:id',
      },
      conversations: {
        list: 'GET /api/channels/conversations',
        details: 'GET /api/channels/conversations/:threadId',
        messages: 'GET /api/channels/conversations/:threadId/messages',
      },
    },
    timestamp: new Date().toISOString(),
  });
});

export default router;
