/**
 * Hierarchy Routes
 *
 * API endpoints for the unified department hierarchy system.
 * Provides access to departments, roles, work items, reviews,
 * and cross-department collaboration.
 */

import { Router, Request, Response } from 'express';
import { pool } from '../database/db.js';
import { requireAuth } from '../middleware/auth.js';
import { requireOrganization, getOrganizationId, createAuditLog } from '../middleware/multiTenancy.js';
import { logger } from '../utils/logger.js';
import {
    DEPARTMENTS,
    ROLE_REGISTRY,
    COLLABORATION_MATRIX,
    getRoleInfo,
    getDepartmentForRole,
    getEscalationPath,
    isValidCrossDepartmentRequest,
    type DepartmentId,
    type AgentRoleExtended,
    type CrossDepartmentRequestType,
    type RequestPriority
} from '../agents/base/departmentTypes.js';

const router = Router();

// ============================================================================
// DEPARTMENTS
// ============================================================================

/**
 * GET /api/hierarchy/departments
 * List all departments with their configurations
 */
router.get('/departments', requireAuth, async (req: Request, res: Response) => {
    try {
        // Get department stats from database
        const { rows: dbDepts } = await pool.query(`
            SELECT * FROM departments ORDER BY name
        `);

        // Merge with in-code definitions
        const departments = Object.values(DEPARTMENTS).map(dept => {
            const dbDept = dbDepts.find(d => d.department_id === dept.id);
            return {
                ...dept,
                dbId: dbDept?.id,
                isActive: dbDept?.is_active ?? true
            };
        });

        res.json({ departments });
    } catch (error: unknown) {
    const err = error as Error;
        logger.error('Error fetching departments:', error);
        res.status(500).json({ error: 'Failed to fetch departments' });
    }
});

/**
 * GET /api/hierarchy/departments/:departmentId
 * Get a specific department with its full hierarchy
 */
router.get('/departments/:departmentId', requireAuth, async (req: Request, res: Response) => {
    try {
        const departmentId = req.params.departmentId as DepartmentId;
        const department = DEPARTMENTS[departmentId];

        if (!department) {
            return res.status(404).json({ error: 'Department not found' });
        }

        // Get roles from database
        const { rows: dbRoles } = await pool.query(`
            SELECT * FROM hierarchy_roles
            WHERE department_id = (SELECT id FROM departments WHERE department_id = $1)
            ORDER BY hierarchy_level, role_id
        `, [departmentId]);

        // Build full role hierarchy
        const chiefInfo = getRoleInfo(department.chief);
        const directors = department.directors.map(d => ({
            role: d,
            ...getRoleInfo(d),
            dbData: dbRoles.find(r => r.role_id === d)
        }));
        const associates = department.associates.map(a => ({
            role: a,
            ...getRoleInfo(a),
            dbData: dbRoles.find(r => r.role_id === a)
        }));

        res.json({
            department,
            hierarchy: {
                chief: {
                    role: department.chief,
                    ...chiefInfo,
                    dbData: dbRoles.find(r => r.role_id === department.chief)
                },
                directors,
                associates
            },
            collaborationRules: COLLABORATION_MATRIX.filter(
                r => r.from === departmentId || r.to === departmentId
            )
        });
    } catch (error: unknown) {
    const err = error as Error;
        logger.error('Error fetching department:', error);
        res.status(500).json({ error: 'Failed to fetch department' });
    }
});

// ============================================================================
// ROLES
// ============================================================================

/**
 * GET /api/hierarchy/roles
 * List all roles across departments
 */
router.get('/roles', requireAuth, async (req: Request, res: Response) => {
    try {
        const { department, level } = req.query;

        let roles = Object.entries(ROLE_REGISTRY).map(([key, info]) => ({
            id: key,
            ...info
        }));

        // Filter by department if specified
        if (department) {
            roles = roles.filter(r => r.department === department);
        }

        // Filter by level if specified
        if (level) {
            roles = roles.filter(r => r.level === level);
        }

        res.json({ roles, total: roles.length });
    } catch (error: unknown) {
    const err = error as Error;
        logger.error('Error fetching roles:', error);
        res.status(500).json({ error: 'Failed to fetch roles' });
    }
});

/**
 * GET /api/hierarchy/roles/:roleId
 * Get specific role with escalation path
 */
