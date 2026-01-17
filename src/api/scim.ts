/**
 * SCIM 2.0 Routes (RFC 7643/7644)
 * System for Cross-domain Identity Management
 *
 * These endpoints are called by identity providers (Azure AD, Okta, OneLogin, etc.)
 * to automatically provision and deprovision users.
 *
 * Authentication: Bearer token (SCIM token from scim_configurations table)
 */

import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { logger } from '../utils/logger.js';
import { scimService } from '../services/scimService.js';
import { query } from '../database/db.js';
import * as crypto from 'crypto';

const router = Router();

// ============================================================================
// SCIM AUTHENTICATION MIDDLEWARE
// ============================================================================

/**
 * Authenticate SCIM requests using bearer token
 */
async function authenticateSCIM(req: Request, res: Response, next: NextFunction) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json(
        scimService.createError(401, 'Missing or invalid Authorization header', 'invalidSyntax')
      );
    }

    const token = authHeader.substring(7);
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    // Find organization by SCIM token
    const result = await query(
      `SELECT sc.organization_id, sc.scim_enabled
       FROM scim_configurations sc
       WHERE sc.scim_token_hash = $1 AND sc.scim_enabled = true`,
      [tokenHash]
    );

    if (result.rows.length === 0) {
      return res.status(401).json(
        scimService.createError(401, 'Invalid SCIM token', 'invalidSyntax')
      );
    }

    // Set organization context for this request
    (req as any).scimOrganizationId = result.rows[0].organization_id;
    next();
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('SCIM authentication error:', error);
    res.status(500).json(
      scimService.createError(500, 'Internal server error', 'invalidSyntax')
    );
  }
}

// Apply SCIM authentication to all SCIM routes
router.use(authenticateSCIM);

// ============================================================================
// SERVICE PROVIDER CONFIG ENDPOINTS
// ============================================================================

/**
 * GET /scim/v2/ServiceProviderConfig
 * Return SCIM service provider configuration
 */
router.get('/v2/ServiceProviderConfig', (_req: Request, res: Response) => {
  res.json({
    schemas: ['urn:ietf:params:scim:schemas:core:2.0:ServiceProviderConfig'],
    documentationUri: 'https://docs.arcus.io/scim',
    patch: {
      supported: true,
    },
    bulk: {
      supported: false,
      maxOperations: 0,
      maxPayloadSize: 0,
    },
    filter: {
      supported: true,
      maxResults: 200,
    },
    changePassword: {
      supported: false,
    },
    sort: {
      supported: false,
    },
    etag: {
      supported: false,
    },
    authenticationSchemes: [
      {
        type: 'oauthbearertoken',
        name: 'OAuth Bearer Token',
        description: 'Authentication scheme using the OAuth Bearer Token Standard',
        specUri: 'https://www.rfc-editor.org/rfc/rfc6750.html',
        documentationUri: 'https://docs.arcus.io/scim/authentication',
      },
    ],
  });
});

/**
 * GET /scim/v2/Schemas
 * Return supported SCIM schemas
 */
router.get('/v2/Schemas', (_req: Request, res: Response) => {
  res.json({
    schemas: ['urn:ietf:params:scim:api:messages:2.0:ListResponse'],
    totalResults: 2,
    startIndex: 1,
    itemsPerPage: 2,
    Resources: [
      {
        id: 'urn:ietf:params:scim:schemas:core:2.0:User',
        name: 'User',
        description: 'User Account',
      },
      {
        id: 'urn:ietf:params:scim:schemas:core:2.0:Group',
        name: 'Group',
        description: 'Group',
      },
    ],
  });
});

/**
 * GET /scim/v2/ResourceTypes
 * Return supported resource types
 */
router.get('/v2/ResourceTypes', (req: Request, res: Response) => {
  const baseUrl = `${req.protocol}://${req.get('host')}`;

  res.json({
    schemas: ['urn:ietf:params:scim:api:messages:2.0:ListResponse'],
    totalResults: 2,
    startIndex: 1,
    itemsPerPage: 2,
    Resources: [
      {
        schemas: ['urn:ietf:params:scim:schemas:core:2.0:ResourceType'],
        id: 'User',
        name: 'User',
        endpoint: '/scim/v2/Users',
        description: 'User Account',
        schema: 'urn:ietf:params:scim:schemas:core:2.0:User',
        meta: {
          location: `${baseUrl}/scim/v2/ResourceTypes/User`,
          resourceType: 'ResourceType',
        },
      },
      {
        schemas: ['urn:ietf:params:scim:schemas:core:2.0:ResourceType'],
        id: 'Group',
        name: 'Group',
        endpoint: '/scim/v2/Groups',
        description: 'Group',
        schema: 'urn:ietf:params:scim:schemas:core:2.0:Group',
        meta: {
          location: `${baseUrl}/scim/v2/ResourceTypes/Group`,
          resourceType: 'ResourceType',
        },
      },
    ],
  });
});

