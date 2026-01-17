/**
 * Analyst Relations API Routes
 *
 * Endpoints for managing analyst relationships, briefings, inquiries,
 * and Magic Quadrant positioning.
 *
 * Base URL: /api/v1/analyst-relations
 *
 * Features:
 * - Analyst profile CRUD
 * - Briefing document generation and management
 * - Analyst inquiry tracking and AI response generation
 * - Competitive positioning analysis
 * - Magic Quadrant/Wave positioning tracking
 * - Report citation tracking
 *
 * Phase 2.3 - B2B Differentiation
 */

import { Router, Request, Response } from 'express';
import { pool } from '../database/db.js';
import { requireAuth } from '../middleware/auth.js';
import { requireOrganization, getOrganizationId, createAuditLog } from '../middleware/multiTenancy.js';
import { logger, auditLogger } from '../utils/logger.js';
import {
  analystRelationsService,
  AnalystType,
  RelationshipStatus,
  RelationshipStrength,
  AnalystTier,
  BriefingType,
  InquiryType,
  InquiryPriority,
  QuadrantPosition
} from '../services/analystRelationsService.js';

export const analystRelationsRoutes = Router();

// ============================================================================
// ANALYST PROFILE ENDPOINTS
// ============================================================================

/**
 * GET /api/v1/analyst-relations/analysts
 * List all analysts for the organization with optional filters
 *
 * Query Parameters:
 *   - firmName?: string - Filter by analyst firm
 *   - relationshipStatus?: RelationshipStatus
 *   - tier?: AnalystTier
 *   - coverageArea?: string
 */
analystRelationsRoutes.get('/analysts', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);

    if (!organizationId) {
      return res.status(403).json({
        error: { code: 'NO_ORGANIZATION', message: 'Organization context required' }
      });
    }

    const filters = {
      firmName: req.query.firmName as string | undefined,
      relationshipStatus: req.query.relationshipStatus as RelationshipStatus | undefined,
      tier: req.query.tier as AnalystTier | undefined,
      coverageArea: req.query.coverageArea as string | undefined
    };

    const analysts = await analystRelationsService.getAnalysts(organizationId, filters);

    res.json({
      analysts,
      total: analysts.length
    });
  } catch (error) {
    const err = error as Error;
    logger.error('[AnalystRelations API] Failed to get analysts', { error: err.message });
    res.status(500).json({
      error: { code: 'GET_ANALYSTS_FAILED', message: err.message }
    });
  }
});

/**
 * GET /api/v1/analyst-relations/analysts/:id
 * Get a specific analyst profile
 */
analystRelationsRoutes.get('/analysts/:id', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const { id } = req.params;

    if (!organizationId) {
      return res.status(403).json({
        error: { code: 'NO_ORGANIZATION', message: 'Organization context required' }
      });
    }

    const result = await pool.query(
      `SELECT * FROM analysts WHERE id = $1 AND organization_id = $2`,
      [id, organizationId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: { code: 'ANALYST_NOT_FOUND', message: 'Analyst not found' }
      });
    }

    res.json({ analyst: result.rows[0] });
  } catch (error) {
    const err = error as Error;
    logger.error('[AnalystRelations API] Failed to get analyst', { error: err.message });
    res.status(500).json({
      error: { code: 'GET_ANALYST_FAILED', message: err.message }
    });
  }
});

/**
 * POST /api/v1/analyst-relations/analysts
 * Create a new analyst profile
 *
 * Request Body:
 *   - analystType: AnalystType ('individual' | 'firm')
 *   - firmName: string (required)
 *   - analystName?: string
 *   - title?: string
 *   - email?: string
 *   - phone?: string
 *   - linkedinUrl?: string
 *   - twitterHandle?: string
 *   - coverageAreas: string[]
 *   - primaryCoverageArea?: string
 *   - geographicCoverage?: string
 *   - relationshipStatus: RelationshipStatus
 *   - relationshipStrength?: RelationshipStrength
 *   - tier?: AnalystTier
 *   - notes?: string
 *   - internalNotes?: string
 *   - tags?: string[]
 */
