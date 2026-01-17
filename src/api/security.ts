/**
 * Security Routes
 *
 * Enterprise security management endpoints for:
 * - Security tier and settings management
 * - Provider whitelist management
 * - Audit log access
 * - Data deletion requests (GDPR/CCPA)
 * - Compliance reporting
 * - Geo-restriction settings and rules
 * - VPN detection settings
 * - Access log viewing
 */

import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { loadOrganizationContext, requirePermission } from '../middleware/multiTenancy.js';
import { enterpriseSecurityService, SecurityTier } from '../services/enterpriseSecurityService.js';
import { geoRestrictionService } from '../services/geoRestrictionService.js';
import { vpnDetectionService } from '../services/vpnDetectionService.js';
import { geoIPService } from '../services/geoIPService.js';
import { getGeoVPNInfo } from '../middleware/geoRestriction.js';
import { logger } from '../utils/logger.js';
import { pool } from '../database/db.js';
import { OrgRequest } from '../types/express.js';

const router = Router();

// Simple role-based authorization middleware
function requireRoles(allowedRoles: string[]) {
  return ((req: OrgRequest, res: Response, next: NextFunction) => {
    const userRole = req.org?.membership?.role_id || req.user?.role;
    if (!userRole || !allowedRoles.includes(userRole)) {
      return res.status(403).json({ error: 'INSUFFICIENT_PERMISSIONS', message: 'You do not have permission to perform this action' });
    }
    next();
  }) as any;
}

// All routes require authentication
router.use(requireAuth);

// ============================================================================
// SECURITY TIER & SETTINGS
// ============================================================================

/**
 * GET /api/security/context
 * Get the current organization's security context
 */
router.get('/context', (async (req: OrgRequest, res: Response) => {
  try {
    const organizationId = req.organizationId;
    if (!organizationId) {
      return res.status(400).json({ error: 'Organization context required' });
    }

    const context = await enterpriseSecurityService.getSecurityContext(organizationId);
    res.json(context);
  } catch (error) {
    logger.error('Failed to get security context:', error);
    res.status(500).json({ error: 'Failed to get security context' });
  }
}) as any);

/**
 * PUT /api/security/tier
 * Update organization's security tier (admin only)
 */
router.put('/tier', requireRoles(['admin', 'owner']), (async (req: OrgRequest, res: Response) => {
  try {
    const organizationId = req.organizationId;
    const userId = req.user?.id;
    const { tier } = req.body;

    if (!organizationId) {
      return res.status(400).json({ error: 'Organization context required' });
    }

    if (!['standard', 'enterprise', 'studio'].includes(tier)) {
      return res.status(400).json({ error: 'Invalid security tier' });
    }

    await enterpriseSecurityService.updateSecurityTier(organizationId, tier as SecurityTier, userId);

    res.json({ success: true, tier });
  } catch (error) {
    logger.error('Failed to update security tier:', error);
    res.status(500).json({ error: 'Failed to update security tier' });
  }
}) as any);

/**
 * PUT /api/security/settings
 * Update organization's security settings (admin only)
 */
router.put('/settings', requireRoles(['admin', 'owner']), (async (req: OrgRequest, res: Response) => {
  try {
    const organizationId = req.organizationId;
    const userId = req.user?.id;
    const { settings } = req.body;

    if (!organizationId) {
      return res.status(400).json({ error: 'Organization context required' });
    }

    await enterpriseSecurityService.updateSecuritySettings(organizationId, settings, userId);

    res.json({ success: true });
  } catch (error) {
    logger.error('Failed to update security settings:', error);
    res.status(500).json({ error: 'Failed to update security settings' });
  }
}) as any);

// ============================================================================
// PROVIDERS
// ============================================================================

/**
 * GET /api/security/providers
 * Get approved providers for the organization
 */
router.get('/providers', (async (req: OrgRequest, res: Response) => {
  try {
    const organizationId = req.organizationId;
    if (!organizationId) {
      return res.status(400).json({ error: 'Organization context required' });
    }

    const providers = await enterpriseSecurityService.getApprovedProviders(organizationId);
    res.json({ providers });
  } catch (error) {
    logger.error('Failed to get approved providers:', error);
    res.status(500).json({ error: 'Failed to get approved providers' });
  }
}) as any);

/**
 * POST /api/security/providers/check
 * Check if a specific model/provider is allowed
 */
