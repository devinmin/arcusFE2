/**
 * MLR/Compliance API Routes
 *
 * Medical-Legal-Regulatory compliance endpoints for healthcare content validation.
 * These routes expose the MLR Gate service for content validation, review queue
 * management, substantiation tracking, and audit trails.
 *
 * Base URL: /api/v1/compliance
 *
 * Features:
 * - Content validation against MLR requirements
 * - Review queue management (pending, in_review, approved, rejected)
 * - Substantiation source management
 * - Approved claims management
 * - Audit trail access
 * - Compliance settings
 */

import { Router, Request, Response } from 'express';
import { pool } from '../database/db.js';
import { requireAuth } from '../middleware/auth.js';
import { requireOrganization, getOrganizationId, createAuditLog } from '../middleware/multiTenancy.js';
import { logger, auditLogger } from '../utils/logger.js';
import {
  mlrGateService,
  MLRValidationContext,
  IndustryType,
  TargetAudience,
  ClaimType,
  ReviewStatus
} from '../services/mlrGateService.js';

const router = Router();

// ============================================================================
// MLR VALIDATION ENDPOINTS
// ============================================================================

/**
 * POST /api/v1/compliance/mlr/validate
 * Validate content against MLR requirements
 *
 * Request Body:
 *   - content: string | object - The content to validate
 *   - contentType: string - Type of content (email, social, website, etc.)
 *   - deliverableId?: string - Optional deliverable ID for tracking
 *   - context: object - Validation context
 *     - industry: IndustryType
 *     - targetAudience: TargetAudience
 *     - claimTypes?: ClaimType[]
 *     - jurisdictions?: string[]
 *     - productId?: string
 *     - therapeuticArea?: string
 *     - channels?: string[]
 *
 * Response:
 *   - passes: boolean
 *   - requiresHumanReview: boolean
 *   - riskScore: number
 *   - validation: object
 *   - requiredDisclaimers: string[]
 *   - substantiationGaps: array
 *   - flaggedClaims: string[]
 *   - recommendations: string[]
 *   - reviewQueueId?: string
 */
router.post('/mlr/validate', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const userId = req.org?.user.id || req.user?.id;
    const { content, contentType, deliverableId, context } = req.body;

    if (!organizationId) {
      return res.status(403).json({
        error: { code: 'NO_ORGANIZATION', message: 'Organization context required' }
      });
    }

    // Validate required fields
    if (!content) {
      return res.status(400).json({
        error: { code: 'MISSING_CONTENT', message: 'Content is required for validation' }
      });
    }

    if (!contentType) {
      return res.status(400).json({
        error: { code: 'MISSING_CONTENT_TYPE', message: 'Content type is required' }
      });
    }

    if (!context?.industry) {
      return res.status(400).json({
        error: { code: 'MISSING_INDUSTRY', message: 'Industry context is required' }
      });
    }

    if (!context?.targetAudience) {
      return res.status(400).json({
        error: { code: 'MISSING_AUDIENCE', message: 'Target audience is required' }
      });
    }

    // Build validation context
    const validationContext: MLRValidationContext = {
      organizationId,
      industry: context.industry as IndustryType,
      targetAudience: context.targetAudience as TargetAudience,
      claimTypes: context.claimTypes,
      jurisdictions: context.jurisdictions || ['US'],
      productId: context.productId,
      therapeuticArea: context.therapeuticArea,
      channels: context.channels
    };

    // Perform validation
    const result = await mlrGateService.validate(content, contentType, validationContext);

    // Create audit log
    await createAuditLog(req, 'compliance.mlr.validate', 'compliance', deliverableId || null, {
      contentType,
      riskScore: result.riskScore,
      passes: result.passes,
      requiresHumanReview: result.requiresHumanReview,
      flaggedClaimsCount: result.flaggedClaims.length
    });

    logger.info(`[Compliance] MLR validation completed`, {
      organizationId,
      userId,
      contentType,
      passes: result.passes,
      riskScore: result.riskScore
    });

    res.json({
      success: true,
      data: result,
      meta: {
        timestamp: new Date().toISOString(),
        validationDuration: 'completed'
      }
    });

  } catch (error: unknown) {
    const err = error as Error;
    logger.error('MLR validation error:', error);
    res.status(500).json({
      error: { code: 'VALIDATION_ERROR', message: 'Failed to validate content', details: err.message }
    });
  }
});

