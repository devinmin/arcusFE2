/**
 * Patient Journey API Routes
 *
 * Patient journey mapping and DTC healthcare content generation endpoints.
 * Provides comprehensive patient-facing content, educational materials,
 * caregiver support, and journey visualization for healthcare marketing.
 *
 * Base URL: /api/v1/patient
 *
 * Features:
 * - Patient journey management by condition
 * - Patient content generation (ISI compliant)
 * - Educational material creation
 * - Caregiver support content
 * - Symptom checker generation
 * - Treatment journey visualization
 * - Patient resource management
 */

import { Router, Request, Response } from 'express';
import { pool } from '../database/db.js';
import { requireAuth } from '../middleware/auth.js';
import { requireOrganization, getOrganizationId } from '../middleware/multiTenancy.js';
import { logger } from '../utils/logger.js';
import {
  patientJourneyService,
  JourneyType,
  ContentType,
  CaregiverContentType,
  ResourceType,
  CreateJourneyInput,
  CreateConditionInput,
  GeneratePatientContentInput,
  GenerateCaregiverContentInput,
  CreateResourceInput
} from '../services/patientJourneyService.js';

const router = Router();

// ============================================================================
// JOURNEY MANAGEMENT ENDPOINTS
// ============================================================================

/**
 * GET /api/v1/patient/journeys/:conditionId
 * Get patient journeys for a specific condition
 *
 * Query Parameters:
 *   - journeyType?: JourneyType - Filter by journey type
 *
 * Response:
 *   - journeys: PatientJourney[]
 */
router.get('/journeys/:conditionId', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const { conditionId } = req.params;
    const { journeyType } = req.query;

    if (!organizationId) {
      return res.status(403).json({
        error: { code: 'NO_ORGANIZATION', message: 'Organization context required' }
      });
    }

    const journeys = await patientJourneyService.getJourneyByCondition(
      organizationId,
      conditionId,
      journeyType as JourneyType | undefined
    );

    res.json({ journeys });
  } catch (error: any) {
    logger.error('Failed to fetch patient journeys', { error: error.message });
    res.status(500).json({
      error: { code: 'JOURNEY_FETCH_FAILED', message: error.message }
    });
  }
});

/**
 * POST /api/v1/patient/journeys
 * Create a new patient journey
 *
 * Request Body:
 *   - conditionId: string
 *   - journeyName: string
 *   - journeyType: JourneyType
 *   - stages: JourneyStage[]
 *   - durationEstimateDays?: number
 *   - complexityScore?: number
 *   - therapeuticArea?: string
 *   - icd10Codes?: string[]
 *   - treatmentModalities?: string[]
 *   - diseaseSeverity?: string
 *
 * Response:
 *   - journey: PatientJourney
 */
router.post('/journeys', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const userId = req.org?.user.id || req.user?.id;

    if (!organizationId || !userId) {
      return res.status(403).json({
        error: { code: 'NO_ORGANIZATION', message: 'Organization context required' }
      });
    }

    const input: CreateJourneyInput = req.body;

    // Validate required fields
    if (!input.conditionId || !input.journeyName || !input.journeyType || !input.stages) {
      return res.status(400).json({
        error: { code: 'MISSING_FIELDS', message: 'conditionId, journeyName, journeyType, and stages are required' }
      });
    }

    const journey = await patientJourneyService.createJourney(organizationId, userId, input);

    res.status(201).json({ journey });
  } catch (error: any) {
    logger.error('Failed to create patient journey', { error: error.message });
    res.status(500).json({
      error: { code: 'JOURNEY_CREATION_FAILED', message: error.message }
    });
  }
});

/**
 * GET /api/v1/patient/journeys/:conditionId/visualize
 * Visualize treatment journey with timeline and milestones
 *
 * Query Parameters:
 *   - journeyType: JourneyType - The type of journey to visualize
 *
 * Response:
 *   - visualization: object with journey stages, timeline, sentiment, and resources
 */
