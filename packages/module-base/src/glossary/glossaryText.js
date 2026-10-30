/** Helpers for resolving glossary-driven display text. */

import { escapeHtml } from '../utils/escapeHtml.js';
import { trustedFragment } from '../utils/trustedHtml.js';

/**
 * The assembled glossary, or any section of it: JSON nested by dot-path segment.
 * @typedef {{[segment: string]: any}} GlossaryTree
 */

/**
 * What makes a glossary term a keyboard control: a button its popup opens from, the
 * popup's state on `aria-expanded`. A term inside a control that takes focus itself
 * carries none of it.
 */
export const GLOSSARY_TERM_TAB_STOP = Object.freeze({
    role: 'button',
    tabindex: '0',
    'aria-expanded': 'false',
});

/**
 * Make a rendered term the keyboard control `GLOSSARY_TERM_TAB_STOP` describes.
 * @param {Element} term
 * @param {'0'|'-1'} [tabindex] - `'-1'` for a term its owner moves focus to by script
 *     (a table row's), which is a control but no tab stop.
 */
export function stampGlossaryTermTabStop(term, tabindex = '0') {
    for (const [name, value] of Object.entries(GLOSSARY_TERM_TAB_STOP)) {
        term.setAttribute(name, name === 'tabindex' ? tabindex : value);
    }
}

const TAB_STOP_ATTRS = Object.entries(GLOSSARY_TERM_TAB_STOP)
    .map(([name, value]) => ` ${name}="${value}"`)
    .join('');

/**
 * The markup that makes an element a glossary term: the class the popup layer, the CSS
 * and the export capture key on, and the entry key the popup opens. For string builders;
 * DOM builders set the same class and `dataset.glossaryKey`.
 * @param {string} key
 * @param {string} [className] - The element's own classes, set beside the term class.
 * @param {{focusable?: boolean}} [options] - `focusable: false` for a term inside a control that takes focus itself.
 * @returns {string} The `class` and `data-glossary-key` attributes, the key escaped, and the button role and tab stop its popup opens from.
 */
export function glossaryTermAttrs(key, className = '', { focusable = true } = {}) {
    const classes = className ? `${className} glossary-term` : 'glossary-term';
    return `class="${classes}" data-glossary-key="${escapeHtml(key)}"${focusable ? TAB_STOP_ATTRS : ''}`;
}

/**
 * Text whose runs name the glossary entry they link to, for a value the glossary must
 * not match as free text (a name from the data). A run without a key is plain text.
 * @typedef {ReadonlyArray<{text: string, glossaryKey?: string|null}>} GlossaryTextRuns
 */

/**
 * Text runs as markup: each run escaped, a keyed run as the term of its entry.
 * @param {GlossaryTextRuns} runs
 * @returns {string}
 */
export function glossaryRunsMarkup(runs) {
    return runs
        .map(({ text, glossaryKey }) =>
            glossaryKey
                ? `<span ${glossaryTermAttrs(glossaryKey)}>${escapeHtml(text)}</span>`
                : escapeHtml(text),
        )
        .join('');
}

/**
 * One glossary entry. Each field is named for the one slot it renders in.
 * @typedef {object} GlossaryEntry
 * @property {string} [title] - Card or control title.
 * @property {string} [subtitle] - Card subtitle; may carry markup.
 * @property {string} [body] - Card body; may carry markup.
 * @property {string} [label] - Control label.
 * @property {string} [tooltip] - Tooltip text.
 * @property {string} [description] - Navigation-card line.
 * @property {string} [tutorial] - Tour-card copy.
 * @property {{[key: string]: string}} [messages] - Sentences a card shows itself, keyed by situation (e.g. `empty`).
 * @property {Array<string|{text?: string, exact?: boolean}>} [aliases] - Terms the glossary matcher links to this entry; `exact` matches on word boundaries only.
 * @property {{[key: string]: GlossaryEntry}} [element_texts] - Entries for a card's sub-components, keyed by element.
 */

/**
 * The text of one of an entry's aliases, bare or `{text, exact}`.
 * @param {string|{text?: string, exact?: boolean}|null|undefined} alias - One `aliases` item.
 * @returns {string} Its text; '' for an object without one.
 */
export function aliasText(alias) {
    return typeof alias === 'string' ? alias : (alias?.text ?? '');
}

/**
 * Values substituted into `{{ token }}` placeholders, keyed by token name: text, or
 * runs that link parts of it to their entries.
 * @typedef {{[token: string]: string|number|GlossaryTextRuns|null|undefined}} GlossaryReplacements
 */

/** A `{{ token }}` placeholder; the group is the token name. */
const TOKEN_PATTERN = /\{\{\s*([^}]+?)\s*\}\}/g;

