/**
 * Video Editing API Routes
 *
 * Provides endpoints for agentic video editing:
 * - POST /api/video/edit - Process natural language editing command
 * - POST /api/video/analyze - Analyze video project structure
 * - POST /api/video/apply - Apply specific operations
 */

import { Router, Request, Response } from 'express';
import {
  videoEditingService,
  VideoProject,
  EditOperation,
  saveProject,
  loadProject,
  loadProjectById,
  addTextOverlays,
  updateTextOverlay,
  deleteTextOverlay,
  setTransitions,
  processExport,
  getExportStatus,
  deleteProject,
  TextOverlay,
  VideoTransition,
  ExportSettings,
} from '../services/videoEditingService.js';
import { requireAuth } from '../middleware/auth.js';
import { requireOrganization } from '../middleware/multiTenancy.js';
import { logger } from '../utils/logger.js';

const router = Router();

/**
 * POST /api/video/edit
 * Process a natural language editing command
 */
router.post('/edit', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const { command, project, brandContext } = req.body;

    if (!command || typeof command !== 'string') {
      return res.status(400).json({
        error: 'Missing required field: command (string)'
      });
    }

    if (!project || !project.clips) {
      return res.status(400).json({
        error: 'Missing required field: project with clips array'
      });
    }

    logger.info(`[VideoEditing API] Processing command: "${command}"`);

    const result = await videoEditingService.processCommand(
      command,
      project as VideoProject,
      brandContext
    );

    return res.json({
      success: result.success,
      operations: result.operations,
      explanation: result.explanation,
      analysis: {
        before: result.beforeAnalysis,
        after: result.afterAnalysis
      },
      updatedClips: result.updatedClips
    });

  } catch (error: unknown) {
    const err = error as Error;
    logger.error(`[VideoEditing API] Error: ${err.message}`);
    return res.status(500).json({
      error: 'Failed to process editing command',
      message: err.message
    });
  }
});

/**
 * POST /api/video/analyze
 * Analyze a video project's structure
 */
router.post('/analyze', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const { project } = req.body;

    if (!project || !project.clips) {
      return res.status(400).json({
        error: 'Missing required field: project with clips array'
      });
    }

    const analysis = videoEditingService.analyzeProject(project as VideoProject);

    return res.json({
      success: true,
      analysis
    });

  } catch (error: unknown) {
    const err = error as Error;
    logger.error(`[VideoEditing API] Analysis error: ${err.message}`);
    return res.status(500).json({
      error: 'Failed to analyze project',
      message: err.message
    });
  }
});

/**
 * POST /api/video/apply
 * Apply specific operations to clips
 */
router.post('/apply', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const { clips, operations } = req.body;

    if (!clips || !Array.isArray(clips)) {
      return res.status(400).json({
        error: 'Missing required field: clips (array)'
      });
    }

    if (!operations || !Array.isArray(operations)) {
      return res.status(400).json({
        error: 'Missing required field: operations (array)'
      });
    }

    const updatedClips = videoEditingService.applyOperations(
      clips,
      operations as EditOperation[]
    );

    return res.json({
      success: true,
      updatedClips
    });

  } catch (error: unknown) {
    const err = error as Error;
    logger.error(`[VideoEditing API] Apply error: ${err.message}`);
    return res.status(500).json({
      error: 'Failed to apply operations',
      message: err.message
    });
  }
});

/**
 * POST /api/video/suggestions
 * Get AI suggestions for improving the video
 */
