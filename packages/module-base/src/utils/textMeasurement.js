/** @type {CanvasRenderingContext2D|null} */
let measureCanvasContext = null;

/**
 * Mean glyph width as a share of the font size, used when there is no canvas to
 * measure with. A rough Latin-text average — enough to keep a column or a title
 * wrap plausible off-browser, never a substitute for a real measurement.
 */
const AVERAGE_GLYPH_WIDTH_RATIO = 0.55;

/**
 * The shared offscreen canvas context used for text measurement.
 * Created once and reused: a canvas per measurement would dominate the cost of
 * measuring a table full of headers. The reuse only holds once a context exists —
 * where `getContext` yields null the falsy check retries on every call, so a
 * context-less environment pays a `createElement` per measurement.
 * @returns {CanvasRenderingContext2D|null} The context, or null with no document or no 2d support.
 */
function getMeasureContext() {
    if (typeof document === 'undefined') return null;
    if (!measureCanvasContext) {
        const canvas = document.createElement('canvas');
        measureCanvasContext = canvas.getContext('2d');
    }
    return measureCanvasContext;
}

/**
 * The px value every `rem` resolves against. Fluid (`clamp()` in
 * src/styles/foundation/responsive.css), so it moves with the viewport — which is
 * why anything derived from a rem measurement goes stale on a resize.
 * @returns {number} The current root font size in px; 16 when there is no document.
 */
export function rootFontSizePx() {
    if (typeof document === 'undefined') return 16;
    return Number.parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
}

/**
 * Resolve a CSS length to px. Handles `rem` (against the fluid root size) and `px`;
 * anything else falls back, because a value this cannot resolve would otherwise
 * measure as `NaN` and silently break wrapping.
 * @param {string} cssValue - The length to resolve.
 * @param {number} fallbackPx - Returned when the value is absent or not a unit this understands.
 * @returns {number} The length in px.
 */
export function resolveCssLengthToPx(cssValue, fallbackPx) {
    if (!cssValue) return fallbackPx;

    const normalizedValue = cssValue.trim().toLowerCase();
    const numericValue = Number.parseFloat(normalizedValue);
    if (Number.isNaN(numericValue)) return fallbackPx;

    if (normalizedValue.endsWith('rem')) {
        return numericValue * rootFontSizePx();
    }

    if (normalizedValue.endsWith('px') || /^-?\d*\.?\d+$/.test(normalizedValue)) {
        return numericValue;
    }

    console.warn(`[resolveCssLengthToPx] Unsupported CSS length '${cssValue}', using fallback.`);
    return fallbackPx;
}

/**
 * Per-character tracking in px. `em` resolves against the text's own font size,
 * which is why this cannot go through resolveCssLengthToPx (rem/px only).
 * @param {string} cssValue - The tracking value, in `em` or an absolute unit.
 * @param {number} fontSize - The text's own size in px, which `em` resolves against.
 * @returns {number} Per-character tracking in px; 0 when there is no value.
 */
function resolveTrackingToPx(cssValue, fontSize) {
    if (!cssValue) return 0;

    const normalizedValue = cssValue.trim().toLowerCase();
    if (normalizedValue.endsWith('em') && !normalizedValue.endsWith('rem')) {
        const numericValue = Number.parseFloat(normalizedValue);
        return Number.isNaN(numericValue) ? 0 : numericValue * fontSize;
    }

    return resolveCssLengthToPx(normalizedValue, 0);
}

/**
 * Measures the pixel width of text using a cached canvas context.
 * @param {string} text - The label to measure.
 * @param {object} options - Typography to measure with, and the padding to add.
 * @param {number} [options.padding=12] - Added to the measured width, for the cell’s own padding.
 * @param {number} [options.fontSize] - Explicit px size. Callers that render text at a size
 *   the CSS token does not describe (e.g. task rings, which scale their text with the ring)
 *   must pass it, otherwise the text is measured at the token size and wrapped wrongly.
 * @param {string} [options.fontSizeVar='--fs-sm'] - CSS custom property read when no explicit size is given.
 * @param {string} [options.fontWeight='600'] - Weight to measure at.
 * @param {string} [options.fontFamily='system-ui, -apple-system, sans-serif'] - Family to measure at.
 * @param {string} [options.letterSpacing] - CSS length. Pass it when the rendered text is
 *   tracked out (e.g. table headers): over a long label the extra per-character width is
 *   what decides whether the text wraps.
 * @param {number} [options.fallbackFontSize=12] - Used when neither the explicit size nor the token resolves.
 * @returns {number} Width in px, padding included.
 */
export function measureHeaderWidth(text, options = {}) {
    const {
        padding = 12,
        fontSize: explicitFontSize,
        fontSizeVar = '--fs-sm',
        fontWeight = '600',
        fontFamily = 'system-ui, -apple-system, sans-serif',
        letterSpacing = '0px',
        fallbackFontSize = 12,
    } = options;

    if (!text) return padding;

    let fontSize = fallbackFontSize;
    if (
        typeof explicitFontSize === 'number' &&
        Number.isFinite(explicitFontSize) &&
        explicitFontSize > 0
    ) {
        fontSize = explicitFontSize;
    } else if (typeof document !== 'undefined') {
        const cssValue = getComputedStyle(document.documentElement)
            .getPropertyValue(fontSizeVar)
            ?.trim();
        if (cssValue) {
            fontSize = resolveCssLengthToPx(cssValue, fallbackFontSize);
        }
    }

    // No canvas means no document (the node test project) or an engine without 2d
    // support: estimate from the character count rather than throw, so a width this
    // module only ever feeds into layout stays plausible instead of taking the
    // caller down.
    const ctx = getMeasureContext();
    let textWidth;
    if (ctx) {
        ctx.font = `${fontWeight} ${fontSize}px ${fontFamily}`;
        textWidth = ctx.measureText(text).width;
    } else {
        textWidth = text.length * fontSize * AVERAGE_GLYPH_WIDTH_RATIO;
    }

    // Tracking is added arithmetically rather than through ctx.letterSpacing:
    // that property is a silent no-op in engines that predate it, so relying on it
    // would under-measure a long title by several pixels on exactly the engines
    // that still have to lay it out.
    const trackingWidth = text.length * resolveTrackingToPx(letterSpacing, fontSize);

    return Math.ceil(textWidth + trackingWidth + padding);
}
