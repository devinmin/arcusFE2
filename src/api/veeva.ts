/**
 * Veeva Vault Integration API Routes
 *
 * Provides endpoints for:
 * - Veeva Vault OAuth connection flow
 * - Document synchronization
 * - MLR workflow tracking
 * - Claims library management
 * - Content submission for review
 *
 * Phase 5.1 - Veeva Vault Integration (Healthcare Critical)
 */

import { Router, Request, Response, NextFunction } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { veevaIntegrationService } from '../services/veevaIntegrationService.js';
import { logger } from '../utils/logger.js';

const router = Router();

// Middleware to ensure organization context is loaded
function requireOrganization(req: Request, res: Response, next: NextFunction): void {
  const orgId = (req as any).organizationId || (req.user as any)?.organizationId;
  if (!orgId) {
    res.status(403).json({
      success: false,
      error: {
        code: 'NO_ORGANIZATION',
        message: 'Organization context required',
      },
    });
    return;
  }
  next();
}

// Helper to get organization ID from request
function getOrganizationId(req: Request): string {
  const orgId = (req as any).organizationId || (req.user as any)?.organizationId;
  if (!orgId) {
    throw new Error('Organization ID not found');
  }
  return orgId;
}

// =============================================================================
// OAUTH ENDPOINTS
// =============================================================================

/**
 * POST /api/v1/veeva/connect
 * Initiate Veeva Vault OAuth connection
 */
router.post('/connect', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const { vaultDomain } = req.body;

    if (!vaultDomain) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_VAULT_DOMAIN',
          message: 'Vault domain is required',
        },
      });
    }

    const { authUrl, state } = await veevaIntegrationService.generateAuthUrl(
      organizationId,
      vaultDomain
    );

    res.json({
      success: true,
      data: {
        authUrl,
        state,
      },
    });
  } catch (error) {
    logger.error('[VeevaRoutes] OAuth initiation error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'OAUTH_INIT_ERROR',
        message: (error as Error).message,
      },
    });
  }
});

/**
 * GET /api/v1/veeva/callback
 * Veeva OAuth callback handler
 */
router.get('/callback', async (req: Request, res: Response) => {
  try {
    const { code, state, vault_domain } = req.query;

    if (!code || !state || !vault_domain) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_PARAMETERS',
          message: 'Missing required OAuth parameters',
        },
      });
    }

    const connection = await veevaIntegrationService.handleCallback(
      code as string,
      state as string,
      vault_domain as string
    );

    // Redirect to frontend with success
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    res.redirect(`${frontendUrl}/settings/integrations/veeva?status=success&connection_id=${connection.id}`);
  } catch (error) {
    logger.error('[VeevaRoutes] OAuth callback error:', error);
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    res.redirect(`${frontendUrl}/settings/integrations/veeva?status=error&message=${encodeURIComponent((error as Error).message)}`);
  }
});

// =============================================================================
// CONNECTION MANAGEMENT
// =============================================================================

/**
 * GET /api/v1/veeva/connections
 * List all Veeva Vault connections
 */
router.get('/connections', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);

    const connections = await veevaIntegrationService.getConnections(organizationId);

    res.json({
      success: true,
      data: connections,
    });
  } catch (error) {
    logger.error('[VeevaRoutes] Get connections error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'GET_CONNECTIONS_ERROR',
        message: (error as Error).message,
      },
    });
  }
});

/**
 * GET /api/v1/veeva/connections/:id
 * Get specific connection details
 */
router.get('/connections/:id', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const organizationId = getOrganizationId(req);

    const connection = await veevaIntegrationService.getConnection(id);

    if (!connection) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'CONNECTION_NOT_FOUND',
          message: 'Connection not found',
        },
      });
    }

    // Verify ownership
    if (connection.organizationId !== organizationId) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Access denied',
        },
      });
    }

    res.json({
      success: true,
      data: connection,
    });
  } catch (error) {
    logger.error('[VeevaRoutes] Get connection error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'GET_CONNECTION_ERROR',
        message: (error as Error).message,
      },
    });
  }
});

/**
 * DELETE /api/v1/veeva/connections/:id
 * Disconnect Veeva Vault
 */
router.delete('/connections/:id', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const organizationId = getOrganizationId(req);

    await veevaIntegrationService.disconnect(id, organizationId);

    res.json({
      success: true,
      message: 'Connection disconnected successfully',
    });
  } catch (error) {
    logger.error('[VeevaRoutes] Disconnect error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'DISCONNECT_ERROR',
        message: (error as Error).message,
      },
    });
  }
});

// =============================================================================
// DOCUMENT SYNC
// =============================================================================

/**
 * POST /api/v1/veeva/sync/documents
 * Trigger manual document sync from Veeva
 */
