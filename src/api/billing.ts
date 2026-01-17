/**
 * Billing Routes
 *
 * Handles subscription management, token purchases, and billing portal.
 */

import { Router, Request, Response, NextFunction } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requireOrganization, requirePermission } from '../middleware/multiTenancy.js';
import * as stripeService from '../services/stripeService.js';
import { isStripeConfigured } from '../services/stripeService.js';
import { query } from '../database/db.js';
import { logger } from '../utils/logger.js';
import { OrganizationPlan, PLAN_LIMITS } from '../models/Organization.js';

const router = Router();

// All billing routes require authentication and organization context
router.use(requireAuth);
router.use(requireOrganization);

// ENV-001: Check if Stripe is configured for billing operations
const requireStripe = (req: Request, res: Response, next: NextFunction) => {
  if (!isStripeConfigured()) {
    return res.status(503).json({
      error: {
        code: 'BILLING_UNAVAILABLE',
        message: 'Billing features are not configured. Contact support to enable billing.',
      }
    });
  }
  next();
};

// ============================================================================
// SUBSCRIPTION MANAGEMENT
// ============================================================================

/**
 * GET /billing/subscription
 * Get current subscription details
 */
router.get('/subscription', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const org = (req as any).organization;

    const subscription = await stripeService.getSubscription(org.id);

    // Get organization billing info from database
    const orgResult = await query<{
      plan: string;
      status: string;
      trial_ends_at: Date | null;
      token_balance: number;
      limits: Record<string, unknown>;
    }>(
      `SELECT plan, status, trial_ends_at, token_balance, limits
       FROM organizations WHERE id = $1`,
      [org.id]
    );

    const orgData = orgResult.rows[0];

    res.json({
      data: {
        plan: orgData?.plan || 'starter',
        status: orgData?.status || 'trial',
        trialEndsAt: orgData?.trial_ends_at,
        tokenBalance: orgData?.token_balance || 0,
        limits: orgData?.limits || PLAN_LIMITS.starter,
        stripe: subscription ? {
          id: subscription.id,
          status: subscription.status,
          currentPeriodEnd: subscription.items?.data?.[0]?.current_period_end
            ? new Date(subscription.items.data[0].current_period_end * 1000)
            : null,
          cancelAtPeriodEnd: subscription.cancel_at_period_end,
        } : null,
      }
    });
  } catch (error: unknown) {
    const err = error as Error;
    next(error);
  }
});

/**
 * POST /billing/subscribe
 * Start or change subscription
 */
router.post('/subscribe',
  requireStripe,
  requirePermission('org.billing'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const org = (req as any).organization;
      const { plan, billingPeriod = 'monthly' } = req.body;

      if (!plan || !['starter', 'professional', 'business', 'enterprise'].includes(plan)) {
        return res.status(400).json({
          error: { code: 'INVALID_PLAN', message: 'Invalid plan specified' }
        });
      }

      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';

      const { url, sessionId } = await stripeService.createSubscriptionCheckout(
        org.id,
        plan as OrganizationPlan,
        billingPeriod,
        `${frontendUrl}/settings/billing?success=true&session_id={CHECKOUT_SESSION_ID}`,
        `${frontendUrl}/settings/billing?cancelled=true`
      );

      res.json({
        data: {
          checkoutUrl: url,
          sessionId,
        }
      });
    } catch (error: unknown) {
    const err = error as Error;
      next(error);
    }
  }
);

/**
 * POST /billing/portal
 * Get Stripe billing portal URL
 */
router.post('/portal',
  requireStripe,
  requirePermission('org.billing'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const org = (req as any).organization;
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';

      const { url } = await stripeService.createBillingPortalSession(
        org.id,
        `${frontendUrl}/settings/billing`
      );

      res.json({
        data: { portalUrl: url }
      });
    } catch (error: unknown) {
    const err = error as Error;
      next(error);
    }
  }
);

/**
 * POST /billing/cancel
 * Cancel subscription at period end
 */
router.post('/cancel',
  requireStripe,
  requirePermission('org.billing'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const org = (req as any).organization;

      const subscription = await stripeService.cancelSubscription(org.id, true);

      res.json({
        data: {
          message: 'Subscription will be cancelled at period end',
          cancelAt: new Date(subscription.cancel_at! * 1000),
        }
      });
    } catch (error: unknown) {
    const err = error as Error;
      next(error);
    }
  }
);

