import { Router, Request, Response } from 'express';
import { getGoogleAuthUrl, exchangeCodeForTokens, getGoogleUserInfo } from '../services/googleAuth.js';
import { pool } from '../database/db.js';
import { generateToken } from '../utils/jwt.js';
import { logger } from '../utils/logger.js';
import crypto from 'crypto';

const router = Router();

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

/**
 * GET /api/auth/google
 * Initiate Google OAuth flow
 */
router.get('/google', (req: Request, res: Response) => {
    try {
        // Generate state for CSRF protection
        const state = crypto.randomBytes(16).toString('hex');

        // Store state in session/cookie for verification (simplified for now)
        res.cookie('oauth_state', state, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            maxAge: 10 * 60 * 1000 // 10 minutes
        });

        const authUrl = getGoogleAuthUrl(state);
        res.redirect(authUrl);
    } catch (error: unknown) {
    const err = error as Error;
        logger.error('Error initiating Google OAuth:', error);
        res.status(500).json({
            error: {
                code: 'OAUTH_ERROR',
                message: 'Failed to initiate Google authentication'
            }
        });
    }
});

/**
 * GET /api/auth/google/callback
 * Handle OAuth callback from Google
 */
router.get('/google/callback', async (req: Request, res: Response) => {
    try {
        const { code, state, error } = req.query;

        // Handle OAuth errors
        if (error) {
            logger.error('Google OAuth error:', error);
            return res.redirect(`${FRONTEND_URL}?error=oauth_failed`);
        }

        // Validate state (CSRF protection)
        const storedState = req.cookies.oauth_state;
        if (!state || state !== storedState) {
            logger.error('OAuth state mismatch');
            return res.redirect(`${FRONTEND_URL}?error=invalid_state`);
        }

        if (!code || typeof code !== 'string') {
            return res.redirect(`${FRONTEND_URL}?error=no_code`);
        }

        // Exchange code for tokens
        const tokens = await exchangeCodeForTokens(code);

        // Get user info from Google
        const googleUser = await getGoogleUserInfo(tokens.access_token);

        // Check if user exists by Google ID
        let user = await pool.query(
            'SELECT * FROM clients WHERE google_id = $1',
            [googleUser.id]
        );

        if (user.rows.length === 0) {
            // Check if user exists by email
            user = await pool.query(
                'SELECT * FROM clients WHERE email = $1',
                [googleUser.email]
            );

            if (user.rows.length > 0) {
                // Link Google account to existing user
                await pool.query(
                    `UPDATE clients 
                     SET google_id = $1, google_email = $2, avatar_url = $3, updated_at = NOW()
                     WHERE id = $4`,
                    [googleUser.id, googleUser.email, googleUser.picture, user.rows[0].id]
                );
                logger.info(`Linked Google account to existing user: ${googleUser.email}`);
            } else {
                // Create new user
                const result = await pool.query(
                    `INSERT INTO clients (name, email, google_id, google_email, avatar_url, role, status)
                     VALUES ($1, $2, $3, $4, $5, 'client', 'active')
                     RETURNING *`,
                    [googleUser.name, googleUser.email, googleUser.id, googleUser.email, googleUser.picture]
                );
                user.rows[0] = result.rows[0];
                logger.info(`Created new user from Google: ${googleUser.email}`);
            }
        } else {
            // Update existing Google user's info
            await pool.query(
                `UPDATE clients 
                 SET name = $1, google_email = $2, avatar_url = $3, updated_at = NOW()
                 WHERE google_id = $4`,
                [googleUser.name, googleUser.email, googleUser.picture, googleUser.id]
            );
            logger.info(`Updated existing Google user: ${googleUser.email}`);
        }

        // Refresh user data
        const finalUser = await pool.query(
            'SELECT * FROM clients WHERE google_id = $1',
            [googleUser.id]
        );

// Generate JWT token
        const jwtToken = generateToken({
            id: finalUser.rows[0].id,
            email: finalUser.rows[0].email,
            role: finalUser.rows[0].role
        });

        // Also issue a refresh token cookie for the browser session
        try {
            const { generateRefreshToken, createSession, setRefreshCookie } = await import('../services/sessionService.js');
            const rt = generateRefreshToken();
            const userId = finalUser.rows[0]?.id;
            if (userId) {
                const expires = await createSession(userId, rt, req as any, 30);
                setRefreshCookie(res, rt, expires);
            }
        } catch (e) {
            // Non-fatal: session creation failure doesn't block OAuth
            // User can still use the short-lived token
            const { logger } = await import('../utils/logger.js');
            logger.warn('Failed to create session during Google OAuth', { error: (e as Error).message });
        }

// Clear OAuth state cookie
        res.clearCookie('oauth_state');

        const { audit } = await import('../utils/logger.js');
        audit.info('oauth.connect', { user_id: finalUser.rows[0].id, platform: 'google' });

        // Best practice: do not put tokens in the URL; rely on refresh cookie
        res.redirect(`${FRONTEND_URL}?auth=google_success`);
    } catch (error: unknown) {
    const err = error as Error;
        logger.error('Error in Google OAuth callback:', error);
        res.redirect(`${FRONTEND_URL}?error=auth_failed`);
    }
});

export default router;
