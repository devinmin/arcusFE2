/**
 * Pipeline Jobs API Routes (Crash-Proof Edition)
 *
 * Provides async job management for long-running pipeline executions:
 * - POST /api/jobs/pipeline - Create a new pipeline job (returns immediately)
 * - GET /api/jobs/pipeline/:jobId - Get job status and result
 * - GET /api/jobs/pipeline/:jobId/stream - SSE stream for real-time progress
 * - GET /api/jobs/pipeline/:jobId/recover - Check recovery options for interrupted job
 * - POST /api/jobs/pipeline/:jobId/recover - Restart an interrupted job
 * - DELETE /api/jobs/pipeline/:jobId - Cancel a running job
 * - GET /api/jobs/pipeline - List user's recent jobs
 *
 * All job state is persisted to PostgreSQL. Jobs survive server restarts.
 */

import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requireCredits } from '../middleware/credits.js';
import { CREDIT_COSTS } from '../services/creditService.js';
import { pipelineJobService, jobEvents, JobProgress } from '../services/pipelineJobService.js';
import { logger } from '../utils/logger.js';

const router = Router();

/**
 * POST /api/jobs/pipeline
 *
 * Create a new pipeline job. Returns immediately with job ID.
 * Use the SSE stream or polling endpoint to track progress.
 *
 * Request body:
 * - request: string (required) - Natural language description
 * - context: object (optional) - Brand context, etc.
 * - hints: object (optional) - Routing hints
 *
 * Headers:
 * - X-Idempotency-Key: string (optional) - Prevents duplicate job creation on retry
 */
router.post(
  '/pipeline',
  requireAuth,
  requireCredits(CREDIT_COSTS.GENERATE_DELIVERABLE || 10, 'pipeline_job'),
  async (req: Request, res: Response) => {
    try {
      const { request, context, hints } = req.body;
      const idempotencyKey = req.headers['x-idempotency-key'] as string | undefined;

      if (!request || typeof request !== 'string') {
        return res.status(400).json({
          error: {
            code: 'INVALID_INPUT',
            message: 'Request is required and must be a string',
          },
        });
      }

      const user = req.user!;
      const organizationId = user.organizationId;

      logger.info(`[PipelineJobs] Creating job for user ${user.id}: "${request.substring(0, 100)}..."`);

      const { jobId, estimatedDurationMs, fromCache } = await pipelineJobService.createJob(
        {
          request,
          context: {
            ...context,
            organizationId,
          },
          hints,
        },
        user.id,
        organizationId,
        { idempotencyKey }
      );

      // Set credit headers (only if not from cache)
      if (!fromCache && res.locals?.newBalance !== undefined) {
        res.set('X-Credits-Remaining', String(res.locals.newBalance));
        res.set('X-Credits-Deducted', String(res.locals.creditsDeducted || 0));
      }

      // Indicate if this was a cached response
      if (fromCache) {
        res.set('X-Idempotent-Replay', 'true');
      }

      res.status(202).json({
        success: true,
        jobId,
        estimatedDurationMs,
        statusUrl: `/api/jobs/pipeline/${jobId}`,
        streamUrl: `/api/jobs/pipeline/${jobId}/stream`,
        fromCache: fromCache || false,
        message: fromCache
          ? 'Returning existing job for this idempotency key.'
          : 'Pipeline job created. Use statusUrl to poll or streamUrl for real-time updates.',
      });
    } catch (error: unknown) {
    const err = error as any;
      logger.error('[PipelineJobs] Create error:', error);
      res.status(500).json({
        error: {
          code: 'JOB_CREATE_FAILED',
          message: err.message || 'Failed to create pipeline job',
        },
      });
    }
  }
);

/**
 * GET /api/jobs/pipeline/:jobId
 *
 * Get job status. If completed, includes full result.
 * If interrupted, includes recovery options.
 */
router.get('/pipeline/:jobId', requireAuth, async (req: Request, res: Response) => {
  try {
    const { jobId } = req.params;
    const user = req.user!;

    const job = await pipelineJobService.getJob(jobId);

    if (!job) {
      return res.status(404).json({
        error: {
          code: 'JOB_NOT_FOUND',
          message: 'Pipeline job not found or expired',
        },
      });
    }

    // Security: Only allow access to own jobs
    if (job.userId !== user.id) {
      return res.status(403).json({
        error: {
          code: 'ACCESS_DENIED',
          message: 'You do not have access to this job',
        },
      });
    }

    const summary = await pipelineJobService.getJobSummary(jobId);

    // Prevent caching - job status changes frequently
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    // If completed or failed, include full result
    if (job.status === 'completed' || job.status === 'failed') {
      return res.json({
        ...summary,
        result: job.result,
        error: job.error,
        progress: job.progress,
      });
    }

    // If interrupted, include recovery info
    if (job.status === 'interrupted') {
      const recoveryInfo = await pipelineJobService.getRecoveryInfo(jobId);
      return res.json({
        ...summary,
        progress: job.progress,
        recovery: {
          canRecover: recoveryInfo?.canRecover || false,
          recoveryAttempts: recoveryInfo?.recoveryAttempts || 0,
          maxAttempts: recoveryInfo?.maxAttempts || 3,
          recoverUrl: `/api/jobs/pipeline/${jobId}/recover`,
          message: recoveryInfo?.canRecover
            ? 'This job was interrupted. You can restart it.'
            : 'This job was interrupted and has exceeded maximum recovery attempts.',
        },
      });
    }

    // If still running, just return summary
    res.json({
      ...summary,
      progress: job.progress,
    });
  } catch (error: unknown) {
    const err = error as any;
    logger.error('[PipelineJobs] Get status error:', error);
    res.status(500).json({
      error: {
        code: 'STATUS_FETCH_FAILED',
        message: err.message || 'Failed to fetch job status',
      },
    });
  }
});