router.get('/roles/:roleId', requireAuth, async (req: Request, res: Response) => {
    try {
        const roleId = req.params.roleId as AgentRoleExtended;
        const roleInfo = getRoleInfo(roleId);

        if (!roleInfo) {
            return res.status(404).json({ error: 'Role not found' });
        }

        const escalationPath = getEscalationPath(roleId);
        const department = DEPARTMENTS[roleInfo.department];

        res.json({
            role: roleInfo,
            escalationPath: escalationPath.map(r => {
                const info = getRoleInfo(r);
                return { roleId: r, ...info };
            }),
            department: {
                id: department.id,
                name: department.name
            },
            collaborators: roleInfo.canCollaborateWith?.map(r => {
                const info = getRoleInfo(r);
                return { roleId: r, ...info };
            }) || [],
            directReports: roleInfo.directReports?.map(r => {
                const info = getRoleInfo(r);
                return { roleId: r, ...info };
            }) || []
        });
    } catch (error: unknown) {
    const err = error as Error;
        logger.error('Error fetching role:', error);
        res.status(500).json({ error: 'Failed to fetch role' });
    }
});

// ============================================================================
// WORK ITEMS
// ============================================================================

/**
 * GET /api/hierarchy/work-items
 * List work items for the organization
 */
router.get('/work-items', requireAuth, requireOrganization, async (req: Request, res: Response) => {
    try {
        const organizationId = getOrganizationId(req);
        const { department, status, assignedRole, limit = 50, offset = 0 } = req.query;

        let query = `
            SELECT wi.*, d.department_id, d.name as department_name
            FROM hierarchy_work_items wi
            JOIN departments d ON wi.department_id = d.id
            WHERE wi.organization_id = $1
        `;
        const params: unknown[] = [organizationId];
        let paramIndex = 2;

        if (department) {
            query += ` AND d.department_id = $${paramIndex++}`;
            params.push(department);
        }

        if (status) {
            query += ` AND wi.status = $${paramIndex++}`;
            params.push(status);
        }

        if (assignedRole) {
            query += ` AND wi.assigned_role = $${paramIndex++}`;
            params.push(assignedRole);
        }

        query += ` ORDER BY wi.created_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
        params.push(Number(limit), Number(offset));

        const { rows: workItems } = await pool.query(query, params);

        // Get total count
        const { rows: countResult } = await pool.query(`
            SELECT COUNT(*) as total FROM hierarchy_work_items wi
            JOIN departments d ON wi.department_id = d.id
            WHERE wi.organization_id = $1
        `, [organizationId]);

        res.json({
            workItems,
            total: parseInt(countResult[0].total),
            limit: Number(limit),
            offset: Number(offset)
        });
    } catch (error: unknown) {
    const err = error as Error;
        logger.error('Error fetching work items:', error);
        res.status(500).json({ error: 'Failed to fetch work items' });
    }
});

/**
 * POST /api/hierarchy/work-items
 * Create a new work item
 */
router.post('/work-items', requireAuth, requireOrganization, async (req: Request, res: Response) => {
    try {
        const organizationId = getOrganizationId(req);
        const {
            departmentId,
            title,
            description,
            workType,
            assignedRole,
            priority = 'normal',
            briefContext,
            campaignId,
            workflowId,
            taskId
        } = req.body;

        if (!departmentId || !title || !workType || !assignedRole) {
            return res.status(400).json({
                error: 'Missing required fields: departmentId, title, workType, assignedRole'
            });
        }

        // Validate role belongs to department
        const roleInfo = getRoleInfo(assignedRole);
        if (!roleInfo || roleInfo.department !== departmentId) {
            return res.status(400).json({
                error: `Role ${assignedRole} does not belong to department ${departmentId}`
            });
        }

        // Get department database ID
        const { rows: [dept] } = await pool.query(
            'SELECT id FROM departments WHERE department_id = $1',
            [departmentId]
        );

        if (!dept) {
            return res.status(404).json({ error: 'Department not found in database' });
        }

        const { rows: [workItem] } = await pool.query(`
            INSERT INTO hierarchy_work_items (
                organization_id, department_id, title, description,
                work_type, assigned_role, assigned_level, priority,
                brief_context, campaign_id, workflow_id, task_id
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
            RETURNING *
        `, [
            organizationId, dept.id, title, description,
            workType, assignedRole, roleInfo.level, priority,
            briefContext ? JSON.stringify(briefContext) : null,
            campaignId, workflowId, taskId
        ]);

        // Log to execution log
        await pool.query(`
            INSERT INTO hierarchy_execution_log (
                organization_id, work_item_id, department_id,
                action, performed_by_role, details
            ) VALUES ($1, $2, $3, $4, $5, $6)
        `, [
            organizationId, workItem.id, dept.id,
            'work_item_created', assignedRole,
            JSON.stringify({ title, workType, priority })
        ]);

        await createAuditLog(req, 'hierarchy.work_item.created', 'work_item', workItem.id, {
            departmentId, title, assignedRole
        });

        res.status(201).json({ workItem });
    } catch (error: unknown) {
    const err = error as Error;
        logger.error('Error creating work item:', error);
        res.status(500).json({ error: 'Failed to create work item' });
    }
});

/**
 * POST /api/hierarchy/work-items/:id/submit-for-review
 * Submit work item for director/chief review
 */
router.post('/work-items/:id/submit-for-review', requireAuth, requireOrganization, async (req: Request, res: Response) => {
    try {
        const organizationId = getOrganizationId(req);
        const workItemId = req.params.id;
        const { output, submittedByRole } = req.body;

        if (!output || !submittedByRole) {
            return res.status(400).json({
                error: 'Missing required fields: output, submittedByRole'
            });
        }

        // Get work item and verify ownership
        const { rows: [workItem] } = await pool.query(`
            SELECT wi.*, d.department_id
            FROM hierarchy_work_items wi
            JOIN departments d ON wi.department_id = d.id
            WHERE wi.id = $1 AND wi.organization_id = $2
        `, [workItemId, organizationId]);

        if (!workItem) {
            return res.status(404).json({ error: 'Work item not found' });
        }

        // Determine reviewer based on hierarchy
        const submitterInfo = getRoleInfo(submittedByRole);
        if (!submitterInfo) {
            return res.status(400).json({ error: 'Invalid submitter role' });
        }

        const reviewerRole = submitterInfo.reportsTo;
        if (!reviewerRole) {
            return res.status(400).json({ error: 'No reviewer found in hierarchy' });
        }

        // Update work item
        await pool.query(`
            UPDATE hierarchy_work_items
            SET status = 'pending_review',
                output = $1,
                submitted_for_review_at = NOW(),
                updated_at = NOW()
            WHERE id = $2
        `, [JSON.stringify(output), workItemId]);

        // Create review request
        const { rows: [review] } = await pool.query(`
            INSERT INTO hierarchy_reviews (
                organization_id, work_item_id, reviewer_role,
                reviewer_level, status
            ) VALUES ($1, $2, $3, $4, 'pending')
            RETURNING *
        `, [organizationId, workItemId, reviewerRole, getRoleInfo(reviewerRole)?.level]);

        // Log the submission
        await pool.query(`
            INSERT INTO hierarchy_execution_log (
                organization_id, work_item_id, department_id,
                action, performed_by_role, target_role, details
            ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        `, [
            organizationId, workItemId, workItem.department_id,
            'submitted_for_review', submittedByRole, reviewerRole,
            JSON.stringify({ reviewId: review.id })
        ]);

        res.json({
            success: true,
            review,
            message: `Submitted for review by ${reviewerRole}`
        });
    } catch (error: unknown) {
    const err = error as Error;
        logger.error('Error submitting for review:', error);
        res.status(500).json({ error: 'Failed to submit for review' });
    }
});

/**
 * POST /api/hierarchy/work-items/:id/review
 * Director/Chief reviews and decides on work item
 */
router.post('/work-items/:id/review', requireAuth, requireOrganization, async (req: Request, res: Response) => {
    try {
        const organizationId = getOrganizationId(req);
        const workItemId = req.params.id;
        const {
            reviewerRole,
            decision,  // 'approved', 'needs_revision', 'escalated', 'rejected'
            feedback,
            qualityScore,
            requiredChanges
        } = req.body;

        if (!reviewerRole || !decision) {
            return res.status(400).json({
                error: 'Missing required fields: reviewerRole, decision'
            });
        }

        // Get pending review
        const { rows: [review] } = await pool.query(`
            SELECT hr.*, wi.department_id, d.department_id as dept_key
            FROM hierarchy_reviews hr
            JOIN hierarchy_work_items wi ON hr.work_item_id = wi.id
            JOIN departments d ON wi.department_id = d.id
            WHERE hr.work_item_id = $1
              AND hr.organization_id = $2
              AND hr.status = 'pending'
              AND hr.reviewer_role = $3
            ORDER BY hr.created_at DESC
            LIMIT 1
        `, [workItemId, organizationId, reviewerRole]);

        if (!review) {
            return res.status(404).json({ error: 'No pending review found for this role' });
        }

        // Update review
        await pool.query(`
            UPDATE hierarchy_reviews
            SET decision = $1,
                feedback = $2,
                quality_score = $3,
                required_changes = $4,
                status = 'completed',
                reviewed_at = NOW()
            WHERE id = $5
        `, [decision, feedback, qualityScore, requiredChanges ? JSON.stringify(requiredChanges) : null, review.id]);

        // Update work item status based on decision
        let newStatus: string;
        switch (decision) {
            case 'approved':
                newStatus = 'approved';
                break;
            case 'needs_revision':
                newStatus = 'revision_requested';
                break;
            case 'escalated':
                newStatus = 'escalated';
                break;
            case 'rejected':
                newStatus = 'rejected';
                break;
            default:
                newStatus = 'pending_review';
        }

        await pool.query(`
            UPDATE hierarchy_work_items
            SET status = $1,
                quality_score = COALESCE($2, quality_score),
                updated_at = NOW()
            WHERE id = $3
        `, [newStatus, qualityScore, workItemId]);

        // If escalated, create chief approval request
        if (decision === 'escalated') {
            const reviewerInfo = getRoleInfo(reviewerRole);
            const chiefRole = reviewerInfo ? DEPARTMENTS[reviewerInfo.department].chief : null;

            if (chiefRole) {
                await pool.query(`
                    INSERT INTO chief_approvals (
                        organization_id, work_item_id, chief_role,
                        escalated_from_role, escalation_reason, status
                    ) VALUES ($1, $2, $3, $4, $5, 'pending')
                `, [organizationId, workItemId, chiefRole, reviewerRole, feedback]);
            }
        }

        // Log the review
        await pool.query(`
            INSERT INTO hierarchy_execution_log (
                organization_id, work_item_id, department_id,
                action, performed_by_role, details
            ) VALUES ($1, $2, $3, $4, $5, $6)
        `, [
            organizationId, workItemId, review.department_id,
            `review_${decision}`, reviewerRole,
            JSON.stringify({ feedback, qualityScore, requiredChanges })
        ]);

        res.json({
            success: true,
            decision,
            newStatus,
            message: `Work item ${decision}`
        });
    } catch (error: unknown) {
    const err = error as Error;
        logger.error('Error reviewing work item:', error);
        res.status(500).json({ error: 'Failed to review work item' });
    }
});

// ============================================================================
// CROSS-DEPARTMENT REQUESTS
// ============================================================================

/**
 * GET /api/hierarchy/cross-department
 * List cross-department requests
 */
router.get('/cross-department', requireAuth, requireOrganization, async (req: Request, res: Response) => {
    try {
        const organizationId = getOrganizationId(req);
        const { fromDepartment, toDepartment, status, limit = 50, offset = 0 } = req.query;

        let query = `
            SELECT cdr.*,
                   fd.department_id as from_dept_key,
                   fd.name as from_dept_name,
                   td.department_id as to_dept_key,
                   td.name as to_dept_name
            FROM cross_department_requests cdr
            JOIN departments fd ON cdr.from_department_id = fd.id
            JOIN departments td ON cdr.to_department_id = td.id
            WHERE cdr.organization_id = $1
        `;
        const params: unknown[] = [organizationId];
        let paramIndex = 2;

        if (fromDepartment) {
            query += ` AND fd.department_id = $${paramIndex++}`;
            params.push(fromDepartment);
        }

        if (toDepartment) {
            query += ` AND td.department_id = $${paramIndex++}`;
            params.push(toDepartment);
        }

        if (status) {
            query += ` AND cdr.status = $${paramIndex++}`;
            params.push(status);
        }

        query += ` ORDER BY cdr.created_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
        params.push(Number(limit), Number(offset));

        const { rows: requests } = await pool.query(query, params);

        res.json({
            requests,
            total: requests.length,
            limit: Number(limit),
            offset: Number(offset)
        });
    } catch (error: unknown) {
    const err = error as Error;
        logger.error('Error fetching cross-department requests:', error);
        res.status(500).json({ error: 'Failed to fetch requests' });
    }
});

/**
 * POST /api/hierarchy/cross-department
 * Create a cross-department request
 */
router.post('/cross-department', requireAuth, requireOrganization, async (req: Request, res: Response) => {
    try {
        const organizationId = getOrganizationId(req);
        const {
            fromRole,
            toRole,
            requestType,
            priority = 'normal',
            subject,
            description,
            payload,
            campaignId,
            workflowId
        } = req.body;

        if (!fromRole || !toRole || !requestType || !subject) {
            return res.status(400).json({
                error: 'Missing required fields: fromRole, toRole, requestType, subject'
            });
        }

        // Validate the cross-department request
        const validation = isValidCrossDepartmentRequest(
            fromRole as AgentRoleExtended,
            toRole as AgentRoleExtended,
            requestType as CrossDepartmentRequestType
        );

        if (!validation.valid) {
            return res.status(400).json({
                error: validation.reason,
                hint: 'Check COLLABORATION_MATRIX for valid request patterns'
            });
        }

        const fromInfo = getRoleInfo(fromRole);
        const toInfo = getRoleInfo(toRole);

        if (!fromInfo || !toInfo) {
            return res.status(400).json({ error: 'Invalid role' });
        }

        // Get department IDs
        const { rows: [fromDept] } = await pool.query(
            'SELECT id FROM departments WHERE department_id = $1',
            [fromInfo.department]
        );
        const { rows: [toDept] } = await pool.query(
            'SELECT id FROM departments WHERE department_id = $1',
            [toInfo.department]
        );

        // Create the request
        const { rows: [request] } = await pool.query(`
            INSERT INTO cross_department_requests (
                organization_id, from_department_id, from_role, from_level,
                to_department_id, to_role, to_level,
                request_type, priority, subject, description, payload,
                requires_chief_approval, campaign_id, workflow_id
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
            RETURNING *
        `, [
            organizationId, fromDept.id, fromRole, fromInfo.level,
            toDept.id, toRole, toInfo.level,
            requestType, priority, subject, description,
            payload ? JSON.stringify(payload) : null,
            validation.requiresChiefApproval || false,
            campaignId, workflowId
        ]);

        await createAuditLog(req, 'hierarchy.cross_dept.created', 'cross_department_request', request.id, {
            fromRole, toRole, requestType
        });

        res.status(201).json({
            request,
            requiresChiefApproval: validation.requiresChiefApproval
        });
    } catch (error: unknown) {
    const err = error as Error;
        logger.error('Error creating cross-department request:', error);
        res.status(500).json({ error: 'Failed to create request' });
    }
});

/**
 * POST /api/hierarchy/cross-department/:id/respond
 * Respond to a cross-department request
 */
router.post('/cross-department/:id/respond', requireAuth, requireOrganization, async (req: Request, res: Response) => {
    try {
        const organizationId = getOrganizationId(req);
        const requestId = req.params.id;
        const {
            respondingRole,
            status,  // 'accepted', 'rejected', 'negotiating', 'completed'
            message,
            deliverables,
            counterProposal
        } = req.body;

        if (!respondingRole || !status || !message) {
            return res.status(400).json({
                error: 'Missing required fields: respondingRole, status, message'
            });
        }

        // Get the request
        const { rows: [request] } = await pool.query(`
            SELECT * FROM cross_department_requests
            WHERE id = $1 AND organization_id = $2
        `, [requestId, organizationId]);

        if (!request) {
            return res.status(404).json({ error: 'Request not found' });
        }

        // Verify responding role matches target
        if (request.to_role !== respondingRole) {
            const respondingInfo = getRoleInfo(respondingRole);
            const targetInfo = getRoleInfo(request.to_role);

            // Allow if responding role is superior to target
            if (!respondingInfo || !targetInfo ||
                respondingInfo.department !== targetInfo.department) {
                return res.status(403).json({
                    error: 'Not authorized to respond to this request'
                });
            }
        }

        // Update the request
        await pool.query(`
            UPDATE cross_department_requests
            SET status = $1,
                response = $2,
                responded_at = NOW(),
                updated_at = NOW()
            WHERE id = $3
        `, [
            status === 'completed' ? 'completed' :
            status === 'rejected' ? 'completed' :
            status === 'negotiating' ? 'in_progress' : 'acknowledged',
            JSON.stringify({
                respondingRole,
                status,
                message,
                deliverables,
                counterProposal,
                respondedAt: new Date().toISOString()
            }),
            requestId
        ]);

        res.json({
            success: true,
            status,
            message: `Request ${status}`
        });
    } catch (error: unknown) {
    const err = error as Error;
        logger.error('Error responding to cross-department request:', error);
        res.status(500).json({ error: 'Failed to respond to request' });
    }
});

// ============================================================================
// COLLABORATION MATRIX
// ============================================================================

/**
 * GET /api/hierarchy/collaboration-matrix
 * Get the collaboration rules matrix
 */
router.get('/collaboration-matrix', requireAuth, async (req: Request, res: Response) => {
    try {
        const { from, to } = req.query;

        let rules = [...COLLABORATION_MATRIX];

        if (from) {
            rules = rules.filter(r => r.from === from);
        }

        if (to) {
            rules = rules.filter(r => r.to === to);
        }

        res.json({ rules, total: rules.length });
    } catch (error: unknown) {
    const err = error as Error;
        logger.error('Error fetching collaboration matrix:', error);
        res.status(500).json({ error: 'Failed to fetch collaboration matrix' });
    }
});

// ============================================================================
// OVERVIEW / DASHBOARD
// ============================================================================

/**
 * GET /api/hierarchy/overview
 * Get hierarchy dashboard overview
 */
router.get('/overview', requireAuth, requireOrganization, async (req: Request, res: Response) => {
    try {
        const organizationId = getOrganizationId(req);

        // Get department overview from view
        const { rows: departmentOverview } = await pool.query(`
            SELECT * FROM v_department_overview
            WHERE organization_id = $1 OR organization_id IS NULL
        `, [organizationId]);

        // Get pending reviews count
        const { rows: [reviewStats] } = await pool.query(`
            SELECT
                COUNT(*) FILTER (WHERE status = 'pending') as pending_reviews,
                COUNT(*) FILTER (WHERE status = 'completed') as completed_reviews
            FROM hierarchy_reviews
            WHERE organization_id = $1
        `, [organizationId]);

        // Get active cross-department requests
        const { rows: [crossDeptStats] } = await pool.query(`
            SELECT
                COUNT(*) FILTER (WHERE status = 'pending') as pending,
                COUNT(*) FILTER (WHERE status = 'in_progress') as in_progress,
                COUNT(*) FILTER (WHERE status = 'completed') as completed
            FROM cross_department_requests
            WHERE organization_id = $1
        `, [organizationId]);

        // Get work items by status
        const { rows: workItemStats } = await pool.query(`
            SELECT status, COUNT(*) as count
            FROM hierarchy_work_items
            WHERE organization_id = $1
            GROUP BY status
        `, [organizationId]);

        res.json({
            departments: departmentOverview,
            reviews: reviewStats,
            crossDepartment: crossDeptStats,
            workItems: workItemStats.reduce((acc, row) => {
                acc[row.status] = parseInt(row.count);
                return acc;
            }, {} as Record<string, number>)
        });
    } catch (error: unknown) {
    const err = error as Error;
        logger.error('Error fetching hierarchy overview:', error);
        res.status(500).json({ error: 'Failed to fetch overview' });
    }
});

/**
 * GET /api/hierarchy/escalation-path/:role
 * Get the escalation path for a specific role
 */
router.get('/escalation-path/:role', requireAuth, async (req: Request, res: Response) => {
    try {
        const roleId = req.params.role as AgentRoleExtended;
        const roleInfo = getRoleInfo(roleId);

        if (!roleInfo) {
            return res.status(404).json({ error: 'Role not found' });
        }

        const path = getEscalationPath(roleId);

        res.json({
            roleId,
            department: roleInfo.department,
            level: roleInfo.level,
            escalationPath: [
                { ...roleInfo, order: 0 },
                ...path.map((r, i) => {
                    const info = getRoleInfo(r);
                    return { ...info, order: i + 1 };
                })
            ]
        });
    } catch (error: unknown) {
    const err = error as Error;
        logger.error('Error fetching escalation path:', error);
        res.status(500).json({ error: 'Failed to fetch escalation path' });
    }
});

export const hierarchyRoutes = router;
