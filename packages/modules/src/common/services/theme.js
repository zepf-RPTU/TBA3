/**
 * `@tba3/modules/theme` — the colour layer: which bands a scale has, what each is painted,
 * and the two switches that change it.
 *
 * The app's context (`@tba3/modules/context`) registers the scales from the payload with
 * its palette as the documents land, and the palette derives its ramp from them. A
 * level paints as a `var()` of a published token, so a theme, scheme or scale change
 * repaints through the cascade.
 */

export { DATA_THEME_ID, getBandColorsByLevel } from './competenceLevelColors.js';

export {
    applyCompetenceLevelTheme,
    getActiveCompetenceLevelTheme,
    getAvailableCompetenceLevelThemes,
    initCompetenceLevelThemeFromStorage,
} from './competenceLevelThemeService.js';

export {
    applyColorScheme,
    COLOR_SCHEMES,
    getActiveColorScheme,
    initColorScheme,
} from './colorSchemeService.js';

export { getRampStops } from './colorRamp.js';
