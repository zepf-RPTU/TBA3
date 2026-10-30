const PLACEHOLDER_PATTERN = /{{\s*([^{}]+?)\s*}}/g;
const PLACEHOLDER_CALL_PATTERN = /^([a-zA-Z][a-zA-Z0-9]*)\((.*)\)$/;

/**
 * A placeholder's arguments by key; every value stays the string the template wrote.
 * @typedef {{[key: string]: string}} PlaceholderParams
 */

/**
 * One parsed `{{call(...)}}` placeholder.
 * @typedef {object} PlaceholderCall
 * @property {string} name
 * @property {PlaceholderParams} params
 */

/**
 * One piece of a template: literal text, or a `{{…}}` token with the call it parses to
 * (`null` when the token is not call syntax).
 * @typedef {{text: string} | {call: PlaceholderCall|null, source: string}} TemplatePiece
 */

/**
 * Split a template string into its literal text and its `{{call(...)}}` placeholders, in
 * order.
 * @param {string} text
 * @returns {TemplatePiece[]} Empty literal text between tokens is left out.
 */
export function parseInfoBoxText(text) {
    /** @type {TemplatePiece[]} */
    const pieces = [];
    let lastIndex = 0;

    for (const match of text.matchAll(PLACEHOLDER_PATTERN)) {
        if (match.index > lastIndex) {
            pieces.push({ text: text.slice(lastIndex, match.index) });
        }
        const source = match[1].trim();
        pieces.push({ call: parseInfoBoxPlaceholderCall(source), source });
        lastIndex = match.index + match[0].length;
    }

    if (lastIndex < text.length) {
        pieces.push({ text: text.slice(lastIndex) });
    }

    return pieces;
}

/**
 * Parse one placeholder token into the call it names and its arguments.
 * @param {string} source - The trimmed token between the braces.
 * @returns {PlaceholderCall|null} `null` when the token is not call syntax.
 */
function parseInfoBoxPlaceholderCall(source) {
    const match = source.match(PLACEHOLDER_CALL_PATTERN);
    return match ? { name: match[1], params: parseInfoBoxPlaceholderParams(match[2]) } : null;
}

/**
 * Parse a placeholder's argument list (`key=value, key=value`) into a map.
 * @param {string} rawParams - The text between the parentheses.
 * @returns {PlaceholderParams} A segment without a key or value is dropped.
 */
function parseInfoBoxPlaceholderParams(rawParams) {
    /** @type {PlaceholderParams} */
    const params = {};
    for (const segment of rawParams.split(',')) {
        const separatorIndex = segment.indexOf('=');
        const key = segment.slice(0, separatorIndex).trim();
        const value = segment.slice(separatorIndex + 1).trim();
        if (separatorIndex > 0 && key && value) {
            params[key] = value;
        }
    }
    return params;
}
