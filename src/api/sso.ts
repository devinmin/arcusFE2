/**
 * SSO Routes - Enterprise Single Sign-On endpoints
 * Sprint 3: SSO & Security
 *
 * Endpoints for:
 * - SAML 2.0 authentication (SP-initiated, IdP-initiated, SLO)
 * - OIDC authentication (Authorization code flow with PKCE)
 * - SSO configuration management
 * - Role and permission management
 * - IP allowlist management
 */

import { Router, Request, Response } from 'express';
import { Session, SessionData } from 'express-session';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { requirePermissionMiddleware } from '../services/permissionService.js';
import { logger } from '../utils/logger.js';
import { generateToken, TokenPayload } from '../utils/jwt.js';

// Auth modules
import * as saml from '../auth/saml.js';
import * as oidc from '../auth/oidc.js';
import type { SAMLConfig, SAMLUser } from '../auth/saml.js';
import type { OIDCConfig, OIDCUser } from '../auth/oidc.js';

// Services
import * as idpService from '../services/idpService.js';
import * as jitService from '../services/jitProvisioningService.js';
import * as roleService from '../services/roleService.js';
import * as permissionService from '../services/permissionService.js';
import * as ipAllowlistService from '../services/ipAllowlistService.js';
import { query } from '../database/db.js';

const router = Router();

// ============================================================================
// Types
// ============================================================================

// Extend express-session SessionData with SSO fields
declare module 'express-session' {
  interface SessionData {
    samlRequestId?: string;
    samlOrganizationId?: string;
    oidcState?: string;
    oidcNonce?: string;
    oidcCodeVerifier?: string;
    oidcOrganizationId?: string;
    ssoNameId?: string;
    ssoSessionIndex?: string;
  }
}

interface AuthenticatedRequest extends Request {
  user?: TokenPayload;
}

// ============================================================================
// Validation Schemas
// ============================================================================

const ssoConfigSchema = z.object({
  providerType: z.enum(['saml', 'oidc']),
  displayName: z.string().min(1).max(255),
  verifiedDomains: z.array(z.string()).optional(),
  enforceSso: z.boolean().optional(),
});

const samlConfigSchema = z.object({
  idpEntityId: z.string().url(),
  idpSsoUrl: z.string().url(),
  idpSloUrl: z.string().url().optional(),
  idpCertificate: z.string(),
  signRequests: z.boolean().optional(),
  wantAssertionsSigned: z.boolean().optional(),
  attributeMapping: z.record(z.string()).optional(),
});

const oidcConfigSchema = z.object({
  issuer: z.string().url(),
  clientId: z.string(),
  clientSecret: z.string().optional(),
  usePkce: z.boolean().optional(),
  scopes: z.array(z.string()).optional(),
});

const roleSchema = z.object({
  name: z.string().min(1).max(100),
  displayName: z.string().max(255).optional(),
  description: z.string().optional(),
  permissions: z.array(z.object({
    resource: z.string(),
    action: z.string(),
    scope: z.enum(['own', 'team', 'organization']).default('organization'),
  })),
  parentRoleId: z.string().uuid().optional(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  icon: z.string().optional(),
});

const ipAllowlistSchema = z.object({
  ipAddress: z.string().optional(),
  cidrRange: z.string().optional(),
  description: z.string().optional(),
  bypassRoles: z.array(z.string().uuid()).optional(),
  isActive: z.boolean().optional(),
});

// ============================================================================
// SAML Routes
// ============================================================================

/**
 * GET /api/sso/saml/login
 * Initiate SP-initiated SAML login
 */
router.get('/saml/login', async (req: Request, res: Response) => {
  try {
    const { organizationId, returnUrl } = req.query;

    if (!organizationId || typeof organizationId !== 'string') {
      return res.status(400).json({
        error: 'MISSING_ORGANIZATION',
        message: 'Organization ID is required',
      });
    }

    // Get SAML configuration for organization
    const config = await saml.getSAMLConfig(organizationId);
    if (!config) {
      return res.status(404).json({
        error: 'SSO_NOT_CONFIGURED',
        message: 'SAML SSO is not configured for this organization',
      });
    }

    // Generate SAML AuthnRequest
    const { redirectUrl, requestId } = await saml.generateAuthnRequest(config, returnUrl as string);

    // Store request ID in session for validation
    const session = (req as any).session as SessionData;
    session.samlRequestId = requestId;
    session.samlOrganizationId = organizationId;

    // Redirect to IdP
    res.redirect(redirectUrl);
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('SAML login error', { error });
    res.status(500).json({
      error: 'SAML_LOGIN_ERROR',
      message: 'Failed to initiate SAML login',
    });
  }
});

/**
 * POST /api/sso/saml/acs
 * SAML Assertion Consumer Service (ACS) - receive SAML response
 */
router.post('/saml/acs', async (req: Request, res: Response) => {
  try {
    const { SAMLResponse, RelayState } = req.body;

    if (!SAMLResponse) {
      return res.status(400).json({
        error: 'MISSING_SAML_RESPONSE',
        message: 'SAML response is required',
      });
    }

    // Get organization from session or RelayState
    const session = (req as AuthenticatedRequest).session;
    const organizationId = session?.samlOrganizationId;
    if (!organizationId) {
      return res.status(400).json({
        error: 'MISSING_CONTEXT',
        message: 'SSO context not found. Please try logging in again.',
      });
    }

    // Get SAML config
    const config = await saml.getSAMLConfig(organizationId as string);
    if (!config) {
      return res.status(404).json({
        error: 'SSO_NOT_CONFIGURED',
        message: 'SAML SSO is not configured for this organization',
      });
    }

    // Process SAML response (note: arguments order is samlResponse, config)
    const result = await saml.processResponse(SAMLResponse, config);

    if (!result.success) {
      logger.warn('SAML authentication failed', {
        organizationId,
        error: result.error,
      });
      return res.redirect(`/login?error=${encodeURIComponent(result.error || 'auth_failed')}`);
    }

    // JIT provision user if needed
    const provisionResult = await jitService.provisionUser(
      config.organizationId,
      result.user! as SAMLUser,
      'saml',
      config.id
    );

    if (!provisionResult.success || !provisionResult.userId) {
      logger.error('JIT provisioning failed', { errors: provisionResult.errors });
      return res.redirect('/login?error=provisioning_failed');
    }

    // Generate JWT token
    const token = generateToken({
      id: provisionResult.userId,
      email: result.user!.email,
      role: 'client',
      organizationId: organizationId as string,
    });

    // Redirect to app with token
    const returnUrl = RelayState || '/dashboard';
    res.redirect(`${returnUrl}?token=${token}`);
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('SAML ACS error', { error });
    res.redirect('/login?error=saml_error');
  }
});

/**
 * GET /api/sso/saml/logout
 * Initiate SAML Single Logout (SLO)
 */
router.get('/saml/logout', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    if (!organizationId) {
      return res.redirect('/login');
    }

    const config = await saml.getSAMLConfig(organizationId);
    if (!config || !config.idpSloUrl) {
      // No SLO configured, just logout locally
      return res.redirect('/logout');
    }

    const session = req.session;
    // Generate logout request
    const { redirectUrl } = await saml.generateLogoutRequest(
      config,
      req.user!.email,
      session?.ssoSessionIndex as string | undefined
    );

    res.redirect(redirectUrl);
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('SAML logout error', { error });
    res.redirect('/logout');
  }
});

