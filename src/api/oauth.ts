import { Router, Request, Response } from 'express';
import { requireAuth, requireOperator } from '../middleware/auth.js';
import { pool } from '../database/db.js';
import { encrypt, decrypt } from '../services/encryptionService.js';
import { logger } from '../utils/logger.js';

const router = Router();

/**
 * GET /api/oauth/meta/status
 * Check if Meta account is connected
 */
router.get('/meta/status', requireAuth, async (req: Request, res: Response) => {
    try {
        const userId = req.user!.id;

        const { rows } = await pool.query(
            `SELECT platform, ad_account_id, expires_at, created_at
       FROM oauth_tokens
       WHERE client_id = $1 AND platform = 'meta'`,
            [userId]
        );

        if (rows.length === 0) {
            return res.json({
                data: {
                    connected: false,
                    platform: 'meta'
                }
            });
        }

        const token = rows[0];
        const isExpired = token.expires_at && new Date(token.expires_at) < new Date();

        res.json({
            data: {
                connected: !isExpired,
                platform: 'meta',
                adAccountId: token.ad_account_id,
                expiresAt: token.expires_at,
                connectedAt: token.created_at
            }
        });
    } catch (error: unknown) {
    const err = error as Error;
        logger.error('OAuth status check error:', error);
        res.status(500).json({
            error: {
                code: 'INTERNAL_ERROR',
                message: 'Failed to check OAuth status'
            }
        });
    }
});

/**
 * DELETE /api/oauth/meta/disconnect
 * Disconnect Meta account
 */
router.delete('/meta/disconnect', requireAuth, async (req: Request, res: Response) => {
    try {
        const userId = req.user!.id;

        await pool.query(
            'DELETE FROM oauth_tokens WHERE client_id = $1 AND platform = $2',
            [userId, 'meta']
        );

        logger.info('Meta account disconnected', { userId });

const { audit } = await import('../utils/logger.js');
        audit.info('oauth.disconnect', { user_id: userId, platform: 'meta' });
        res.json({
            data: {
                message: 'Meta account disconnected successfully'
            }
        });
    } catch (error: unknown) {
    const err = error as Error;
        logger.error('OAuth disconnect error:', error);
        res.status(500).json({
            error: {
                code: 'INTERNAL_ERROR',
                message: 'Failed to disconnect account'
            }
        });
    }
});

/**
 * POST /api/oauth/meta/connect
 * Store Meta OAuth token (for testing/manual connection)
 */
router.post('/meta/connect', requireAuth, async (req: Request, res: Response) => {
    try {
        const userId = req.user!.id;
        const { accessToken, adAccountId, expiresIn } = req.body;

        if (!accessToken || !adAccountId) {
            return res.status(400).json({
                error: {
                    code: 'MISSING_FIELDS',
                    message: 'Access token and ad account ID are required'
                }
            });
        }

        // Encrypt the access token
        const encryptedToken = encrypt(accessToken);

        // Calculate expiry
        const expiresAt = expiresIn
            ? new Date(Date.now() + expiresIn * 1000)
            : new Date(Date.now() + 60 * 24 * 60 * 60 * 1000); // 60 days default

        // Upsert token
        await pool.query(
            `INSERT INTO oauth_tokens (client_id, platform, access_token, ad_account_id, expires_at)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (client_id, platform)
       DO UPDATE SET 
         access_token = $3,
         ad_account_id = $4,
         expires_at = $5,
         updated_at = NOW()`,
            [userId, 'meta', encryptedToken, adAccountId, expiresAt]
        );

        logger.info('Meta OAuth token stored', { userId, adAccountId });

const { audit } = await import('../utils/logger.js');
        audit.info('oauth.connect', { user_id: userId, platform: 'meta', ad_account: adAccountId });
        res.json({
            data: {
                message: 'Meta account connected successfully',
                adAccountId,
                expiresAt
            }
        });
    } catch (error: unknown) {
    const err = error as Error;
        logger.error('OAuth connect error:', error);
        res.status(500).json({
            error: {
                code: 'INTERNAL_ERROR',
                message: 'Failed to connect account'
            }
        });
    }
});

/**
 * GET /api/oauth/meta/token
 * Get decrypted Meta access token (for internal use by campaign execution)
 */
router.get('/meta/token', requireAuth, requireOperator, async (req: Request, res: Response) => {
    try {
        const userId = req.user!.id;

        const { rows } = await pool.query(
            `SELECT access_token, ad_account_id, expires_at
       FROM oauth_tokens
       WHERE client_id = $1 AND platform = 'meta'`,
            [userId]
        );

        if (rows.length === 0) {
            return res.status(404).json({
                error: {
                    code: 'NOT_CONNECTED',
                    message: 'Meta account not connected'
                }
            });
        }

        const token = rows[0];
        const isExpired = token.expires_at && new Date(token.expires_at) < new Date();

        if (isExpired) {
            return res.status(401).json({
                error: {
                    code: 'TOKEN_EXPIRED',
                    message: 'Meta token has expired. Please reconnect your account.'
                }
            });
        }

        // Decrypt the token
        const decryptedToken = decrypt(token.access_token);

        res.json({
            data: {
                accessToken: decryptedToken,
                adAccountId: token.ad_account_id
            }
        });
    } catch (error: unknown) {
    const err = error as Error;
        logger.error('OAuth token retrieval error:', error);
        res.status(500).json({
            error: {
                code: 'INTERNAL_ERROR',
                message: 'Failed to retrieve token'
            }
        });
    }
});

export default router;