analystRelationsRoutes.post('/analysts', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const userId = req.org?.user.id || req.user?.id;

    if (!organizationId || !userId) {
      return res.status(403).json({
        error: { code: 'NO_ORGANIZATION', message: 'Organization context required' }
      });
    }

    const {
      analystType,
      firmName,
      analystName,
      title,
      email,
      phone,
      linkedinUrl,
      twitterHandle,
      coverageAreas,
      primaryCoverageArea,
      geographicCoverage,
      relationshipStatus,
      relationshipStrength,
      tier,
      notes,
      internalNotes,
      tags
    } = req.body;

    // Validation
    if (!analystType || !firmName || !coverageAreas || !relationshipStatus) {
      return res.status(400).json({
        error: {
          code: 'MISSING_REQUIRED_FIELDS',
          message: 'analystType, firmName, coverageAreas, and relationshipStatus are required'
        }
      });
    }

    const analyst = await analystRelationsService.createAnalyst(
      organizationId,
      {
        analystType,
        firmName,
        analystName,
        title,
        email,
        phone,
        linkedinUrl,
        twitterHandle,
        coverageAreas,
        primaryCoverageArea,
        geographicCoverage,
        relationshipStatus,
        relationshipStrength,
        tier,
        notes,
        internalNotes,
        tags: tags || []
      },
      userId
    );

    await createAuditLog(req, 'analyst_relations.create_analyst', 'analyst_relations', analyst.id, {
      firmName: analyst.firmName,
      analystName: analyst.analystName
    });

    res.status(201).json({ analyst });
  } catch (error) {
    const err = error as Error;
    logger.error('[AnalystRelations API] Failed to create analyst', { error: err.message });
    res.status(500).json({
      error: { code: 'CREATE_ANALYST_FAILED', message: err.message }
    });
  }
});

/**
 * PUT /api/v1/analyst-relations/analysts/:id
 * Update an analyst profile
 */
analystRelationsRoutes.put('/analysts/:id', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const userId = req.org?.user.id || req.user?.id;
    const { id } = req.params;

    if (!organizationId || !userId) {
      return res.status(403).json({
        error: { code: 'NO_ORGANIZATION', message: 'Organization context required' }
      });
    }

    const analyst = await analystRelationsService.updateAnalyst(
      id,
      organizationId,
      req.body,
      userId
    );

    await createAuditLog(req, 'analyst_relations.update_analyst', 'analyst_relations', id, {});

    res.json({ analyst });
  } catch (error) {
    const err = error as Error;
    logger.error('[AnalystRelations API] Failed to update analyst', { error: err.message });
    res.status(500).json({
      error: { code: 'UPDATE_ANALYST_FAILED', message: err.message }
    });
  }
});

/**
 * DELETE /api/v1/analyst-relations/analysts/:id
 * Delete an analyst profile
 */
analystRelationsRoutes.delete('/analysts/:id', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const { id } = req.params;

    if (!organizationId) {
      return res.status(403).json({
        error: { code: 'NO_ORGANIZATION', message: 'Organization context required' }
      });
    }

    await pool.query(
      `DELETE FROM analysts WHERE id = $1 AND organization_id = $2`,
      [id, organizationId]
    );

    await createAuditLog(req, 'analyst_relations.delete_analyst', 'analyst_relations', id, {});

    res.json({ success: true });
  } catch (error) {
    const err = error as Error;
    logger.error('[AnalystRelations API] Failed to delete analyst', { error: err.message });
    res.status(500).json({
      error: { code: 'DELETE_ANALYST_FAILED', message: err.message }
    });
  }
});

// ============================================================================
// BRIEFING ENDPOINTS
// ============================================================================

/**
 * POST /api/v1/analyst-relations/briefings/generate
 * Generate AI-powered analyst briefing deck
 *
 * Request Body:
 *   - analystId: string (required)
 *   - briefingType: BriefingType
 *   - topics: string[]
 *   - productsToDiscuss: string[]
 *   - competitiveContext?: string
 *   - customInstructions?: string
 *   - organizationContext?: object
 */
analystRelationsRoutes.post('/briefings/generate', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);

    if (!organizationId) {
      return res.status(403).json({
        error: { code: 'NO_ORGANIZATION', message: 'Organization context required' }
      });
    }

    const {
      analystId,
      briefingType,
      topics,
      productsToDiscuss,
      competitiveContext,
      customInstructions,
      organizationContext
    } = req.body;

    // Validation
    if (!analystId || !briefingType || !topics || !productsToDiscuss) {
      return res.status(400).json({
        error: {
          code: 'MISSING_REQUIRED_FIELDS',
          message: 'analystId, briefingType, topics, and productsToDiscuss are required'
        }
      });
    }

    const deck = await analystRelationsService.generateBriefingDeck(organizationId, {
      analystId,
      briefingType,
      topics,
      productsToDiscuss,
      competitiveContext,
      customInstructions,
      organizationContext
    });

    await createAuditLog(req, 'analyst_relations.generate_briefing_deck', 'analyst_relations', analystId, {
      briefingType,
      slideCount: deck.slides.length
    });

    res.json({ deck });
  } catch (error) {
    const err = error as Error;
    logger.error('[AnalystRelations API] Failed to generate briefing deck', { error: err.message });
    res.status(500).json({
      error: { code: 'GENERATE_BRIEFING_FAILED', message: err.message }
    });
  }
});

