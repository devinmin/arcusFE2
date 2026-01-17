import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { pool } from '../database/db.js';
import { forecastClientCosts, AutopilotMode } from '../services/forecastService.js';
import { policyEngine } from '../services/policyEngine.js';
import { logger } from '../utils/logger.js';

const router = Router();

// GET /api/autonomy/status?clientId=
router.get('/status', requireAuth, async (req: Request, res: Response) => {
  try {
    const clientId = (req.query.clientId as string) || (req as any).user.id;

    const { rows } = await pool.query(
      `SELECT enabled, metadata FROM feature_flags WHERE flag_name = 'ff.autopilot' AND workspace_id = $1`,
      [clientId]
    );

    const enabled = rows.length > 0 ? !!rows[0].enabled : false;
    const mode = rows.length > 0 && rows[0].metadata?.mode ? (rows[0].metadata.mode as AutopilotMode) : 'observe';

    res.json({ enabled, mode });
  } catch (err: any) {
    logger.error('autonomy status error', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/autonomy/forecast?clientId=&mode=&monthlySpendUSD=&assetsPerMonth=
router.get('/forecast', requireAuth, async (req: Request, res: Response) => {
  try {
    const clientId = (req.query.clientId as string) || (req as any).user.id;
    const mode = ((req.query.mode as string) || 'observe') as AutopilotMode;
    const monthlySpendUSD = req.query.monthlySpendUSD ? parseFloat(req.query.monthlySpendUSD as string) : undefined;
    const assetsPerMonth = req.query.assetsPerMonth ? parseInt(req.query.assetsPerMonth as string, 10) : undefined;

    const estimate = await forecastClientCosts({ clientId, mode, monthlySpendUSD, assetsPerMonth });

    // Compare to remaining budget (workspace_budgets)
    const budget = await policyEngine.checkBudget(clientId, Math.round(estimate.costUSD.monthly * 100));

    res.json({ estimate, budget });
  } catch (err: any) {
    logger.error('autonomy forecast error', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/autonomy/toggle { clientId, enabled, mode }
router.post('/toggle', requireAuth, async (req: Request, res: Response) => {
  try {
    const { clientId: bodyClientId, enabled, mode } = req.body as { clientId?: string; enabled: boolean; mode?: AutopilotMode };
    const clientId = bodyClientId || (req as any).user.id;
    const m: AutopilotMode = mode || 'standard';

    const estimate = await forecastClientCosts({ clientId, mode: m });
    const budget = await policyEngine.checkBudget(clientId, Math.round(estimate.costUSD.monthly * 100));

    await pool.query(
      `INSERT INTO feature_flags (flag_name, enabled, workspace_id, metadata, updated_at)
       VALUES ('ff.autopilot', $1, $2, $3::jsonb, NOW())
       ON CONFLICT (flag_name, workspace_id)
       DO UPDATE SET enabled = EXCLUDED.enabled, metadata = EXCLUDED.metadata, updated_at = NOW()`,
      [enabled, clientId, JSON.stringify({ mode: m, forecastUSDMonthly: estimate.costUSD.monthly })]
    );

    const warning = !budget.withinBudget
      ? `Warning: forecasted monthly cost $${estimate.costUSD.monthly.toFixed(2)} exceeds remaining budget $${(budget.remainingCents / 100).toFixed(2)}.`
      : `Enabling may consume up to ~$${estimate.costUSD.monthly.toFixed(2)} this month in AI credits.`;

    res.json({ success: true, enabled, mode: m, estimate, budget, warning });
  } catch (err: any) {
    logger.error('autonomy toggle error', err);
    res.status(500).json({ error: err.message });
  }
});

export const autonomyRoutes = router;