// ============================================================================
// USER ENDPOINTS
// ============================================================================

/**
 * GET /scim/v2/Users
 * List users (with optional filtering)
 */
router.get('/v2/Users', async (req: Request, res: Response) => {
  try {
    const organizationId = (req as any).scimOrganizationId;
    const { filter, startIndex, count } = req.query;

    const result = await scimService.listUsers(
      organizationId,
      filter as string | undefined,
      startIndex ? parseInt(startIndex as string) : 1,
      count ? parseInt(count as string) : 100
    );

    res.json(result);
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('SCIM GET /Users error:', error);
    res.status(500).json(
      scimService.createError(500, 'Failed to list users', 'invalidSyntax')
    );
  }
});

/**
 * POST /scim/v2/Users
 * Create a new user
 */
router.post('/v2/Users', async (req: Request, res: Response) => {
  try {
    const organizationId = (req as any).scimOrganizationId;
    const scimUser = req.body;

    const user = await scimService.createUser(organizationId, scimUser);

    // Log sync event
    await query(
      `INSERT INTO scim_sync_log (organization_id, operation, resource_type, resource_id, status, request_payload)
       VALUES ($1, 'create', 'user', $2, 'success', $3)`,
      [organizationId, user.id, JSON.stringify(scimUser)]
    );

    res.status(201).json(user);
  } catch (error: unknown) {
    const err = error as Error;
    const organizationId = (req as any).scimOrganizationId;
    logger.error('SCIM POST /Users error:', error);

    // Log error
    await query(
      `INSERT INTO scim_sync_log (organization_id, operation, resource_type, resource_id, status, error_message, request_payload)
       VALUES ($1, 'create', 'user', 'unknown', 'error', $2, $3)`,
      [organizationId, err.message, JSON.stringify(req.body)]
    );

    if (err.message.includes('already exists')) {
      return res.status(409).json(
        scimService.createError(409, err.message, 'uniqueness')
      );
    }

    res.status(400).json(
      scimService.createError(400, err.message || 'Failed to create user', 'invalidValue')
    );
  }
});

/**
 * GET /scim/v2/Users/:id
 * Get a single user
 */
router.get('/v2/Users/:id', async (req: Request, res: Response) => {
  try {
    const organizationId = (req as any).scimOrganizationId;
    const user = await scimService.getUser(organizationId, req.params.id);
    res.json(user);
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('SCIM GET /Users/:id error:', error);
    if (err.message.includes('not found')) {
      return res.status(404).json(
        scimService.createError(404, err.message, 'invalidValue')
      );
    }
    res.status(500).json(
      scimService.createError(500, 'Failed to get user', 'invalidSyntax')
    );
  }
});

/**
 * PUT /scim/v2/Users/:id
 * Replace a user (full update)
 */
router.put('/v2/Users/:id', async (req: Request, res: Response) => {
  try {
    const organizationId = (req as any).scimOrganizationId;
    const user = await scimService.updateUser(organizationId, req.params.id, req.body);

    await query(
      `INSERT INTO scim_sync_log (organization_id, operation, resource_type, resource_id, status, request_payload)
       VALUES ($1, 'update', 'user', $2, 'success', $3)`,
      [organizationId, req.params.id, JSON.stringify(req.body)]
    );

    res.json(user);
  } catch (error: unknown) {
    const err = error as Error;
    const organizationId = (req as any).scimOrganizationId;
    logger.error('SCIM PUT /Users/:id error:', error);

    await query(
      `INSERT INTO scim_sync_log (organization_id, operation, resource_type, resource_id, status, error_message, request_payload)
       VALUES ($1, 'update', 'user', $2, 'error', $3, $4)`,
      [organizationId, req.params.id, err.message, JSON.stringify(req.body)]
    );

    if (err.message.includes('not found')) {
      return res.status(404).json(
        scimService.createError(404, err.message, 'invalidValue')
      );
    }
    res.status(400).json(
      scimService.createError(400, err.message || 'Failed to update user', 'invalidValue')
    );
  }
});

