/**
 * Export Routes
 *
 * Phase 6: Export functionality for leads, campaigns, and analytics.
 * Supports CSV, JSON, and PDF exports.
 */

import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requireOrganization, getOrganizationId } from '../middleware/multiTenancy.js';
import { requireZoFeature } from '../middleware/featureFlags.js';
import { pool } from '../database/db.js';
import { logger } from '../utils/logger.js';

const router = Router();

// ============================================================================
// LEADS EXPORT
// ============================================================================

/**
 * GET /api/exports/leads
 * Export leads as CSV or JSON
 */
router.get(
  '/leads',
  requireAuth,
  requireOrganization,
  requireZoFeature('crmFoundation'),
  async (req: Request, res: Response) => {
    try {
      const organizationId = getOrganizationId(req)!;
      const { format = 'csv', tags, lifecycleStage, leadStatus, createdAfter, createdBefore } = req.query;

      // Build query with filters
      let query = `
        SELECT
          l.id,
          l.email,
          l.phone,
          l.first_name,
          l.last_name,
          l.company,
          l.job_title,
          l.website,
          l.linkedin_url,
          l.source,
          l.source_detail,
          l.lifecycle_stage,
          l.lead_status,
          l.score,
          l.tags,
          l.created_at,
          l.updated_at,
          l.last_contacted_at
        FROM leads l
        WHERE l.organization_id = $1
      `;
      const params: unknown[] = [organizationId];
      let paramIndex = 2;

      if (tags) {
        const tagArray = Array.isArray(tags) ? tags : [tags];
        query += ` AND l.tags && $${paramIndex}::text[]`;
        params.push(tagArray);
        paramIndex++;
      }

      if (lifecycleStage) {
        query += ` AND l.lifecycle_stage = $${paramIndex}`;
        params.push(lifecycleStage);
        paramIndex++;
      }

      if (leadStatus) {
        query += ` AND l.lead_status = $${paramIndex}`;
        params.push(leadStatus);
        paramIndex++;
      }

      if (createdAfter) {
        query += ` AND l.created_at >= $${paramIndex}`;
        params.push(new Date(createdAfter as string));
        paramIndex++;
      }

      if (createdBefore) {
        query += ` AND l.created_at <= $${paramIndex}`;
        params.push(new Date(createdBefore as string));
        paramIndex++;
      }

      query += ' ORDER BY l.created_at DESC';

      const { rows } = await pool.query(query, params);

      if (format === 'json') {
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', `attachment; filename="leads_${new Date().toISOString().split('T')[0]}.json"`);
        return res.json({ leads: rows, exportedAt: new Date().toISOString(), count: rows.length });
      }

      // CSV format
      const headers = [
        'ID', 'Email', 'Phone', 'First Name', 'Last Name', 'Company',
        'Job Title', 'Website', 'LinkedIn URL', 'Source', 'Source Detail',
        'Lifecycle Stage', 'Lead Status', 'Score', 'Tags', 'Created At',
        'Updated At', 'Last Contacted At'
      ];

      const csvRows = rows.map(row => [
        row.id,
        row.email || '',
        row.phone || '',
        row.first_name || '',
        row.last_name || '',
        row.company || '',
        row.job_title || '',
        row.website || '',
        row.linkedin_url || '',
        row.source || '',
        row.source_detail || '',
        row.lifecycle_stage || '',
        row.lead_status || '',
        row.score || 0,
        (row.tags || []).join(';'),
        row.created_at?.toISOString() || '',
        row.updated_at?.toISOString() || '',
        row.last_contacted_at?.toISOString() || '',
      ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','));

      const csv = [headers.join(','), ...csvRows].join('\n');

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="leads_${new Date().toISOString().split('T')[0]}.csv"`);
      res.send(csv);
    } catch (error: unknown) {
    const err = error as Error;
      logger.error('[ExportRoutes] Error exporting leads', { error });
      res.status(500).json({ error: 'Failed to export leads' });
    }
  }
);

// ============================================================================
// CAMPAIGN EXPORT
// ============================================================================

/**
 * GET /api/exports/campaigns/:campaignId
 * Export campaign data including deliverables and metrics
 */
router.get(
  '/campaigns/:campaignId',
  requireAuth,
  requireOrganization,
  async (req: Request, res: Response) => {
    try {
      const organizationId = getOrganizationId(req)!;
      const { campaignId } = req.params;
      const { format = 'json' } = req.query;

      // Get campaign
      const { rows: campaigns } = await pool.query(
        `SELECT * FROM campaigns WHERE id = $1 AND organization_id = $2`,
        [campaignId, organizationId]
      );

      if (campaigns.length === 0) {
        return res.status(404).json({ error: 'Campaign not found' });
      }

      const campaign = campaigns[0];

      // Get deliverables
      const { rows: deliverables } = await pool.query(
        `SELECT
          id, title, type, status, content, metadata,
          preview_url, thumbnail_url, created_at, updated_at, iteration_count
         FROM deliverables
         WHERE campaign_id = $1
         ORDER BY created_at DESC`,
        [campaignId]
      );

      // Get workflows
      const { rows: workflows } = await pool.query(
        `SELECT id, goal, status, agents_used, created_at, completed_at
         FROM workflows
         WHERE campaign_id = $1
         ORDER BY created_at DESC`,
        [campaignId]
      );

      // Get metrics if available
      const { rows: metrics } = await pool.query(
        `SELECT
          source, metric_type, metric_value, date_recorded
         FROM campaign_metrics
         WHERE campaign_id = $1
         ORDER BY date_recorded DESC
         LIMIT 100`,
        [campaignId]
      );

      const exportData = {
        campaign: {
          id: campaign.id,
          name: campaign.name,
          goal: campaign.goal,
          status: campaign.status,
          budget: campaign.budget,
          createdAt: campaign.created_at,
          updatedAt: campaign.updated_at,
        },
        deliverables: deliverables.map(d => ({
          id: d.id,
          title: d.title,
          type: d.type,
          status: d.status,
          previewUrl: d.preview_url,
          thumbnailUrl: d.thumbnail_url,
          iterationCount: d.iteration_count,
          createdAt: d.created_at,
        })),
        workflows: workflows.map(w => ({
          id: w.id,
          goal: w.goal,
          status: w.status,
          agentsUsed: w.agents_used,
          createdAt: w.created_at,
          completedAt: w.completed_at,
        })),
        metrics,
        exportedAt: new Date().toISOString(),
        summary: {
          totalDeliverables: deliverables.length,
          approvedDeliverables: deliverables.filter(d => d.status === 'approved').length,
          totalWorkflows: workflows.length,
          completedWorkflows: workflows.filter(w => w.status === 'completed').length,
        },
      };

      if (format === 'csv') {
        // Export deliverables as CSV
        const headers = ['ID', 'Title', 'Type', 'Status', 'Preview URL', 'Iterations', 'Created At'];
        const csvRows = deliverables.map(d => [
          d.id,
          d.title || '',
          d.type || '',
          d.status || '',
          d.preview_url || '',
          d.iteration_count || 0,
          d.created_at?.toISOString() || '',
        ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','));

        const csv = [headers.join(','), ...csvRows].join('\n');

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="campaign_${campaignId}_${new Date().toISOString().split('T')[0]}.csv"`);
        return res.send(csv);
      }

      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="campaign_${campaignId}_${new Date().toISOString().split('T')[0]}.json"`);
      res.json(exportData);
    } catch (error: unknown) {
    const err = error as Error;
      logger.error('[ExportRoutes] Error exporting campaign', { error });
      res.status(500).json({ error: 'Failed to export campaign' });
    }
  }
);

// ============================================================================
// ANALYTICS EXPORT
// ============================================================================

/**
 * GET /api/exports/analytics
 * Export analytics data
 */
router.get(
  '/analytics',
  requireAuth,
  requireOrganization,
  async (req: Request, res: Response) => {
    try {
      const organizationId = getOrganizationId(req)!;
      const { format = 'json', period = '30d', campaignId } = req.query;

      // Calculate date range
      const now = new Date();
      let startDate: Date;
      switch (period) {
        case '7d':
          startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          break;
        case '90d':
          startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
          break;
        case 'all':
          startDate = new Date('2020-01-01');
          break;
        default:
          startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      }

      // Get campaign metrics
      let metricsQuery = `
        SELECT
          cm.campaign_id,
          c.name as campaign_name,
          cm.source,
          cm.metric_type,
          cm.metric_value,
          cm.date_recorded
        FROM campaign_metrics cm
        JOIN campaigns c ON cm.campaign_id = c.id
        WHERE c.organization_id = $1
          AND cm.date_recorded >= $2
      `;
      const params: unknown[] = [organizationId, startDate];
      let paramIndex = 3;

      if (campaignId) {
        metricsQuery += ` AND cm.campaign_id = $${paramIndex}`;
        params.push(campaignId);
        paramIndex++;
      }

      metricsQuery += ' ORDER BY cm.date_recorded DESC';

      const { rows: metrics } = await pool.query(metricsQuery, params);

      // Get deliverable stats
      const { rows: deliverableStats } = await pool.query(
        `SELECT
          type,
          status,
          COUNT(*) as count
         FROM deliverables
         WHERE organization_id = $1
           AND created_at >= $2
         GROUP BY type, status`,
        [organizationId, startDate]
      );

      // Get workflow stats
      const { rows: workflowStats } = await pool.query(
        `SELECT
          status,
          COUNT(*) as count,
          AVG(EXTRACT(EPOCH FROM (completed_at - created_at))) as avg_duration_seconds
         FROM workflows
         WHERE organization_id = $1
           AND created_at >= $2
         GROUP BY status`,
        [organizationId, startDate]
      );

      const exportData = {
        period,
        startDate: startDate.toISOString(),
        endDate: now.toISOString(),
        metrics,
        deliverableStats,
        workflowStats,
        exportedAt: new Date().toISOString(),
      };

      if (format === 'csv') {
        // Export metrics as CSV
        const headers = ['Campaign ID', 'Campaign Name', 'Source', 'Metric Type', 'Metric Value', 'Date'];
        const csvRows = metrics.map(m => [
          m.campaign_id || '',
          m.campaign_name || '',
          m.source || '',
          m.metric_type || '',
          m.metric_value || 0,
          m.date_recorded?.toISOString() || '',
        ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','));

        const csv = [headers.join(','), ...csvRows].join('\n');

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="analytics_${period}_${new Date().toISOString().split('T')[0]}.csv"`);
        return res.send(csv);
      }

      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="analytics_${period}_${new Date().toISOString().split('T')[0]}.json"`);
      res.json(exportData);
    } catch (error: unknown) {
    const err = error as Error;
      logger.error('[ExportRoutes] Error exporting analytics', { error });
      res.status(500).json({ error: 'Failed to export analytics' });
    }
  }
);

// ============================================================================
// ACTIVITIES EXPORT
// ============================================================================

/**
 * GET /api/exports/activities
 * Export lead activities
 */
router.get(
  '/activities',
  requireAuth,
  requireOrganization,
  requireZoFeature('crmFoundation'),
  async (req: Request, res: Response) => {
    try {
      const organizationId = getOrganizationId(req)!;
      const { format = 'csv', leadId, activityType, createdAfter, createdBefore, limit = 1000 } = req.query;

      let query = `
        SELECT
          la.id,
          la.lead_id,
          l.email as lead_email,
          l.first_name || ' ' || l.last_name as lead_name,
          la.activity_type,
          la.activity_data,
          la.score_change,
          la.created_at
        FROM lead_activities la
        JOIN leads l ON la.lead_id = l.id
        WHERE l.organization_id = $1
      `;
      const params: unknown[] = [organizationId];
      let paramIndex = 2;

      if (leadId) {
        query += ` AND la.lead_id = $${paramIndex}`;
        params.push(leadId);
        paramIndex++;
      }

      if (activityType) {
        query += ` AND la.activity_type = $${paramIndex}`;
        params.push(activityType);
        paramIndex++;
      }

      if (createdAfter) {
        query += ` AND la.created_at >= $${paramIndex}`;
        params.push(new Date(createdAfter as string));
        paramIndex++;
      }

      if (createdBefore) {
        query += ` AND la.created_at <= $${paramIndex}`;
        params.push(new Date(createdBefore as string));
        paramIndex++;
      }

      query += ` ORDER BY la.created_at DESC LIMIT $${paramIndex}`;
      params.push(parseInt(limit as string, 10));

      const { rows } = await pool.query(query, params);

      if (format === 'json') {
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', `attachment; filename="activities_${new Date().toISOString().split('T')[0]}.json"`);
        return res.json({ activities: rows, exportedAt: new Date().toISOString(), count: rows.length });
      }

      // CSV format
      const headers = ['ID', 'Lead ID', 'Lead Email', 'Lead Name', 'Activity Type', 'Score Change', 'Created At'];
      const csvRows = rows.map(row => [
        row.id,
        row.lead_id,
        row.lead_email || '',
        row.lead_name || '',
        row.activity_type || '',
        row.score_change || 0,
        row.created_at?.toISOString() || '',
      ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','));

      const csv = [headers.join(','), ...csvRows].join('\n');

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="activities_${new Date().toISOString().split('T')[0]}.csv"`);
      res.send(csv);
    } catch (error: unknown) {
    const err = error as Error;
      logger.error('[ExportRoutes] Error exporting activities', { error });
      res.status(500).json({ error: 'Failed to export activities' });
    }
  }
);

