/**
 * Reports Routes
 * Sprint 8: Reporting & Approvals
 *
 * API endpoints for report management, templates, sharing, and scheduling.
 */

import { Router, Request, Response } from 'express';
import { authenticateJWT, AuthenticatedRequest } from '../middleware/auth.js';
import { reportBuilderService, type CreateReportInput, type UpdateReportInput } from '../services/reportBuilderService.js';
import { reportSharingService, type ExportOptions, type CreateShareInput } from '../services/reportSharingService.js';
import { customMetricsService } from '../services/customMetricsService.js';
import { reportDeliveryWorker } from '../workers/reportDeliveryWorker.js';
import { logger } from '../utils/logger.js';

const router = Router();

// ============================================================================
// Report CRUD
// ============================================================================

/**
 * List all reports
 */
router.get('/', authenticateJWT, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    if (!organizationId) {
      return res.status(401).json({ error: 'Organization required' });
    }

    const reports = await reportBuilderService.listReports(organizationId);
    res.json(reports);
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('[Reports] List reports error', { error: err.message });
    res.status(500).json({ error: 'Failed to list reports' });
  }
});

/**
 * Get single report
 */
router.get('/:id', authenticateJWT, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    if (!organizationId) {
      return res.status(401).json({ error: 'Organization required' });
    }

    const report = await reportBuilderService.getReport(req.params.id, organizationId);
    if (!report) {
      return res.status(404).json({ error: 'Report not found' });
    }

    res.json(report);
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('[Reports] Get report error', { error: err.message });
    res.status(500).json({ error: 'Failed to get report' });
  }
});

/**
 * Create new report
 */
router.post('/', authenticateJWT, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    const userId = req.user?.id;
    if (!organizationId || !userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const { name, description, widgets, globalFilters, category, visibility, allowedRoles } = req.body;

    const input: CreateReportInput = {
      name,
      description,
      category,
      visibility,
      allowedRoles,
      definition: {
        layout: { columns: 12, rows: 6 },
        widgets: widgets || [],
        globalFilters: globalFilters || [],
      },
    };

    const report = await reportBuilderService.createReport(
      organizationId,
      userId,
      input
    );

    res.status(201).json(report);
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('[Reports] Create report error', { error: err.message });
    res.status(500).json({ error: 'Failed to create report' });
  }
});

/**
 * Update report
 */
router.put('/:id', authenticateJWT, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    if (!organizationId) {
      return res.status(401).json({ error: 'Organization required' });
    }

    const { name, description, widgets, globalFilters, category, visibility, allowedRoles } = req.body;

    const input: UpdateReportInput = {
      name,
      description,
      category,
      visibility,
      allowedRoles,
    };

    // Only include definition if widgets or globalFilters provided
    if (widgets || globalFilters) {
      input.definition = {
        layout: { columns: 12, rows: 6 },
        widgets: widgets || [],
        globalFilters: globalFilters || [],
      };
    }

    const report = await reportBuilderService.updateReport(
      req.params.id,
      organizationId,
      input
    );

    if (!report) {
      return res.status(404).json({ error: 'Report not found' });
    }

    res.json(report);
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('[Reports] Update report error', { error: err.message });
    res.status(500).json({ error: 'Failed to update report' });
  }
});

/**
 * Delete report
 */
router.delete('/:id', authenticateJWT, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    if (!organizationId) {
      return res.status(401).json({ error: 'Organization required' });
    }

    const success = await reportBuilderService.deleteReport(req.params.id, organizationId);
    if (!success) {
      return res.status(404).json({ error: 'Report not found' });
    }

    res.json({ success: true });
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('[Reports] Delete report error', { error: err.message });
    res.status(500).json({ error: 'Failed to delete report' });
  }
});

// ============================================================================
// Report Execution
// ============================================================================

/**
 * Execute report (generate data)
 */
router.post('/:id/execute', authenticateJWT, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    const userId = req.user?.id;
    if (!organizationId) {
      return res.status(401).json({ error: 'Organization required' });
    }

    const { filters, useCache } = req.body;

    const result = await reportBuilderService.executeReport(
      req.params.id,
      organizationId,
      filters || {},
      { useCache: useCache !== false, userId }
    );

    res.json(result);
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('[Reports] Execute report error', { error: err.message });
    res.status(500).json({ error: 'Failed to execute report' });
  }
});

/**
 * Get widget data
 */
