import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { createClient, findClientByEmail, validatePassword, updateClient, findClientById } from '../services/clientService.js';
import {
  createUser,
  findUserByEmail,
  createOrganization,
  getUserOrganizations,
} from '../services/organizationService.js';
import { generateToken } from '../utils/jwt.js';
import { emailSchema, passwordSchema } from '../utils/validators.js';
import { logger } from '../utils/logger.js';
import { getMetaOAuthUrl, exchangeOAuthCode, getAdAccounts, encryptToken } from '../services/metaApi.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();


/**
 * POST /api/auth/signup
 * Create new client account with multi-tenancy support
 *
 * Creates:
 * 1. Client record (legacy compatibility)
 * 2. User record (new multi-tenancy)
 * 3. Organization with user as owner (new multi-tenancy)
 */
router.post('/signup', async (req: Request, res: Response) => {
  try {
    // Validate request body
    const signupSchema = z.object({
      name: z.string().min(1, 'Name is required'),
      email: emailSchema,
      password: passwordSchema,
      organization_name: z.string().min(1).max(100).optional(),
    });

    const { name, email, password, organization_name } = signupSchema.parse(req.body);

    // Create client (legacy table - for backward compatibility)
    const client = await createClient(name, email, password);

    // === Multi-tenancy: Create user and organization ===
    let organizationData = null;
    let user: Awaited<ReturnType<typeof findUserByEmail>> = null;
    try {
      // Check if user already exists in new users table (shouldn't happen, but defensive)
      user = await findUserByEmail(email);

      if (!user) {
        // Create user in new users table
        const nameParts = name.split(' ');
        user = await createUser({
          email,
          password,
          first_name: nameParts[0] || undefined,
          last_name: nameParts.slice(1).join(' ') || undefined,
        });
      }

      // Create default organization for user
      const orgName = organization_name || `${name}'s Organization`;
      const org = await createOrganization(
        { name: orgName },
        user.id
      );

      organizationData = {
        id: org.id,
        name: org.name,
        slug: org.slug,
        plan: org.plan,
      };

      logger.info(`Multi-tenancy setup complete for ${email}`, {
        userId: user.id,
        orgId: org.id,
      });
    } catch (mtError) {
      // Log but don't fail signup if multi-tenancy setup fails
      // User can create organization later
      logger.warn(`Multi-tenancy setup failed for ${email}, continuing with legacy auth`, mtError);
    }

    // Generate access token - use user.id (for pipeline_jobs FK) when available, fallback to client.id
    const userId = user?.id || client.id;
    const accessToken = generateToken({
      id: userId,
      email: client.email,
      role: client.role,
      organizationId: organizationData?.id,
      clientId: client.id
    });

    // Issue refresh token cookie (still uses client.id for sessions table)
    const { generateRefreshToken, createSession, setRefreshCookie } = await import('../services/sessionService.js');
    const rt = generateRefreshToken();
    const expires = await createSession(client.id, rt, req, 30);
    setRefreshCookie(res, rt, expires);

    logger.info(`User signed up: ${email}`, { userId, clientId: client.id });
    const { audit } = await import('../utils/logger.js');
    audit.info('user.signup', { user_id: userId, client_id: client.id, email });

    // Return client info + access token + organization info
    res.status(201).json({
      id: client.id,
      name: client.name,
      email: client.email,
      role: client.role,
      token: accessToken,
      organization: organizationData,
    });
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid input',
          details: error.errors
        }
      });
    }

    const err = error as Error;
    if (err.message === 'EMAIL_ALREADY_EXISTS') {
      return res.status(400).json({
        error: {
          code: 'EMAIL_ALREADY_EXISTS',
          message: 'An account with this email already exists'
        }
      });
    }

    logger.error('Signup error:', error);
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to create account'
      }
    });
  }
});

/**
 * POST /api/auth/login
 * Authenticate user and return JWT token
 */
