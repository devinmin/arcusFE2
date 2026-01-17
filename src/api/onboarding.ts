import { Router, Request, Response } from 'express';
import multer from 'multer';
import { v4 as uuid } from 'uuid';
import { speechService } from '../services/speechService.js';
import { ttsService } from '../services/ttsService.js';
import { ArcAgent } from '../services/arcAgent.js';
import { pool } from '../database/db.js';
import { logger } from '../utils/logger.js';
import { requireAuth } from '../middleware/auth.js';
import { createCampaign } from '../services/campaignService.js';
import { getCostRates } from '../services/costTracker.js';
import { requireCredits } from '../middleware/credits.js';
import { orchestrator } from '../services/orchestrator.js';
import { getFeaturedTemplates, applyTemplate } from '../services/templateService.js';
import { brandExtractionService } from '../services/brandExtractionService.js';
import { magicOrchestrator, MagicRequest } from '../services/magicOrchestrator.js';
import { createDeepOnboardingAgent } from '../services/deepOnboardingAgent.js';
import { strategicProfileService } from '../services/strategicProfileService.js';
import { requireOrganization } from '../middleware/multiTenancy.js';
import { OrgRequest } from '../types/express.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

/**
 * POST /api/onboarding/start
 * Start a new onboarding session
 */
router.post('/start', requireAuth, async (req: Request, res: Response) => {
    try {
        const user = req.user!;

        // Create onboarding session tied to authenticated user
        const result = await pool.query(
            `INSERT INTO onboarding_sessions (client_id, extracted_data)
       VALUES ($1, '{}'::jsonb)
       RETURNING id`,
            [user.id]
        );

        const sessionId = result.rows[0].id;

        // Create Arc agent for this session
        const arc = new ArcAgent(sessionId);

        // Generate Arc's opening message
        const greeting = await arc.respond('Hi!'); // Trigger greeting

        // Convert to audio and track
        const audio = await ttsService.synthesize(greeting.text, user.id);

        // Credit headers
        if (res.locals?.newBalance !== undefined) {
            res.set('X-Credits-Remaining', String(res.locals.newBalance));
            res.set('X-Credits-Deducted', String(res.locals.creditsDeducted || 0));
        }

        // Usage headers
        const rates = getCostRates();
        const usageSummary: unknown[] = [];
        let total = 0;
        if (greeting.usage) {
            usageSummary.push({
                provider: 'anthropic',
                model: greeting.usage.model,
                input_tokens: greeting.usage.input_tokens,
                output_tokens: greeting.usage.output_tokens,
                cost_usd: greeting.usage.cost_usd
            });
            total += greeting.usage.cost_usd || 0;
        }
        const ttsCost = (greeting.text.length / 1000) * rates.ELEVENLABS_PER_1K_CHARS;
        usageSummary.push({ provider: 'elevenlabs', units: { chars: greeting.text.length }, cost_usd: +ttsCost.toFixed(6) });
        total += ttsCost;
        res.set('X-Usage-Cost-USD', total.toFixed(6));
        res.set('X-Usage-Summary', JSON.stringify(usageSummary));

        res.json({
            sessionId,
            message: greeting.text,
            audio: audio ? audio.toString('base64') : null
        });

    } catch (error: unknown) {
    const err = error as Error;
        logger.error('Failed to start onboarding:', error);
        res.status(500).json({ error: err.message });
    }
});

/**
 * POST /api/onboarding/message
 * Process user voice message
 */