/**
 * POST /billing/reactivate
 * Reactivate a cancelled subscription
 */
router.post('/reactivate',
  requireStripe,
  requirePermission('org.billing'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const org = (req as any).organization;

      const subscription = await stripeService.reactivateSubscription(org.id);

      res.json({
        data: {
          message: 'Subscription reactivated',
          status: subscription.status,
        }
      });
    } catch (error: unknown) {
    const err = error as Error;
      next(error);
    }
  }
);

/**
 * POST /billing/change-plan
 * Change to a different plan
 */
router.post('/change-plan',
  requireStripe,
  requirePermission('org.billing'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const org = (req as any).organization;
      const { plan, billingPeriod = 'monthly' } = req.body;

      if (!plan || !['starter', 'professional', 'business', 'enterprise'].includes(plan)) {
        return res.status(400).json({
          error: { code: 'INVALID_PLAN', message: 'Invalid plan specified' }
        });
      }

      const subscription = await stripeService.changePlan(
        org.id,
        plan as OrganizationPlan,
        billingPeriod
      );

      // Update organization plan in database
      await query(`
        UPDATE organizations
        SET plan = $1, limits = $2::jsonb, updated_at = NOW()
        WHERE id = $3
      `, [plan, JSON.stringify(PLAN_LIMITS[plan as OrganizationPlan]), org.id]);

      res.json({
        data: {
          message: 'Plan changed successfully',
          plan,
          effectiveFrom: new Date(),
        }
      });
    } catch (error: unknown) {
    const err = error as Error;
      next(error);
    }
  }
);

// ============================================================================
// TOKEN MANAGEMENT
// ============================================================================

/**
 * GET /billing/tokens
 * Get token balance and history
 */
router.get('/tokens', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const org = (req as any).organization;

    // Get current balance
    const balanceResult = await query<{ token_balance: number }>(
      'SELECT COALESCE(token_balance, 0) as token_balance FROM organizations WHERE id = $1',
      [org.id]
    );

    // Get recent transactions
    const transactionsResult = await query<{
      id: string;
      amount: number;
      type: string;
      description: string;
      created_at: Date;
    }>(
      `SELECT id, amount, type, description, created_at
       FROM token_transactions
       WHERE organization_id = $1
       ORDER BY created_at DESC
       LIMIT 50`,
      [org.id]
    );

    res.json({
      data: {
        balance: balanceResult.rows[0]?.token_balance || 0,
        transactions: transactionsResult.rows,
      }
    });
  } catch (error: unknown) {
    const err = error as Error;
    next(error);
  }
});

/**
 * POST /billing/tokens/purchase
 * Purchase token pack
 */
router.post('/tokens/purchase',
  requireStripe,
  requirePermission('org.billing'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const org = (req as any).organization;
      const { packSize, quantity = 1 } = req.body;

      if (!packSize || !['small', 'medium', 'large', 'enterprise'].includes(packSize)) {
        return res.status(400).json({
          error: { code: 'INVALID_PACK', message: 'Invalid token pack specified' }
        });
      }

      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';

      const { url, sessionId } = await stripeService.createTokenPurchaseCheckout(
        org.id,
        packSize as 'small' | 'medium' | 'large' | 'enterprise',
        quantity,
        `${frontendUrl}/settings/billing?tokens_success=true&session_id={CHECKOUT_SESSION_ID}`,
        `${frontendUrl}/settings/billing?cancelled=true`
      );

      res.json({
        data: {
          checkoutUrl: url,
          sessionId,
        }
      });
    } catch (error: unknown) {
    const err = error as Error;
      next(error);
    }
  }
);

/**
 * GET /billing/tokens/packs
 * Get available token packs with pricing
 */