// ============================================================================
// MLR REVIEW QUEUE ENDPOINTS
// ============================================================================

/**
 * GET /api/v1/compliance/mlr/review-queue
 * Get MLR review queue items
 *
 * Query Parameters:
 *   - status?: ReviewStatus - Filter by status
 *   - priority?: string - Filter by priority
 *   - limit?: number - Results per page (default: 50, max: 100)
 *   - offset?: number - Skip results for pagination
 */
router.get('/mlr/review-queue', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const {
      status,
      priority,
      limit: rawLimit = '50',
      offset: rawOffset = '0'
    } = req.query;

    if (!organizationId) {
      return res.status(403).json({
        error: { code: 'NO_ORGANIZATION', message: 'Organization context required' }
      });
    }

    const limit = Math.min(Math.max(1, parseInt(rawLimit as string, 10) || 50), 100);
    const offset = Math.max(0, parseInt(rawOffset as string, 10) || 0);

    const result = await mlrGateService.getReviewQueue(organizationId, {
      status: status as ReviewStatus | undefined,
      priority: priority as string | undefined,
      limit,
      offset
    });

    // Get queue statistics
    const statsResult = await pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE status = 'pending') as pending_count,
        COUNT(*) FILTER (WHERE status IN ('medical_review', 'legal_review', 'regulatory_review')) as in_review_count,
        COUNT(*) FILTER (WHERE priority = 'urgent') as urgent_count,
        COUNT(*) FILTER (WHERE priority = 'high') as high_priority_count,
        AVG(ai_risk_score) as avg_risk_score
      FROM mlr_review_queue
      WHERE organization_id = $1
    `, [organizationId]);

    const stats = statsResult.rows[0];

    res.json({
      data: {
        items: result.items,
        total: result.total,
        hasMore: offset + result.items.length < result.total
      },
      stats: {
        pending: parseInt(stats.pending_count) || 0,
        inReview: parseInt(stats.in_review_count) || 0,
        urgent: parseInt(stats.urgent_count) || 0,
        highPriority: parseInt(stats.high_priority_count) || 0,
        avgRiskScore: Math.round(parseFloat(stats.avg_risk_score) || 0)
      },
      pagination: { limit, offset }
    });

  } catch (error: unknown) {
    logger.error('Error fetching MLR review queue:', error);
    res.status(500).json({
      error: { code: 'FETCH_ERROR', message: 'Failed to fetch review queue' }
    });
  }
});

/**
 * GET /api/v1/compliance/mlr/review-queue/:id
 * Get a specific review queue item
 */
router.get('/mlr/review-queue/:id', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const { id } = req.params;

    if (!organizationId) {
      return res.status(403).json({
        error: { code: 'NO_ORGANIZATION', message: 'Organization context required' }
      });
    }

    const result = await pool.query(`
      SELECT * FROM mlr_review_queue
      WHERE id = $1 AND organization_id = $2
    `, [id, organizationId]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Review queue item not found' }
      });
    }

    res.json({ data: result.rows[0] });

  } catch (error: unknown) {
    logger.error('Error fetching review queue item:', error);
    res.status(500).json({
      error: { code: 'FETCH_ERROR', message: 'Failed to fetch review queue item' }
    });
  }
});

/**
 * POST /api/v1/compliance/mlr/review-queue
 * Add content to MLR review queue manually
 */
router.post('/mlr/review-queue', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const userId = req.org?.user.id || req.user?.id;
    const {
      deliverableId,
      content,
      contentType,
      priority = 'normal',
      notes,
      therapeuticArea,
      productId,
      targetAudience
    } = req.body;

    if (!organizationId) {
      return res.status(403).json({
        error: { code: 'NO_ORGANIZATION', message: 'Organization context required' }
      });
    }

    if (!content && !deliverableId) {
      return res.status(400).json({
        error: { code: 'MISSING_CONTENT', message: 'Content or deliverableId is required' }
      });
    }

    // First validate the content
    const validationContext: MLRValidationContext = {
      organizationId,
      industry: 'pharma' as IndustryType, // Will be fetched from org settings
      targetAudience: (targetAudience || 'consumer') as TargetAudience,
      productId,
      therapeuticArea
    };

    const validationResult = await mlrGateService.validate(
      content,
      contentType || 'general',
      validationContext
    );

    // Insert into queue
    const result = await pool.query(`
      INSERT INTO mlr_review_queue (
        organization_id,
        deliverable_id,
        content_snapshot,
        content_type,
        content_hash,
        therapeutic_area,
        product_id,
        target_audience,
        validation_result,
        ai_risk_score,
        ai_flagged_claims,
        ai_missing_disclaimers,
        priority,
        notes,
        status,
        submitted_by
      )
      VALUES ($1, $2, $3, $4, md5($3::text), $5, $6, $7, $8, $9, $10, $11, $12, $13, 'pending', $14)
      RETURNING id
    `, [
      organizationId,
      deliverableId,
      JSON.stringify(content),
      contentType || 'general',
      therapeuticArea,
      productId,
      targetAudience || 'consumer',
      JSON.stringify(validationResult),
      validationResult.riskScore,
      validationResult.flaggedClaims,
      validationResult.requiredDisclaimers,
      priority,
      notes,
      userId
    ]);

    await createAuditLog(req, 'compliance.mlr.queue.add', 'compliance', result.rows[0].id, {
      deliverableId,
      priority,
      riskScore: validationResult.riskScore
    });

    logger.info(`[Compliance] Added to MLR review queue`, {
      queueId: result.rows[0].id,
      organizationId,
      priority
    });

    res.status(201).json({
      success: true,
      data: {
        queueId: result.rows[0].id,
        position: 'queued',
        estimatedReviewTime: priority === 'urgent' ? '4 hours' : priority === 'high' ? '1 day' : '3 days'
      }
    });

  } catch (error: unknown) {
    const err = error as Error;
    logger.error('Error adding to review queue:', error);
    res.status(500).json({
      error: { code: 'QUEUE_ERROR', message: 'Failed to add to review queue', details: err.message }
    });
  }
});

/**
 * PUT /api/v1/compliance/mlr/review-queue/:id
 * Submit review decision for a queue item
 *
 * Request Body:
 *   - reviewType: 'medical' | 'legal' | 'regulatory' | 'final'
 *   - decision: 'approved' | 'rejected' | 'changes_requested'
 *   - notes?: string
 *   - requiredChanges?: string[]
 */
router.put('/mlr/review-queue/:id', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const userId = req.org?.user.id || req.user?.id;
    const userName = (req.org?.user as any)?.name || req.user?.email || 'Unknown';
    const { id } = req.params;
    const { reviewType, decision, notes, requiredChanges } = req.body;

    if (!organizationId) {
      return res.status(403).json({
        error: { code: 'NO_ORGANIZATION', message: 'Organization context required' }
      });
    }

    // Validate reviewType
    if (!['medical', 'legal', 'regulatory', 'final'].includes(reviewType)) {
      return res.status(400).json({
        error: { code: 'INVALID_REVIEW_TYPE', message: 'Invalid review type' }
      });
    }

    // Validate decision
    if (!['approved', 'rejected', 'changes_requested'].includes(decision)) {
      return res.status(400).json({
        error: { code: 'INVALID_DECISION', message: 'Invalid decision' }
      });
    }

    // Verify the item exists and belongs to this org
    const itemResult = await pool.query(`
      SELECT * FROM mlr_review_queue
      WHERE id = $1 AND organization_id = $2
    `, [id, organizationId]);

    if (itemResult.rows.length === 0) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Review queue item not found' }
      });
    }

    // Submit review
    const success = await mlrGateService.submitReview(
      id,
      reviewType,
      decision,
      userName,
      userId!,
      notes,
      requiredChanges
    );

    if (!success) {
      return res.status(500).json({
        error: { code: 'REVIEW_ERROR', message: 'Failed to submit review' }
      });
    }

    await createAuditLog(req, `compliance.mlr.review.${reviewType}`, 'compliance', id, {
      decision,
      notes,
      requiredChanges
    });

    auditLogger.info('MLR review submitted', {
      queueId: id,
      reviewType,
      decision,
      reviewer: userName,
      organizationId
    });

    res.json({
      success: true,
      data: {
        queueId: id,
        status: decision === 'approved' && reviewType === 'final' ? 'approved' :
                decision === 'rejected' && reviewType === 'final' ? 'rejected' :
                `${reviewType}_review`
      }
    });

  } catch (error: unknown) {
    const err = error as Error;
    logger.error('Error submitting review:', error);
    res.status(500).json({
      error: { code: 'REVIEW_ERROR', message: 'Failed to submit review', details: err.message }
    });
  }
});

// ============================================================================
// SUBSTANTIATION SOURCE ENDPOINTS
// ============================================================================

/**
 * GET /api/v1/compliance/substantiation/sources
 * List substantiation sources
 */
router.get('/substantiation/sources', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const {
      status,
      sourceType,
      claimText,
      limit: rawLimit = '50',
      offset: rawOffset = '0'
    } = req.query;

    if (!organizationId) {
      return res.status(403).json({
        error: { code: 'NO_ORGANIZATION', message: 'Organization context required' }
      });
    }

    const limit = Math.min(Math.max(1, parseInt(rawLimit as string, 10) || 50), 100);
    const offset = Math.max(0, parseInt(rawOffset as string, 10) || 0);

    let query = `
      SELECT * FROM substantiation_sources
      WHERE organization_id = $1
    `;
    const params: any[] = [organizationId];
    let paramIndex = 2;

    if (status) {
      query += ` AND legal_review_status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }

    if (sourceType) {
      query += ` AND source_type = $${paramIndex}`;
      params.push(sourceType);
      paramIndex++;
    }

    if (claimText) {
      query += ` AND $${paramIndex} = ANY(claims_supported)`;
      params.push(claimText);
      paramIndex++;
    }

    query += ` ORDER BY created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limit, offset);

    const result = await pool.query(query, params);

    // Get total count
    const countResult = await pool.query(
      `SELECT COUNT(*) FROM substantiation_sources WHERE organization_id = $1`,
      [organizationId]
    );

    res.json({
      data: {
        sources: result.rows,
        total: parseInt(countResult.rows[0].count)
      },
      pagination: { limit, offset }
    });

  } catch (error: unknown) {
    logger.error('Error fetching substantiation sources:', error);
    res.status(500).json({
      error: { code: 'FETCH_ERROR', message: 'Failed to fetch substantiation sources' }
    });
  }
});

/**
 * POST /api/v1/compliance/substantiation/sources
 * Add a substantiation source
 */
router.post('/substantiation/sources', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const {
      title,
      sourceType,
      documentUrl,
      doi,
      pmid,
      publicationDate,
      expirationDate,
      claimsSupported,
      therapeuticAreas
    } = req.body;

    if (!organizationId) {
      return res.status(403).json({
        error: { code: 'NO_ORGANIZATION', message: 'Organization context required' }
      });
    }

    if (!title || !sourceType) {
      return res.status(400).json({
        error: { code: 'MISSING_FIELDS', message: 'Title and source type are required' }
      });
    }

    const sourceId = await mlrGateService.addSubstantiationSource(organizationId, {
      title,
      sourceType,
      documentUrl,
      doi,
      pmid,
      publicationDate: publicationDate ? new Date(publicationDate) : undefined,
      expirationDate: expirationDate ? new Date(expirationDate) : undefined,
      claimsSupported: claimsSupported || [],
      therapeuticAreas
    });

    await createAuditLog(req, 'compliance.substantiation.add', 'compliance', sourceId, {
      title,
      sourceType
    });

    res.status(201).json({
      success: true,
      data: {
        sourceId,
        status: 'pending_legal_review'
      }
    });

  } catch (error: unknown) {
    const err = error as Error;
    logger.error('Error adding substantiation source:', error);
    res.status(500).json({
      error: { code: 'CREATE_ERROR', message: 'Failed to add substantiation source', details: err.message }
    });
  }
});

/**
 * GET /api/v1/compliance/substantiation/sources/:id
 * Get a specific substantiation source
 */
router.get('/substantiation/sources/:id', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const { id } = req.params;

    if (!organizationId) {
      return res.status(403).json({
        error: { code: 'NO_ORGANIZATION', message: 'Organization context required' }
      });
    }

    const result = await pool.query(`
      SELECT * FROM substantiation_sources
      WHERE id = $1 AND organization_id = $2
    `, [id, organizationId]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Substantiation source not found' }
      });
    }

    res.json({ data: result.rows[0] });

  } catch (error: unknown) {
    logger.error('Error fetching substantiation source:', error);
    res.status(500).json({
      error: { code: 'FETCH_ERROR', message: 'Failed to fetch substantiation source' }
    });
  }
});

/**
 * PUT /api/v1/compliance/substantiation/sources/:id/approve
 * Approve a substantiation source (legal review)
 */
router.put('/substantiation/sources/:id/approve', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const userId = req.org?.user.id || req.user?.id;
    const userName = (req.org?.user as any)?.name || req.user?.email || 'Unknown';
    const { id } = req.params;
    const { notes } = req.body;

    if (!organizationId) {
      return res.status(403).json({
        error: { code: 'NO_ORGANIZATION', message: 'Organization context required' }
      });
    }

    const result = await pool.query(`
      UPDATE substantiation_sources
      SET
        legal_review_status = 'approved',
        legal_reviewer = $1,
        legal_reviewer_id = $2,
        legal_review_date = NOW(),
        legal_review_notes = $3,
        updated_at = NOW()
      WHERE id = $4 AND organization_id = $5
      RETURNING id
    `, [userName, userId, notes, id, organizationId]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Substantiation source not found' }
      });
    }

    await createAuditLog(req, 'compliance.substantiation.approve', 'compliance', id, {
      reviewer: userName,
      notes
    });

    res.json({
      success: true,
      data: {
        sourceId: id,
        status: 'approved'
      }
    });

  } catch (error: unknown) {
    logger.error('Error approving substantiation source:', error);
    res.status(500).json({
      error: { code: 'APPROVAL_ERROR', message: 'Failed to approve substantiation source' }
    });
  }
});

// ============================================================================
// APPROVED CLAIMS ENDPOINTS
// ============================================================================

/**
 * GET /api/v1/compliance/claims
 * List approved claims
 */
router.get('/claims', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const {
      claimType,
      productId,
      status,
      search,
      limit: rawLimit = '50',
      offset: rawOffset = '0'
    } = req.query;

    if (!organizationId) {
      return res.status(403).json({
        error: { code: 'NO_ORGANIZATION', message: 'Organization context required' }
      });
    }

    const limit = Math.min(Math.max(1, parseInt(rawLimit as string, 10) || 50), 100);
    const offset = Math.max(0, parseInt(rawOffset as string, 10) || 0);

    let query = `
      SELECT ac.*, array_agg(ss.title) as source_titles
      FROM approved_claims ac
      LEFT JOIN substantiation_sources ss ON ss.id = ANY(ac.substantiation_source_ids)
      WHERE ac.organization_id = $1
    `;
    const params: any[] = [organizationId];
    let paramIndex = 2;

    if (claimType) {
      query += ` AND ac.claim_type = $${paramIndex}`;
      params.push(claimType);
      paramIndex++;
    }

    if (productId) {
      query += ` AND ac.product_id = $${paramIndex}`;
      params.push(productId);
      paramIndex++;
    }

    if (status) {
      query += ` AND ac.status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }

    if (search) {
      query += ` AND ac.claim_text ILIKE $${paramIndex}`;
      params.push(`%${search}%`);
      paramIndex++;
    }

    query += ` GROUP BY ac.id ORDER BY ac.created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limit, offset);

    const result = await pool.query(query, params);

    // Get total count
    const countResult = await pool.query(
      `SELECT COUNT(*) FROM approved_claims WHERE organization_id = $1`,
      [organizationId]
    );

    res.json({
      data: {
        claims: result.rows,
        total: parseInt(countResult.rows[0].count)
      },
      pagination: { limit, offset }
    });

  } catch (error: unknown) {
    logger.error('Error fetching approved claims:', error);
    res.status(500).json({
      error: { code: 'FETCH_ERROR', message: 'Failed to fetch approved claims' }
    });
  }
});

/**
 * POST /api/v1/compliance/claims
 * Add an approved claim
 */
router.post('/claims', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const userId = req.org?.user.id || req.user?.id;
    const userName = (req.org?.user as any)?.name || req.user?.email || 'Unknown';
    const {
      claimText,
      claimType,
      productId,
      therapeuticArea,
      substantiationSourceIds,
      approvedChannels,
      approvedAudiences,
      requiredDisclaimers,
      expirationDate
    } = req.body;

    if (!organizationId) {
      return res.status(403).json({
        error: { code: 'NO_ORGANIZATION', message: 'Organization context required' }
      });
    }

    if (!claimText || !claimType) {
      return res.status(400).json({
        error: { code: 'MISSING_FIELDS', message: 'Claim text and type are required' }
      });
    }

    if (!substantiationSourceIds || substantiationSourceIds.length === 0) {
      return res.status(400).json({
        error: { code: 'MISSING_SUBSTANTIATION', message: 'At least one substantiation source is required' }
      });
    }

    const claimId = await mlrGateService.addApprovedClaim(organizationId, {
      claimText,
      claimType: claimType as ClaimType,
      productId,
      therapeuticArea,
      substantiationSourceIds,
      approvedChannels,
      approvedAudiences: approvedAudiences as TargetAudience[],
      requiredDisclaimers,
      expirationDate: expirationDate ? new Date(expirationDate) : undefined,
      approvedBy: userName
    });

    await createAuditLog(req, 'compliance.claims.add', 'compliance', claimId, {
      claimType,
      substantiationCount: substantiationSourceIds.length
    });

    res.status(201).json({
      success: true,
      data: {
        claimId,
        status: 'active'
      }
    });

  } catch (error: unknown) {
    const err = error as Error;
    logger.error('Error adding approved claim:', error);
    res.status(500).json({
      error: { code: 'CREATE_ERROR', message: 'Failed to add approved claim', details: err.message }
    });
  }
});

/**
 * GET /api/v1/compliance/claims/:id
 * Get a specific approved claim
 */
router.get('/claims/:id', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const { id } = req.params;

    if (!organizationId) {
      return res.status(403).json({
        error: { code: 'NO_ORGANIZATION', message: 'Organization context required' }
      });
    }

    const result = await pool.query(`
      SELECT ac.*, array_agg(ss.*) as substantiation_sources
      FROM approved_claims ac
      LEFT JOIN substantiation_sources ss ON ss.id = ANY(ac.substantiation_source_ids)
      WHERE ac.id = $1 AND ac.organization_id = $2
      GROUP BY ac.id
    `, [id, organizationId]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Approved claim not found' }
      });
    }

    res.json({ data: result.rows[0] });

  } catch (error: unknown) {
    logger.error('Error fetching approved claim:', error);
    res.status(500).json({
      error: { code: 'FETCH_ERROR', message: 'Failed to fetch approved claim' }
    });
  }
});

/**
 * PUT /api/v1/compliance/claims/:id/expire
 * Expire an approved claim
 */
router.put('/claims/:id/expire', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const { id } = req.params;
    const { reason } = req.body;

    if (!organizationId) {
      return res.status(403).json({
        error: { code: 'NO_ORGANIZATION', message: 'Organization context required' }
      });
    }

    const result = await pool.query(`
      UPDATE approved_claims
      SET
        status = 'expired',
        expiration_date = NOW(),
        expiration_reason = $1,
        updated_at = NOW()
      WHERE id = $2 AND organization_id = $3
      RETURNING id
    `, [reason, id, organizationId]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Approved claim not found' }
      });
    }

    await createAuditLog(req, 'compliance.claims.expire', 'compliance', id, { reason });

    res.json({
      success: true,
      data: {
        claimId: id,
        status: 'expired'
      }
    });

  } catch (error: unknown) {
    logger.error('Error expiring claim:', error);
    res.status(500).json({
      error: { code: 'EXPIRE_ERROR', message: 'Failed to expire claim' }
    });
  }
});

// ============================================================================
// AUDIT TRAIL ENDPOINTS
// ============================================================================

/**
 * GET /api/v1/compliance/audit-trail
 * Get MLR audit trail entries
 */
router.get('/audit-trail', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const {
      action,
      actionCategory,
      reviewQueueId,
      dateFrom,
      dateTo,
      limit: rawLimit = '100',
      offset: rawOffset = '0'
    } = req.query;

    if (!organizationId) {
      return res.status(403).json({
        error: { code: 'NO_ORGANIZATION', message: 'Organization context required' }
      });
    }

    const limit = Math.min(Math.max(1, parseInt(rawLimit as string, 10) || 100), 500);
    const offset = Math.max(0, parseInt(rawOffset as string, 10) || 0);

    let query = `
      SELECT * FROM mlr_audit_trail
      WHERE organization_id = $1
    `;
    const params: any[] = [organizationId];
    let paramIndex = 2;

    if (action) {
      query += ` AND action = $${paramIndex}`;
      params.push(action);
      paramIndex++;
    }

    if (actionCategory) {
      query += ` AND action_category = $${paramIndex}`;
      params.push(actionCategory);
      paramIndex++;
    }

    if (reviewQueueId) {
      query += ` AND review_queue_id = $${paramIndex}`;
      params.push(reviewQueueId);
      paramIndex++;
    }

    if (dateFrom) {
      query += ` AND timestamp >= $${paramIndex}`;
      params.push(new Date(dateFrom as string));
      paramIndex++;
    }

    if (dateTo) {
      query += ` AND timestamp <= $${paramIndex}`;
      params.push(new Date(dateTo as string));
      paramIndex++;
    }

    query += ` ORDER BY timestamp DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limit, offset);

    const result = await pool.query(query, params);

    // Get total count
    const countResult = await pool.query(
      `SELECT COUNT(*) FROM mlr_audit_trail WHERE organization_id = $1`,
      [organizationId]
    );

    res.json({
      data: {
        entries: result.rows,
        total: parseInt(countResult.rows[0].count)
      },
      pagination: { limit, offset }
    });

  } catch (error: unknown) {
    logger.error('Error fetching audit trail:', error);
    res.status(500).json({
      error: { code: 'FETCH_ERROR', message: 'Failed to fetch audit trail' }
    });
  }
});

