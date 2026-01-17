/**
 * HCP Marketing API Routes
 *
 * Healthcare Professional marketing endpoints for pharmaceutical and healthcare
 * industries. Provides HCP targeting, medical content generation, speaker programs,
 * and engagement tracking.
 *
 * Base URL: /api/v1/hcp
 *
 * Features:
 * - HCP profile management (CRUD)
 * - Segmentation and targeting
 * - Medical content generation (with MLR validation)
 * - Speaker program management
 * - Engagement tracking
 * - Analytics and reporting
 *
 * CRITICAL: All content generation goes through MLR compliance validation.
 */

import { Router, Request, Response } from 'express';
import { pool } from '../database/db.js';
import { requireAuth } from '../middleware/auth.js';
import { requireOrganization, getOrganizationId } from '../middleware/multiTenancy.js';
import { logger, auditLogger } from '../utils/logger.js';
import {
  hcpMarketingService,
  Specialty,
  PracticeType,
  ContentType,
  EngagementType,
  ProgramType,
  ContentGenerationInput,
  DetailingAidInput,
  SpeakerDeckInput,
  CongressMaterialInput
} from '../services/hcpMarketingService.js';
import { IndustryType } from '../services/mlrGateService.js';

const router = Router();

// ============================================================================
// HCP PROFILE ENDPOINTS
// ============================================================================

/**
 * GET /api/v1/hcp/profiles
 * Search and filter HCP profiles
 *
 * Query Parameters:
 *   - specialty?: Specialty
 *   - subSpecialty?: string
 *   - practiceType?: PracticeType
 *   - state?: string
 *   - city?: string
 *   - isKol?: boolean
 *   - kolTier?: string
 *   - segmentIds?: string[] (comma-separated)
 *   - engagementScoreMin?: number
 *   - tags?: string[] (comma-separated)
 *   - limit?: number (default 50)
 *   - offset?: number (default 0)
 */
router.get('/profiles', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    if (!organizationId) {
      return res.status(403).json({ error: { code: 'NO_ORGANIZATION', message: 'Organization required' } });
    }

    const filters = {
      specialty: req.query.specialty as Specialty | undefined,
      subSpecialty: req.query.subSpecialty as string | undefined,
      practiceType: req.query.practiceType as PracticeType | undefined,
      state: req.query.state as string | undefined,
      city: req.query.city as string | undefined,
      isKol: req.query.isKol ? req.query.isKol === 'true' : undefined,
      kolTier: req.query.kolTier as string | undefined,
      segmentIds: req.query.segmentIds ? (req.query.segmentIds as string).split(',') : undefined,
      engagementScoreMin: req.query.engagementScoreMin ? parseInt(req.query.engagementScoreMin as string) : undefined,
      tags: req.query.tags ? (req.query.tags as string).split(',') : undefined,
      limit: req.query.limit ? parseInt(req.query.limit as string) : 50,
      offset: req.query.offset ? parseInt(req.query.offset as string) : 0
    };

    const result = await hcpMarketingService.searchHCPs(organizationId, filters);

    res.json({
      hcps: result.hcps,
      total: result.total,
      limit: filters.limit,
      offset: filters.offset
    });
  } catch (error) {
    const err = error as Error;
    logger.error('[HCPRoutes] Failed to search HCPs', error);
    res.status(500).json({ error: { code: 'SEARCH_FAILED', message: err.message } });
  }
});

/**
 * POST /api/v1/hcp/profiles
 * Create new HCP profile
 *
 * Request Body:
 *   - npiNumber?: string
 *   - firstName: string
 *   - lastName: string
 *   - credentials?: string[]
 *   - specialty: Specialty
 *   - subSpecialty?: string[]
 *   - practiceType?: PracticeType
 *   - email?: string
 *   - phone?: string
 *   - isKol: boolean
 *   - kolTier?: string
 *   - engagementScore?: number
 *   - segmentIds?: string[]
 *   - tags?: string[]
 */
