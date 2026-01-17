/**
 * White-Label Routes
 *
 * API endpoints for white-label configuration and management:
 * - Branding configuration
 * - Domain management (subdomains and custom domains)
 * - Email branding
 * - Reseller client management
 */

import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requireOrganization, requirePermission } from '../middleware/multiTenancy.js';
import { whiteLabelService } from '../services/whiteLabelService.js';
import { domainVerificationService } from '../services/domainVerificationService.js';
import { logger } from '../utils/logger.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = Router();

// All routes require authentication and organization context
router.use(requireAuth);
router.use(requireOrganization);

// Most routes require org.manage permission
const requireManagePermission = requirePermission('org.manage');

// ============================================================================
// CONFIGURATION
// ============================================================================

/**
 * GET /api/white-label/config
 * Get current white-label configuration
 */
router.get('/config', asyncHandler(async (req: Request, res: Response) => {
  const orgId = req.org!.organization.id;

  const config = await whiteLabelService.getConfig(orgId);

  res.json({
    config: config || {
      organization_id: orgId,
      status: 'not_configured',
      reseller_enabled: false,
    },
  });
}));

/**
 * PUT /api/white-label/config
 * Update white-label configuration
 */
router.put('/config', requireManagePermission, asyncHandler(async (req: Request, res: Response) => {
  const orgId = req.org!.organization.id;
  const {
    brand_name,
    logo_url,
    logo_dark_url,
    favicon_url,
    primary_color,
    secondary_color,
    accent_color,
    font_family,
    feature_flags,
    hidden_features,
    custom_terminology,
  } = req.body;

  const config = await whiteLabelService.updateConfig(orgId, {
    brand_name,
    logo_url,
    logo_dark_url,
    favicon_url,
    primary_color,
    secondary_color,
    accent_color,
    font_family,
    feature_flags,
    hidden_features,
    custom_terminology,
  });

  res.json({ config });
}));

// ============================================================================
// DOMAIN MANAGEMENT
// ============================================================================

/**
 * POST /api/white-label/subdomain
 * Set subdomain for organization
 */
router.post('/subdomain', requireManagePermission, asyncHandler(async (req: Request, res: Response) => {
  const orgId = req.org!.organization.id;
  const { subdomain } = req.body;

  if (!subdomain) {
    return res.status(400).json({
      error: {
        code: 'MISSING_SUBDOMAIN',
        message: 'Subdomain is required',
      },
    });
  }

  try {
    await whiteLabelService.setSubdomain(orgId, subdomain);

    res.json({
      success: true,
      subdomain,
      full_domain: `${subdomain}.arcus.io`,
      url: `https://${subdomain}.arcus.io`,
    });
  } catch (error: unknown) {
    const err = error as Error;
    if (error instanceof Error) {
      if (err.message === 'INVALID_SUBDOMAIN_FORMAT') {
        return res.status(400).json({
          error: {
            code: 'INVALID_SUBDOMAIN_FORMAT',
            message: 'Subdomain can only contain lowercase letters, numbers, and hyphens',
          },
        });
      }
      if (err.message === 'SUBDOMAIN_ALREADY_TAKEN') {
        return res.status(409).json({
          error: {
            code: 'SUBDOMAIN_ALREADY_TAKEN',
            message: 'This subdomain is already taken',
          },
        });
      }
    }
    throw error;
  }
}));

/**
 * POST /api/white-label/domain
 * Set custom domain and initiate verification
 */