router.get('/journeys/:conditionId/visualize', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const { conditionId } = req.params;
    const { journeyType } = req.query;

    if (!organizationId) {
      return res.status(403).json({
        error: { code: 'NO_ORGANIZATION', message: 'Organization context required' }
      });
    }

    if (!journeyType) {
      return res.status(400).json({
        error: { code: 'MISSING_JOURNEY_TYPE', message: 'journeyType query parameter is required' }
      });
    }

    const visualization = await patientJourneyService.visualizeTreatmentJourney(
      organizationId,
      conditionId,
      journeyType as JourneyType
    );

    res.json({ visualization });
  } catch (error: any) {
    logger.error('Failed to visualize treatment journey', { error: error.message });
    res.status(500).json({
      error: { code: 'VISUALIZATION_FAILED', message: error.message }
    });
  }
});

// ============================================================================
// CONDITION PROFILE ENDPOINTS
// ============================================================================

/**
 * POST /api/v1/patient/conditions
 * Create a new condition profile
 *
 * Request Body:
 *   - conditionName: string
 *   - conditionCategory: ConditionCategory
 *   - icd10Codes: string[]
 *   - description: string
 *   - symptoms: Array<{name, frequency, severity}>
 *   - treatmentOptions?: any[]
 *   - alternativeNames?: string[]
 *
 * Response:
 *   - condition: ConditionProfile
 */
router.post('/conditions', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const userId = req.org?.user.id || req.user?.id;

    if (!organizationId || !userId) {
      return res.status(403).json({
        error: { code: 'NO_ORGANIZATION', message: 'Organization context required' }
      });
    }

    const input: CreateConditionInput = req.body;

    // Validate required fields
    if (!input.conditionName || !input.conditionCategory || !input.icd10Codes || !input.description || !input.symptoms) {
      return res.status(400).json({
        error: { code: 'MISSING_FIELDS', message: 'conditionName, conditionCategory, icd10Codes, description, and symptoms are required' }
      });
    }

    const condition = await patientJourneyService.createConditionProfile(organizationId, userId, input);

    res.status(201).json({ condition });
  } catch (error: any) {
    logger.error('Failed to create condition profile', { error: error.message });
    res.status(500).json({
      error: { code: 'CONDITION_CREATION_FAILED', message: error.message }
    });
  }
});

/**
 * GET /api/v1/patient/conditions/:conditionId
 * Get condition profile by ID
 *
 * Response:
 *   - condition: ConditionProfile
 */
router.get('/conditions/:conditionId', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const { conditionId } = req.params;

    if (!organizationId) {
      return res.status(403).json({
        error: { code: 'NO_ORGANIZATION', message: 'Organization context required' }
      });
    }

    const condition = await patientJourneyService.getConditionProfile(organizationId, conditionId);

    if (!condition) {
      return res.status(404).json({
        error: { code: 'CONDITION_NOT_FOUND', message: 'Condition profile not found' }
      });
    }

    res.json({ condition });
  } catch (error: any) {
    logger.error('Failed to fetch condition profile', { error: error.message });
    res.status(500).json({
      error: { code: 'CONDITION_FETCH_FAILED', message: error.message }
    });
  }
});

/**
 * GET /api/v1/patient/conditions
 * Search condition profiles
 *
 * Query Parameters:
 *   - q: string - Search query
 *
 * Response:
 *   - conditions: ConditionProfile[]
 */
router.get('/conditions', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const { q } = req.query;

    if (!organizationId) {
      return res.status(403).json({
        error: { code: 'NO_ORGANIZATION', message: 'Organization context required' }
      });
    }

    if (!q || typeof q !== 'string') {
      return res.status(400).json({
        error: { code: 'MISSING_QUERY', message: 'Query parameter "q" is required' }
      });
    }

    const conditions = await patientJourneyService.searchConditions(organizationId, q);

    res.json({ conditions });
  } catch (error: any) {
    logger.error('Failed to search conditions', { error: error.message });
    res.status(500).json({
      error: { code: 'CONDITION_SEARCH_FAILED', message: error.message }
    });
  }
});

