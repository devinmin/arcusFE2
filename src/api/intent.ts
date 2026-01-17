/**
 * Intent Router - Phase 6 CRM & Attribution
 *
 * Handles conversational intents that query or act on CRM and Attribution data.
 * These intents return structured data for card rendering in Arc.
 */

import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { logger } from '../utils/logger.js';
import {
  isPhase6Intent,
  handlePhase6Intent,
  getPhase6IntentDescriptions,
  Phase6Intent,
  IntentResult
} from '../intents/index.js';

const router = Router();

/**
 * POST /api/intent/execute
 *
 * Execute a Phase 6 intent (CRM or Attribution)
 * Returns structured data for card rendering
 */
router.post('/execute', requireAuth, async (req: Request, res: Response) => {
  try {
    const { intent, params } = req.body;
    const user = req.user!;
    // Get organization ID from request header or fallback to user ID
    const organizationId = (req as any).organizationId || req.headers['x-organization-id'] as string || user.id;

    if (!intent || typeof intent !== 'string') {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_INPUT',
          message: 'Intent is required'
        }
      });
    }

    // Check if it's a valid Phase 6 intent
    if (!isPhase6Intent(intent)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'UNKNOWN_INTENT',
          message: `Unknown intent: ${intent}. Use GET /api/intent/list to see available intents.`
        }
      });
    }

    logger.info(`[Intent] Executing ${intent}`, {
      organizationId,
      userId: user.id,
      params
    });

    // Execute the intent
    const result = await handlePhase6Intent(
      intent as Phase6Intent,
      {
        organizationId,
        userId: user.id,
      },
      params || {}
    );

    res.json({
      success: true,
      intent,
      result
    });

  } catch (error: unknown) {
    const err = error as Error;
    logger.error('[Intent] Execution error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTENT_FAILED',
        message: err.message || 'Intent execution failed'
      }
    });
  }
});

/**
 * POST /api/intent/process
 *
 * Process user intent from natural language
 * Alias for detect + execute in a single call
 */
router.post('/process', requireAuth, async (req: Request, res: Response) => {
  try {
    const { query } = req.body;
    const user = req.user!;
    const organizationId = (req as any).organizationId || req.headers['x-organization-id'] as string || user.id;

    if (!query || typeof query !== 'string') {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_INPUT',
          message: 'Query is required'
        }
      });
    }

    // Detect intent
    const detected = detectIntentFromQuery(query.toLowerCase());

    if (!detected.intent) {
      return res.status(200).json({
        success: false,
        query,
        error: {
          code: 'INTENT_NOT_DETECTED',
          message: 'Could not understand the request. Please try rephrasing.'
        },
        suggestions: [
          'Show me my leads',
          'What\'s working?',
          'How are we doing?',
          'Show campaign performance'
        ]
      });
    }

    // Execute the detected intent
    const result = await handlePhase6Intent(
      detected.intent as Phase6Intent,
      {
        organizationId,
        userId: user.id,
      },
      detected.params || {}
    );

    res.json({
      success: true,
      query,
      intent: detected.intent,
      confidence: detected.confidence,
      result
    });

  } catch (error: unknown) {
    const err = error as Error;
    logger.error('[Intent] Process error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'PROCESS_FAILED',
        message: err.message || 'Intent processing failed'
      }
    });
  }
});

/**
 * GET /api/intent/suggestions
 *
 * Get contextual suggestions for what the user might want to do
 * Based on recent activity and available intents
 */
