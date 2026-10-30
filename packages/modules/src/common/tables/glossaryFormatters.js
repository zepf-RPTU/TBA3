/**
 * Tabulator `titleFormatter` and cell `formatter` wrappers that annotate their string
 * output with glossary term spans.
 */

import { escapeHtml } from '@tba3/module-base';
import { glossaryTermAttrs } from '@tba3/module-base/glossary';

/** @typedef {import('../glossary/glossaryAnnotator.js').GlossaryAnnotator} GlossaryAnnotator */

/**
 * A cell's terms are no tab stops: one per row floods the tab order. The keyboard
 * reaches them from their row (installRowKeyboard), which makes each one a button when
 * it first takes focus.
 */
const CELL_TERMS = { focusable: false };

/**
 * Create the Tabulator titleFormatter that annotates column header titles.
 * @param {GlossaryAnnotator} glossary
 * @returns {(cell: import('tabulator-tables').CellComponent) => unknown} Its result is the annotated title, or a non-string value unchanged.
 */
export function createTitleFormatter(glossary) {
    return (cell) => {
        const title = cell.getValue();
        // A sortable header is a tab stop itself: its terms are not a second one.
        return typeof title === 'string'
            ? glossary.annotateHTML(title, undefined, { focusable: false })
            : title;
    };
}

/**
 * Create a Tabulator titleFormatter that stamps one explicit glossary key on the whole
 * title, for a header that must resolve to a specific entry (`tableMeta.headerGlossaryKey`;
 * `processColumnDefinitions` installs it under the same gate as free-text annotation).
 * Same markup `annotateHTML` produces.
 * @param {string} glossaryKey
 * @returns {import('./columnFactories.js').TableCellFormatter}
 */
export function createGlossaryKeyTitleFormatter(glossaryKey) {
    return (cell) => {
        const title = cell.getValue();
        if (!title || typeof title !== 'string') return title;
        return `<span ${glossaryTermAttrs(glossaryKey, '', { focusable: false })}>${escapeHtml(title)}</span>`;
    };
}

/**
 * Wrap a Tabulator cell formatter so its string output is annotated.
 *
 * Handles:
 *  - Custom function formatters: wraps the return value
 *  - `'plaintext'` / no formatter: HTML-escapes first, then annotates (Tabulator's
 *    own default is `plaintext` too: a payload string never renders as markup); a
 *    value holding no term comes back as a text node
 *  - Other built-in formatter strings (progress, star, etc.): returns null
 * @param {GlossaryAnnotator} glossary
 * @param {import('./columnFactories.js').TableCellFormatter|string|undefined} formatter - The column's own formatter, or the built-in name it asked for.
 * @returns {import('./columnFactories.js').TableCellFormatter|null} An annotating wrapper, or null for built-ins whose output is not text.
 */
export function createCellFormatter(glossary, formatter) {
    if (typeof formatter === 'function') {
        return (cell, formatterParams, onRendered) => {
            const result = formatter(cell, formatterParams, onRendered);
            if (typeof result !== 'string') return result;
            return glossary.annotateHTML(result, undefined, CELL_TERMS);
        };
    }

    if (formatter === 'plaintext' || formatter == null) {
        return (cell) => {
            const val = cell.getValue();
            if (val == null) return '';
            const escaped = escapeHtml(val);
            const annotatedHtml = glossary.annotateHTML(escaped, undefined, CELL_TERMS);
            // No term matched: the text as a node, without a markup parse per cell.
            return annotatedHtml === escaped ? document.createTextNode(String(val)) : annotatedHtml;
        };
    }

    return null;
}