/**
 * GET /api/jobs/pipeline/:jobId/recover
 *
 * Get recovery information for an interrupted job.
 */
router.get('/pipeline/:jobId/recover', requireAuth, async (req: Request, res: Response) => {
  try {
    const { jobId } = req.params;
    const user = req.user!;

    const job = await pipelineJobService.getJob(jobId);

    if (!job) {
      return res.status(404).json({
        error: {
          code: 'JOB_NOT_FOUND',
          message: 'Pipeline job not found',
        },
      });
    }

    if (job.userId !== user.id) {
      return res.status(403).json({
        error: {
          code: 'ACCESS_DENIED',
          message: 'You do not have access to this job',
        },
      });
    }

    const recoveryInfo = await pipelineJobService.getRecoveryInfo(jobId);

    if (!recoveryInfo) {
      return res.status(404).json({
        error: {
          code: 'JOB_NOT_FOUND',
          message: 'Job not found',
        },
      });
    }

    res.json({
      jobId,
      status: job.status,
      canRecover: recoveryInfo.canRecover,
      recoveryAttempts: recoveryInfo.recoveryAttempts,
      maxAttempts: recoveryInfo.maxAttempts,
      lastProgress: recoveryInfo.lastProgress,
      message: job.status !== 'interrupted'
        ? 'This job is not in an interrupted state.'
        : recoveryInfo.canRecover
          ? 'This job can be restarted.'
          : 'This job has exceeded maximum recovery attempts.',
    });
  } catch (error: unknown) {
    const err = error as any;
    logger.error('[PipelineJobs] Get recovery info error:', error);
    res.status(500).json({
      error: {
        code: 'RECOVERY_INFO_FAILED',
        message: err.message || 'Failed to get recovery info',
      },
    });
  }
});

/**
 * POST /api/jobs/pipeline/:jobId/recover
 *
 * Restart an interrupted job.
 * Creates a new job with the same request.
 */
router.post(
  '/pipeline/:jobId/recover',
  requireAuth,
  requireCredits(CREDIT_COSTS.GENERATE_DELIVERABLE || 10, 'pipeline_job_recovery'),
  async (req: Request, res: Response) => {
    try {
      const { jobId } = req.params;
      const user = req.user!;

      const job = await pipelineJobService.getJob(jobId);

      if (!job) {
        return res.status(404).json({
          error: {
            code: 'JOB_NOT_FOUND',
            message: 'Pipeline job not found',
          },
        });
      }

      if (job.userId !== user.id) {
        return res.status(403).json({
          error: {
            code: 'ACCESS_DENIED',
            message: 'You do not have access to this job',
          },
        });
      }

      if (job.status !== 'interrupted') {
        return res.status(400).json({
          error: {
            code: 'NOT_RECOVERABLE',
            message: `Job is not in an interrupted state (current status: ${job.status})`,
          },
        });
      }

      const result = await pipelineJobService.restartJob(jobId);

      if (!result) {
        return res.status(400).json({
          error: {
            code: 'RECOVERY_FAILED',
            message: 'Job cannot be recovered (max attempts exceeded or invalid state)',
          },
        });
      }

      // Set credit headers
      if (res.locals?.newBalance !== undefined) {
        res.set('X-Credits-Remaining', String(res.locals.newBalance));
        res.set('X-Credits-Deducted', String(res.locals.creditsDeducted || 0));
      }

      logger.info(`[PipelineJobs] Job ${jobId} recovered as ${result.newJobId}`);

      res.status(202).json({
        success: true,
        action: 'restarted',
        originalJobId: jobId,
        newJobId: result.newJobId,
        estimatedDurationMs: result.estimatedDurationMs,
        statusUrl: `/api/jobs/pipeline/${result.newJobId}`,
        streamUrl: `/api/jobs/pipeline/${result.newJobId}/stream`,
        message: 'Job has been restarted successfully.',
      });
    } catch (error: unknown) {
    const err = error as Error;
      logger.error('[PipelineJobs] Recovery error:', error);
      res.status(500).json({
        error: {
          code: 'RECOVERY_FAILED',
          message: err.message || 'Failed to recover job',
        },
      });
    }
  }
);

