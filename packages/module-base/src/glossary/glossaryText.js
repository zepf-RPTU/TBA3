/**
 * Helpers for resolving glossary-driven display text.
 *
 * Shared by the header orchestrator (`headerOrchestrator.js` — header glossary
 * resolution), the sidebar module (`sidebarModule.js` — navigation-button
 * labels), `contentModule.js` and the tour-card resolver
 * (`modules/tutorial/glossaryTutorial.js`). Kept here so every consumer
 * references one copy.
 */

/**
 * Replace `{{ token }}` placeholders in a glossary string from a replacements
 * map. Unknown tokens resolve to an empty string.
 * @param {*} text - Glossary text (non-strings pass through as '')
 * @param {object | null} [replacements] - Token name to value; unknown tokens resolve to an empty string.
 * @returns {*} The substituted string, or `text ?? ''` when it is not a string
 */
export function applyTemplateTokens(text, replacements = null) {
    if (typeof text !== 'string' || !text) return text ?? '';
    if (!replacements || typeof replacements !== 'object') return text;

    return text.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_match, token) => {
        const replacement = replacements[token];
        return replacement == null ? '' : String(replacement);
    });
}

/**
 * Resolve a dotted path (e.g. `"en.overview.header"`) against a root object.
 * Returns null as soon as any segment is missing or non-traversable.
 * @param {object | null} root - The tree to walk.
 * @param {string|null} dotPath - Dotted path into it.
 * @returns {*} The resolved value, or null.
 */
export function resolveDotPath(root, dotPath) {
    if (!root || !dotPath) return null;

    return dotPath.split('.').reduce((current, segment) => {
        if (current == null || typeof current !== 'object') return null;
        return current[segment] ?? null;
    }, root);
}

/**
 * Strip HTML tags from a string, returning collapsed, trimmed text content.
 * Uses the DOM when available (accurate entity decoding), with a regex fallback
 * for non-DOM environments.
 * @param {*} value - Markup to flatten; non-strings yield an empty string.
 * @returns {string} The text content, collapsed and trimmed.
 */
export function stripHtmlToText(value) {
    if (typeof value !== 'string') return '';

    if (typeof document !== 'undefined') {
        const container = document.createElement('div');
        container.innerHTML = value;
        return container.textContent?.trim() ?? '';
    }

    return value
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * The text a slot renders when its glossary entry has no title. Deliberately
 * visible: the glossary is the single source of UI copy, so a missing title is a
 * content bug to be seen, not papered over by a literal in code.
 */
export const MISSING_GLOSSARY_TITLE = 'MISSING FROM GLOSSARY';

/**
 * The title of a glossary entry — its `title` field. Every slot that shows an
 * entry's title resolves it through here so the rule is written once.
 * @param {*} entry - A glossary entry, or anything else (yields null).
 * @returns {string|null} The non-empty title, or null.
 */
export function resolveGlossaryTitle(entry) {
    if (!entry || typeof entry !== 'object') return null;
    const title = entry.title ?? null;
    return typeof title === 'string' && title.trim() ? title : null;
}