// ============================================================================
// REPORT GENERATION (Summary Report)
// ============================================================================

/**
 * GET /api/exports/report
 * Generate a comprehensive summary report
 */
router.get(
  '/report',
  requireAuth,
  requireOrganization,
  async (req: Request, res: Response) => {
    try {
      const organizationId = getOrganizationId(req)!;
      const { period = '30d' } = req.query;

      // Calculate date range
      const now = new Date();
      let startDate: Date;
      switch (period) {
        case '7d':
          startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          break;
        case '90d':
          startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
          break;
        default:
          startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      }

      // Get organization info
      const { rows: orgs } = await pool.query(
        `SELECT name FROM organizations WHERE id = $1`,
        [organizationId]
      );
      const orgName = orgs[0]?.name || 'Unknown Organization';

      // Campaign summary
      const { rows: campaignSummary } = await pool.query(
        `SELECT
          COUNT(*) FILTER (WHERE status = 'active') as active_campaigns,
          COUNT(*) FILTER (WHERE status = 'completed') as completed_campaigns,
          COUNT(*) FILTER (WHERE status = 'draft') as draft_campaigns,
          COUNT(*) as total_campaigns
         FROM campaigns
         WHERE organization_id = $1 AND created_at >= $2`,
        [organizationId, startDate]
      );

      // Deliverable summary
      const { rows: deliverableSummary } = await pool.query(
        `SELECT
          type,
          COUNT(*) as count,
          COUNT(*) FILTER (WHERE status = 'approved') as approved,
          COUNT(*) FILTER (WHERE status = 'pending') as pending,
          COUNT(*) FILTER (WHERE status = 'rejected') as rejected
         FROM deliverables
         WHERE organization_id = $1 AND created_at >= $2
         GROUP BY type`,
        [organizationId, startDate]
      );

      // Lead summary (if CRM enabled)
      let leadSummary = null;
      try {
        const { rows } = await pool.query(
          `SELECT
            COUNT(*) as total_leads,
            COUNT(*) FILTER (WHERE lifecycle_stage = 'lead') as leads,
            COUNT(*) FILTER (WHERE lifecycle_stage = 'mql') as mqls,
            COUNT(*) FILTER (WHERE lifecycle_stage = 'sql') as sqls,
            COUNT(*) FILTER (WHERE lifecycle_stage = 'customer') as customers,
            AVG(score) as avg_score
           FROM leads
           WHERE organization_id = $1 AND created_at >= $2`,
          [organizationId, startDate]
        );
        leadSummary = rows[0];
      } catch {
        // CRM tables may not exist
      }

      // Workflow summary
      const { rows: workflowSummary } = await pool.query(
        `SELECT
          COUNT(*) as total_workflows,
          COUNT(*) FILTER (WHERE status = 'completed') as completed,
          COUNT(*) FILTER (WHERE status = 'failed') as failed,
          AVG(EXTRACT(EPOCH FROM (completed_at - created_at))/3600) FILTER (WHERE completed_at IS NOT NULL) as avg_duration_hours
         FROM workflows
         WHERE organization_id = $1 AND created_at >= $2`,
        [organizationId, startDate]
      );

      // Cost summary
      let costSummary = null;
      try {
        const { rows } = await pool.query(
          `SELECT
            SUM(llm_cost) as total_llm_cost,
            SUM(media_cost) as total_media_cost,
            SUM(api_cost) as total_api_cost,
            SUM(llm_cost + media_cost + api_cost) as total_cost
           FROM usage_costs
           WHERE organization_id = $1 AND recorded_at >= $2`,
          [organizationId, startDate]
        );
        costSummary = rows[0];
      } catch {
        // Cost tracking tables may not exist
      }

      const report = {
        title: `Performance Report - ${orgName}`,
        period: {
          label: period,
          startDate: startDate.toISOString(),
          endDate: now.toISOString(),
        },
        generatedAt: new Date().toISOString(),
        sections: {
          campaigns: {
            title: 'Campaign Overview',
            data: campaignSummary[0] || {},
          },
          deliverables: {
            title: 'Deliverable Summary',
            byType: deliverableSummary,
            total: deliverableSummary.reduce((sum, d) => sum + parseInt(d.count, 10), 0),
          },
          workflows: {
            title: 'Workflow Performance',
            data: workflowSummary[0] || {},
          },
          ...(leadSummary && {
            leads: {
              title: 'Lead Summary',
              data: leadSummary,
            },
          }),
          ...(costSummary && costSummary.total_cost && {
            costs: {
              title: 'Cost Summary',
              data: costSummary,
            },
          }),
        },
      };

      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="report_${period}_${new Date().toISOString().split('T')[0]}.json"`);
      res.json(report);
    } catch (error: unknown) {
    const err = error as Error;
      logger.error('[ExportRoutes] Error generating report', { error });
      res.status(500).json({ error: 'Failed to generate report' });
    }
  }
);

export default router;