router.post('/providers/check', (async (req: OrgRequest, res: Response) => {
  try {
    const organizationId = req.organizationId;
    const { model } = req.body;

    if (!organizationId) {
      return res.status(400).json({ error: 'Organization context required' });
    }

    if (!model) {
      return res.status(400).json({ error: 'Model is required' });
    }

    const result = await enterpriseSecurityService.isProviderAllowed(organizationId, model);
    res.json(result);
  } catch (error) {
    logger.error('Failed to check provider:', error);
    res.status(500).json({ error: 'Failed to check provider' });
  }
}) as any);

// ============================================================================
// AUDIT LOGS
// ============================================================================

/**
 * GET /api/security/audit-logs
 * Get LLM call audit logs for the organization
 */
router.get('/audit-logs', requireRoles(['admin', 'owner']), (async (req: OrgRequest, res: Response) => {
  try {
    const organizationId = req.organizationId;
    if (!organizationId) {
      return res.status(400).json({ error: 'Organization context required' });
    }

    const {
      startDate,
      endDate,
      provider,
      limit = '100',
      offset = '0',
    } = req.query;

    const logs = await enterpriseSecurityService.getAuditLogs(organizationId, {
      startDate: startDate ? new Date(startDate as string) : undefined,
      endDate: endDate ? new Date(endDate as string) : undefined,
      provider: provider as string | undefined,
      limit: parseInt(limit as string, 10),
      offset: parseInt(offset as string, 10),
    });

    res.json({ logs, count: logs.length });
  } catch (error) {
    logger.error('Failed to get audit logs:', error);
    res.status(500).json({ error: 'Failed to get audit logs' });
  }
}) as any);

// ============================================================================
// DATA DELETION (GDPR/CCPA)
// ============================================================================

/**
 * POST /api/security/deletion-request
 * Create a data deletion request
 */
router.post('/deletion-request', requireRoles(['admin', 'owner']), (async (req: OrgRequest, res: Response) => {
  try {
    const organizationId = req.organizationId;
    const userId = req.user?.id;
    const { requestType, scope, legalBasis } = req.body;

    if (!organizationId) {
      return res.status(400).json({ error: 'Organization context required' });
    }

    if (!requestType || !scope) {
      return res.status(400).json({ error: 'requestType and scope are required' });
    }

    const request = await enterpriseSecurityService.createDeletionRequest(
      organizationId,
      requestType,
      scope,
      userId,
      legalBasis
    );

    res.status(201).json({
      success: true,
      request,
      message: 'Deletion request created. 7-day grace period applies.',
    });
  } catch (error) {
    logger.error('Failed to create deletion request:', error);
    res.status(500).json({ error: 'Failed to create deletion request' });
  }
}) as any);

/**
 * DELETE /api/security/deletion-request/:id
 * Cancel a pending deletion request (within grace period)
 */
router.delete('/deletion-request/:id', requireRoles(['admin', 'owner']), (async (req: OrgRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const { id } = req.params;

    const cancelled = await enterpriseSecurityService.cancelDeletionRequest(id, userId);

    if (!cancelled) {
      return res.status(400).json({
        error: 'Cannot cancel request. Either not found, already processed, or grace period expired.',
      });
    }

    res.json({ success: true, message: 'Deletion request cancelled' });
  } catch (error) {
    logger.error('Failed to cancel deletion request:', error);
    res.status(500).json({ error: 'Failed to cancel deletion request' });
  }
}) as any);

// ============================================================================
// ENCRYPTION KEYS
// ============================================================================

/**
 * POST /api/security/rotate-key
 * Generate and rotate encryption key for the organization
 */
router.post('/rotate-key', requireRoles(['owner']), (async (req: OrgRequest, res: Response) => {
  try {
    const organizationId = req.organizationId;
    const userId = req.user?.id;

    if (!organizationId) {
      return res.status(400).json({ error: 'Organization context required' });
    }

    await enterpriseSecurityService.generateOrganizationKey(organizationId, userId);

    res.json({ success: true, message: 'Encryption key rotated successfully' });
  } catch (error) {
    logger.error('Failed to rotate encryption key:', error);
    res.status(500).json({ error: 'Failed to rotate encryption key' });
  }
}) as any);

// ============================================================================
// COMPLIANCE REPORTING
// ============================================================================

/**
 * GET /api/security/compliance-report
 * Generate a compliance report for the organization
 */
router.get('/compliance-report', requireRoles(['admin', 'owner']), (async (req: OrgRequest, res: Response) => {
  try {
    const organizationId = req.organizationId;
    if (!organizationId) {
      return res.status(400).json({ error: 'Organization context required' });
    }

    const report = await enterpriseSecurityService.generateComplianceReport(organizationId);
    res.json(report);
  } catch (error) {
    logger.error('Failed to generate compliance report:', error);
    res.status(500).json({ error: 'Failed to generate compliance report' });
  }
}) as any);