// ============================================================================
// COMPLIANCE SETTINGS ENDPOINTS
// ============================================================================

/**
 * GET /api/v1/compliance/settings
 * Get organization compliance settings
 */
router.get('/settings', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);

    if (!organizationId) {
      return res.status(403).json({
        error: { code: 'NO_ORGANIZATION', message: 'Organization context required' }
      });
    }

    const settings = await mlrGateService.getComplianceSettings(organizationId);

    if (!settings) {
      // Return defaults if no settings exist
      return res.json({
        data: {
          industryType: null,
          requireMedicalReview: false,
          requireLegalReview: false,
          requireRegulatoryReview: false,
          autoBlockUnsubstantiated: true,
          aiRiskThreshold: 70,
          configured: false
        }
      });
    }

    res.json({
      data: {
        ...settings,
        configured: true
      }
    });

  } catch (error: unknown) {
    logger.error('Error fetching compliance settings:', error);
    res.status(500).json({
      error: { code: 'FETCH_ERROR', message: 'Failed to fetch compliance settings' }
    });
  }
});

/**
 * PUT /api/v1/compliance/settings
 * Update organization compliance settings
 */
router.put('/settings', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const {
      industryType,
      requireMedicalReview,
      requireLegalReview,
      requireRegulatoryReview,
      autoBlockUnsubstantiated,
      aiRiskThreshold,
      defaultDisclaimers,
      complianceContacts
    } = req.body;

    if (!organizationId) {
      return res.status(403).json({
        error: { code: 'NO_ORGANIZATION', message: 'Organization context required' }
      });
    }

    // Upsert settings
    await pool.query(`
      INSERT INTO compliance_settings (
        organization_id,
        industry_type,
        require_medical_review,
        require_legal_review,
        require_regulatory_review,
        auto_block_unsubstantiated,
        ai_risk_threshold,
        default_disclaimers,
        compliance_contacts
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      ON CONFLICT (organization_id) DO UPDATE SET
        industry_type = EXCLUDED.industry_type,
        require_medical_review = EXCLUDED.require_medical_review,
        require_legal_review = EXCLUDED.require_legal_review,
        require_regulatory_review = EXCLUDED.require_regulatory_review,
        auto_block_unsubstantiated = EXCLUDED.auto_block_unsubstantiated,
        ai_risk_threshold = EXCLUDED.ai_risk_threshold,
        default_disclaimers = EXCLUDED.default_disclaimers,
        compliance_contacts = EXCLUDED.compliance_contacts,
        updated_at = NOW()
    `, [
      organizationId,
      industryType,
      requireMedicalReview ?? false,
      requireLegalReview ?? false,
      requireRegulatoryReview ?? false,
      autoBlockUnsubstantiated ?? true,
      aiRiskThreshold ?? 70,
      defaultDisclaimers,
      complianceContacts
    ]);

    await createAuditLog(req, 'compliance.settings.update', 'compliance', null, {
      industryType,
      requireMedicalReview,
      requireLegalReview,
      requireRegulatoryReview
    });

    res.json({
      success: true,
      message: 'Compliance settings updated'
    });

  } catch (error: unknown) {
    logger.error('Error updating compliance settings:', error);
    res.status(500).json({
      error: { code: 'UPDATE_ERROR', message: 'Failed to update compliance settings' }
    });
  }
});

