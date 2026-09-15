/**
 * What a column definition becomes before Tabulator sees it: header-derived width
 * floors, the sorting/alignment/resizing defaults, glossary-annotated title and cell
 * formatters, and the app-only metadata stripped back off. Pure over the definitions
 * and the two settings it is given; TableModule runs it on build and on updateColumns.
 */

import { glossaryAnnotator } from '../../glossary/glossaryAnnotator.js';
import { createTitleFormatter, createCellFormatter } from '../glossaryFormatters.js';
import { extractColumnAppMeta } from '../columnFactories.js';
import { createHeaderFloorPass } from './tableHeaderGeometry.js';

/**
 * Process column definitions for Tabulator.
 * @param {Array<object>} columns - The definitions as the table module declared them.
 * @param {{excludedFields: Set<string>}} settings - The Set that collects the fields hidden from the column-visibility menu (cleared by the caller, never replaced: the menu holds this exact Set).
 * @returns {{definitions: Array<object>, headerSized: Array<object>}} The processed definitions and the columns whose header floor must follow the root font size.
 */
export function processColumnDefinitions(columns, { excludedFields }) {
    const titleFormatter = glossaryAnnotator.isInitialized ? createTitleFormatter() : null;
    // One measurement pass: derives the header-based floors and records the
    // columns whose floor must be re-derived when the root font size moves.
    const floorPass = createHeaderFloorPass();

    const processColumn = (column) => {
        const columnCopy = { ...column };
        const tableMeta = extractColumnAppMeta(columnCopy);
        const skipGlossaryAnnotation = tableMeta.skipGlossaryAnnotation === true;
        const skipHeaderGlossaryAnnotation =
            skipGlossaryAnnotation || tableMeta.skipHeaderGlossaryAnnotation === true;
        const skipCellGlossaryAnnotation =
            skipGlossaryAnnotation || tableMeta.skipCellGlossaryAnnotation === true;
        const excludeFromColumnVisibilityMenu = tableMeta.excludeFromColumnVisibilityMenu === true;

        if (excludeFromColumnVisibilityMenu && columnCopy.field) {
            excludedFields.add(columnCopy.field);
        }

        // Recursively process sub-columns in column groups
        if (Array.isArray(columnCopy.columns)) {
            columnCopy.columns = columnCopy.columns.map((sub) => processColumn(sub));
        }

        // Auto-calculate minWidth from header title if not explicitly set, so
        // columns are always wide enough to display their headers; a fixed
        // `width` is validated against the header text instead. Runs before
        // the headerSort default below: the pass reads it to pick the chrome.
        floorPass.apply(columnCopy);

        // Enable header sorting by default (unless explicitly disabled)
        if (!('headerSort' in columnCopy)) {
            columnCopy.headerSort = true;
        }

        // Columns are sized by the header-floor pass and fitColumns, never by drag:
        // Tabulator's own `resizableColumns: false` covers the table, this covers a
        // column definition that would otherwise inherit Tabulator's per-column default.
        if (!('resizable' in columnCopy)) {
            columnCopy.resizable = false;
        }

        // Ensure horizontal and vertical alignment defaults when not provided
        if (!('hozAlign' in columnCopy)) {
            columnCopy.hozAlign = 'center';
        }
        if (!('vertAlign' in columnCopy)) {
            columnCopy.vertAlign = 'middle';
        }

        // Mirror the column's cell alignment in its header. Tabulator only
        // aligns a header when the definition carries `headerHozAlign`, and
        // the header is a flex row (table-header-layout.css), so alignment
        // rides on a class instead: Tabulator copies `cssClass` onto the
        // header element as well as onto the cells. Column groups keep their
        // own centered layout.
        if (!Array.isArray(columnCopy.columns)) {
            columnCopy.cssClass = [columnCopy.cssClass, `header-align-${columnCopy.hozAlign}`]
                .filter(Boolean)
                .join(' ');
        }

        if (titleFormatter && !skipHeaderGlossaryAnnotation && !('titleFormatter' in columnCopy)) {
            columnCopy.titleFormatter = titleFormatter;
        }

        // Wrap cell formatter with glossary annotation for string-content columns.
        // Skip column groups (they have no formatter), hidden columns, and any
        // column that explicitly opts out via tableMeta.skipGlossaryAnnotation: true
        // or tableMeta.skipCellGlossaryAnnotation: true.
        if (
            glossaryAnnotator.isInitialized &&
            !skipCellGlossaryAnnotation &&
            !Array.isArray(columnCopy.columns)
        ) {
            const wrapped = createCellFormatter(columnCopy.formatter);
            if (wrapped !== null) {
                columnCopy.formatter = wrapped;
            }
        }

        // Filter options are app metadata now (see #tableFilters): they drive
        // the header filter menu, and must not reach Tabulator — a column that
        // still carried `headerFilter` would render a filter row in its header.
        delete columnCopy.headerFilter;
        delete columnCopy.headerFilterParams;
        delete columnCopy.headerFilterFunc;

        delete columnCopy.tableMeta;
        delete columnCopy.skipGlossaryAnnotation;
        delete columnCopy.skipHeaderGlossaryAnnotation;
        delete columnCopy.skipCellGlossaryAnnotation;
        delete columnCopy.excludeFromColumnVisibilityMenu;

        return columnCopy;
    };

    return {
        definitions: columns.map((column) => processColumn(column)),
        headerSized: floorPass.headerSized,
    };
}
