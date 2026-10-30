/**
 * The scatterplot's layout and marker constants and its percent range.
 */

import { GLOSSARY_KEYS } from '../../../../common/glossary/glossaryKeys.js';

/**
 * Nominal size of an average marker (see `markerHalfExtent`): larger than the lollipops'
 * `AVERAGE_MARKER.sizePx`, as a marker here stands alone among the student points.
 */
export const AVERAGE_MARKER_SIZE_PX = 10;

/**
 * The full range of a percent axis: the unzoomed domain, the bounds a zoom is clamped
 * to and the outer edges of the outermost bands. Frozen: the unzoomed domain hands
 * this one array out for both axes.
 * @type {readonly [number, number]}
 */
export const PERCENT_RANGE = Object.freeze([0, 100]);

/** The group's own marker. Not a comparison group, so it has no role and no shade ramp. */
export const GROUP_VISUAL = {
    symbol: 'triangle',
    color: 'var(--group-average-color)',
    glossaryKey: GLOSSARY_KEYS.LERNGRUPPENSCHNITT,
};

export const CHART_CONFIG = {
    POINTS: {
        RADIUS_PX: 5,
        // Jitter keeps points apart, so they can paint at full strength.
        OPACITY: 1,
    },
    ZOOM: {
        PADDING_PP: 5,
    },
    JITTER: {
        COLLISION_PADDING_PX: 1,
        SIMULATION_ITERATIONS: 80, // force ticks; enough to converge
        POSITION_STRENGTH: 0.8, // pull to the true position (0-1)
        POSITION_STRENGTH_ZOOMED: 0.9, // zoomed in, with more space
        MAX_DISPLACEMENT_PX: 15,
    },
    SELECTION: {
        COLOR: 'var(--primary-color)',
        STROKE_WIDTH_PX: 3,
        RECT_FILL: 'color-mix(in srgb, var(--primary-color) 10%, transparent)',
        RECT_STROKE_DASHARRAY: '4,2',
        // The points left out of a selection: dimmed, still at 3:1 against the card.
        UNSELECTED_OPACITY: 0.6,
    },
};