router.post('/suggestions', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const { project, context } = req.body;

    if (!project || !project.clips) {
      return res.status(400).json({
        error: 'Missing required field: project with clips array'
      });
    }

    const analysis = videoEditingService.analyzeProject(project as VideoProject);

    // Generate suggestions based on analysis
    const suggestions = [
      ...analysis.recommendations
    ];

    // Add context-specific suggestions
    if (context?.goal === 'social') {
      if (analysis.totalDuration > 60) {
        suggestions.push('Consider trimming to under 60 seconds for better social engagement');
      }
      if (analysis.pacing === 'slow') {
        suggestions.push('Social videos perform better with faster pacing - try "make it punchier"');
      }
    }

    if (context?.goal === 'ad') {
      if (analysis.totalDuration > 30) {
        suggestions.push('Ad videos typically perform best at 15-30 seconds');
      }
      suggestions.push('Ensure your hook is in the first 3 seconds');
    }

    return res.json({
      success: true,
      analysis,
      suggestions,
      quickActions: [
        { label: 'Make it punchier', command: 'make it punchier and more energetic' },
        { label: 'Tighten cuts', command: 'tighten all the cuts, remove dead space' },
        { label: 'Add energy', command: 'increase the energy and pace' },
        { label: 'Trim excess', command: 'trim the boring parts and keep it snappy' }
      ]
    });

  } catch (error: unknown) {
    const err = error as Error;
    logger.error(`[VideoEditing API] Suggestions error: ${err.message}`);
    return res.status(500).json({
      error: 'Failed to generate suggestions',
      message: err.message
    });
  }
});

// ============================================================================
// Project Persistence Routes
// ============================================================================

/**
 * POST /api/video/edit/projects
 * Create or update a video editing project
 */
router.post('/projects', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const organizationId = (req as any).user.organization_id;
    const { deliverableId, projectState, exportSettings } = req.body;

    if (!deliverableId || !projectState) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'deliverableId and projectState are required' },
      });
    }

    const project = await saveProject(deliverableId, organizationId, projectState, exportSettings);

    res.status(201).json({
      data: project,
      meta: { timestamp: new Date().toISOString() },
    });
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('[VideoEditing API] Save project error:', error);
    res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: 'Failed to save project' },
    });
  }
});

/**
 * GET /api/video/edit/projects/deliverable/:deliverableId
 * Load a project by deliverable ID
 */
router.get('/projects/deliverable/:deliverableId', requireAuth, async (req: Request, res: Response) => {
  try {
    const organizationId = (req as any).user.organization_id;
    const { deliverableId } = req.params;

    const project = await loadProject(deliverableId, organizationId);

    if (!project) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Project not found for this deliverable' },
      });
    }

    res.json({
      data: project,
      meta: { timestamp: new Date().toISOString() },
    });
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('[VideoEditing API] Load project error:', error);
    res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: 'Failed to load project' },
    });
  }
});

/**
 * GET /api/video/edit/projects/:id
 * Load a project by project ID
 */
router.get('/projects/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const organizationId = (req as any).user.organization_id;
    const { id } = req.params;

    const project = await loadProjectById(id, organizationId);

    if (!project) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Project not found' },
      });
    }

    res.json({
      data: project,
      meta: { timestamp: new Date().toISOString() },
    });
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('[VideoEditing API] Load project error:', error);
    res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: 'Failed to load project' },
    });
  }
});

/**
 * DELETE /api/video/edit/projects/:id
 * Delete a video editing project
 */
router.delete('/projects/:id', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const organizationId = (req as any).user.organization_id;
    const { id } = req.params;

    const deleted = await deleteProject(id, organizationId);

    if (!deleted) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Project not found' },
      });
    }

    res.json({
      data: { success: true },
      meta: { timestamp: new Date().toISOString() },
    });
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('[VideoEditing API] Delete project error:', error);
    res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: 'Failed to delete project' },
    });
  }
});

// ============================================================================
// Text Overlay Routes
// ============================================================================

/**
 * POST /api/video/edit/projects/:id/overlays
 * Add text overlays to a project
 */
