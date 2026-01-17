/**
 * E-commerce Integration API Routes
 *
 * Provides endpoints for:
 * - Shopify OAuth connection flow
 * - Product catalog management
 * - Lifecycle sequence automation
 * - Webhook handling
 *
 * Phase 1.4d - E-commerce Integration (DTC Critical)
 */

import { Router, Request, Response, NextFunction } from 'express';
import { requireAuth } from '../middleware/auth.js';

// Middleware to ensure organization context is loaded
function requireOrganization(req: Request, res: Response, next: NextFunction): void {
  const orgId = (req as any).organizationId || (req.user as any)?.organizationId;
  if (!orgId) {
    res.status(403).json({
      success: false,
      error: {
        code: 'NO_ORGANIZATION',
        message: 'Organization context required'
      }
    });
    return;
  }
  next();
}
import { shopifyService } from '../services/shopifyService.js';
import { productCatalogService } from '../services/productCatalogService.js';
import { lifecycleAutomationService } from '../services/lifecycleAutomationService.js';
import { pool } from '../database/db.js';
import { logger } from '../utils/logger.js';

const router = Router();

// Helper to get organization ID from request
function getOrganizationId(req: Request): string {
  const orgId = (req as any).organizationId || (req.user as any)?.organizationId;
  if (!orgId) {
    throw new Error('Organization ID not found');
  }
  return orgId;
}

// =============================================================================
// SHOPIFY OAUTH ENDPOINTS
// =============================================================================

/**
 * POST /api/v1/ecommerce/connect/shopify
 * Initiate Shopify OAuth connection
 */
router.post('/connect/shopify', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const { shopDomain } = req.body;

    if (!shopDomain) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_SHOP_DOMAIN',
          message: 'Shop domain is required',
        },
      });
    }

    const { authUrl, state } = await shopifyService.generateAuthUrl(
      organizationId,
      shopDomain
    );

    res.json({
      success: true,
      data: {
        authUrl,
        state,
      },
    });
  } catch (error) {
    logger.error('Shopify OAuth initiation error:', error);
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
 * GET /api/v1/ecommerce/callback/shopify
 * Shopify OAuth callback handler
 */
router.get('/callback/shopify', async (req: Request, res: Response) => {
  try {
    const { code, state, shop } = req.query;

    if (!code || !state || !shop) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_PARAMS',
          message: 'Missing required OAuth parameters',
        },
      });
    }

    const connection = await shopifyService.handleCallback(
      code as string,
      state as string,
      shop as string
    );

    // Redirect to success page in frontend
    const successUrl = `/settings/integrations/shopify?connected=true&store=${connection.storeDomain}`;
    res.redirect(successUrl);
  } catch (error) {
    logger.error('Shopify OAuth callback error:', error);
    const errorUrl = `/settings/integrations/shopify?error=${encodeURIComponent((error as Error).message)}`;
    res.redirect(errorUrl);
  }
});

/**
 * GET /api/v1/ecommerce/connections
 * List all e-commerce connections
 */
router.get('/connections', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const { platform } = req.query;

    let query = `
      SELECT id, platform, store_name, store_domain, store_url, status,
             last_sync_at, product_count, order_count, customer_count,
             api_version, auto_sync_enabled, created_at, updated_at
      FROM ecommerce_connections
      WHERE organization_id = $1
    `;
    const values: any[] = [organizationId];

    if (platform) {
      query += ' AND platform = $2';
      values.push(platform);
    }

    query += ' ORDER BY created_at DESC';

    const { rows } = await pool.query(query, values);

    res.json({
      success: true,
      data: {
        connections: rows.map(row => ({
          id: row.id,
          platform: row.platform,
          storeName: row.store_name,
          storeDomain: row.store_domain,
          storeUrl: row.store_url,
          status: row.status,
          lastSyncAt: row.last_sync_at,
          productCount: row.product_count,
          orderCount: row.order_count,
          customerCount: row.customer_count,
          apiVersion: row.api_version,
          autoSyncEnabled: row.auto_sync_enabled,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        })),
      },
    });
  } catch (error) {
    logger.error('Get connections error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to retrieve connections',
      },
    });
  }
});

