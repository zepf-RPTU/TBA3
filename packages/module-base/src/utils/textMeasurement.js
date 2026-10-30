/**
 * Text measurement before layout: a canvas measures a string at a given font, and a
 * probe element resolves any CSS length (`rem`, `var()`, `max()`, `clamp()`) to px in a
 * given scope.
 */

/** @type {CanvasRenderingContext2D|null} */
let measureCanvasContext = null;
/** The font last assigned to the measuring context. */
let measureFont = '';

/**
 * The font a string is measured at, already resolved.
 * @typedef {object} MeasureFont
 * @property {number} size - Size in px.
 * @property {string|number} weight - CSS font weight.
 * @property {string} family - CSS font family list.
 */

/**
 * The shared offscreen canvas context, created once: a canvas per measurement would
 * dominate the cost of measuring a table full of headers.
 * @returns {CanvasRenderingContext2D}
 */
function getMeasureContext() {
    measureCanvasContext ??= /** @type {CanvasRenderingContext2D} */ (
        document.createElement('canvas').getContext('2d')
    );
    return measureCanvasContext;
}

/**
 * The px value every `rem` resolves against. May be fluid in a host, so anything
 * derived from a rem measurement goes stale on a resize.
 * @returns {number} The current root font size in px.
 */
export function rootFontSizePx() {
    return Number.parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
}

/**
 * Resolve a CSS length to px by probing it as a font size inside `scope`, so a `var(--…)`
 * token is read against the element that defines it and `max()`/`clamp()` evaluate.
 * A `var()` whose property is unset leaves the probe at its inherited size, so pass the
 * fallback inside it: `var(--gap, 8px)`.
 * @param {Element} scope - Where the probe is mounted; the custom properties in force there apply.
 * @param {string} cssValue - A CSS length, a `var()` reference or a math function.
 * @returns {number} The length in px, or NaN when it cannot be resolved.
 */
export function probeCssLengthPx(scope, cssValue) {
    if (!cssValue) return NaN;
    const probe = document.createElement('span');
    probe.style.position = 'absolute';
    probe.style.visibility = 'hidden';
    probe.style.pointerEvents = 'none';
    probe.style.fontSize = cssValue;
    scope.appendChild(probe);
    const px = Number.parseFloat(getComputedStyle(probe).fontSize);
    probe.remove();
    return px;
}

/**
 * The root-level lengths probed at one root font size: root tokens are sized in rem, so
 * they move only with it.
 * @type {{rootFontSize: number, lengths: Map<string, number>}}
 */
const rootProbes = { rootFontSize: NaN, lengths: new Map() };

/**
 * `probeCssLengthPx` on the body, probed once per value and root font size.
 * @param {string} cssValue - A root-level CSS length: a `var()` reference to a root token, or a math function over them.
 * @param {number} rootFontSize - The root font size in force, in px.
 * @returns {number} The length in px, or NaN when it cannot be resolved.
 */
export function probeRootLengthPx(cssValue, rootFontSize) {
    if (rootProbes.rootFontSize !== rootFontSize) {
        rootProbes.rootFontSize = rootFontSize;
        rootProbes.lengths.clear();
    }
    let px = rootProbes.lengths.get(cssValue);
    if (px === undefined) {
        px = probeCssLengthPx(document.body, cssValue);
        if (Number.isFinite(px)) rootProbes.lengths.set(cssValue, px);
    }
    return px;
}

/**
 * The pixel width of `text` at `font`, measured on a cached canvas.
 * @param {string} text
 * @param {object} options - The font to measure at, and the padding to add.
 * @param {MeasureFont} options.font - The resolved font the text renders in.
 * @param {number} [options.padding=0] - Added to the measured width (a cell's own padding).
 * @returns {number} Width in px, padding included, rounded up.
 */
export function measureTextWidth(text, { font, padding = 0 }) {
    if (!text) return padding;
    const ctx = getMeasureContext();
    // Assigning `font` parses the string, so it is skipped while the font stays the same.
    const fontValue = `${font.weight} ${font.size}px ${font.family}`;
    if (fontValue !== measureFont) {
        ctx.font = fontValue;
        measureFont = fontValue;
    }
    return Math.ceil(ctx.measureText(text).width + padding);
}