// ============================================================================
// SECURITY INCIDENTS
// ============================================================================

/**
 * POST /api/security/incident
 * Log a security incident
 */
router.post('/incident', requireRoles(['admin', 'owner']), (async (req: OrgRequest, res: Response) => {
  try {
    const organizationId = req.organizationId;
    const userId = req.user?.id;
    const { incidentType, severity, description } = req.body;

    if (!incidentType || !severity || !description) {
      return res.status(400).json({ error: 'incidentType, severity, and description are required' });
    }

    if (!['low', 'medium', 'high', 'critical'].includes(severity)) {
      return res.status(400).json({ error: 'Invalid severity level' });
    }

    const incidentId = await enterpriseSecurityService.logSecurityIncident(
      organizationId,
      incidentType,
      severity,
      description,
      userId
    );

    res.status(201).json({ success: true, incidentId });
  } catch (error) {
    logger.error('Failed to log security incident:', error);
    res.status(500).json({ error: 'Failed to log security incident' });
  }
}) as any);

// ============================================================================
// GEO-RESTRICTION VALIDATION SCHEMAS
// ============================================================================

const geoSettingsSchema = z.object({
  is_enabled: z.boolean().optional(),
  default_action: z.enum(['allow', 'block', 'warn', 'captcha']).optional(),
  enforcement_mode: z.enum(['strict', 'permissive', 'monitor']).optional(),
  bypass_roles: z.array(z.string()).optional(),
  log_all_requests: z.boolean().optional(),
});

const geoEntrySchema = z.object({
  country_code: z.string().length(2).optional(),
  region_code: z.string().max(10).optional(),
  action: z.enum(['allow', 'block', 'warn', 'captcha']),
  priority: z.number().int().min(0).max(1000).optional(),
  description: z.string().max(500).optional(),
  is_active: z.boolean().optional(),
});

const vpnSettingsSchema = z.object({
  is_enabled: z.boolean().optional(),
  vpn_action: z.enum(['allow', 'block', 'warn', 'captcha']).optional(),
  proxy_action: z.enum(['allow', 'block', 'warn', 'captcha']).optional(),
  tor_action: z.enum(['allow', 'block', 'warn', 'captcha']).optional(),
  datacenter_action: z.enum(['allow', 'block', 'warn', 'captcha']).optional(),
  bypass_roles: z.array(z.string()).optional(),
  confidence_threshold: z.number().min(0).max(100).optional(),
  log_all_requests: z.boolean().optional(),
});

const knownRangeSchema = z.object({
  cidr_range: z.string(),
  range_type: z.enum(['vpn', 'proxy', 'tor', 'datacenter', 'relay', 'residential_proxy']),
  provider_name: z.string().max(100).optional(),
  description: z.string().max(500).optional(),
  is_active: z.boolean().optional(),
});

const accessLogQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(1000).default(100),
  offset: z.coerce.number().int().min(0).default(0),
  action: z.enum(['allow', 'block', 'warn', 'captcha']).optional(),
  was_allowed: z.coerce.boolean().optional(),
  country_code: z.string().length(2).optional(),
  is_vpn: z.coerce.boolean().optional(),
  start_date: z.string().datetime().optional(),
  end_date: z.string().datetime().optional(),
});

const ipCheckSchema = z.object({
  ip_address: z.string().ip(),
});

// ============================================================================
// GEO-RESTRICTION ROUTES
// ============================================================================

/**
 * GET /api/security/geo/settings
 * Get geo-restriction settings for the organization
 */
router.get(
  '/geo/settings',
  loadOrganizationContext,
  requirePermission('security.read'),
  async (req: Request, res: Response) => {
      const orgReq = req as unknown as OrgRequest;
    try {
      const organizationId = orgReq.org?.organization?.id || orgReq.organizationId;
      if (!organizationId) {
        return res.status(400).json({ error: 'Organization context required' });
      }
      const settings = await geoRestrictionService.getSettings(organizationId);
      res.json({ success: true, data: settings });
    } catch (error) {
      logger.error('Failed to get geo settings', { error });
      res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Failed to get geo settings' });
    }
  }
);

/**
 * PUT /api/security/geo/settings
 * Update geo-restriction settings
 */