/**
 * GET /api/v1/ecommerce/connections/:id
 * Get specific connection details
 */
router.get('/connections/:id', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const { id } = req.params;

    const connection = await shopifyService.getConnection(id);

    if (!connection || connection.organizationId !== organizationId) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Connection not found',
        },
      });
    }

    res.json({
      success: true,
      data: connection,
    });
  } catch (error) {
    logger.error('Get connection error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to retrieve connection',
      },
    });
  }
});

/**
 * DELETE /api/v1/ecommerce/connections/:id
 * Disconnect an e-commerce store
 */
router.delete('/connections/:id', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const { id } = req.params;

    await shopifyService.disconnect(id, organizationId);

    res.json({
      success: true,
      data: {
        message: 'Store disconnected successfully',
      },
    });
  } catch (error) {
    logger.error('Disconnect error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'DISCONNECT_ERROR',
        message: (error as Error).message,
      },
    });
  }
});

/**
 * POST /api/v1/ecommerce/connections/:id/sync
 * Trigger a product sync
 */
router.post('/connections/:id/sync', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const { id } = req.params;

    const result = await productCatalogService.triggerSync(id, organizationId);

    res.json({
      success: result.success,
      data: {
        message: result.message,
      },
    });
  } catch (error) {
    logger.error('Sync trigger error:', error);
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
// PRODUCT CATALOG ENDPOINTS
// =============================================================================

/**
 * GET /api/v1/ecommerce/products
 * Search and list products
 */
router.get('/products', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const {
      connectionId,
      query,
      productType,
      vendor,
      tags,
      inventoryStatus,
      status,
      priceMin,
      priceMax,
      inStock,
      page = '1',
      limit = '20',
      sortBy = 'title',
      sortOrder = 'asc',
    } = req.query;

    const result = await productCatalogService.searchProducts({
      organizationId,
      connectionId: connectionId as string | undefined,
      query: query as string | undefined,
      productType: productType as string | undefined,
      vendor: vendor as string | undefined,
      tags: tags ? (tags as string).split(',') : undefined,
      inventoryStatus: inventoryStatus as string | undefined,
      status: status as 'active' | 'draft' | 'archived' | undefined,
      priceMin: priceMin ? parseFloat(priceMin as string) : undefined,
      priceMax: priceMax ? parseFloat(priceMax as string) : undefined,
      inStock: inStock === 'true',
      page: parseInt(page as string, 10),
      limit: Math.min(parseInt(limit as string, 10), 100),
      sortBy: sortBy as any,
      sortOrder: sortOrder as 'asc' | 'desc',
    });

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    logger.error('Product search error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to search products',
      },
    });
  }
});

/**
 * GET /api/v1/ecommerce/products/:id
 * Get a specific product
 */
router.get('/products/:id', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const { id } = req.params;

    const product = await productCatalogService.getProduct(id, organizationId);

    if (!product) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Product not found',
        },
      });
    }

    res.json({
      success: true,
      data: product,
    });
  } catch (error) {
    logger.error('Get product error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to retrieve product',
      },
    });
  }
});

/**
 * POST /api/v1/ecommerce/products/context
 * Get product context for content generation
 */
router.post('/products/context', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const { productIds } = req.body;

    if (!productIds || !Array.isArray(productIds) || productIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_PRODUCT_IDS',
          message: 'Product IDs array is required',
        },
      });
    }

    const contexts = await productCatalogService.getProductContexts(
      productIds,
      organizationId
    );

    const prompt = productCatalogService.generateProductPrompt(contexts);

    res.json({
      success: true,
      data: {
        contexts,
        prompt,
      },
    });
  } catch (error) {
    logger.error('Product context error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to generate product context',
      },
    });
  }
});

/**
 * GET /api/v1/ecommerce/products/filters
 * Get available filter options (product types, vendors, tags)
 */