router.get('/tokens/packs', async (req: Request, res: Response) => {
  res.json({
    data: {
      packs: [
        {
          id: 'small',
          name: 'Starter Pack',
          tokens: 1000,
          price: 10,
          currency: 'usd',
          perTokenCost: 0.01,
        },
        {
          id: 'medium',
          name: 'Growth Pack',
          tokens: 5000,
          price: 45,
          currency: 'usd',
          perTokenCost: 0.009,
          savings: '10%',
        },
        {
          id: 'large',
          name: 'Scale Pack',
          tokens: 20000,
          price: 160,
          currency: 'usd',
          perTokenCost: 0.008,
          savings: '20%',
        },
        {
          id: 'enterprise',
          name: 'Enterprise Pack',
          tokens: 100000,
          price: 750,
          currency: 'usd',
          perTokenCost: 0.0075,
          savings: '25%',
        },
      ]
    }
  });
});

// ============================================================================
// INVOICES & PAYMENT METHODS
// ============================================================================

/**
 * GET /billing/invoices
 * Get invoice history
 */
router.get('/invoices', requireStripe, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const org = (req as any).organization;
    const limit = Math.min(parseInt(req.query.limit as string) || 10, 100);

    const invoices = await stripeService.getInvoices(org.id, limit);

    res.json({
      data: {
        invoices: invoices.map(inv => ({
          id: inv.id,
          number: inv.number,
          status: inv.status,
          amount: inv.amount_paid,
          currency: inv.currency,
          created: new Date(inv.created * 1000),
          pdfUrl: inv.invoice_pdf,
          hostedUrl: inv.hosted_invoice_url,
        })),
      }
    });
  } catch (error: unknown) {
    const err = error as Error;
    next(error);
  }
});

/**
 * GET /billing/upcoming
 * Get upcoming invoice preview
 */
router.get('/upcoming', requireStripe, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const org = (req as any).organization;

    const invoice = await stripeService.getUpcomingInvoice(org.id);

    if (!invoice) {
      return res.json({ data: { upcoming: null } });
    }

    res.json({
      data: {
        upcoming: {
          amount: invoice.amount_due,
          currency: invoice.currency,
          dueDate: invoice.due_date ? new Date(invoice.due_date * 1000) : null,
          periodEnd: invoice.period_end ? new Date(invoice.period_end * 1000) : null,
          lines: invoice.lines.data.map(line => ({
            description: line.description,
            amount: line.amount,
          })),
        }
      }
    });
  } catch (error: unknown) {
    const err = error as Error;
    next(error);
  }
});

/**
 * GET /billing/payment-methods
 * Get saved payment methods
 */
router.get('/payment-methods', requireStripe, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const org = (req as any).organization;

    const paymentMethods = await stripeService.getPaymentMethods(org.id);

    res.json({
      data: {
        paymentMethods: paymentMethods.map(pm => ({
          id: pm.id,
          type: pm.type,
          card: pm.card ? {
            brand: pm.card.brand,
            last4: pm.card.last4,
            expMonth: pm.card.exp_month,
            expYear: pm.card.exp_year,
          } : null,
          isDefault: pm.metadata?.default === 'true',
        })),
      }
    });
  } catch (error: unknown) {
    const err = error as Error;
    next(error);
  }
});

// ============================================================================
// USAGE TRACKING
// ============================================================================

/**
 * GET /billing/usage
 * Get current period usage
 */
router.get('/usage', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const org = (req as any).organization;

    // Get usage metrics from database
    const usageResult = await query<{
      api_calls: number;
      tokens_used: number;
      storage_bytes: number;
      campaigns_count: number;
      members_count: number;
    }>(`
      SELECT
        (SELECT COUNT(*) FROM api_logs WHERE organization_id = $1
         AND created_at >= date_trunc('month', CURRENT_DATE)) as api_calls,
        (SELECT COALESCE(SUM(amount), 0) FROM token_transactions
         WHERE organization_id = $1 AND type = 'usage'
         AND created_at >= date_trunc('month', CURRENT_DATE)) as tokens_used,
        (SELECT COALESCE(SUM(file_size_bytes), 0) FROM assets
         WHERE organization_id = $1) as storage_bytes,
        (SELECT COUNT(*) FROM campaigns WHERE organization_id = $1) as campaigns_count,
        (SELECT COUNT(*) FROM organization_members
         WHERE organization_id = $1 AND status = 'active') as members_count
    `, [org.id]);

    const usage = usageResult.rows[0];
    const limits = org.limits || PLAN_LIMITS.starter;

    res.json({
      data: {
        currentPeriod: {
          start: new Date(new Date().setDate(1)),
          end: new Date(new Date(new Date().setMonth(new Date().getMonth() + 1)).setDate(0)),
        },
        usage: {
          apiCalls: {
            used: usage?.api_calls || 0,
            limit: limits.max_monthly_api_spend_cents, // This is actually spend limit, not call limit
          },
          tokensUsed: {
            used: usage?.tokens_used || 0,
            available: org.token_balance || 0,
          },
          storage: {
            usedBytes: usage?.storage_bytes || 0,
            limitBytes: (limits.max_storage_gb || 5) * 1024 * 1024 * 1024,
          },
          campaigns: {
            used: usage?.campaigns_count || 0,
            limit: limits.max_campaigns,
          },
          members: {
            used: usage?.members_count || 0,
            limit: limits.max_members,
          },
        }
      }
    });
  } catch (error: unknown) {
    const err = error as Error;
    next(error);
  }
});

