/**
 * Food Content API Routes
 *
 * Provides endpoints for:
 * - Recipe generation and management
 * - Nutritional content calculation
 * - Dietary restriction filtering
 * - Food photography prompts
 * - Meal planning
 * - Seasonal suggestions
 * - Cooking tutorials
 * - Ingredient substitutions
 *
 * Phase 5.2 - Food Content Engine (DTC Food Critical)
 */

import { Router, Request, Response, NextFunction } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { foodContentService } from '../services/foodContentService.js';
import { logger } from '../utils/logger.js';

const router = Router();

// ============================================================================
// MIDDLEWARE
// ============================================================================

/**
 * Middleware to ensure organization context is loaded
 */
function requireOrganization(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const orgId = (req as any).organizationId || (req.user as any)?.organizationId;
  if (!orgId) {
    res.status(403).json({
      success: false,
      error: {
        code: 'NO_ORGANIZATION',
        message: 'Organization context required',
      },
    });
    return;
  }
  next();
}

/**
 * Helper to get organization ID from request
 */
function getOrganizationId(req: Request): string {
  const orgId = (req as any).organizationId || (req.user as any)?.organizationId;
  if (!orgId) {
    throw new Error('Organization ID not found');
  }
  return orgId;
}

// ============================================================================
// RECIPE ENDPOINTS
// ============================================================================

/**
 * GET /api/v1/food/recipes
 * Search and filter recipes
 */
router.get(
  '/recipes',
  requireAuth,
  requireOrganization,
  async (req: Request, res: Response) => {
    try {
      const organizationId = getOrganizationId(req);
      const {
        query,
        dietaryRestrictions,
        mealType,
        difficulty,
        maxTime,
        cuisineType,
        status,
        limit,
        offset,
      } = req.query;

      const recipes = await foodContentService.searchRecipes({
        organizationId,
        query: query as string,
        dietaryRestrictions: dietaryRestrictions
          ? (dietaryRestrictions as string).split(',')
          : undefined,
        mealType: mealType ? (mealType as string).split(',') as any : undefined,
        difficulty: difficulty as any,
        maxTime: maxTime ? parseInt(maxTime as string) : undefined,
        cuisineType: cuisineType as string,
        status: status as any,
        limit: limit ? parseInt(limit as string) : 20,
        offset: offset ? parseInt(offset as string) : 0,
      });

      res.json({
        success: true,
        data: recipes,
        count: recipes.length,
      });
    } catch (error) {
      logger.error('[FoodContentAPI] Recipe search error:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'RECIPE_SEARCH_ERROR',
          message: (error as Error).message,
        },
      });
    }
  }
);

/**
 * GET /api/v1/food/recipes/:id
 * Get recipe by ID
 */
router.get(
  '/recipes/:id',
  requireAuth,
  requireOrganization,
  async (req: Request, res: Response) => {
    try {
      const organizationId = getOrganizationId(req);
      const { id } = req.params;

      const recipe = await foodContentService.getRecipeById(id, organizationId);

      if (!recipe) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'RECIPE_NOT_FOUND',
            message: 'Recipe not found',
          },
        });
      }

      res.json({
        success: true,
        data: recipe,
      });
    } catch (error) {
      logger.error('[FoodContentAPI] Get recipe error:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'GET_RECIPE_ERROR',
          message: (error as Error).message,
        },
      });
    }
  }
);

/**
 * POST /api/v1/food/recipes/generate
 * Generate a new recipe using AI
 */
router.post(
  '/recipes/generate',
  requireAuth,
  requireOrganization,
  async (req: Request, res: Response) => {
    try {
      const organizationId = getOrganizationId(req);
      const {
        prompt,
        cuisineType,
        mealType,
        difficulty,
        dietaryRestrictions,
        maxPrepTime,
        servings,
        includeNutrition,
      } = req.body;

      if (!prompt) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'MISSING_PROMPT',
            message: 'Recipe generation prompt is required',
          },
        });
      }

      const recipe = await foodContentService.generateRecipe({
        organizationId,
        prompt,
        cuisineType,
        mealType,
        difficulty,
        dietaryRestrictions,
        maxPrepTime,
        servings,
        includeNutrition: includeNutrition !== false, // Default to true
      });

      res.json({
        success: true,
        data: recipe,
      });
    } catch (error) {
      logger.error('[FoodContentAPI] Recipe generation error:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'RECIPE_GENERATION_ERROR',
          message: (error as Error).message,
        },
      });
    }
  }
);

