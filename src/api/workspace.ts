import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requireOrganization } from '../middleware/multiTenancy.js';
import { attachOrgZoFeatures, requireZoFeature } from '../middleware/featureFlags.js';
import { workspaceSessionService } from '../services/workspaceSessionService.js';
import { webConversationService } from '../services/webConversationService.js';
import { logZoTransitionEvent } from '../utils/logger.js';

const router = Router();

// All workspace endpoints require auth, org context, and unifiedWorkspace feature
router.use(requireAuth, requireOrganization, attachOrgZoFeatures, requireZoFeature('unifiedWorkspace'));

/**
 * GET /api/workspace/session
 * Get or create the current workspace session for the authenticated user/org
 */
router.get('/session', async (req: Request, res: Response) => {
  try {
    const orgId = (req as any).org.organization.id as string;
    const userId = (req as any).org.user.id as string;

    const context = await workspaceSessionService.getOrCreateSession(orgId, userId);
    res.json({ success: true, session: context });
  } catch (error: unknown) {
    const err = error as Error;
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: err.message || 'Failed to get session' } });
  }
});

/**
 * PATCH /api/workspace/session
 * Update active context (campaign/workflow)
 */
router.patch('/session', async (req: Request, res: Response) => {
  try {
    const orgId = (req as any).org.organization.id as string;
    const userId = (req as any).org.user.id as string;

    // Ensure session exists first
    const session = await workspaceSessionService.getOrCreateSession(orgId, userId);

    const { campaignId, workflowId } = req.body || {};

    if (campaignId) {
      await workspaceSessionService.setActiveCampaign(session.sessionId, campaignId);
    }
    if (workflowId) {
      await workspaceSessionService.setActiveWorkflow(session.sessionId, workflowId);
    }

    const updated = await workspaceSessionService.buildArcContext(session.sessionId);
    res.json({ success: true, session: updated });
  } catch (error: unknown) {
    const err = error as Error;
    if (err.message === 'SESSION_NOT_FOUND_OR_FORBIDDEN') {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Session not found' } });
    }
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: err.message || 'Failed to update session' } });
  }
});

/**
 * GET /api/workspace/context
 * Return the full workspace context snapshot
 */
router.get('/context', async (req: Request, res: Response) => {
  try {
    const orgId = (req as any).org.organization.id as string;
    const userId = (req as any).org.user.id as string;

    const session = await workspaceSessionService.getOrCreateSession(orgId, userId);
    const context = await workspaceSessionService.buildArcContext(session.sessionId);

    res.json({ success: true, context });
  } catch (error: unknown) {
    const err = error as Error;
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: err.message || 'Failed to get context' } });
  }
});

/**
 * POST /api/workspace/session/end
 * End the current workspace session
 */
router.post('/session/end', async (req: Request, res: Response) => {
  try {
    const orgId = (req as any).org.organization.id as string;
    const userId = (req as any).org.user.id as string;

    const session = await workspaceSessionService.getOrCreateSession(orgId, userId);
    await workspaceSessionService.endSession(session.sessionId);

    logZoTransitionEvent({ feature: 'unifiedWorkspace', eventType: 'feature_disabled', organizationId: orgId, userId, metadata: { action: 'session_end_endpoint' } });

    res.json({ success: true });
  } catch (error: unknown) {
    const err = error as Error;
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: err.message || 'Failed to end session' } });
  }
});

// ============================================================================
// CONVERSATION ENDPOINTS (Phase 2: Persistent Conversations)
// ============================================================================

/**
 * GET /api/workspace/conversations
 * Get user's recent conversations
 */
router.get('/conversations', async (req: Request, res: Response) => {
  try {
    const orgId = (req as any).org.organization.id as string;
    const userId = (req as any).org.user.id as string;
    const limit = Math.min(parseInt(req.query.limit as string) || 10, 50);

    const conversations = await webConversationService.getUserConversations(orgId, userId, limit);

    res.json({
      success: true,
      conversations: conversations.map((c) => ({
        id: c.id,
        title: c.title,
        summary: c.summary,
        status: c.status,
        messageCount: c.messages.length,
        workflowCount: c.workflowIds.length,
        lastMessageAt: c.lastMessageAt,
        startedAt: c.startedAt,
      })),
    });
  } catch (error: unknown) {
    const err = error as Error;
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: err.message || 'Failed to get conversations' } });
  }
});

