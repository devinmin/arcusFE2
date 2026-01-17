/**
 * Departments API
 *
 * Provides access to department hierarchy data from migration 046
 */

import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { pool } from '../database/db.js';
import { logger } from '../utils/logger.js';

const router = Router();

// ============================================================================
// Types
// ============================================================================

interface Department {
  id: string;
  name: string;
  chief_role: string;
  description: string;
  color: string;
  icon: string;
}

interface HierarchyRole {
  id: string;
  department_id: string;
  role_type: 'chief' | 'director' | 'associate';
  role_name: string;
  agent_id: string;
  reports_to: string | null;
  deliverable_types: string[];
}

// Department color mapping for UI consistency
const DEPARTMENT_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  'creative': { bg: 'bg-purple-500', text: 'text-purple-700', border: 'border-purple-200' },
  'engineering': { bg: 'bg-blue-500', text: 'text-blue-700', border: 'border-blue-200' },
  'design': { bg: 'bg-pink-500', text: 'text-pink-700', border: 'border-pink-200' },
  'strategy': { bg: 'bg-emerald-500', text: 'text-emerald-700', border: 'border-emerald-200' },
  'marketing': { bg: 'bg-orange-500', text: 'text-orange-700', border: 'border-orange-200' },
  'product': { bg: 'bg-indigo-500', text: 'text-indigo-700', border: 'border-indigo-200' },
  'operations': { bg: 'bg-gray-500', text: 'text-gray-700', border: 'border-gray-200' },
  'spatial': { bg: 'bg-cyan-500', text: 'text-cyan-700', border: 'border-cyan-200' },
  'quality': { bg: 'bg-amber-500', text: 'text-amber-700', border: 'border-amber-200' }
};

// Department icons
const DEPARTMENT_ICONS: Record<string, string> = {
  'creative': 'Palette',
  'engineering': 'Code',
  'design': 'Figma',
  'strategy': 'Target',
  'marketing': 'Megaphone',
  'product': 'Package',
  'operations': 'Settings',
  'spatial': 'Box',
  'quality': 'Shield'
};

// ============================================================================
// Routes
// ============================================================================

/**
 * GET /api/departments
 *
 * List all departments
 */
