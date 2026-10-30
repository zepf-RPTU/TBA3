/**
 * The root font tokens text is measured and drawn with, as plain values: a canvas
 * `ctx.font` takes no `var()` reference. No theme or colour scheme sets them, so each
 * is read once per page.
 */

/** The weight tokens text is emphasised with; fallbacks mirror module-base's `styles/tokens.css`. */
const FONT_WEIGHT_TOKENS = Object.freeze({
    bold: { token: '--fw-bold', fallback: '700' },
    semibold: { token: '--fw-semibold', fallback: '600' },
});

/** Fallback when --font-family-main is unreadable: the stack variables.css declares. */
const FONT_FAMILY_FALLBACK =
    "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif";

/** @type {Record<string, string>} The font tokens already read. */
const fontTokens = {};

/**
 * A root token's value, read once.
 * @param {string} token
 * @param {string} fallback - Its value when unset.
 * @returns {string}
 */
function readFontToken(token, fallback) {
    fontTokens[token] ??=
        getComputedStyle(document.documentElement).getPropertyValue(token).trim() || fallback;
    return fontTokens[token];
}

/**
 * The page font stack, `--font-family-main`: what SVG text is set in and what text
 * is measured in.
 * @returns {string}
 */
export function fontFamilyToken() {
    return readFontToken('--font-family-main', FONT_FAMILY_FALLBACK);
}

/**
 * The numeric weight of a `--fw-*` token, read from the root: a number, not a `var()`
 * reference, so the same value styles text and sets a canvas `ctx.font`.
 * @param {'bold'|'semibold'} weight
 * @returns {string} The weight, e.g. `'700'`.
 */
export function fontWeightToken(weight) {
    const { token, fallback } = FONT_WEIGHT_TOKENS[weight];
    return readFontToken(token, fallback);
}
