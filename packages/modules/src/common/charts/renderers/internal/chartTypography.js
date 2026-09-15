/**
 * How chart text finds its size: the CSS tokens chart text is sized by, and the probes
 * that turn a CSS length into pixels inside a given scope. ChartRenderer wraps these
 * with its per-render cache; nothing here holds state.
 */

const CHART_TEXT_SIZE_TOKENS = Object.freeze({
    sm: '--fs-sm',
    base: '--fs-base',
    lg: '--fs-lg',
});

/**
 * Resolve a CSS font-size value to pixels by probing it inside `scope`, so a
 * `var(--…)` token is read against the element that defines it.
 * @param {HTMLElement} scope - Where the probe is mounted; the custom properties in force there apply.
 * @param {string} fontSizeCssValue - A CSS length or a `var()` reference.
 * @returns {number} The size in px, or NaN when it cannot be resolved.
 */
export function probeFontSizePx(scope, fontSizeCssValue) {
    if (!fontSizeCssValue || typeof document === 'undefined' || !scope) {
        return NaN;
    }
    const probe = document.createElement('span');
    probe.style.position = 'absolute';
    probe.style.visibility = 'hidden';
    probe.style.pointerEvents = 'none';
    probe.style.fontSize = fontSizeCssValue;
    scope.appendChild(probe);
    const probedFontSize = parseFloat(getComputedStyle(probe).fontSize);
    probe.remove();
    return probedFontSize;
}

/**
 * The font size a chart container is rendering at, in px. Falls back to probing the
 * base token on the body when the container is not yet measurable, then to 16.
 * @param {HTMLElement|null} container - The chart's container element.
 * @returns {number} Font size in px.
 */
export function resolveContainerFontSize(container) {
    const liveFontSize = container ? parseFloat(getComputedStyle(container).fontSize) : NaN;
    if (Number.isFinite(liveFontSize) && liveFontSize > 0) {
        return liveFontSize;
    }
    if (document.body) {
        const probedFontSize = probeFontSizePx(document.body, 'var(--fs-base)');
        if (Number.isFinite(probedFontSize) && probedFontSize > 0) {
            return probedFontSize;
        }
    }
    return 16;
}

/**
 * The CSS value chart text of a size token is styled with.
 * @param {'sm'|'base'|'lg'} [size='base'] - Which chart text token.
 * @returns {string} A `var(--…)` reference.
 */
export function chartTextSizeCssValue(size = 'base') {
    const token = CHART_TEXT_SIZE_TOKENS[size] || CHART_TEXT_SIZE_TOKENS.base;
    return `var(${token})`;
}