router.put(
  '/geo/settings',
  loadOrganizationContext,
  requirePermission('security.manage'),
  async (req: Request, res: Response) => {
      const orgReq = req as unknown as OrgRequest;
    try {
      const organizationId = orgReq.org?.organization?.id || orgReq.organizationId;
      const userId = orgReq.user?.id;

      if (!organizationId) {
        return res.status(400).json({ error: 'Organization context required' });
      }

      const parsed = geoSettingsSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: 'VALIDATION_ERROR',
          message: 'Invalid settings data',
          details: parsed.error.errors,
        });
      }

      // Map snake_case fields to camelCase for service
      const serviceInput = {
        isEnabled: parsed.data.is_enabled,
        restrictionMode: parsed.data.default_action === 'allow' ? 'allowlist' as const : 'blocklist' as const,
        blockAction: parsed.data.default_action === 'allow' ? 'block' as const : (parsed.data.default_action as 'block' | 'warn' | 'captcha'),
        bypassForAdmins: parsed.data.bypass_roles?.includes('admin'),
        bypassRoleIds: parsed.data.bypass_roles,
        logAllAccess: parsed.data.log_all_requests,
      };

      const settings = await geoRestrictionService.upsertSettings(organizationId, serviceInput, userId);
      res.json({ success: true, data: settings });
    } catch (error) {
      logger.error('Failed to update geo settings', { error });
      res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Failed to update geo settings' });
    }
  }
);

/**
 * GET /api/security/geo/entries
 * List geo-restriction entries (countries/regions)
 */
router.get(
  '/geo/entries',
  loadOrganizationContext,
  requirePermission('security.read'),
  async (req: Request, res: Response) => {
      const orgReq = req as unknown as OrgRequest;
    try {
      const organizationId = orgReq.org?.organization?.id || orgReq.organizationId;
      if (!organizationId) {
        return res.status(400).json({ error: 'Organization context required' });
      }
      const entries = await geoRestrictionService.getEntries(organizationId);
      res.json({ success: true, data: entries });
    } catch (error) {
      logger.error('Failed to get geo entries', { error });
      res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Failed to get geo entries' });
    }
  }
);

/**
 * POST /api/security/geo/entries
 * Create a new geo-restriction entry
 */
router.post(
  '/geo/entries',
  loadOrganizationContext,
  requirePermission('security.manage'),
  async (req: Request, res: Response) => {
      const orgReq = req as unknown as OrgRequest;
    try {
      const organizationId = orgReq.org?.organization?.id || orgReq.organizationId;
      const userId = orgReq.user?.id;

      if (!organizationId) {
        return res.status(400).json({ error: 'Organization context required' });
      }

      const parsed = geoEntrySchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: 'VALIDATION_ERROR',
          message: 'Invalid entry data',
          details: parsed.error.errors,
        });
      }

      // Require at least country_code or region_code
      if (!parsed.data.country_code && !parsed.data.region_code) {
        return res.status(400).json({
          error: 'VALIDATION_ERROR',
          message: 'Either country_code or region_code is required',
        });
      }

      // Map snake_case to camelCase for service
      const serviceInput = {
        countryCode: parsed.data.country_code || '',
        regionCode: parsed.data.region_code,
        entryType: parsed.data.action === 'allow' ? 'allow' as const : 'block' as const,
        description: parsed.data.description,
        isActive: parsed.data.is_active,
      };

      const entry = await geoRestrictionService.createEntry(organizationId, serviceInput, userId);
      res.status(201).json({ success: true, data: entry });
    } catch (error) {
      logger.error('Failed to create geo entry', { error });
      res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Failed to create geo entry' });
    }
  }
);

/**
 * PUT /api/security/geo/entries/:entryId
 * Update a geo-restriction entry
 */
router.put(
  '/geo/entries/:entryId',
  loadOrganizationContext,
  requirePermission('security.manage'),
  async (req: Request, res: Response) => {
      const orgReq = req as unknown as OrgRequest;
    try {
      const organizationId = orgReq.org?.organization?.id || orgReq.organizationId;
      const { entryId } = req.params;

      if (!organizationId) {
        return res.status(400).json({ error: 'Organization context required' });
      }

      const parsed = geoEntrySchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: 'VALIDATION_ERROR',
          message: 'Invalid entry data',
          details: parsed.error.errors,
        });
      }

      // Map snake_case to camelCase for service
      const serviceInput: {
        countryCode?: string;
        regionCode?: string;
        entryType?: 'allow' | 'block';
        description?: string;
        isActive?: boolean;
      } = {};

      if (parsed.data.country_code !== undefined) serviceInput.countryCode = parsed.data.country_code;
      if (parsed.data.region_code !== undefined) serviceInput.regionCode = parsed.data.region_code;
      if (parsed.data.action !== undefined) serviceInput.entryType = parsed.data.action === 'allow' ? 'allow' : 'block';
      if (parsed.data.description !== undefined) serviceInput.description = parsed.data.description;
      if (parsed.data.is_active !== undefined) serviceInput.isActive = parsed.data.is_active;

      const entry = await geoRestrictionService.updateEntry(entryId, organizationId, serviceInput);
      if (!entry) {
        return res.status(404).json({ error: 'NOT_FOUND', message: 'Geo entry not found' });
      }

      res.json({ success: true, data: entry });
    } catch (error) {
      logger.error('Failed to update geo entry', { error });
      res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Failed to update geo entry' });
    }
  }
);

