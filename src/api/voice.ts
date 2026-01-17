import { Router, Request, Response } from 'express';
import { voiceCloneService } from '../services/voiceCloneService.js';
import { longformEditorService } from '../services/longformEditorService.js';
import { pool } from '../database/db.js';
import { requireAuth } from '../middleware/auth.js';
import { requireOrganization } from '../middleware/multiTenancy.js';

const router = Router();

// All voice routes require authentication (SEC-001 fix)

/**
 * POST /voice/enroll
 * Enroll a voice profile with consent. Accepts either consentId or consent object with proof_url.
 */
router.post('/enroll', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  const { ownerId, consentId, consent, policy } = req.body || {};
  if (!ownerId || (!consentId && !consent?.proof_url)) {
    return res.status(400).json({ error: { code: 'INVALID_INPUT', message: 'ownerId and consentId or consent.proof_url required' } });
  }
  try {
    const result = await voiceCloneService.enroll({ ownerId, consentId, consent, policy });
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: { code: 'ENROLL_FAILED', message: e.message } });
  }
});

/**
 * POST /voice/synthesize
 * Synthesize governed speech for a profile. Embeds watermark and logs usage.
 */
router.post('/synthesize', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  const { voiceProfileId, script, workspaceId } = req.body || {};
  if (!voiceProfileId || !script) {
    return res.status(400).json({ error: { code: 'INVALID_INPUT', message: 'voiceProfileId and script required' } });
  }
  try {
    const result = await voiceCloneService.synthesize({ voiceProfileId, text: script, workspaceId });
    res.json(result);
  } catch (e: any) {
    const msg = e.message || '';
    if (msg.includes('Consent')) {
      return res.status(403).json({ error: { code: 'CONSENT_DENIED', message: msg } });
    }
    res.status(500).json({ error: { code: 'SYNTH_FAILED', message: msg } });
  }
});

/**
 * POST /voice/verify
 * Verify watermark for a generated asset by assetId.
 */
router.post('/verify', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  const { assetId } = req.body || {};
  if (!assetId) {
    return res.status(400).json({ error: { code: 'INVALID_INPUT', message: 'assetId required' } });
  }
  try {
    const result = await voiceCloneService.verifyAsset(assetId);
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: { code: 'VERIFY_FAILED', message: e.message } });
  }
});

/**
 * GET /voice/profile/:id
 * Retrieve voice profile usage stats.
 */
router.get('/profile/:id', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    const { rows } = await pool.query(
      `SELECT id, owner_id, consent_id, usage_count, last_used_at, mos_score FROM voice_profiles WHERE id = $1`,
      [id]
    );
    if (rows.length === 0) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Profile not found' } });
    res.json(rows[0]);
  } catch (e: any) {
    res.status(500).json({ error: { code: 'DB_ERROR', message: e.message } });
  }
});

/**
 * POST /voice/video-command
 * Bridge: Process a voice command for video editing.
 * Converts spoken instructions into video edit recipe and optionally renders.
 */
router.post('/video-command', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  const { command, transcriptId, deliverableId, autoRender, taskId } = req.body || {};

  if (!command || !transcriptId) {
    return res.status(400).json({
      error: { code: 'INVALID_INPUT', message: 'command and transcriptId required' }
    });
  }

  try {
    const result = await longformEditorService.processVoiceCommand(command, transcriptId, {
      deliverableId,
      autoRender: autoRender || false,
      taskId,
    });

    res.json({
      success: true,
      recipe: result.recipe,
      render: result.render,
      message: result.render
        ? `Recipe created and ${result.render.status === 'completed' ? 'video rendered' : 'render started'}`
        : 'Recipe created successfully',
    });
  } catch (e: any) {
    res.status(500).json({ error: { code: 'VOICE_COMMAND_FAILED', message: e.message } });
  }
});

/**
 * POST /voice/to-video
 * Direct voice-to-video generation.
 * Takes a voice transcript/script and generates video with Kie.ai.
 */
router.post('/to-video', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  const { script, taskId, aspectRatio, quality, deliverableId } = req.body || {};

  if (!script || !taskId) {
    return res.status(400).json({
      error: { code: 'INVALID_INPUT', message: 'script and taskId required' }
    });
  }

  try {
    const result = await longformEditorService.renderWithKie(taskId, script, {
      deliverableId,
      aspectRatio: aspectRatio || '16:9',
      quality: quality || 'final',
    });

    if (result.status === 'failed') {
      return res.status(422).json({
        error: { code: 'VIDEO_GENERATION_FAILED', message: 'Video generation failed' },
        renderId: result.renderId,
        durationMs: result.durationMs,
      });
    }

    res.json({
      success: true,
      renderId: result.renderId,
      status: result.status,
      videoUrl: result.url,
      durationMs: result.durationMs,
    });
  } catch (e: any) {
    res.status(500).json({ error: { code: 'VOICE_TO_VIDEO_FAILED', message: e.message } });
  }
});

export default router;
