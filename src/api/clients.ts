import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requireOrganization } from '../middleware/multiTenancy.js';
import { pool } from '../database/db.js';
import { logger } from '../utils/logger.js';

/** AI Mode definitions for user transparency */
export type AIMode = 'efficient' | 'balanced' | 'power';

export const AI_MODE_INFO: Record<AIMode, {
    name: string;
    description: string;
    costMultiplier: string;
    quality: string;
    speed: string;
    usesCouncil: boolean;
}> = {
    efficient: {
        name: 'Efficient Mode',
        description: 'Cost-optimized AI. Uses fast, affordable models for most tasks. Best for high-volume, routine work.',
        costMultiplier: '~0.1x',
        quality: 'Good',
        speed: 'Fastest',
        usesCouncil: false
    },
    balanced: {
        name: 'Balanced Mode',
        description: 'Smart auto-routing. Automatically picks the right model based on task complexity. Recommended for most users.',
        costMultiplier: '~0.5x',
        quality: 'Great',
        speed: 'Fast',
        usesCouncil: false
    },
    power: {
        name: 'Power Mode',
        description: 'Maximum quality. Uses premium models and multi-model consensus for important decisions. Best for critical work.',
        costMultiplier: '~1x (baseline)',
        quality: 'Exceptional',
        speed: 'Slower',
        usesCouncil: true
    }
};

const router = Router();

/**
 * GET /api/clients
 * List clients - requires authentication (SEC-001 fix)
 */
router.get('/', requireAuth, requireOrganization, async (req: Request, res: Response) => {
    try {
        const userId = req.user!.id;
        // Return current user's client record only (prevents IDOR)
        const { rows } = await pool.query(
            `SELECT id, name, email, industry, company_size, created_at
             FROM clients WHERE id = $1`,
            [userId]
        );
        res.json({
            data: { clients: rows },
            meta: { timestamp: new Date().toISOString() }
        });
    } catch (error: unknown) {
        const err = error as Error;
        logger.error('List clients error:', err);
        res.status(500).json({
            error: {
                code: 'INTERNAL_ERROR',
                message: 'Failed to list clients'
            }
        });
    }
});

/**
 * GET /api/clients/me
 * Get current client profile
 */
router.get('/me', requireAuth, async (req: Request, res: Response) => {
    try {
        const userId = req.user!.id;

        const { rows } = await pool.query(
            `SELECT id, name, email, role, status, brand_guidelines, logo_url,
              website_url, industry, company_size, target_audience, daily_budget,
              trial_start_date, trial_end_date, created_at,
              COALESCE(ai_mode, 'balanced') as ai_mode, ai_mode_updated_at
       FROM clients WHERE id = $1`,
            [userId]
        );

        if (rows.length === 0) {
            return res.status(404).json({
                error: {
                    code: 'NOT_FOUND',
                    message: 'Client not found'
                }
            });
        }

        res.json({
            data: { client: rows[0] },
            meta: { timestamp: new Date().toISOString() }
        });
    } catch (error: unknown) {
        const err = error as Error;
        logger.error('Get client profile error:', err);
        res.status(500).json({
            error: {
                code: 'INTERNAL_ERROR',
                message: 'Failed to fetch profile'
            }
        });
    }
});

/**
 * PATCH /api/clients/me
 * Update current client profile
 */
