/**
 * Audit Export & Query Routes
 *
 * Provides administrative access to audit logs for compliance, security,
 * and organizational insight. This is the DATA MOAT - comprehensive tracking
 * of all user interactions that feeds the learning system.
 *
 * Key Features:
 * - Query logs with filters (eventType, dateRange, actorId)
 * - Export to CSV/JSON for compliance
 * - Dashboard aggregation data
 * - Admin-only access with organization isolation
 */

import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requireOrganization, getOrganizationId } from '../middleware/multiTenancy.js';
import { auditService, AuditQuery, AuditCategory } from '../services/auditService.js';
import { logger } from '../utils/logger.js';
import { pool } from '../database/db.js';

const router = Router();

// ============================================================================
// AUTHORIZATION HELPERS
// ============================================================================

/**
 * Check if user has admin role for audit access
 */
async function requireAdmin(req: Request, res: Response, next: Function) {
    try {
        const userId = req.user?.id;
        const organizationId = getOrganizationId(req);

        if (!userId || !organizationId) {
            return res.status(403).json({
                error: {
                    code: 'FORBIDDEN',
                    message: 'Admin access required'
                }
            });
        }

        // Check if user is admin in their organization
        const { rows } = await pool.query(
            `SELECT role FROM organization_users WHERE organization_id = $1 AND user_id = $2`,
            [organizationId, userId]
        );

        if (rows.length === 0 || (rows[0].role !== 'admin' && rows[0].role !== 'owner')) {
            return res.status(403).json({
                error: {
                    code: 'FORBIDDEN',
                    message: 'Admin role required to access audit logs'
                }
            });
        }

        next();
    } catch (error: unknown) {
    const err = error as Error;
        logger.error('[Audit] Admin check failed', { error });
        res.status(500).json({
            error: {
                code: 'AUTHORIZATION_FAILED',
                message: 'Failed to verify admin access'
            }
        });
    }
}

// ============================================================================
// QUERY ENDPOINTS
// ============================================================================

/**
 * GET /api/audit/logs
 * Query audit logs with filters
 *
 * Query params:
 * - eventType: string (filter by event type prefix, e.g., "auth", "deliverable.approve")
 * - category: AuditCategory (filter by category)
 * - actorId: string (filter by actor/user ID)
 * - entityType: string (filter by entity type)
 * - entityId: string (filter by specific entity)
 * - startDate: ISO date string
 * - endDate: ISO date string
 * - limit: number (default 100, max 1000)
 * - offset: number (default 0)
 */
router.get('/logs', requireAuth, requireOrganization, requireAdmin, async (req: Request, res: Response) => {
    try {
        const organizationId = getOrganizationId(req);

        // Parse query parameters
        const query: AuditQuery = {
            organizationId: organizationId ?? undefined, // Always scope to user's organization
            eventType: req.query.eventType as string | undefined,
            category: req.query.category as AuditCategory | undefined,
            actorId: req.query.actorId as string | undefined,
            entityType: req.query.entityType as string | undefined,
            entityId: req.query.entityId as string | undefined,
            startDate: req.query.startDate ? new Date(req.query.startDate as string) : undefined,
            endDate: req.query.endDate ? new Date(req.query.endDate as string) : undefined,
            limit: req.query.limit ? Math.min(parseInt(req.query.limit as string), 1000) : 100,
            offset: req.query.offset ? parseInt(req.query.offset as string) : 0,
        };

        const result = await auditService.query(query);

        res.json({
            success: true,
            data: result.logs,
            pagination: {
                total: result.total,
                limit: query.limit || 100,
                offset: query.offset || 0,
                hasMore: (query.offset || 0) + result.logs.length < result.total
            }
        });
    } catch (error: unknown) {
    const err = error as Error;
        logger.error('[Audit] Query failed', { error });
        res.status(500).json({
            error: {
                code: 'QUERY_FAILED',
                message: 'Failed to query audit logs'
            }
        });
    }
});

/**
 * GET /api/audit/entity/:entityType/:entityId
 * Get complete audit history for a specific entity
 *
 * Example: GET /api/audit/entity/deliverable/abc-123
 */
router.get('/entity/:entityType/:entityId', requireAuth, requireOrganization, requireAdmin, async (req: Request, res: Response) => {
    try {
        const { entityType, entityId } = req.params;
        const organizationId = getOrganizationId(req);

        const logs = await auditService.getEntityHistory(entityType, entityId);

        // Filter to only show logs for this organization
        const filteredLogs = logs.filter(log => log.organizationId === organizationId);

        res.json({
            success: true,
            entityType,
            entityId,
            history: filteredLogs,
            total: filteredLogs.length
        });
    } catch (error: unknown) {
    const err = error as Error;
        logger.error('[Audit] Entity history failed', { error });
        res.status(500).json({
            error: {
                code: 'HISTORY_FAILED',
                message: 'Failed to get entity history'
            }
        });
    }
});

// ============================================================================
// EXPORT ENDPOINTS
// ============================================================================

/**
 * GET /api/audit/export
 * Export audit logs to CSV or JSON for compliance
 *
 * Query params: same as /logs, plus:
 * - format: "csv" | "json" (default: csv)
 */
