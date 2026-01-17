import { Router, Request, Response } from 'express';
import { orchestratorMetrics } from '../services/orchestratorMetrics.js';
import { pool } from '../database/db.js';
import { CircuitBreakerRegistry, CircuitState } from '../services/circuitBreaker.js';
import { logger } from '../utils/logger.js';

const router = Router();

// In-memory counters for application metrics
const counters: Map<string, Map<string, number>> = new Map();
const startTime = Date.now();

/**
 * Increment a counter metric
 */
export function incrementCounter(name: string, labels: Record<string, string> = {}, value: number = 1): void {
  if (!counters.has(name)) {
    counters.set(name, new Map());
  }
  const key = Object.entries(labels)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}="${v}"`)
    .join(',');
  const counter = counters.get(name)!;
  counter.set(key, (counter.get(key) || 0) + value);
}

/**
 * GET /metrics
 * JSON metrics summary (original behavior)
 */
router.get('/', async (req: Request, res: Response) => {
  const days = req.query.days ? parseInt(req.query.days as string, 10) : 7;
  const summary = await orchestratorMetrics.getSummary(days);
  res.json(summary);
});

/**
 * GET /metrics/prometheus
 * Prometheus-formatted metrics for monitoring systems
 */
router.get('/prometheus', async (_req: Request, res: Response) => {
  try {
    const lines: string[] = [];

    // Process uptime
    lines.push('# HELP process_uptime_seconds Process uptime in seconds');
    lines.push('# TYPE process_uptime_seconds gauge');
    lines.push(`process_uptime_seconds ${Math.round((Date.now() - startTime) / 1000)}`);

    // Memory usage
    const mem = process.memoryUsage();
    lines.push('# HELP process_heap_bytes Process heap size in bytes');
    lines.push('# TYPE process_heap_bytes gauge');
    lines.push(`process_heap_bytes{type="used"} ${mem.heapUsed}`);
    lines.push(`process_heap_bytes{type="total"} ${mem.heapTotal}`);

    // Database pool stats
    const poolStats = {
      total: (pool as any).totalCount || 0,
      idle: (pool as any).idleCount || 0,
      waiting: (pool as any).waitingCount || 0,
    };
    lines.push('# HELP db_pool_connections Database connection pool');
    lines.push('# TYPE db_pool_connections gauge');
    lines.push(`db_pool_connections{type="total"} ${poolStats.total}`);
    lines.push(`db_pool_connections{type="idle"} ${poolStats.idle}`);
    lines.push(`db_pool_connections{type="waiting"} ${poolStats.waiting}`);

    // Circuit breaker states
    const cbStatus = CircuitBreakerRegistry.getAllStatus();
    lines.push('# HELP circuit_breaker_state Circuit breaker state (0=closed, 1=open, 2=half_open)');
    lines.push('# TYPE circuit_breaker_state gauge');
    for (const [name, status] of Object.entries(cbStatus)) {
      const stateValue = status.state === CircuitState.CLOSED ? 0 :
                        status.state === CircuitState.OPEN ? 1 : 2;
      lines.push(`circuit_breaker_state{service="${name}"} ${stateValue}`);
    }

    lines.push('# HELP circuit_breaker_failures Circuit breaker failure count');
    lines.push('# TYPE circuit_breaker_failures gauge');
    for (const [name, status] of Object.entries(cbStatus)) {
      lines.push(`circuit_breaker_failures{service="${name}"} ${status.stats.totalFailures}`);
    }

    // Application counters
    for (const [name, values] of counters) {
      lines.push(`# HELP ${name} Application counter`);
      lines.push(`# TYPE ${name} counter`);
      for (const [labels, value] of values) {
        const labelStr = labels ? `{${labels}}` : '';
        lines.push(`${name}${labelStr} ${value}`);
      }
    }

    // Database stats from queries
    try {
      // Active campaigns count
      const campaignsResult = await pool.query(`
        SELECT status, COUNT(*) as count
        FROM campaigns
        GROUP BY status
      `);
      lines.push('# HELP campaigns_total Total campaigns by status');
      lines.push('# TYPE campaigns_total gauge');
      for (const row of campaignsResult.rows) {
        lines.push(`campaigns_total{status="${row.status}"} ${row.count}`);
      }

      // DLQ entries
      const dlqResult = await pool.query(`
        SELECT error_category, COUNT(*) as count
        FROM dead_letter_queue
        WHERE resolved_at IS NULL
        GROUP BY error_category
      `);
      lines.push('# HELP dlq_entries_total Dead letter queue entries by category');
      lines.push('# TYPE dlq_entries_total gauge');
      for (const row of dlqResult.rows) {
        lines.push(`dlq_entries_total{category="${row.error_category}"} ${row.count}`);
      }

      // Pending approvals
      const approvalsResult = await pool.query(`
        SELECT COUNT(*) as count
        FROM tasks
        WHERE status = 'waiting_for_approval'
      `);
      lines.push('# HELP pending_approvals_total Pending approval tasks');
      lines.push('# TYPE pending_approvals_total gauge');
      lines.push(`pending_approvals_total ${approvalsResult.rows[0]?.count || 0}`);

    } catch (dbError) {
      logger.error('Error fetching DB metrics', { error: (dbError as Error).message });
    }

    res.setHeader('Content-Type', 'text/plain; version=0.0.4');
    res.send(lines.join('\n'));
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('Error generating Prometheus metrics', { error: (error as Error).message });
    res.status(500).send('Error generating metrics');
  }
});

export default router;
