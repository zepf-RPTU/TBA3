const PLACEHOLDER_PATTERN = /{{\s*([^{}]+?)\s*}}/g;
const PLACEHOLDER_CALL_PATTERN = /^([a-zA-Z][a-zA-Z0-9]*)\((.*)\)$/;

/**
 * Replace every `{{call(...)}}` placeholder in a template string. A placeholder the
 * resolver declines is left standing, so an unresolved one is visible in the UI rather
 * than silently blank.
 * @param {object} input - The text and the resolver to run over it.
 * @param {any} input.text - The template.
 * @param {Function} input.resolvePlaceholder - Resolves one parsed call to its replacement, or nothing to leave it in place.
 * @returns {string} The filled text.
 */
export function resolveInfoBoxTextPlaceholders({
    text,
    resolvePlaceholder,
} = /** @type {any} */ ({})) {
    const safeText = typeof text === 'string' ? text : String(text ?? '');
    if (!safeText.includes('{{') || typeof resolvePlaceholder !== 'function') {
        return safeText;
    }

    const resolutionState = {
        selections: new Map(),
    };

    return safeText.replace(PLACEHOLDER_PATTERN, (match, rawToken) => {
        const parsed = parseInfoBoxPlaceholderCall(rawToken);
        if (!parsed) {
            return match;
        }

        const resolved = resolvePlaceholder(parsed, {
            match,
            resolutionState,
        });
        return typeof resolved === 'string' ? resolved : match;
    });
}

/**
 * Parse one placeholder token into the call it names and its arguments.
 * @param {any} rawToken - The token between the braces.
 * @returns {object|null} The parsed call, or `null` when the token is not one.
 */
function parseInfoBoxPlaceholderCall(rawToken) {
    const source = typeof rawToken === 'string' ? rawToken.trim() : '';
    if (!source) {
        return null;
    }

    const match = source.match(PLACEHOLDER_CALL_PATTERN);
    if (!match) {
        return null;
    }

    return {
        name: match[1],
        params: parseInfoBoxPlaceholderParams(match[2]),
        source,
    };
}

/**
 * Parse a placeholder's argument list into a `key=value` map. Every value stays a
 * string; the handlers do their own reading.
 * @param {string} [rawParams] - The text between the parentheses.
 * @returns {object} The arguments; a segment without a key is dropped.
 */
function parseInfoBoxPlaceholderParams(rawParams = '') {
    return splitParamSegments(rawParams).reduce((params, segment) => {
        const separatorIndex = segment.indexOf('=');
        if (separatorIndex <= 0) {
            return params;
        }

        const key = segment.slice(0, separatorIndex).trim();
        const value = stripWrappingQuotes(segment.slice(separatorIndex + 1).trim());

        if (!key || !value) {
            return params;
        }

        params[key] = value;
        return params;
    }, {});
}

/**
 * Split an argument list on commas that are not inside quotes or brackets, so a value
 * may itself contain either.
 * @param {string} [rawParams] - The text between the parentheses.
 * @returns {string[]} The segments, in order.
 */
function splitParamSegments(rawParams = '') {
    const segments = [];
    let current = '';
    let quote = null;
    let depth = 0;

    for (const char of rawParams) {
        if (quote) {
            current += char;
            if (char === quote) {
                quote = null;
            }
            continue;
        }

        if (char === '"' || char === "'") {
            quote = char;
            current += char;
            continue;
        }

        if (char === '(' || char === '[' || char === '{') {
            depth += 1;
            current += char;
            continue;
        }

        if (char === ')' || char === ']' || char === '}') {
            depth = Math.max(0, depth - 1);
            current += char;
            continue;
        }

        if (char === ',' && depth === 0) {
            const segment = current.trim();
            if (segment) {
                segments.push(segment);
            }
            current = '';
            continue;
        }

        current += char;
    }

    const finalSegment = current.trim();
    if (finalSegment) {
        segments.push(finalSegment);
    }

    return segments;
}

/**
 * Remove one matched pair of surrounding quotes from an argument value.
 * @param {string} value - The raw value.
 * @returns {string} The value without its wrapping quotes.
 */
function stripWrappingQuotes(value) {
    if (value.length >= 2) {
        const firstChar = value[0];
        const lastChar = value[value.length - 1];
        if ((firstChar === '"' && lastChar === '"') || (firstChar === "'" && lastChar === "'")) {
            return value.slice(1, -1).trim();
        }
    }

    return value;
}