router.post('/profiles', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const userId = req.org?.user.id || req.user?.id;

    if (!organizationId || !userId) {
      return res.status(403).json({ error: { code: 'NO_ORGANIZATION', message: 'Organization required' } });
    }

    const profile = req.body;

    // Validate required fields
    if (!profile.firstName || !profile.lastName || !profile.specialty) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'firstName, lastName, and specialty are required' }
      });
    }

    const hcp = await hcpMarketingService.createHCPProfile(organizationId, profile, userId);

    auditLogger.info('HCP profile created', {
      organizationId,
      userId,
      hcpId: hcp.id,
      specialty: hcp.specialty
    });

    res.status(201).json({ hcp });
  } catch (error) {
    const err = error as Error;
    logger.error('[HCPRoutes] Failed to create HCP profile', error);
    res.status(500).json({ error: { code: 'CREATE_FAILED', message: err.message } });
  }
});

/**
 * GET /api/v1/hcp/profiles/:id
 * Get HCP profile by ID
 */
router.get('/profiles/:id', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const { id } = req.params;

    const result = await pool.query(
      'SELECT * FROM hcp_profiles WHERE id = $1 AND organization_id = $2',
      [id, organizationId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'HCP profile not found' } });
    }

    res.json({ hcp: result.rows[0] });
  } catch (error) {
    const err = error as Error;
    logger.error('[HCPRoutes] Failed to get HCP profile', error);
    res.status(500).json({ error: { code: 'GET_FAILED', message: err.message } });
  }
});

/**
 * PUT /api/v1/hcp/profiles/:id
 * Update HCP profile
 */
router.put('/profiles/:id', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const { id } = req.params;
    const updates = req.body;

    const result = await pool.query(`
      UPDATE hcp_profiles
      SET
        first_name = COALESCE($1, first_name),
        last_name = COALESCE($2, last_name),
        specialty = COALESCE($3, specialty),
        email = COALESCE($4, email),
        phone = COALESCE($5, phone),
        is_kol = COALESCE($6, is_kol),
        kol_tier = COALESCE($7, kol_tier),
        tags = COALESCE($8, tags),
        updated_at = NOW()
      WHERE id = $9 AND organization_id = $10
      RETURNING *
    `, [
      updates.firstName,
      updates.lastName,
      updates.specialty,
      updates.email,
      updates.phone,
      updates.isKol,
      updates.kolTier,
      updates.tags,
      id,
      organizationId
    ]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'HCP profile not found' } });
    }

    res.json({ hcp: result.rows[0] });
  } catch (error) {
    const err = error as Error;
    logger.error('[HCPRoutes] Failed to update HCP profile', error);
    res.status(500).json({ error: { code: 'UPDATE_FAILED', message: err.message } });
  }
});

/**
 * DELETE /api/v1/hcp/profiles/:id
 * Delete HCP profile
 */
router.delete('/profiles/:id', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const { id } = req.params;

    const result = await pool.query(
      'DELETE FROM hcp_profiles WHERE id = $1 AND organization_id = $2 RETURNING id',
      [id, organizationId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'HCP profile not found' } });
    }

    res.json({ success: true, id });
  } catch (error) {
    const err = error as Error;
    logger.error('[HCPRoutes] Failed to delete HCP profile', error);
    res.status(500).json({ error: { code: 'DELETE_FAILED', message: err.message } });
  }
});

// ============================================================================
// SEGMENTATION ENDPOINTS
// ============================================================================

/**
 * GET /api/v1/hcp/segments
 * List HCP segments
 */
router.get('/segments', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const status = req.query.status as string | undefined;

    let query = 'SELECT * FROM hcp_segments WHERE organization_id = $1';
    const params: any[] = [organizationId];

    if (status) {
      query += ' AND status = $2';
      params.push(status);
    }

    query += ' ORDER BY created_at DESC';

    const result = await pool.query(query, params);

    res.json({ segments: result.rows });
  } catch (error) {
    const err = error as Error;
    logger.error('[HCPRoutes] Failed to get segments', error);
    res.status(500).json({ error: { code: 'GET_FAILED', message: err.message } });
  }
});

/**
 * POST /api/v1/hcp/segments
 * Create HCP segment
 *
 * Request Body:
 *   - name: string
 *   - description?: string
 *   - segmentType: string
 *   - criteria: object
 *   - specialtyFilters?: string[]
 *   - geographicFilters?: object
 *   - behavioralFilters?: object
 */