/**
 * POST /api/v1/food/recipes/adapt
 * Adapt a recipe for dietary restrictions
 */
router.post(
  '/recipes/adapt',
  requireAuth,
  requireOrganization,
  async (req: Request, res: Response) => {
    try {
      const organizationId = getOrganizationId(req);
      const { recipeId, dietaryRestrictions, substituteIngredients, adjustServings } =
        req.body;

      if (!recipeId) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'MISSING_RECIPE_ID',
            message: 'Recipe ID is required',
          },
        });
      }

      if (!dietaryRestrictions || dietaryRestrictions.length === 0) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'MISSING_DIETARY_RESTRICTIONS',
            message: 'At least one dietary restriction is required',
          },
        });
      }

      const adaptedRecipe = await foodContentService.adaptRecipe({
        organizationId,
        recipeId,
        dietaryRestrictions,
        substituteIngredients,
        adjustServings,
      });

      res.json({
        success: true,
        data: adaptedRecipe,
      });
    } catch (error) {
      logger.error('[FoodContentAPI] Recipe adaptation error:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'RECIPE_ADAPTATION_ERROR',
          message: (error as Error).message,
        },
      });
    }
  }
);

// ============================================================================
// NUTRITION ENDPOINTS
// ============================================================================

/**
 * GET /api/v1/food/nutrition/:recipeId
 * Get nutritional information for a recipe
 */
router.get(
  '/nutrition/:recipeId',
  requireAuth,
  requireOrganization,
  async (req: Request, res: Response) => {
    try {
      const organizationId = getOrganizationId(req);
      const { recipeId } = req.params;

      const nutrition = await foodContentService.getNutritionData(
        recipeId,
        organizationId
      );

      if (!nutrition) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'NUTRITION_NOT_FOUND',
            message: 'Nutrition data not found for this recipe',
          },
        });
      }

      res.json({
        success: true,
        data: nutrition,
      });
    } catch (error) {
      logger.error('[FoodContentAPI] Get nutrition error:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'GET_NUTRITION_ERROR',
          message: (error as Error).message,
        },
      });
    }
  }
);

// ============================================================================
// MEAL PLAN ENDPOINTS
// ============================================================================

/**
 * POST /api/v1/food/meal-plans
 * Generate a meal plan
 */
router.post(
  '/meal-plans',
  requireAuth,
  requireOrganization,
  async (req: Request, res: Response) => {
    try {
      const organizationId = getOrganizationId(req);
      const {
        durationDays,
        dietaryRestrictions,
        targetCalories,
        mealTypes,
        cuisinePreferences,
      } = req.body;

      if (!durationDays) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'MISSING_DURATION',
            message: 'Meal plan duration is required',
          },
        });
      }

      const mealPlan = await foodContentService.generateMealPlan({
        organizationId,
        durationDays,
        dietaryRestrictions,
        targetCalories,
        mealTypes,
        cuisinePreferences,
      });

      res.json({
        success: true,
        data: mealPlan,
      });
    } catch (error) {
      logger.error('[FoodContentAPI] Meal plan generation error:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'MEAL_PLAN_GENERATION_ERROR',
          message: (error as Error).message,
        },
      });
    }
  }
);

/**
 * GET /api/v1/food/meal-plans/:id
 * Get meal plan by ID
 */
router.get(
  '/meal-plans/:id',
  requireAuth,
  requireOrganization,
  async (req: Request, res: Response) => {
    try {
      const organizationId = getOrganizationId(req);
      const { id } = req.params;

      const mealPlan = await foodContentService.getMealPlanById(id, organizationId);

      if (!mealPlan) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'MEAL_PLAN_NOT_FOUND',
            message: 'Meal plan not found',
          },
        });
      }

      res.json({
        success: true,
        data: mealPlan,
      });
    } catch (error) {
      logger.error('[FoodContentAPI] Get meal plan error:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'GET_MEAL_PLAN_ERROR',
          message: (error as Error).message,
        },
      });
    }
  }
);