router.post('/login', async (req: Request, res: Response) => {
  try {
    // Validate request body
    const loginSchema = z.object({
      email: emailSchema,
      password: z.string().min(1, 'Password is required')
    });

    const validationResult = loginSchema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid input',
          details: validationResult.error.errors
        }
      });
    }

    const { email, password } = validationResult.data;

    // Find client by email
    const client = await findClientByEmail(email);
    if (!client) {
      return res.status(401).json({
        error: {
          code: 'INVALID_CREDENTIALS',
          message: 'Invalid email or password'
        }
      });
    }

    // Validate password
    const isValid = await validatePassword(client, password);
    if (!isValid) {
      return res.status(401).json({
        error: {
          code: 'INVALID_CREDENTIALS',
          message: 'Invalid email or password'
        }
      });
    }

    // Check if account is active (not cancelled)
    if (client.status === 'cancelled') {
      return res.status(403).json({
        error: {
          code: 'ACCOUNT_SUSPENDED',
          message: 'Your account has been suspended. Contact support.'
        }
      });
    }

    // === Multi-tenancy: Fetch organization data for login response ===
    // IMPORTANT: Fetch user FIRST to get correct user.id for token (pipeline_jobs FK)
    let organizationData = null;
    let organizationsData: unknown[] = [];
    let permissionsData = null;
    let mtUser = null;
    try {
      mtUser = await findUserByEmail(email);
      if (mtUser) {
        const orgs = await getUserOrganizations(mtUser.id);
        organizationsData = orgs;

        // Use first organization as default context
        if (orgs.length > 0) {
          const defaultOrg = orgs[0];
          organizationData = {
            id: defaultOrg.organization_id,
            name: defaultOrg.organization_name,
            slug: defaultOrg.organization_slug,
            plan: 'starter', // Default, would need to fetch from org
            status: 'active',
          };
        }
      }
    } catch (mtError) {
      logger.warn(`Multi-tenancy data fetch failed for ${email} during login`, mtError);
    }

    // SEC-008 FIX: Revoke all existing sessions on login to prevent session fixation
    const { generateRefreshToken, createSession, setRefreshCookie, revokeAllSessions } = await import('../services/sessionService.js');
    await revokeAllSessions(client.id);

    // Generate access token - use user.id (for pipeline_jobs FK) when available, fallback to client.id
    const userId = mtUser?.id || client.id;
    const accessToken = generateToken({
      id: userId,
      email: client.email,
      role: client.role,
      organizationId: organizationData?.id,
      clientId: client.id
    });

    // Issue refresh token cookie (still uses client.id for sessions table)
    const rt = generateRefreshToken();
    const expires = await createSession(client.id, rt, req, 30);
    setRefreshCookie(res, rt, expires);

    logger.info(`User logged in: ${email}`, { userId, clientId: client.id });
    const { audit } = await import('../utils/logger.js');
    audit.info('user.login', { user_id: userId, client_id: client.id, email });

    // Return client info + access token + organization context
    res.json({
      id: client.id,
      name: client.name,
      email: client.email,
      role: client.role,
      status: client.status,
      token: accessToken,
      organization: organizationData,
      organizations: organizationsData,
      permissions: permissionsData,
    });
  } catch (error: unknown) {
    const err = error as Error;
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid input',
          details: error.errors
        }
      });
    }

    logger.error('Login error:', error);
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Login failed'
      }
    });
  }
});

/**
 * GET /api/auth/me
 * Get current authenticated user info (requires auth middleware)
 * Now includes organization context for multi-tenancy
 */
router.get('/me', requireAuth, async (req: Request, res: Response) => {
  try {
    const user = req.user!;
    // Fetch fresh client data to get credits
    const client = await findClientById(user.id);

    // Build response with organization context if available
    const response: any = {
      id: user.id,
      email: user.email,
      role: user.role,
      credits: (client as any)?.credits ?? 0
    };

    // Add organization context if multi-tenancy middleware loaded it
    if (req.org) {
      response.organization = {
        id: req.org.organization.id,
        name: req.org.organization.name,
        slug: req.org.organization.slug,
        plan: req.org.organization.plan,
        status: req.org.organization.status
      };
      response.permissions = req.org.permissions;
      response.member = {
        role: req.org.role.name,
        user_id: req.org.user.id
      };
    }

    // Also fetch all organizations user belongs to
    // If no organization context from middleware, set the first org as default
    try {
      const mtUser = await findUserByEmail(user.email);
      if (mtUser) {
        const orgs = await getUserOrganizations(mtUser.id);
        response.organizations = orgs;

        // Set default organization if not already set by middleware
        if (!response.organization && orgs.length > 0) {
          const defaultOrg = orgs[0];
          response.organization = {
            id: defaultOrg.organization_id,
            name: defaultOrg.organization_name,
            slug: defaultOrg.organization_slug,
            plan: 'starter',
            status: 'active'
          };
        }
      }
    } catch {
      // Multi-tenancy data not available yet, continue
    }

    res.json(response);
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('Get user info error:', error);
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to get user info'
      }
    });
  }
});

/**
 * GET /api/auth/meta/authorize
 * Get Meta OAuth URL for client to authorize
 */
router.get('/meta/authorize', requireAuth, (req: Request, res: Response) => {
  try {
    const redirectUri = process.env.META_REDIRECT_URI || 'http://localhost:3000/api/auth/meta/callback';
    const oauthUrl = getMetaOAuthUrl(redirectUri);

    res.json({
      url: oauthUrl
    });
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('Meta OAuth URL generation error:', error);
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to generate OAuth URL'
      }
    });
  }
});

