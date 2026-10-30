/**
 * Marker and legend-symbol shapes. Every marker shape is a `d3-shape` symbol sized by
 * area: a marker of nominal size `s` covers 2·s², the area of a diamond reaching `s`
 * from its centre, so a square, a cross and a triangle beside it read as equally heavy.
 */

import {
    symbol as shapeSymbol,
    symbolCircle,
    symbolCross,
    symbolSquare,
    symbolTriangle,
} from 'd3-shape';

/**
 * The Schulschnitt diamond: a square rhombus reaching √(area/2) from its centre.
 * `d3.symbolDiamond` is the narrow tan-30° rhombus, a different silhouette.
 * @type {import('d3-shape').SymbolType}
 */
const DIAMOND = {
    draw(context, size) {
        const r = Math.sqrt(size / 2);
        context.moveTo(0, -r);
        context.lineTo(r, 0);
        context.lineTo(0, r);
        context.lineTo(-r, 0);
        context.closePath();
    },
};

/** @type {Readonly<{[shape: string]: import('d3-shape').SymbolType}>} */
const MARKER_SYMBOL = Object.freeze({
    diamond: DIAMOND,
    square: symbolSquare,
    triangle: symbolTriangle,
    cross: symbolCross,
    circle: symbolCircle,
});

/**
 * How far each shape reaches sideways from its centre, per unit of nominal size, at
 * the equal area 2·size²: a square steps in by √2, the cross's arms reach 3·√0.1
 * (d3's arm is a third of its reach), the equilateral triangle half its side.
 * @type {Readonly<{[shape: string]: number}>}
 */
const HALF_EXTENT = Object.freeze({
    square: 1 / Math.SQRT2,
    cross: 3 * Math.sqrt(0.1),
    triangle: Math.sqrt(2 / Math.sqrt(3)),
});

/**
 * The triangle's base below its centroid, per unit of nominal size: `d3.symbolTriangle`
 * centres on the centroid, apex 2× this above and base 1× below, so the shape is 3×
 * this tall and the middle of its bounding box lies half this above the centroid.
 */
const TRIANGLE_BASE = Math.sqrt(2 / (3 * Math.sqrt(3)));

/**
 * The SVG path of a marker shape centred on the origin, sized by area.
 * @param {string} shape - `diamond`, `square`, `triangle`, `cross` or `circle`; anything else draws the diamond.
 * @param {number} sizePx - Nominal size, a diamond's half-extent.
 * @returns {string}
 */
export function markerPath(shape, sizePx) {
    return /** @type {string} */ (
        shapeSymbol(MARKER_SYMBOL[shape] ?? DIAMOND, 2 * sizePx * sizePx)()
    );
}

/**
 * How far a marker of this nominal size reaches sideways from its centre: where a
 * label beside it may start, and a legend row's symbol box.
 * @param {string} shape
 * @param {number} sizePx - Nominal size, a diamond's half-extent.
 * @returns {number} In px.
 */
export function markerHalfExtent(shape, sizePx) {
    return sizePx * (HALF_EXTENT[shape] ?? 1);
}

/** Centre-dot radius as a share of the marker's half-extent. */
const MARKER_DOT_RATIO = 0.35;

/**
 * The centre dot of a marker whose paint asks for one (`dotFill`): an inert circle
 * over the marker's centre, in the group's colour on a hollow marker or in the
 * surface colour on a filled one.
 * @template {import('d3').BaseType} Parent
 * @template D
 * @param {import('d3').Selection<Parent, D, any, any>} container - The marker's parent.
 * @param {{cx: number|((d: D) => number), cy: number|((d: D) => number), sizePx: number, fill: string}} spec - `sizePx` is the marker's half-extent.
 * @returns {import('d3').Selection<SVGCircleElement, D, Parent, any>}
 */
export function appendMarkerDot(container, { cx, cy, sizePx, fill }) {
    // Value functions, because d3's `attr` overloads take a constant or a function,
    // never a union of them.
    return container
        .append('circle')
        .attr('class', 'marker-dot')
        .attr('cx', typeof cx === 'function' ? cx : () => cx)
        .attr('cy', typeof cy === 'function' ? cy : () => cy)
        .attr('r', sizePx * MARKER_DOT_RATIO)
        .style('fill', fill)
        .style('pointer-events', 'none');
}

/**
 * Default size and stroke width per symbol, read by the key's box and its drawing
 * alike. A marker's size is nominal, as on the chart (`markerPath`); a pill's is its
 * height (it is twice as wide), a line's a third of its length, a lollipop's its head's
 * radius.
 * @type {{[type: string]: {sizePx: number, strokeWidth: number}}}
 */
