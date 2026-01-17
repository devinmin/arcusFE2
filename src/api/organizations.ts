/**
 * Organization Routes
 *
 * Multi-tenancy management endpoints:
 * - Organization CRUD
 * - Member management
 * - Invitation flow
 * - Role management
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import {
  requireOrganization,
  requirePermission,
  createAuditLog,
} from '../middleware/multiTenancy.js';
import {
  createOrganization,
  getOrganizationById,
  updateOrganization,
  createUser,
  findUserByEmail,
  getUserOrganizations,
  getOrganizationMembers,
  removeMemberFromOrganization,
  updateMemberRole,
  updateMemberMetadata,
  getOrganizationRoles,
  createInvitation,
  getOrganizationInvitations,
  acceptInvitation,
  revokeInvitation,
  canAddMember,
  addMemberToOrganization,
  getSystemRole,
} from '../services/organizationService.js';
import { logger } from '../utils/logger.js';

const router = Router();

// ============================================================================
// ORGANIZATION CRUD
// ============================================================================

/**
 * POST /api/organizations
 * Create new organization
 *
 * Used during signup when user creates their first org,
 * or when existing user creates additional orgs.
 */
router.post('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const createSchema = z.object({
      name: z.string().min(1, 'Organization name is required').max(100),
      slug: z.string().min(1).max(50).regex(/^[a-z0-9-]+$/).optional(),
      plan: z.enum(['starter', 'professional', 'business', 'enterprise']).optional(),
      billing_email: z.string().email().optional(),
    });

    const input = createSchema.parse(req.body);

    // If user has org context, check if they can create new orgs
    // For now, allow all users to create orgs

    // We need a user ID. In the new model, req.user has the JWT payload
    // which might have user_id or id depending on migration state.
    // First try to find or create user in new users table.
    let user = await findUserByEmail(req.user!.email);

    if (!user) {
      // Create user in new users table from legacy context
      user = await createUser({
        email: req.user!.email,
        first_name: (req.user as any).name?.split(' ')[0] || null,
        last_name: (req.user as any).name?.split(' ').slice(1).join(' ') || null,
      });
    }

    const org = await createOrganization(input, user.id);

    logger.info('Organization created via API', { orgId: org.id, userId: user.id });

    res.status(201).json({
      id: org.id,
      name: org.name,
      slug: org.slug,
      plan: org.plan,
      status: org.status,
      trial_ends_at: org.trial_ends_at,
    });
  } catch (error: unknown) {
    const err = error as Error;
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid input',
          details: error.errors,
        },
      });
    }

    if (err.message === 'SLUG_TAKEN') {
      return res.status(400).json({
        error: {
          code: 'SLUG_TAKEN',
          message: 'This organization URL is already taken. Please choose another.',
        },
      });
    }

    logger.error('Create organization error:', error);
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to create organization',
      },
    });
  }
});

/**
 * GET /api/organizations
 * List organizations current user belongs to
 */
router.get('/', requireAuth, async (req: Request, res: Response) => {
  try {
    // Find user in new users table
    const user = await findUserByEmail(req.user!.email);

    if (!user) {
      // User exists in clients but not users table yet
      return res.json({ organizations: [] });
    }

    const organizations = await getUserOrganizations(user.id);

    res.json({ organizations });
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('List organizations error:', error);
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to list organizations',
      },
    });
  }
});

/**
 * GET /api/organizations/current
 * Get current organization context
 */
router.get('/current', requireAuth, requireOrganization, (req: Request, res: Response) => {
  const org = req.org!.organization;

  res.json({
    id: org.id,
    name: org.name,
    slug: org.slug,
    plan: org.plan,
    status: org.status,
    settings: org.settings,
    limits: org.limits,
    arc_config: org.arc_config,
    trial_ends_at: org.trial_ends_at,
  });
});

/**
 * PATCH /api/organizations/current
 * Update current organization
 */