/**
 * POST /api/v1/analyst-relations/briefings
 * Create a new analyst briefing
 *
 * Request Body:
 *   - analystId: string
 *   - briefingType: BriefingType
 *   - title: string
 *   - description?: string
 *   - scheduledDate: string (ISO date)
 *   - durationMinutes?: number
 *   - internalAttendees?: object[]
 *   - externalAttendees?: object[]
 *   - topicsCovered: string[]
 *   - productsDiscussed?: string[]
 *   - competitivePositioning?: string
 */
analystRelationsRoutes.post('/briefings', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const userId = req.org?.user.id || req.user?.id;

    if (!organizationId || !userId) {
      return res.status(403).json({
        error: { code: 'NO_ORGANIZATION', message: 'Organization context required' }
      });
    }

    const {
      analystId,
      briefingType,
      title,
      description,
      scheduledDate,
      durationMinutes,
      internalAttendees,
      externalAttendees,
      topicsCovered,
      productsDiscussed,
      competitivePositioning
    } = req.body;

    // Validation
    if (!analystId || !briefingType || !title || !scheduledDate || !topicsCovered) {
      return res.status(400).json({
        error: {
          code: 'MISSING_REQUIRED_FIELDS',
          message: 'analystId, briefingType, title, scheduledDate, and topicsCovered are required'
        }
      });
    }

    const briefing = await analystRelationsService.createBriefing(
      organizationId,
      {
        analystId,
        briefingType,
        title,
        description,
        scheduledDate: new Date(scheduledDate),
        durationMinutes,
        internalAttendees,
        externalAttendees,
        topicsCovered,
        productsDiscussed,
        competitivePositioning
      },
      userId
    );

    await createAuditLog(req, 'analyst_relations.create_briefing', 'analyst_relations', briefing.id, {
      analystId,
      title
    });

    res.status(201).json({ briefing });
  } catch (error) {
    const err = error as Error;
    logger.error('[AnalystRelations API] Failed to create briefing', { error: err.message });
    res.status(500).json({
      error: { code: 'CREATE_BRIEFING_FAILED', message: err.message }
    });
  }
});

/**
 * GET /api/v1/analyst-relations/briefings
 * List all briefings for the organization
 */
analystRelationsRoutes.get('/briefings', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);

    if (!organizationId) {
      return res.status(403).json({
        error: { code: 'NO_ORGANIZATION', message: 'Organization context required' }
      });
    }

    const result = await pool.query(`
      SELECT ab.*, a.firm_name, a.analyst_name
      FROM analyst_briefings ab
      LEFT JOIN analysts a ON ab.analyst_id = a.id
      WHERE ab.organization_id = $1
      ORDER BY ab.scheduled_date DESC
    `, [organizationId]);

    res.json({
      briefings: result.rows,
      total: result.rows.length
    });
  } catch (error) {
    const err = error as Error;
    logger.error('[AnalystRelations API] Failed to get briefings', { error: err.message });
    res.status(500).json({
      error: { code: 'GET_BRIEFINGS_FAILED', message: err.message }
    });
  }
});

// ============================================================================
// POSITIONING ANALYSIS ENDPOINTS
// ============================================================================

/**
 * POST /api/v1/analyst-relations/positioning/analyze
 * Analyze competitive positioning for Magic Quadrant preparation
 *
 * Request Body:
 *   - marketCategory: string (required)
 *   - targetQuadrant: QuadrantPosition (required)
 *   - competitors: string[] (required)
 *   - currentStrengths?: string[]
 *   - currentWeaknesses?: string[]
 *   - productCapabilities?: string[]
 */
