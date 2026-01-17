import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { ApiKeyService } from '../services/apiKeyService.js';
import { logger } from '../utils/logger.js';

const router = Router();

/**
 * POST /api/keys
 * Generate a new API Key
 */
router.post('/', requireAuth, async (req: Request, res: Response) => {
    try {
        const schema = z.object({
            name: z.string().min(1).max(50)
        });

        const { name } = schema.parse(req.body);
        const user = req.user!;

        // Org context from multi-tenant middleware, or fallback
        const orgId = req.org?.organization.id;

        if (!orgId) {
            return res.status(400).json({
                error: { code: 'NO_ORG', message: 'User must belong to an organization to create keys' }
            });
        }

        const { apiKey, secretKey } = await ApiKeyService.createKey(user.id, orgId, name);

        // Audit Log
        const { audit } = await import('../utils/logger.js');
        audit.info('api_key.created', { user_id: user.id, org_id: orgId, key_id: apiKey.id });

        res.status(201).json({
            key: apiKey,
            secret: secretKey // ONE TIME DISPLAY
        });

    } catch (error: unknown) {
    const err = error as Error;
        if (error instanceof z.ZodError) {
            return res.status(400).json({ error: { code: 'VALIDATION_ERROR', details: error.errors } });
        }
        logger.error('Create Key Error:', error);
        res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to create key' } });
    }
});

/**
 * GET /api/keys
 * List active keys
 */
router.get('/', requireAuth, async (req: Request, res: Response) => {
    try {
        const user = req.user!;
        const orgId = req.org?.organization.id;

        if (!orgId) return res.json([]); // No org, no keys

        const keys = await ApiKeyService.listKeys(user.id, orgId);
        res.json(keys);
    } catch (error: unknown) {
    const err = error as Error;
        logger.error('List Keys Error:', error);
        res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to list keys' } });
    }
});

/**
 * DELETE /api/keys/:id
 * Revoke a key
 */
router.delete('/:id', requireAuth, async (req: Request, res: Response) => {
    try {
        const user = req.user!;
        const { id } = req.params;

        await ApiKeyService.revokeKey(id, user.id);

        const { audit } = await import('../utils/logger.js');
        audit.info('api_key.revoked', { user_id: user.id, key_id: id });

        res.json({ success: true });
    } catch (error: unknown) {
    const err = error as Error;
        logger.error('Revoke Key Error:', error);
        res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to revoke key' } });
    }
});

export default router;
