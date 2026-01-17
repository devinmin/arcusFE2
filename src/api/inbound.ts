import { Router, Request, Response } from 'express';
import { logger } from '../utils/logger.js';
import crypto from 'crypto';
import twilio from 'twilio';
import multer from 'multer';
import {
  lookupSender,
  storeInboundMessage,
  handleUnknownSender
} from '../services/inboundMessageService.js';
import { processInboundMessage } from '../services/arcConversationService.js';
import {
  processSendGridWebhook,
  processTwilioStatusWebhook,
  SendGridWebhookEvent,
  TwilioStatusEvent
} from '../services/metricsCollectionService.js';

const router = Router();

// Multer for parsing multipart form data (SendGrid sends as multipart)
const upload = multer();

// ============================================================================
// SENDGRID INBOUND PARSE WEBHOOK
// ============================================================================
// Documentation: https://docs.sendgrid.com/for-developers/parsing-email/setting-up-the-inbound-parse-webhook

/**
 * Verify SendGrid webhook signature (optional but recommended)
 * SendGrid Signed Event Webhook: https://docs.sendgrid.com/for-developers/tracking-events/getting-started-event-webhook-security-features
 */
function verifySendGridSignature(
  publicKey: string,
  payload: string,
  signature: string,
  timestamp: string
): boolean {
  try {
    const timestampPayload = timestamp + payload;
    const decodedSignature = Buffer.from(signature, 'base64');

    const verifier = crypto.createVerify('sha256');
    verifier.update(timestampPayload);

    return verifier.verify(publicKey, decodedSignature);
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('SendGrid signature verification error:', error);
    return false;
  }
}

/**
 * POST /api/inbound/email
 *
 * Receives inbound emails from SendGrid Inbound Parse
 *
 * SendGrid sends these fields:
 * - from: Sender email
 * - to: Recipient email (arc@yourdomain.com)
 * - subject: Email subject
 * - text: Plain text body
 * - html: HTML body
 * - headers: Raw email headers
 * - envelope: JSON with to/from
 * - attachments: Number of attachments
 * - attachment-info: JSON with attachment details
 * - attachment1, attachment2, etc: Actual attachment files
 */
router.post('/email', upload.any(), async (req: Request, res: Response) => {
  try {
    logger.info('Received inbound email webhook');

    // Parse the email data from SendGrid's format
    const {
      from,
      to,
      subject,
      text,
      html,
      headers,
      envelope
    } = req.body;

    // Extract sender email from "Name <email@domain.com>" format
    const senderMatch = from?.match(/<(.+?)>/) || [null, from];
    const senderEmail = senderMatch[1] || from;
    const senderName = from?.replace(/<.+>/, '').trim() || undefined;

    if (!senderEmail || !text) {
      logger.warn('Invalid email webhook payload - missing sender or body');
      return res.status(400).json({ error: 'Missing required fields' });
    }

    logger.info(`Processing email from: ${senderEmail}, subject: ${subject || '(no subject)'}`);

    // Look up the sender
    const { user, organization } = await lookupSender(senderEmail, 'email');

    if (!user || !organization) {
      // Handle unknown sender
      const result = await handleUnknownSender('email', senderEmail, text);
      logger.info(`Unknown sender handled: ${result.action}`);

      // Still return 200 to acknowledge receipt
      return res.status(200).json({
        status: 'received',
        action: result.action,
        message: result.message
      });
    }

    // Parse headers to get Message-ID and In-Reply-To for threading
    let messageId: string | undefined;
    let inReplyTo: string | undefined;

    if (headers) {
      try {
        const headerLines = headers.split('\n');
        for (const line of headerLines) {
          if (line.toLowerCase().startsWith('message-id:')) {
            messageId = line.substring(11).trim();
          }
          if (line.toLowerCase().startsWith('in-reply-to:')) {
            inReplyTo = line.substring(12).trim();
          }
        }
      } catch (e) {
        // Ignore header parsing errors
      }
    }

    // Parse attachments if present
    const attachments: unknown[] = [];
    const files = req.files as Express.Multer.File[] | undefined;
    if (files && files.length > 0) {
      for (const file of files) {
        attachments.push({
          filename: file.originalname,
          contentType: file.mimetype,
          size: file.size
          // Note: file.buffer contains the actual content if needed
        });
      }
    }

    // Store the inbound message
    const inboundMessage = await storeInboundMessage({
      channel: 'email',
      sender: senderEmail,
      senderName,
      userId: user.id,
      organizationId: organization.id,
      subject: subject || undefined,
      content: text,
      contentHtml: html || undefined,
      attachments,
      inReplyTo,
      rawPayload: {
        from,
        to,
        subject,
        envelope: envelope ? JSON.parse(envelope) : undefined,
        messageId
      }
    });

    // Process the message with Arc
    const result = await processInboundMessage(inboundMessage, user, organization);

    res.status(200).json({
      status: 'processed',
      messageId: inboundMessage.id,
      intent: result.intent,
      workflowId: result.actions.find(a => a.type === 'workflow_started')?.data?.workflowId
    });

  } catch (error: unknown) {
    const err = error as Error;
    logger.error('Error processing inbound email:', error);

    // Always return 200 to SendGrid to prevent retries
    // Log the error for investigation
    res.status(200).json({
      status: 'error',
      message: 'Message received but processing failed'
    });
  }
});

// ============================================================================
// TWILIO SMS WEBHOOK
// ============================================================================
// Documentation: https://www.twilio.com/docs/messaging/guides/webhook-request

/**
 * Verify Twilio webhook signature
 */
function verifyTwilioSignature(
  authToken: string,
  signature: string,
  url: string,
  params: Record<string, string>
): boolean {
  try {
    return twilio.validateRequest(authToken, signature, url, params);
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('Twilio signature verification error:', error);
    return false;
  }
}

