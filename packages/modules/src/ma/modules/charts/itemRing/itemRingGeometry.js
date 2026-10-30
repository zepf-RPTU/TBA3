/**
 * The item ring's geometry: its radii, where its ticks and their icons sit, and how far
 * past the ring circle the figure reaches. Pure, so a layout can reserve the figure's
 * reach without the DOM-bound figure (`itemRingFigure.js`).
 */

const RING_GEOMETRY_CONFIG = {
    RINGS: {
        INNER_RADIUS_RATIO: 0.35,
        MIDDLE_RADIUS_RATIO: 0.65,
        OUTER_RADIUS_RATIO: 0.85,
        GAP_RATIO: 0.05,
    },
    TICKS: {
        OUTER_EXTENSION_RATIO: 0.5, // how far the tick extends beyond the outer ring edge, as multiple of ring thickness
        ICON_SIZE_RATIO: 0.18, // mannequin size, of the radius
        ICON_OFFSET_RATIO: 0.1, // gap between tick outer end and icon, of the radius
        ICON_COORD_SIZE_UNITS: 14, // the mannequin's drawing size, which its scale divides by
        ICON_HALF_EXTENT_UNITS: 5.75, // the mannequin's reach from its centre, in its drawing
        ICON_CLEARANCE_RATIO: 0.04, // room kept clear past the icon (its stroke, then air before a title), of the radius
    },
};

/**
 * The ring's radii, for one draw.
 * @typedef {object} RingGeometry
 * @property {[number, number]} inner - The level band.
 * @property {[number, number]} outer - The success annulus; hiding the inner ring widens it inwards, down to where the inner ring would start.
 * @property {[number, number]} tick - Where a tick starts and ends: across the annulus and beyond it.
 * @property {number} iconRadius - Where a tick's icon sits.
 * @property {number} iconScale - The mannequin's scale from its 14-unit drawing.
 */

/**
 * The ring's radii. A tick spans the annulus and reaches past its outer edge by half
 * the annulus's *normal* thickness, so hiding the inner ring (which widens the annulus)
 * does not lengthen the ticks.
 * @param {number} radius - The ring's outer radius in px.
 * @param {boolean} innerRingVisible
 * @returns {RingGeometry} The radii in px from the centre.
 */
export function ringGeometry(radius, innerRingVisible) {
    const R = RING_GEOMETRY_CONFIG.RINGS;
    const T = RING_GEOMETRY_CONFIG.TICKS;
    const outerEdge = radius * R.OUTER_RADIUS_RATIO;
    const annulusStart = innerRingVisible
        ? radius * (R.MIDDLE_RADIUS_RATIO + R.GAP_RATIO)
        : radius * R.INNER_RADIUS_RATIO;
    const normalThickness = radius * (R.OUTER_RADIUS_RATIO - R.MIDDLE_RADIUS_RATIO - R.GAP_RATIO);
    const tickEnd = outerEdge + normalThickness * T.OUTER_EXTENSION_RATIO;
    return {
        inner: [radius * R.INNER_RADIUS_RATIO, radius * R.MIDDLE_RADIUS_RATIO],
        outer: [annulusStart, outerEdge],
        tick: [annulusStart, tickEnd],
        iconRadius: tickEnd + radius * T.ICON_OFFSET_RATIO,
        iconScale: (radius * T.ICON_SIZE_RATIO) / T.ICON_COORD_SIZE_UNITS,
    };
}

/**
 * The smallest ring diameter, in px: below it the level labels no longer fit the inner
 * band even after the text has scaled down. No ring is drawn smaller: a grid wraps and
 * scrolls rather than shrink past it.
 */
export const RING_SIZE_MIN_PX = 180;

/**
 * How far the figure reaches from its centre, as a multiple of the ring radius: the
 * student icon past the end of its tick, which can point anywhere round the ring. A
 * ring's box reserves this on every side, so the icon never crosses the title or the
 * cell's edge. The pilot tick is a bare line and ends inside it.
 */
export const RING_REACH = (() => {
    const unit = ringGeometry(1, true);
    const T = RING_GEOMETRY_CONFIG.TICKS;
    return unit.iconRadius + unit.iconScale * T.ICON_HALF_EXTENT_UNITS + T.ICON_CLEARANCE_RATIO;
})();

/**
 * The signed angle from one direction to another, the short way round.
 * @param {number} to - The target angle in degrees.
 * @param {number} from - The start angle in degrees.
 * @returns {number} The turn in degrees, in [-180, 180).
 */
export function angleDeltaDeg(to, from) {
    return ((to - from + 540) % 360) - 180;
}
