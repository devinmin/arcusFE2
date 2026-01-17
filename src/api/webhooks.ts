/**
 * Webhook Routes
 *
 * Handles incoming webhooks from external services (Stripe, etc.)
 * These routes have special handling - raw body parsing for signature verification.
 */

import { Router, Request, Response, NextFunction } from 'express';
import express from 'express';
import * as stripeService from '../services/stripeService.js';
import { SMSService } from '../services/smsService.js';
import { multiChannelService } from '../services/multiChannelService.js';
import { logger } from '../utils/logger.js';

const router = Router();

// ============================================================================
// STRIPE WEBHOOKS
// ============================================================================

/**
 * POST /webhooks/stripe
 * Handle Stripe webhook events
 *
 * Note: This route needs raw body for signature verification.
 * The raw body middleware is applied in server.ts before JSON parsing.
 */
router.post('/stripe',
  express.raw({ type: 'application/json' }),
  async (req: Request, res: Response, next: NextFunction) => {
    const signature = req.headers['stripe-signature'];

    if (!signature) {
      logger.warn('Stripe webhook missing signature');
      return res.status(400).json({ error: 'Missing signature' });
    }

    try {
      // Construct and verify the event
      const event = stripeService.constructWebhookEvent(
        req.body,
        signature as string
      );

      // Handle the event
      await stripeService.handleWebhookEvent(event);

      // Return success
      res.json({ received: true });
    } catch (error: unknown) {
    const err = error as any;
      logger.error('Stripe webhook error', {
        error: err.message,
        type: err.type,
      });

      if (err.type === 'StripeSignatureVerificationError') {
        return res.status(400).json({ error: 'Invalid signature' });
      }

      // Return 200 even on processing errors to prevent retries
      // Log the error for investigation
      res.json({ received: true, error: 'Processing error' });
    }
  }
);

/**
 * POST /webhooks/stripe-connect
 * Handle Stripe Connect webhook events for marketplace
 *
 * Separate webhook endpoint for Connect events (transfers, payouts, account updates)
 */
router.post('/stripe-connect',
  express.raw({ type: 'application/json' }),
  async (req: Request, res: Response, next: NextFunction) => {
    const signature = req.headers['stripe-signature'];

    if (!signature) {
      logger.warn('Stripe Connect webhook missing signature');
      return res.status(400).json({ error: 'Missing signature' });
    }

    try {
      // Construct and verify the event with Connect webhook secret
      const event = stripeService.constructConnectWebhookEvent(
        req.body,
        signature as string
      );

      // Handle the Connect event
      await stripeService.handleConnectWebhookEvent(event);

      // Return success
      res.json({ received: true });
    } catch (error: unknown) {
    const err = error as any;
      logger.error('Stripe Connect webhook error', {
        error: err.message,
        type: err.type,
      });

      if (err.type === 'StripeSignatureVerificationError') {
        return res.status(400).json({ error: 'Invalid signature' });
      }

      // Return 200 even on processing errors to prevent retries
      res.json({ received: true, error: 'Processing error' });
    }
  }
);

// ============================================================================
// TWILIO WEBHOOKS
// ============================================================================

/**
 * POST /webhooks/twilio/sms
 * Handle incoming SMS from Twilio
 *
 * Twilio sends:
 * - From: Sender phone number
 * - To: Your Twilio number
 * - Body: Message text
 * - MessageSid: Unique message ID
 * - NumMedia: Number of media attachments (MMS)
 * - MediaUrl0, MediaUrl1, etc: Media URLs
 */