/**
 * POST /api/inbound/sms
 *
 * Receives inbound SMS from Twilio
 *
 * Twilio sends these fields:
 * - From: Sender phone number
 * - To: Your Twilio number
 * - Body: Message text
 * - MessageSid: Unique message ID
 * - NumMedia: Number of media attachments (MMS)
 * - MediaUrl0, MediaUrl1, etc: Media URLs
 */
router.post('/sms', async (req: Request, res: Response) => {
  try {
    logger.info('Received inbound SMS webhook');

    // Optionally verify Twilio signature
    const twilioAuthToken = process.env.TWILIO_AUTH_TOKEN;
    const twilioSignature = req.headers['x-twilio-signature'] as string;

    if (twilioAuthToken && twilioSignature) {
      // Construct the full URL
      const protocol = req.headers['x-forwarded-proto'] || req.protocol;
      const host = req.headers['x-forwarded-host'] || req.headers.host;
      const url = `${protocol}://${host}${req.originalUrl}`;

      const isValid = verifyTwilioSignature(
        twilioAuthToken,
        twilioSignature,
        url,
        req.body
      );

      if (!isValid) {
        logger.warn('Invalid Twilio signature');
        return res.status(403).send('Invalid signature');
      }
    }

    const {
      From: from,
      To: to,
      Body: body,
      MessageSid: messageSid,
      NumMedia: numMedia
    } = req.body;

    if (!from || !body) {
      logger.warn('Invalid SMS webhook payload - missing sender or body');
      return res.status(400).send('Missing required fields');
    }

    logger.info(`Processing SMS from: ${from}, body: "${body.substring(0, 50)}..."`);

    // Parse media URLs if present (MMS)
    const mediaUrls: string[] = [];
    const mediaCount = parseInt(numMedia || '0');
    for (let i = 0; i < mediaCount; i++) {
      const mediaUrl = req.body[`MediaUrl${i}`];
      if (mediaUrl) mediaUrls.push(mediaUrl);
    }

    // Look up the sender
    const { user, organization } = await lookupSender(from, 'sms');

    if (!user || !organization) {
      // Handle unknown sender
      const result = await handleUnknownSender('sms', from, body);
      logger.info(`Unknown SMS sender handled: ${result.action}`);

      // Return TwiML response (empty to not reply)
      res.type('text/xml');
      return res.send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
    }

    // Store the inbound message
    const inboundMessage = await storeInboundMessage({
      channel: 'sms',
      sender: from,
      userId: user.id,
      organizationId: organization.id,
      content: body,
      attachments: mediaUrls.map((url, i) => ({
        filename: `media_${i}`,
        contentType: 'unknown',
        size: 0,
        url
      })),
      rawPayload: {
        messageSid,
        from,
        to,
        numMedia: mediaCount
      }
    });

    // Process the message with Arc
    const result = await processInboundMessage(inboundMessage, user, organization);

    // Return empty TwiML (we send the response separately through Twilio API)
    // This prevents double-sending
    res.type('text/xml');
    res.send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');

  } catch (error: unknown) {
    const err = error as Error;
    logger.error('Error processing inbound SMS:', error);

    // Return empty TwiML to acknowledge
    res.type('text/xml');
    res.send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
  }
});

// ============================================================================
// WEBHOOK STATUS CALLBACKS
// ============================================================================

/**
 * POST /api/inbound/email/status
 *
 * SendGrid Event Webhook for delivery status
 * Now integrated with real metrics collection!
 */
router.post('/email/status', async (req: Request, res: Response) => {
  try {
    const events: SendGridWebhookEvent[] = Array.isArray(req.body) ? req.body : [req.body];

    logger.info(`[SendGrid Webhook] Processing ${events.length} events`);

    // Process all events through the metrics collection service
    await processSendGridWebhook(events);

    res.status(200).send('OK');

  } catch (error: unknown) {
    const err = error as Error;
    logger.error('Error processing email status webhook:', error);
    res.status(200).send('OK'); // Always acknowledge to prevent retries
  }
});

/**
 * POST /api/inbound/sms/status
 *
 * Twilio Status Callback for delivery status
 * Now integrated with real metrics collection!
 */
router.post('/sms/status', async (req: Request, res: Response) => {
  try {
    const { MessageSid, MessageStatus, ErrorCode, To } = req.body;

    if (!MessageSid) {
      return res.status(400).send('Missing MessageSid');
    }

    logger.info(`[Twilio Webhook] SMS ${MessageSid} status: ${MessageStatus}${ErrorCode ? ` (error: ${ErrorCode})` : ''}`);

    // Process through the metrics collection service
    const twilioEvent: TwilioStatusEvent = {
      MessageSid,
      MessageStatus,
      ErrorCode,
      To,
      From: req.body.From || ''  // Include From field
    };

    await processTwilioStatusWebhook(twilioEvent);

    res.status(200).send('OK');

  } catch (error: unknown) {
    const err = error as Error;
    logger.error('Error processing SMS status webhook:', error);
    res.status(200).send('OK'); // Always acknowledge to prevent retries
  }
});

// ============================================================================
// HEALTH CHECK
// ============================================================================

/**
 * GET /api/inbound/health
 *
 * Health check for webhook endpoints
 */
router.get('/health', (req: Request, res: Response) => {
  res.json({
    status: 'healthy',
    endpoints: {
      email: '/api/inbound/email',
      sms: '/api/inbound/sms',
      emailStatus: '/api/inbound/email/status',
      smsStatus: '/api/inbound/sms/status'
    },
    timestamp: new Date().toISOString()
  });
});

export default router;