router.get('/suggestions', requireAuth, async (req: Request, res: Response) => {
  try {
    const user = req.user!;
    const organizationId = (req as any).organizationId || req.headers['x-organization-id'] as string || user.id;

    // Get contextual suggestions based on organization data
    const suggestions = [
      {
        text: 'Show me my hot leads',
        intent: 'show_leads',
        params: { scoreMin: 80 },
        category: 'CRM'
      },
      {
        text: 'What\'s working?',
        intent: 'whats_working',
        params: {},
        category: 'Attribution'
      },
      {
        text: 'How are my campaigns performing?',
        intent: 'campaign_performance',
        params: {},
        category: 'Analytics'
      },
      {
        text: 'Show me the pipeline',
        intent: 'show_pipeline',
        params: {},
        category: 'CRM'
      },
      {
        text: 'Create a UTM link',
        intent: 'create_utm',
        params: {},
        category: 'Attribution'
      },
      {
        text: 'Show quality summary',
        intent: 'show_quality_summary',
        params: {},
        category: 'Quality'
      }
    ];

    res.json({
      success: true,
      suggestions,
      organizationId
    });

  } catch (error: unknown) {
    const err = error as Error;
    logger.error('[Intent] Suggestions error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'SUGGESTIONS_FAILED',
        message: err.message || 'Failed to get suggestions'
      }
    });
  }
});

/**
 * POST /api/intent/clarify
 *
 * Ask for clarification when intent is ambiguous
 * Returns questions to narrow down the user's intent
 */
router.post('/clarify', requireAuth, async (req: Request, res: Response) => {
  try {
    const { query, context } = req.body;

    if (!query || typeof query !== 'string') {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_INPUT',
          message: 'Query is required'
        }
      });
    }

    const lowerQuery = query.toLowerCase();
    const detected = detectIntentFromQuery(lowerQuery);

    // If confidence is low or multiple intents could match, ask for clarification
    const clarificationNeeded = detected.confidence < 0.7 || !detected.intent;

    if (clarificationNeeded) {
      const questions = [];

      // Determine what kind of clarification is needed
      if (lowerQuery.includes('campaign')) {
        questions.push({
          text: 'Which campaign would you like to know about?',
          type: 'campaign_selector',
          field: 'campaignId'
        });
      }

      if (lowerQuery.includes('lead')) {
        questions.push({
          text: 'Are you interested in all leads or a specific segment?',
          type: 'multiple_choice',
          field: 'leadFilter',
          options: [
            { label: 'All leads', value: 'all' },
            { label: 'Hot leads only', value: 'hot' },
            { label: 'MQLs', value: 'mql' },
            { label: 'SQLs', value: 'sql' }
          ]
        });
      }

      if (lowerQuery.includes('show') || lowerQuery.includes('what')) {
        questions.push({
          text: 'What would you like to see?',
          type: 'multiple_choice',
          field: 'category',
          options: [
            { label: 'CRM & Leads', value: 'crm' },
            { label: 'Campaign Performance', value: 'campaigns' },
            { label: 'Attribution Data', value: 'attribution' },
            { label: 'Quality Metrics', value: 'quality' }
          ]
        });
      }

      return res.json({
        success: true,
        needsClarification: true,
        query,
        detectedIntent: detected.intent,
        confidence: detected.confidence,
        questions
      });
    }

    // Intent is clear, no clarification needed
    res.json({
      success: true,
      needsClarification: false,
      query,
      detectedIntent: detected.intent,
      confidence: detected.confidence,
      params: detected.params
    });

  } catch (error: unknown) {
    const err = error as Error;
    logger.error('[Intent] Clarify error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'CLARIFY_FAILED',
        message: err.message || 'Clarification failed'
      }
    });
  }
});

/**
 * POST /api/intent/detect
 *
 * Detect the intent from a natural language query.
 * Returns the detected intent and any extracted parameters.
 */
router.post('/detect', requireAuth, async (req: Request, res: Response) => {
  try {
    const { query } = req.body;

    if (!query || typeof query !== 'string') {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_INPUT',
          message: 'Query is required'
        }
      });
    }

    const lowerQuery = query.toLowerCase();

    // Simple pattern matching for intent detection
    // In production, this could use an LLM for better understanding
    const detected = detectIntentFromQuery(lowerQuery);

    res.json({
      success: true,
      query,
      detected
    });

  } catch (error: unknown) {
    const err = error as Error;
    logger.error('[Intent] Detection error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'DETECTION_FAILED',
        message: err.message || 'Intent detection failed'
      }
    });
  }
});

/**
 * GET /api/intent/list
 *
 * List all available Phase 6 intents with descriptions and examples
 */
