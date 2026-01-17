/**
 * Studio Routes - Mobile App & Spatial Computing Generation
 *
 * Endpoints for generating production-ready mobile apps and XR experiences.
 * Includes:
 * - Voice-to-experience generation
 * - Template-based generation
 * - Version history and iteration
 */

import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requireOrganization } from '../middleware/multiTenancy.js';
import { requireCredits } from '../middleware/credits.js';
import { CREDIT_COSTS } from '../services/creditService.js';
import { mobileAppGenerationService } from '../services/mobileAppGenerationService.js';
import { spatialComputingService } from '../services/spatialComputingService.js';
import { videoGenerationService } from '../services/videoGenerationService.js';
import { studioOrchestratorService } from '../services/studioOrchestratorService.js';
import { logger } from '../utils/logger.js';

const router = Router();

// ============================================================
// TEMPLATES & ORCHESTRATION
// ============================================================

/**
 * Get available templates
 */
router.get('/templates', requireAuth, async (req: Request, res: Response) => {
  const { type } = req.query;
  const templates = studioOrchestratorService.getTemplates(type as any);
  res.json({ templates });
});

/**
 * Generate from template
 */
router.post('/from-template', requireAuth, requireCredits(CREDIT_COSTS.MOBILE_APP || 50, 'template_generation'), async (req: Request, res: Response) => {
  try {
    const { templateId, customizations } = req.body;
    const userId = req.user!.id;

    if (!templateId) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'Template ID is required' }
      });
    }

    logger.info('[Studio] Generating from template', { templateId });

    const project = await studioOrchestratorService.generateFromTemplate(
      templateId,
      customizations || {},
      userId
    );

    res.json({
      success: true,
      project,
    });

  } catch (error: unknown) {
    const err = error as Error;
    logger.error('[Studio] Template generation error:', error);
    res.status(500).json({
      error: {
        code: 'GENERATION_FAILED',
        message: err.message || 'Failed to generate from template',
      }
    });
  }
});

/**
 * Process voice input for experience generation
 */
router.post('/voice-to-experience', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;

    // Expect audio as base64 in request body
    const { audioBase64 } = req.body;

    if (!audioBase64) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'Audio data is required' }
      });
    }

    logger.info('[Studio] Processing voice input for experience generation');

    const audioBuffer = Buffer.from(audioBase64, 'base64');
    const result = await studioOrchestratorService.processVoiceInput(audioBuffer, userId);

    res.json({
      success: true,
      ...result,
    });

  } catch (error: unknown) {
    const err = error as Error;
    logger.error('[Studio] Voice processing error:', error);
    res.status(500).json({
      error: {
        code: 'VOICE_PROCESSING_FAILED',
        message: 'Failed to process voice input',
      }
    });
  }
});

/**
 * List user's projects
 */
router.get('/projects', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { type } = req.query;

    const projects = await studioOrchestratorService.listProjects(userId, type as any);

    res.json({ projects });

  } catch (error: unknown) {
    const err = error as Error;
    logger.error('[Studio] List projects error:', error);
    res.status(500).json({
      error: { code: 'LIST_FAILED', message: 'Failed to list projects' }
    });
  }
});

/**
 * Get project by ID
 */
router.get('/projects/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user!.id;

    const project = await studioOrchestratorService.getProject(id);

    if (!project) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Project not found' }
      });
    }

    if (project.userId !== userId) {
      return res.status(403).json({
        error: { code: 'FORBIDDEN', message: 'Not authorized to view this project' }
      });
    }

    res.json({ project });

  } catch (error: unknown) {
    const err = error as Error;
    logger.error('[Studio] Get project error:', error);
    res.status(500).json({
      error: { code: 'GET_FAILED', message: 'Failed to get project' }
    });
  }
});

/**
 * Iterate on a project with feedback
 */
router.post('/projects/:id/iterate', requireAuth, requireCredits(CREDIT_COSTS.MOBILE_APP || 50, 'project_iteration'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { feedback } = req.body;
    const userId = req.user!.id;

    if (!feedback) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'Feedback is required' }
      });
    }

    logger.info('[Studio] Iterating project', { projectId: id });

    const newVersion = await studioOrchestratorService.iterateProject(id, feedback, userId);

    res.json({
      success: true,
      version: newVersion,
    });

  } catch (error: unknown) {
    const err = error as Error;
    logger.error('[Studio] Iterate error:', error);
    res.status(500).json({
      error: {
        code: 'ITERATION_FAILED',
        message: err.message || 'Failed to iterate project',
      }
    });
  }
});