/**
 * POST /api/sso/saml/slo
 * Handle SAML Single Logout response/request
 */
router.post('/saml/slo', async (req: Request, res: Response) => {
  try {
    const { SAMLResponse, SAMLRequest } = req.body;
    const session = (req as AuthenticatedRequest).session;
    const organizationId = session?.samlOrganizationId;

    if (!organizationId) {
      return res.redirect('/login');
    }

    const config = await saml.getSAMLConfig(organizationId as string);
    if (!config) {
      return res.redirect('/login');
    }

    if (SAMLResponse) {
      // Logout response from IdP (note: arguments order is samlResponse, config)
      await saml.processLogoutResponse(SAMLResponse, config);
    } else if (SAMLRequest) {
      // Logout request from IdP (IdP-initiated logout)
      // For now, just complete the logout locally since generateLogoutResponse isn't available
      logger.info('IdP-initiated logout request received', { organizationId });
    }

    res.redirect('/login?logout=success');
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('SAML SLO error', { error });
    res.redirect('/login');
  }
});

/**
 * GET /api/sso/saml/metadata
 * Return SP metadata XML
 */
router.get('/saml/metadata/:organizationId', async (req: Request, res: Response) => {
  try {
    const { organizationId } = req.params;

    const config = await saml.getSAMLConfig(organizationId);
    if (!config) {
      return res.status(404).json({
        error: 'SSO_NOT_CONFIGURED',
        message: 'SAML SSO is not configured for this organization',
      });
    }

    const metadata = saml.generateSpMetadata(config);

    res.set('Content-Type', 'application/xml');
    res.send(metadata);
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('SAML metadata error', { error });
    res.status(500).json({
      error: 'METADATA_ERROR',
      message: 'Failed to generate SAML metadata',
    });
  }
});

// ============================================================================
// OIDC Routes
// ============================================================================

/**
 * GET /api/sso/oidc/login
 * Initiate OIDC login
 */
router.get('/oidc/login', async (req: Request, res: Response) => {
  try {
    const { organizationId, returnUrl } = req.query;

    if (!organizationId || typeof organizationId !== 'string') {
      return res.status(400).json({
        error: 'MISSING_ORGANIZATION',
        message: 'Organization ID is required',
      });
    }

    const config = await oidc.getOIDCConfig(organizationId);
    if (!config) {
      return res.status(404).json({
        error: 'SSO_NOT_CONFIGURED',
        message: 'OIDC SSO is not configured for this organization',
      });
    }

    // Generate authorization URL (returns { url, state: OIDCAuthState })
    const { url, state: authState } = await oidc.generateAuthorizationUrl(
      config,
      returnUrl as string
    );

    // Store state and code verifier in session
    const session = (req as any).session as SessionData;
    session.oidcState = authState.state;
    session.oidcCodeVerifier = authState.codeVerifier;
    session.oidcOrganizationId = organizationId;
    session.oidcNonce = authState.nonce;

    res.redirect(url);
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('OIDC login error', { error });
    res.status(500).json({
      error: 'OIDC_LOGIN_ERROR',
      message: 'Failed to initiate OIDC login',
    });
  }
});

