import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { composioService } from '../services/composioService.js';
import { requireAuth } from '../middleware/auth.js';
import { logger, auditLogger } from '../utils/logger.js';

// SEC-003: HMAC signing for callback state validation
const STATE_SECRET = process.env.COMPOSIO_STATE_SECRET || process.env.JWT_SECRET || 'fallback-secret-change-in-production';

function signState(clientId: string, toolName: string): string {
    const data = `${clientId}|${toolName}`;
    const timestamp = Date.now().toString();
    const signature = crypto
        .createHmac('sha256', STATE_SECRET)
        .update(`${data}|${timestamp}`)
        .digest('hex')
        .substring(0, 16);
    return `${data}|${timestamp}|${signature}`;
}

function verifyState(state: string): { clientId: string; toolName: string } | null {
    const parts = state.split('|');
    if (parts.length !== 4) return null;

    const [clientId, toolName, timestamp, signature] = parts;

    // Check timestamp is within 10 minutes
    const timestampMs = parseInt(timestamp, 10);
    if (isNaN(timestampMs) || Date.now() - timestampMs > 600000) {
        return null;
    }

    // Verify signature
    const expectedSignature = crypto
        .createHmac('sha256', STATE_SECRET)
        .update(`${clientId}|${toolName}|${timestamp}`)
        .digest('hex')
        .substring(0, 16);

    if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) {
        return null;
    }

    return { clientId, toolName };
}

const router = Router();

/**
 * GET /api/composio/tools
 * Get available tools to connect
 */
router.get('/tools', requireAuth, async (req: Request, res: Response) => {
    try {
        const tools = await composioService.getAvailableTools();
        res.json({ tools });
    } catch (error: unknown) {
    const err = error as Error;
        logger.error('Failed to fetch available tools:', error);
        res.status(500).json({
            error: {
                code: 'COMPOSIO_ERROR',
                message: err.message
            }
        });
    }
});

/**
 * GET /api/composio/connected
 * Get user's connected tools
 */
router.get('/connected', requireAuth, async (req: Request, res: Response) => {
    try {
        const tools = await composioService.getConnectedTools(req.user!.id);
        res.json({ tools });
    } catch (error: unknown) {
    const err = error as Error;
        logger.error('Failed to fetch connected tools:', error);
        res.status(500).json({
            error: {
                code: 'COMPOSIO_ERROR',
                message: err.message
            }
        });
    }
});

/**
 * POST /api/composio/connect/:toolName
 * Initiate OAuth flow for a tool with signed state (SEC-003)
 */
router.post('/connect/:toolName', requireAuth, async (req: Request, res: Response) => {
    try {
        const { toolName } = req.params;
        const clientId = req.user!.id;

        // Generate signed state for callback validation
        const signedState = signState(clientId, toolName);
        const authUrl = await composioService.getAuthUrl(toolName, clientId, signedState);

        res.json({ authUrl, state: signedState });
    } catch (error: unknown) {
    const err = error as Error;
        logger.error(`Failed to initiate connection for ${req.params.toolName}:`, error);
        res.status(500).json({
            error: {
                code: 'COMPOSIO_ERROR',
                message: err.message
            }
        });
    }
});

/**
 * GET /api/composio/callback
 * Handle OAuth callback with cryptographic state validation (SEC-003)
 */
router.get('/callback', async (req: Request, res: Response) => {
    try {
        const { code, state } = req.query;

        if (!code || !state) {
            auditLogger.warn('Composio callback missing code or state', {
                ip: req.ip,
                userAgent: req.headers['user-agent'],
            });
            return res.redirect(`${process.env.FRONTEND_URL}/settings?error=invalid_callback`);
        }

        // SEC-003: Verify state signature to prevent callback forgery
        const verified = verifyState(state as string);
        if (!verified) {
            auditLogger.warn('Composio callback invalid state signature', {
                ip: req.ip,
                userAgent: req.headers['user-agent'],
                state: (state as string).substring(0, 50), // Log partial for debugging
            });
            return res.redirect(`${process.env.FRONTEND_URL}/settings?error=invalid_state`);
        }

        const { clientId, toolName } = verified;

        await composioService.handleCallback(code as string, clientId, toolName);

        res.redirect(`${process.env.FRONTEND_URL}/settings?connected=${toolName}`);
    } catch (error: unknown) {
    const err = error as Error;
        logger.error('OAuth callback failed:', error);
        res.redirect(`${process.env.FRONTEND_URL}/settings?error=connection_failed`);
    }
});

/**
 * DELETE /api/composio/disconnect/:toolName
 * Disconnect a tool
 */
router.delete('/disconnect/:toolName', requireAuth, async (req: Request, res: Response) => {
    try {
        const { toolName } = req.params;
        await composioService.disconnect(req.user!.id, toolName);

        res.json({ success: true });
    } catch (error: unknown) {
    const err = error as Error;
        logger.error(`Failed to disconnect ${req.params.toolName}:`, error);
        res.status(500).json({
            error: {
                code: 'COMPOSIO_ERROR',
                message: err.message
            }
        });
    }
});

export default router;