router.post('/:id/widgets/:widgetId/data', authenticateJWT, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    if (!organizationId) {
      return res.status(401).json({ error: 'Organization required' });
    }

    // Get report with widgets
    const reportData = await reportBuilderService.getReportWithWidgets(req.params.id, organizationId);
    if (!reportData) {
      return res.status(404).json({ error: 'Report not found' });
    }

    const widget = reportData.widgets.find((w) => w.id === req.params.widgetId);
    if (!widget) {
      return res.status(404).json({ error: 'Widget not found' });
    }

    // Execute the full report and extract widget data
    const { filters } = req.body;
    const execution = await reportBuilderService.executeReport(
      req.params.id,
      organizationId,
      filters || {},
      { useCache: true }
    );

    const widgetData = (execution.data?.widgets as any)?.[req.params.widgetId];
    res.json(widgetData || { error: 'No data available' });
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('[Reports] Get widget data error', { error: err.message });
    res.status(500).json({ error: 'Failed to get widget data' });
  }
});

// ============================================================================
// Export
// ============================================================================

/**
 * Export report
 */
router.post('/:id/export', authenticateJWT, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    if (!organizationId) {
      return res.status(401).json({ error: 'Organization required' });
    }

    const { format, includeCharts, includeRawData, filters } = req.body;

    const options: ExportOptions = {
      format: format || 'pdf',
      includeCharts: includeCharts !== false,
      includeRawData: includeRawData || false,
      filters,
    };

    const result = await reportSharingService.exportReport(
      req.params.id,
      organizationId,
      options
    );

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    res.setHeader('Content-Type', result.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
    res.send(result.data);
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('[Reports] Export report error', { error: err.message });
    res.status(500).json({ error: 'Failed to export report' });
  }
});

// ============================================================================
// Sharing
// ============================================================================

/**
 * Create share link
 */
router.post('/:id/share', authenticateJWT, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    const userId = req.user?.id;
    if (!organizationId || !userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const { shareType, expiresIn, requiresAuth, password, allowedDomains, maxViews, canDownload, canExport } = req.body;

    // Parse expiration
    let expiresInDays: number | undefined;
    if (expiresIn && expiresIn !== 'never') {
      const days = parseInt(expiresIn.replace('d', ''));
      if (!isNaN(days)) {
        expiresInDays = days;
      }
    }

    const shareInput: CreateShareInput = {
      shareType: shareType || 'link',
      requiresAuth: requiresAuth || false,
      password,
      allowedDomains,
      maxViews,
      canDownload: canDownload || false,
      canExport: canExport || false,
      expiresInDays,
    };

    const share = await reportSharingService.createShare(
      req.params.id,
      organizationId,
      userId,
      shareInput
    );

    // Build share URL
    const baseUrl = process.env.APP_URL || 'https://app.arcus.ai';
    const shareUrl = `${baseUrl}/shared/reports/${share.shareToken}`;

    res.json({ ...share, shareUrl });
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('[Reports] Create share link error', { error: err.message });
    res.status(500).json({ error: 'Failed to create share link' });
  }
});

/**
 * List share links for a report
 */
router.get('/:id/shares', authenticateJWT, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    if (!organizationId) {
      return res.status(401).json({ error: 'Organization required' });
    }

    const shares = await reportSharingService.listShares(req.params.id);
    res.json(shares);
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('[Reports] List share links error', { error: err.message });
    res.status(500).json({ error: 'Failed to list share links' });
  }
});

/**
 * Revoke share link
 */
router.delete('/:id/shares/:shareId', authenticateJWT, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    if (!organizationId) {
      return res.status(401).json({ error: 'Organization required' });
    }

    const success = await reportSharingService.deleteShare(req.params.shareId, organizationId);
    if (!success) {
      return res.status(404).json({ error: 'Share not found' });
    }
    res.json({ success: true });
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('[Reports] Revoke share link error', { error: err.message });
    res.status(500).json({ error: 'Failed to revoke share link' });
  }
});

/**
 * Access shared report (public route)
 */
router.get('/shared/:token', async (req: Request, res: Response) => {
  try {
    const { token } = req.params;
    const { password } = req.query;

    const result = await reportSharingService.accessSharedReport(token, {
      password: password as string | undefined,
      ip: req.ip,
      referer: req.headers.referer,
    });

    if (!result.success) {
      const needsPassword = result.error === 'Password required';
      return res.status(needsPassword ? 401 : 404).json({
        error: result.error,
        requiresPassword: needsPassword,
      });
    }

    res.json(result.report);
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('[Reports] Access shared report error', { error: err.message });
    res.status(500).json({ error: 'Failed to access shared report' });
  }
});

// ============================================================================
// Schedules
// ============================================================================

/**
 * List schedules for a report
 */
