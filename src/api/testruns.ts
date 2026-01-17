import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { createCampaign } from '../services/campaignService.js';
import { orchestrator } from '../services/orchestrator.js';
import { exportService } from '../services/exportService.js';
import { startRecording } from '../services/recorderService.js';
import path from 'path';
import fs from 'fs';

const router = Router();

router.post('/max', requireAuth, async (req: Request, res: Response) => {
  try {
    const user = req.user!;
    const { record } = req.body || {};
    const scenario = 'zephyrus-max';

    // Seed a campaign for the run
    const campaign = await createCampaign({
      client_id: user.id,
      name: 'Zephyrus Mobility – Global Launch',
      objective: 'conversions',
      platforms: ['meta', 'google', 'linkedin', 'email'],
      budget_daily: 50000, // cents ($500/day) as seed; the workflow may adjust splits
      target_audience: {
        age_min: 25,
        age_max: 45,
        locations: ['US','UK','DE'],
        interests: ['e-bikes', 'commuting', 'sustainability']
      },
      brief: 'Global launch of Zephyrus X Pro e‑bike. Dark mode brand, performance & sustainability. WCAG AA.'
    });

    const goal = 'Max E2E: Zephyrus Mobility global launch (multi-channel, multi-asset, EN/DE)';
    const wf = await orchestrator.startWorkflow(user.id, campaign.id, goal);

    // Pre-create the run output dir (so recorder has a target)
    const base = process.env.DELIVERABLES_PATH || './deliverables';
    const runId = wf?.workflowId
      ? `${new Date().toISOString().replace(/[:.]/g, '-')}_${scenario}`
      : `${Date.now()}_${scenario}`;
    const outDir = path.resolve(base, 'test-runs', runId);
    fs.mkdirSync(outDir, { recursive: true });

    // Optionally start a live recorder that snapshots progress
    if (record) {
      try { await startRecording(wf.workflowId, outDir); } catch {}
    }

    // Write a small run.json
    const runJson = {
      runId,
      scenario,
      workflowId: wf.workflowId,
      campaignId: campaign.id,
      created_at: new Date().toISOString(),
      goal
    };
    fs.mkdirSync(path.join(outDir, 'logs'), { recursive: true });
    fs.writeFileSync(path.join(outDir, 'logs', 'run.json'), JSON.stringify(runJson, null, 2), 'utf-8');

    res.status(201).json({
      success: true,
      runId,
      workflowId: wf.workflowId,
      campaignId: campaign.id,
      outputDir: outDir
    });
  } catch (e: any) {
    res.status(500).json({ error: { message: e.message || 'Failed to start max test run' } });
  }
});

export default router;
