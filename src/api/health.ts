/**
 * Health Check Endpoints
 *
 * Provides health and readiness checks for the application.
 * These are used by load balancers, Kubernetes, and monitoring systems.
 *
 * Endpoints:
 * - GET /health - Basic liveness check (is the process running?)
 * - GET /health/ready - Readiness check (are all dependencies available?)
 * - GET /health/detailed - Detailed health information (admin only)
 */

import { Router, Request, Response } from 'express';
import { pool } from '../database/db.js';
import { CircuitBreakerRegistry } from '../services/circuitBreaker.js';
import { logger } from '../utils/logger.js';

const router = Router();

interface HealthCheck {
  name: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  latency?: number;
  message?: string;
}

interface HealthResponse {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  version: string;
  uptime: number;
  checks?: HealthCheck[];
}

const startTime = Date.now();
const version = process.env.npm_package_version || '1.0.0';

/**
 * Check database connectivity
 */
async function checkDatabase(): Promise<HealthCheck> {
  const start = Date.now();
  try {
    await pool.query('SELECT 1');
    return {
      name: 'database',
      status: 'healthy',
      latency: Date.now() - start,
    };
  } catch (error: unknown) {
    const err = error as Error;
    return {
      name: 'database',
      status: 'unhealthy',
      latency: Date.now() - start,
      message: (error as Error).message,
    };
  }
}

/**
 * Check Redis connectivity (if configured)
 */
async function checkRedis(): Promise<HealthCheck> {
  // Skip if Redis not configured
  if (!process.env.REDIS_URL) {
    return {
      name: 'redis',
      status: 'healthy',
      message: 'Not configured (optional)',
    };
  }

  const start = Date.now();
  try {
    // Lazy import to avoid errors if redis not installed
    const redis = await import('ioredis').catch(() => null);
    if (!redis) {
      return {
        name: 'redis',
        status: 'healthy',
        message: 'Not installed (optional)',
      };
    }

    const client = new redis.default(process.env.REDIS_URL);
    await client.ping();
    await client.quit();

    return {
      name: 'redis',
      status: 'healthy',
      latency: Date.now() - start,
    };
  } catch (error: unknown) {
    const err = error as Error;
    return {
      name: 'redis',
      status: 'degraded',
      latency: Date.now() - start,
      message: (error as Error).message,
    };
  }
}

/**
 * Check circuit breaker states
 */
function checkCircuitBreakers(): HealthCheck {
  const allStatus = CircuitBreakerRegistry.getAllStatus();
  const openCircuits = Object.entries(allStatus)
    .filter(([_, status]) => status.state === 'OPEN')
    .map(([name]) => name);

  if (openCircuits.length === 0) {
    return {
      name: 'circuit_breakers',
      status: 'healthy',
    };
  }

  return {
    name: 'circuit_breakers',
    status: 'degraded',
    message: `Open circuits: ${openCircuits.join(', ')}`,
  };
}

/**
 * Check memory usage
 */
function checkMemory(): HealthCheck {
  const used = process.memoryUsage();
  const heapUsedMB = Math.round(used.heapUsed / 1024 / 1024);
  const heapTotalMB = Math.round(used.heapTotal / 1024 / 1024);
  const usagePercent = Math.round((used.heapUsed / used.heapTotal) * 100);

  // Be more lenient with memory checks - treat as warning not unhealthy
  if (usagePercent > 95) {
    return {
      name: 'memory',
      status: 'degraded',
      message: `High memory usage: ${heapUsedMB}MB / ${heapTotalMB}MB (${usagePercent}%)`,
    };
  }

  if (usagePercent > 80) {
    return {
      name: 'memory',
      status: 'degraded',
      message: `Elevated memory usage: ${heapUsedMB}MB / ${heapTotalMB}MB (${usagePercent}%)`,
    };
  }

  return {
    name: 'memory',
    status: 'healthy',
    message: `${heapUsedMB}MB / ${heapTotalMB}MB (${usagePercent}%)`,
  };
}

/**
 * Aggregate health status from checks
 */
function aggregateStatus(checks: HealthCheck[]): 'healthy' | 'degraded' | 'unhealthy' {
  const hasUnhealthy = checks.some((c) => c.status === 'unhealthy');
  const hasDegraded = checks.some((c) => c.status === 'degraded');

  if (hasUnhealthy) return 'unhealthy';
  if (hasDegraded) return 'degraded';
  return 'healthy';
}

/**
 * GET /health
 * Basic liveness check with database and memory checks
 */
router.get('/', async (_req: Request, res: Response) => {
  try {
    const checks: HealthCheck[] = [
      await checkDatabase(),
      checkMemory(),
    ];

    const status = aggregateStatus(checks);
    const statusCode = status === 'unhealthy' ? 503 : 200;

    res.status(statusCode).json({
      status,
      timestamp: new Date().toISOString(),
      checks: {
        database: checks.find(c => c.name === 'database')!,
        memory: checks.find(c => c.name === 'memory')!,
      }
    });
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('Health check failed', { error: (error as Error).message });
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      checks: {
        database: { name: 'database', status: 'unhealthy' as const },
        memory: { name: 'memory', status: 'unhealthy' as const }
      }
    });
  }
});

/**
 * GET /health/ready
 * Readiness check - verifies all dependencies are available
 * Returns 503 if not ready (k8s will stop sending traffic)
 */
router.get('/ready', async (_req: Request, res: Response) => {
  try {
    const checks: HealthCheck[] = [
      await checkDatabase(),
      checkCircuitBreakers(),
    ];

    const status = aggregateStatus(checks);
    const statusCode = status === 'unhealthy' ? 503 : 200;

    const response: HealthResponse = {
      status,
      timestamp: new Date().toISOString(),
      version,
      uptime: Math.round((Date.now() - startTime) / 1000),
      checks,
    };

    res.status(statusCode).json(response);
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('Health check failed', { error: (error as Error).message });
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      version,
      uptime: Math.round((Date.now() - startTime) / 1000),
      message: 'Health check failed',
    });
  }
});

/**
 * GET /health/detailed
 * Detailed health information including all checks
 * Should be protected in production
 */
router.get('/detailed', async (_req: Request, res: Response) => {
  try {
    const checks: HealthCheck[] = [
      await checkDatabase(),
      await checkRedis(),
      checkCircuitBreakers(),
      checkMemory(),
    ];

    const circuitBreakerDetails = CircuitBreakerRegistry.getAllStatus();

    const status = aggregateStatus(checks);
    const statusCode = status === 'unhealthy' ? 503 : 200;

    const response = {
      status,
      timestamp: new Date().toISOString(),
      version,
      uptime: Math.round((Date.now() - startTime) / 1000),
      nodeVersion: process.version,
      environment: process.env.NODE_ENV || 'development',
      checks,
      circuitBreakers: circuitBreakerDetails,
      memory: process.memoryUsage(),
    };

    res.status(statusCode).json(response);
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('Detailed health check failed', { error: (error as Error).message });
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      message: 'Health check failed',
    });
  }
});

export const healthRoutes = router;