// ============================================================================
// PATIENT CONTENT GENERATION ENDPOINTS
// ============================================================================

/**
 * POST /api/v1/patient/content/generate
 * Generate patient-facing content with MLR compliance
 *
 * Request Body:
 *   - conditionId: string
 *   - contentType: ContentType
 *   - journeyStage?: string
 *   - targetAudience: TargetAudience
 *   - includeIsi?: boolean
 *   - therapeuticArea?: string
 *   - readingLevel?: string
 *   - language?: string
 *   - tone?: string
 *   - additionalContext?: string
 *
 * Response:
 *   - content: PatientContent
 */
router.post('/content/generate', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const userId = req.org?.user.id || req.user?.id;

    if (!organizationId || !userId) {
      return res.status(403).json({
        error: { code: 'NO_ORGANIZATION', message: 'Organization context required' }
      });
    }

    const input: GeneratePatientContentInput = req.body;

    // Validate required fields
    if (!input.conditionId || !input.contentType || !input.targetAudience) {
      return res.status(400).json({
        error: { code: 'MISSING_FIELDS', message: 'conditionId, contentType, and targetAudience are required' }
      });
    }

    const content = await patientJourneyService.generatePatientContent(organizationId, userId, input);

    res.status(201).json({ content });
  } catch (error: any) {
    logger.error('Failed to generate patient content', { error: error.message });
    res.status(500).json({
      error: { code: 'CONTENT_GENERATION_FAILED', message: error.message }
    });
  }
});

/**
 * POST /api/v1/patient/content/symptom-checker
 * Generate symptom checker content
 *
 * Request Body:
 *   - conditionId: string
 *
 * Response:
 *   - content: PatientContent (with JSON format symptom checker)
 */
router.post('/content/symptom-checker', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const userId = req.org?.user.id || req.user?.id;
    const { conditionId } = req.body;

    if (!organizationId || !userId) {
      return res.status(403).json({
        error: { code: 'NO_ORGANIZATION', message: 'Organization context required' }
      });
    }

    if (!conditionId) {
      return res.status(400).json({
        error: { code: 'MISSING_CONDITION_ID', message: 'conditionId is required' }
      });
    }

    const content = await patientJourneyService.generateSymptomChecker(organizationId, userId, conditionId);

    res.status(201).json({ content });
  } catch (error: any) {
    logger.error('Failed to generate symptom checker', { error: error.message });
    res.status(500).json({
      error: { code: 'SYMPTOM_CHECKER_FAILED', message: error.message }
    });
  }
});

/**
 * GET /api/v1/patient/content/journey-stage/:conditionId/:stage
 * Get patient content for a specific journey stage
 *
 * Response:
 *   - content: PatientContent[]
 */
router.get('/content/journey-stage/:conditionId/:stage', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const { conditionId, stage } = req.params;

    if (!organizationId) {
      return res.status(403).json({
        error: { code: 'NO_ORGANIZATION', message: 'Organization context required' }
      });
    }

    const content = await patientJourneyService.getContentByJourneyStage(organizationId, conditionId, stage);

    res.json({ content });
  } catch (error: any) {
    logger.error('Failed to fetch content by journey stage', { error: error.message });
    res.status(500).json({
      error: { code: 'CONTENT_FETCH_FAILED', message: error.message }
    });
  }
});

// ============================================================================
// CAREGIVER CONTENT ENDPOINTS
// ============================================================================

/**
 * POST /api/v1/patient/caregiver-content
 * Generate caregiver support content
 *
 * Request Body:
 *   - conditionId: string
 *   - contentType: CaregiverContentType
 *   - caregiverRelationship?: string
 *   - careIntensity?: string
 *   - emotionalThemes?: string[]
 *   - additionalContext?: string
 *
 * Response:
 *   - content: CaregiverContent
 */
