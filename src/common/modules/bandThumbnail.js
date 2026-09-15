/**
 * Decorative competence-band thumbnails — the small stacked-bar and donut icons that
 * illustrate "a Kompetenzstufen distribution" on nav cards, sidebar entries and view
 * titles.
 *
 * They render no real data, so unlike a chart they have no datum to resolve a scale
 * from: they follow the leading registered scale and repaint when it or the theme
 * changes. They are drawn as SVG rather than a CSS gradient because the band count is
 * data-driven — MA alone ships 5-, 6- and 7-level scales — and a gradient can only
 * hardcode a fixed number of stops. Each band paints through `--ks-band-color`, the same
 * contract every chart uses; see src/styles/preview-media.css for the rules.
 */

import { applyCompetencyBandPaint } from '@tba3/modules/charts';
import { getCompetencyAppearance, getLeadingScaleBandLevels } from '@tba3/modules/theme';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Thumbnail shape per CSS class. The classes come from each app's nav-card config. */
const KIND_BY_CLASS = {
    'preview-bars': 'bars',
    'preview-donut': 'donut',
};

const THUMBNAIL_SELECTOR = Object.keys(KIND_BY_CLASS)
    .map((name) => `.${name}`)
    .join(', ');

// Square viewBox, so the SVG scales to whatever box .preview-media gives it.
const VIEWBOX_SIZE = 100;

// Donut ring geometry: a stroked circle rather than N wedge paths, so a single-band
// scale needs no special case (a 360° wedge has no valid arc form).
const RING_RADIUS = 35;
const RING_WIDTH = 30;

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Draw (or redraw) one thumbnail into `element`, if its class names a thumbnail shape.
 * A no-op for every other preview icon, so call sites can hand over any preview element.
 * @param {Element|null|undefined} element - The `.preview-media` box
 */
export function renderBandThumbnail(element) {
    if (!element) return;

    const kind =
        KIND_BY_CLASS[Object.keys(KIND_BY_CLASS).find((name) => element.classList.contains(name))];
    if (!kind) return;

    const levels = getLeadingScaleBandLevels();
    // Before the first dataset registers there is no scale to illustrate. Leaving the
    // box empty is deliberate: a placeholder ramp would show band colors that belong to
    // no scale, and the repaint below fills it in as soon as the data lands.
    element.replaceChildren();
    if (levels.length === 0) return;

    element.appendChild(kind === 'bars' ? buildBars(levels) : buildDonut(levels));
}

/**
 * Repaint every thumbnail under `root`. Call after the palette changes — a dataset
 * registering a new scale, or a theme switch — and after markup that contains
 * thumbnails is injected.
 *
 * Defaults to the whole document — resolved inside the DOM guard rather than as a
 * default parameter, which would evaluate `document` (and throw) in a DOM-less runtime
 * before the guard could run.
 * @param {ParentNode} [root] - Defaults to `document`
 */
export function repaintBandThumbnails(root) {
    if (typeof document === 'undefined') return;
    const scope = root ?? document;
    if (!scope?.querySelectorAll) return;
    scope.querySelectorAll(THUMBNAIL_SELECTOR).forEach(renderBandThumbnail);
}

// ============================================================================
// PRIVATE HELPERS
// ============================================================================

/**
 * @param {string} name - Root element tag name, for the accessible title.
 * @returns {SVGElement} A square SVG root sized to the shared viewBox.
 */
function createSvgRoot(name) {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', `0 0 ${VIEWBOX_SIZE} ${VIEWBOX_SIZE}`);
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    svg.setAttribute('focusable', 'false');
    svg.setAttribute('aria-hidden', 'true');
    svg.classList.add('band-thumbnail', `band-thumbnail--${name}`);
    return svg;
}

/**
 * Stamp the band paint contract, so the node picks up `--ks-band-color` from CSS.
 * @param {Element} node - The element to stamp.
 * @param {{name: string, scaleId: string}} band - The band whose color the node should pick up.
 */
function paintBand(node, band) {
    const appearance = getCompetencyAppearance(band.name, band.scaleId);
    if (appearance) applyCompetencyBandPaint(/** @type {any} */ (node), appearance);
}

/**
 * Stacked bar: one full-width slice per band, lowest band at the bottom.
 * @param {Array<{name: string, scaleId: string}>} levels - The scale’s bands, lowest first.
 * @returns {SVGElement} The thumbnail SVG.
 */
function buildBars(levels) {
    const svg = createSvgRoot('bars');
    const height = VIEWBOX_SIZE / levels.length;

    levels.forEach((band, index) => {
        const rect = document.createElementNS(SVG_NS, 'rect');
        rect.setAttribute('x', '0');
        rect.setAttribute('y', String(VIEWBOX_SIZE - (index + 1) * height));
        rect.setAttribute('width', String(VIEWBOX_SIZE));
        rect.setAttribute('height', String(height));
        rect.classList.add('band-thumbnail-segment');
        paintBand(rect, band);
        svg.appendChild(rect);
    });

    return svg;
}

/**
 * Donut: equal arcs around one stroked ring, starting at twelve o'clock. Each arc is a
 * full circle with a dash pattern that exposes only its own slice, which keeps the
 * geometry to two numbers per band instead of a wedge path.
 * @param {Array<{name: string, scaleId: string}>} levels - The scale’s bands, lowest first.
 * @returns {SVGElement} The thumbnail SVG.
 */
function buildDonut(levels) {
    const svg = createSvgRoot('donut');
    const center = VIEWBOX_SIZE / 2;
    const circumference = 2 * Math.PI * RING_RADIUS;
    const arc = circumference / levels.length;

    const group = document.createElementNS(SVG_NS, 'g');
    group.setAttribute('transform', `rotate(-90 ${center} ${center})`);

    levels.forEach((band, index) => {
        const circle = document.createElementNS(SVG_NS, 'circle');
        circle.setAttribute('cx', String(center));
        circle.setAttribute('cy', String(center));
        circle.setAttribute('r', String(RING_RADIUS));
        circle.setAttribute('stroke-width', String(RING_WIDTH));
        circle.setAttribute('stroke-dasharray', `${arc} ${circumference - arc}`);
        circle.setAttribute('stroke-dashoffset', String(-index * arc));
        circle.classList.add('band-thumbnail-arc');
        paintBand(circle, band);
        group.appendChild(circle);
    });

    svg.appendChild(group);
    return svg;
}
