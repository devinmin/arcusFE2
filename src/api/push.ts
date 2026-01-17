/**
 * Push Notification Routes
 *
 * API endpoints for managing push notification subscriptions
 * and sending notifications.
 */

import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { pushNotificationService, PushSubscriptionData } from '../services/pushNotificationService.js';
import { logger } from '../utils/logger.js';

const router = Router();

// ============================================
// PUBLIC ENDPOINTS
// ============================================

/**
 * Get VAPID public key for push subscription
 * GET /push/vapid-key
 */
router.get('/vapid-key', (req: Request, res: Response) => {
  const publicKey = pushNotificationService.getVapidPublicKey();

  if (!publicKey) {
    return res.status(503).json({
      error: 'Push notifications not configured',
      message: 'VAPID keys are not set up on the server',
    });
  }

  res.json({ publicKey });
});

// ============================================
// AUTHENTICATED ENDPOINTS
// ============================================

/**
 * Subscribe to push notifications
 * POST /push/subscribe
 */
router.post('/subscribe', requireAuth, async (req: Request, res: Response) => {
  try {
    const { subscription, deviceInfo } = req.body;
    const userId = req.user!.id;
    const organizationId = req.headers['x-organization-id'] as string;

    if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
      return res.status(400).json({
        error: 'Invalid subscription',
        message: 'Subscription must include endpoint and keys',
      });
    }

    const subscriptionData: PushSubscriptionData = {
      endpoint: subscription.endpoint,
      keys: {
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
      },
    };

    const subscriptionId = await pushNotificationService.saveSubscription(
      userId,
      organizationId,
      subscriptionData,
      {
        userAgent: req.headers['user-agent'],
        platform: deviceInfo?.platform,
        deviceName: deviceInfo?.deviceName,
      }
    );

    logger.info('Push subscription saved', { userId, subscriptionId });

    res.json({
      success: true,
      subscriptionId,
      message: 'Successfully subscribed to push notifications',
    });
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('Failed to save push subscription', { error });
    res.status(500).json({
      error: 'Subscription failed',
      message: 'Failed to save push subscription',
    });
  }
});

/**
 * Unsubscribe from push notifications
 * POST /push/unsubscribe
 */
router.post('/unsubscribe', requireAuth, async (req: Request, res: Response) => {
  try {
    const { endpoint } = req.body;

    if (!endpoint) {
      return res.status(400).json({
        error: 'Missing endpoint',
        message: 'Subscription endpoint is required',
      });
    }

    await pushNotificationService.removeSubscription(endpoint);

    logger.info('Push subscription removed', { userId: req.user!.id, endpoint });

    res.json({
      success: true,
      message: 'Successfully unsubscribed from push notifications',
    });
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('Failed to remove push subscription', { error });
    res.status(500).json({
      error: 'Unsubscribe failed',
      message: 'Failed to remove push subscription',
    });
  }
});

/**
 * Get user's push subscription status
 * GET /push/status
 */
router.get('/status', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const subscriptions = await pushNotificationService.getUserSubscriptions(userId);

    res.json({
      isSubscribed: subscriptions.length > 0,
      deviceCount: subscriptions.length,
      vapidPublicKey: pushNotificationService.getVapidPublicKey(),
    });
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('Failed to get push status', { error });
    res.status(500).json({
      error: 'Status check failed',
      message: 'Failed to get push notification status',
    });
  }
});

/**
 * Send a test notification to the current user
 * POST /push/test
 */
router.post('/test', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;

    const result = await pushNotificationService.sendToUser(userId, {
      title: 'Test Notification',
      body: 'Push notifications are working correctly!',
      icon: '/icons/icon-192.png',
      tag: 'test-notification',
      data: {
        type: 'test',
        url: '/',
      },
    });

    if (result.sent === 0) {
      return res.status(404).json({
        error: 'No subscriptions',
        message: 'No active push subscriptions found for your account',
      });
    }

    res.json({
      success: true,
      sent: result.sent,
      failed: result.failed,
      message: `Test notification sent to ${result.sent} device(s)`,
    });
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('Failed to send test notification', { error });
    res.status(500).json({
      error: 'Test failed',
      message: 'Failed to send test notification',
    });
  }
});

// ============================================
// ADMIN ENDPOINTS (for sending notifications)
// ============================================

/**
 * Send notification to specific users
 * POST /push/send
 * Admin only
 */
router.post('/send', requireAuth, async (req: Request, res: Response) => {
  try {
    const { userIds, payload } = req.body;

    // Check if user is an operator/admin
    if (req.user!.role !== 'operator') {
      return res.status(403).json({
        error: 'Unauthorized',
        message: 'Only operators can send notifications to other users',
      });
    }

    if (!userIds?.length || !payload?.title) {
      return res.status(400).json({
        error: 'Invalid request',
        message: 'userIds and payload.title are required',
      });
    }

    const result = await pushNotificationService.sendToUsers(userIds, payload);

    logger.info('Notifications sent', {
      sender: req.user!.id,
      recipientCount: userIds.length,
      sent: result.sent,
      failed: result.failed
    });

    res.json({
      success: true,
      ...result,
      message: `Notification sent to ${result.sent} device(s)`,
    });
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('Failed to send notifications', { error });
    res.status(500).json({
      error: 'Send failed',
      message: 'Failed to send notifications',
    });
  }
});

/**
 * Send notification to entire organization
 * POST /push/broadcast
 * Admin only
 */
router.post('/broadcast', requireAuth, async (req: Request, res: Response) => {
  try {
    const { payload, excludeUserIds } = req.body;
    const organizationId = req.headers['x-organization-id'] as string;

    // Check if user is an operator/admin
    if (req.user!.role !== 'operator') {
      return res.status(403).json({
        error: 'Unauthorized',
        message: 'Only operators can broadcast notifications',
      });
    }

    if (!payload?.title) {
      return res.status(400).json({
        error: 'Invalid request',
        message: 'payload.title is required',
      });
    }

    const result = await pushNotificationService.sendToOrganization(
      organizationId,
      payload,
      excludeUserIds
    );

    logger.info('Broadcast sent', {
      sender: req.user!.id,
      organizationId,
      sent: result.sent,
      failed: result.failed
    });

    res.json({
      success: true,
      ...result,
      message: `Broadcast sent to ${result.sent} device(s)`,
    });
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('Failed to send broadcast', { error });
    res.status(500).json({
      error: 'Broadcast failed',
      message: 'Failed to send broadcast notification',
    });
  }
});

export default router;