router.get('/products/filters', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const { connectionId } = req.query;

    const [productTypes, vendors, tags, stats] = await Promise.all([
      productCatalogService.getProductTypes(organizationId, connectionId as string),
      productCatalogService.getVendors(organizationId, connectionId as string),
      productCatalogService.getTags(organizationId, connectionId as string),
      productCatalogService.getCatalogStats(organizationId),
    ]);

    res.json({
      success: true,
      data: {
        productTypes,
        vendors,
        tags,
        stats,
      },
    });
  } catch (error) {
    logger.error('Get filters error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to retrieve filters',
      },
    });
  }
});

/**
 * GET /api/v1/ecommerce/products/low-inventory
 * Get products with low inventory
 */
router.get('/products/low-inventory', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const threshold = parseInt(req.query.threshold as string, 10) || 10;

    const products = await productCatalogService.getLowInventoryProducts(
      organizationId,
      threshold
    );

    res.json({
      success: true,
      data: {
        products,
        threshold,
      },
    });
  } catch (error) {
    logger.error('Low inventory error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to retrieve low inventory products',
      },
    });
  }
});

/**
 * GET /api/v1/ecommerce/collections
 * Get product collections
 */
router.get('/collections', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const { connectionId } = req.query;

    const collections = await productCatalogService.getCollections(
      organizationId,
      connectionId as string
    );

    res.json({
      success: true,
      data: {
        collections,
      },
    });
  } catch (error) {
    logger.error('Get collections error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to retrieve collections',
      },
    });
  }
});

/**
 * GET /api/v1/ecommerce/collections/:id/products
 * Get products in a collection
 */
router.get('/collections/:id/products', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const { id } = req.params;
    const page = parseInt(req.query.page as string, 10) || 1;
    const limit = Math.min(parseInt(req.query.limit as string, 10) || 20, 100);

    const result = await productCatalogService.getCollectionProducts(
      id,
      organizationId,
      page,
      limit
    );

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    logger.error('Get collection products error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to retrieve collection products',
      },
    });
  }
});

// =============================================================================
// LIFECYCLE SEQUENCE ENDPOINTS
// =============================================================================

/**
 * GET /api/v1/ecommerce/sequences
 * List lifecycle sequences
 */
router.get('/sequences', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const { status } = req.query;

    const sequences = await lifecycleAutomationService.getSequences(
      organizationId,
      status as any
    );

    res.json({
      success: true,
      data: {
        sequences,
      },
    });
  } catch (error) {
    logger.error('Get sequences error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to retrieve sequences',
      },
    });
  }
});

/**
 * POST /api/v1/ecommerce/sequences
 * Create a new lifecycle sequence
 */
router.post('/sequences', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const userId = req.user!.id;

    const {
      name,
      description,
      triggerType,
      triggerConditions,
      stages,
      exitConditions,
      maxEnrollmentsPerCustomer,
      respectQuietHours,
      quietHoursStart,
      quietHoursEnd,
      timezone,
    } = req.body;

    if (!name || !triggerType || !stages || stages.length === 0) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_INPUT',
          message: 'Name, trigger type, and at least one stage are required',
        },
      });
    }

    const sequence = await lifecycleAutomationService.createSequence({
      organizationId,
      name,
      description,
      triggerType,
      triggerConditions,
      stages,
      exitConditions,
      maxEnrollmentsPerCustomer,
      respectQuietHours,
      quietHoursStart,
      quietHoursEnd,
      timezone,
      createdBy: userId,
    });

    res.status(201).json({
      success: true,
      data: sequence,
    });
  } catch (error) {
    logger.error('Create sequence error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to create sequence',
      },
    });
  }
});

/**
 * GET /api/v1/ecommerce/sequences/:id
 * Get a specific sequence
 */
router.get('/sequences/:id', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const { id } = req.params;

    const sequence = await lifecycleAutomationService.getSequence(id, organizationId);

    if (!sequence) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Sequence not found',
        },
      });
    }

    res.json({
      success: true,
      data: sequence,
    });
  } catch (error) {
    logger.error('Get sequence error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to retrieve sequence',
      },
    });
  }
});

/**
 * PUT /api/v1/ecommerce/sequences/:id
 * Update a sequence
 */
