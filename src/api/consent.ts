/**
 * Consent Routes - Manage user autonomy consent
 *
 * These endpoints allow users to set and update their autonomy preferences,
 * which controls what actions the system can take without human approval.
 */

import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requireOrganization } from '../middleware/multiTenancy.js';

// Type alias for backward compatibility
type AuthRequest = Request;
import { autonomyManager, AutonomyLevel, ConsentAreas } from '../services/runtime/autonomyManager.js';
import { pool } from '../database/db.js';
import { logger } from '../utils/logger.js';
import { toolRegistry } from '../services/runtime/toolRegistry.js';

const router = Router();

/**
 * GET /api/consent
 * Get current user's consent settings
 */
router.get('/', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user!.id;

        const consent = await autonomyManager.getConsent(userId);

        if (!consent) {
            return res.json({
                success: true,
                hasConsent: false,
                consent: null,
            });
        }

        // Get summary too
        const summary = await autonomyManager.getAutonomySummary(userId);

        res.json({
            success: true,
            hasConsent: true,
            consent,
            summary,
        });
    } catch (error: unknown) {
    const err = error as Error;
        logger.error('Failed to get consent:', error);
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * POST /api/consent
 * Set consent during onboarding
 */
router.post('/', requireAuth, requireOrganization, async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user!.id;
        const {
            autonomyLevel,
            customAreas,
            dailySpendLimit,
            singleActionLimit,
            contentApprovalThreshold,
            organizationId,
        } = req.body;

        // Validate autonomy level
        const validLevels: AutonomyLevel[] = ['full', 'high', 'medium', 'low'];
        if (!validLevels.includes(autonomyLevel)) {
            return res.status(400).json({
                success: false,
                error: `Invalid autonomy level. Must be one of: ${validLevels.join(', ')}`,
            });
        }

        const consent = await autonomyManager.collectConsent(
            userId,
            autonomyLevel,
            customAreas,
            {
                dailySpendLimit,
                singleActionLimit,
                contentApprovalThreshold,
            },
            organizationId
        );

        res.json({
            success: true,
            consent,
            message: `Autonomy level set to ${autonomyLevel}`,
        });
    } catch (error: unknown) {
    const err = error as Error;
        logger.error('Failed to set consent:', error);
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * PATCH /api/consent
 * Update existing consent settings
 */
router.patch('/', requireAuth, requireOrganization, async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user!.id;
        const updates = req.body;

        const consent = await autonomyManager.updateConsent(userId, updates);

        if (!consent) {
            return res.status(404).json({
                success: false,
                error: 'No consent found. Please complete onboarding first.',
            });
        }

        res.json({
            success: true,
            consent,
        });
    } catch (error: unknown) {
    const err = error as Error;
        logger.error('Failed to update consent:', error);
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * GET /api/consent/summary
 * Get autonomy summary for dashboard
 */
router.get('/summary', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user!.id;

        const summary = await autonomyManager.getAutonomySummary(userId);

        if (!summary) {
            return res.json({
                success: true,
                hasConsent: false,
                summary: null,
            });
        }

        res.json({
            success: true,
            hasConsent: true,
            summary,
        });
    } catch (error: unknown) {
    const err = error as Error;
        logger.error('Failed to get consent summary:', error);
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * GET /api/consent/recommendations
 * Get recommended autonomy level based on user behavior
 */
router.get('/recommendations', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user!.id;

        const recommended = await autonomyManager.getRecommendedLevel(userId);
        const currentConsent = await autonomyManager.getConsent(userId);

        res.json({
            success: true,
            currentLevel: currentConsent?.autonomyLevel || 'none',
            recommendedLevel: recommended,
            reason: getRecommendationReason(currentConsent?.autonomyLevel, recommended),
        });
    } catch (error: unknown) {
    const err = error as Error;
        logger.error('Failed to get recommendations:', error);
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * GET /api/consent/approvals
 * Get pending approval requests
 */
router.get('/approvals', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user!.id;

        const { rows: approvals } = await pool.query(
            `SELECT * FROM approval_requests
             WHERE user_id = $1 AND status = 'pending'
             ORDER BY created_at DESC
             LIMIT 50`,
            [userId]
        );

        res.json({
            success: true,
            approvals,
            count: approvals.length,
        });
    } catch (error: unknown) {
    const err = error as Error;
        logger.error('Failed to get approvals:', error);
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * POST /api/consent/approvals/:id/approve
 * Approve a pending request
 */
router.post('/approvals/:id/approve', requireAuth, requireOrganization, async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user!.id;
        const approvalId = req.params.id;

        const { rows } = await pool.query(
            `UPDATE approval_requests
             SET status = 'approved', approved_at = NOW(), approved_by = $1, updated_at = NOW()
             WHERE id = $2 AND user_id = $3 AND status = 'pending'
             RETURNING *`,
            [userId, approvalId, userId]
        );

        if (rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Approval request not found or already processed',
            });
        }

        const approval = rows[0];

        // Execute the approved action
        // The description field contains the full action payload as JSON
        try {
            const actionData = JSON.parse(approval.description);
            const { type, area, payload } = actionData;

            if (payload && type && area) {
                logger.info(`[Consent] Executing approved action: ${type} in ${area}`, {
                    approvalId,
                    workflowId: approval.workflow_id,
                    taskId: approval.task_id
                });

                // Build context for tool execution
                const context = {
                    taskId: approval.task_id || 'approved-action',
                    workflowId: approval.workflow_id || 'manual-approval',
                    brief: `Executing approved action: ${type} in ${area}`
                };

                // Execute the action through the tool registry
                const result = await toolRegistry.execute(type, payload, context);

                if (!result.success) {
                    logger.warn(`[Consent] Approved action execution failed: ${result.error}`);
                    // Action failed but approval still stands - log it
                    await pool.query(
                        `UPDATE approval_requests SET description = $1 WHERE id = $2`,
                        [JSON.stringify({ ...actionData, executionError: result.error }), approvalId]
                    );
                }
            }
        } catch (parseError: any) {
            logger.warn(`[Consent] Could not parse/execute action payload: ${parseError.message}`);
            // Non-blocking - the approval still succeeds
        }

        res.json({
            success: true,
            approval,
        });
    } catch (error: unknown) {
    const err = error as Error;
        logger.error('Failed to approve request:', error);
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * POST /api/consent/approvals/:id/reject
 * Reject a pending request
 */
router.post('/approvals/:id/reject', requireAuth, requireOrganization, async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user!.id;
        const approvalId = req.params.id;
        const { reason } = req.body;

        const { rows } = await pool.query(
            `UPDATE approval_requests
             SET status = 'rejected', rejection_reason = $1, updated_at = NOW()
             WHERE id = $2 AND user_id = $3 AND status = 'pending'
             RETURNING *`,
            [reason || 'Rejected by user', approvalId, userId]
        );

        if (rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Approval request not found or already processed',
            });
        }

        res.json({
            success: true,
            approval: rows[0],
        });
    } catch (error: unknown) {
    const err = error as Error;
        logger.error('Failed to reject request:', error);
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * GET /api/consent/actions
 * Get recent autonomous actions
 */
router.get('/actions', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user!.id;
        const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);

        const { rows: actions } = await pool.query(
            `SELECT * FROM autonomous_actions
             WHERE user_id = $1
             ORDER BY created_at DESC
             LIMIT $2`,
            [userId, limit]
        );

        res.json({
            success: true,
            actions,
        });
    } catch (error: unknown) {
    const err = error as Error;
        logger.error('Failed to get actions:', error);
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * GET /api/consent/levels
 * Get available autonomy levels with descriptions
 */
router.get('/levels', (_req: Request, res: Response) => {
    res.json({
        success: true,
        levels: [
            {
                id: 'full',
                name: 'Full Autonomy',
                description: 'Complete autonomous operation. The system can publish content, spend budget, and make decisions without asking.',
                recommended_for: 'Power users who trust the system completely',
                capabilities: [
                    'Auto-publish content',
                    'Spend budget on ads',
                    'Create new campaigns',
                    'Send emails to customers',
                    'Optimize campaigns automatically',
                ],
            },
            {
                id: 'high',
                name: 'High Autonomy',
                description: 'Autonomous within daily limits. The system notifies you of major actions but proceeds without waiting.',
                recommended_for: 'Users who want efficiency with awareness',
                capabilities: [
                    'Auto-publish content',
                    'Spend budget (within daily limit)',
                    'Pause/optimize campaigns',
                    'Send emails',
                    'Notify on major changes',
                ],
            },
            {
                id: 'medium',
                name: 'Medium Autonomy',
                description: 'Drafts and prepares content, but asks before publishing or spending. Good balance of speed and control.',
                recommended_for: 'Most users - recommended default',
                capabilities: [
                    'Generate content drafts',
                    'Optimize campaigns automatically',
                    'Respond to comments',
                    'Require approval for publishing',
                    'Require approval for spending',
                ],
            },
            {
                id: 'low',
                name: 'Low Autonomy',
                description: 'Maximum control. The system asks for approval on almost every action.',
                recommended_for: 'New users or those wanting full control',
                capabilities: [
                    'Generate content drafts',
                    'Export data',
                    'All other actions require approval',
                ],
            },
        ],
    });
});

/**
 * Helper to generate recommendation reason
 */
function getRecommendationReason(current: AutonomyLevel | undefined, recommended: AutonomyLevel): string {
    if (!current) {
        return 'No autonomy level set. We recommend starting with the suggested level based on typical usage.';
    }

    if (current === recommended) {
        return 'Your current autonomy level matches our recommendation based on your usage patterns.';
    }

    const levelOrder = ['low', 'medium', 'high', 'full'];
    const currentIndex = levelOrder.indexOf(current);
    const recommendedIndex = levelOrder.indexOf(recommended);

    if (recommendedIndex > currentIndex) {
        return 'Based on your high approval rate, you might benefit from more autonomous operation to save time.';
    } else {
        return 'Based on your frequent manual interventions, a lower autonomy level might give you more control.';
    }
}

export default router;