router.post('/domain', requireManagePermission, asyncHandler(async (req: Request, res: Response) => {
  const orgId = req.org!.organization.id;
  const { domain, verification_method } = req.body;

  if (!domain) {
    return res.status(400).json({
      error: {
        code: 'MISSING_DOMAIN',
        message: 'Domain is required',
      },
    });
  }

  const method = verification_method || 'dns_txt';

  if (!['dns_txt', 'dns_cname', 'file'].includes(method)) {
    return res.status(400).json({
      error: {
        code: 'INVALID_VERIFICATION_METHOD',
        message: 'Verification method must be dns_txt, dns_cname, or file',
      },
    });
  }

  try {
    const result = await whiteLabelService.setCustomDomain(
      orgId,
      domain,
      method as 'dns_txt' | 'dns_cname' | 'file'
    );

    res.json({
      success: true,
      domain: result.domain,
      verification: result.verification,
    });
  } catch (error: unknown) {
    const err = error as Error;
    if (error instanceof Error) {
      if (err.message === 'INVALID_DOMAIN') {
        return res.status(400).json({
          error: {
            code: 'INVALID_DOMAIN',
            message: 'Invalid domain format',
          },
        });
      }
      if (err.message === 'DOMAIN_ALREADY_VERIFIED') {
        return res.status(409).json({
          error: {
            code: 'DOMAIN_ALREADY_VERIFIED',
            message: 'This domain is already verified by another organization',
          },
        });
      }
    }
    throw error;
  }
}));

/**
 * GET /api/white-label/domain/verify
 * Check domain verification status
 */
router.get('/domain/verify', requireManagePermission, asyncHandler(async (req: Request, res: Response) => {
  const orgId = req.org!.organization.id;

  const result = await whiteLabelService.verifyDomain(orgId);

  res.json(result);
}));

/**
 * POST /api/white-label/domain/provision-ssl
 * Provision SSL certificate for verified domain
 */
router.post('/domain/provision-ssl', requireManagePermission, asyncHandler(async (req: Request, res: Response) => {
  const orgId = req.org!.organization.id;

  const config = await whiteLabelService.getConfig(orgId);

  if (!config || !config.custom_domain) {
    return res.status(400).json({
      error: {
        code: 'NO_CUSTOM_DOMAIN',
        message: 'No custom domain configured',
      },
    });
  }

  if (!config.custom_domain_verified) {
    return res.status(400).json({
      error: {
        code: 'DOMAIN_NOT_VERIFIED',
        message: 'Domain must be verified before provisioning SSL',
      },
    });
  }

  await domainVerificationService.provisionSSL(config.custom_domain);

  res.json({
    success: true,
    message: 'SSL provisioning initiated. This may take a few minutes.',
  });
}));

// ============================================================================
// BRANDING
// ============================================================================

/**
 * PUT /api/white-label/branding
 * Update branding configuration
 */
router.put('/branding', requireManagePermission, asyncHandler(async (req: Request, res: Response) => {
  const orgId = req.org!.organization.id;
  const {
    brand_name,
    logo_url,
    logo_dark_url,
    favicon_url,
    primary_color,
    secondary_color,
    accent_color,
    font_family,
  } = req.body;

  await whiteLabelService.setBranding(orgId, {
    brand_name,
    logo_url,
    logo_dark_url,
    favicon_url,
    primary_color,
    secondary_color,
    accent_color,
    font_family,
  });

  res.json({ success: true });
}));

/**
 * GET /api/white-label/branding/preview
 * Get preview URL for current branding
 */
router.get('/branding/preview', asyncHandler(async (req: Request, res: Response) => {
  const orgId = req.org!.organization.id;

  const previewUrl = await whiteLabelService.getPreviewUrl(orgId);

  res.json({ preview_url: previewUrl });
}));

/**
 * PUT /api/white-label/email-branding
 * Update email branding configuration
 */
router.put('/email-branding', requireManagePermission, asyncHandler(async (req: Request, res: Response) => {
  const orgId = req.org!.organization.id;
  const { from_email, from_name, email_footer_html, smtp_config } = req.body;

  await whiteLabelService.setEmailBranding(orgId, {
    from_email,
    from_name,
    email_footer_html,
    smtp_config,
  });

  res.json({ success: true });
}));

// ============================================================================
// RESELLER MANAGEMENT
// ============================================================================