router.post('/caregiver-content', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const userId = req.org?.user.id || req.user?.id;

    if (!organizationId || !userId) {
      return res.status(403).json({
        error: { code: 'NO_ORGANIZATION', message: 'Organization context required' }
      });
    }

    const input: GenerateCaregiverContentInput = req.body;

    // Validate required fields
    if (!input.conditionId || !input.contentType) {
      return res.status(400).json({
        error: { code: 'MISSING_FIELDS', message: 'conditionId and contentType are required' }
      });
    }

    const content = await patientJourneyService.generateCaregiverContent(organizationId, userId, input);

    res.status(201).json({ content });
  } catch (error: any) {
    logger.error('Failed to generate caregiver content', { error: error.message });
    res.status(500).json({
      error: { code: 'CAREGIVER_CONTENT_FAILED', message: error.message }
    });
  }
});

/**
 * GET /api/v1/patient/caregiver-content/:conditionId
 * Get caregiver content for a specific condition
 *
 * Query Parameters:
 *   - contentType?: CaregiverContentType
 *   - relationship?: string
 *
 * Response:
 *   - content: CaregiverContent[]
 */
router.get('/caregiver-content/:conditionId', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const { conditionId } = req.params;
    const { contentType, relationship } = req.query;

    if (!organizationId) {
      return res.status(403).json({
        error: { code: 'NO_ORGANIZATION', message: 'Organization context required' }
      });
    }

    let query = `
      SELECT * FROM caregiver_content
      WHERE organization_id = $1 AND condition_id = $2 AND status = 'published'
    `;
    const params: any[] = [organizationId, conditionId];

    if (contentType) {
      query += ` AND content_type = $${params.length + 1}`;
      params.push(contentType);
    }

    if (relationship) {
      query += ` AND caregiver_relationship = $${params.length + 1}`;
      params.push(relationship);
    }

    query += ` ORDER BY created_at DESC`;

    const result = await pool.query(query, params);

    res.json({ content: result.rows });
  } catch (error: any) {
    logger.error('Failed to fetch caregiver content', { error: error.message });
    res.status(500).json({
      error: { code: 'CAREGIVER_CONTENT_FETCH_FAILED', message: error.message }
    });
  }
});

// ============================================================================
// PATIENT RESOURCES ENDPOINTS
// ============================================================================

/**
 * GET /api/v1/patient/resources
 * Get patient resources
 *
 * Query Parameters:
 *   - conditionId?: string - Filter by condition
 *   - resourceType?: ResourceType - Filter by resource type
 *   - journeyStage?: string - Filter by journey stage
 *
 * Response:
 *   - resources: PatientResource[]
 */
router.get('/resources', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const { conditionId, resourceType, journeyStage } = req.query;

    if (!organizationId) {
      return res.status(403).json({
        error: { code: 'NO_ORGANIZATION', message: 'Organization context required' }
      });
    }

    if (conditionId && typeof conditionId === 'string') {
      const resources = await patientJourneyService.getResourcesByCondition(organizationId, conditionId);
      return res.json({ resources });
    }

    // Build dynamic query
    let query = `
      SELECT * FROM patient_resources
      WHERE organization_id = $1 AND is_active = true
    `;
    const params: any[] = [organizationId];

    if (resourceType) {
      query += ` AND resource_type = $${params.length + 1}`;
      params.push(resourceType);
    }

    if (journeyStage) {
      query += ` AND $${params.length + 1} = ANY(journey_stages)`;
      params.push(journeyStage);
    }

    query += ` ORDER BY download_count DESC, created_at DESC LIMIT 50`;

    const result = await pool.query(query, params);

    res.json({ resources: result.rows });
  } catch (error: any) {
    logger.error('Failed to fetch patient resources', { error: error.message });
    res.status(500).json({
      error: { code: 'RESOURCES_FETCH_FAILED', message: error.message }
    });
  }
});

/**
 * POST /api/v1/patient/resources
 * Create a patient resource
 *
 * Request Body:
 *   - resourceName: string
 *   - resourceType: ResourceType
 *   - description: string
 *   - resourceUrl: string (S3 URL or external link)
 *   - fileType?: string
 *   - fileSizeKb?: number
 *   - conditionIds?: string[]
 *   - journeyStages?: string[]
 *   - targetAudience?: string
 *   - language?: string
 *
 * Response:
 *   - resource: PatientResource
 */