router.post('/segments', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const userId = req.org?.user.id || req.user?.id;

    if (!organizationId || !userId) {
      return res.status(403).json({ error: { code: 'NO_ORGANIZATION', message: 'Organization required' } });
    }

    const segment = req.body;

    if (!segment.name || !segment.segmentType || !segment.criteria) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'name, segmentType, and criteria are required' }
      });
    }

    const result = await hcpMarketingService.createSegment(organizationId, segment, userId);

    res.status(201).json({ segment: result });
  } catch (error) {
    const err = error as Error;
    logger.error('[HCPRoutes] Failed to create segment', error);
    res.status(500).json({ error: { code: 'CREATE_FAILED', message: err.message } });
  }
});

// ============================================================================
// CONTENT GENERATION ENDPOINTS
// ============================================================================

/**
 * POST /api/v1/hcp/content/generate
 * Generate medical content with MLR validation
 *
 * Request Body:
 *   - contentType: ContentType
 *   - therapeuticArea: string
 *   - productName?: string
 *   - productId?: string
 *   - indication?: string
 *   - targetSpecialties: Specialty[]
 *   - keyMessages: string[]
 *   - clinicalDataPoints?: object
 *   - efficacyData?: object
 *   - safetyData?: object
 *   - references?: string[]
 *   - industryType?: IndustryType (default 'pharma')
 */
router.post('/content/generate', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const userId = req.org?.user.id || req.user?.id;

    if (!organizationId || !userId) {
      return res.status(403).json({ error: { code: 'NO_ORGANIZATION', message: 'Organization required' } });
    }

    const input: ContentGenerationInput = req.body;

    // Validate required fields
    if (!input.contentType || !input.therapeuticArea || !input.targetSpecialties || !input.keyMessages) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'contentType, therapeuticArea, targetSpecialties, and keyMessages are required' }
      });
    }

    const industryType = (req.body.industryType as IndustryType) || 'pharma';

    const result = await hcpMarketingService.generateContent(
      organizationId,
      input,
      userId,
      industryType
    );

    auditLogger.info('HCP content generated', {
      organizationId,
      userId,
      contentId: result.content.id,
      contentType: input.contentType,
      mlrStatus: result.content.mlrStatus,
      mlrPassed: result.mlrValidation.passes
    });

    res.status(201).json({
      content: result.content,
      mlrValidation: result.mlrValidation
    });
  } catch (error) {
    const err = error as Error;
    logger.error('[HCPRoutes] Failed to generate content', error);
    res.status(500).json({ error: { code: 'GENERATION_FAILED', message: err.message } });
  }
});

/**
 * POST /api/v1/hcp/content/detailing-aid
 * Generate detailing aid for sales reps
 */
router.post('/content/detailing-aid', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const userId = req.org?.user.id || req.user?.id;

    if (!organizationId || !userId) {
      return res.status(403).json({ error: { code: 'NO_ORGANIZATION', message: 'Organization required' } });
    }

    const input: DetailingAidInput = req.body;

    const result = await hcpMarketingService.generateDetailingAid(organizationId, input, userId);

    res.status(201).json({
      content: result.content,
      mlrValidation: result.mlrValidation
    });
  } catch (error) {
    const err = error as Error;
    logger.error('[HCPRoutes] Failed to generate detailing aid', error);
    res.status(500).json({ error: { code: 'GENERATION_FAILED', message: err.message } });
  }
});

/**
 * POST /api/v1/hcp/content/speaker-deck
 * Generate speaker program deck
 */
router.post('/content/speaker-deck', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const userId = req.org?.user.id || req.user?.id;

    if (!organizationId || !userId) {
      return res.status(403).json({ error: { code: 'NO_ORGANIZATION', message: 'Organization required' } });
    }

    const input: SpeakerDeckInput = req.body;

    if (!input.speakerName || !input.speakerCredentials) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'speakerName and speakerCredentials are required' }
      });
    }

    const result = await hcpMarketingService.generateSpeakerDeck(organizationId, input, userId);

    res.status(201).json({
      content: result.content,
      mlrValidation: result.mlrValidation
    });
  } catch (error) {
    const err = error as Error;
    logger.error('[HCPRoutes] Failed to generate speaker deck', error);
    res.status(500).json({ error: { code: 'GENERATION_FAILED', message: err.message } });
  }
});