router.post('/projects/:id/overlays', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const organizationId = (req as any).user.organization_id;
    const { id } = req.params;
    const { overlays } = req.body;

    if (!overlays || !Array.isArray(overlays)) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'overlays array is required' },
      });
    }

    const insertedOverlays = await addTextOverlays(id, organizationId, overlays);

    res.status(201).json({
      data: { overlays: insertedOverlays },
      meta: { timestamp: new Date().toISOString() },
    });
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('[VideoEditing API] Add overlays error:', error);
    if (err.message === 'Project not found') {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Project not found' },
      });
    }
    res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: 'Failed to add overlays' },
    });
  }
});

/**
 * PATCH /api/video/edit/overlays/:id
 * Update a text overlay
 */
router.patch('/overlays/:id', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const organizationId = (req as any).user.organization_id;
    const { id } = req.params;
    const updates = req.body;

    const updated = await updateTextOverlay(id, organizationId, updates);

    if (!updated) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Overlay not found' },
      });
    }

    res.json({
      data: updated,
      meta: { timestamp: new Date().toISOString() },
    });
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('[VideoEditing API] Update overlay error:', error);
    res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: 'Failed to update overlay' },
    });
  }
});

/**
 * DELETE /api/video/edit/overlays/:id
 * Delete a text overlay
 */
router.delete('/overlays/:id', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const organizationId = (req as any).user.organization_id;
    const { id } = req.params;

    const deleted = await deleteTextOverlay(id, organizationId);

    if (!deleted) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Overlay not found' },
      });
    }

    res.json({
      data: { success: true },
      meta: { timestamp: new Date().toISOString() },
    });
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('[VideoEditing API] Delete overlay error:', error);
    res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: 'Failed to delete overlay' },
    });
  }
});

// ============================================================================
// Transition Routes
// ============================================================================

/**
 * POST /api/video/edit/projects/:id/transitions
 * Set transitions for a project (replaces all existing)
 */
router.post('/projects/:id/transitions', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const organizationId = (req as any).user.organization_id;
    const { id } = req.params;
    const { transitions } = req.body;

    if (!transitions || !Array.isArray(transitions)) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'transitions array is required' },
      });
    }

    const insertedTransitions = await setTransitions(id, organizationId, transitions);

    res.json({
      data: { transitions: insertedTransitions },
      meta: { timestamp: new Date().toISOString() },
    });
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('[VideoEditing API] Set transitions error:', error);
    if (err.message === 'Project not found') {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Project not found' },
      });
    }
    res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: 'Failed to set transitions' },
    });
  }
});

// ============================================================================
// Export Routes
// ============================================================================

/**
 * POST /api/video/edit/projects/:id/export
 * Start an export job
 */
router.post('/projects/:id/export', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const organizationId = (req as any).user.organization_id;
    const { id } = req.params;
    const { settings } = req.body;

    // Default export settings
    const exportSettings: ExportSettings = {
      resolution: settings?.resolution || '1080p',
      format: settings?.format || 'mp4',
      codec: settings?.codec || 'h264',
      quality: settings?.quality || 'high',
      fps: settings?.fps,
    };

    const result = await processExport(id, organizationId, exportSettings);

    res.status(202).json({
      data: {
        jobId: result.jobId,
        status: result.status,
        message: 'Export started. Poll /export/status for progress.',
      },
      meta: { timestamp: new Date().toISOString() },
    });
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('[VideoEditing API] Start export error:', error);
    if (err.message === 'Project not found') {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Project not found' },
      });
    }
    res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: 'Failed to start export' },
    });
  }
});

/**
 * GET /api/video/edit/projects/:id/export/status
 * Check export status
 */
router.get('/projects/:id/export/status', requireAuth, async (req: Request, res: Response) => {
  try {
    const organizationId = (req as any).user.organization_id;
    const { id } = req.params;

    const status = await getExportStatus(id, organizationId);

    if (!status) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Project not found' },
      });
    }

    res.json({
      data: status,
      meta: { timestamp: new Date().toISOString() },
    });
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('[VideoEditing API] Get export status error:', error);
    res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: 'Failed to get export status' },
    });
  }
});

export default router;
