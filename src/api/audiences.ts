import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requireOrganization } from '../middleware/multiTenancy.js';
import { AudienceService } from '../services/audienceService.js';
import multer from 'multer';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

/**
 * GET /api/audiences
 * List all audiences
 */
router.get('/', requireAuth, async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = (req as any).user.id;
        const audiences = await AudienceService.getAudiences(userId);
        res.json(audiences);
    } catch (error: unknown) {
    const err = error as Error;
        res.status(500).json({ error: 'Failed to fetch audiences' });
    }
});

/**
 * POST /api/audiences
 * Create a new audience
 */
router.post('/', requireAuth, requireOrganization, async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = (req as any).user.id;
        const { name, description } = req.body;

        if (!name) {
            res.status(400).json({ error: 'Name is required' });
            return;
        }

        const audience = await AudienceService.createAudience(userId, name, description);
        res.status(201).json(audience);
    } catch (error: unknown) {
    const err = error as Error;
        res.status(500).json({ error: 'Failed to create audience' });
    }
});

/**
 * POST /api/audiences/:id/import
 * Import contacts via CSV
 */
router.post('/:id/import', requireAuth, upload.single('file'), async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = (req as any).user.id;
        const id = req.params.id;

        if (!id) {
            res.status(400).json({ error: 'Audience ID is required' });
            return;
        }

        if (!req.file) {
            res.status(400).json({ error: 'No CSV file uploaded' });
            return;
        }

        const csvContent = req.file.buffer.toString('utf-8');
        const result = await AudienceService.importContacts(userId, id, csvContent);

        res.json({ success: true, ...result });
    } catch (error: unknown) {
    const err = error as Error;
        res.status(500).json({ error: 'Failed to import contacts' });
    }
});

export const audienceRoutes = router;