/**
 * DELETE /api/security/geo/entries/:entryId
 * Delete a geo-restriction entry
 */
router.delete(
  '/geo/entries/:entryId',
  loadOrganizationContext,
  requirePermission('security.manage'),
  async (req: Request, res: Response) => {
      const orgReq = req as unknown as OrgRequest;
    try {
      const organizationId = orgReq.org?.organization?.id || orgReq.organizationId;
      const { entryId } = req.params;

      if (!organizationId) {
        return res.status(400).json({ error: 'Organization context required' });
      }

      await geoRestrictionService.deleteEntry(entryId, organizationId);
      res.json({ success: true, message: 'Geo entry deleted' });
    } catch (error) {
      logger.error('Failed to delete geo entry', { error });
      res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Failed to delete geo entry' });
    }
  }
);

// ============================================================================
// VPN DETECTION ROUTES
// ============================================================================

/**
 * GET /api/security/vpn/settings
 * Get VPN detection settings for the organization
 */
router.get(
  '/vpn/settings',
  loadOrganizationContext,
  requirePermission('security.read'),
  async (req: Request, res: Response) => {
      const orgReq = req as unknown as OrgRequest;
    try {
      const organizationId = orgReq.org?.organization?.id || orgReq.organizationId;
      if (!organizationId) {
        return res.status(400).json({ error: 'Organization context required' });
      }
      const settings = await vpnDetectionService.getSettings(organizationId);
      res.json({ success: true, data: settings });
    } catch (error) {
      logger.error('Failed to get VPN settings', { error });
      res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Failed to get VPN settings' });
    }
  }
);

/**
 * PUT /api/security/vpn/settings
 * Update VPN detection settings
 */
router.put(
  '/vpn/settings',
  loadOrganizationContext,
  requirePermission('security.manage'),
  async (req: Request, res: Response) => {
      const orgReq = req as unknown as OrgRequest;
    try {
      const organizationId = orgReq.org?.organization?.id || orgReq.organizationId;
      const userId = orgReq.user?.id;

      if (!organizationId) {
        return res.status(400).json({ error: 'Organization context required' });
      }

      const parsed = vpnSettingsSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: 'VALIDATION_ERROR',
          message: 'Invalid settings data',
          details: parsed.error.errors,
        });
      }

      // Map snake_case fields to camelCase for service
      const serviceInput = {
        isEnabled: parsed.data.is_enabled,
        detectionPolicy: parsed.data.vpn_action === 'block' ? 'block' as const :
                        parsed.data.vpn_action === 'warn' ? 'warn' as const : 'allow' as const,
        detectVpn: parsed.data.vpn_action !== 'allow',
        detectProxy: parsed.data.proxy_action !== 'allow',
        detectTor: parsed.data.tor_action !== 'allow',
        detectDatacenter: parsed.data.datacenter_action !== 'allow',
        bypassForAdmins: parsed.data.bypass_roles?.includes('admin'),
        bypassRoleIds: parsed.data.bypass_roles,
        confidenceThreshold: parsed.data.confidence_threshold,
      };

      const settings = await vpnDetectionService.upsertSettings(organizationId, serviceInput, userId);
      res.json({ success: true, data: settings });
    } catch (error) {
      logger.error('Failed to update VPN settings', { error });
      res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Failed to update VPN settings' });
    }
  }
);

/**
 * GET /api/security/vpn/ranges
 * List known VPN/proxy ranges (global + organization)
 */
router.get(
  '/vpn/ranges',
  loadOrganizationContext,
  requirePermission('security.read'),
  async (req: Request, res: Response) => {
      const orgReq = req as unknown as OrgRequest;
    try {
      const organizationId = orgReq.org?.organization?.id || orgReq.organizationId;
      if (!organizationId) {
        return res.status(400).json({ error: 'Organization context required' });
      }
      const ranges = await vpnDetectionService.getKnownRanges(organizationId);
      res.json({ success: true, data: ranges });
    } catch (error) {
      logger.error('Failed to get VPN ranges', { error });
      res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Failed to get VPN ranges' });
    }
  }
);

/**
 * POST /api/security/vpn/ranges
 * Add a custom VPN/proxy range for the organization
 */