/**
 * GET /api/sso/oidc/callback
 * OIDC callback endpoint
 */
router.get('/oidc/callback', async (req: Request, res: Response) => {
  try {
    const { code, state, error: oidcError, error_description } = req.query;

    if (oidcError) {
      logger.warn('OIDC error response', { error: oidcError, description: error_description });
      return res.redirect(`/login?error=${encodeURIComponent(oidcError as string)}`);
    }

    if (!code || typeof code !== 'string') {
      return res.redirect('/login?error=missing_code');
    }

    const session = (req as AuthenticatedRequest).session;
    // Validate state
    const sessionState = session?.oidcState;
    if (state !== sessionState) {
      return res.redirect('/login?error=invalid_state');
    }

    const organizationId = session?.oidcOrganizationId;

    if (!organizationId) {
      return res.redirect('/login?error=missing_context');
    }

    const config = await oidc.getOIDCConfig(organizationId as string);
    if (!config) {
      return res.redirect('/login?error=sso_not_configured');
    }

    // Exchange code for tokens (note: arguments order is code, state, config)
    const result = await oidc.exchangeCodeForTokens(code, state as string, config);

    if (!result.success || !result.user) {
      logger.warn('OIDC token exchange failed', { error: result.error });
      return res.redirect(`/login?error=${encodeURIComponent(result.error || 'token_exchange_failed')}`);
    }

    // JIT provision user
    const provisionResult = await jitService.provisionUser(
      organizationId as string,
      result.user as OIDCUser,
      'oidc',
      config.id
    );

    if (!provisionResult.success || !provisionResult.userId) {
      logger.error('JIT provisioning failed', { errors: provisionResult.errors });
      return res.redirect('/login?error=provisioning_failed');
    }

    // Generate JWT token
    const token = generateToken({
      id: provisionResult.userId,
      email: result.user.email,
      role: 'client',
      organizationId: organizationId as string,
    });

    // Clear session state
    if (session) {
      delete session.oidcState;
      delete session.oidcCodeVerifier;
      delete session.oidcOrganizationId;
      delete session.oidcNonce;
    }

    res.redirect(`/dashboard?token=${token}`);
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('OIDC callback error', { error });
    res.redirect('/login?error=oidc_error');
  }
});

// ============================================================================
// SSO Configuration Management
// ============================================================================

/**
 * GET /api/sso/config
 * Get SSO configuration for the current organization
 */
router.get(
  '/config',
  requireAuth,
  requirePermissionMiddleware('settings', 'read'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const organizationId = req.user?.organizationId;
      if (!organizationId) {
        return res.status(400).json({ error: 'Organization required' });
      }

      // Get both SAML and OIDC configs
      const [samlConfig, oidcConfig] = await Promise.all([
        saml.getSAMLConfig(organizationId),
        oidc.getOIDCConfig(organizationId),
      ]);
      res.json({ samlConfig, oidcConfig });
    } catch (error: unknown) {
    const err = error as Error;
      logger.error('Get SSO config error', { error });
      res.status(500).json({ error: 'Failed to get SSO configuration' });
    }
  }
);

/**
 * POST /api/sso/config
 * Create or update SSO configuration
 */
router.post(
  '/config',
  requireAuth,
  requirePermissionMiddleware('settings', 'manage'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const organizationId = req.user?.organizationId;
      if (!organizationId) {
        return res.status(400).json({ error: 'Organization required' });
      }

      const baseConfig = ssoConfigSchema.parse(req.body);

      let config;
      if (baseConfig.providerType === 'saml') {
        const samlConfig = samlConfigSchema.parse(req.body);
        // Construct IdPMetadata from manual config input
        const metadata: idpService.IdPMetadata = {
          entityId: samlConfig.idpEntityId,
          displayName: baseConfig.displayName,
          ssoUrl: samlConfig.idpSsoUrl,
          ssoBinding: 'urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect',
          sloUrl: samlConfig.idpSloUrl,
          sloBinding: 'urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect',
          signingCertificates: [samlConfig.idpCertificate],
          encryptionCertificates: [],
          nameIdFormats: ['urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress'],
        };
        config = await idpService.configureSSOFromMetadata(
          organizationId,
          metadata,
          '', // No raw XML for manual config
          undefined,
          {
            displayName: baseConfig.displayName,
            signRequests: samlConfig.signRequests,
            wantAssertionsSigned: samlConfig.wantAssertionsSigned,
            attributeMapping: samlConfig.attributeMapping,
            verifiedDomains: baseConfig.verifiedDomains,
          }
        );
      } else {
        const oidcConfig = oidcConfigSchema.parse(req.body);
        // OIDC uses discovery document, not the same metadata format
        // For now, return not implemented for OIDC auto-configuration
        if (oidcConfig.issuer) {
          // OIDC configuration should use a different service method
          return res.status(501).json({ error: 'OIDC auto-configuration not yet implemented' });
        }
      }

      res.json({ config });
    } catch (error: unknown) {
    const err = error as Error;
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: 'Invalid configuration', details: error.errors });
      }
      logger.error('Create SSO config error', { error });
      res.status(500).json({ error: 'Failed to create SSO configuration' });
    }
  }
);