// ============================================================================
// DISCLAIMER TEMPLATES ENDPOINTS
// ============================================================================

/**
 * GET /api/v1/compliance/disclaimers
 * Get disclaimer templates
 */
router.get('/disclaimers', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const { audienceType, contentType, industry } = req.query;

    if (!organizationId) {
      return res.status(403).json({
        error: { code: 'NO_ORGANIZATION', message: 'Organization context required' }
      });
    }

    let query = `
      SELECT * FROM disclaimer_templates
      WHERE organization_id = $1 AND status = 'active'
    `;
    const params: any[] = [organizationId];
    let paramIndex = 2;

    if (audienceType) {
      query += ` AND $${paramIndex} = ANY(audience_types)`;
      params.push(audienceType);
      paramIndex++;
    }

    if (contentType) {
      query += ` AND $${paramIndex} = ANY(content_types)`;
      params.push(contentType);
      paramIndex++;
    }

    if (industry) {
      query += ` AND industry = $${paramIndex}`;
      params.push(industry);
      paramIndex++;
    }

    query += ` ORDER BY sort_order ASC, name ASC`;

    const result = await pool.query(query, params);

    res.json({
      data: {
        disclaimers: result.rows
      }
    });

  } catch (error: unknown) {
    logger.error('Error fetching disclaimers:', error);
    res.status(500).json({
      error: { code: 'FETCH_ERROR', message: 'Failed to fetch disclaimers' }
    });
  }
});

