/**
 * Marker and legend-symbol shapes shared across all chart legends.
 *
 * The three path generators are tuned relative to each other (see
 * CROSS_ARM_RATIO) so markers keep visual weight parity, which is why they
 * live and move together.
 */

import { getThemeColors } from '../services/themeService.js';
import { getCompetencyLevelClassToken } from './chartUtils.js';

/**
 * Opacity value for hidden/dimmed legend items across all charts.
 * Used by visibility toggles (Schulschnitt, Landesschnitt, etc.)
 */
export const HIDDEN_LEGEND_OPACITY = 0.3;

/**
 * Generate an SVG path string for a diamond shape.
 * @param {number} cx - Center x coordinate
 * @param {number} cy - Center y coordinate
 * @param {number} size - Half-width/height of diamond (distance from center to point)
 * @returns {string} SVG path data string
 * @example
 * // Centered diamond at (100, 50) with size 8
 * path.attr('d', getDiamondPath(100, 50, 8));
 *
 * // Legend diamond centered at origin
 * path.attr('d', getDiamondPath(0, 0, 6));
 */
export function getDiamondPath(cx, cy, size) {
    return `M${cx},${cy - size} L${cx + size},${cy} L${cx},${cy + size} L${cx - size},${cy} Z`;
}

/**
 * Generate an SVG path string for a triangle shape.
 * @param {number} cx - Center x coordinate
 * @param {number} cy - Center y coordinate
 * @param {number} size - Half-height of triangle (distance from center to top vertex)
 * @returns {string} SVG path data string
 */
export function getTrianglePath(cx, cy, size) {
    return `M${cx},${cy - size} L${cx - size},${cy + size / 2} L${cx + size},${cy + size / 2} Z`;
}

/**
 * Arm half-thickness of the cross, as a fraction of its half-extent. At 0.3 the
 * filled area lands on the diamond's (2·size²), which is what keeps the catch-all
 * marker from reading as heavier than the school and state marks beside it.
 */
const CROSS_ARM_RATIO = 0.3;

/**
 * Generate an SVG path string for a cross (plus) shape.
 *
 * The catch-all marker for comparison averages whose value-group type is not one
 * the client recognises. Chosen because its silhouette stays unambiguous against
 * the diamond, square, triangle and circle it can appear next to, even at marker
 * size in the grayscale theme where the fill colours converge.
 * @param {number} cx - Center x coordinate
 * @param {number} cy - Center y coordinate
 * @param {number} size - Half-extent of the cross (center to arm tip)
 * @returns {string} SVG path data string
 */
export function getCrossPath(cx, cy, size) {
    const t = size * CROSS_ARM_RATIO;
    return (
        `M${cx - t},${cy - size} L${cx + t},${cy - size} L${cx + t},${cy - t}` +
        ` L${cx + size},${cy - t} L${cx + size},${cy + t} L${cx + t},${cy + t}` +
        ` L${cx + t},${cy + size} L${cx - t},${cy + size} L${cx - t},${cy + t}` +
        ` L${cx - size},${cy + t} L${cx - size},${cy - t} L${cx - t},${cy - t} Z`
    );
}

/** Centre-dot radius as a share of the marker's half-extent. */
export const MARKER_DOT_RATIO = 0.35;

/**
 * The centre dot of a marker whose paint asks for one (`dotFill`): an inert circle
 * over the marker's centre, in the group's colour on a hollow marker or in the
 * surface colour on a filled one.
 * @param {import('d3').Selection} container - Where to append (the marker's parent).
 * @param {{cx: number|((d: any) => number), cy: number|((d: any) => number), size: number, fill: string, className?: string}} spec - Centre (values or per-datum accessors), the marker's half-extent, the dot's fill and an extra class.
 * @returns {import('d3').Selection} The appended circle.
 */
export function appendMarkerDot(container, { cx, cy, size, fill, className = '' }) {
    return container
        .append('circle')
        .attr('class', `marker-dot${className ? ` ${className}` : ''}`)
        .attr('cx', /** @type {any} */ (cx))
        .attr('cy', /** @type {any} */ (cy))
        .attr('r', size * MARKER_DOT_RATIO)
        .attr('fill', fill)
        .style('pointer-events', 'none');
}

/**
 * Symbol-specific default sizes and stroke widths for consistent legend appearance.
 * Sizes chosen to ensure visual weight parity across different shapes.
 */