/**
 * POST /api/sso/config/test
 * Test SSO configuration
 */
router.post(
  '/config/test',
  requireAuth,
  requirePermissionMiddleware('settings', 'manage'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const organizationId = req.user?.organizationId;
      if (!organizationId) {
        return res.status(400).json({ error: 'Organization required' });
      }

      const result = await idpService.testSSOConfiguration(organizationId);
      res.json(result);
    } catch (error: unknown) {
    const err = error as Error;
      logger.error('Test SSO config error', { error });
      res.status(500).json({ error: 'Failed to test SSO configuration' });
    }
  }
);

/**
 * POST /api/sso/config/metadata
 * Parse IdP metadata XML or URL
 */
router.post(
  '/config/metadata',
  requireAuth,
  requirePermissionMiddleware('settings', 'manage'),
  async (req: Request, res: Response) => {
    try {
      const { metadataUrl, metadataXml } = req.body;

      let metadata;
      if (metadataUrl) {
        metadata = await idpService.fetchMetadataFromUrl(metadataUrl);
      } else if (metadataXml) {
        metadata = idpService.parseIdPMetadataXml(metadataXml);
      } else {
        return res.status(400).json({ error: 'Provide metadataUrl or metadataXml' });
      }

      res.json({ metadata });
    } catch (error: unknown) {
    const err = error as Error;
      logger.error('Parse metadata error', { error });
      res.status(500).json({ error: 'Failed to parse IdP metadata' });
    }
  }
);

/**
 * GET /api/sso/presets
 * Get available IdP presets
 */
router.get('/presets', async (_req: Request, res: Response) => {
  res.json({ presets: idpService.IdP_PRESETS });
});

// ============================================================================
// Role Management Routes
// ============================================================================

/**
 * GET /api/sso/roles
 * Get all roles for the organization
 */
router.get(
  '/roles',
  requireAuth,
  requirePermissionMiddleware('team', 'read'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const organizationId = req.user?.organizationId;
      if (!organizationId) {
        return res.status(400).json({ error: 'Organization required' });
      }

      const roles = await roleService.getRoles(organizationId);
      res.json({ roles });
    } catch (error: unknown) {
    const err = error as Error;
      logger.error('Get roles error', { error });
      res.status(500).json({ error: 'Failed to get roles' });
    }
  }
);

/**
 * POST /api/sso/roles
 * Create a new custom role
 */
router.post(
  '/roles',
  requireAuth,
  requirePermissionMiddleware('team', 'manage'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const organizationId = req.user?.organizationId;
      if (!organizationId) {
        return res.status(400).json({ error: 'Organization required' });
      }

      const input = roleSchema.parse(req.body);
      const role = await roleService.createRole(organizationId, input, req.user!.id);
      res.status(201).json({ role });
    } catch (error: unknown) {
    const err = error as Error;
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: 'Invalid role data', details: error.errors });
      }
      logger.error('Create role error', { error });
      res.status(500).json({ error: 'Failed to create role' });
    }
  }
);

/**
 * PUT /api/sso/roles/:id
 * Update a role
 */
router.put(
  '/roles/:id',
  requireAuth,
  requirePermissionMiddleware('team', 'manage'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const organizationId = req.user?.organizationId;
      if (!organizationId) {
        return res.status(400).json({ error: 'Organization required' });
      }

      const input = roleSchema.partial().parse(req.body);
      const role = await roleService.updateRole(req.params.id, organizationId, input);
      res.json({ role });
    } catch (error: unknown) {
    const err = error as Error;
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: 'Invalid role data', details: error.errors });
      }
      logger.error('Update role error', { error });
      res.status(500).json({ error: 'Failed to update role' });
    }
  }
);

/**
 * DELETE /api/sso/roles/:id
 * Delete a role
 */
router.delete(
  '/roles/:id',
  requireAuth,
  requirePermissionMiddleware('team', 'manage'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const organizationId = req.user?.organizationId;
      if (!organizationId) {
        return res.status(400).json({ error: 'Organization required' });
      }

      const { replacementRoleId } = req.body as { replacementRoleId?: string };
      if (!replacementRoleId) {
        return res.status(400).json({ error: 'replacementRoleId is required to reassign users' });
      }

      await roleService.deleteRole(req.params.id, organizationId, replacementRoleId, req.user!.id);
      res.status(204).send();
    } catch (error: unknown) {
    const err = error as Error;
      logger.error('Delete role error', { error });
      res.status(500).json({ error: 'Failed to delete role' });
    }
  }
);

/**
 * POST /api/sso/roles/:id/assign
 * Assign a role to a user
 */
router.post(
  '/roles/:id/assign',
  requireAuth,
  requirePermissionMiddleware('team', 'manage'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const organizationId = req.user?.organizationId;
      if (!organizationId) {
        return res.status(400).json({ error: 'Organization required' });
      }

      const { userId, validUntil } = req.body;
      if (!userId) {
        return res.status(400).json({ error: 'User ID required' });
      }

      const assignment = await roleService.assignRole(
        userId,
        organizationId,
        req.params.id,
        req.user!.id,
        { validUntil }
      );
      res.json({ assignment });
    } catch (error: unknown) {
    const err = error as Error;
      logger.error('Assign role error', { error });
      res.status(500).json({ error: 'Failed to assign role' });
    }
  }
);