router.post('/sync/documents', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const { connectionId } = req.body;

    if (!connectionId) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_CONNECTION_ID',
          message: 'Connection ID is required',
        },
      });
    }

    // Verify ownership
    const connection = await veevaIntegrationService.getConnection(connectionId);
    if (!connection || connection.organizationId !== organizationId) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Access denied',
        },
      });
    }

    const result = await veevaIntegrationService.syncDocuments(connectionId);

    res.json({
      success: result.success,
      data: {
        documentsSynced: result.documentsSynced,
        failed: result.failed,
        errors: result.errors,
      },
    });
  } catch (error) {
    logger.error('[VeevaRoutes] Document sync error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'SYNC_ERROR',
        message: (error as Error).message,
      },
    });
  }
});

/**
 * POST /api/v1/veeva/sync/workflows
 * Trigger manual workflow sync from Veeva
 */
router.post('/sync/workflows', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const { connectionId, documentId } = req.body;

    if (!connectionId) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_CONNECTION_ID',
          message: 'Connection ID is required',
        },
      });
    }

    // Verify ownership
    const connection = await veevaIntegrationService.getConnection(connectionId);
    if (!connection || connection.organizationId !== organizationId) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Access denied',
        },
      });
    }

    const result = await veevaIntegrationService.syncWorkflows(connectionId, documentId);

    res.json({
      success: result.success,
      data: {
        workflowsSynced: result.workflowsSynced,
        failed: result.failed,
        errors: result.errors,
      },
    });
  } catch (error) {
    logger.error('[VeevaRoutes] Workflow sync error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'SYNC_ERROR',
        message: (error as Error).message,
      },
    });
  }
});

/**
 * POST /api/v1/veeva/sync/claims
 * Trigger manual claims library sync from Veeva
 */
router.post('/sync/claims', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const { connectionId } = req.body;

    if (!connectionId) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_CONNECTION_ID',
          message: 'Connection ID is required',
        },
      });
    }

    // Verify ownership
    const connection = await veevaIntegrationService.getConnection(connectionId);
    if (!connection || connection.organizationId !== organizationId) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Access denied',
        },
      });
    }

    const result = await veevaIntegrationService.syncClaims(connectionId);

    res.json({
      success: result.success,
      data: {
        claimsSynced: result.claimsSynced,
        failed: result.failed,
        errors: result.errors,
      },
    });
  } catch (error) {
    logger.error('[VeevaRoutes] Claims sync error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'SYNC_ERROR',
        message: (error as Error).message,
      },
    });
  }
});

/**
 * POST /api/v1/veeva/sync
 * Trigger full sync (documents, workflows, claims)
 */
router.post('/sync', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const { connectionId } = req.body;

    if (!connectionId) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_CONNECTION_ID',
          message: 'Connection ID is required',
        },
      });
    }

    // Verify ownership
    const connection = await veevaIntegrationService.getConnection(connectionId);
    if (!connection || connection.organizationId !== organizationId) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Access denied',
        },
      });
    }

    // Run all syncs in parallel
    const [documentsResult, workflowsResult, claimsResult] = await Promise.all([
      veevaIntegrationService.syncDocuments(connectionId),
      veevaIntegrationService.syncWorkflows(connectionId),
      veevaIntegrationService.syncClaims(connectionId),
    ]);

    res.json({
      success: documentsResult.success && workflowsResult.success && claimsResult.success,
      data: {
        documents: {
          synced: documentsResult.documentsSynced,
          failed: documentsResult.failed,
        },
        workflows: {
          synced: workflowsResult.workflowsSynced,
          failed: workflowsResult.failed,
        },
        claims: {
          synced: claimsResult.claimsSynced,
          failed: claimsResult.failed,
        },
        errors: [
          ...documentsResult.errors,
          ...workflowsResult.errors,
          ...claimsResult.errors,
        ],
      },
    });
  } catch (error) {
    logger.error('[VeevaRoutes] Full sync error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'SYNC_ERROR',
        message: (error as Error).message,
      },
    });
  }
});

// =============================================================================
// DOCUMENTS
// =============================================================================

/**
 * GET /api/v1/veeva/documents
 * List synced Veeva documents
 */