router.get('/', requireAuth, async (req: Request, res: Response) => {
  try {
    // Check if departments table exists
    const tableCheck = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_name = 'departments'
      )
    `);

    if (!tableCheck.rows[0].exists) {
      // Return hardcoded departments if table doesn't exist
      return res.json({
        departments: getDefaultDepartments()
      });
    }

    const result = await pool.query(`
      SELECT id, name, chief_role, description
      FROM departments
      ORDER BY
        CASE id
          WHEN 'creative' THEN 1
          WHEN 'strategy' THEN 2
          WHEN 'design' THEN 3
          WHEN 'engineering' THEN 4
          WHEN 'marketing' THEN 5
          WHEN 'product' THEN 6
          WHEN 'operations' THEN 7
          WHEN 'spatial' THEN 8
          WHEN 'quality' THEN 9
          ELSE 10
        END
    `);

    const departments: Department[] = result.rows.map(row => ({
      id: row.id,
      name: row.name,
      chief_role: row.chief_role,
      description: row.description || '',
      color: DEPARTMENT_COLORS[row.id]?.bg || 'bg-gray-500',
      icon: DEPARTMENT_ICONS[row.id] || 'Folder'
    }));

    res.json({
      departments,
      colors: DEPARTMENT_COLORS
    });

  } catch (error: unknown) {
    const err = error as Error;
    logger.error('Get departments error:', error);
    // Return defaults on error
    res.json({
      departments: getDefaultDepartments(),
      colors: DEPARTMENT_COLORS
    });
  }
});

/**
 * GET /api/departments/:id
 *
 * Get department details with hierarchy
 */
router.get('/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Get department
    const deptResult = await pool.query(`
      SELECT id, name, chief_role, description
      FROM departments
      WHERE id = $1
    `, [id]);

    if (deptResult.rows.length === 0) {
      return res.status(404).json({
        error: {
          code: 'DEPARTMENT_NOT_FOUND',
          message: 'Department not found'
        }
      });
    }

    const department = deptResult.rows[0];

    // Get hierarchy roles for this department
    const rolesResult = await pool.query(`
      SELECT
        id,
        department_id,
        role_type,
        role_name,
        agent_id,
        reports_to,
        deliverable_types
      FROM hierarchy_roles
      WHERE department_id = $1
      ORDER BY
        CASE role_type
          WHEN 'chief' THEN 1
          WHEN 'director' THEN 2
          WHEN 'associate' THEN 3
        END,
        role_name
    `, [id]);

    res.json({
      department: {
        ...department,
        color: DEPARTMENT_COLORS[id]?.bg || 'bg-gray-500',
        icon: DEPARTMENT_ICONS[id] || 'Folder'
      },
      hierarchy: rolesResult.rows,
      colors: DEPARTMENT_COLORS[id]
    });

  } catch (error: unknown) {
    const err = error as Error;
    logger.error('Get department error:', error);
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to fetch department'
      }
    });
  }
});

/**
 * GET /api/departments/:id/roles
 *
 * Get all roles in a department
 */
router.get('/:id/roles', requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { role_type } = req.query;

    let query = `
      SELECT
        id,
        department_id,
        role_type,
        role_name,
        agent_id,
        reports_to,
        deliverable_types
      FROM hierarchy_roles
      WHERE department_id = $1
    `;
    const params: unknown[] = [id];

    if (role_type) {
      query += ' AND role_type = $2';
      params.push(role_type);
    }

    query += ` ORDER BY
      CASE role_type
        WHEN 'chief' THEN 1
        WHEN 'director' THEN 2
        WHEN 'associate' THEN 3
      END,
      role_name
    `;

    const result = await pool.query(query, params);

    res.json({
      roles: result.rows,
      total: result.rows.length
    });

  } catch (error: unknown) {
    const err = error as Error;
    logger.error('Get department roles error:', error);
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to fetch department roles'
      }
    });
  }
});

/**
 * GET /api/departments/agent-mapping
 *
 * Get mapping of agent IDs to departments
 * Useful for categorizing tasks by department
 */
router.get('/mapping/agents', requireAuth, async (req: Request, res: Response) => {
  try {
    const result = await pool.query(`
      SELECT agent_id, department_id, role_type, role_name
      FROM hierarchy_roles
      WHERE agent_id IS NOT NULL
    `);

    const mapping: Record<string, { departmentId: string; roleType: string; roleName: string }> = {};
    for (const row of result.rows) {
      mapping[row.agent_id] = {
        departmentId: row.department_id,
        roleType: row.role_type,
        roleName: row.role_name
      };
    }

    res.json({
      mapping,
      total: Object.keys(mapping).length
    });

  } catch (error: unknown) {
    const err = error as Error;
    logger.error('Get agent mapping error:', error);
    // Return empty mapping on error
    res.json({ mapping: {}, total: 0 });
  }
});

// ============================================================================
// Helper Functions
// ============================================================================

function getDefaultDepartments(): Department[] {
  return [
    { id: 'creative', name: 'Creative', chief_role: 'CCO', description: 'Creative content and design', color: DEPARTMENT_COLORS.creative.bg, icon: DEPARTMENT_ICONS.creative },
    { id: 'strategy', name: 'Strategy', chief_role: 'CSO', description: 'Strategic planning and research', color: DEPARTMENT_COLORS.strategy.bg, icon: DEPARTMENT_ICONS.strategy },
    { id: 'design', name: 'Design', chief_role: 'CDO', description: 'Visual and UX design', color: DEPARTMENT_COLORS.design.bg, icon: DEPARTMENT_ICONS.design },
    { id: 'engineering', name: 'Engineering', chief_role: 'CTO', description: 'Technical development', color: DEPARTMENT_COLORS.engineering.bg, icon: DEPARTMENT_ICONS.engineering },
    { id: 'marketing', name: 'Marketing', chief_role: 'CMO', description: 'Marketing and campaigns', color: DEPARTMENT_COLORS.marketing.bg, icon: DEPARTMENT_ICONS.marketing },
    { id: 'product', name: 'Product', chief_role: 'CPO', description: 'Product management', color: DEPARTMENT_COLORS.product.bg, icon: DEPARTMENT_ICONS.product },
    { id: 'operations', name: 'Operations', chief_role: 'COO', description: 'Operations and processes', color: DEPARTMENT_COLORS.operations.bg, icon: DEPARTMENT_ICONS.operations },
    { id: 'spatial', name: 'Spatial', chief_role: 'CSPO', description: 'AR/VR and spatial computing', color: DEPARTMENT_COLORS.spatial.bg, icon: DEPARTMENT_ICONS.spatial }
  ];
}

export default router;