/**
 * POST /api/v1/hcp/content/congress-material
 * Generate congress/symposium materials
 */
router.post('/content/congress-material', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const userId = req.org?.user.id || req.user?.id;

    if (!organizationId || !userId) {
      return res.status(403).json({ error: { code: 'NO_ORGANIZATION', message: 'Organization required' } });
    }

    const input: CongressMaterialInput = req.body;

    if (!input.congressName || !input.materialTypes) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'congressName and materialTypes are required' }
      });
    }

    const result = await hcpMarketingService.generateCongressMaterial(organizationId, input, userId);

    res.status(201).json({
      content: result.content,
      mlrValidation: result.mlrValidation
    });
  } catch (error) {
    const err = error as Error;
    logger.error('[HCPRoutes] Failed to generate congress material', error);
    res.status(500).json({ error: { code: 'GENERATION_FAILED', message: err.message } });
  }
});

/**
 * GET /api/v1/hcp/content
 * List medical content
 */
router.get('/content', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const contentType = req.query.contentType as ContentType | undefined;
    const mlrStatus = req.query.mlrStatus as string | undefined;
    const therapeuticArea = req.query.therapeuticArea as string | undefined;

    let query = 'SELECT * FROM medical_content WHERE organization_id = $1';
    const params: any[] = [organizationId];
    let paramIndex = 2;

    if (contentType) {
      query += ` AND content_type = $${paramIndex}`;
      params.push(contentType);
      paramIndex++;
    }

    if (mlrStatus) {
      query += ` AND mlr_status = $${paramIndex}`;
      params.push(mlrStatus);
      paramIndex++;
    }

    if (therapeuticArea) {
      query += ` AND therapeutic_area = $${paramIndex}`;
      params.push(therapeuticArea);
      paramIndex++;
    }

    query += ' ORDER BY created_at DESC LIMIT 100';

    const result = await pool.query(query, params);

    res.json({ content: result.rows });
  } catch (error) {
    const err = error as Error;
    logger.error('[HCPRoutes] Failed to get content', error);
    res.status(500).json({ error: { code: 'GET_FAILED', message: err.message } });
  }
});

/**
 * GET /api/v1/hcp/content/:id
 * Get medical content by ID
 */
router.get('/content/:id', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const { id } = req.params;

    const result = await pool.query(
      'SELECT * FROM medical_content WHERE id = $1 AND organization_id = $2',
      [id, organizationId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Content not found' } });
    }

    res.json({ content: result.rows[0] });
  } catch (error) {
    const err = error as Error;
    logger.error('[HCPRoutes] Failed to get content', error);
    res.status(500).json({ error: { code: 'GET_FAILED', message: err.message } });
  }
});

// ============================================================================
// SPEAKER PROGRAM ENDPOINTS
// ============================================================================

/**
 * POST /api/v1/hcp/speaker-programs
 * Create speaker program
 *
 * Request Body:
 *   - programName: string
 *   - programType: ProgramType
 *   - speakerHcpId: string
 *   - eventDate: Date
 *   - presentationTitle: string
 *   - therapeuticArea?: string
 *   - productFocus?: string
 *   - targetAttendees: number
 *   - venueName?: string
 *   - venueType?: string
 *   - totalBudget?: number
 *   - mlrJobCode?: string
 */
router.post('/speaker-programs', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const userId = req.org?.user.id || req.user?.id;

    if (!organizationId || !userId) {
      return res.status(403).json({ error: { code: 'NO_ORGANIZATION', message: 'Organization required' } });
    }

    const program = req.body;

    // Validate required fields
    if (!program.programName || !program.programType || !program.speakerHcpId ||
        !program.eventDate || !program.presentationTitle || !program.targetAttendees) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'Missing required fields' }
      });
    }

    const result = await hcpMarketingService.createSpeakerProgram(organizationId, program, userId);

    auditLogger.info('Speaker program created', {
      organizationId,
      userId,
      programId: result.id,
      programType: result.programType
    });

    res.status(201).json({ program: result });
  } catch (error) {
    const err = error as Error;
    logger.error('[HCPRoutes] Failed to create speaker program', error);
    res.status(500).json({ error: { code: 'CREATE_FAILED', message: err.message } });
  }
});