router.patch('/me', requireAuth, requireOrganization, async (req: Request, res: Response) => {
    try {
        const userId = req.user!.id;
        const {
            name,
            email,
            brand_guidelines,
            logo_url,
            website_url,
            industry,
            company_size,
            target_audience,
            daily_budget
        } = req.body;

        // Build dynamic update query
        const updates: string[] = [];
        const values: unknown[] = [];
        let paramIndex = 1;

        if (name !== undefined) {
            updates.push(`name = $${paramIndex}`);
            values.push(name);
            paramIndex++;
        }
        if (email !== undefined) {
            updates.push(`email = $${paramIndex}`);
            values.push(email);
            paramIndex++;
        }
        if (brand_guidelines !== undefined) {
            updates.push(`brand_guidelines = $${paramIndex}`);
            values.push(JSON.stringify(brand_guidelines));
            paramIndex++;
        }
        if (logo_url !== undefined) {
            updates.push(`logo_url = $${paramIndex}`);
            values.push(logo_url);
            paramIndex++;
        }
        let providedWebsite: string | undefined;
        if (website_url !== undefined) {
            updates.push(`website_url = $${paramIndex}`);
            values.push(website_url);
            paramIndex++;
            providedWebsite = website_url;
        }
        if (industry !== undefined) {
            updates.push(`industry = $${paramIndex}`);
            values.push(industry);
            paramIndex++;
        }
        if (company_size !== undefined) {
            updates.push(`company_size = $${paramIndex}`);
            values.push(company_size);
            paramIndex++;
        }
        if (target_audience !== undefined) {
            updates.push(`target_audience = $${paramIndex}`);
            values.push(JSON.stringify(target_audience));
            paramIndex++;
        }
        if (daily_budget !== undefined) {
            updates.push(`daily_budget = $${paramIndex}`);
            values.push(daily_budget);
            paramIndex++;
        }

        if (updates.length === 0) {
            return res.status(400).json({
                error: {
                    code: 'NO_UPDATES',
                    message: 'No fields to update'
                }
            });
        }

        updates.push(`updated_at = NOW()`);
        values.push(userId);

        const { rows } = await pool.query(
            `UPDATE clients SET ${updates.join(', ')}
       WHERE id = $${paramIndex}
       RETURNING id, name, email, brand_guidelines, logo_url, website_url, 
                 industry, company_size, target_audience, daily_budget`,
            values
        );

        logger.info('Client profile updated', { userId });

        // If website URL provided, kick off crawl + indexing asynchronously
        if (providedWebsite) {
            (async () => {
                try {
                    const { WebResearchService } = await import('../services/webResearchService.js');
                    const { RAGService } = await import('../services/ragService.js');
                    const pages = await WebResearchService.crawlWebsite(providedWebsite!, 10, userId);
                    for (const p of pages) {
                        await RAGService.processDocument(userId, p.url, p.content, { source: 'website_crawl' });
                    }
                    logger.info(`Indexed ${pages.length} pages into RAG for ${providedWebsite}`);
                } catch (e) {
                    logger.warn('Website crawl/index failed', e);
                }
            })();
        }

        res.json({
            data: { client: rows[0] },
            meta: { timestamp: new Date().toISOString() }
        });
    } catch (error: unknown) {
        const err = error as Error;
        logger.error('Update client profile error:', err);
        res.status(500).json({
            error: {
                code: 'INTERNAL_ERROR',
                message: 'Failed to update profile'
            }
        });
    }
});

/**
 * GET /api/clients/ai-modes
 * Get available AI modes with descriptions (for UI display)
 */
router.get('/ai-modes', async (_req: Request, res: Response) => {
    res.json({
        data: {
            modes: AI_MODE_INFO,
            recommended: 'balanced'
        },
        meta: { timestamp: new Date().toISOString() }
    });
});

/**
 * GET /api/clients/me/ai-mode
 * Get current AI mode setting with usage stats
 */
router.get('/me/ai-mode', requireAuth, async (req: Request, res: Response) => {
    try {
        const userId = req.user!.id;

        // Get current mode
        const { rows: clientRows } = await pool.query(
            `SELECT COALESCE(ai_mode, 'balanced') as ai_mode, ai_mode_updated_at
             FROM clients WHERE id = $1`,
            [userId]
        );

        if (clientRows.length === 0) {
            return res.status(404).json({
                error: { code: 'NOT_FOUND', message: 'Client not found' }
            });
        }

        const currentMode = clientRows[0].ai_mode as AIMode;

        // Get usage stats for the last 7 days (if table exists)
        let usageStats = null;
        try {
            const { rows: usageRows } = await pool.query(
                `SELECT
                    COUNT(*) as total_requests,
                    SUM(tokens_input + tokens_output) as total_tokens,
                    SUM(cost_microdollars) / 1000000.0 as total_cost_usd,
                    AVG(cost_microdollars) / 1000000.0 as avg_cost_per_request
                 FROM ai_usage_log
                 WHERE client_id = $1
                   AND created_at > NOW() - INTERVAL '7 days'`,
                [userId]
            );
            if (usageRows[0]) {
                usageStats = {
                    last7Days: {
                        requests: parseInt(usageRows[0].total_requests) || 0,
                        tokens: parseInt(usageRows[0].total_tokens) || 0,
                        costUsd: parseFloat(usageRows[0].total_cost_usd) || 0,
                        avgCostPerRequest: parseFloat(usageRows[0].avg_cost_per_request) || 0
                    }
                };
            }
        } catch {
            // Table might not exist yet, that's ok
        }

        res.json({
            data: {
                currentMode,
                modeInfo: AI_MODE_INFO[currentMode],
                updatedAt: clientRows[0].ai_mode_updated_at,
                allModes: AI_MODE_INFO,
                usage: usageStats
            },
            meta: { timestamp: new Date().toISOString() }
        });
    } catch (error: unknown) {
        const err = error as Error;
        logger.error('Get AI mode error:', err);
        res.status(500).json({
            error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch AI mode' }
        });
    }
});

/**
 * PUT /api/clients/me/ai-mode
 * Update AI mode setting
 */
