/**
 * Glossary Tabulator formatters.
 *
 * Wraps Tabulator `titleFormatter` and cell `formatter` functions so that
 * their string output is automatically annotated with glossary term spans.
 *
 * Used exclusively by TableModule to decorate columns when the glossary
 * annotator is initialized.
 */

import { glossaryAnnotator } from '../glossary/glossaryAnnotator.js';

/**
 * Create a Tabulator titleFormatter that annotates column header titles.
 * @returns {Function} A Tabulator titleFormatter that annotates glossary terms found in the header text.
 */
export function createTitleFormatter() {
    return (cell) => {
        const title = cell.getValue();
        if (!title || typeof title !== 'string') return title;
        return glossaryAnnotator.annotateHTML(title);
    };
}

/**
 * Create a Tabulator titleFormatter that stamps one explicit glossary key on the whole
 * title, for a header that must resolve to a specific entry. Same markup `annotateHTML`
 * produces, so the popup delegation and the `.glossary-term` styling apply unchanged.
 * Falls back to the plain title when the annotator is not initialized, so a table built
 * without a glossary shows no dead underline.
 *
 * Note this **overrides** free-text annotation for that header rather than supplying one
 * where none existed: an explicit `titleFormatter` suppresses the default
 * `createTitleFormatter()` (see TableModule#processColumns), so a title whose wording is
 * already an alias stops resolving to the entry that alias names. Only reach for this
 * when that is what you want.
 * @param {string} glossaryKey - The entry the whole header should resolve to.
 * @returns {Function} A Tabulator titleFormatter stamping that one key; falls back to the plain title when the annotator is down.
 */
export function createGlossaryKeyTitleFormatter(glossaryKey) {
    return (cell) => {
        const title = cell.getValue();
        if (!title || typeof title !== 'string' || !glossaryAnnotator.isInitialized) return title;
        return `<span class="glossary-term" data-glossary-key="${glossaryKey}">${title}</span>`;
    };
}

/**
 * Wrap a Tabulator cell formatter so its string output is annotated.
 *
 * Handles:
 *  - Custom function formatters — wraps the return value
 *  - `'html'` / no formatter — annotates the raw cell value as HTML
 *  - `'plaintext'` — HTML-escapes first, then annotates
 *  - Other built-in formatter strings (progress, star, etc.) — returns null
 *
 * Column definitions can opt out via `tableMeta.skipGlossaryAnnotation: true`
 * or the more specific `tableMeta.skipCellGlossaryAnnotation: true`.
 * TableModule.processColumn consumes and strips that app-only metadata before
 * the column definition reaches Tabulator.
 * @param {Function|string|undefined} formatter - The column's own formatter, or the built-in name it asked for.
 * @returns {Function|null} An annotating wrapper, or null for built-ins whose output is not text.
 */
export function createCellFormatter(formatter) {
    if (typeof formatter === 'function') {
        return (cell, formatterParams, onRendered) => {
            const result = formatter(cell, formatterParams, onRendered);
            if (typeof result !== 'string') return result;
            return glossaryAnnotator.annotateHTML(result);
        };
    }

    if (formatter === 'html' || formatter == null) {
        return (cell) => {
            const val = cell.getValue();
            if (val == null) return '';
            return glossaryAnnotator.annotateHTML(String(val));
        };
    }

    if (formatter === 'plaintext') {
        const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
        return (cell) => {
            const val = cell.getValue();
            if (val == null) return '';
            const escaped = String(val).replace(/[&<>"']/g, (c) => ESC[c]);
            return glossaryAnnotator.annotateHTML(escaped);
        };
    }

    return null;
}