/**
 * PATCH /scim/v2/Users/:id
 * Partially update a user
 */
router.patch('/v2/Users/:id', async (req: Request, res: Response) => {
  try {
    const organizationId = (req as any).scimOrganizationId;
    const { Operations } = req.body;

    // Convert SCIM PATCH operations to partial user update
    const updates: any = {};

    for (const op of Operations || []) {
      if (op.op === 'replace') {
        // Handle common paths
        if (op.path === 'active') {
          updates.active = op.value;
        } else if (op.path === 'emails') {
          updates.emails = op.value;
        } else if (op.path === 'name.givenName') {
          updates.name = { ...updates.name, givenName: op.value };
        } else if (op.path === 'name.familyName') {
          updates.name = { ...updates.name, familyName: op.value };
        }
      }
    }

    const user = await scimService.updateUser(organizationId, req.params.id, updates);

    await query(
      `INSERT INTO scim_sync_log (organization_id, operation, resource_type, resource_id, status, request_payload)
       VALUES ($1, 'update', 'user', $2, 'success', $3)`,
      [organizationId, req.params.id, JSON.stringify(req.body)]
    );

    res.json(user);
  } catch (error: unknown) {
    const err = error as Error;
    const organizationId = (req as any).scimOrganizationId;
    logger.error('SCIM PATCH /Users/:id error:', error);

    await query(
      `INSERT INTO scim_sync_log (organization_id, operation, resource_type, resource_id, status, error_message, request_payload)
       VALUES ($1, 'update', 'user', $2, 'error', $3, $4)`,
      [organizationId, req.params.id, err.message, JSON.stringify(req.body)]
    );

    res.status(400).json(
      scimService.createError(400, err.message || 'Failed to patch user', 'invalidValue')
    );
  }
});

/**
 * DELETE /scim/v2/Users/:id
 * Delete/deactivate a user
 */
router.delete('/v2/Users/:id', async (req: Request, res: Response) => {
  try {
    const organizationId = (req as any).scimOrganizationId;
    await scimService.deleteUser(organizationId, req.params.id);

    await query(
      `INSERT INTO scim_sync_log (organization_id, operation, resource_type, resource_id, status)
       VALUES ($1, 'delete', 'user', $2, 'success')`,
      [organizationId, req.params.id]
    );

    res.status(204).send();
  } catch (error: unknown) {
    const err = error as Error;
    const organizationId = (req as any).scimOrganizationId;
    logger.error('SCIM DELETE /Users/:id error:', error);

    await query(
      `INSERT INTO scim_sync_log (organization_id, operation, resource_type, resource_id, status, error_message)
       VALUES ($1, 'delete', 'user', $2, 'error', $3)`,
      [organizationId, req.params.id, err.message]
    );

    if (err.message.includes('not found')) {
      return res.status(404).json(
        scimService.createError(404, err.message, 'invalidValue')
      );
    }
    res.status(500).json(
      scimService.createError(500, 'Failed to delete user', 'invalidSyntax')
    );
  }
});

// ============================================================================
// GROUP ENDPOINTS
// ============================================================================

/**
 * GET /scim/v2/Groups
 * List groups
 */
router.get('/v2/Groups', async (req: Request, res: Response) => {
  try {
    const organizationId = (req as any).scimOrganizationId;
    const { filter, startIndex, count } = req.query;

    const result = await scimService.listGroups(
      organizationId,
      filter as string | undefined,
      startIndex ? parseInt(startIndex as string) : 1,
      count ? parseInt(count as string) : 100
    );

    res.json(result);
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('SCIM GET /Groups error:', error);
    res.status(500).json(
      scimService.createError(500, 'Failed to list groups', 'invalidSyntax')
    );
  }
});

/**
 * POST /scim/v2/Groups
 * Create a new group
 */