router.put('/sequences/:id', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const { id } = req.params;

    const sequence = await lifecycleAutomationService.updateSequence(
      id,
      organizationId,
      req.body
    );

    if (!sequence) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Sequence not found',
        },
      });
    }

    res.json({
      success: true,
      data: sequence,
    });
  } catch (error) {
    logger.error('Update sequence error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to update sequence',
      },
    });
  }
});

/**
 * PUT /api/v1/ecommerce/sequences/:id/activate
 * Activate a sequence
 */
router.put('/sequences/:id/activate', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const { id } = req.params;

    const success = await lifecycleAutomationService.activateSequence(id, organizationId);

    if (!success) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'ACTIVATION_FAILED',
          message: 'Could not activate sequence (not found or already active)',
        },
      });
    }

    res.json({
      success: true,
      data: {
        message: 'Sequence activated successfully',
      },
    });
  } catch (error) {
    logger.error('Activate sequence error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to activate sequence',
      },
    });
  }
});

/**
 * PUT /api/v1/ecommerce/sequences/:id/pause
 * Pause a sequence
 */
router.put('/sequences/:id/pause', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const { id } = req.params;

    const success = await lifecycleAutomationService.pauseSequence(id, organizationId);

    if (!success) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'PAUSE_FAILED',
          message: 'Could not pause sequence (not found or not active)',
        },
      });
    }

    res.json({
      success: true,
      data: {
        message: 'Sequence paused successfully',
      },
    });
  } catch (error) {
    logger.error('Pause sequence error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to pause sequence',
      },
    });
  }
});

/**
 * DELETE /api/v1/ecommerce/sequences/:id
 * Archive a sequence
 */
router.delete('/sequences/:id', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const { id } = req.params;

    const success = await lifecycleAutomationService.archiveSequence(id, organizationId);

    if (!success) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Sequence not found',
        },
      });
    }

    res.json({
      success: true,
      data: {
        message: 'Sequence archived successfully',
      },
    });
  } catch (error) {
    logger.error('Archive sequence error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to archive sequence',
      },
    });
  }
});

/**
 * GET /api/v1/ecommerce/sequences/:id/analytics
 * Get sequence analytics
 */
router.get('/sequences/:id/analytics', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const { id } = req.params;

    const analytics = await lifecycleAutomationService.getSequenceAnalytics(
      id,
      organizationId
    );

    res.json({
      success: true,
      data: analytics,
    });
  } catch (error) {
    logger.error('Get analytics error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to retrieve analytics',
      },
    });
  }
});

/**
 * GET /api/v1/ecommerce/sequences/:id/stages/analytics
 * Get stage-level analytics
 */
router.get('/sequences/:id/stages/analytics', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const { id } = req.params;

    const stageAnalytics = await lifecycleAutomationService.getStageAnalytics(
      id,
      organizationId
    );

    res.json({
      success: true,
      data: {
        stages: stageAnalytics,
      },
    });
  } catch (error) {
    logger.error('Get stage analytics error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to retrieve stage analytics',
      },
    });
  }
});

/**
 * GET /api/v1/ecommerce/sequences/:id/enrollments
 * Get enrollments for a sequence
 */
router.get('/sequences/:id/enrollments', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const { id } = req.params;
    const { status } = req.query;
    const page = parseInt(req.query.page as string, 10) || 1;
    const limit = Math.min(parseInt(req.query.limit as string, 10) || 20, 100);

    const result = await lifecycleAutomationService.getEnrollments(
      id,
      organizationId,
      status as any,
      page,
      limit
    );

    res.json({
      success: true,
      data: {
        enrollments: result.enrollments,
        total: result.total,
        page,
        limit,
        hasMore: page * limit < result.total,
      },
    });
  } catch (error) {
    logger.error('Get enrollments error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to retrieve enrollments',
      },
    });
  }
});

/**
 * POST /api/v1/ecommerce/sequences/:id/enroll
 * Manually enroll a customer in a sequence
 */