// ============================================================================
// PLAN COMPARISON
// ============================================================================

/**
 * GET /billing/plans
 * Get all available plans with features
 */
router.get('/plans', async (req: Request, res: Response) => {
  res.json({
    data: {
      plans: [
        {
          id: 'starter',
          name: 'Starter',
          description: 'For individuals getting started',
          monthlyPrice: 29,
          yearlyPrice: 290,
          limits: PLAN_LIMITS.starter,
          features: [
            'Up to 2 team members',
            'Up to 10 campaigns',
            '5GB storage',
            'Email campaigns',
            'Basic Arc assistant',
          ],
        },
        {
          id: 'professional',
          name: 'Professional',
          description: 'For growing teams',
          monthlyPrice: 99,
          yearlyPrice: 990,
          limits: PLAN_LIMITS.professional,
          features: [
            'Up to 10 team members',
            'Up to 50 campaigns',
            '25GB storage',
            'Email & SMS campaigns',
            'Voice Arc assistant',
            'Analytics dashboard',
          ],
          popular: true,
        },
        {
          id: 'business',
          name: 'Business',
          description: 'For established businesses',
          monthlyPrice: 299,
          yearlyPrice: 2990,
          limits: PLAN_LIMITS.business,
          features: [
            'Up to 25 team members',
            'Up to 200 campaigns',
            '100GB storage',
            'All campaign types',
            'Custom integrations',
            'Priority support',
          ],
        },
        {
          id: 'enterprise',
          name: 'Enterprise',
          description: 'For large organizations',
          monthlyPrice: null, // Contact sales
          yearlyPrice: null,
          limits: PLAN_LIMITS.enterprise,
          features: [
            'Unlimited team members',
            'Unlimited campaigns',
            'Unlimited storage',
            'All features',
            'SSO & custom security',
            'Dedicated support',
            'Custom contracts',
          ],
        },
      ]
    }
  });
});

// ============================================================================
// METERED USAGE TRACKING
// ============================================================================

/**
 * POST /billing/usage/track
 * Track usage for metered billing (internal use)
 */
router.post('/usage/track',
  requirePermission('org.manage'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const org = (req as any).organization;
      const { metric_type, quantity, metadata } = req.body;

      if (!metric_type || !quantity) {
        return res.status(400).json({
          error: { code: 'INVALID_INPUT', message: 'metric_type and quantity are required' }
        });
      }

      await stripeService.trackUsage(org.id, metric_type, quantity, metadata);

      res.json({
        data: {
          message: 'Usage tracked',
          metric_type,
          quantity
        }
      });
    } catch (error: unknown) {
    const err = error as Error;
      next(error);
    }
  }
);

/**
 * GET /billing/usage/summary
 * Get usage summary for current billing period
 */
router.get('/usage/summary', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const org = (req as any).organization;

    const summary = await stripeService.getUsageSummary(org.id);

    res.json({
      data: {
        period: {
          start: new Date(new Date().setDate(1)),
          end: new Date(new Date(new Date().setMonth(new Date().getMonth() + 1)).setDate(0)),
        },
        usage: summary
      }
    });
  } catch (error: unknown) {
    const err = error as Error;
    next(error);
  }
});

// ============================================================================
// CREDITS MANAGEMENT
// ============================================================================

/**
 * POST /billing/credits/add
 * Add credits to organization (admin only)
 */