/**
 * GET /api/jobs/pipeline/:jobId/stream
 *
 * Server-Sent Events (SSE) stream for real-time progress updates.
 * Client should use EventSource to connect.
 */
router.get('/pipeline/:jobId/stream', requireAuth, async (req: Request, res: Response) => {
  const { jobId } = req.params;
  const user = req.user!;

  const job = await pipelineJobService.getJob(jobId);

  if (!job) {
    return res.status(404).json({
      error: {
        code: 'JOB_NOT_FOUND',
        message: 'Pipeline job not found or expired',
      },
    });
  }

  // Security: Only allow access to own jobs
  if (job.userId !== user.id) {
    return res.status(403).json({
      error: {
        code: 'ACCESS_DENIED',
        message: 'You do not have access to this job',
      },
    });
  }

  // Set up SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering

  // Send initial state
  const sendEvent = (event: string, data: unknown) => {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  // Send current progress history
  for (const progress of job.progress) {
    sendEvent('progress', progress);
  }

  // If already completed, send result and close
  if (job.status === 'completed') {
    sendEvent('complete', {
      success: job.result?.success,
      deliverables: job.result?.deliverables?.length || 0,
      routing: job.result?.routing,
    });
    res.end();
    return;
  }

  if (job.status === 'failed' || job.status === 'cancelled') {
    sendEvent('error', { message: job.error || 'Job failed' });
    res.end();
    return;
  }

  if (job.status === 'interrupted') {
    sendEvent('interrupted', {
      message: 'Job was interrupted due to server restart',
      canRecover: job.canRecover,
      recoverUrl: `/api/jobs/pipeline/${jobId}/recover`,
    });
    res.end();
    return;
  }

  // Set up listeners for ongoing updates
  const onProgress = (progress: JobProgress) => {
    sendEvent('progress', progress);
  };

  const onComplete = (result: unknown) => {
    const typedResult = result as { success?: boolean; deliverables?: any[]; routing?: any };
    sendEvent('complete', {
      success: typedResult.success,
      deliverables: typedResult.deliverables?.length || 0,
      routing: typedResult.routing,
    });
    cleanup();
    res.end();
  };

  const onError = (error: string) => {
    sendEvent('error', { message: error });
    cleanup();
    res.end();
  };

  const cleanup = () => {
    jobEvents.removeListener(`progress:${jobId}`, onProgress);
    jobEvents.removeListener(`complete:${jobId}`, onComplete);
    jobEvents.removeListener(`error:${jobId}`, onError);
  };

  jobEvents.on(`progress:${jobId}`, onProgress);
  jobEvents.on(`complete:${jobId}`, onComplete);
  jobEvents.on(`error:${jobId}`, onError);

  // Handle client disconnect
  req.on('close', () => {
    logger.debug(`[PipelineJobs] SSE client disconnected for job ${jobId}`);
    cleanup();
  });

  // Keep-alive ping every 15 seconds
  const pingInterval = setInterval(() => {
    if (!res.writableEnded) {
      res.write(': ping\n\n');
    } else {
      clearInterval(pingInterval);
    }
  }, 15000);

  req.on('close', () => {
    clearInterval(pingInterval);
  });
});

/**
 * DELETE /api/jobs/pipeline/:jobId
 *
 * Cancel a running job.
 */
router.delete('/pipeline/:jobId', requireAuth, async (req: Request, res: Response) => {
  try {
    const { jobId } = req.params;
    const user = req.user!;

    const job = await pipelineJobService.getJob(jobId);

    if (!job) {
      return res.status(404).json({
        error: {
          code: 'JOB_NOT_FOUND',
          message: 'Pipeline job not found or expired',
        },
      });
    }

    // Security: Only allow access to own jobs
    if (job.userId !== user.id) {
      return res.status(403).json({
        error: {
          code: 'ACCESS_DENIED',
          message: 'You do not have access to this job',
        },
      });
    }

    const cancelled = await pipelineJobService.cancelJob(jobId);

    if (cancelled) {
      res.json({ success: true, message: 'Job cancelled' });
    } else {
      res.status(400).json({
        error: {
          code: 'CANNOT_CANCEL',
          message: 'Job cannot be cancelled (not running or already completed)',
        },
      });
    }
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('[PipelineJobs] Cancel error:', error);
    res.status(500).json({
      error: {
        code: 'CANCEL_FAILED',
        message: err.message || 'Failed to cancel job',
      },
    });
  }
});

/**
 * GET /api/jobs/pipeline
 *
 * List user's recent pipeline jobs.
 */
router.get('/pipeline', requireAuth, async (req: Request, res: Response) => {
  try {
    const user = req.user!;
    const limit = Math.min(parseInt(req.query.limit as string) || 10, 50);

    const jobs = await pipelineJobService.getUserJobs(user.id, limit);

    res.json({
      success: true,
      jobs,
      count: jobs.length,
    });
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('[PipelineJobs] List error:', error);
    res.status(500).json({
      error: {
        code: 'LIST_FAILED',
        message: err.message || 'Failed to list jobs',
      },
    });
  }
});

export default router;
