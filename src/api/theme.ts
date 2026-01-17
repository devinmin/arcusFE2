/**
 * Theme Preferences Routes
 *
 * API endpoints for theme customization: color schemes, dark mode, accent colors.
 */

import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { getUserId } from '../middleware/multiTenancy.js';
import { themePreferencesService, ACCENT_COLORS, ThemeMode, AccentColor, UIDensity } from '../services/themePreferencesService.js';
import { logger } from '../utils/logger.js';

const router = Router();

const VALID_THEME_MODES: ThemeMode[] = ['light', 'dark', 'system'];
const VALID_ACCENT_COLORS: AccentColor[] = ['blue', 'purple', 'green', 'orange', 'pink', 'red', 'cyan', 'custom'];
const VALID_UI_DENSITIES: UIDensity[] = ['compact', 'comfortable', 'spacious'];

/**
 * GET /api/theme
 * Get theme preferences for the current user
 */
router.get(
  '/',
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req)!;
      const preferences = await themePreferencesService.getPreferences(userId);

      // Include computed color palette
      const palette = themePreferencesService.getAccentColorPalette(
        preferences.accentColor,
        preferences.customPrimaryColor
      );

      res.json({
        preferences,
        palette,
      });
    } catch (error: unknown) {
    const err = error as Error;
      logger.error('[ThemeRoutes] Failed to get theme preferences', { error });
      res.status(500).json({
        error: { code: 'INTERNAL_ERROR', message: 'Failed to get theme preferences' },
      });
    }
  }
);

/**
 * PUT /api/theme
 * Save all theme preferences
 */
router.put(
  '/',
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req)!;
      const {
        themeMode,
        accentColor,
        customPrimaryColor,
        uiDensity,
        sidebarCollapsed,
        animationsEnabled,
        reducedMotion,
      } = req.body;

      // Validate inputs
      if (themeMode && !VALID_THEME_MODES.includes(themeMode)) {
        return res.status(400).json({
          error: { code: 'INVALID_THEME_MODE', message: 'Invalid theme mode' },
        });
      }

      if (accentColor && !VALID_ACCENT_COLORS.includes(accentColor)) {
        return res.status(400).json({
          error: { code: 'INVALID_ACCENT_COLOR', message: 'Invalid accent color' },
        });
      }

      if (uiDensity && !VALID_UI_DENSITIES.includes(uiDensity)) {
        return res.status(400).json({
          error: { code: 'INVALID_UI_DENSITY', message: 'Invalid UI density' },
        });
      }

      if (customPrimaryColor && !/^#[0-9A-Fa-f]{6}$/.test(customPrimaryColor)) {
        return res.status(400).json({
          error: { code: 'INVALID_COLOR', message: 'Custom color must be a valid hex color (e.g., #3B82F6)' },
        });
      }

      const preferences = await themePreferencesService.savePreferences(userId, {
        themeMode,
        accentColor,
        customPrimaryColor,
        uiDensity,
        sidebarCollapsed,
        animationsEnabled,
        reducedMotion,
      });

      const palette = themePreferencesService.getAccentColorPalette(
        preferences.accentColor,
        preferences.customPrimaryColor
      );

      res.json({ preferences, palette });
    } catch (error: unknown) {
    const err = error as Error;
      logger.error('[ThemeRoutes] Failed to save theme preferences', { error });
      res.status(500).json({
        error: { code: 'INTERNAL_ERROR', message: err.message || 'Failed to save theme preferences' },
      });
    }
  }
);

/**
 * PATCH /api/theme
 * Update specific theme preference fields
 */
router.patch(
  '/',
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req)!;
      const updates = req.body;

      // Validate inputs if provided
      if (updates.themeMode && !VALID_THEME_MODES.includes(updates.themeMode)) {
        return res.status(400).json({
          error: { code: 'INVALID_THEME_MODE', message: 'Invalid theme mode' },
        });
      }

      if (updates.accentColor && !VALID_ACCENT_COLORS.includes(updates.accentColor)) {
        return res.status(400).json({
          error: { code: 'INVALID_ACCENT_COLOR', message: 'Invalid accent color' },
        });
      }

      if (updates.uiDensity && !VALID_UI_DENSITIES.includes(updates.uiDensity)) {
        return res.status(400).json({
          error: { code: 'INVALID_UI_DENSITY', message: 'Invalid UI density' },
        });
      }

      if (updates.customPrimaryColor && !/^#[0-9A-Fa-f]{6}$/.test(updates.customPrimaryColor)) {
        return res.status(400).json({
          error: { code: 'INVALID_COLOR', message: 'Custom color must be a valid hex color' },
        });
      }

      const preferences = await themePreferencesService.updatePreferences(userId, updates);

      const palette = themePreferencesService.getAccentColorPalette(
        preferences.accentColor,
        preferences.customPrimaryColor
      );

      res.json({ preferences, palette });
    } catch (error: unknown) {
    const err = error as Error;
      logger.error('[ThemeRoutes] Failed to update theme preferences', { error });
      res.status(500).json({
        error: { code: 'INTERNAL_ERROR', message: 'Failed to update theme preferences' },
      });
    }
  }
);

/**
 * DELETE /api/theme
 * Reset theme to defaults
 */
router.delete(
  '/',
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req)!;
      const preferences = await themePreferencesService.resetToDefaults(userId);

      const palette = themePreferencesService.getAccentColorPalette(
        preferences.accentColor,
        preferences.customPrimaryColor
      );

      res.json({ preferences, palette, message: 'Theme reset to defaults' });
    } catch (error: unknown) {
    const err = error as Error;
      logger.error('[ThemeRoutes] Failed to reset theme', { error });
      res.status(500).json({
        error: { code: 'INTERNAL_ERROR', message: 'Failed to reset theme' },
      });
    }
  }
);

/**
 * GET /api/theme/colors
 * Get available accent colors palette (no auth required)
 */
router.get(
  '/colors',
  async (_req: Request, res: Response) => {
    res.json({
      colors: ACCENT_COLORS,
      modes: VALID_THEME_MODES,
      densities: VALID_UI_DENSITIES,
    });
  }
);

export default router;