router.put('/me/ai-mode', requireAuth, requireOrganization, async (req: Request, res: Response) => {
    try {
        const userId = req.user!.id;
        const { mode } = req.body;

        // Validate mode
        if (!mode || !['efficient', 'balanced', 'power'].includes(mode)) {
            return res.status(400).json({
                error: {
                    code: 'INVALID_MODE',
                    message: 'Invalid AI mode. Must be one of: efficient, balanced, power',
                    validModes: Object.keys(AI_MODE_INFO)
                }
            });
        }

        // Update the mode
        const { rows } = await pool.query(
            `UPDATE clients
             SET ai_mode = $1, ai_mode_updated_at = NOW(), updated_at = NOW()
             WHERE id = $2
             RETURNING COALESCE(ai_mode, 'balanced') as ai_mode, ai_mode_updated_at`,
            [mode, userId]
        );

        if (rows.length === 0) {
            return res.status(404).json({
                error: { code: 'NOT_FOUND', message: 'Client not found' }
            });
        }

        const newMode = rows[0].ai_mode as AIMode;

        logger.info('AI mode updated', { userId, oldMode: 'unknown', newMode });

        res.json({
            data: {
                mode: newMode,
                modeInfo: AI_MODE_INFO[newMode],
                updatedAt: rows[0].ai_mode_updated_at,
                message: `AI mode changed to ${AI_MODE_INFO[newMode].name}`
            },
            meta: { timestamp: new Date().toISOString() }
        });
    } catch (error: unknown) {
        const err = error as Error;
        logger.error('Update AI mode error:', err);
        res.status(500).json({
            error: { code: 'INTERNAL_ERROR', message: 'Failed to update AI mode' }
        });
    }
});

/**
 * GET /api/clients/me/ai-usage
 * Get detailed AI usage history
 */
router.get('/me/ai-usage', requireAuth, async (req: Request, res: Response) => {
    try {
        const userId = req.user!.id;
        const days = Math.min(parseInt(req.query.days as string) || 7, 30);

        // Daily breakdown
        let dailyUsage: unknown[] = [];
        try {
            const { rows } = await pool.query(
                `SELECT
                    DATE(created_at) as date,
                    tier_used,
                    COUNT(*) as requests,
                    SUM(tokens_input) as input_tokens,
                    SUM(tokens_output) as output_tokens,
                    SUM(cost_microdollars) / 1000000.0 as cost_usd
                 FROM ai_usage_log
                 WHERE client_id = $1
                   AND created_at > NOW() - INTERVAL '1 day' * $2
                 GROUP BY DATE(created_at), tier_used
                 ORDER BY date DESC, tier_used`,
                [userId, days]
            );
            dailyUsage = rows;
        } catch {
            // Table might not exist
        }

        // Calculate savings estimate
        let savingsEstimate = null;
        if (dailyUsage.length > 0) {
            const totalCost = dailyUsage.reduce((sum: number, r: any) => sum + parseFloat(r.cost_usd || 0), 0);
            const totalTokens = dailyUsage.reduce((sum: number, r: any) => sum + parseInt(r.input_tokens || 0) + parseInt(r.output_tokens || 0), 0);

            // What it would cost on power mode (all council calls)
            const powerModeCost = totalTokens * 0.000015; // ~$15/1M tokens avg for council
            // What it would cost on efficient mode
            const efficientModeCost = totalTokens * 0.0000001; // ~$0.10/1M tokens

            savingsEstimate = {
                currentCost: totalCost,
                ifPowerMode: powerModeCost,
                ifEfficientMode: efficientModeCost,
                savedVsPower: powerModeCost - totalCost,
                couldSaveMore: totalCost - efficientModeCost
            };
        }

        res.json({
            data: {
                period: `${days} days`,
                dailyBreakdown: dailyUsage,
                savingsEstimate
            },
            meta: { timestamp: new Date().toISOString() }
        });
    } catch (error: unknown) {
        const err = error as Error;
        logger.error('Get AI usage error:', err);
        res.status(500).json({
            error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch AI usage' }
        });
    }
});

/**
 * GET /api/clients/:id/history
 * Get activity history for a specific client
 * Includes campaigns, workflows, and deliverables
 */