router.get('/list', requireAuth, async (_req: Request, res: Response) => {
  try {
    const intents = getPhase6IntentDescriptions();

    res.json({
      success: true,
      intents,
      categories: [
        { name: 'CRM', intents: intents.filter(i =>
          ['show_leads', 'show_lead_profile', 'add_lead', 'update_lead_stage',
           'show_pipeline', 'create_email_for_leads', 'add_tag_to_leads', 'get_lead_context'].includes(i.intent)
        )},
        { name: 'Attribution', intents: intents.filter(i =>
          ['show_attribution', 'show_journey', 'whats_working', 'create_utm', 'compare_channels'].includes(i.intent)
        )},
        { name: 'Analytics', intents: intents.filter(i =>
          ['show_metrics', 'campaign_performance', 'show_trends', 'content_insights'].includes(i.intent)
        )},
        { name: 'Quality', intents: intents.filter(i =>
          ['show_quality_summary', 'run_quality_proof', 'show_quality_trends', 'show_blind_test_results'].includes(i.intent)
        )}
      ]
    });

  } catch (error: unknown) {
    const err = error as Error;
    logger.error('[Intent] List error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'LIST_FAILED',
        message: err.message || 'Failed to list intents'
      }
    });
  }
});

/**
 * Detect intent from natural language query
 * Uses pattern matching - could be enhanced with LLM
 */