/**
 * DELETE /api/sso/roles/:id/assign/:userId
 * Revoke a role from a user
 */
router.delete(
  '/roles/:id/assign/:userId',
  requireAuth,
  requirePermissionMiddleware('team', 'manage'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const organizationId = req.user?.organizationId;
      if (!organizationId) {
        return res.status(400).json({ error: 'Organization required' });
      }

      const { reason } = req.body;
      await roleService.revokeRole(
        req.params.userId,
        organizationId,
        req.params.id,
        req.user!.id,
        reason
      );
      res.status(204).send();
    } catch (error: unknown) {
    const err = error as Error;
      logger.error('Revoke role error', { error });
      res.status(500).json({ error: 'Failed to revoke role' });
    }
  }
);

/**
 * GET /api/sso/roles/templates
 * Get role templates
 */
router.get('/roles/templates', requireAuth, async (_req: Request, res: Response) => {
  res.json({ templates: roleService.ROLE_TEMPLATES });
});

// ============================================================================
// Permission Routes
// ============================================================================

/**
 * GET /api/sso/permissions
 * Get permission definitions
 */
router.get('/permissions', requireAuth, async (_req: Request, res: Response) => {
  try {
    const permissions = await permissionService.getPermissionDefinitionsByCategory();
    res.json({ permissions });
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('Get permissions error', { error });
    res.status(500).json({ error: 'Failed to get permissions' });
  }
});

/**
 * GET /api/sso/permissions/matrix
 * Get permission matrix for current user
 */
router.get(
  '/permissions/matrix',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const organizationId = req.user?.organizationId;
      if (!organizationId) {
        return res.status(400).json({ error: 'Organization required' });
      }

      const matrix = await permissionService.generatePermissionMatrix(
        req.user!.id,
        organizationId
      );
      res.json({ matrix });
    } catch (error: unknown) {
    const err = error as Error;
      logger.error('Get permission matrix error', { error });
      res.status(500).json({ error: 'Failed to get permission matrix' });
    }
  }
);

/**
 * GET /api/sso/permissions/audit
 * Get permission audit logs
 */
router.get(
  '/permissions/audit',
  requireAuth,
  requirePermissionMiddleware('settings', 'read'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const organizationId = req.user?.organizationId;
      if (!organizationId) {
        return res.status(400).json({ error: 'Organization required' });
      }

      const { limit, offset, userId, resource, action, fromDate, toDate } = req.query;

      const logs = await permissionService.getPermissionAuditLogs(organizationId, {
        limit: limit ? parseInt(limit as string) : undefined,
        offset: offset ? parseInt(offset as string) : undefined,
        userId: userId as string,
        resource: resource as string,
        action: action as string,
        fromDate: fromDate ? new Date(fromDate as string) : undefined,
        toDate: toDate ? new Date(toDate as string) : undefined,
      });

      res.json(logs);
    } catch (error: unknown) {
    const err = error as Error;
      logger.error('Get audit logs error', { error });
      res.status(500).json({ error: 'Failed to get audit logs' });
    }
  }
);

// ============================================================================
// IP Allowlist Routes
// ============================================================================

/**
 * GET /api/sso/ip-allowlist
 * Get IP allowlist entries
 */
router.get(
  '/ip-allowlist',
  requireAuth,
  requirePermissionMiddleware('settings', 'read'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const organizationId = req.user?.organizationId;
      if (!organizationId) {
        return res.status(400).json({ error: 'Organization required' });
      }

      const { activeOnly, limit, offset } = req.query;

      const result = await ipAllowlistService.getIPAllowlist(organizationId, {
        activeOnly: activeOnly === 'true',
        limit: limit ? parseInt(limit as string) : undefined,
        offset: offset ? parseInt(offset as string) : undefined,
      });

      res.json(result);
    } catch (error: unknown) {
    const err = error as Error;
      logger.error('Get IP allowlist error', { error });
      res.status(500).json({ error: 'Failed to get IP allowlist' });
    }
  }
);

/**
 * POST /api/sso/ip-allowlist
 * Add IP allowlist entry
 */
router.post(
  '/ip-allowlist',
  requireAuth,
  requirePermissionMiddleware('settings', 'manage'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const organizationId = req.user?.organizationId;
      if (!organizationId) {
        return res.status(400).json({ error: 'Organization required' });
      }

      const input = ipAllowlistSchema.parse(req.body);
      const entry = await ipAllowlistService.createIPAllowlistEntry(
        organizationId,
        input,
        req.user!.id
      );

      res.status(201).json({ entry });
    } catch (error: unknown) {
    const err = error as Error;
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: 'Invalid input', details: error.errors });
      }
      logger.error('Create IP allowlist entry error', { error });
      res.status(500).json({ error: 'Failed to create IP allowlist entry' });
    }
  }
);

/**
 * PUT /api/sso/ip-allowlist/:id
 * Update IP allowlist entry
 */