router.post('/twilio/sms', async (req: Request, res: Response) => {
  try {
    logger.info('[Webhook] Received Twilio SMS webhook');

    // Verify Twilio signature
    const twilioSignature = req.headers['x-twilio-signature'] as string;
    if (twilioSignature) {
      const protocol = req.headers['x-forwarded-proto'] || req.protocol;
      const host = req.headers['x-forwarded-host'] || req.headers.host;
      const url = `${protocol}://${host}${req.originalUrl}`;

      const isValid = SMSService.verifyWebhookSignature(
        twilioSignature,
        url,
        req.body
      );

      if (!isValid) {
        logger.warn('[Webhook] Invalid Twilio signature');
        return res.status(403).send('Invalid signature');
      }
    }

    const {
      From: from,
      To: to,
      Body: body,
      MessageSid: messageSid,
      NumMedia: numMedia,
    } = req.body;

    if (!from || !body) {
      logger.warn('[Webhook] Invalid SMS webhook - missing from or body');
      return res.status(400).send('Missing required fields');
    }

    logger.info(`[Webhook] Processing SMS from ${from}: "${body.substring(0, 50)}..."`);

    // Check for special keywords (STOP, START, HELP)
    const normalizedBody = body.trim().toUpperCase();

    if (['STOP', 'UNSUBSCRIBE', 'END', 'CANCEL', 'QUIT'].includes(normalizedBody)) {
      await SMSService.handleOptOut(from);
      // Return empty TwiML (SMS service sends confirmation)
      res.type('text/xml');
      return res.send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
    }

    if (['START', 'SUBSCRIBE', 'YES', 'RESUME'].includes(normalizedBody)) {
      await SMSService.handleOptIn(from);
      // Return empty TwiML (SMS service sends confirmation)
      res.type('text/xml');
      return res.send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
    }

    if (['HELP', 'INFO', '?'].includes(normalizedBody)) {
      await SMSService.sendHelpMessage(from);
      // Return empty TwiML (SMS service sends help)
      res.type('text/xml');
      return res.send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
    }

    // Parse media URLs if present (MMS)
    const mediaUrls: string[] = [];
    const mediaCount = parseInt(numMedia || '0');
    for (let i = 0; i < mediaCount; i++) {
      const mediaUrl = req.body[`MediaUrl${i}`];
      if (mediaUrl) mediaUrls.push(mediaUrl);
    }

    // Process through multi-channel service
    await multiChannelService.handleInboundSMS(from, body);

    // Return empty TwiML (we send responses through API)
    res.type('text/xml');
    res.send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
  } catch (error: unknown) {
    const err = error as any;
    logger.error('[Webhook] Error processing Twilio SMS webhook:', error);

    // Always return 200 to Twilio to prevent retries
    res.type('text/xml');
    res.send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
  }
});

/**
 * POST /webhooks/twilio/sms/status
 * Handle SMS delivery status callbacks from Twilio
 *
 * Twilio sends:
 * - MessageSid: Message ID
 * - MessageStatus: queued, sending, sent, delivered, undelivered, failed
 * - ErrorCode: Error code if failed
 * - ErrorMessage: Error description
 */
router.post('/twilio/sms/status', async (req: Request, res: Response) => {
  try {
    logger.info('[Webhook] Received Twilio status callback');

    const {
      MessageSid: messageSid,
      MessageStatus: status,
      ErrorCode: errorCode,
      ErrorMessage: errorMessage,
    } = req.body;

    if (!messageSid || !status) {
      logger.warn('[Webhook] Invalid status webhook - missing messageSid or status');
      return res.status(400).send('Missing required fields');
    }

    logger.info(`[Webhook] SMS ${messageSid} status: ${status}${errorCode ? ` (error: ${errorCode})` : ''}`);

    // Update message status in database
    await SMSService.updateMessageStatus(
      messageSid,
      status,
      errorCode,
      errorMessage
    );

    res.status(200).send('OK');
  } catch (error: unknown) {
    const err = error as any;
    logger.error('[Webhook] Error processing Twilio status webhook:', error);

    // Always return 200 to prevent retries
    res.status(200).send('OK');
  }
});

// ============================================================================
// SENDGRID WEBHOOKS
// ============================================================================

/**
 * POST /webhooks/sendgrid/events
 * Handle email event webhooks from SendGrid
 *
 * SendGrid sends events for:
 * - processed: Email received and ready to send
 * - dropped: Email could not be delivered
 * - delivered: Email successfully delivered
 * - bounce: Receiving server returned a bounce
 * - deferred: Temporary delivery delay
 * - open: Recipient opened the email
 * - click: Recipient clicked a link
 * - spam_report: Recipient marked as spam
 * - unsubscribe: Recipient unsubscribed
 * - group_unsubscribe: Recipient unsubscribed from specific group
 * - group_resubscribe: Recipient resubscribed
 */
router.post('/sendgrid/events', async (req: Request, res: Response) => {
  try {
    logger.info('[Webhook] Received SendGrid events');

    // SendGrid sends an array of events
    const events = Array.isArray(req.body) ? req.body : [req.body];

    if (events.length === 0) {
      logger.warn('[Webhook] SendGrid webhook received empty event array');
      return res.status(200).send('OK');
    }

    // Process each event
    for (const event of events) {
      try {
        await processEmailEvent(event);
      } catch (error: unknown) {
    const err = error as Error;
        logger.error('[Webhook] Failed to process SendGrid event', {
          error: err.message,
          event: event.event,
          email: event.email,
        });
        // Continue processing other events even if one fails
      }
    }

    res.status(200).send('OK');
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('[Webhook] Error processing SendGrid webhook:', error);
    // Always return 200 to prevent retries
    res.status(200).send('OK');
  }
});

/**
 * POST /webhooks/sendgrid/inbound
 * Handle inbound email parsing from SendGrid
 *
 * Allows users to reply to emails and have them processed by the system
 */
