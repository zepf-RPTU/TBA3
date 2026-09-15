/**
 * Frozen configuration for the SL Kompetenzstufen charts (overview + detail).
 *
 * Values only — no logic, no DOM, so a renderer importing a padding ratio does not
 * also pull in D3 mutation code.
 */

import { getThemeColors } from '../../../../../common/services/themeService.js';

/** Sort rank for comparison-row types: class → school → Landesschnitt. */
export const TYPE_ORDER = Object.freeze({ class: 1, school: 2, landesschnitt: 3 });

/** Chart configuration constants */
export const CHART_CONFIG = {
    PADDING: {
        X_SCALE: 0.15,
        X_SUB_SCALE: 0.05,
        BAR_PADDING_RATIO: 0.1,
        OUTER_DEFAULT: 0.08,
        OUTER_COMPACT: 0.04,
        SUBJECT_GROUPED_SCALE: 0.08,
    },
    ANIMATION: {
        DURATION: 300,
    },
    TEACHING_QUALITY: {
        BOX_WIDTH_RATIO: 0.6,
        WHISKER_CAP_WIDTH: 6,
        SCALE_MIN: 1,
        SCALE_MAX: 5,
    },
    STYLES: {
        FILL_OPACITY_HOVER: 0.8,
    },
};

/** Shared tooltip ID constant for all competency charts */
export const COMPETENCY_TOOLTIP_ID = 'competency';

/** Standard hover effect for competency bar segments */
export const BAR_HOVER_CONFIG = Object.freeze({
    enter: { opacity: CHART_CONFIG.STYLES.FILL_OPACITY_HOVER },
    leave: { opacity: 1 },
});

/** Style configuration constants */
export const STYLE_CONFIG = {
    COLORS: {
        get TEXT_PRIMARY() {
            return getThemeColors().chrome.text;
        },
        get TEXT_SECONDARY() {
            return getThemeColors().chrome.textSecondary;
        },
        get TEXT_DISABLED() {
            return getThemeColors().chrome.textDisabled;
        },
    },
    LEGEND: {
        SPACING: 25,
        SPACING_COMPACT: 20,
        SPACING_MINIMAL: 16,
        ITEM_SIZE: 14,
        FONT_ADJUSTMENT: 2,
        // Shared legend item styling
        CIRCLE_CX: 4,
        CIRCLE_CY_NORMAL: 9,
        CIRCLE_CY_CHILD: 7,
        CIRCLE_R_NORMAL: 3,
        CIRCLE_R_CHILD: 2,
        TEXT_X: 15,
        CHILD_INDENT: 20,
        HEADER_FONT_SIZE: 11,
    },
};