router.put(
  '/ip-allowlist/:id',
  requireAuth,
  requirePermissionMiddleware('settings', 'manage'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const organizationId = req.user?.organizationId;
      if (!organizationId) {
        return res.status(400).json({ error: 'Organization required' });
      }

      const input = ipAllowlistSchema.partial().parse(req.body);
      const entry = await ipAllowlistService.updateIPAllowlistEntry(
        req.params.id,
        organizationId,
        input
      );

      res.json({ entry });
    } catch (error: unknown) {
    const err = error as Error;
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: 'Invalid input', details: error.errors });
      }
      logger.error('Update IP allowlist entry error', { error });
      res.status(500).json({ error: 'Failed to update IP allowlist entry' });
    }
  }
);

/**
 * DELETE /api/sso/ip-allowlist/:id
 * Delete IP allowlist entry
 */
router.delete(
  '/ip-allowlist/:id',
  requireAuth,
  requirePermissionMiddleware('settings', 'manage'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const organizationId = req.user?.organizationId;
      if (!organizationId) {
        return res.status(400).json({ error: 'Organization required' });
      }

      await ipAllowlistService.deleteIPAllowlistEntry(req.params.id, organizationId);
      res.status(204).send();
    } catch (error: unknown) {
    const err = error as Error;
      logger.error('Delete IP allowlist entry error', { error });
      res.status(500).json({ error: 'Failed to delete IP allowlist entry' });
    }
  }
);

/**
 * POST /api/sso/ip-allowlist/import
 * Bulk import IP addresses
 */
router.post(
  '/ip-allowlist/import',
  requireAuth,
  requirePermissionMiddleware('settings', 'manage'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const organizationId = req.user?.organizationId;
      if (!organizationId) {
        return res.status(400).json({ error: 'Organization required' });
      }

      const { ipList, description } = req.body;
      if (!ipList || typeof ipList !== 'string') {
        return res.status(400).json({ error: 'IP list is required' });
      }

      const result = await ipAllowlistService.importIPAllowlist(
        organizationId,
        ipList,
        req.user!.id,
        description
      );

      res.json(result);
    } catch (error: unknown) {
    const err = error as Error;
      logger.error('Import IP allowlist error', { error });
      res.status(500).json({ error: 'Failed to import IP allowlist' });
    }
  }
);

/**
 * GET /api/sso/ip-allowlist/export
 * Export IP allowlist as CSV
 */
router.get(
  '/ip-allowlist/export',
  requireAuth,
  requirePermissionMiddleware('settings', 'read'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const organizationId = req.user?.organizationId;
      if (!organizationId) {
        return res.status(400).json({ error: 'Organization required' });
      }

      const csv = await ipAllowlistService.exportIPAllowlistToCSV(organizationId);

      res.set('Content-Type', 'text/csv');
      res.set('Content-Disposition', 'attachment; filename=ip-allowlist.csv');
      res.send(csv);
    } catch (error: unknown) {
    const err = error as Error;
      logger.error('Export IP allowlist error', { error });
      res.status(500).json({ error: 'Failed to export IP allowlist' });
    }
  }
);

/**
 * GET /api/sso/ip-allowlist/stats
 * Get IP allowlist statistics
 */
router.get(
  '/ip-allowlist/stats',
  requireAuth,
  requirePermissionMiddleware('settings', 'read'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const organizationId = req.user?.organizationId;
      if (!organizationId) {
        return res.status(400).json({ error: 'Organization required' });
      }

      const stats = await ipAllowlistService.getIPAllowlistStats(organizationId);
      res.json(stats);
    } catch (error: unknown) {
    const err = error as Error;
      logger.error('Get IP stats error', { error });
      res.status(500).json({ error: 'Failed to get IP allowlist stats' });
    }
  }
);

/**
 * GET /api/sso/ip-allowlist/logs
 * Get IP access logs
 */
router.get(
  '/ip-allowlist/logs',
  requireAuth,
  requirePermissionMiddleware('settings', 'read'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const organizationId = req.user?.organizationId;
      if (!organizationId) {
        return res.status(400).json({ error: 'Organization required' });
      }

      const { deniedOnly, ipAddress, userId, fromDate, toDate, limit, offset } = req.query;

      const result = await ipAllowlistService.getIPAccessLogs(organizationId, {
        deniedOnly: deniedOnly === 'true',
        ipAddress: ipAddress as string,
        userId: userId as string,
        fromDate: fromDate ? new Date(fromDate as string) : undefined,
        toDate: toDate ? new Date(toDate as string) : undefined,
        limit: limit ? parseInt(limit as string) : undefined,
        offset: offset ? parseInt(offset as string) : undefined,
      });

      res.json(result);
    } catch (error: unknown) {
    const err = error as Error;
      logger.error('Get IP access logs error', { error });
      res.status(500).json({ error: 'Failed to get IP access logs' });
    }
  }
);

// ============================================================================
// SSO Preset Routes
// ============================================================================

import { getAllPresets, getPresetConfig, validatePresetConfig, getSetupInstructions } from '../auth/ssoPresets.js';
import { scimService } from '../services/scimService.js';
import { randomBytes } from 'crypto';

/**
 * GET /api/sso/presets/list
 * List all available SSO presets
 */