router.post('/credits/add',
  requirePermission('org.manage'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const org = (req as any).organization;
      const { amount, reason } = req.body;

      if (!amount || amount <= 0) {
        return res.status(400).json({
          error: { code: 'INVALID_AMOUNT', message: 'Amount must be positive' }
        });
      }

      await stripeService.addCredits(org.id, amount, reason || 'Manual credit');

      res.json({
        data: {
          message: 'Credits added',
          amount
        }
      });
    } catch (error: unknown) {
    const err = error as Error;
      next(error);
    }
  }
);

/**
 * POST /billing/credits/deduct
 * Deduct credits from organization (internal use)
 */
router.post('/credits/deduct',
  requirePermission('org.manage'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const org = (req as any).organization;
      const { amount, reason } = req.body;

      if (!amount || amount <= 0) {
        return res.status(400).json({
          error: { code: 'INVALID_AMOUNT', message: 'Amount must be positive' }
        });
      }

      const success = await stripeService.deductCredits(org.id, amount, reason || 'Deduction');

      if (!success) {
        return res.status(400).json({
          error: { code: 'INSUFFICIENT_BALANCE', message: 'Insufficient credit balance' }
        });
      }

      res.json({
        data: {
          message: 'Credits deducted',
          amount
        }
      });
    } catch (error: unknown) {
    const err = error as Error;
      next(error);
    }
  }
);

/**
 * PUT /billing/credits/auto-refill
 * Configure auto-refill settings
 */
router.put('/credits/auto-refill',
  requirePermission('org.billing'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const org = (req as any).organization;
      const { enabled, threshold, amount } = req.body;

      await query(`
        UPDATE organizations
        SET
          auto_refill_enabled = $1,
          auto_refill_threshold = $2,
          auto_refill_amount = $3,
          updated_at = NOW()
        WHERE id = $4
      `, [enabled || false, threshold || 100, amount || 1000, org.id]);

      res.json({
        data: {
          message: 'Auto-refill settings updated',
          enabled,
          threshold,
          amount
        }
      });
    } catch (error: unknown) {
    const err = error as Error;
      next(error);
    }
  }
);

// ============================================================================
// PAYMENT METHOD MANAGEMENT
// ============================================================================

/**
 * POST /billing/payment-methods/set-default
 * Set default payment method
 */
router.post('/payment-methods/set-default',
  requireStripe,
  requirePermission('org.billing'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const org = (req as any).organization;
      const { payment_method_id } = req.body;

      if (!payment_method_id) {
        return res.status(400).json({
          error: { code: 'INVALID_INPUT', message: 'payment_method_id is required' }
        });
      }

      await stripeService.setDefaultPaymentMethod(org.id, payment_method_id);

      res.json({
        data: { message: 'Default payment method updated' }
      });
    } catch (error: unknown) {
    const err = error as Error;
      next(error);
    }
  }
);

/**
 * DELETE /billing/payment-methods/:id
 * Remove a payment method
 */
router.delete('/payment-methods/:id',
  requireStripe,
  requirePermission('org.billing'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const paymentMethodId = req.params.id;

      await stripeService.detachPaymentMethod(paymentMethodId);

      res.json({
        data: { message: 'Payment method removed' }
      });
    } catch (error: unknown) {
    const err = error as Error;
      next(error);
    }
  }
);

// ============================================================================
// TRIAL MANAGEMENT
// ============================================================================

/**
 * POST /billing/trial/start
 * Start a trial subscription
 */
router.post('/trial/start',
  requireStripe,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const org = (req as any).organization;
      const { plan, trial_days = 14 } = req.body;

      if (!plan || !['starter', 'professional', 'business', 'enterprise'].includes(plan)) {
        return res.status(400).json({
          error: { code: 'INVALID_PLAN', message: 'Invalid plan specified' }
        });
      }

      const subscription = await stripeService.startTrial(
        org.id,
        plan as OrganizationPlan,
        trial_days
      );

      res.json({
        data: {
          message: 'Trial started',
          subscription: {
            id: subscription.id,
            status: subscription.status,
            trial_end: subscription.trial_end
              ? new Date(subscription.trial_end * 1000)
              : null,
          }
        }
      });
    } catch (error: unknown) {
    const err = error as Error;
      next(error);
    }
  }
);

export default router;
