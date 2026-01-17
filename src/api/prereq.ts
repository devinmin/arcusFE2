import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

// SEC-004 FIX: Prereq endpoint exposes configuration info - require auth
router.use(requireAuth);

router.get('/', async (_req: Request, res: Response) => {
  const envs = {
    ELEVENLABS_API_KEY: !!process.env.ELEVENLABS_API_KEY,
    DIA2_SERVICE_URL: !!process.env.DIA2_SERVICE_URL,
    HUMO_SERVICE_URL: !!process.env.HUMO_SERVICE_URL,
    AVATAR_SFU_URL: !!process.env.AVATAR_SFU_URL,
    FRONTEND_URL: !!process.env.FRONTEND_URL,
  };
  res.json({ envs });
});

export default router;
