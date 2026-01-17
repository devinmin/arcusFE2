/**
 * ABM (Account-Based Marketing) API Routes
 *
 * Provides endpoints for:
 * - Account management and scoring
 * - Intent signal tracking
 * - Campaign targeting recommendations
 * - Content personalization
 *
 * Phase 2.1 - ABM Engine & Intent Data Service (B2B Critical)
 */

import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { abmEngineService } from '../services/abmEngineService.js';
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
// ABM ACCOUNTS ENDPOINTS
// =============================================================================

/**
 * GET /api/v1/abm/accounts
 * List all ABM target accounts
 */
router.get('/accounts', requireAuth, async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const {
      status,
      tier,
      minScore,
      industry,
      tags,
      page = '1',
      limit = '20',
      sortBy = 'overall_score',
      sortOrder = 'desc',
    } = req.query;

    let query = `
      SELECT id, account_name, domain, website, industry, employee_count, employee_range,
             annual_revenue, revenue_range, headquarters_country, headquarters_city,
             fit_score, engagement_score, intent_score, overall_score, tier, priority,
             icp_match, buying_stage, estimated_close_date, estimated_deal_value,
             status, tags, first_engaged_at, last_engaged_at, created_at, updated_at
      FROM abm_accounts
      WHERE organization_id = $1
    `;
    const params: any[] = [organizationId];
    let paramIndex = 2;

    if (status) {
      query += ` AND status = $${paramIndex}`;
      params.push(status as string);
      paramIndex++;
    }

    if (tier) {
      query += ` AND tier = $${paramIndex}`;
      params.push(tier as string);
      paramIndex++;
    }

    if (minScore) {
      query += ` AND overall_score >= $${paramIndex}`;
      params.push(parseInt(minScore as string, 10));
      paramIndex++;
    }

    if (industry) {
      query += ` AND industry = $${paramIndex}`;
      params.push(industry as string);
      paramIndex++;
    }

    if (tags) {
      query += ` AND tags && $${paramIndex}`;
      params.push((tags as string).split(','));
      paramIndex++;
    }

    // Get total count
    const countQuery = query.replace(/SELECT.*FROM/, 'SELECT COUNT(*) FROM');
    const { rows: countRows } = await pool.query(countQuery, params);
    const total = parseInt(countRows[0].count, 10);

    // Add sorting and pagination
    const validSortBy = ['overall_score', 'intent_score', 'engagement_score', 'created_at', 'account_name'];
    const sortColumn = validSortBy.includes(sortBy as string) ? sortBy : 'overall_score';
    const order = sortOrder === 'asc' ? 'ASC' : 'DESC';
    query += ` ORDER BY ${sortColumn} ${order}`;

    const pageNum = parseInt(page as string, 10);
    const limitNum = Math.min(parseInt(limit as string, 10), 100);
    const offset = (pageNum - 1) * limitNum;

    query += ` LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limitNum, offset);

    const { rows } = await pool.query(query, params);

    res.json({
      success: true,
      data: {
        accounts: rows.map(row => ({
          id: row.id,
          accountName: row.account_name,
          domain: row.domain,
          website: row.website,
          industry: row.industry,
          employeeCount: row.employee_count,
          employeeRange: row.employee_range,
          annualRevenue: row.annual_revenue,
          revenueRange: row.revenue_range,
          headquarters: {
            country: row.headquarters_country,
            city: row.headquarters_city,
          },
          scores: {
            fit: row.fit_score,
            engagement: row.engagement_score,
            intent: row.intent_score,
            overall: row.overall_score,
          },
          tier: row.tier,
          priority: row.priority,
          icpMatch: row.icp_match,
          buyingStage: row.buying_stage,
          estimatedCloseDate: row.estimated_close_date,
          estimatedDealValue: row.estimated_deal_value,
          status: row.status,
          tags: row.tags || [],
          firstEngagedAt: row.first_engaged_at,
          lastEngagedAt: row.last_engaged_at,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        })),
        pagination: {
          total,
          page: pageNum,
          limit: limitNum,
          totalPages: Math.ceil(total / limitNum),
        },
      },
    });
  } catch (error) {
    logger.error('Get ABM accounts error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to retrieve ABM accounts',
      },
    });
  }
});

/**
 * POST /api/v1/abm/accounts
 * Create a new ABM target account
 */
router.post('/accounts', requireAuth, async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const userId = req.user!.id;

    const {
      accountName,
      domain,
      website,
      linkedinUrl,
      industry,
      employeeCount,
      annualRevenue,
      headquarters,
      techStack,
      tags,
    } = req.body;

    if (!accountName) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_ACCOUNT_NAME',
          message: 'Account name is required',
        },
      });
    }

    const { rows } = await pool.query(
      `INSERT INTO abm_accounts (
        organization_id, account_name, domain, website, linkedin_url,
        industry, employee_count, annual_revenue,
        headquarters_country, headquarters_city, headquarters_state,
        tech_stack, tags, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      RETURNING *`,
      [
        organizationId,
        accountName,
        domain || null,
        website || null,
        linkedinUrl || null,
        industry || null,
        employeeCount || null,
        annualRevenue || null,
        headquarters?.country || null,
        headquarters?.city || null,
        headquarters?.state || null,
        techStack || [],
        tags || [],
        userId,
      ]
    );

    res.status(201).json({
      success: true,
      data: {
        id: rows[0].id,
        accountName: rows[0].account_name,
        domain: rows[0].domain,
        status: rows[0].status,
        createdAt: rows[0].created_at,
      },
    });
  } catch (error) {
    logger.error('Create ABM account error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to create ABM account',
      },
    });
  }
});

/**
 * GET /api/v1/abm/accounts/:id
 * Get a specific ABM account with full details
 */
router.get('/accounts/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const { id } = req.params;

    const { rows } = await pool.query(
      `SELECT * FROM abm_accounts WHERE id = $1 AND organization_id = $2`,
      [id, organizationId]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Account not found',
        },
      });
    }

    // Get buying committee
    const { rows: contacts } = await pool.query(
      `SELECT id, email, first_name, last_name, job_title, job_level, department,
              buying_role, influence_level, engagement_score, status
       FROM abm_contacts
       WHERE account_id = $1 AND organization_id = $2`,
      [id, organizationId]
    );

    // Get recent intent signals
    const { rows: signals } = await pool.query(
      `SELECT id, signal_type, signal_source, signal_title, signal_strength,
              topic, intent_topics, detected_at
       FROM abm_intent_signals
       WHERE account_id = $1 AND organization_id = $2
         AND detected_at > NOW() - INTERVAL '30 days'
       ORDER BY detected_at DESC
       LIMIT 10`,
      [id, organizationId]
    );

    const account = rows[0];

    res.json({
      success: true,
      data: {
        id: account.id,
        accountName: account.account_name,
        domain: account.domain,
        website: account.website,
        linkedinUrl: account.linkedin_url,
        firmographics: {
          industry: account.industry,
          employeeCount: account.employee_count,
          employeeRange: account.employee_range,
          annualRevenue: account.annual_revenue,
          revenueRange: account.revenue_range,
          headquarters: {
            country: account.headquarters_country,
            city: account.headquarters_city,
            state: account.headquarters_state,
          },
        },
        techStack: account.tech_stack || [],
        techCategories: account.tech_categories || [],
        scores: {
          fit: account.fit_score,
          engagement: account.engagement_score,
          intent: account.intent_score,
          overall: account.overall_score,
        },
        tier: account.tier,
        priority: account.priority,
        icp: {
          match: account.icp_match,
          criteriaMet: account.icp_criteria_met || [],
          criteriaMissing: account.icp_criteria_missing || [],
        },
        buyingStage: account.buying_stage,
        estimatedCloseDate: account.estimated_close_date,
        estimatedDealValue: account.estimated_deal_value,
        engagement: {
          firstEngagedAt: account.first_engaged_at,
          lastEngagedAt: account.last_engaged_at,
          totalTouchpoints: account.total_touchpoints,
          totalContentViews: account.total_content_views,
          totalWebsiteVisits: account.total_website_visits,
        },
        buyingCommittee: {
          decisionMakers: account.decision_maker_count,
          influencers: account.influencer_count,
          championIdentified: account.champion_identified,
          contacts: contacts.map(c => ({
            id: c.id,
            email: c.email,
            name: `${c.first_name || ''} ${c.last_name || ''}`.trim(),
            jobTitle: c.job_title,
            jobLevel: c.job_level,
            department: c.department,
            buyingRole: c.buying_role,
            influenceLevel: c.influence_level,
            engagementScore: c.engagement_score,
            status: c.status,
          })),
        },
        recentIntentSignals: signals.map(s => ({
          id: s.id,
          type: s.signal_type,
          source: s.signal_source,
          title: s.signal_title,
          strength: s.signal_strength,
          topic: s.topic,
          intentTopics: s.intent_topics || [],
          detectedAt: s.detected_at,
        })),
        status: account.status,
        tags: account.tags || [],
        notes: account.notes,
        createdAt: account.created_at,
        updatedAt: account.updated_at,
      },
    });
  } catch (error) {
    logger.error('Get ABM account error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to retrieve account',
      },
    });
  }
});

// =============================================================================
// INTENT SIGNALS ENDPOINTS
// =============================================================================

/**
 * GET /api/v1/abm/intent-signals
 * List intent signals with filtering
 */
router.get('/intent-signals', requireAuth, async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const {
      accountId,
      signalType,
      signalSource,
      minStrength,
      days = '30',
      page = '1',
      limit = '50',
    } = req.query;

    let query = `
      SELECT s.*, a.account_name
      FROM abm_intent_signals s
      LEFT JOIN abm_accounts a ON s.account_id = a.id
      WHERE s.organization_id = $1
        AND s.detected_at > NOW() - INTERVAL '${parseInt(days as string, 10)} days'
    `;
    const params: (string | number)[] = [organizationId];
    let paramIndex = 2;

    if (accountId) {
      query += ` AND s.account_id = $${paramIndex}`;
      params.push(accountId as string);
      paramIndex++;
    }

    if (signalType) {
      query += ` AND s.signal_type = $${paramIndex}`;
      params.push(signalType as string);
      paramIndex++;
    }

    if (signalSource) {
      query += ` AND s.signal_source = $${paramIndex}`;
      params.push(signalSource as string);
      paramIndex++;
    }

    if (minStrength) {
      query += ` AND s.signal_strength >= $${paramIndex}`;
      params.push(parseInt(minStrength as string, 10));
      paramIndex++;
    }

    query += ` ORDER BY s.detected_at DESC`;

    const pageNum = parseInt(page as string, 10);
    const limitNum = Math.min(parseInt(limit as string, 10), 100);
    const offset = (pageNum - 1) * limitNum;

    query += ` LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limitNum, offset);

    const { rows } = await pool.query(query, params);

    res.json({
      success: true,
      data: {
        signals: rows.map(row => ({
          id: row.id,
          accountId: row.account_id,
          accountName: row.account_name,
          signalType: row.signal_type,
          signalSource: row.signal_source,
          signalTitle: row.signal_title,
          signalDescription: row.signal_description,
          signalStrength: row.signal_strength,
          topic: row.topic,
          keywords: row.keywords || [],
          intentTopics: row.intent_topics || [],
          surgeScore: row.surge_score,
          consumptionScore: row.consumption_score,
          detectedAt: row.detected_at,
          processed: row.processed,
        })),
      },
    });
  } catch (error) {
    logger.error('Get intent signals error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to retrieve intent signals',
      },
    });
  }
});

