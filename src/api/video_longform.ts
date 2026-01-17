import { Router, Request, Response } from 'express';
import { longformEditorService, RenderResult } from '../services/longformEditorService.js';
import { videoGenerationService } from '../services/videoGenerationService.js';
import { pool } from '../database/db.js';
import { requireAuth } from '../middleware/auth.js';
import { requireOrganization } from '../middleware/multiTenancy.js';

const router = Router();

// SEC-004 FIX: All longform video routes require authentication and organization context
router.use(requireAuth);
router.use(requireOrganization);

/**
 * POST /video/longform/transcribe
 * Transcribe audio/video from URL, persist with word-level timestamps.
 */
router.post('/transcribe', async (req: Request, res: Response) => {
  const { assetUrl, deliverableId } = req.body || {};
  if (!assetUrl) {
    return res.status(400).json({ error: { code: 'INVALID_INPUT', message: 'assetUrl required' } });
  }
  try {
    const result = await longformEditorService.transcribeFromUrl(assetUrl, deliverableId);
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: { code: 'TRANSCRIBE_FAILED', message: e.message } });
  }
});

/**
 * GET /video/longform/transcript/:id
 * Get transcript by ID.
 */
router.get('/transcript/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    const { rows } = await pool.query(
      `SELECT id, deliverable_id, asset_url, words, full_text, duration_seconds, meta, created_at
       FROM transcripts WHERE id = $1`,
      [id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Transcript not found' } });
    }
    res.json({
      transcriptId: rows[0].id,
      deliverableId: rows[0].deliverable_id,
      assetUrl: rows[0].asset_url,
      words: rows[0].words,
      text: rows[0].full_text,
      durationSeconds: rows[0].duration_seconds,
      meta: rows[0].meta,
      createdAt: rows[0].created_at
    });
  } catch (e: any) {
    res.status(500).json({ error: { code: 'DB_ERROR', message: e.message } });
  }
});

/**
 * POST /video/longform/recipe
 * Compile NL instructions into edit recipe.
 */
router.post('/recipe', async (req: Request, res: Response) => {
  const { deliverableId, instructions, transcriptText, transcriptId } = req.body || {};
  if (!instructions || !transcriptText) {
    return res.status(400).json({ error: { code: 'INVALID_INPUT', message: 'instructions and transcriptText required' } });
  }
  try {
    const result = await longformEditorService.compileRecipe(instructions, transcriptText, deliverableId, transcriptId);
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: { code: 'RECIPE_FAILED', message: e.message } });
  }
});

/**
 * GET /video/longform/recipe/:id
 * Get recipe by ID.
 */
router.get('/recipe/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    const { rows } = await pool.query(
      `SELECT id, deliverable_id, transcript_id, instructions, recipe, version, created_at
       FROM edit_recipes WHERE id = $1`,
      [id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Recipe not found' } });
    }
    res.json({
      recipeId: rows[0].id,
      deliverableId: rows[0].deliverable_id,
      transcriptId: rows[0].transcript_id,
      instructions: rows[0].instructions,
      operations: rows[0].recipe?.operations || [],
      version: rows[0].version,
      createdAt: rows[0].created_at
    });
  } catch (e: any) {
    res.status(500).json({ error: { code: 'DB_ERROR', message: e.message } });
  }
});

/**
 * GET /video/longform/recipes
 * List recipes for a deliverable.
 */
router.get('/recipes', async (req: Request, res: Response) => {
  const { deliverableId } = req.query;
  try {
    const { rows } = await pool.query(
      `SELECT id, deliverable_id, version, instructions, created_at
       FROM edit_recipes WHERE deliverable_id = $1 ORDER BY version DESC`,
      [deliverableId]
    );
    res.json({ recipes: rows });
  } catch (e: any) {
    res.status(500).json({ error: { code: 'DB_ERROR', message: e.message } });
  }
});

/**
 * POST /video/longform/preview
 * Generate proxy-quality preview. Returns renderId for polling.
 */
router.post('/preview', async (req: Request, res: Response) => {
  const { taskId, scriptText, recipeId, deliverableId } = req.body || {};
  if (!taskId || !scriptText) {
    return res.status(400).json({ error: { code: 'INVALID_INPUT', message: 'taskId and scriptText required' } });
  }
  try {
    const result = await longformEditorService.renderWithKie(taskId, scriptText, {
      quality: 'preview',
      recipeId,
      deliverableId
    });
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: { code: 'PREVIEW_FAILED', message: e.message } });
  }
});

/**
 * POST /video/longform/render
 * Generate final HD render. Returns renderId for polling.
 */
router.post('/render', async (req: Request, res: Response) => {
  const { taskId, scriptText, recipeId, deliverableId } = req.body || {};
  if (!taskId || !scriptText) {
    return res.status(400).json({ error: { code: 'INVALID_INPUT', message: 'taskId and scriptText required' } });
  }
  try {
    const result = await longformEditorService.renderWithKie(taskId, scriptText, {
      quality: 'final',
      recipeId,
      deliverableId
    });
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: { code: 'RENDER_FAILED', message: e.message } });
  }
});

/**
 * GET /video/longform/render/:id
 * Poll render status by ID.
 */
router.get('/render/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    const result = await longformEditorService.getRenderStatus(id);
    res.json(result);
  } catch (e: any) {
    if (e.message === 'Render not found') {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Render not found' } });
    }
    res.status(500).json({ error: { code: 'DB_ERROR', message: e.message } });
  }
});