router.get('/:id/schedules', authenticateJWT, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    if (!organizationId) {
      return res.status(401).json({ error: 'Organization required' });
    }

    const schedules = await reportBuilderService.listSchedules(req.params.id, organizationId);
    res.json(schedules);
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('[Reports] List schedules error', { error: err.message });
    res.status(500).json({ error: 'Failed to list schedules' });
  }
});

/**
 * Create schedule
 */
router.post('/:id/schedules', authenticateJWT, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    const userId = req.user?.id;
    if (!organizationId || !userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const {
      name,
      frequency,
      daysOfWeek,
      dayOfMonth,
      hour,
      minute,
      timezone,
      format,
      deliveryMethod,
      recipients,
      emailSubject,
      emailBody,
      includeLink,
    } = req.body;

    const schedule = await reportBuilderService.createSchedule(
      req.params.id,
      organizationId,
      userId,
      {
        name: name || `${frequency} schedule`,
        frequency,
        daysOfWeek,
        dayOfMonth,
        hour: hour || 9,
        minute: minute || 0,
        timezone: timezone || 'America/New_York',
        format: format || 'pdf',
        deliveryMethod: deliveryMethod || 'email',
        recipients,
        emailSubject,
        emailBody,
        includeLink: includeLink !== false,
      }
    );

    res.status(201).json(schedule);
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('[Reports] Create schedule error', { error: err.message });
    res.status(500).json({ error: 'Failed to create schedule' });
  }
});

/**
 * Update schedule
 */
router.put('/:id/schedules/:scheduleId', authenticateJWT, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    if (!organizationId) {
      return res.status(401).json({ error: 'Organization required' });
    }

    const schedule = await reportBuilderService.updateSchedule(
      req.params.scheduleId,
      organizationId,
      req.body
    );

    if (!schedule) {
      return res.status(404).json({ error: 'Schedule not found' });
    }

    res.json(schedule);
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('[Reports] Update schedule error', { error: err.message });
    res.status(500).json({ error: 'Failed to update schedule' });
  }
});

/**
 * Delete schedule
 */
router.delete('/:id/schedules/:scheduleId', authenticateJWT, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    if (!organizationId) {
      return res.status(401).json({ error: 'Organization required' });
    }

    const success = await reportBuilderService.deleteSchedule(
      req.params.scheduleId,
      organizationId
    );

    if (!success) {
      return res.status(404).json({ error: 'Schedule not found' });
    }

    res.json({ success: true });
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('[Reports] Delete schedule error', { error: err.message });
    res.status(500).json({ error: 'Failed to delete schedule' });
  }
});

/**
 * Execute schedule now
 */
router.post('/:id/schedules/:scheduleId/execute', authenticateJWT, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    if (!organizationId) {
      return res.status(401).json({ error: 'Organization required' });
    }

    const result = await reportDeliveryWorker.executeNow(
      req.params.scheduleId,
      organizationId
    );

    res.json(result);
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('[Reports] Execute schedule error', { error: err.message });
    res.status(500).json({ error: 'Failed to execute schedule' });
  }
});

/**
 * Test delivery
 */
router.post('/:id/test-delivery', authenticateJWT, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    if (!organizationId) {
      return res.status(401).json({ error: 'Organization required' });
    }

    const { format, recipient } = req.body;

    const result = await reportDeliveryWorker.testDelivery(
      req.params.id,
      organizationId,
      { format, recipient }
    );

    res.json(result);
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('[Reports] Test delivery error', { error: err.message });
    res.status(500).json({ error: 'Failed to test delivery' });
  }
});

// ============================================================================
// Templates
// ============================================================================

/**
 * List templates
 */
router.get('/templates', authenticateJWT, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    if (!organizationId) {
      return res.status(401).json({ error: 'Organization required' });
    }

    const { category } = req.query;
    const templates = await reportBuilderService.getTemplates(
      category as string | undefined
    );

    res.json(templates);
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('[Reports] List templates error', { error: err.message });
    res.status(500).json({ error: 'Failed to list templates' });
  }
});

/**
 * Get template
 */
router.get('/templates/:id', authenticateJWT, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    if (!organizationId) {
      return res.status(401).json({ error: 'Organization required' });
    }

    const template = await reportBuilderService.getTemplate(req.params.id);
    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }

    res.json(template);
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('[Reports] Get template error', { error: err.message });
    res.status(500).json({ error: 'Failed to get template' });
  }
});

/**
 * Create template from report
 */