/**
 * GET /api/auth/meta/callback
 * Meta OAuth callback - exchange code for access token
 */
router.get('/meta/callback', requireAuth, async (req: Request, res: Response) => {
  try {
    const { code, state } = req.query;

    if (!code) {
      return res.status(400).json({
        error: {
          code: 'MISSING_CODE',
          message: 'Authorization code is required'
        }
      });
    }

    const user = req.user!;
    const redirectUri = process.env.META_REDIRECT_URI || 'http://localhost:3000/api/auth/meta/callback';

    // Exchange code for access token
    const tokenData = await exchangeOAuthCode(code as string, redirectUri);

    // Get user's ad accounts
    const adAccounts = await getAdAccounts(tokenData.access_token);

    if (adAccounts.length === 0) {
      return res.status(400).json({
        error: {
          code: 'NO_AD_ACCOUNTS',
          message: 'No ad accounts found for this Meta account'
        }
      });
    }

    // Use first ad account (in production, let user choose)
    const adAccount = adAccounts[0];

    // Encrypt and store tokens
    const encryptedToken = encryptToken(tokenData.access_token);

    await updateClient(user.id, {
      api_keys: {
        meta: {
          access_token: encryptedToken,
          ad_account_id: adAccount.account_id,
          expires_at: Date.now() + (tokenData.expires_in * 1000)
        }
      }
    });

    logger.info(`Meta account connected for user ${user.email}: ${adAccount.account_id}`);

    res.json({
      success: true,
      message: 'Meta account connected successfully',
      ad_account: {
        id: adAccount.account_id,
        name: adAccount.name,
        currency: adAccount.currency
      }
    });
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('Meta OAuth callback error:', error);
    res.status(500).json({
      error: {
        code: 'OAUTH_ERROR',
        message: err.message || 'Failed to connect Meta account'
      }
    });
  }
});

/**
 * POST /api/auth/refresh
 */
router.post('/refresh', async (req: Request, res: Response) => {
  try {
    const { getRefreshCookie, findSession, deleteSessionByToken, generateRefreshToken, createSession, setRefreshCookie, revokeRefreshToken, findRevoked, revokeAllSessions } = await import('../services/sessionService.js');
    const rt = getRefreshCookie(req);
    if (!rt) {
      return res.status(401).json({ error: { code: 'NO_REFRESH', message: 'Not authenticated' } });
    }
    const session = await findSession(rt);
    if (!session) {
      // Reuse detection: if this token was previously revoked, nuke all sessions
      const revoked = await findRevoked(rt);
      if (revoked?.client_id) {
        await revokeAllSessions(revoked.client_id);
        const { audit } = await import('../utils/logger.js');
        audit.warn('session.reuse_detected', { user_id: revoked.client_id });
        return res.status(401).json({ error: { code: 'REFRESH_TOKEN_REUSED', message: 'Session invalidated' } });
      }
      return res.status(401).json({ error: { code: 'INVALID_REFRESH', message: 'Session expired' } });
    }

    // Rotate & revoke the used token
    await deleteSessionByToken(rt);
    await revokeRefreshToken(rt, session.client_id);
    const newRt = generateRefreshToken();
    const expires = await createSession(session.client_id, newRt, req, 30);
    setRefreshCookie(res, newRt, expires);

    // New access token
    const { findClientById } = await import('../services/clientService.js');
    const { findUserByEmail } = await import('../services/organizationService.js');

    const client = await findClientById(session.client_id);
    if (!client) {
      return res.status(401).json({ error: { code: 'INVALID_SESSION', message: 'User not found' } });
    }

    // === Multi-tenancy: Resolve correct user.id for token (pipeline_jobs FK) ===
    let userId = client.id;
    try {
      // Try to find the new user record associated with this client email
      const mtUser = await findUserByEmail(client.email);
      if (mtUser) {
        userId = mtUser.id;
      }
    } catch (e) {
      // Fallback to client.id if user lookup fails
      logger.warn(`Failed to resolve multi-tenant user for refresh token (${client.email}), using client.id`);
    }

    const accessToken = generateToken({
      id: userId,
      email: client.email,
      role: client.role,
      clientId: client.id
    });
    const { audit } = await import('../utils/logger.js');
    audit.info('session.refresh', { user_id: userId, session_id: session.id || undefined });
    return res.json({ token: accessToken });
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('Refresh token error:', error);
    return res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to refresh session' } });
  }
});

/**
 * POST /api/auth/logout
 * SEC-001 FIX: Blacklist JWT token on logout
 */