/**
 * @param {string|null|undefined} text - Glossary text; nullish yields ''.
 * @param {GlossaryReplacements | null} replacements - Token name to value; unknown tokens and nullish values resolve to an empty string.
 * @param {(value: string|number|GlossaryTextRuns) => string} encode - Turns each substituted value into text.
 * @returns {string}
 */
function substituteTokens(text, replacements, encode) {
    if (typeof text !== 'string' || !text) return text ?? '';
    if (!replacements || typeof replacements !== 'object') return text;

    return text.replace(TOKEN_PATTERN, (_match, token) => {
        const replacement = Object.hasOwn(replacements, token) ? replacements[token] : null;
        return replacement == null ? '' : encode(replacement);
    });
}

/**
 * Replace `{{ token }}` placeholders in a glossary string from a replacements map.
 * @param {string|null|undefined} text - Glossary text; nullish yields ''.
 * @param {GlossaryReplacements | null} [replacements] - Token name to value; unknown tokens and nullish values resolve to an empty string.
 * @returns {string}
 */
export function applyTemplateTokens(text, replacements = null) {
    return substituteTokens(text, replacements, (value) =>
        typeof value === 'object' ? value.map((run) => run.text).join('') : String(value),
    );
}

/**
 * Fill the named values into a glossary string and leave every other token in place, for
 * a later `applyTemplateTokens`/`applyMarkupTokens` to fill.
 * @param {string} text
 * @param {Readonly<{[token: string]: string}>} values - Token name to text.
 * @returns {string}
 */
export function fillKnownTokens(text, values) {
    return text.replace(TOKEN_PATTERN, (match, token) =>
        Object.hasOwn(values, token) ? values[token] : match,
    );
}

/**
 * `applyTemplateTokens` for glossary markup (a subtitle, a body, tour copy): the values
 * are text, so each goes in escaped, and a run that names its entry goes in as that
 * entry's term.
 * @param {string|null|undefined} text - Glossary markup; nullish yields ''.
 * @param {GlossaryReplacements | null} [replacements] - Token name to text value.
 * @returns {string}
 */
export function applyMarkupTokens(text, replacements = null) {
    return substituteTokens(text, replacements, (value) =>
        typeof value === 'object' ? glossaryRunsMarkup(value) : escapeHtml(value),
    );
}

/**
 * Resolve a dotted path (e.g. `"en.overview.header"`) against a root object.
 * Returns null as soon as any segment is missing or non-traversable.
 * @param {GlossaryTree | null} root
 * @param {string|null} dotPath
 * @returns {*}
 */
export function resolveDotPath(root, dotPath) {
    if (!root || !dotPath) return null;

    return dotPath.split('.').reduce((current, segment) => {
        if (current == null || typeof current !== 'object') return null;
        return current[segment] ?? null;
    }, root);
}

/**
 * Strip HTML tags from a string, returning trimmed text content. Parsed into a
 * `<template>`, whose content is inert: no image loads and no handler runs.
 * @param {unknown} value - Markup to flatten; non-strings yield an empty string.
 * @returns {string}
 */
export function stripHtmlToText(value) {
    if (typeof value !== 'string') return '';
    return trustedFragment(value).textContent?.trim() ?? '';
}

const MISSING_GLOSSARY_PREFIX = '[Missing glossary entry: ';

/**
 * The text a slot renders when its glossary entry is missing. Visible and naming the
 * path: the glossary is the single source of UI copy, so a missing entry is a content
 * bug to be seen and found.
 * @param {string|null|undefined} path - The entry's dot path.
 * @returns {string}
 */
export function missingGlossaryText(path) {
    return `${MISSING_GLOSSARY_PREFIX}${path || '<empty path>'}]`;
}

/**
 * Whether a text is the missing-entry marker, for a list that leaves such items out.
 * @param {unknown} text
 * @returns {boolean}
 */
export function isMissingGlossaryText(text) {
    return typeof text === 'string' && text.startsWith(MISSING_GLOSSARY_PREFIX);
}

/**
 * The title of a glossary entry — its `title` field. Every slot that shows an
 * entry's title resolves it through here so the rule is written once.
 * @param {unknown} entry - A glossary entry, or anything else (yields null).
 * @returns {string|null} The non-empty title, or null.
 */
export function resolveGlossaryTitle(entry) {
    if (!entry || typeof entry !== 'object' || !('title' in entry)) return null;
    const { title } = entry;
    return typeof title === 'string' && title.trim() ? title : null;
}

/**
 * The title of a glossary entry, or the missing-entry marker for its path.
 * @param {unknown} entry - A glossary entry, or anything else.
 * @param {string} path - The entry's dot path, named by the marker.
 * @returns {string}
 */
export function requireGlossaryTitle(entry, path) {
    return resolveGlossaryTitle(entry) ?? missingGlossaryText(path);
}