analystRelationsRoutes.post('/positioning/analyze', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);

    if (!organizationId) {
      return res.status(403).json({
        error: { code: 'NO_ORGANIZATION', message: 'Organization context required' }
      });
    }

    const {
      marketCategory,
      targetQuadrant,
      competitors,
      currentStrengths,
      currentWeaknesses,
      productCapabilities
    } = req.body;

    // Validation
    if (!marketCategory || !targetQuadrant || !competitors) {
      return res.status(400).json({
        error: {
          code: 'MISSING_REQUIRED_FIELDS',
          message: 'marketCategory, targetQuadrant, and competitors are required'
        }
      });
    }

    const analysis = await analystRelationsService.analyzeCompetitivePositioning(
      organizationId,
      {
        marketCategory,
        targetQuadrant,
        competitors,
        currentStrengths,
        currentWeaknesses,
        productCapabilities
      }
    );

    await createAuditLog(req, 'analyst_relations.analyze_positioning', 'analyst_relations', null, {
      marketCategory,
      targetQuadrant,
      competitorCount: competitors.length
    });

    res.json({ analysis });
  } catch (error) {
    const err = error as Error;
    logger.error('[AnalystRelations API] Failed to analyze positioning', { error: err.message });
    res.status(500).json({
      error: { code: 'ANALYZE_POSITIONING_FAILED', message: err.message }
    });
  }
});

/**
 * GET /api/v1/analyst-relations/positioning/trend
 * Get Magic Quadrant positioning trend over time
 *
 * Query Parameters:
 *   - firmName: string (required)
 *   - marketCategory: string (required)
 *   - years?: number (default: 5)
 */
analystRelationsRoutes.get('/positioning/trend', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);

    if (!organizationId) {
      return res.status(403).json({
        error: { code: 'NO_ORGANIZATION', message: 'Organization context required' }
      });
    }

    const { firmName, marketCategory, years } = req.query;

    if (!firmName || !marketCategory) {
      return res.status(400).json({
        error: {
          code: 'MISSING_REQUIRED_PARAMS',
          message: 'firmName and marketCategory query parameters are required'
        }
      });
    }

    const trend = await analystRelationsService.getPositioningTrend(
      organizationId,
      firmName as string,
      marketCategory as string,
      years ? parseInt(years as string) : undefined
    );

    res.json({ trend });
  } catch (error) {
    const err = error as Error;
    logger.error('[AnalystRelations API] Failed to get positioning trend', { error: err.message });
    res.status(500).json({
      error: { code: 'GET_TREND_FAILED', message: err.message }
    });
  }
});

// ============================================================================
// INQUIRY ENDPOINTS
// ============================================================================

/**
 * POST /api/v1/analyst-relations/inquiries
 * Create a new analyst inquiry
 *
 * Request Body:
 *   - analystId: string
 *   - inquiryType: InquiryType
 *   - subject: string
 *   - inquiryText: string
 *   - priority?: InquiryPriority
 *   - responseDeadline?: string (ISO date)
 *   - assignedTo?: string (user ID)
 */
analystRelationsRoutes.post('/inquiries', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const userId = req.org?.user.id || req.user?.id;

    if (!organizationId) {
      return res.status(403).json({
        error: { code: 'NO_ORGANIZATION', message: 'Organization context required' }
      });
    }

    const {
      analystId,
      inquiryType,
      subject,
      inquiryText,
      priority,
      responseDeadline,
      assignedTo
    } = req.body;

    // Validation
    if (!analystId || !inquiryType || !subject || !inquiryText) {
      return res.status(400).json({
        error: {
          code: 'MISSING_REQUIRED_FIELDS',
          message: 'analystId, inquiryType, subject, and inquiryText are required'
        }
      });
    }

    const inquiry = await analystRelationsService.createInquiry(
      organizationId,
      {
        analystId,
        inquiryType,
        subject,
        inquiryText,
        priority,
        responseDeadline: responseDeadline ? new Date(responseDeadline) : undefined,
        assignedTo
      },
      userId
    );

    await createAuditLog(req, 'analyst_relations.create_inquiry', 'analyst_relations', inquiry.id, {
      analystId,
      subject
    });

    res.status(201).json({ inquiry });
  } catch (error) {
    const err = error as Error;
    logger.error('[AnalystRelations API] Failed to create inquiry', { error: err.message });
    res.status(500).json({
      error: { code: 'CREATE_INQUIRY_FAILED', message: err.message }
    });
  }
});

/**
 * POST /api/v1/analyst-relations/inquiries/:id/response
 * Generate AI response to an analyst inquiry
 *
 * Request Body:
 *   - contextualInfo?: string
 *   - responseTemplate?: string
 */