/**
 * POST /api/v1/abm/intent-signals
 * Record a new intent signal
 */
router.post('/intent-signals', requireAuth, async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);

    const {
      accountId,
      contactId,
      signalType,
      signalSource,
      signalTitle,
      signalDescription,
      signalStrength,
      topic,
      keywords,
      intentTopics,
      metadata,
    } = req.body;

    if (!signalType || !signalSource || !signalTitle || signalStrength === undefined) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_FIELDS',
          message: 'signalType, signalSource, signalTitle, and signalStrength are required',
        },
      });
    }

    const signal = await abmEngineService.recordIntentSignal(organizationId, {
      accountId,
      contactId,
      signalType,
      signalSource,
      signalTitle,
      signalDescription,
      signalStrength,
      topic,
      keywords,
      intentTopics,
      metadata,
    });

    res.status(201).json({
      success: true,
      data: signal,
    });
  } catch (error) {
    logger.error('Record intent signal error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to record intent signal',
      },
    });
  }
});

// =============================================================================
// SCORING ENDPOINTS
// =============================================================================

/**
 * POST /api/v1/abm/score-account
 * Calculate comprehensive account score
 */
router.post('/score-account', requireAuth, async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const { accountId, firmographicData, behavioralData } = req.body;

    if (!accountId) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_ACCOUNT_ID',
          message: 'Account ID is required',
        },
      });
    }

    // Get intent signals for the account
    const intentSignals = await abmEngineService.aggregateIntentSignals(accountId, organizationId);

    // Calculate score
    const result = await abmEngineService.scoreAccount({
      accountId,
      organizationId,
      firmographicData,
      behavioralData,
      intentSignals,
    });

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    logger.error('Score account error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to score account',
      },
    });
  }
});