router.post('/sequences/:id/enroll', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const { id } = req.params;
    const { email, customerId, metadata } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_EMAIL',
          message: 'Email is required',
        },
      });
    }

    const enrollment = await lifecycleAutomationService.enrollCustomer(
      id,
      organizationId,
      {
        email,
        customerId,
        ...metadata,
      }
    );

    if (!enrollment) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'ENROLLMENT_FAILED',
          message: 'Could not enroll customer (sequence inactive or conditions not met)',
        },
      });
    }

    res.status(201).json({
      success: true,
      data: enrollment,
    });
  } catch (error) {
    logger.error('Enroll customer error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to enroll customer',
      },
    });
  }
});

// =============================================================================
// WEBHOOK ENDPOINTS
// =============================================================================

/**
 * POST /api/v1/ecommerce/webhooks/shopify/:connectionId
 * Handle Shopify webhooks
 */
router.post('/webhooks/shopify/:connectionId', async (req: Request, res: Response) => {
  try {
    const { connectionId } = req.params;
    const topic = req.headers['x-shopify-topic'] as string;
    const hmac = req.headers['x-shopify-hmac-sha256'] as string;
    const shopDomain = req.headers['x-shopify-shop-domain'] as string;

    // Get webhook secret for this connection
    const { rows } = await pool.query(
      'SELECT webhook_secret, organization_id FROM ecommerce_connections WHERE id = $1',
      [connectionId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Connection not found' });
    }

    // Verify webhook signature
    const rawBody = JSON.stringify(req.body);
    const isValid = shopifyService.verifyWebhookSignature(
      rawBody,
      hmac,
      rows[0].webhook_secret
    );

    if (!isValid) {
      logger.warn('Invalid webhook signature', { connectionId, topic });
      return res.status(401).json({ error: 'Invalid signature' });
    }

    // Log webhook
    await pool.query(
      `INSERT INTO ecommerce_webhooks (connection_id, organization_id, topic, external_id, payload)
       VALUES ($1, $2, $3, $4, $5)`,
      [connectionId, rows[0].organization_id, topic, req.body.id?.toString(), req.body]
    );

    // Process webhook based on topic
    if (topic.startsWith('products/')) {
      await shopifyService.handleProductWebhook(connectionId, topic, req.body);
    } else if (topic.startsWith('orders/')) {
      // Handle order webhooks - trigger lifecycle sequences
      if (topic === 'orders/paid' || topic === 'orders/create') {
        const order = req.body;
        if (order.email) {
          await lifecycleAutomationService.handlePostPurchase(
            rows[0].organization_id,
            order.email,
            {
              orderId: order.id.toString(),
              orderNumber: order.name,
              orderValue: parseFloat(order.total_price),
              productIds: order.line_items?.map((li: any) => li.product_id.toString()) || [],
              isFirstPurchase: order.customer?.orders_count === 1,
            }
          );
        }
      }
    } else if (topic === 'checkouts/create' || topic === 'carts/update') {
      // Handle abandoned cart triggers
      const cart = req.body;
      if (cart.email && cart.line_items?.length > 0) {
        await lifecycleAutomationService.handleAbandonedCart(
          rows[0].organization_id,
          cart.email,
          {
            cartItems: cart.line_items,
            cartValue: parseFloat(cart.total_price || '0'),
            cartToken: cart.token,
            checkoutUrl: cart.abandoned_checkout_url,
          }
        );
      }
    }

    // Mark webhook as processed
    await pool.query(
      `UPDATE ecommerce_webhooks SET processed = TRUE, processed_at = NOW()
       WHERE connection_id = $1 AND topic = $2 AND external_id = $3`,
      [connectionId, topic, req.body.id?.toString()]
    );

    res.status(200).json({ received: true });
  } catch (error) {
    logger.error('Webhook processing error:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

// =============================================================================
// SYNC STATUS ENDPOINT
// =============================================================================

/**
 * GET /api/v1/ecommerce/sync-status
 * Get sync status for all connections
 */
router.get('/sync-status', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);

    const status = await productCatalogService.getSyncStatus(organizationId);

    res.json({
      success: true,
      data: {
        connections: status,
      },
    });
  } catch (error) {
    logger.error('Get sync status error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to retrieve sync status',
      },
    });
  }
});

export const ecommerceRoutes = router;
