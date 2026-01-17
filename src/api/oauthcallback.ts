import { Router, Request, Response } from 'express';
import { exchangeOAuthCode, getAdAccounts, encryptToken } from '../services/metaApi.js';
import { logger } from '../utils/logger.js';

const router = Router();

/**
 * OAuth callback handler for Meta
 * Receives authorization code and exchanges for access token
 */
router.get('/meta/callback', async (req: Request, res: Response) => {
    try {
        const { code, state } = req.query;

        if (!code) {
            return res.status(400).send('Authorization code missing');
        }

        // Exchange code for access token
        const redirectUri = `${process.env.API_URL || 'http://localhost:3000'}/api/oauth/callback/meta`;
        const tokenData = await exchangeOAuthCode(code as string, redirectUri);

        // Get ad accounts
        const adAccounts = await getAdAccounts(tokenData.access_token);

        if (adAccounts.length === 0) {
            return res.status(400).send('No ad accounts found for this Meta account');
        }

        // Use first ad account (in production, let user choose)
        const adAccount = adAccounts[0];

        // Encrypt and store token
        const encryptedToken = encryptToken(tokenData.access_token);

        // Get user ID from state (should be passed during OAuth initiation)
        // For now, we'll redirect to frontend with token data
        // Frontend will call POST /api/oauth/meta/connect with the token

        // Redirect back to frontend with success
        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
        res.redirect(`${frontendUrl}/settings?oauth=success&platform=meta&account_id=${adAccount.account_id}`);

    } catch (error: unknown) {
    const err = error as Error;
        logger.error('OAuth callback error:', error);
        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
        res.redirect(`${frontendUrl}/settings?oauth=error&message=${encodeURIComponent(err.message)}`);
    }
});

/**
 * Initiate OAuth flow
 */
router.get('/meta/authorize', (req: Request, res: Response) => {
    const redirectUri = `${process.env.API_URL || 'http://localhost:3000'}/api/oauth/callback/meta`;
    const clientId = process.env.META_APP_ID;

    if (!clientId) {
        return res.status(500).json({ error: { message: 'Meta App ID not configured' } });
    }

    const scope = 'ads_management,ads_read,business_management';
    const state = Math.random().toString(36).substring(7); // Simple state for CSRF protection

    const authUrl = `https://www.facebook.com/v18.0/dialog/oauth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${scope}&state=${state}`;

    res.redirect(authUrl);
});

export default router;