router.post(
  '/vpn/ranges',
  loadOrganizationContext,
  requirePermission('security.manage'),
  async (req: Request, res: Response) => {
      const orgReq = req as unknown as OrgRequest;
    try {
      const organizationId = orgReq.org?.organization?.id || orgReq.organizationId;
      const userId = orgReq.user?.id;

      if (!organizationId) {
        return res.status(400).json({ error: 'Organization context required' });
      }

      const parsed = knownRangeSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: 'VALIDATION_ERROR',
          message: 'Invalid range data',
          details: parsed.error.errors,
        });
      }

      const range = await vpnDetectionService.addKnownRange(organizationId, parsed.data, userId);
      res.status(201).json({ success: true, data: range });
    } catch (error) {
      logger.error('Failed to add VPN range', { error });
      res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Failed to add VPN range' });
    }
  }
);

/**
 * PUT /api/security/vpn/ranges/:rangeId
 * Update a custom VPN/proxy range
 */
router.put(
  '/vpn/ranges/:rangeId',
  loadOrganizationContext,
  requirePermission('security.manage'),
  async (req: Request, res: Response) => {
      const orgReq = req as unknown as OrgRequest;
    try {
      const organizationId = orgReq.org?.organization?.id || orgReq.organizationId;
      const { rangeId } = req.params;

      if (!organizationId) {
        return res.status(400).json({ error: 'Organization context required' });
      }

      const parsed = knownRangeSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: 'VALIDATION_ERROR',
          message: 'Invalid range data',
          details: parsed.error.errors,
        });
      }

      const range = await vpnDetectionService.updateKnownRange(rangeId, organizationId, parsed.data);
      if (!range) {
        return res.status(404).json({ error: 'NOT_FOUND', message: 'VPN range not found' });
      }

      res.json({ success: true, data: range });
    } catch (error) {
      logger.error('Failed to update VPN range', { error });
      res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Failed to update VPN range' });
    }
  }
);

/**
 * DELETE /api/security/vpn/ranges/:rangeId
 * Delete a custom VPN/proxy range
 */
router.delete(
  '/vpn/ranges/:rangeId',
  loadOrganizationContext,
  requirePermission('security.manage'),
  async (req: Request, res: Response) => {
      const orgReq = req as unknown as OrgRequest;
    try {
      const organizationId = orgReq.org?.organization?.id || orgReq.organizationId;
      const { rangeId } = req.params;

      if (!organizationId) {
        return res.status(400).json({ error: 'Organization context required' });
      }

      await vpnDetectionService.deleteKnownRange(rangeId, organizationId);
      res.json({ success: true, message: 'VPN range deleted' });
    } catch (error) {
      logger.error('Failed to delete VPN range', { error });
      res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Failed to delete VPN range' });
    }
  }
);

// ============================================================================
// IP CHECK & LOOKUP ROUTES
// ============================================================================

/**
 * POST /api/security/check-ip
 * Check an IP address against geo and VPN restrictions
 */
router.post(
  '/check-ip',
  loadOrganizationContext,
  requirePermission('security.read'),
  async (req: Request, res: Response) => {
      const orgReq = req as unknown as OrgRequest;
    try {
      const organizationId = orgReq.org?.organization?.id || orgReq.organizationId;

      if (!organizationId) {
        return res.status(400).json({ error: 'Organization context required' });
      }

      const parsed = ipCheckSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: 'VALIDATION_ERROR',
          message: 'Invalid IP address',
          details: parsed.error.errors,
        });
      }

      const { ip_address } = parsed.data;
      const result = await getGeoVPNInfo(organizationId, ip_address);

      res.json({
        success: true,
        data: {
          ip_address,
          geo: result.geo,
          vpn: result.vpn,
        },
      });
    } catch (error) {
      logger.error('Failed to check IP', { error });
      res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Failed to check IP' });
    }
  }
);

/**
 * POST /api/security/lookup-ip
 * Lookup geo information for an IP address (without restriction check)
 */
router.post(
  '/lookup-ip',
  loadOrganizationContext,
  requirePermission('security.read'),
  async (req: Request, res: Response) => {
      const orgReq = req as unknown as OrgRequest;
    try {
      const parsed = ipCheckSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: 'VALIDATION_ERROR',
          message: 'Invalid IP address',
          details: parsed.error.errors,
        });
      }

      const { ip_address } = parsed.data;
      const geoInfo = await geoIPService.lookup(ip_address);

      res.json({
        success: true,
        data: geoInfo,
      });
    } catch (error) {
      logger.error('Failed to lookup IP', { error });
      res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Failed to lookup IP' });
    }
  }
);

// ============================================================================
// GEO/VPN ACCESS LOG ROUTES
// ============================================================================

