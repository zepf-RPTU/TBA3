/**
 * The text patterns of the comment and icon rules, in one place: the JavaScript lint and
 * the stylesheet/HTML check must match the same text.
 */

/** The removed Material Icons font, by class or family name. */
export const ICON_FONT_PATTERN = /material-icons|Material Icons/;

/** An emoji, or the variation selector that renders a glyph as one. */
export const EMOJI_PATTERN = /[\u{1F000}-\u{1FAFF}]|\u{FE0F}/u;

/** A pointer to a document: a `.md` path, a `docs/` path or a numbered section (`§4.16`). */
export const DOC_REFERENCE_PATTERN = /\.md\b|\bdocs\/|§\s*\d/;

/**
 * @param {string} line - One line of a comment.
 * @returns {boolean} Whether it carries a TODO/FIXME/HACK marker without the ASSUMPTION-<id> it rests on.
 */
export function isUntrackedMarker(line) {
    return /\b(?:TODO|FIXME|HACK)\b/.test(line) && !/ASSUMPTION-/.test(line);
}