/**
 * Export project
 */
router.post('/projects/:id/export', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { format } = req.body;
    const userId = req.user!.id;

    const result = await studioOrchestratorService.exportProject(id, format || 'zip', userId);

    res.json({
      success: true,
      ...result,
    });

  } catch (error: unknown) {
    const err = error as Error;
    logger.error('[Studio] Export error:', error);
    res.status(500).json({
      error: {
        code: 'EXPORT_FAILED',
        message: err.message || 'Failed to export project',
      }
    });
  }
});

// ============================================================
// DIRECT GENERATION (existing)
// ============================================================

/**
 * Generate a mobile app from a brief
 */
router.post('/mobile-app', requireAuth, requireCredits(CREDIT_COSTS.MOBILE_APP || 50, 'mobile_app_generation'), async (req: Request, res: Response) => {
  try {
    const { brief, brandGuidelines, platform, features } = req.body;

    if (!brief) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'Brief is required' }
      });
    }

    logger.info('[Studio] Starting mobile app generation', {
      brief: brief.substring(0, 100),
      platform,
    });

    const result = await mobileAppGenerationService.generate({
      brief,
      brandGuidelines,
      platform: platform || 'expo',
      features,
    });

    if (!result.success) {
      return res.status(500).json({
        error: {
          code: 'GENERATION_FAILED',
          message: 'Failed to generate mobile app',
          details: result.errors,
        }
      });
    }

    res.json({
      success: true,
      app: {
        name: result.spec.name,
        description: result.spec.description,
        screens: result.spec.screens.map(s => s.name),
        navigation: result.spec.navigation,
        features: result.spec.features,
      },
      files: result.files.map(f => ({
        path: f.path,
        description: f.description,
      })),
      projectPath: result.projectPath,
      downloadUrl: result.zipPath ? `/api/studio/download?path=${encodeURIComponent(result.zipPath)}` : null,
    });

  } catch (error: unknown) {
    const err = error as Error;
    logger.error('[Studio] Mobile app generation error:', error);
    res.status(500).json({
      error: {
        code: 'GENERATION_FAILED',
        message: 'Failed to generate mobile app',
      }
    });
  }
});

/**
 * Generate spatial computing experience specification
 */
router.post('/spatial/spec', requireAuth, requireCredits(CREDIT_COSTS.SPATIAL_SPEC || 30, 'spatial_spec_generation'), async (req: Request, res: Response) => {
  try {
    const { brief, platform, experienceType, brandGuidelines, technicalConstraints } = req.body;

    if (!brief) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'Brief is required' }
      });
    }

    logger.info('[Studio] Starting spatial experience spec generation', {
      brief: brief.substring(0, 100),
      platform,
    });

    const spec = await spatialComputingService.generateExperienceSpec({
      brief,
      platform,
      experienceType,
      brandGuidelines,
      technicalConstraints,
    });

    res.json({
      success: true,
      spec,
    });

  } catch (error: unknown) {
    const err = error as Error;
    logger.error('[Studio] Spatial spec generation error:', error);
    res.status(500).json({
      error: {
        code: 'GENERATION_FAILED',
        message: 'Failed to generate spatial experience spec',
      }
    });
  }
});

/**
 * Generate full spatial computing experience with all deliverables
 */