router.get('/documents', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const {
      connectionId,
      status,
      mlrApprovalStatus,
      productName,
      limit = '50',
      offset = '0',
    } = req.query;

    const { pool } = await import('../database/db.js');

    let query = `
      SELECT * FROM veeva_documents
      WHERE organization_id = $1
    `;
    const params: any[] = [organizationId];
    let paramIndex = 2;

    if (connectionId) {
      query += ` AND connection_id = $${paramIndex}`;
      params.push(connectionId);
      paramIndex++;
    }

    if (status) {
      query += ` AND status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }

    if (mlrApprovalStatus) {
      query += ` AND mlr_approval_status = $${paramIndex}`;
      params.push(mlrApprovalStatus);
      paramIndex++;
    }

    if (productName) {
      query += ` AND product_name ILIKE $${paramIndex}`;
      params.push(`%${productName}%`);
      paramIndex++;
    }

    query += ` ORDER BY created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(parseInt(limit as string), parseInt(offset as string));

    const { rows } = await pool.query(query, params);

    // Get total count
    const countQuery = `
      SELECT COUNT(*) FROM veeva_documents
      WHERE organization_id = $1
      ${connectionId ? `AND connection_id = '${connectionId}'` : ''}
      ${status ? `AND status = '${status}'` : ''}
      ${mlrApprovalStatus ? `AND mlr_approval_status = '${mlrApprovalStatus}'` : ''}
      ${productName ? `AND product_name ILIKE '%${productName}%'` : ''}
    `;
    const { rows: countRows } = await pool.query(countQuery, [organizationId]);
    const total = parseInt(countRows[0].count);

    res.json({
      success: true,
      data: {
        documents: rows,
        pagination: {
          total,
          limit: parseInt(limit as string),
          offset: parseInt(offset as string),
        },
      },
    });
  } catch (error) {
    logger.error('[VeevaRoutes] Get documents error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'GET_DOCUMENTS_ERROR',
        message: (error as Error).message,
      },
    });
  }
});

/**
 * GET /api/v1/veeva/documents/:documentId
 * Get specific document details
 */
router.get('/documents/:documentId', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const { documentId } = req.params;

    const { pool } = await import('../database/db.js');
    const { rows } = await pool.query(
      'SELECT * FROM veeva_documents WHERE id = $1 AND organization_id = $2',
      [documentId, organizationId]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'DOCUMENT_NOT_FOUND',
          message: 'Document not found',
        },
      });
    }

    res.json({
      success: true,
      data: rows[0],
    });
  } catch (error) {
    logger.error('[VeevaRoutes] Get document error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'GET_DOCUMENT_ERROR',
        message: (error as Error).message,
      },
    });
  }
});

// =============================================================================
// WORKFLOWS
// =============================================================================

/**
 * GET /api/v1/veeva/workflows/:documentId
 * Get workflow status for a document
 */
router.get('/workflows/:documentId', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const { documentId } = req.params;

    const { pool } = await import('../database/db.js');
    const { rows } = await pool.query(
      `SELECT * FROM veeva_workflows
       WHERE veeva_document_id = $1 AND organization_id = $2
       ORDER BY initiated_date DESC`,
      [documentId, organizationId]
    );

    res.json({
      success: true,
      data: {
        workflows: rows,
      },
    });
  } catch (error) {
    logger.error('[VeevaRoutes] Get workflows error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'GET_WORKFLOWS_ERROR',
        message: (error as Error).message,
      },
    });
  }
});

// =============================================================================
// CONTENT SUBMISSION
// =============================================================================

/**
 * POST /api/v1/veeva/submit-for-review
 * Submit Arcus content to Veeva for MLR review
 */
router.post('/submit-for-review', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const {
      connectionId,
      deliverableId,
      mlrQueueId,
      documentType,
      documentName,
      fileUrl,
      productName,
      therapeuticArea,
      targetAudience,
      claimsUsed,
    } = req.body;

    if (!connectionId || !documentType || !documentName || !fileUrl) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_REQUIRED_FIELDS',
          message: 'Connection ID, document type, name, and file URL are required',
        },
      });
    }

    const result = await veevaIntegrationService.submitForReview(
      connectionId,
      organizationId,
      {
        deliverableId,
        mlrQueueId,
        documentType,
        documentName,
        fileUrl,
        productName,
        therapeuticArea,
        targetAudience: targetAudience || [],
        claimsUsed,
      }
    );

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    logger.error('[VeevaRoutes] Submit for review error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'SUBMIT_ERROR',
        message: (error as Error).message,
      },
    });
  }
});

// =============================================================================
// CLAIMS LIBRARY
// =============================================================================

/**
 * GET /api/v1/veeva/claims
 * Get approved claims library
 */
router.get('/claims', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const { connectionId, productName, approvalStatus = 'approved' } = req.query;

    const { pool } = await import('../database/db.js');

    let query = `
      SELECT * FROM veeva_claims
      WHERE organization_id = $1 AND approval_status = $2
    `;
    const params: any[] = [organizationId, approvalStatus];
    let paramIndex = 3;

    if (connectionId) {
      query += ` AND connection_id = $${paramIndex}`;
      params.push(connectionId);
      paramIndex++;
    }

    if (productName) {
      query += ` AND product_name ILIKE $${paramIndex}`;
      params.push(`%${productName}%`);
      paramIndex++;
    }

    query += ` ORDER BY approval_date DESC`;

    const { rows } = await pool.query(query, params);

    res.json({
      success: true,
      data: {
        claims: rows,
      },
    });
  } catch (error) {
    logger.error('[VeevaRoutes] Get claims error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'GET_CLAIMS_ERROR',
        message: (error as Error).message,
      },
    });
  }
});

export { router as veevaRoutes };