/**
 * GET /api/security/geo-vpn-logs
 * Get geo/VPN access logs for the organization
 */
router.get(
  '/geo-vpn-logs',
  loadOrganizationContext,
  requirePermission('security.audit'),
  async (req: Request, res: Response) => {
      const orgReq = req as unknown as OrgRequest;
    try {
      const organizationId = orgReq.org?.organization?.id || orgReq.organizationId;

      if (!organizationId) {
        return res.status(400).json({ error: 'Organization context required' });
      }

      const parsed = accessLogQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        return res.status(400).json({
          error: 'VALIDATION_ERROR',
          message: 'Invalid query parameters',
          details: parsed.error.errors,
        });
      }

      const { limit, offset, action, was_allowed, country_code, is_vpn, start_date, end_date } =
        parsed.data;

      // Build query
      let query = `
        SELECT
          id, ip_address, country_code, region_code,
          is_vpn, is_proxy, is_tor, is_datacenter,
          was_allowed, action, denial_reason,
          request_path, request_method, user_agent,
          user_id, created_at
        FROM geo_vpn_access_logs
        WHERE organization_id = $1
      `;
      const params: unknown[] = [organizationId];
      let paramIndex = 2;

      if (action !== undefined) {
        query += ` AND action = $${paramIndex++}`;
        params.push(action);
      }
      if (was_allowed !== undefined) {
        query += ` AND was_allowed = $${paramIndex++}`;
        params.push(was_allowed);
      }
      if (country_code !== undefined) {
        query += ` AND country_code = $${paramIndex++}`;
        params.push(country_code);
      }
      if (is_vpn !== undefined) {
        query += ` AND is_vpn = $${paramIndex++}`;
        params.push(is_vpn);
      }
      if (start_date !== undefined) {
        query += ` AND created_at >= $${paramIndex++}`;
        params.push(start_date);
      }
      if (end_date !== undefined) {
        query += ` AND created_at <= $${paramIndex++}`;
        params.push(end_date);
      }

      query += ` ORDER BY created_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
      params.push(limit, offset);

      const result = await pool.query(query, params);

      // Get total count
      let countQuery = `SELECT COUNT(*) FROM geo_vpn_access_logs WHERE organization_id = $1`;
      const countParams: unknown[] = [organizationId];
      let countParamIndex = 2;

      if (action !== undefined) {
        countQuery += ` AND action = $${countParamIndex++}`;
        countParams.push(action);
      }
      if (was_allowed !== undefined) {
        countQuery += ` AND was_allowed = $${countParamIndex++}`;
        countParams.push(was_allowed);
      }
      if (country_code !== undefined) {
        countQuery += ` AND country_code = $${countParamIndex++}`;
        countParams.push(country_code);
      }
      if (is_vpn !== undefined) {
        countQuery += ` AND is_vpn = $${countParamIndex++}`;
        countParams.push(is_vpn);
      }
      if (start_date !== undefined) {
        countQuery += ` AND created_at >= $${countParamIndex++}`;
        countParams.push(start_date);
      }
      if (end_date !== undefined) {
        countQuery += ` AND created_at <= $${countParamIndex++}`;
        countParams.push(end_date);
      }

      const countResult = await pool.query(countQuery, countParams);
      const total = parseInt(countResult.rows[0].count, 10);

      res.json({
        success: true,
        data: result.rows,
        pagination: {
          total,
          limit,
          offset,
          hasMore: offset + result.rows.length < total,
        },
      });
    } catch (error) {
      logger.error('Failed to get access logs', { error });
      res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Failed to get access logs' });
    }
  }
);

/**
 * GET /api/security/geo-vpn-logs/stats
 * Get statistics for geo/VPN access logs
 */
router.get(
  '/geo-vpn-logs/stats',
  loadOrganizationContext,
  requirePermission('security.audit'),
  async (req: Request, res: Response) => {
      const orgReq = req as unknown as OrgRequest;
    try {
      const organizationId = orgReq.org?.organization?.id || orgReq.organizationId;

      if (!organizationId) {
        return res.status(400).json({ error: 'Organization context required' });
      }

      // Get various statistics
      const statsQuery = `
        SELECT
          COUNT(*) as total_requests,
          COUNT(*) FILTER (WHERE was_allowed = true) as allowed_requests,
          COUNT(*) FILTER (WHERE was_allowed = false) as blocked_requests,
          COUNT(*) FILTER (WHERE is_vpn = true) as vpn_requests,
          COUNT(*) FILTER (WHERE is_proxy = true) as proxy_requests,
          COUNT(*) FILTER (WHERE is_tor = true) as tor_requests,
          COUNT(DISTINCT ip_address) as unique_ips,
          COUNT(DISTINCT country_code) as unique_countries
        FROM geo_vpn_access_logs
        WHERE organization_id = $1
          AND created_at >= NOW() - INTERVAL '30 days'
      `;

      // Get top blocked countries
      const topBlockedQuery = `
        SELECT country_code, COUNT(*) as count
        FROM geo_vpn_access_logs
        WHERE organization_id = $1
          AND was_allowed = false
          AND created_at >= NOW() - INTERVAL '30 days'
        GROUP BY country_code
        ORDER BY count DESC
        LIMIT 10
      `;

      // Get daily trend (last 30 days)
      const trendQuery = `
        SELECT
          DATE(created_at) as date,
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE was_allowed = false) as blocked
        FROM geo_vpn_access_logs
        WHERE organization_id = $1
          AND created_at >= NOW() - INTERVAL '30 days'
        GROUP BY DATE(created_at)
        ORDER BY date
      `;

      const [statsResult, topBlockedResult, trendResult] = await Promise.all([
        pool.query(statsQuery, [organizationId]),
        pool.query(topBlockedQuery, [organizationId]),
        pool.query(trendQuery, [organizationId]),
      ]);

      res.json({
        success: true,
        data: {
          summary: statsResult.rows[0],
          top_blocked_countries: topBlockedResult.rows,
          daily_trend: trendResult.rows,
        },
      });
    } catch (error) {
      logger.error('Failed to get access log stats', { error });
      res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Failed to get access log stats' });
    }
  }
);

// ============================================================================
// COUNTRY/REGION REFERENCE DATA
// ============================================================================

/**
 * GET /api/security/countries
 * Get list of all countries for dropdown
 */
router.get('/countries', async (_req: Request, res: Response) => {
  try {
    // Common countries list (ISO 3166-1 alpha-2)
    const countries = [
      { code: 'US', name: 'United States' },
      { code: 'CA', name: 'Canada' },
      { code: 'GB', name: 'United Kingdom' },
      { code: 'DE', name: 'Germany' },
      { code: 'FR', name: 'France' },
      { code: 'JP', name: 'Japan' },
      { code: 'AU', name: 'Australia' },
      { code: 'NL', name: 'Netherlands' },
      { code: 'SE', name: 'Sweden' },
      { code: 'NO', name: 'Norway' },
      { code: 'DK', name: 'Denmark' },
      { code: 'FI', name: 'Finland' },
      { code: 'CH', name: 'Switzerland' },
      { code: 'AT', name: 'Austria' },
      { code: 'BE', name: 'Belgium' },
      { code: 'IE', name: 'Ireland' },
      { code: 'NZ', name: 'New Zealand' },
      { code: 'SG', name: 'Singapore' },
      { code: 'HK', name: 'Hong Kong' },
      { code: 'KR', name: 'South Korea' },
      { code: 'IT', name: 'Italy' },
      { code: 'ES', name: 'Spain' },
      { code: 'PT', name: 'Portugal' },
      { code: 'PL', name: 'Poland' },
      { code: 'CZ', name: 'Czech Republic' },
      { code: 'RO', name: 'Romania' },
      { code: 'HU', name: 'Hungary' },
      { code: 'GR', name: 'Greece' },
      { code: 'TR', name: 'Turkey' },
      { code: 'RU', name: 'Russia' },
      { code: 'CN', name: 'China' },
      { code: 'IN', name: 'India' },
      { code: 'BR', name: 'Brazil' },
      { code: 'MX', name: 'Mexico' },
      { code: 'AR', name: 'Argentina' },
      { code: 'CL', name: 'Chile' },
      { code: 'CO', name: 'Colombia' },
      { code: 'ZA', name: 'South Africa' },
      { code: 'EG', name: 'Egypt' },
      { code: 'NG', name: 'Nigeria' },
      { code: 'KE', name: 'Kenya' },
      { code: 'AE', name: 'United Arab Emirates' },
      { code: 'SA', name: 'Saudi Arabia' },
      { code: 'IL', name: 'Israel' },
      { code: 'TW', name: 'Taiwan' },
      { code: 'TH', name: 'Thailand' },
      { code: 'VN', name: 'Vietnam' },
      { code: 'MY', name: 'Malaysia' },
      { code: 'ID', name: 'Indonesia' },
      { code: 'PH', name: 'Philippines' },
    ].sort((a, b) => a.name.localeCompare(b.name));

    res.json({ success: true, data: countries });
  } catch (error) {
    logger.error('Failed to get countries list', { error });
    res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Failed to get countries list' });
  }
});

export default router;