/**
 * POST /api/v1/compliance/disclaimers
 * Create a disclaimer template
 */
router.post('/disclaimers', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const {
      name,
      disclaimerText,
      shortVersion,
      industry,
      audienceTypes,
      contentTypes,
      isRequired,
      regulation,
      sortOrder
    } = req.body;

    if (!organizationId) {
      return res.status(403).json({
        error: { code: 'NO_ORGANIZATION', message: 'Organization context required' }
      });
    }

    if (!name || !disclaimerText) {
      return res.status(400).json({
        error: { code: 'MISSING_FIELDS', message: 'Name and disclaimer text are required' }
      });
    }

    const result = await pool.query(`
      INSERT INTO disclaimer_templates (
        organization_id,
        name,
        disclaimer_text,
        short_version,
        industry,
        audience_types,
        content_types,
        is_required,
        regulation,
        sort_order
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING id
    `, [
      organizationId,
      name,
      disclaimerText,
      shortVersion,
      industry,
      audienceTypes,
      contentTypes,
      isRequired ?? false,
      regulation,
      sortOrder ?? 0
    ]);

    await createAuditLog(req, 'compliance.disclaimer.create', 'compliance', result.rows[0].id, { name });

    res.status(201).json({
      success: true,
      data: {
        disclaimerId: result.rows[0].id
      }
    });

  } catch (error: unknown) {
    logger.error('Error creating disclaimer:', error);
    res.status(500).json({
      error: { code: 'CREATE_ERROR', message: 'Failed to create disclaimer' }
    });
  }
});

export const complianceRoutes = router;