router.post('/message', upload.single('audio'), async (req: Request, res: Response) => {
    try {
        const { sessionId } = req.body;
        const audioFile = req.file;

        if (!audioFile) {
            return res.status(400).json({ error: 'No audio file provided' });
        }

        // Resolve clientId for this session
        const s = await pool.query('SELECT client_id FROM onboarding_sessions WHERE id = $1 LIMIT 1', [sessionId]);
        const clientId: string | undefined = s.rows[0]?.client_id;

        // Transcribe audio to text
        const stt = await speechService.transcribe(audioFile.buffer, clientId);

        logger.info(`User said: "${stt.text}"`);

        // Get Arc's response
        const arc = new ArcAgent(sessionId);
        const response = await arc.respond(stt.text);

        // Convert Arc's response to audio
        const audio = await ttsService.synthesize(response.text, clientId);

        // Credit & Usage headers
        if (res.locals?.newBalance !== undefined) {
            res.set('X-Credits-Remaining', String(res.locals.newBalance));
            res.set('X-Credits-Deducted', String(res.locals.creditsDeducted || 0));
        }
        const rates = getCostRates();
        const usageSummary: unknown[] = [];
        let total = 0;
        // AssemblyAI
        const sttCost = (stt.seconds || 0) * rates.ASSEMBLYAI_PER_SEC;
        usageSummary.push({ provider: 'assemblyai', units: { seconds: stt.seconds || 0 }, cost_usd: +sttCost.toFixed(6) });
        total += sttCost;
        // Anthropic
        if (response.usage) {
            usageSummary.push({
                provider: 'anthropic',
                model: response.usage.model,
                input_tokens: response.usage.input_tokens,
                output_tokens: response.usage.output_tokens,
                cost_usd: response.usage.cost_usd
            });
            total += response.usage.cost_usd || 0;
        }
        // ElevenLabs
        const ttsCost = (response.text.length / 1000) * rates.ELEVENLABS_PER_1K_CHARS;
        usageSummary.push({ provider: 'elevenlabs', units: { chars: response.text.length }, cost_usd: +ttsCost.toFixed(6) });
        total += ttsCost;
        res.set('X-Usage-Cost-USD', total.toFixed(6));
        res.set('X-Usage-Summary', JSON.stringify(usageSummary));

        res.json({
            userMessage: stt.text,
            arcMessage: response.text,
            audio: audio ? audio.toString('base64') : null,
            complete: response.complete,
            data: response.extracted_data
        });

    } catch (error: unknown) {
    const err = error as Error;
        logger.error('Failed to process message:', error);
        res.status(500).json({ error: err.message });
    }
});

/**
 * POST /api/onboarding/complete
 * Complete onboarding and create campaign
 */
