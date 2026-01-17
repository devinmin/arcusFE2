
import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requireOrganization } from '../middleware/multiTenancy.js';
import { logger } from '../utils/logger.js';
import { magicOrchestrator } from '../services/magicOrchestrator.js';
import { pipelineJobService } from '../services/pipelineJobService.js';
import { auditService } from '../services/auditService.js';
import { memoryService } from '../services/memoryService.js';
import { CREDIT_COSTS } from '../services/creditService.js';
import { requireCredits } from '../middleware/credits.js';

const router = Router();

/**
 * POST /api/chat
 * Alias for /api/generate/magic to support legacy/alternative clients.
 */
router.post('/', requireAuth, requireOrganization, requireCredits(CREDIT_COSTS.GENERATE_DELIVERABLE || 10, 'magic_generation'), async (req: Request, res: Response) => {
    try {
        // Map 'message' or 'text' to 'request' if needed
        const requestBody = req.body;
        const prompt = requestBody.request || requestBody.message || requestBody.text || requestBody.content;

        if (!prompt || typeof prompt !== 'string') {
            // Basic validation
            return res.status(400).json({ error: { code: 'INVALID_INPUT', message: 'Message/Request is required' } });
        }

        // Re-construct body for consistency
        req.body.request = prompt;

        // Log the redirection
        logger.info(`[Chat] Redirecting /api/chat request from ${req.user?.id} to Magic Pipeline`);

        // We can reuse the logic from generate.ts or call the service directly.
        // Copying the logic is safer to avoid circular deps or complex routing.

        const { request, context, hints, sync } = req.body;
        const user = req.user!;
        const organizationId = (user as any).organizationId;

        // Async by default
        if (sync !== true) {
            const { jobId, estimatedDurationMs } = await pipelineJobService.createJob(
                {
                    request,
                    context: { ...context, organizationId },
                    hints,
                },
                user.id,
                organizationId
            );

            return res.status(202).json({
                success: true,
                async: true,
                jobId,
                statusUrl: `/api/jobs/pipeline/${jobId}`,
                streamUrl: `/api/jobs/pipeline/${jobId}/stream`,
                estimatedDurationMs,
                message: 'Processing started.',
            });
        }

        // Sync execution
        await magicOrchestrator.initialize();
        const result = await magicOrchestrator.execute({
            request,
            context: { ...context, userId: user.id },
            hints,
        });

        if (!result.success) {
            return res.status(422).json({
                success: false,
                error: { code: 'GENERATION_FAILED', message: result.error }
            });
        }

        res.json({
            success: true,
            async: false,
            routing: result.routing,
            deliverables: result.deliverables,
            // Map response to simple 'message' for basic chat clients if needed?
            // But usually they expect the standard structure.
            message: result.routing.reasoning || "Request processed."
        });

    } catch (error: unknown) {
    const err = error as Error;
        logger.error('[Chat] Error:', error);
        res.status(500).json({ error: { code: 'CHAT_FAILED', message: 'Chat processing failed' } });
    }
});

export default router;