router.patch(
  '/current',
  requireAuth,
  requireOrganization,
  requirePermission('org.manage'),
  async (req: Request, res: Response) => {
    try {
      const updateSchema = z.object({
        name: z.string().min(1).max(100).optional(),
        billing_email: z.string().email().nullable().optional(),
        settings: z
          .object({
            default_approval_mode: z.enum(['auto', 'manual']).optional(),
            require_2fa: z.boolean().optional(),
            allowed_domains: z.array(z.string()).optional(),
            audit_log_enabled: z.boolean().optional(),
            data_retention_days: z.number().min(30).max(3650).optional(),
          })
          .optional(),
        arc_config: z
          .object({
            email: z.string().email().optional(),
            phone: z.string().optional(),
            personality: z.string().optional(),
            name: z.string().optional(),
            voice_id: z.string().optional(),
            avatar_id: z.string().optional(),
          })
          .optional(),
        brand_guidelines: z.record(z.unknown()).optional(),
      });

      const updates = updateSchema.parse(req.body);

      // Merge settings with existing
      let finalSettings = updates.settings;
      if (finalSettings) {
        finalSettings = {
          ...(req.org!.organization.settings as any),
          ...finalSettings,
        };
      }

      // Merge arc_config with existing
      let finalArcConfig = updates.arc_config;
      if (finalArcConfig) {
        finalArcConfig = {
          ...(req.org!.organization.arc_config as any),
          ...finalArcConfig,
        };
      }

      const updated = await updateOrganization(req.org!.organization.id, {
        name: updates.name,
        billing_email: updates.billing_email,
        settings: finalSettings as any,
        arc_config: finalArcConfig as any,
        brand_guidelines: updates.brand_guidelines,
      });

      await createAuditLog(
        req,
        'settings.updated',
        'organization',
        req.org!.organization.id,
        { updates: Object.keys(updates) }
      );

      res.json(updated);
    } catch (error: unknown) {
    const err = error as Error;
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid input',
            details: error.errors,
          },
        });
      }

      logger.error('Update organization error:', error);
      res.status(500).json({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to update organization',
        },
      });
    }
  }
);

// ============================================================================
// MEMBER MANAGEMENT
// ============================================================================

/**
 * GET /api/organizations/current/members
 * List organization members
 */
router.get(
  '/current/members',
  requireAuth,
  requireOrganization,
  async (req: Request, res: Response) => {
    try {
      const members = await getOrganizationMembers(req.org!.organization.id);

      res.json({ members });
    } catch (error: unknown) {
    const err = error as Error;
      logger.error('List members error:', error);
      res.status(500).json({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to list members',
        },
      });
    }
  }
);

/**
 * DELETE /api/organizations/current/members/:userId
 * Remove member from organization
 */
router.delete(
  '/current/members/:userId',
  requireAuth,
  requireOrganization,
  requirePermission('members.remove'),
  async (req: Request, res: Response) => {
    try {
      const { userId } = req.params;

      // Can't remove yourself
      if (userId === req.org!.user.id) {
        return res.status(400).json({
          error: {
            code: 'CANNOT_REMOVE_SELF',
            message: "You can't remove yourself from the organization",
          },
        });
      }

      // Can't remove the last owner
      const members = await getOrganizationMembers(req.org!.organization.id);
      const owners = members.filter((m) => m.role.name === 'owner');

      const targetMember = members.find((m) => m.user_id === userId);
      if (!targetMember) {
        return res.status(404).json({
          error: {
            code: 'MEMBER_NOT_FOUND',
            message: 'Member not found',
          },
        });
      }

      if (targetMember.role.name === 'owner' && owners.length <= 1) {
        return res.status(400).json({
          error: {
            code: 'CANNOT_REMOVE_LAST_OWNER',
            message: 'Cannot remove the last owner. Transfer ownership first.',
          },
        });
      }

      await removeMemberFromOrganization(req.org!.organization.id, userId);

      await createAuditLog(
        req,
        'member.removed',
        'member',
        userId,
        { removed_email: targetMember.user.email }
      );

      res.json({ success: true });
    } catch (error: unknown) {
    const err = error as Error;
      logger.error('Remove member error:', error);
      res.status(500).json({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to remove member',
        },
      });
    }
  }
);

/**
 * PATCH /api/organizations/current/members/:userId
 * Update member role
 */