router.post('/v2/Groups', async (req: Request, res: Response) => {
  try {
    const organizationId = (req as any).scimOrganizationId;
    const group = await scimService.createGroup(organizationId, req.body);

    await query(
      `INSERT INTO scim_sync_log (organization_id, operation, resource_type, resource_id, status, request_payload)
       VALUES ($1, 'create', 'group', $2, 'success', $3)`,
      [organizationId, group.id, JSON.stringify(req.body)]
    );

    res.status(201).json(group);
  } catch (error: unknown) {
    const err = error as Error;
    const organizationId = (req as any).scimOrganizationId;
    logger.error('SCIM POST /Groups error:', error);

    await query(
      `INSERT INTO scim_sync_log (organization_id, operation, resource_type, resource_id, status, error_message, request_payload)
       VALUES ($1, 'create', 'group', 'unknown', 'error', $2, $3)`,
      [organizationId, err.message, JSON.stringify(req.body)]
    );

    res.status(400).json(
      scimService.createError(400, err.message || 'Failed to create group', 'invalidValue')
    );
  }
});

/**
 * GET /scim/v2/Groups/:id
 * Get a single group
 */
router.get('/v2/Groups/:id', async (req: Request, res: Response) => {
  try {
    const organizationId = (req as any).scimOrganizationId;
    const group = await scimService.getGroup(organizationId, req.params.id);
    res.json(group);
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('SCIM GET /Groups/:id error:', error);
    if (err.message.includes('not found')) {
      return res.status(404).json(
        scimService.createError(404, err.message, 'invalidValue')
      );
    }
    res.status(500).json(
      scimService.createError(500, 'Failed to get group', 'invalidSyntax')
    );
  }
});

/**
 * PUT /scim/v2/Groups/:id
 * Replace a group
 */
router.put('/v2/Groups/:id', async (req: Request, res: Response) => {
  try {
    const organizationId = (req as any).scimOrganizationId;
    const group = await scimService.updateGroup(organizationId, req.params.id, req.body);

    await query(
      `INSERT INTO scim_sync_log (organization_id, operation, resource_type, resource_id, status, request_payload)
       VALUES ($1, 'update', 'group', $2, 'success', $3)`,
      [organizationId, req.params.id, JSON.stringify(req.body)]
    );

    res.json(group);
  } catch (error: unknown) {
    const err = error as Error;
    const organizationId = (req as any).scimOrganizationId;
    logger.error('SCIM PUT /Groups/:id error:', error);

    await query(
      `INSERT INTO scim_sync_log (organization_id, operation, resource_type, resource_id, status, error_message, request_payload)
       VALUES ($1, 'update', 'group', $2, 'error', $3, $4)`,
      [organizationId, req.params.id, err.message, JSON.stringify(req.body)]
    );

    res.status(400).json(
      scimService.createError(400, err.message || 'Failed to update group', 'invalidValue')
    );
  }
});

/**
 * PATCH /scim/v2/Groups/:id
 * Partially update a group (typically for member management)
 */
router.patch('/v2/Groups/:id', async (req: Request, res: Response) => {
  try {
    const organizationId = (req as any).scimOrganizationId;
    const { Operations } = req.body;

    const updates: any = {};

    for (const op of Operations || []) {
      if (op.op === 'add' && op.path === 'members') {
        updates.members = op.value;
      } else if (op.op === 'remove' && op.path?.startsWith('members')) {
        // Handle member removal
        updates.members = [];
      }
    }

    const group = await scimService.updateGroup(organizationId, req.params.id, updates);
    res.json(group);
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('SCIM PATCH /Groups/:id error:', error);
    res.status(400).json(
      scimService.createError(400, err.message || 'Failed to patch group', 'invalidValue')
    );
  }
});

/**
 * DELETE /scim/v2/Groups/:id
 * Delete a group
 */
router.delete('/v2/Groups/:id', async (req: Request, res: Response) => {
  try {
    const organizationId = (req as any).scimOrganizationId;
    await scimService.deleteGroup(organizationId, req.params.id);

    await query(
      `INSERT INTO scim_sync_log (organization_id, operation, resource_type, resource_id, status)
       VALUES ($1, 'delete', 'group', $2, 'success')`,
      [organizationId, req.params.id]
    );

    res.status(204).send();
  } catch (error: unknown) {
    const err = error as Error;
    const organizationId = (req as any).scimOrganizationId;
    logger.error('SCIM DELETE /Groups/:id error:', error);

    await query(
      `INSERT INTO scim_sync_log (organization_id, operation, resource_type, resource_id, status, error_message)
       VALUES ($1, 'delete', 'group', $2, 'error', $3)`,
      [organizationId, req.params.id, err.message]
    );

    res.status(500).json(
      scimService.createError(500, 'Failed to delete group', 'invalidSyntax')
    );
  }
});

export default router;