const SYMBOL_DEFAULTS = {
    circle: { sizePx: 6, strokeWidth: 2 },
    diamond: { sizePx: 8, strokeWidth: 2 },
    triangle: { sizePx: 8, strokeWidth: 2 },
    cross: { sizePx: 8, strokeWidth: 2 },
    square: { sizePx: 8, strokeWidth: 2 },
    pill: { sizePx: 10, strokeWidth: 2 },
    line: { sizePx: 7, strokeWidth: 2 },
    lollipop: { sizePx: 6, strokeWidth: 2 },
};

/**
 * The drawn extent of a legend symbol around its anchor point: symbols anchor
 * differently (a circle at its centre, a pill or line at its left edge), so a row
 * cannot be laid out from the anchor alone.
 * @param {string} [type] - Symbol type, as `renderLegendSymbol` takes it.
 * @param {number} [sizePx] - Size override; the type's default otherwise.
 * @returns {{left: number, right: number, height: number}} Offsets in px from the anchor, and the full height.
 */
export function legendSymbolBox(type = 'circle', sizePx) {
    const s = sizePx ?? (SYMBOL_DEFAULTS[type] ?? SYMBOL_DEFAULTS.circle).sizePx;
    switch (type) {
        case 'square':
        case 'cross': {
            const half = markerHalfExtent(type, s);
            return { left: -half, right: half, height: s * 2 };
        }
        case 'triangle': {
            const half = markerHalfExtent(type, s);
            return { left: -half, right: half, height: 3 * TRIANGLE_BASE * s };
        }
        case 'pill':
            return { left: 0, right: s * 2, height: s };
        case 'line':
            return { left: 0, right: s * 3, height: SYMBOL_DEFAULTS.line.strokeWidth };
        case 'lollipop':
            return { left: 0, right: s * 4, height: s * 2 };
        default:
            return { left: -s, right: s, height: s * 2 };
    }
}

/**
 * Render a legend symbol into a D3 group element, with the symbol type's own size and
 * strokeWidth defaults.
 * @template {import('d3').BaseType} P
 * @template D
 * @param {import('d3').Selection<P, D, any, any>} container
 * @param {string} [type='circle'] - Symbol type: 'circle', 'pill', 'diamond', 'square', 'triangle', 'cross', 'line', 'lollipop'
 * @param {object} [options={}]
 * @param {number} [options.sizePx]
 * @param {string} [options.color] - The fill; a line's stroke.
 * @param {string} [options.stroke]
 * @param {number} [options.strokeWidth]
 * @param {string|null} [options.dotFill] - Centre dot fill for a marker symbol whose mark carries one
 * @returns {import('d3').Selection<any, D, any, any>} Its element type depends on `type`.
 */
export function renderLegendSymbol(container, type = 'circle', options = {}) {
    const defaults = SYMBOL_DEFAULTS[type] || SYMBOL_DEFAULTS.circle;
    const {
        sizePx: size = defaults.sizePx,
        color = 'var(--text-secondary)',
        dotFill = null,
        stroke = 'var(--color-card-background)',
        strokeWidth = defaults.strokeWidth,
    } = options;

    /** @type {import('d3').Selection<any, D, any, any>} */
    let symbol;
    // The legend centres the triangle on its bounding box, not its centroid, so it sits
    // inside the row `legendSymbolBox` reserves; the dot follows it to the centroid.
    const dy = type === 'triangle' ? (TRIANGLE_BASE * size) / 2 : 0;

    switch (type) {
        case 'circle':
            symbol = container.append('circle').attr('r', size).attr('cx', 0).attr('cy', 0);
            break;

        case 'diamond':
        case 'square':
        case 'triangle':
        case 'cross':
            symbol = container.append('path').attr('d', markerPath(type, size));
            if (dy) symbol.attr('transform', `translate(0,${dy})`);
            break;

        case 'pill':
            // A lollipop's text pill in miniature: fully rounded, twice as wide as high.
            symbol = container
                .append('rect')
                .attr('x', 0)
                .attr('y', -size / 2)
                .attr('width', size * 2)
                .attr('height', size)
                .attr('rx', size / 2);
            break;

        case 'line':
            symbol = container
                .append('line')
                .attr('x1', 0)
                .attr('y1', 0)
                .attr('x2', size * 3)
                .attr('y2', 0)
                .attr('stroke-width', strokeWidth);
            // A line's colour is its stroke; it takes no fill or outline.
            symbol.style('stroke', color);
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
                .style('stroke', color)
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

    symbol.style('fill', color);
    // The outline rides as a custom property the panel's sheet reads, so its forced
    // colours rule replaces it through the normal cascade.
    symbol.style('--mark-outline', stroke).attr('stroke-width', strokeWidth);

    if (dotFill) {
        appendMarkerDot(container, {
            cx: 0,
            cy: dy,
            sizePx: markerHalfExtent(type, size),
            fill: dotFill,
        });
    }

    return symbol;
}