/**
 * GET /api/v1/hcp/speaker-programs
 * List speaker programs
 */
router.get('/speaker-programs', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    if (!organizationId) {
      return res.status(403).json({ error: { code: 'NO_ORGANIZATION', message: 'Organization required' } });
    }

    const filters = {
      status: req.query.status as string | undefined,
      speakerHcpId: req.query.speakerHcpId as string | undefined,
      therapeuticArea: req.query.therapeuticArea as string | undefined,
      dateFrom: req.query.dateFrom ? new Date(req.query.dateFrom as string) : undefined,
      dateTo: req.query.dateTo ? new Date(req.query.dateTo as string) : undefined,
      limit: req.query.limit ? parseInt(req.query.limit as string) : 50,
      offset: req.query.offset ? parseInt(req.query.offset as string) : 0
    };

    const result = await hcpMarketingService.getSpeakerPrograms(organizationId, filters);

    res.json({
      programs: result.programs,
      total: result.total
    });
  } catch (error) {
    const err = error as Error;
    logger.error('[HCPRoutes] Failed to get speaker programs', error);
    res.status(500).json({ error: { code: 'GET_FAILED', message: err.message } });
  }
});

/**
 * GET /api/v1/hcp/speaker-programs/:id
 * Get speaker program by ID
 */
router.get('/speaker-programs/:id', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const { id } = req.params;

    const result = await pool.query(
      'SELECT * FROM speaker_programs WHERE id = $1 AND organization_id = $2',
      [id, organizationId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Speaker program not found' } });
    }

    res.json({ program: result.rows[0] });
  } catch (error) {
    const err = error as Error;
    logger.error('[HCPRoutes] Failed to get speaker program', error);
    res.status(500).json({ error: { code: 'GET_FAILED', message: err.message } });
  }
});

// ============================================================================
// ENGAGEMENT TRACKING ENDPOINTS
// ============================================================================

/**
 * POST /api/v1/hcp/engagements
 * Track HCP engagement
 *
 * Request Body:
 *   - hcpId: string
 *   - engagementType: EngagementType
 *   - contentId?: string
 *   - contentType?: string
 *   - contentTitle?: string
 *   - campaignId?: string
 *   - channel?: string
 *   - repId?: string
 *   - durationSeconds?: number
 *   - interactionNotes?: string
 *   - sampleProvided?: boolean
 *   - sampleProduct?: string
 *   - prescribingIntent?: string
 */
router.post('/engagements', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);

    if (!organizationId) {
      return res.status(403).json({ error: { code: 'NO_ORGANIZATION', message: 'Organization required' } });
    }

    const engagement = req.body;

    if (!engagement.hcpId || !engagement.engagementType) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'hcpId and engagementType are required' }
      });
    }

    const engagementId = await hcpMarketingService.trackEngagement(organizationId, engagement);

    res.status(201).json({ engagementId });
  } catch (error) {
    const err = error as Error;
    logger.error('[HCPRoutes] Failed to track engagement', error);
    res.status(500).json({ error: { code: 'TRACKING_FAILED', message: err.message } });
  }
});

/**
 * GET /api/v1/hcp/engagements/:hcpId
 * Get engagement history for HCP
 */
router.get('/engagements/:hcpId', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    if (!organizationId) {
      return res.status(403).json({ error: { code: 'NO_ORGANIZATION', message: 'Organization required' } });
    }

    const { hcpId } = req.params;

    const options = {
      limit: req.query.limit ? parseInt(req.query.limit as string) : 50,
      offset: req.query.offset ? parseInt(req.query.offset as string) : 0,
      engagementType: req.query.engagementType as EngagementType | undefined
    };

    const result = await hcpMarketingService.getEngagementHistory(organizationId, hcpId, options);

    res.json({
      engagements: result.engagements,
      total: result.total
    });
  } catch (error) {
    const err = error as Error;
    logger.error('[HCPRoutes] Failed to get engagement history', error);
    res.status(500).json({ error: { code: 'GET_FAILED', message: err.message } });
  }
});

// Export router
export const hcpRoutes = router;