router.patch(
  '/current/members/:userId',
  requireAuth,
  requireOrganization,
  requirePermission('members.manage_roles'),
  async (req: Request, res: Response) => {
    try {
      const { userId } = req.params;
      const { role_id } = z.object({ role_id: z.string().uuid() }).parse(req.body);

      // Can't change your own role
      if (userId === req.org!.user.id) {
        return res.status(400).json({
          error: {
            code: 'CANNOT_CHANGE_OWN_ROLE',
            message: "You can't change your own role",
          },
        });
      }

      // Verify role exists and is valid for this org
      const roles = await getOrganizationRoles(req.org!.organization.id);
      const role = roles.find((r) => r.id === role_id);

      if (!role) {
        return res.status(400).json({
          error: {
            code: 'INVALID_ROLE',
            message: 'Invalid role',
          },
        });
      }

      const updated = await updateMemberRole(req.org!.organization.id, userId, role_id);

      if (!updated) {
        return res.status(404).json({
          error: {
            code: 'MEMBER_NOT_FOUND',
            message: 'Member not found',
          },
        });
      }

      await createAuditLog(
        req,
        'member.role_changed',
        'member',
        userId,
        { new_role: role.name }
      );

      res.json(updated);
    } catch (error: unknown) {
    const err = error as Error;
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid input',
            details: error.errors,
          },
        });
      }

      logger.error('Update member role error:', error);
      res.status(500).json({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to update member role',
        },
      });
    }
  }
);

/**
 * PATCH /api/organizations/current/members/:userId/metadata
 * Update member metadata (job title, etc.)
 */
router.patch(
  '/current/members/:userId/metadata',
  requireAuth,
  requireOrganization,
  async (req: Request, res: Response) => {
    try {
      const { userId } = req.params;
      const metadataSchema = z.object({
        job_title: z.string().optional(),
        department: z.string().optional(),
      });

      const metadata = metadataSchema.parse(req.body);

      // Only update your own metadata or if you have permission
      const canUpdateOthers = req.org!.permissions['members.manage_roles'] === true;
      if (userId !== req.org!.user.id && !canUpdateOthers) {
        return res.status(403).json({
          error: {
            code: 'INSUFFICIENT_PERMISSIONS',
            message: "You can only update your own metadata",
          },
        });
      }

      const updated = await updateMemberMetadata(
        req.org!.organization.id,
        userId,
        metadata
      );

      if (!updated) {
        return res.status(404).json({
          error: {
            code: 'MEMBER_NOT_FOUND',
            message: 'Member not found',
          },
        });
      }

      await createAuditLog(
        req,
        'member.metadata_updated',
        'member',
        userId,
        { metadata }
      );

      res.json(updated);
    } catch (error: unknown) {
    const err = error as Error;
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid input',
            details: error.errors,
          },
        });
      }

      logger.error('Update member metadata error:', error);
      res.status(500).json({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to update member metadata',
        },
      });
    }
  }
);

// ============================================================================
// ROLES
// ============================================================================

/**
 * GET /api/organizations/current/roles
 * List available roles
 */
router.get(
  '/current/roles',
  requireAuth,
  requireOrganization,
  async (req: Request, res: Response) => {
    try {
      const roles = await getOrganizationRoles(req.org!.organization.id);

      res.json({
        roles: roles.map((r) => ({
          id: r.id,
          name: r.name,
          description: r.description,
          is_system_role: r.is_system_role,
          permissions: r.permissions,
        })),
      });
    } catch (error: unknown) {
    const err = error as Error;
      logger.error('List roles error:', error);
      res.status(500).json({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to list roles',
        },
      });
    }
  }
);

// ============================================================================
// INVITATIONS
// ============================================================================

/**
 * POST /api/organizations/current/invitations
 * Invite member to organization
 */