router.post('/sendgrid/inbound', async (req: Request, res: Response) => {
  try {
    logger.info('[Webhook] Received SendGrid inbound email');

    const {
      from,
      to,
      subject,
      text,
      html,
      headers,
    } = req.body;

    if (!from || !text) {
      logger.warn('[Webhook] Invalid inbound email - missing from or text');
      return res.status(400).send('Missing required fields');
    }

    logger.info(`[Webhook] Processing inbound email from ${from}: "${subject}"`);

    // Process through multi-channel service
    await multiChannelService.handleInboundEmail(from, subject, text, html);

    res.status(200).send('OK');
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('[Webhook] Error processing SendGrid inbound email:', error);
    // Always return 200 to prevent retries
    res.status(200).send('OK');
  }
});

// ============================================================================
// EMAIL EVENT PROCESSING
// ============================================================================

/**
 * Process a single SendGrid event
 */
async function processEmailEvent(event: any): Promise<void> {
  const {
    event: eventType,
    email,
    timestamp,
    sg_message_id: messageId,
    sg_event_id: eventId,
    reason,
    status,
    response,
    url,
    ip,
    useragent,
    campaign_id: campaignId,
    organization_id: organizationId,
  } = event;

  logger.info(`[Webhook] Processing email event: ${eventType} for ${email}`);

  // Import emailService to avoid circular dependencies
  const { EmailService } = await import('../services/emailService.js');

  // Process core event tracking using existing EmailService method
  await EmailService.processWebhookEvent({
    event: eventType,
    email,
    timestamp,
    sg_message_id: messageId,
    sg_event_id: eventId,
    useragent,
    ip,
    url,
    reason,
    status,
    response,
  });

  // Handle specific actions for certain events
  switch (eventType) {
    case 'spam_report':
      // Mark contact as spam reporter - stop all future emails
      await handleSpamReport(email);
      break;

    case 'unsubscribe':
      // Mark contact as unsubscribed
      await handleUnsubscribe(email, 'Unsubscribed via email link');
      break;

    case 'bounce':
      // Track bounce for reputation management
      await handleBounce(email, reason, status);
      break;

    case 'dropped':
      // Log dropped email for investigation
      logger.warn('[Webhook] Email dropped by SendGrid', { email, reason });
      break;
  }

  // Track event in analytics if campaign_id or organization_id present
  if (campaignId || organizationId) {
    try {
      await trackEmailEvent({
        eventType,
        email,
        timestamp,
        campaignId,
        organizationId,
        messageId,
      });
    } catch (error: unknown) {
    const err = error as Error;
      logger.warn('[Webhook] Failed to track email event in analytics', {
        error: err.message,
      });
    }
  }
}

/**
 * Handle spam report event
 */
async function handleSpamReport(email: string): Promise<void> {
  const { query } = await import('../database/db.js');

  await query(
    `UPDATE user_contact_methods
     SET spam_reported = true, spam_reported_at = NOW(), opted_in = false, opt_out_reason = 'Spam report'
     WHERE type = 'email' AND value = $1`,
    [email]
  );

  logger.warn('[Webhook] Email marked as spam', { email });
}

/**
 * Handle unsubscribe event
 */
async function handleUnsubscribe(email: string, reason: string): Promise<void> {
  const { query } = await import('../database/db.js');

  await query(
    `UPDATE user_contact_methods
     SET opted_in = false, opted_out_at = NOW(), opt_out_reason = $2
     WHERE type = 'email' AND value = $1`,
    [email, reason]
  );

  logger.info('[Webhook] Email unsubscribed', { email, reason });
}

/**
 * Handle bounce event
 */
async function handleBounce(email: string, reason?: string, status?: string): Promise<void> {
  const { query } = await import('../database/db.js');

  // Increment bounce count and mark if hard bounce
  const isHardBounce = status?.includes('5') || reason?.toLowerCase().includes('permanent');

  await query(
    `UPDATE user_contact_methods
     SET
       bounced = $2,
       bounce_count = COALESCE(bounce_count, 0) + 1,
       bounce_reason = $3,
       last_bounce_at = NOW()
     WHERE type = 'email' AND value = $1`,
    [email, isHardBounce, `${status || ''}: ${reason || 'Unknown'}`]
  );

  logger.warn('[Webhook] Email bounced', { email, reason, status, isHardBounce });
}

/**
 * Track email event in analytics
 */
async function trackEmailEvent(params: {
  eventType: string;
  email: string;
  timestamp: number;
  campaignId?: string;
  organizationId?: string;
  messageId?: string;
}): Promise<void> {
  const { query } = await import('../database/db.js');

  await query(
    `INSERT INTO email_events (
      event_type,
      email,
      timestamp,
      campaign_id,
      organization_id,
      message_id,
      created_at
    ) VALUES ($1, $2, to_timestamp($3), $4, $5, $6, NOW())
    ON CONFLICT DO NOTHING`,
    [
      params.eventType,
      params.email,
      params.timestamp,
      params.campaignId || null,
      params.organizationId || null,
      params.messageId || null,
    ]
  );
}

export default router;