router.post('/spatial/full', requireAuth, requireCredits(CREDIT_COSTS.SPATIAL_FULL || 100, 'spatial_full_generation'), async (req: Request, res: Response) => {
  try {
    const { brief, platform, experienceType, brandGuidelines, technicalConstraints } = req.body;

    if (!brief) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'Brief is required' }
      });
    }

    logger.info('[Studio] Starting full spatial experience generation', {
      brief: brief.substring(0, 100),
      platform,
    });

    const result = await spatialComputingService.generateFullExperience({
      brief,
      platform,
      experienceType,
      brandGuidelines,
      technicalConstraints,
    });

    // Validate comfort guidelines
    const comfortValidation = spatialComputingService.validateComfortGuidelines(result.spec);

    res.json({
      success: true,
      spec: result.spec,
      deliverables: result.deliverables.map(d => ({
        type: d.type,
        title: d.title,
        platform: d.platform,
        contentPreview: d.content.substring(0, 500) + (d.content.length > 500 ? '...' : ''),
        metadata: d.metadata,
      })),
      comfortValidation,
    });

  } catch (error: unknown) {
    const err = error as Error;
    logger.error('[Studio] Full spatial generation error:', error);
    res.status(500).json({
      error: {
        code: 'GENERATION_FAILED',
        message: 'Failed to generate spatial experience',
      }
    });
  }
});

/**
 * Generate WebXR prototype code
 */
router.post('/spatial/webxr-prototype', requireAuth, requireCredits(CREDIT_COSTS.WEBXR_PROTOTYPE || 40, 'webxr_prototype_generation'), async (req: Request, res: Response) => {
  try {
    const { spec } = req.body;

    if (!spec || !spec.name) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'Experience spec is required' }
      });
    }

    logger.info('[Studio] Generating WebXR prototype', { name: spec.name });

    const prototype = await spatialComputingService.generateWebXRPrototype(spec);

    res.json({
      success: true,
      prototype: {
        type: prototype.type,
        title: prototype.title,
        content: prototype.content,
        metadata: prototype.metadata,
      },
    });

  } catch (error: unknown) {
    const err = error as Error;
    logger.error('[Studio] WebXR prototype generation error:', error);
    res.status(500).json({
      error: {
        code: 'GENERATION_FAILED',
        message: 'Failed to generate WebXR prototype',
      }
    });
  }
});

/**
 * Video generation with provider fallbacks
 */
router.post('/video', requireAuth, requireCredits(CREDIT_COSTS.VIDEO_GENERATION || 25, 'video_generation'), async (req: Request, res: Response) => {
  try {
    const { script, title, aspectRatio, preferredProvider, allowFallback } = req.body;

    if (!script) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'Script is required' }
      });
    }

    // Check availability first
    const healthCheck = await videoGenerationService.healthCheck();
    if (!healthCheck.available) {
      return res.status(503).json({
        error: {
          code: 'SERVICE_UNAVAILABLE',
          message: healthCheck.error,
        }
      });
    }

    logger.info('[Studio] Starting video generation', {
      title,
      provider: healthCheck.provider,
    });

    const result = await videoGenerationService.generate({
      taskId: `video-${Date.now()}`,
      scriptText: script,
      title,
      aspectRatio: aspectRatio || '16:9',
    });

    if (!result.success) {
      return res.status(500).json({
        error: {
          code: result.error || 'GENERATION_FAILED',
          message: result.errorMessage || 'Video generation failed',
          provider: result.provider,
        }
      });
    }

    res.json({
      success: true,
      videoUrl: result.videoUrl,
      provider: result.provider,
      durationMs: result.durationMs,
    });

  } catch (error: unknown) {
    const err = error as Error;
    logger.error('[Studio] Video generation error:', error);
    res.status(500).json({
      error: {
        code: 'GENERATION_FAILED',
        message: 'Failed to generate video',
      }
    });
  }
});

/**
 * Video provider health check
 */
router.get('/video/health', requireAuth, async (_req: Request, res: Response) => {
  const health = await videoGenerationService.healthCheck();
  res.json(health);
});

/**
 * Download generated files
 */
router.get('/download', requireAuth, async (req: Request, res: Response) => {
  try {
    const { path: filePath } = req.query;

    if (!filePath || typeof filePath !== 'string') {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'File path is required' }
      });
    }

    // Security: Ensure path is within deliverables directory
    const allowedDir = '/deliverables/';
    if (!filePath.includes(allowedDir)) {
      return res.status(403).json({
        error: { code: 'ACCESS_DENIED', message: 'Invalid file path' }
      });
    }

    res.download(filePath);

  } catch (error: unknown) {
    const err = error as Error;
    logger.error('[Studio] Download error:', error);
    res.status(500).json({
      error: { code: 'DOWNLOAD_FAILED', message: 'Failed to download file' }
    });
  }
});

export default router;