analystRelationsRoutes.post('/inquiries/:id/response', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const { id } = req.params;

    if (!organizationId) {
      return res.status(403).json({
        error: { code: 'NO_ORGANIZATION', message: 'Organization context required' }
      });
    }

    // Get inquiry details
    const inquiryResult = await pool.query(
      `SELECT * FROM analyst_inquiries WHERE id = $1 AND organization_id = $2`,
      [id, organizationId]
    );

    if (inquiryResult.rows.length === 0) {
      return res.status(404).json({
        error: { code: 'INQUIRY_NOT_FOUND', message: 'Inquiry not found' }
      });
    }

    const inquiry = inquiryResult.rows[0];
    const { contextualInfo, responseTemplate } = req.body;

    const response = await analystRelationsService.generateInquiryResponse(
      organizationId,
      {
        analystId: inquiry.analyst_id,
        inquiryType: inquiry.inquiry_type,
        inquiryText: inquiry.inquiry_text,
        contextualInfo,
        responseTemplate
      }
    );

    await createAuditLog(req, 'analyst_relations.generate_inquiry_response', 'analyst_relations', id, {});

    res.json({ response });
  } catch (error) {
    const err = error as Error;
    logger.error('[AnalystRelations API] Failed to generate inquiry response', { error: err.message });
    res.status(500).json({
      error: { code: 'GENERATE_RESPONSE_FAILED', message: err.message }
    });
  }
});

/**
 * GET /api/v1/analyst-relations/inquiries
 * List all inquiries for the organization
 */
analystRelationsRoutes.get('/inquiries', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);

    if (!organizationId) {
      return res.status(403).json({
        error: { code: 'NO_ORGANIZATION', message: 'Organization context required' }
      });
    }

    const result = await pool.query(`
      SELECT ai.*, a.firm_name, a.analyst_name
      FROM analyst_inquiries ai
      LEFT JOIN analysts a ON ai.analyst_id = a.id
      WHERE ai.organization_id = $1
      ORDER BY ai.received_date DESC
    `, [organizationId]);

    res.json({
      inquiries: result.rows,
      total: result.rows.length
    });
  } catch (error) {
    const err = error as Error;
    logger.error('[AnalystRelations API] Failed to get inquiries', { error: err.message });
    res.status(500).json({
      error: { code: 'GET_INQUIRIES_FAILED', message: err.message }
    });
  }
});

// ============================================================================
// REPORT ENDPOINTS
// ============================================================================

/**
 * GET /api/v1/analyst-relations/reports
 * List all analyst reports for the organization
 */
analystRelationsRoutes.get('/reports', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);

    if (!organizationId) {
      return res.status(403).json({
        error: { code: 'NO_ORGANIZATION', message: 'Organization context required' }
      });
    }

    const result = await pool.query(`
      SELECT * FROM analyst_reports
      WHERE organization_id = $1
      ORDER BY publication_date DESC
    `, [organizationId]);

    res.json({
      reports: result.rows,
      total: result.rows.length
    });
  } catch (error) {
    const err = error as Error;
    logger.error('[AnalystRelations API] Failed to get reports', { error: err.message });
    res.status(500).json({
      error: { code: 'GET_REPORTS_FAILED', message: err.message }
    });
  }
});

/**
 * POST /api/v1/analyst-relations/reports/:id/cite
 * Track citation of an analyst report
 *
 * Request Body:
 *   - materialType: string
 *   - materialId?: string
 */
analystRelationsRoutes.post('/reports/:id/cite', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const { id } = req.params;

    if (!organizationId) {
      return res.status(403).json({
        error: { code: 'NO_ORGANIZATION', message: 'Organization context required' }
      });
    }

    const { materialType, materialId } = req.body;

    if (!materialType) {
      return res.status(400).json({
        error: { code: 'MISSING_MATERIAL_TYPE', message: 'materialType is required' }
      });
    }

    await analystRelationsService.trackReportCitation(
      organizationId,
      id,
      {
        materialType,
        materialId,
        citationDate: new Date()
      }
    );

    await createAuditLog(req, 'analyst_relations.cite_report', 'analyst_relations', id, {
      materialType
    });

    res.json({ success: true });
  } catch (error) {
    const err = error as Error;
    logger.error('[AnalystRelations API] Failed to track citation', { error: err.message });
    res.status(500).json({
      error: { code: 'TRACK_CITATION_FAILED', message: err.message }
    });
  }
});

export default analystRelationsRoutes;