router.get('/presets/list', requireAuth, async (_req: Request, res: Response) => {
  try {
    const presets = getAllPresets();
    res.json({ presets });
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('Get SSO presets error', { error });
    res.status(500).json({ error: 'Failed to get SSO presets' });
  }
});

/**
 * GET /api/sso/presets/:preset/instructions
 * Get setup instructions for a specific preset
 */
router.get('/presets/:preset/instructions', requireAuth, async (req: Request, res: Response) => {
  try {
    const instructions = getSetupInstructions(req.params.preset);
    res.json(instructions);
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('Get preset instructions error', { error });
    res.status(400).json({ error: err.message || 'Failed to get setup instructions' });
  }
});

/**
 * POST /api/sso/presets/:preset/configure
 * Configure SSO using a preset
 */
router.post(
  '/presets/:preset/configure',
  requireAuth,
  requirePermissionMiddleware('settings', 'manage'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const organizationId = req.user?.organizationId;
      if (!organizationId) {
        return res.status(400).json({ error: 'Organization required' });
      }

      const { preset } = req.params;
      const userConfig = req.body;

      // Validate configuration
      const validation = validatePresetConfig(preset, userConfig);
      if (!validation.valid) {
        return res.status(400).json({
          error: 'Invalid configuration',
          errors: validation.errors,
        });
      }

      // Generate final preset config
      const presetConfig = getPresetConfig(preset, userConfig);

      // Store preset configuration
      await query(
        `INSERT INTO sso_preset_configs (organization_id, preset_type, preset_configuration, status)
         VALUES ($1, $2, $3, 'pending')
         ON CONFLICT (organization_id, preset_type)
         DO UPDATE SET
           preset_configuration = EXCLUDED.preset_configuration,
           status = 'pending',
           updated_at = NOW()`,
        [organizationId, preset, JSON.stringify(userConfig)]
      );

      logger.info('SSO preset configured', { organizationId, preset });

      res.json({
        success: true,
        preset,
        config: presetConfig,
        message: 'Preset configured successfully. Please test the configuration.',
      });
    } catch (error: unknown) {
    const err = error as Error;
      logger.error('Configure SSO preset error', { error });
      res.status(400).json({ error: err.message || 'Failed to configure preset' });
    }
  }
);

/**
 * GET /api/sso/presets/:preset/test
 * Test a preset configuration
 */
router.get(
  '/presets/:preset/test',
  requireAuth,
  requirePermissionMiddleware('settings', 'manage'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const organizationId = req.user?.organizationId;
      if (!organizationId) {
        return res.status(400).json({ error: 'Organization required' });
      }

      const { preset } = req.params;

      // Get stored preset config
      const configResult = await query(
        `SELECT preset_configuration FROM sso_preset_configs
         WHERE organization_id = $1 AND preset_type = $2`,
        [organizationId, preset]
      );

      if (configResult.rows.length === 0) {
        return res.status(404).json({ error: 'Preset not configured' });
      }

      const userConfig = configResult.rows[0].preset_configuration;
      const presetConfig = getPresetConfig(preset, userConfig);

      // For OIDC presets, test discovery endpoint
      if (presetConfig.type === 'oidc' && presetConfig.discoveryUrl) {
        const discoveryResponse = await fetch(presetConfig.discoveryUrl);
        if (!discoveryResponse.ok) {
          throw new Error(`Discovery endpoint returned ${discoveryResponse.status}`);
        }
        const discoveryDoc = await discoveryResponse.json();

        // Update preset status
        await query(
          `UPDATE sso_preset_configs SET
            status = 'active',
            last_tested_at = NOW(),
            error_message = NULL
           WHERE organization_id = $1 AND preset_type = $2`,
          [organizationId, preset]
        );

        return res.json({
          success: true,
          message: 'Configuration test successful',
          discovery: discoveryDoc,
        });
      }

      // For SAML, just validate the config exists
      await query(
        `UPDATE sso_preset_configs SET
          status = 'testing',
          last_tested_at = NOW()
         WHERE organization_id = $1 AND preset_type = $2`,
        [organizationId, preset]
      );

      res.json({
        success: true,
        message: 'Configuration appears valid. Complete SSO flow to fully test.',
      });
    } catch (error: unknown) {
    const err = error as Error;
      const organizationId = req.user?.organizationId;
      logger.error('Test SSO preset error', { error });

      // Update status to error
      await query(
        `UPDATE sso_preset_configs SET
          status = 'error',
          error_message = $3,
          last_tested_at = NOW()
         WHERE organization_id = $1 AND preset_type = $2`,
        [organizationId, req.params.preset, err.message]
      );

      res.status(400).json({
        success: false,
        error: err.message || 'Configuration test failed',
      });
    }
  }
);

// ============================================================================
// SCIM Management Routes
// ============================================================================

/**
 * GET /api/sso/scim/config
 * Get SCIM configuration
 */