router.post('/complete', requireAuth, async (req: Request, res: Response) => {
    try {
        const { sessionId, data: extracted } = req.body;
        const user = req.user!;

        // Mark session complete and persist transcript + extracted data
        const arc = new ArcAgent(sessionId);
        await arc.complete(extracted);

        // Map extracted onboarding data to a campaign
        const goals: string[] = Array.isArray(extracted?.goals) ? extracted.goals : [];
        const goalsLower = goals.map((g: string) => g.toLowerCase());
        let objective: 'conversions' | 'traffic' | 'leads' | 'brand_awareness' = 'traffic';
        if (goalsLower.some(g => g.includes('sale') || g.includes('purchase') || g.includes('conversion'))) {
            objective = 'conversions';
        } else if (goalsLower.some(g => g.includes('lead'))) {
            objective = 'leads';
        } else if (goalsLower.some(g => g.includes('awareness') || g.includes('brand'))) {
            objective = 'brand_awareness';
        }

        const channels = Array.isArray(extracted?.channels) ? extracted.channels : [];
        const channelsLower = channels.map((c: string) => String(c).toLowerCase());
        let platforms: ('meta' | 'google' | 'linkedin' | 'email')[] = [];
        if (channelsLower.some((c: string) => ['facebook', 'instagram', 'meta', 'social'].some((k: string) => c.includes(k)))) platforms.push('meta');
        if (channelsLower.some((c: string) => ['email'].some((k: string) => c.includes(k)))) platforms.push('email');
        if (channelsLower.some((c: string) => ['google', 'search', 'youtube'].some((k: string) => c.includes(k)))) platforms.push('google');
        if (channelsLower.some((c: string) => ['linkedin'].some((k: string) => c.includes(k)))) platforms.push('linkedin');
        if (platforms.length === 0) platforms = ['meta'];

        // Budget (assume extracted.budget is dollars; clamp to $10-$10,000)
        const budgetDollars = typeof extracted?.budget === 'number' ? extracted.budget : 100;
        const clamped = Math.max(10, Math.min(10000, Math.round(budgetDollars)));
        const budget_daily = clamped * 100; // store in cents

        const target_audience = {
            age_min: 25,
            age_max: 55,
            locations: ['US'],
            interests: extracted?.target_audience ? [String(extracted.target_audience)] : []
        };

        const name = `${extracted?.business_name || 'New Client'} – Launch Campaign`;
        const brief = extracted?.industry || goals.length > 0
            ? `Industry: ${extracted?.industry || 'N/A'}. Goals: ${goals.join(', ') || 'N/A'}. Website: ${extracted?.website || 'N/A'}`
            : undefined;

        // Trigger Brand Extraction if website provided
        let brandContext: any = null;
        if (extracted?.website) {
            try {
                // Ensure URL protocol
                let url = String(extracted.website).trim();
                if (!url.startsWith('http')) url = 'https://' + url;

                logger.info(`[Onboarding] Starting brand scan for ${url}`);
                await brandExtractionService.startScan(user.id, url);

                // Wait briefly for initial extraction (background scan continues)
                await new Promise(resolve => setTimeout(resolve, 2000));

                // Try to get initial brand context
                try {
                    const scanResult = await brandExtractionService.getScan(await brandExtractionService.startScan(user.id, url).then(r => r.jobId));
                    if (scanResult) {
                        brandContext = {
                            industry: extracted?.industry,
                            colorPalette: scanResult.colors,
                            typography: scanResult.typography,
                            spacing: scanResult.spacing,
                            shadows: scanResult.shadows,
                            breakpoints: scanResult.breakpoints,
                            assets: scanResult.assets,
                        };
                        logger.info(`[Onboarding] Brand context built from scan`);
                    }
                } catch (scanErr) {
                    logger.warn('[Onboarding] Failed to get brand scan results:', scanErr);
                }
            } catch (err) {
                logger.warn('[Onboarding] Failed to trigger brand scan:', err);
            }
        }

        const campaign = await createCampaign({
            client_id: user.id,
            name,
            objective,
            platforms,
            budget_daily,
            target_audience,
            brief
        });

        // Trigger MagicOrchestrator for full agency execution
        // This enables strategic expansion - Arcus decides what deliverables to create
        try {
            const magicRequest: MagicRequest = {
                request: brief || `Create a comprehensive ${objective} campaign for ${extracted?.business_name || 'the client'}. Goals: ${goals.join(', ')}. Channels: ${channels.join(', ')}.`,
                context: {
                    clientId: user.id,
                    organizationId: user.organizationId,
                    projectId: campaign.id,
                    brandContext: brandContext || undefined,
                },
                hints: {
                    urgency: 'medium',
                    skipAmbiguityCheck: true, // First campaign - don't ask clarifying questions
                }
            };

            logger.info(`[Onboarding] Starting MagicOrchestrator for campaign ${campaign.id}`);

            // Execute the full agency pipeline
            const result = await magicOrchestrator.execute(magicRequest);

            if (result.success) {
                logger.info(`[Onboarding] MagicOrchestrator completed: ${result.deliverables?.length || 0} deliverables`);
            } else {
                logger.warn(`[Onboarding] MagicOrchestrator partial: ${result.error || 'Unknown'}`);
            }
        } catch (err) {
            logger.error('Failed to execute MagicOrchestrator:', err);
            // Fall back to simple orchestrator if magic fails
            try {
                await orchestrator.startWorkflow(user.id, campaign.id, "Create initial deliverables for new campaign");
            } catch (fallbackErr) {
                logger.error('Fallback orchestrator also failed:', fallbackErr);
            }
        }

        res.json({ success: true, campaign });

    } catch (error: unknown) {
    const err = error as Error;
        logger.error('Failed to complete onboarding:', error);
        res.status(500).json({ error: err.message });
    }
});