const SYMBOL_DEFAULTS = {
    circle: { size: 6, strokeWidth: 2 },
    diamond: { size: 8, strokeWidth: 2 },
    triangle: { size: 8, strokeWidth: 2 },
    cross: { size: 8, strokeWidth: 2 },
    square: { size: 11, strokeWidth: 2 }, // Larger to match visual weight of other shapes
    rect: { size: 18, strokeWidth: 1 }, // Rects are typically larger with thinner strokes
    line: { size: 7, strokeWidth: 2 }, // Size controls line length (multiplied by 3)
    lollipop: { size: 6, strokeWidth: 2 }, // Stem ending in a circle head
};

/**
 * Render a legend symbol into a D3 group element.
 * Centralizes the per-type shape rendering used across all chart legends.
 * Applies symbol-specific size and strokeWidth defaults for consistency.
 * @param {any} container - D3 group selection to append the symbol to
 * @param {string} type - Symbol type: 'circle', 'rect', 'diamond', 'square', 'triangle', 'line', 'lollipop'
 * @param {object} [options={}] - Symbol options
 * @param {number} [options.size] - Override default size for this symbol type
 * @param {string} [options.color] - Fill color (defaults to theme textSecondary)
 * @param {import('./chartUtils.js').CompetencyAppearance|null} [options.appearance] - Competence-level appearance (color + class token)
 * @param {string} [options.stroke='#fff'] - Stroke color (universal default: white)
 * @param {number} [options.strokeWidth] - Override default strokeWidth for this symbol type
 * @param {number} [options.rx=0] - Border radius for rect symbols
 * @param {string|null} [options.dotFill] - Centre dot fill for a marker symbol whose mark carries one; null for none
 * @returns {any} The appended symbol element
 */
export function renderLegendSymbol(container, type, options = {}) {
    // Apply symbol-specific defaults
    const defaults = SYMBOL_DEFAULTS[type] || SYMBOL_DEFAULTS.circle;
    const {
        size = defaults.size,
        color = getThemeColors().chrome.textSecondary,
        appearance = null,
        dotFill = null,
        stroke = getThemeColors().chrome.chartStroke,
        strokeWidth = defaults.strokeWidth,
        rx = 0,
    } = options;

    let symbol;

    switch (type) {
        case 'circle':
            symbol = container.append('circle').attr('r', size).attr('cx', 0).attr('cy', 0);
            break;

        case 'diamond':
            symbol = container.append('path').attr('d', getDiamondPath(0, 0, size));
            break;

        case 'triangle':
            symbol = container.append('path').attr('d', getTrianglePath(0, 0, size));
            break;

        case 'cross':
            symbol = container.append('path').attr('d', getCrossPath(0, 0, size));
            break;

        case 'square':
            symbol = container
                .append('rect')
                .attr('x', -size / 2)
                .attr('y', -size / 2)
                .attr('width', size)
                .attr('height', size);
            break;

        case 'rect':
            symbol = container
                .append('rect')
                .attr('x', 0)
                .attr('y', -size / 2)
                .attr('width', size)
                .attr('height', size)
                .attr('rx', rx);
            break;

        case 'line':
            symbol = container
                .append('line')
                .attr('x1', 0)
                .attr('y1', 0)
                .attr('x2', size * 3)
                .attr('y2', 0)
                .attr('stroke-width', strokeWidth);
            // Line uses stroke as primary color, not fill
            symbol.attr('stroke', color);
            return symbol;

        case 'lollipop': {
            // The item mark in miniature: a stem and its head.
            const length = size * 3;
            container
                .append('line')
                .attr('class', 'lollipop-stem')
                .attr('x1', 0)
                .attr('y1', 0)
                .attr('x2', length - size)
                .attr('y2', 0)
                .attr('stroke', color)
                .attr('stroke-width', strokeWidth);
            symbol = container
                .append('circle')
                .attr('class', 'lollipop-head')
                .attr('r', size)
                .attr('cx', length)
                .attr('cy', 0);
            break;
        }

        default:
            symbol = container.append('circle').attr('r', size).attr('cx', 0).attr('cy', 0);
            break;
    }

    const competencyClassToken = appearance ? getCompetencyLevelClassToken(null, appearance) : null;
    if (appearance) {
        symbol
            .attr('class', `competency-symbol competency-level level-${competencyClassToken}`)
            .attr('fill', null)
            .attr('fill-opacity', null)
            .style('fill', null)
            .style('--ks-band-color', appearance.baseColor);
    } else {
        symbol.attr('fill', color);
    }

    symbol.attr('stroke', stroke).attr('stroke-width', strokeWidth);

    // A marker swatch shows the same centre dot as the mark; centred symbols sit on
    // the origin, the legend `rect` starts at it.
    if (dotFill) {
        appendMarkerDot(container, {
            cx: type === 'rect' ? size / 2 : 0,
            cy: 0,
            size: type === 'square' || type === 'rect' ? size / 2 : size,
            fill: dotFill,
        });
    }

    return symbol;
}
