/**
 * The scatterplot's layout and marker constants, shared by the renderer and the
 * average-marker drawing.
 */

import { HIDDEN_LEGEND_OPACITY } from '../../../../common/charts/markerSymbols.js';
import { getThemeColors } from '../../../../common/services/themeService.js';
import { GLOSSARY_KEYS } from '../../../../common/glossary/glossaryKeys.js';

export const LEGEND_SYMBOL_TEXT_GAP = 8;
export const LEGEND_COLUMN_GAP = 18;
export const SCATTERPLOT_TOOLTIP_ID = 'en-scatterplot';
/** Gap between a comparison marker and its ordinal tag, in px. */
export const MARKER_TAG_GAP = 3;

/** The class's own marker. Not a comparison group, so it has no role and no shade ramp. */
export const CLASS_VISUAL = {
    symbol: 'triangle',
    colorKey: 'classAverage',
    glossaryKey: GLOSSARY_KEYS.KLASSENSCHNITT,
};

export const CHART_CONFIG = {
    DEFAULTS: {
        WIDTH: 800,
        HEIGHT: 600,
    },
    POINTS: {
        RADIUS: 5,
        RADIUS_HOVER: 7,
        // Jitter keeps points apart, so they can paint at full strength.
        OPACITY: 1,
    },
    AVERAGES: {
        SIZE: 14, // Size for triangle/diamond on chart (measured from center)
        SQUARE_SIZE: 18, // Squares need to be larger to appear visually equal
        LEGEND_SIZE: 8, // Size for triangle/diamond in legend
        LEGEND_SQUARE_SIZE: 11, // Square size in legend (larger to match visually)
        OPACITY: 0.8,
        HIDDEN_OPACITY: HIDDEN_LEGEND_OPACITY,
    },
    ZOOM: {
        PADDING: 5,
        TRANSITION_DURATION: 750,
    },
    JITTER: {
        ENABLED: true,
        COLLISION_PADDING: 1, // Extra padding between points
        SIMULATION_ITERATIONS: 80, // Number of force simulation ticks (80 is sufficient for convergence)
        POSITION_STRENGTH: 0.8, // How strongly points are pulled to true position (0-1)
        POSITION_STRENGTH_ZOOMED: 0.9, // Strength when zoomed in (more space available)
        MAX_DISPLACEMENT: 15, // Max pixels a point can move from true position
    },
    SELECTION: {
        get COLOR() {
            return getThemeColors().chart.primaryColor;
        },
        STROKE_WIDTH: 3, // Selected point stroke width
        get RECT_FILL() {
            const hex = getThemeColors().chart.primaryColor;
            const r = parseInt(hex.slice(1, 3), 16);
            const g = parseInt(hex.slice(3, 5), 16);
            const b = parseInt(hex.slice(5, 7), 16);
            return `rgba(${r}, ${g}, ${b}, 0.1)`;
        },
        RECT_STROKE_DASHARRAY: '4,2',
        UNSELECTED_OPACITY: 0.4,
    },
};