/**
 * GET /api/onboarding/session/:id
 * Get onboarding session details
 */
router.get('/session/:id', async (req: Request, res: Response) => {
    try {
        const { id } = req.params;

        const result = await pool.query(
            `SELECT * FROM onboarding_sessions WHERE id = $1`,
            [id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Session not found' });
        }

        res.json(result.rows[0]);

    } catch (error: unknown) {
    const err = error as Error;
        logger.error('Failed to get session:', error);
        res.status(500).json({ error: err.message });
    }
});

/**
 * GET /api/onboarding/templates
 * Get featured templates for new users during onboarding
 * Shows quick-start templates to accelerate time-to-value
 */
router.get('/templates', requireAuth, async (req: Request, res: Response) => {
    try {
        const user = req.user!;

        if (!user.organizationId) {
            return res.status(400).json({ error: 'Organization ID is required' });
        }

        // Get featured templates for this user's organization
        const templates = await getFeaturedTemplates(user.organizationId, 6);

        logger.info('Fetched onboarding templates', {
            userId: user.id,
            organizationId: user.organizationId,
            templateCount: templates.length,
        });

        res.json({
            templates: templates.map((t) => ({
                id: t.id,
                name: t.name,
                description: t.description,
                category: t.category,
                tags: t.tags,
                thumbnail_url: t.thumbnail_url,
                variables: t.variables,
                estimated_duration_hours: t.campaign_config.default_duration_days ? t.campaign_config.default_duration_days * 24 : null,
            })),
        });

    } catch (error: unknown) {
    const err = error as Error;
        logger.error('Failed to fetch onboarding templates:', error);
        res.status(500).json({ error: err.message });
    }
});

/**
 * POST /api/onboarding/template/:id/select
 * Create first campaign from a template during onboarding
 * Applies brand tokens and creates campaign with deliverables
 */
router.post('/template/:id/select', requireAuth, async (req: Request, res: Response) => {
    try {
        const user = req.user!;
        const { id: templateId } = req.params;
        const { variables } = req.body;

        if (!user.organizationId) {
            return res.status(400).json({ error: 'Organization ID is required' });
        }

        if (!variables || typeof variables !== 'object') {
            return res.status(400).json({ error: 'Template variables are required' });
        }

        // Apply template with brand integration
        const result = await applyTemplate(
            templateId,
            user.organizationId,
            user.id,
            user.id, // Use user as client during onboarding
            variables
        );

        // Optionally trigger initial workflow to generate deliverables
        try {
            await orchestrator.startWorkflow(
                user.id,
                result.campaignId,
                'Generate deliverables from onboarding template'
            );
        } catch (err) {
            logger.error('Failed to start template workflow:', err);
            // Don't fail the request, just log it
        }

        logger.info('Template applied during onboarding', {
            userId: user.id,
            templateId,
            campaignId: result.campaignId,
        });

        res.json({
            success: true,
            campaignId: result.campaignId,
            message: 'Your first campaign is ready! We\'re now generating your deliverables.',
        });

    } catch (error: unknown) {
    const err = error as Error;
        logger.error('Failed to apply onboarding template:', error);
        res.status(500).json({ error: err.message });
    }
});

// ============================================================================
// DEEP ONBOARDING (Agency-style strategic discovery)
// ============================================================================

/**
 * POST /api/onboarding/deep/start
 * Start a deep agency onboarding session
 */
router.post('/deep/start', requireAuth, requireOrganization, async (req: Request, res: Response) => {
    try {
        const organizationId = (req as any).organizationId as string;
        const sessionId = uuid();

        const agent = await createDeepOnboardingAgent(sessionId, organizationId);
        const response = await agent.initialize();

        // Store session mapping
        await pool.query(
            `INSERT INTO onboarding_sessions (id, client_id, session_type, extracted_data)
             VALUES ($1, $2, 'deep', '{}'::jsonb)
             ON CONFLICT (id) DO NOTHING`,
            [sessionId, req.user!.id]
        );

        res.json({
            sessionId,
            ...response,
        });

    } catch (error: unknown) {
        const err = error as Error;
        logger.error('Failed to start deep onboarding:', error);
        res.status(500).json({ error: err.message });
    }
});

/**
 * POST /api/onboarding/deep/message
 * Send a message in the deep onboarding conversation
 */
router.post('/deep/message', requireAuth, requireOrganization, async (req: Request, res: Response) => {
    try {
        const { sessionId, message } = req.body;
        const organizationId = (req as any).organizationId as string;

        if (!message) {
            return res.status(400).json({ error: 'Message is required' });
        }

        const agent = await createDeepOnboardingAgent(sessionId, organizationId);
        const response = await agent.respond(message);

        res.json(response);

    } catch (error: unknown) {
        const err = error as Error;
        logger.error('Failed to process deep onboarding message:', error);
        res.status(500).json({ error: err.message });
    }
});

/**
 * POST /api/onboarding/deep/skip-phase
 * Skip the current phase and move to the next
 */
router.post('/deep/skip-phase', requireAuth, requireOrganization, async (req: Request, res: Response) => {
    try {
        const { sessionId } = req.body;
        const organizationId = (req as any).organizationId as string;

        const agent = await createDeepOnboardingAgent(sessionId, organizationId);
        const response = await agent.skipPhase();

        res.json(response);

    } catch (error: unknown) {
        const err = error as Error;
        logger.error('Failed to skip phase:', error);
        res.status(500).json({ error: err.message });
    }
});

/**
 * GET /api/onboarding/deep/profile
 * Get the current strategic profile
 */
router.get('/deep/profile', requireAuth, requireOrganization, async (req: Request, res: Response) => {
    try {
        const organizationId = (req as any).organizationId as string;

        const profile = await strategicProfileService.getProfile(organizationId);
        const segments = await strategicProfileService.getAudienceSegments(organizationId);
        const competitors = await strategicProfileService.getCompetitors(organizationId);
        const goals = await strategicProfileService.getGoals(organizationId);

        res.json({
            profile,
            segments,
            competitors,
            goals,
        });

    } catch (error: unknown) {
        const err = error as Error;
        logger.error('Failed to get strategic profile:', error);
        res.status(500).json({ error: err.message });
    }
});

/**
 * PATCH /api/onboarding/deep/profile
 * Update the strategic profile
 */
router.patch('/deep/profile', requireAuth, requireOrganization, async (req: Request, res: Response) => {
    try {
        const organizationId = (req as any).organizationId as string;
        const updates = req.body;

        const profile = await strategicProfileService.updateProfile(organizationId, updates);

        res.json({ profile });

    } catch (error: unknown) {
        const err = error as Error;
        logger.error('Failed to update strategic profile:', error);
        res.status(500).json({ error: err.message });
    }
});

/**
 * GET /api/onboarding/deep/agent-context
 * Get formatted context for agent personalization (for debugging/preview)
 */
router.get('/deep/agent-context', requireAuth, requireOrganization, async (req: Request, res: Response) => {
    try {
        const organizationId = (req as any).organizationId as string;

        const context = await strategicProfileService.formatForAgentContext(organizationId);

        res.json({ context });

    } catch (error: unknown) {
        const err = error as Error;
        logger.error('Failed to get agent context:', error);
        res.status(500).json({ error: err.message });
    }
});

export default router;
