/**
 * `@tba3/modules/theme` — the colour layer: which bands a scale has, what each is painted,
 * and the two switches that change it.
 *
 * Register the scales from the payload first (`registerCompetenceLevelScales`); the
 * palette derives its ramp from the data rather than from fixed CSS, because the six
 * VERA-8 states publish four different vocabularies. Everything here works without a
 * document: `getThemeColors()` reads CSS custom properties when there is one and falls
 * back to the defaults every token carries when there is not.
 */

export {
    getCompetencyAppearance,
    getCompetencyColor,
    getThemeColors,
    invalidateThemeColorCache,
} from './themeService.js';

export {
    DATA_THEME_ID,
    getBandColor,
    getBandColorsByLevel,
    hasDataColors,
} from './competenceLevelColors.js';

export {
    getCompetencyBand,
    getCompetencyLevelOrdinal,
    getItemScaleIds,
    getLeadingScaleBandLevels,
    getLevelDescriptions,
    getLevelGlossaryKey,
    getLevelNamesForStandardRank,
    getPaletteVersion,
    getScaleDescriptions,
    getScaleLevelNames,
    getStandardBandNames,
    getStandardRank,
    hasAnyStandardRank,
    registerCompetenceLevelScales,
    registerItemCompetenceScales,
    resetCompetenceLevelPalette,
    resolveScaleId,
    scaleHasStandardRanks,
    slugifyCompetencyToken,
} from './competenceLevelPalette.js';

export {
    applyKsTheme,
    getActiveKsTheme,
    getAvailableKsThemes,
    initKsThemeFromStorage,
} from './ksThemeService.js';

export {
    applyColorScheme,
    COLOR_SCHEMES,
    getActiveColorScheme,
    initColorScheme,
} from './colorSchemeService.js';

export { notifyPaletteRepaint, setPaletteRepaint } from './paletteRepaint.js';