/**
 * GET /api/workspace/conversations/active
 * Get or create active conversation for current session
 */
router.get('/conversations/active', async (req: Request, res: Response) => {
  try {
    const orgId = (req as any).org.organization.id as string;
    const userId = (req as any).org.user.id as string;

    // Get current session
    const session = await workspaceSessionService.getOrCreateSession(orgId, userId);

    // Get or create conversation linked to session
    const conversation = await webConversationService.getOrCreateConversation(
      orgId,
      userId,
      session.sessionId
    );

    res.json({
      success: true,
      conversation: {
        id: conversation.id,
        sessionId: conversation.sessionId,
        messages: conversation.messages,
        contextSnapshot: conversation.contextSnapshot,
        status: conversation.status,
        workflowIds: conversation.workflowIds,
        startedAt: conversation.startedAt,
        lastMessageAt: conversation.lastMessageAt,
      },
    });
  } catch (error: unknown) {
    const err = error as Error;
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: err.message || 'Failed to get active conversation' } });
  }
});

/**
 * GET /api/workspace/conversations/:id
 * Get a specific conversation
 */
router.get('/conversations/:id', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).org.user.id as string;
    const { id } = req.params;

    const conversation = await webConversationService.getConversation(id);

    if (!conversation) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Conversation not found' } });
    }

    // Verify ownership
    if (conversation.userId !== userId) {
      return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Access denied' } });
    }

    res.json({
      success: true,
      conversation: {
        id: conversation.id,
        sessionId: conversation.sessionId,
        messages: conversation.messages,
        contextSnapshot: conversation.contextSnapshot,
        title: conversation.title,
        summary: conversation.summary,
        status: conversation.status,
        workflowIds: conversation.workflowIds,
        deliverableIds: conversation.deliverableIds,
        startedAt: conversation.startedAt,
        lastMessageAt: conversation.lastMessageAt,
        completedAt: conversation.completedAt,
      },
    });
  } catch (error: unknown) {
    const err = error as Error;
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: err.message || 'Failed to get conversation' } });
  }
});

/**
 * POST /api/workspace/conversations/:id/messages
 * Send a message in a conversation
 */
router.post('/conversations/:id/messages', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).org.user.id as string;
    const { id } = req.params;
    const { content } = req.body;

    if (!content || typeof content !== 'string' || content.trim().length === 0) {
      return res.status(400).json({ error: { code: 'INVALID_INPUT', message: 'Content is required' } });
    }

    const result = await webConversationService.sendMessage(id, content.trim(), userId);

    res.json({
      success: true,
      message: result.message,
      response: result.response,
      intent: result.intent,
      workflowStarted: result.workflowStarted,
    });
  } catch (error: unknown) {
    const err = error as Error;
    if (err.message === 'Conversation not found') {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Conversation not found' } });
    }
    if (err.message === 'Unauthorized') {
      return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Access denied' } });
    }
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: err.message || 'Failed to send message' } });
  }
});

/**
 * POST /api/workspace/conversations/:id/complete
 * Mark conversation as completed
 */
router.post('/conversations/:id/complete', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).org.user.id as string;
    const { id } = req.params;

    const conversation = await webConversationService.getConversation(id);
    if (!conversation) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Conversation not found' } });
    }
    if (conversation.userId !== userId) {
      return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Access denied' } });
    }

    await webConversationService.completeConversation(id);

    res.json({ success: true });
  } catch (error: unknown) {
    const err = error as Error;
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: err.message || 'Failed to complete conversation' } });
  }
});

/**
 * POST /api/workspace/conversations/:id/archive
 * Archive conversation
 */
router.post('/conversations/:id/archive', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).org.user.id as string;
    const { id } = req.params;

    const conversation = await webConversationService.getConversation(id);
    if (!conversation) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Conversation not found' } });
    }
    if (conversation.userId !== userId) {
      return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Access denied' } });
    }

    await webConversationService.archiveConversation(id);

    res.json({ success: true });
  } catch (error: unknown) {
    const err = error as Error;
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: err.message || 'Failed to archive conversation' } });
  }
});

export default router;
export { router as workspaceRoutes };