/**
 * POST /api/white-label/reseller/enable
 * Enable reseller mode
 */
router.post('/reseller/enable', requireManagePermission, asyncHandler(async (req: Request, res: Response) => {
  const orgId = req.org!.organization.id;
  const { base_price_usd, markup_percentage, billing_model } = req.body;

  if (!base_price_usd || !markup_percentage) {
    return res.status(400).json({
      error: {
        code: 'MISSING_PRICING',
        message: 'base_price_usd and markup_percentage are required',
      },
    });
  }

  await whiteLabelService.enableReseller(orgId, {
    base_price_usd,
    markup_percentage,
    billing_model: billing_model || 'monthly',
  });

  res.json({ success: true });
}));

/**
 * GET /api/white-label/reseller/clients
 * List reseller clients
 */
router.get('/reseller/clients', asyncHandler(async (req: Request, res: Response) => {
  const orgId = req.org!.organization.id;

  const clients = await whiteLabelService.getClients(orgId);

  res.json({ clients });
}));

/**
 * POST /api/white-label/reseller/clients
 * Add reseller client
 */
router.post('/reseller/clients', requireManagePermission, asyncHandler(async (req: Request, res: Response) => {
  const orgId = req.org!.organization.id;
  const { client_name, client_email, monthly_price_usd, limits } = req.body;

  if (!client_name || !client_email || !monthly_price_usd) {
    return res.status(400).json({
      error: {
        code: 'MISSING_FIELDS',
        message: 'client_name, client_email, and monthly_price_usd are required',
      },
    });
  }

  try {
    const clientId = await whiteLabelService.addClient(orgId, {
      client_name,
      client_email,
      monthly_price_usd,
      limits,
    });

    res.status(201).json({
      success: true,
      client_id: clientId,
    });
  } catch (error: unknown) {
    const err = error as Error;
    if (error instanceof Error) {
      if (err.message === 'RESELLER_MODE_NOT_ENABLED') {
        return res.status(400).json({
          error: {
            code: 'RESELLER_MODE_NOT_ENABLED',
            message: 'Reseller mode must be enabled before adding clients',
          },
        });
      }
      if (err.message === 'CLIENT_ALREADY_EXISTS') {
        return res.status(409).json({
          error: {
            code: 'CLIENT_ALREADY_EXISTS',
            message: 'A client with this email already exists',
          },
        });
      }
    }
    throw error;
  }
}));

/**
 * PATCH /api/white-label/reseller/clients/:id
 * Update reseller client
 */
router.patch('/reseller/clients/:id', requireManagePermission, asyncHandler(async (req: Request, res: Response) => {
  const orgId = req.org!.organization.id;
  const { id } = req.params;
  const { client_name, monthly_price_usd, status, limits } = req.body;

  try {
    const client = await whiteLabelService.updateClient(orgId, id, {
      client_name,
      monthly_price_usd,
      status,
      limits,
    });

    res.json({ client });
  } catch (error: unknown) {
    const err = error as Error;
    if (error instanceof Error && err.message === 'CLIENT_NOT_FOUND') {
      return res.status(404).json({
        error: {
          code: 'CLIENT_NOT_FOUND',
          message: 'Client not found',
        },
      });
    }
    throw error;
  }
}));

/**
 * DELETE /api/white-label/reseller/clients/:id
 * Remove reseller client
 */
router.delete('/reseller/clients/:id', requireManagePermission, asyncHandler(async (req: Request, res: Response) => {
  const orgId = req.org!.organization.id;
  const { id } = req.params;

  try {
    await whiteLabelService.removeClient(orgId, id);
    res.json({ success: true });
  } catch (error: unknown) {
    const err = error as Error;
    if (error instanceof Error && err.message === 'CLIENT_NOT_FOUND') {
      return res.status(404).json({
        error: {
          code: 'CLIENT_NOT_FOUND',
          message: 'Client not found',
        },
      });
    }
    throw error;
  }
}));

export default router;