function detectIntentFromQuery(query: string): {
  intent: string | null;
  confidence: number;
  params: Record<string, unknown>;
} {
  const patterns: Array<{
    intent: Phase6Intent;
    patterns: RegExp[];
    extractParams?: (match: RegExpMatchArray, query: string) => Record<string, unknown>;
  }> = [
    // CRM Intents
    {
      intent: 'show_leads',
      patterns: [
        /show\s+(?:me\s+)?(?:my\s+)?leads?/i,
        /list\s+(?:my\s+)?leads?/i,
        /who\s+are\s+my\s+(?:hot\s+)?leads?/i,
        /leads?\s+list/i,
        /(?:hot|warm|cold)\s+leads?/i,
        /mql(?:s)?|sql(?:s)?/i,
      ],
      extractParams: (_match, q) => {
        const params: Record<string, unknown> = {};
        if (/hot/i.test(q)) params.scoreMin = 80;
        if (/mql/i.test(q)) params.lifecycleStage = 'mql';
        if (/sql/i.test(q)) params.lifecycleStage = 'sql';
        return params;
      }
    },
    {
      intent: 'show_lead_profile',
      patterns: [
        /tell\s+me\s+about\s+(\w+)/i,
        /show\s+(?:lead\s+)?(?:profile\s+)?(?:for\s+)?([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+)/i,
        /(?:lead|profile)\s+details?\s+(?:for\s+)?(\w+)/i,
      ],
      extractParams: (match, _q) => {
        const params: Record<string, unknown> = {};
        if (match[1]) {
          if (match[1].includes('@')) {
            params.email = match[1];
          } else {
            params.name = match[1];
          }
        }
        return params;
      }
    },
    {
      intent: 'add_lead',
      patterns: [
        /add\s+(?:a\s+)?(?:new\s+)?lead/i,
        /new\s+(?:contact|lead)/i,
        /create\s+(?:a\s+)?lead/i,
      ]
    },
    {
      intent: 'update_lead_stage',
      patterns: [
        /move\s+(\w+)\s+to\s+(\w+)/i,
        /mark\s+(?:as\s+)?(\w+)/i,
        /change\s+stage\s+to\s+(\w+)/i,
      ]
    },
    {
      intent: 'show_pipeline',
      patterns: [
        /show\s+(?:me\s+)?(?:the\s+)?pipeline/i,
        /(?:sales\s+)?pipeline/i,
        /what\s+deals?\s+(?:do\s+we\s+have|are\s+there)/i,
        /deal(?:s)?\s+overview/i,
      ]
    },
    {
      intent: 'create_email_for_leads',
      patterns: [
        /(?:create|write|draft)\s+(?:an?\s+)?email\s+for\s+(?:my\s+)?(?:hot\s+)?leads?/i,
        /email\s+(?:campaign\s+)?for\s+leads?/i,
      ],
      extractParams: (_match, q) => {
        const params: Record<string, unknown> = {};
        if (/hot/i.test(q)) params.scoreMin = 80;
        return params;
      }
    },
    {
      intent: 'add_tag_to_leads',
      patterns: [
        /tag\s+(?:these\s+)?leads?\s+(?:as\s+)?["']?(\w+)["']?/i,
        /add\s+tag\s+["']?(\w+)["']?/i,
      ],
      extractParams: (match, _q) => {
        const params: Record<string, unknown> = {};
        if (match[1]) params.tags = [match[1]];
        return params;
      }
    },

    // Attribution Intents
    {
      intent: 'show_attribution',
      patterns: [
        /show\s+(?:me\s+)?attribution/i,
        /attribution\s+(?:data|report|summary)/i,
        /what\s+channels?\s+(?:are\s+)?convert(?:ing)?/i,
      ]
    },
    {
      intent: 'show_journey',
      patterns: [
        /show\s+(?:me\s+)?(?:their\s+)?journey/i,
        /customer\s+journey/i,
        /what\s+touchpoints?\s+(?:did\s+they|were\s+there)/i,
      ]
    },
    {
      intent: 'whats_working',
      patterns: [
        /what(?:'s|\s+is)\s+working/i,
        /which\s+channel\s+should\s+I\s+invest/i,
        /best\s+performing\s+channel/i,
        /top\s+channel/i,
      ]
    },
    {
      intent: 'create_utm',
      patterns: [
        /create\s+(?:a\s+)?utm/i,
        /utm\s+(?:for|link|tag)/i,
        /make\s+(?:a\s+)?tracking\s+link/i,
      ]
    },
    {
      intent: 'compare_channels',
      patterns: [
        /compare\s+(?:.*?)\s+vs\s+/i,
        /compare\s+channels?/i,
        /which\s+performs?\s+better/i,
      ],
      extractParams: (_match, q) => {
        const params: Record<string, unknown> = {};
        const vsMatch = q.match(/compare\s+(\w+)\s+(?:vs|versus|and)\s+(\w+)/i);
        if (vsMatch) {
          params.channels = [vsMatch[1], vsMatch[2]];
        }
        return params;
      }
    },

    // Analytics Intents
    {
      intent: 'show_metrics',
      patterns: [
        /how\s+(?:are\s+we|am\s+i)\s+doing/i,
        /show\s+(?:me\s+)?(?:the\s+)?(?:numbers|metrics|stats)/i,
        /(?:what(?:'s|'re|\s+are))\s+(?:our|my|the)\s+(?:numbers|metrics|stats)/i,
        /performance\s+(?:summary|overview)/i,
        /dashboard|kpis?/i,
      ],
      extractParams: (_match, q) => {
        const params: Record<string, unknown> = {};
        if (/today/i.test(q)) params.period = 'today';
        else if (/week/i.test(q)) params.period = 'week';
        else if (/month/i.test(q)) params.period = 'month';
        else if (/quarter/i.test(q)) params.period = 'quarter';
        else if (/year/i.test(q)) params.period = 'year';
        return params;
      }
    },
    {
      intent: 'campaign_performance',
      patterns: [
        /how\s+(?:are|is)\s+(?:my\s+)?campaign(?:s)?\s+(?:doing|performing)/i,
        /campaign(?:s)?\s+performance/i,
        /which\s+campaign(?:s)?\s+(?:are|is)\s+(?:performing|doing)/i,
        /campaign\s+(?:stats|metrics|results)/i,
      ],
      extractParams: (_match, q) => {
        const params: Record<string, unknown> = {};
        const limitMatch = q.match(/(?:top|best|worst)\s+(\d+)/i);
        if (limitMatch) params.limit = parseInt(limitMatch[1]);
        return params;
      }
    },
    {
      intent: 'show_trends',
      patterns: [
        /show\s+(?:me\s+)?(?:the\s+)?trends?/i,
        /how\s+(?:are|is)\s+(?:things?|we)\s+trending/i,
        /(?:what(?:'s|'re|\s+are))\s+(?:the\s+)?trends?/i,
        /trending\s+(?:data|metrics|analysis)/i,
      ],
      extractParams: (_match, q) => {
        const params: Record<string, unknown> = {};
        if (/deliverable/i.test(q)) params.metric = 'deliverables';
        else if (/lead/i.test(q)) params.metric = 'leads';
        else if (/workflow/i.test(q)) params.metric = 'workflows';
        else if (/campaign/i.test(q)) params.metric = 'campaigns';
        if (/week/i.test(q)) params.period = 'week';
        else if (/quarter/i.test(q)) params.period = 'quarter';
        return params;
      }
    },
    {
      intent: 'content_insights',
      patterns: [
        /what\s+content\s+(?:is|are)\s+working/i,
        /content\s+(?:performance|insights?|analysis)/i,
        /which\s+content\s+(?:types?|kinds?)\s+(?:perform|work)/i,
        /best\s+performing\s+content/i,
      ],
      extractParams: (_match, q) => {
        const params: Record<string, unknown> = {};
        if (/week/i.test(q)) params.period = 'week';
        else if (/quarter/i.test(q)) params.period = 'quarter';
        const typeMatch = q.match(/(?:for\s+)?(blog|email|social|video|landing)/i);
        if (typeMatch) params.contentType = typeMatch[1];
        return params;
      }
    },

    // Quality Intents
    {
      intent: 'show_quality_summary',
      patterns: [
        /how(?:'s|'s|\s+is)\s+(?:our|the)\s+quality/i,
        /show\s+(?:me\s+)?quality\s+(?:metrics|summary|stats)/i,
        /quality\s+(?:overview|summary|report)/i,
        /are\s+we\s+(?:producing\s+)?good\s+(?:work|quality)/i,
      ],
      extractParams: (_match, q) => {
        const params: Record<string, unknown> = {};
        if (/week/i.test(q)) params.period = 'week';
        else if (/quarter/i.test(q)) params.period = 'quarter';
        return params;
      }
    },
    {
      intent: 'run_quality_proof',
      patterns: [
        /run\s+(?:a\s+)?quality\s+(?:proof|test)/i,
        /test\s+(?:our\s+)?quality/i,
        /run\s+blind\s+tests?/i,
        /start\s+(?:a\s+)?benchmark/i,
        /prove\s+(?:our\s+)?quality/i,
      ],
      extractParams: (_match, q) => {
        const params: Record<string, unknown> = {};
        const countMatch = q.match(/(\d+)\s+tests?/i);
        if (countMatch) params.testCount = parseInt(countMatch[1]);
        return params;
      }
    },
    {
      intent: 'show_quality_trends',
      patterns: [
        /quality\s+trends?/i,
        /is\s+quality\s+improving/i,
        /how\s+is\s+quality\s+trending/i,
        /quality\s+over\s+time/i,
      ],
      extractParams: (_match, q) => {
        const params: Record<string, unknown> = {};
        if (/week/i.test(q)) params.period = 'week';
        else if (/quarter/i.test(q)) params.period = 'quarter';
        return params;
      }
    },
    {
      intent: 'show_blind_test_results',
      patterns: [
        /(?:show\s+)?blind\s+test\s+results?/i,
        /how\s+do\s+we\s+compare/i,
        /arcus\s+vs\s+(?:golden|agency|human)/i,
        /compare\s+(?:to\s+)?golden/i,
      ]
    },
  ];

  for (const pattern of patterns) {
    for (const regex of pattern.patterns) {
      const match = query.match(regex);
      if (match) {
        const params = pattern.extractParams ? pattern.extractParams(match, query) : {};
        return {
          intent: pattern.intent,
          confidence: 0.85,
          params
        };
      }
    }
  }

  return {
    intent: null,
    confidence: 0,
    params: {}
  };
}

export default router;