router.post('/logout', requireAuth, async (req: Request, res: Response) => {
  try {
    const { getRefreshCookie, deleteSessionByToken, clearRefreshCookie } = await import('../services/sessionService.js');
    const { revokeAllUserTokens } = await import('../middleware/auth.js');

    // SEC-001 FIX: Revoke all user tokens in Redis
    if (req.user?.id) {
      try {
        await revokeAllUserTokens(req.user.id);
      } catch (revokeError) {
        logger.warn('Failed to revoke user tokens on logout:', revokeError);
        // Continue with logout even if revocation fails
      }
    }

    // Clear refresh token session
    const rt = getRefreshCookie(req);
    if (rt) {
      await deleteSessionByToken(rt);
      clearRefreshCookie(res);
    }

    const { audit } = await import('../utils/logger.js');
    audit.info('user.logout', { user_id: req.user?.id });
    return res.json({ success: true });
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('Logout error:', error);
    return res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to logout' } });
  }
});

/**
 * POST /api/auth/magic/start
 * Begin passwordless sign-in: generate a one-time link and (in dev) return it
 */
router.post('/magic/start', async (req: Request, res: Response) => {
  try {
    const startSchema = z.object({ email: emailSchema });
    const { email } = startSchema.parse(req.body);

    const { randomBytes, createHash } = await import('crypto');
    const secret = randomBytes(32).toString('base64url');
    const hash = createHash('sha256').update(secret).digest('hex');

    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes
    const { pool } = await import('../database/db.js');
    await pool.query(
      `INSERT INTO magic_links (email, token_hash, expires_at, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5)`,
      [email.toLowerCase(), hash, expiresAt, req.ip || null, req.headers['user-agent'] || null]
    );

    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const verifyUrl = `${baseUrl}/api/auth/magic/verify?token=${secret}`;

    const { audit } = await import('../utils/logger.js');
    audit.info('magic.start', { email });

    if (process.env.NODE_ENV !== 'production') {
      return res.json({ success: true, magicLink: verifyUrl, expiresAt: expiresAt.toISOString() });
    }
    return res.json({ success: true });
  } catch (error: unknown) {
    const err = error as Error;
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid input', details: error.errors } });
    }
    logger.error('Magic link start error:', error);
    return res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to start magic link sign-in' } });
  }
});

/**
 * GET /api/auth/magic/verify?token=...
 * Verify magic link, issue refresh cookie + access token, and redirect to frontend
 */
router.get('/magic/verify', async (req: Request, res: Response) => {
  try {
    const token = req.query.token as string | undefined;
    if (!token) {
      return res.status(400).json({ error: { code: 'MISSING_TOKEN', message: 'Token is required' } });
    }

    const { createHash, randomBytes } = await import('crypto');
    const tokenHash = createHash('sha256').update(token).digest('hex');

    const { pool } = await import('../database/db.js');
    const { rows } = await pool.query(
      `SELECT * FROM magic_links WHERE token_hash = $1 AND used_at IS NULL AND expires_at > NOW()`,
      [tokenHash]
    );

    if (rows.length === 0) {
      return res.status(400).json({ error: { code: 'TOKEN_INVALID', message: 'This link is invalid or expired' } });
    }

    const ml = rows[0];

    // Find or create client by email
    let client = await findClientByEmail(ml.email);
    if (!client) {
      // Create with a random strong password (user will never use it)
      const randPass = randomBytes(48).toString('hex');
      client = await createClient(ml.email.split('@')[0], ml.email, randPass);
    }

    // Mark magic link as used and optionally set client_id
    await pool.query(`UPDATE magic_links SET used_at = NOW(), client_id = $1 WHERE id = $2`, [client.id, ml.id]);

    // Issue session (refresh cookie) and access token
    const accessToken = generateToken({ id: client.id, email: client.email, role: client.role });
    const { generateRefreshToken, createSession, setRefreshCookie } = await import('../services/sessionService.js');
    const rt = generateRefreshToken();
    const expires = await createSession(client.id, rt, req, 30);
    setRefreshCookie(res, rt, expires);

    const frontend = process.env.FRONTEND_URL || 'http://localhost:5173';
    const redirectUrl = `${frontend}?auth=magic_success`;

    const { audit } = await import('../utils/logger.js');
    audit.info('magic.verify', { user_id: client.id, email: client.email });

    // For non-browser clients allow JSON fallback
    if (req.headers.accept?.includes('application/json')) {
      return res.json({ success: true, token: accessToken });
    }

    return res.redirect(302, redirectUrl);
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('Magic link verify error:', error);
    return res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to verify magic link' } });
  }
});

export default router;