router.get(
  '/scim/config',
  requireAuth,
  requirePermissionMiddleware('settings', 'read'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const organizationId = req.user?.organizationId;
      if (!organizationId) {
        return res.status(400).json({ error: 'Organization required' });
      }

      const result = await query(
        `SELECT
          scim_enabled,
          scim_base_url,
          sync_groups,
          auto_provision,
          auto_deprovision,
          last_sync_at,
          last_sync_status
         FROM scim_configurations
         WHERE organization_id = $1`,
        [organizationId]
      );

      if (result.rows.length === 0) {
        return res.json({
          enabled: false,
          configured: false,
        });
      }

      const config = result.rows[0];
      res.json({
        enabled: config.scim_enabled,
        configured: true,
        baseUrl: config.scim_base_url,
        syncGroups: config.sync_groups,
        autoProvision: config.auto_provision,
        autoDeprovision: config.auto_deprovision,
        lastSync: config.last_sync_at,
        status: config.last_sync_status,
      });
    } catch (error: unknown) {
    const err = error as Error;
      logger.error('Get SCIM config error', { error });
      res.status(500).json({ error: 'Failed to get SCIM configuration' });
    }
  }
);

/**
 * POST /api/sso/scim/enable
 * Enable SCIM provisioning
 */
router.post(
  '/scim/enable',
  requireAuth,
  requirePermissionMiddleware('settings', 'manage'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const organizationId = req.user?.organizationId;
      if (!organizationId) {
        return res.status(400).json({ error: 'Organization required' });
      }

      const { syncGroups, autoProvision, autoDeprovision } = req.body;

      // Generate SCIM bearer token
      const scimToken = randomBytes(32).toString('hex');
      const tokenHash = require('crypto').createHash('sha256').update(scimToken).digest('hex');

      const baseUrl = `${process.env.BACKEND_URL || 'http://localhost:3001'}/scim/v2`;

      await query(
        `INSERT INTO scim_configurations (
          organization_id,
          scim_enabled,
          scim_token_hash,
          scim_base_url,
          sync_groups,
          auto_provision,
          auto_deprovision
        ) VALUES ($1, true, $2, $3, $4, $5, $6)
        ON CONFLICT (organization_id)
        DO UPDATE SET
          scim_enabled = true,
          scim_token_hash = EXCLUDED.scim_token_hash,
          scim_base_url = EXCLUDED.scim_base_url,
          sync_groups = EXCLUDED.sync_groups,
          auto_provision = EXCLUDED.auto_provision,
          auto_deprovision = EXCLUDED.auto_deprovision,
          updated_at = NOW()`,
        [organizationId, tokenHash, baseUrl, syncGroups !== false, autoProvision !== false, autoDeprovision === true]
      );

      logger.info('SCIM enabled', { organizationId });

      res.json({
        success: true,
        scimToken,  // Return token ONCE for IdP configuration
        baseUrl,
        message: 'SCIM enabled. Use this token to configure your identity provider. It will not be shown again.',
      });
    } catch (error: unknown) {
    const err = error as Error;
      logger.error('Enable SCIM error', { error });
      res.status(500).json({ error: 'Failed to enable SCIM' });
    }
  }
);

/**
 * POST /api/sso/scim/token
 * Generate a new SCIM token (rotates the old one)
 */
router.post(
  '/scim/token',
  requireAuth,
  requirePermissionMiddleware('settings', 'manage'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const organizationId = req.user?.organizationId;
      if (!organizationId) {
        return res.status(400).json({ error: 'Organization required' });
      }

      // Generate new SCIM bearer token
      const scimToken = randomBytes(32).toString('hex');
      const tokenHash = require('crypto').createHash('sha256').update(scimToken).digest('hex');

      await query(
        `UPDATE scim_configurations SET
          scim_token_hash = $2,
          updated_at = NOW()
         WHERE organization_id = $1`,
        [organizationId, tokenHash]
      );

      logger.info('SCIM token rotated', { organizationId });

      res.json({
        success: true,
        scimToken,
        message: 'New SCIM token generated. Update your identity provider configuration.',
      });
    } catch (error: unknown) {
    const err = error as Error;
      logger.error('Generate SCIM token error', { error });
      res.status(500).json({ error: 'Failed to generate SCIM token' });
    }
  }
);

/**
 * GET /api/sso/scim/sync-status
 * Get SCIM sync status
 */
router.get(
  '/scim/sync-status',
  requireAuth,
  requirePermissionMiddleware('settings', 'read'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const organizationId = req.user?.organizationId;
      if (!organizationId) {
        return res.status(400).json({ error: 'Organization required' });
      }

      const status = await scimService.getSyncStatus(organizationId);
      res.json(status);
    } catch (error: unknown) {
    const err = error as Error;
      logger.error('Get SCIM sync status error', { error });
      res.status(500).json({ error: 'Failed to get sync status' });
    }
  }
);

/**
 * POST /api/sso/scim/sync
 * Trigger manual SCIM sync
 */
router.post(
  '/scim/sync',
  requireAuth,
  requirePermissionMiddleware('settings', 'manage'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const organizationId = req.user?.organizationId;
      if (!organizationId) {
        return res.status(400).json({ error: 'Organization required' });
      }

      await scimService.triggerFullSync(organizationId);

      res.json({
        success: true,
        message: 'Manual sync triggered. This may take a few minutes.',
      });
    } catch (error: unknown) {
    const err = error as Error;
      logger.error('Trigger SCIM sync error', { error });
      res.status(500).json({ error: 'Failed to trigger sync' });
    }
  }
);

export default router;