// =============================================================================
// PERSONALIZATION ENDPOINTS
// =============================================================================

/**
 * POST /api/v1/abm/personalize-content
 * Generate personalized content for an account or contact
 */
router.post('/personalize-content', requireAuth, async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);

    const {
      accountId,
      contactId,
      contentType,
      deliverableId,
      personalizationFields,
    } = req.body;

    if (!accountId || !contentType || !personalizationFields) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_FIELDS',
          message: 'accountId, contentType, and personalizationFields are required',
        },
      });
    }

    const result = await abmEngineService.personalizeContent(organizationId, {
      accountId,
      contactId,
      contentType,
      deliverableId,
      personalizationFields,
    });

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    logger.error('Personalize content error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to personalize content',
      },
    });
  }
});

// =============================================================================
// CAMPAIGN TARGETING ENDPOINTS
// =============================================================================

/**
 * GET /api/v1/abm/targeting-recommendations
 * Get account targeting recommendations for campaigns
 */
router.get('/targeting-recommendations', requireAuth, async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const {
      minScore,
      tier,
      industries,
      limit,
    } = req.query;

    const criteria: {
      minScore?: number;
      tier?: string[];
      industries?: string[];
      limit?: number;
    } = {};

    if (minScore) {
      criteria.minScore = parseInt(minScore as string, 10);
    }

    if (tier) {
      criteria.tier = (tier as string).split(',');
    }

    if (industries) {
      criteria.industries = (industries as string).split(',');
    }

    if (limit) {
      criteria.limit = parseInt(limit as string, 10);
    }

    const recommendations = await abmEngineService.getCampaignTargetingRecommendations(
      organizationId,
      criteria
    );

    res.json({
      success: true,
      data: {
        recommendations,
        total: recommendations.length,
      },
    });
  } catch (error) {
    logger.error('Get targeting recommendations error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to get targeting recommendations',
      },
    });
  }
});

export const abmRoutes = router;