router.post('/templates', authenticateJWT, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    const userId = req.user?.id;
    if (!organizationId || !userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const { name, description, category, definition, tags, reportId } = req.body;

    // If reportId is provided, create template from existing report
    let templateDefinition = definition;
    if (reportId) {
      const report = await reportBuilderService.getReport(reportId, organizationId);
      if (report) {
        templateDefinition = report.definition;
      }
    }

    // Create as a report with isTemplate flag
    const template = await reportBuilderService.createReport(
      organizationId,
      userId,
      {
        name,
        description,
        category: category || 'custom',
        definition: templateDefinition || {
          layout: { columns: 12, rows: 6 },
          widgets: [],
          globalFilters: [],
        },
      }
    );

    // Mark as template (would need service method for this)
    res.status(201).json(template);
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('[Reports] Create template error', { error: err.message });
    res.status(500).json({ error: 'Failed to create template' });
  }
});

/**
 * Delete template
 */
router.delete('/templates/:id', authenticateJWT, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    if (!organizationId) {
      return res.status(401).json({ error: 'Organization required' });
    }

    const success = await reportBuilderService.deleteReport(req.params.id, organizationId);
    if (!success) {
      return res.status(404).json({ error: 'Template not found' });
    }

    res.json({ success: true });
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('[Reports] Delete template error', { error: err.message });
    res.status(500).json({ error: 'Failed to delete template' });
  }
});

/**
 * Toggle template favorite
 */
router.post('/templates/:id/favorite', authenticateJWT, async (req: AuthenticatedRequest, res: Response) => {
  try {
    // For now, just return success - favorites would be stored in user preferences
    res.json({ success: true });
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('[Reports] Toggle favorite error', { error: err.message });
    res.status(500).json({ error: 'Failed to toggle favorite' });
  }
});

// ============================================================================
// Custom Metrics
// ============================================================================

/**
 * List custom metrics
 */
router.get('/metrics', authenticateJWT, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    if (!organizationId) {
      return res.status(401).json({ error: 'Organization required' });
    }

    const metrics = await customMetricsService.listMetrics(organizationId);
    res.json(metrics);
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('[Reports] List metrics error', { error: err.message });
    res.status(500).json({ error: 'Failed to list metrics' });
  }
});

/**
 * Create custom metric
 */
router.post('/metrics', authenticateJWT, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    const userId = req.user?.id;
    if (!organizationId || !userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const { name, description, formula, formulaType, dataSource, slug, outputType, thresholds } = req.body;

    const metric = await customMetricsService.createMetric(
      organizationId,
      userId,
      {
        name,
        description,
        slug: slug || name.toLowerCase().replace(/\s+/g, '_'),
        formula,
        formulaType: formulaType || 'sql',
        dataSource,
        outputType,
        thresholds,
      }
    );

    res.status(201).json(metric);
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('[Reports] Create metric error', { error: err.message });
    res.status(500).json({ error: 'Failed to create metric' });
  }
});

/**
 * Compute metric value
 */
router.post('/metrics/:id/compute', authenticateJWT, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    if (!organizationId) {
      return res.status(401).json({ error: 'Organization required' });
    }

    const { filters, comparison, useCache, timeSeries, timeSeriesGranularity } = req.body;

    const result = await customMetricsService.computeMetric(
      req.params.id,
      organizationId,
      { filters, comparison, useCache, timeSeries, timeSeriesGranularity }
    );

    res.json(result);
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('[Reports] Compute metric error', { error: err.message });
    res.status(500).json({ error: 'Failed to compute metric' });
  }
});

/**
 * Get metric time series
 */
router.post('/metrics/:id/timeseries', authenticateJWT, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    if (!organizationId) {
      return res.status(401).json({ error: 'Organization required' });
    }

    const { granularity, filters } = req.body;

    const result = await customMetricsService.computeMetric(
      req.params.id,
      organizationId,
      { filters, timeSeries: true, timeSeriesGranularity: granularity || 'day' }
    );

    res.json(result);
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('[Reports] Get metric time series error', { error: err.message });
    res.status(500).json({ error: 'Failed to get metric time series' });
  }
});

/**
 * Delete custom metric
 */
router.delete('/metrics/:id', authenticateJWT, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    if (!organizationId) {
      return res.status(401).json({ error: 'Organization required' });
    }

    const success = await customMetricsService.deleteMetric(req.params.id, organizationId);
    if (!success) {
      return res.status(404).json({ error: 'Metric not found' });
    }

    res.json({ success: true });
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('[Reports] Delete metric error', { error: err.message });
    res.status(500).json({ error: 'Failed to delete metric' });
  }
});

export default router;