router.post(
  '/current/invitations',
  requireAuth,
  requireOrganization,
  requirePermission('members.invite'),
  async (req: Request, res: Response) => {
    try {
      const inviteSchema = z.object({
        email: z.string().email('Valid email is required'),
        role_id: z.string().uuid('Valid role ID is required'),
      });

      const input = inviteSchema.parse(req.body);

      // Check member limit
      const canAdd = await canAddMember(req.org!.organization.id);
      if (!canAdd) {
        return res.status(403).json({
          error: {
            code: 'MEMBER_LIMIT_REACHED',
            message:
              'Your organization has reached its member limit. Please upgrade your plan.',
          },
        });
      }

      // Verify role exists
      const roles = await getOrganizationRoles(req.org!.organization.id);
      const role = roles.find((r) => r.id === input.role_id);

      if (!role) {
        return res.status(400).json({
          error: {
            code: 'INVALID_ROLE',
            message: 'Invalid role',
          },
        });
      }

      // Only owners can invite other owners
      if (role.name === 'owner' && req.org!.role.name !== 'owner') {
        return res.status(403).json({
          error: {
            code: 'CANNOT_INVITE_OWNER',
            message: 'Only owners can invite other owners',
          },
        });
      }

      const invitation = await createInvitation(
        req.org!.organization.id,
        input,
        req.org!.user.id
      );

      await createAuditLog(
        req,
        'member.invited',
        'invitation',
        invitation.id,
        { email: input.email, role: role.name }
      );

      // In production, send email with invitation link
      const inviteUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/invite/${invitation.token}`;

      logger.info('Invitation created', {
        orgId: req.org!.organization.id,
        email: input.email,
        invitedBy: req.org!.user.email,
      });

      res.status(201).json({
        id: invitation.id,
        email: invitation.email,
        role: role.name,
        expires_at: invitation.expires_at,
        // Include URL in dev for testing
        ...(process.env.NODE_ENV !== 'production' && { invite_url: inviteUrl }),
      });
    } catch (error: unknown) {
    const err = error as Error;
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid input',
            details: error.errors,
          },
        });
      }

      if (err.message === 'USER_ALREADY_MEMBER') {
        return res.status(400).json({
          error: {
            code: 'USER_ALREADY_MEMBER',
            message: 'This user is already a member of the organization',
          },
        });
      }

      if (err.message === 'INVITATION_ALREADY_EXISTS') {
        return res.status(400).json({
          error: {
            code: 'INVITATION_ALREADY_EXISTS',
            message: 'An invitation has already been sent to this email',
          },
        });
      }

      logger.error('Create invitation error:', error);
      res.status(500).json({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to create invitation',
        },
      });
    }
  }
);

/**
 * GET /api/organizations/current/invitations
 * List pending invitations
 */
router.get(
  '/current/invitations',
  requireAuth,
  requireOrganization,
  requirePermission('members.invite'),
  async (req: Request, res: Response) => {
    try {
      const invitations = await getOrganizationInvitations(req.org!.organization.id);

      res.json({ invitations });
    } catch (error: unknown) {
    const err = error as Error;
      logger.error('List invitations error:', error);
      res.status(500).json({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to list invitations',
        },
      });
    }
  }
);

/**
 * DELETE /api/organizations/current/invitations/:invitationId
 * Revoke invitation
 */
router.delete(
  '/current/invitations/:invitationId',
  requireAuth,
  requireOrganization,
  requirePermission('members.invite'),
  async (req: Request, res: Response) => {
    try {
      const { invitationId } = req.params;

      await revokeInvitation(invitationId);

      res.json({ success: true });
    } catch (error: unknown) {
    const err = error as Error;
      logger.error('Revoke invitation error:', error);
      res.status(500).json({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to revoke invitation',
        },
      });
    }
  }
);

/**
 * POST /api/invitations/accept
 * Accept invitation (public route - user might not be logged in)
 */
router.post('/invitations/accept', requireAuth, async (req: Request, res: Response) => {
  try {
    const { token } = z.object({ token: z.string() }).parse(req.body);

    // Find or create user
    let user = await findUserByEmail(req.user!.email);

    if (!user) {
      user = await createUser({
        email: req.user!.email,
        first_name: (req.user as any).name?.split(' ')[0] || null,
        last_name: (req.user as any).name?.split(' ').slice(1).join(' ') || null,
      });
    }

    const { organization, member } = await acceptInvitation(token, user.id);

    logger.info('Invitation accepted', {
      orgId: organization.id,
      userId: user.id,
      email: user.email,
    });

    res.json({
      organization: {
        id: organization.id,
        name: organization.name,
        slug: organization.slug,
      },
      member: {
        id: member.id,
        role_id: member.role_id,
      },
    });
  } catch (error: unknown) {
    const err = error as Error;
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid input',
          details: error.errors,
        },
      });
    }

    if (err.message === 'INVITATION_NOT_FOUND_OR_EXPIRED') {
      return res.status(400).json({
        error: {
          code: 'INVITATION_INVALID',
          message: 'This invitation is invalid or has expired',
        },
      });
    }

    logger.error('Accept invitation error:', error);
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to accept invitation',
      },
    });
  }
});

export default router;