/**
 * GET /video/longform/renders
 * List renders for a deliverable.
 */
router.get('/renders', async (req: Request, res: Response) => {
  const { deliverableId, kind } = req.query;
  try {
    let query = `SELECT id, deliverable_id, recipe_id, kind, status, asset_id, metrics, created_at, completed_at
                 FROM renders WHERE 1=1`;
    const params: unknown[] = [];

    if (deliverableId) {
      params.push(deliverableId);
      query += ` AND deliverable_id = $${params.length}`;
    }
    if (kind) {
      params.push(kind);
      query += ` AND kind = $${params.length}`;
    }
    query += ' ORDER BY created_at DESC LIMIT 50';

    const { rows } = await pool.query(query, params);
    res.json({
      renders: rows.map(r => ({
        renderId: r.id,
        deliverableId: r.deliverable_id,
        recipeId: r.recipe_id,
        kind: r.kind,
        status: r.status,
        assetId: r.asset_id,
        metrics: r.metrics,
        createdAt: r.created_at,
        completedAt: r.completed_at
      }))
    });
  } catch (e: any) {
    res.status(500).json({ error: { code: 'DB_ERROR', message: e.message } });
  }
});

/**
 * POST /video/longform/execute-recipe
 * Execute a recipe on a transcript and get the processed timeline.
 */
router.post('/execute-recipe', async (req: Request, res: Response) => {
  const { recipeId, transcriptId } = req.body || {};
  if (!recipeId || !transcriptId) {
    return res.status(400).json({ error: { code: 'INVALID_INPUT', message: 'recipeId and transcriptId required' } });
  }
  try {
    const timeline = await longformEditorService.executeRecipe(recipeId, transcriptId);
    res.json(timeline);
  } catch (e: any) {
    res.status(500).json({ error: { code: 'EXECUTE_FAILED', message: e.message } });
  }
});

/**
 * POST /video/longform/execute-and-render
 * Full pipeline: execute recipe and render with Kie.ai.
 */
router.post('/execute-and-render', async (req: Request, res: Response) => {
  const { recipeId, transcriptId, taskId, deliverableId, aspectRatio, quality } = req.body || {};
  if (!recipeId || !transcriptId || !taskId) {
    return res.status(400).json({ error: { code: 'INVALID_INPUT', message: 'recipeId, transcriptId, and taskId required' } });
  }
  try {
    const result = await longformEditorService.executeAndRender(recipeId, transcriptId, taskId, {
      deliverableId,
      aspectRatio,
      quality,
    });
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: { code: 'RENDER_FAILED', message: e.message } });
  }
});

/**
 * POST /video/longform/render-kie
 * Render video directly with Kie.ai Veo3 (no recipe execution).
 */
router.post('/render-kie', async (req: Request, res: Response) => {
  const { taskId, scriptText, recipeId, deliverableId, aspectRatio, quality } = req.body || {};
  if (!taskId || !scriptText) {
    return res.status(400).json({ error: { code: 'INVALID_INPUT', message: 'taskId and scriptText required' } });
  }
  try {
    const result = await longformEditorService.renderWithKie(taskId, scriptText, {
      recipeId,
      deliverableId,
      aspectRatio,
      quality,
    });
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: { code: 'RENDER_FAILED', message: e.message } });
  }
});

/**
 * POST /video/longform/voice-command
 * Process a voice command to create a recipe and optionally render.
 * This is the main voice→recipe→render bridge.
 */
router.post('/voice-command', async (req: Request, res: Response) => {
  const { command, transcriptId, deliverableId, autoRender, taskId } = req.body || {};
  if (!command || !transcriptId) {
    return res.status(400).json({ error: { code: 'INVALID_INPUT', message: 'command and transcriptId required' } });
  }
  try {
    const result = await longformEditorService.processVoiceCommand(command, transcriptId, {
      deliverableId,
      autoRender,
      taskId,
    });
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: { code: 'VOICE_COMMAND_FAILED', message: e.message } });
  }
});

/**
 * GET /video/longform/health
 * Health check for video generation capability.
 */
router.get('/health', async (_req: Request, res: Response) => {
  try {
    const editorHealth = await longformEditorService.healthCheck();
    const generatorHealth = await videoGenerationService.healthCheck();

    res.json({
      editor: editorHealth,
      generator: generatorHealth,
      timestamp: new Date().toISOString(),
    });
  } catch (e: any) {
    res.status(500).json({ error: { code: 'HEALTH_CHECK_FAILED', message: e.message } });
  }
});

/**
 * POST /video/longform/generate
 * Direct video generation from script text using Kie.ai.
 */
router.post('/generate', async (req: Request, res: Response) => {
  const { taskId, scriptText, title, aspectRatio } = req.body || {};
  if (!taskId || !scriptText) {
    return res.status(400).json({ error: { code: 'INVALID_INPUT', message: 'taskId and scriptText required' } });
  }
  try {
    const result = await videoGenerationService.generate({
      taskId,
      scriptText,
      title,
      aspectRatio,
    });

    if (!result.success) {
      return res.status(422).json({
        error: {
          code: result.error,
          message: result.errorMessage,
          action: videoGenerationService.getErrorAction(result.error!),
        },
        durationMs: result.durationMs,
      });
    }

    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: { code: 'GENERATE_FAILED', message: e.message } });
  }
});

export default router;