router.get('/export', requireAuth, requireOrganization, requireAdmin, async (req: Request, res: Response) => {
    try {
        const organizationId = getOrganizationId(req);
        const format = (req.query.format as string || 'csv').toLowerCase();

        // Build query (same as /logs but with higher limit for export)
        const query: AuditQuery = {
            organizationId: organizationId ?? undefined,
            eventType: req.query.eventType as string | undefined,
            category: req.query.category as AuditCategory | undefined,
            actorId: req.query.actorId as string | undefined,
            entityType: req.query.entityType as string | undefined,
            entityId: req.query.entityId as string | undefined,
            startDate: req.query.startDate ? new Date(req.query.startDate as string) : undefined,
            endDate: req.query.endDate ? new Date(req.query.endDate as string) : undefined,
            limit: 10000, // Higher limit for exports
            offset: 0,
        };

        const result = await auditService.query(query);

        if (format === 'json') {
            // JSON export
            res.setHeader('Content-Type', 'application/json');
            res.setHeader('Content-Disposition', `attachment; filename="audit-logs-${Date.now()}.json"`);
            res.json({
                exportDate: new Date().toISOString(),
                organizationId,
                filters: query,
                totalRecords: result.total,
                exportedRecords: result.logs.length,
                logs: result.logs
            });
        } else {
            // CSV export
            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', `attachment; filename="audit-logs-${Date.now()}.csv"`);

            // CSV header
            const headers = [
                'Timestamp',
                'Event Type',
                'Category',
                'Action',
                'Actor ID',
                'Actor Type',
                'Actor Email',
                'Entity Type',
                'Entity ID',
                'Entity Name',
                'Description',
                'IP Address',
                'User Agent',
                'Request ID',
                'Duration (ms)'
            ];

            let csv = headers.join(',') + '\n';

            // CSV rows
            for (const log of result.logs) {
                const row = [
                    log.createdAt.toISOString(),
                    log.eventType,
                    log.eventCategory,
                    log.action,
                    log.actorId || '',
                    log.actorType,
                    log.actorEmail || '',
                    log.entityType || '',
                    log.entityId || '',
                    log.entityName || '',
                    (log.description || '').replace(/"/g, '""'), // Escape quotes
                    log.ipAddress || '',
                    (log.userAgent || '').replace(/"/g, '""'),
                    log.requestId || '',
                    log.durationMs?.toString() || ''
                ];

                csv += row.map(field => `"${field}"`).join(',') + '\n';
            }

            res.send(csv);
        }
    } catch (error: unknown) {
    const err = error as Error;
        logger.error('[Audit] Export failed', { error });
        res.status(500).json({
            error: {
                code: 'EXPORT_FAILED',
                message: 'Failed to export audit logs'
            }
        });
    }
});

// ============================================================================
// DASHBOARD & ANALYTICS
// ============================================================================

/**
 * GET /api/audit/summary
 * Get aggregated audit data for dashboard
 *
 * Query params:
 * - startDate: ISO date string (default: 30 days ago)
 * - endDate: ISO date string (default: now)
 */
router.get('/summary', requireAuth, requireOrganization, requireAdmin, async (req: Request, res: Response) => {
    try {
        const organizationId = getOrganizationId(req);

        // Default to last 30 days
        const endDate = req.query.endDate ? new Date(req.query.endDate as string) : new Date();
        const startDate = req.query.startDate
            ? new Date(req.query.startDate as string)
            : new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000);

        const summary = await auditService.getSummary(startDate, endDate, organizationId ?? undefined);

        res.json({
            success: true,
            period: {
                startDate: startDate.toISOString(),
                endDate: endDate.toISOString(),
                days: Math.ceil((endDate.getTime() - startDate.getTime()) / (24 * 60 * 60 * 1000))
            },
            summary
        });
    } catch (error: unknown) {
    const err = error as Error;
        logger.error('[Audit] Summary failed', { error });
        res.status(500).json({
            error: {
                code: 'SUMMARY_FAILED',
                message: 'Failed to get audit summary'
            }
        });
    }
});

/**
 * GET /api/audit/security
 * Get recent security events for monitoring
 */
router.get('/security', requireAuth, requireOrganization, requireAdmin, async (req: Request, res: Response) => {
    try {
        const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;
        const events = await auditService.getRecentSecurityEvents(limit);

        // Filter to organization
        const organizationId = getOrganizationId(req);
        const filtered = events.filter(e => e.organizationId === organizationId);

        res.json({
            success: true,
            events: filtered,
            total: filtered.length
        });
    } catch (error: unknown) {
    const err = error as Error;
        logger.error('[Audit] Security events failed', { error });
        res.status(500).json({
            error: {
                code: 'SECURITY_FAILED',
                message: 'Failed to get security events'
            }
        });
    }
});

/**
 * GET /api/audit/stats
 * Get audit service statistics and health
 */
router.get('/stats', requireAuth, requireOrganization, requireAdmin, async (req: Request, res: Response) => {
    try {
        const recoveryInfo = await auditService.getRecoveryInfo();

        res.json({
            success: true,
            stats: {
                pendingInQueue: recoveryInfo.pendingInQueue,
                memoryQueueSize: recoveryInfo.memoryQueueSize,
                lastFlush: recoveryInfo.lastFlush,
                healthy: recoveryInfo.memoryQueueSize < 100 && recoveryInfo.pendingInQueue < 500
            }
        });
    } catch (error: unknown) {
    const err = error as Error;
        logger.error('[Audit] Stats failed', { error });
        res.status(500).json({
            error: {
                code: 'STATS_FAILED',
                message: 'Failed to get audit stats'
            }
        });
    }
});

export default router;
