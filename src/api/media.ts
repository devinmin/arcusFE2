import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requireOrganization } from '../middleware/multiTenancy.js';
import { ttsService } from '../services/ttsService.js';
import { dia2Service } from '../services/dia2Service.js';
import { DeliverableService } from '../services/deliverableService.js';
import { videoGenerationService } from '../services/videoGenerationService.js';
import { requireConsent } from '../middleware/consentGate.js';
import { safetyService } from '../services/safetyService.js';

const router = Router();

router.post('/tts', requireAuth, requireOrganization, async (req: Request, res: Response) => {
  const { script, voice, provider } = req.body || {};
  if (!script) return res.status(400).json({ error: { code: 'INVALID_INPUT', message: 'script required' } });
  try {
    let audio: Buffer;
    if (provider === 'dia2') audio = await dia2Service.synthesize(script, voice);
    else audio = await ttsService.synthesize(script);
    const id = await DeliverableService.saveBinaryDeliverable('00000000-0000-0000-0000-000000000000', 'audio', audio, { provider: provider || 'elevenlabs' });
    res.json({ assetId: id });
  } catch (e: any) {
    res.status(500).json({ error: { code: 'TTS_FAILED', message: e.message } });
  }
});

// HuMo generation requires likeness consent and passes safety checks (blocked site)
router.post('/humo', requireAuth, requireOrganization, requireConsent('likeness', { field: 'likenessConsentId' }), async (req: Request, res: Response) => {
  const { script, voiceAssetId, voiceUrl, refImageUrl, quality, likenessConsentId } = req.body || {};
  if (!script || !refImageUrl) return res.status(400).json({ error: { code: 'INVALID_INPUT', message: 'script and refImageUrl required' } });
  try {
    // Blocklist check on site domain
    try {
      const host = new URL(refImageUrl).hostname;
      await safetyService.assertNotBlocked('site', host);
      await safetyService.audit('media', { resource: 'humo', host, consentId: likenessConsentId });
    } catch (err: any) {
      return res.status(403).json({ error: { code: 'BLOCKED', message: err.message } });
    }

    // If HUMO service configured, call it; else fallback to provider-agnostic video generation
    if (process.env.HUMO_SERVICE_URL) {
      const { humoService } = await import('../services/humoService.js');
      const job = await humoService.generateClip({ script, audioUrl: voiceUrl, refImageUrl, quality, likenessConsentId });
      res.json(job);
      return;
    }
    // Fallback: generate a video using text script and reference image
    const result = await videoGenerationService.generate({
      taskId: '00000000-0000-0000-0000-000000000000',
      scriptText: script,
      inputImage: refImageUrl, // Use reference image as input for image-to-video
      title: 'Short Clip'
    });
    res.json({ jobId: result.taskId, status: result.success ? 'completed' : 'failed', url: result.videoUrl });
  } catch (e: any) {
    res.status(500).json({ error: { code: 'HUMO_FAILED', message: e.message } });
  }
});

export default router;