router.post('/resources', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const userId = req.org?.user.id || req.user?.id;

    if (!organizationId || !userId) {
      return res.status(403).json({
        error: { code: 'NO_ORGANIZATION', message: 'Organization context required' }
      });
    }

    const { resourceUrl, fileType, fileSizeKb, ...input } = req.body;

    // Validate required fields
    if (!input.resourceName || !input.resourceType || !input.description || !resourceUrl) {
      return res.status(400).json({
        error: { code: 'MISSING_FIELDS', message: 'resourceName, resourceType, description, and resourceUrl are required' }
      });
    }

    const resource = await patientJourneyService.createResource(
      organizationId,
      userId,
      input as CreateResourceInput,
      resourceUrl,
      fileType || 'pdf',
      fileSizeKb || 0
    );

    res.status(201).json({ resource });
  } catch (error: any) {
    logger.error('Failed to create patient resource', { error: error.message });
    res.status(500).json({
      error: { code: 'RESOURCE_CREATION_FAILED', message: error.message }
    });
  }
});

/**
 * GET /api/v1/patient/resources/:resourceId
 * Get patient resource by ID
 *
 * Response:
 *   - resource: PatientResource
 */
router.get('/resources/:resourceId', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const { resourceId } = req.params;

    if (!organizationId) {
      return res.status(403).json({
        error: { code: 'NO_ORGANIZATION', message: 'Organization context required' }
      });
    }

    const result = await pool.query(
      'SELECT * FROM patient_resources WHERE id = $1 AND organization_id = $2',
      [resourceId, organizationId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: { code: 'RESOURCE_NOT_FOUND', message: 'Patient resource not found' }
      });
    }

    // Increment download count
    await pool.query(
      'UPDATE patient_resources SET download_count = download_count + 1 WHERE id = $1',
      [resourceId]
    );

    res.json({ resource: result.rows[0] });
  } catch (error: any) {
    logger.error('Failed to fetch patient resource', { error: error.message });
    res.status(500).json({
      error: { code: 'RESOURCE_FETCH_FAILED', message: error.message }
    });
  }
});

// ============================================================================
// EDUCATION MATERIALS ENDPOINT
// ============================================================================

/**
 * POST /api/v1/patient/education-materials
 * Generate comprehensive educational materials package
 *
 * Request Body:
 *   - conditionId: string
 *   - materials: string[] - Types of materials to generate
 *     (e.g., ['educational_article', 'faq', 'lifestyle_tips'])
 *   - targetAudience: TargetAudience
 *   - includeIsi?: boolean
 *
 * Response:
 *   - materials: PatientContent[]
 */
router.post('/education-materials', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const userId = req.org?.user.id || req.user?.id;
    const { conditionId, materials, targetAudience, includeIsi } = req.body;

    if (!organizationId || !userId) {
      return res.status(403).json({
        error: { code: 'NO_ORGANIZATION', message: 'Organization context required' }
      });
    }

    if (!conditionId || !materials || !Array.isArray(materials) || !targetAudience) {
      return res.status(400).json({
        error: { code: 'MISSING_FIELDS', message: 'conditionId, materials array, and targetAudience are required' }
      });
    }

    // Generate all requested materials
    const generatedMaterials = await Promise.all(
      materials.map(contentType =>
        patientJourneyService.generatePatientContent(organizationId, userId, {
          conditionId,
          contentType: contentType as ContentType,
          targetAudience,
          includeIsi: includeIsi || false
        })
      )
    );

    res.status(201).json({ materials: generatedMaterials });
  } catch (error: any) {
    logger.error('Failed to generate education materials', { error: error.message });
    res.status(500).json({
      error: { code: 'EDUCATION_MATERIALS_FAILED', message: error.message }
    });
  }
});

// ============================================================================
// EXPORT ROUTES
// ============================================================================

export const patientJourneyRoutes = router;