// ============================================================================
// SEASONAL SUGGESTIONS ENDPOINT
// ============================================================================

/**
 * GET /api/v1/food/seasonal-suggestions
 * Get seasonal recipe and ingredient suggestions
 */
router.get(
  '/seasonal-suggestions',
  requireAuth,
  requireOrganization,
  async (req: Request, res: Response) => {
    try {
      const organizationId = getOrganizationId(req);
      const { month } = req.query;

      const suggestions = await foodContentService.getSeasonalSuggestions(
        organizationId,
        month ? parseInt(month as string) : undefined
      );

      res.json({
        success: true,
        data: suggestions,
      });
    } catch (error) {
      logger.error('[FoodContentAPI] Seasonal suggestions error:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'SEASONAL_SUGGESTIONS_ERROR',
          message: (error as Error).message,
        },
      });
    }
  }
);

// ============================================================================
// FOOD PHOTOGRAPHY ENDPOINT
// ============================================================================

/**
 * POST /api/v1/food/photography-prompt
 * Generate food photography prompt for a recipe
 */
router.post(
  '/photography-prompt',
  requireAuth,
  requireOrganization,
  async (req: Request, res: Response) => {
    try {
      const organizationId = getOrganizationId(req);
      const { recipeId } = req.body;

      if (!recipeId) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'MISSING_RECIPE_ID',
            message: 'Recipe ID is required',
          },
        });
      }

      const prompt = await foodContentService.generateFoodPhotographyPrompt(
        recipeId,
        organizationId
      );

      res.json({
        success: true,
        data: {
          recipeId,
          prompt,
        },
      });
    } catch (error) {
      logger.error('[FoodContentAPI] Photography prompt generation error:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'PHOTOGRAPHY_PROMPT_ERROR',
          message: (error as Error).message,
        },
      });
    }
  }
);

// ============================================================================
// COOKING TUTORIAL ENDPOINT
// ============================================================================

/**
 * POST /api/v1/food/cooking-tutorial
 * Generate cooking tutorial content for a recipe
 */
router.post(
  '/cooking-tutorial',
  requireAuth,
  requireOrganization,
  async (req: Request, res: Response) => {
    try {
      const organizationId = getOrganizationId(req);
      const { recipeId, format } = req.body;

      if (!recipeId) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'MISSING_RECIPE_ID',
            message: 'Recipe ID is required',
          },
        });
      }

      const validFormats = ['video_script', 'step_by_step', 'blog_post'];
      const tutorialFormat = format || 'step_by_step';

      if (!validFormats.includes(tutorialFormat)) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_FORMAT',
            message: `Format must be one of: ${validFormats.join(', ')}`,
          },
        });
      }

      const tutorial = await foodContentService.generateCookingTutorial(
        recipeId,
        organizationId,
        tutorialFormat
      );

      res.json({
        success: true,
        data: tutorial,
      });
    } catch (error) {
      logger.error('[FoodContentAPI] Cooking tutorial generation error:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'COOKING_TUTORIAL_ERROR',
          message: (error as Error).message,
        },
      });
    }
  }
);

// ============================================================================
// INGREDIENT SUBSTITUTION ENDPOINT
// ============================================================================

/**
 * POST /api/v1/food/substitutions
 * Get ingredient substitution recommendations
 */
router.post(
  '/substitutions',
  requireAuth,
  requireOrganization,
  async (req: Request, res: Response) => {
    try {
      const { ingredient, recipeType, dietaryRestrictions } = req.body;

      if (!ingredient) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'MISSING_INGREDIENT',
            message: 'Ingredient is required',
          },
        });
      }

      const substitutions = await foodContentService.getIngredientSubstitutions(
        ingredient,
        {
          recipeType,
          dietaryRestrictions,
        }
      );

      res.json({
        success: true,
        data: substitutions,
      });
    } catch (error) {
      logger.error('[FoodContentAPI] Substitution generation error:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'SUBSTITUTION_ERROR',
          message: (error as Error).message,
        },
      });
    }
  }
);

// ============================================================================
// EXPORT
// ============================================================================

export { router as foodContentRoutes };