router.get('/:id/history', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;
    const { limit = '50', offset = '0', type } = req.query;

    // Only allow users to view their own history
    if (id !== userId) {
      return res.status(403).json({
        error: {
          code: 'FORBIDDEN',
          message: 'You can only view your own history'
        }
      });
    }

    const limitNum = Math.min(parseInt(limit as string, 10), 100);
    const offsetNum = parseInt(offset as string, 10);

    const history: any[] = [];

    // Get campaigns
    if (!type || type === 'campaigns') {
      const { rows: campaigns } = await pool.query(
        `SELECT id, name, objective, status, created_at, updated_at, 'campaign' as type
         FROM campaigns
         WHERE (organization_id = $1 OR client_id = $1)
         ORDER BY created_at DESC
         LIMIT $2 OFFSET $3`,
        [id, limitNum, offsetNum]
      );
      history.push(...campaigns);
    }

    // Get workflows
    if (!type || type === 'workflows') {
      const { rows: workflows } = await pool.query(
        `SELECT id, goal as name, status, created_at, updated_at, 'workflow' as type
         FROM workflows
         WHERE client_id = $1
         ORDER BY created_at DESC
         LIMIT $2 OFFSET $3`,
        [id, limitNum, offsetNum]
      );
      history.push(...workflows);
    }

    // Get deliverables
    if (!type || type === 'deliverables') {
      const { rows: deliverables } = await pool.query(
        `SELECT d.id, d.type as name, d.created_at, 'deliverable' as type, d.metadata
         FROM deliverables d
         JOIN tasks t ON t.id = d.task_id
         JOIN workflows w ON w.id = t.workflow_id
         WHERE w.client_id = $1
         ORDER BY d.created_at DESC
         LIMIT $2 OFFSET $3`,
        [id, limitNum, offsetNum]
      );
      history.push(...deliverables);
    }

    // Sort by created_at DESC
    history.sort((a, b) => {
      const dateA = new Date(a.created_at).getTime();
      const dateB = new Date(b.created_at).getTime();
      return dateB - dateA;
    });

    // Apply limit
    const paginatedHistory = history.slice(0, limitNum);

    res.json({
      data: {
        history: paginatedHistory,
        total: history.length,
        limit: limitNum,
        offset: offsetNum
      },
      meta: { timestamp: new Date().toISOString() }
    });
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('Get client history error:', err);
    res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch client history' }
    });
  }
});

/**
 * PATCH /api/clients/:id
 * Update a client profile (admin/self only)
 * Regular users can only update their own profile via /me
 */
router.patch('/:id', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;

    // Only allow users to update their own profile
    // (Admin check could be added here if needed)
    if (id !== userId) {
      return res.status(403).json({
        error: {
          code: 'FORBIDDEN',
          message: 'You can only update your own profile'
        }
      });
    }

    const {
      name,
      email,
      brand_guidelines,
      logo_url,
      website_url,
      industry,
      company_size,
      target_audience,
      daily_budget
    } = req.body;

    // Build dynamic update query
    const updates: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (name !== undefined) {
      updates.push(`name = $${paramIndex}`);
      values.push(name);
      paramIndex++;
    }
    if (email !== undefined) {
      updates.push(`email = $${paramIndex}`);
      values.push(email);
      paramIndex++;
    }
    if (brand_guidelines !== undefined) {
      updates.push(`brand_guidelines = $${paramIndex}`);
      values.push(JSON.stringify(brand_guidelines));
      paramIndex++;
    }
    if (logo_url !== undefined) {
      updates.push(`logo_url = $${paramIndex}`);
      values.push(logo_url);
      paramIndex++;
    }
    if (website_url !== undefined) {
      updates.push(`website_url = $${paramIndex}`);
      values.push(website_url);
      paramIndex++;
    }
    if (industry !== undefined) {
      updates.push(`industry = $${paramIndex}`);
      values.push(industry);
      paramIndex++;
    }
    if (company_size !== undefined) {
      updates.push(`company_size = $${paramIndex}`);
      values.push(company_size);
      paramIndex++;
    }
    if (target_audience !== undefined) {
      updates.push(`target_audience = $${paramIndex}`);
      values.push(JSON.stringify(target_audience));
      paramIndex++;
    }
    if (daily_budget !== undefined) {
      updates.push(`daily_budget = $${paramIndex}`);
      values.push(daily_budget);
      paramIndex++;
    }

    if (updates.length === 0) {
      return res.status(400).json({
        error: {
          code: 'NO_UPDATES',
          message: 'No fields to update'
        }
      });
    }

    updates.push(`updated_at = NOW()`);
    values.push(id);

    const { rows } = await pool.query(
      `UPDATE clients SET ${updates.join(', ')}
       WHERE id = $${paramIndex}
       RETURNING id, name, email, brand_guidelines, logo_url, website_url,
                 industry, company_size, target_audience, daily_budget`,
      values
    );

    if (rows.length === 0) {
      return res.status(404).json({
        error: {
          code: 'NOT_FOUND',
          message: 'Client not found'
        }
      });
    }

    logger.info('Client profile updated', { userId: id });

    res.json({
      data: { client: rows[0] },
      meta: { timestamp: new Date().toISOString() }
    });
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('Update client profile error:', err);
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to update profile'
      }
    });
  }
});

export default router;
