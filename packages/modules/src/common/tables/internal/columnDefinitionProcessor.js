/**
 * What a column definition becomes before Tabulator sees it: header-derived width
 * floors, the sorting/alignment/resizing defaults, glossary-annotated title and cell
 * formatters that hand Tabulator a parsed node, and the app-only metadata stripped back
 * off. It runs on every build and on every column swap.
 */

import { trustedFragment } from '@tba3/module-base';
import { missingGlossaryText } from '@tba3/module-base/glossary';
import {
    createTitleFormatter,
    createCellFormatter,
    createGlossaryKeyTitleFormatter,
} from '../glossaryFormatters.js';
import { createHeaderFloorPass } from './tableHeaderGeometry.js';
import { groupedColumnTitle } from './tableFilterMetadata.js';

/** @typedef {import('../columnFactories.js').TableColumnDefinition} TableColumnDefinition */
/** @typedef {import('../columnFactories.js').TableCellFormatter} TableCellFormatter */

/**
 * Tabulator writes a formatter's string with a raw `innerHTML`, where the page's
 * sanitizing `default` Trusted Types policy would re-parse every cell; a node it
 * appends. So our markup goes in as our own: parsed once through `trustedFragment`,
 * which also sets the `cssVarsAttr` values (cells and the export clone alike).
 * @param {TableCellFormatter} formatter - A formatter that may return markup.
 * @returns {TableCellFormatter} The same formatter, returning a node for markup.
 */
function nodeFormatter(formatter) {
    return (cell, formatterParams, onRendered) => {
        const result = formatter(cell, formatterParams, onRendered);
        return typeof result === 'string' ? trustedFragment(result) : result;
    };
}

/**
 * A column that highlights its sort steps' labels inside its title must carry every one:
 * otherwise the highlight silently does nothing (`progressBarSorting.js`).
 * @param {TableColumnDefinition} column
 * @param {import('../columnFactories.js').ColumnTableMeta} tableMeta
 * @throws {Error} for a title that lacks a step's label
 */
function assertSortLabelsInTitle(column, tableMeta) {
    const title = column.title ?? '';
    const missing = (tableMeta.progressBarSortSteps ?? []).find(
        (step) => !title.includes(step.label),
    );
    if (missing) {
        throw new Error(
            `Column '${column.field}': title '${title}' lacks the sort-step label '${missing.label}'`,
        );
    }
}

/**
 * Process column definitions for Tabulator.
 * @param {TableColumnDefinition[]} columns
 * @param {object} settings
 * @param {Set<string>} settings.excludedFields - The Set that collects the fields hidden from the column-visibility menu (cleared by the caller, never replaced: the menu holds this exact Set).
 * @param {{headerSort?: boolean, hozAlign?: string}} settings.columnDefaults - The table's `columnDefaults`: Tabulator applies them to every column, so the floors and the header alignment class must read them too.
 * @param {import('../../glossary/glossaryAnnotator.js').GlossaryAnnotator} settings.glossary - An uninitialized one annotates nothing.
 * @param {() => ReadonlyArray<{[field: string]: any}>} [settings.rows] - The rows the table is built with, read only for a column sized by its cells (`cellWords`), and once per pass.
 * @returns {{definitions: import('tabulator-tables').ColumnDefinition[], headerSized: import('./tableHeaderGeometry.js').HeaderSizedColumn[]}} `headerSized`: the columns whose header floor must follow the root font size.
 */
export function processColumnDefinitions(
    columns,
    { excludedFields, columnDefaults, glossary, rows = () => [] },
) {
    // One measurement pass: derives the header-based floors and records the
    // columns whose floor must be re-derived when the root font size moves.
    const floorPass = createHeaderFloorPass();
    /** @type {ReadonlyArray<{[field: string]: any}>|undefined} */
    let builtRows;
    const tableRows = () => (builtRows ??= rows());
    const titleFormatter = createTitleFormatter(glossary);
    // Tabulator finds a column by its field: of two columns on one field, `getColumn`
    // answers with one, and the other's visibility, sort and export follow it.
    /** @type {Set<string>} */
    const leafFields = new Set();

    /**
     * @param {TableColumnDefinition} column
     * @param {string} [groupTitle] - The title of the column group it sits in, if any.
     * @returns {TableColumnDefinition} The processed copy.
     */
    const processColumn = (column, groupTitle) => {
        const columnCopy = { ...column };
        const tableMeta = columnCopy.tableMeta ?? {};
        // A column that names its header's entry and no title of its own takes the
        // entry's short label: one wording for the header, the column menu and the export.
        if (columnCopy.title === undefined && tableMeta.headerGlossaryKey) {
            columnCopy.title =
                glossary.getEntry(tableMeta.headerGlossaryKey)?.label ??
                missingGlossaryText(`${tableMeta.headerGlossaryKey}.label`);
        }
        // A download flattens the column groups, so a grouped column names its group.
        if (groupTitle) {
            columnCopy.titleDownload = groupedColumnTitle(
                groupTitle,
                columnCopy.titleDownload ?? columnCopy.title,
            );
        }
        const skipGlossaryAnnotation = tableMeta.skipGlossaryAnnotation === true;
        const skipCellGlossaryAnnotation =
            skipGlossaryAnnotation || tableMeta.skipCellGlossaryAnnotation === true;
        const excludeFromColumnVisibilityMenu = tableMeta.excludeFromColumnVisibilityMenu === true;

        if (excludeFromColumnVisibilityMenu && columnCopy.field) {
            excludedFields.add(columnCopy.field);
        }

        const subColumns = columnCopy.columns;
        const isGroup = Array.isArray(subColumns);
        if (isGroup) {
            columnCopy.columns = subColumns.map((sub) => processColumn(sub, columnCopy.title));
        } else if (columnCopy.field) {
            if (leafFields.has(columnCopy.field)) {
                throw new Error(`Two columns share the field '${columnCopy.field}'`);
            }
            leafFields.add(columnCopy.field);
        }

        if (!('hozAlign' in columnCopy)) {
            columnCopy.hozAlign = columnDefaults.hozAlign ?? 'center';
        }

        // Sortability is Tabulator's own resolution: the column, then columnDefaults,
        // then its default (sortable). A group header has no indicator. It decides
        // the header chrome the floor reserves.
        const sortable = !isGroup && (columnCopy.headerSort ?? columnDefaults.headerSort ?? true);
        if (tableMeta.progressBarSortLabelsInTitle) assertSortLabelsInTitle(columnCopy, tableMeta);
        floorPass.apply(columnCopy, sortable, {
            cellWords: tableMeta.cellWords?.(tableRows()),
            sortLabels: tableMeta.progressBarSortSteps?.map((step) => step.label),
        });

        // The header mirrors the column's cell alignment through a class: Tabulator
        // only aligns a header that carries `headerHozAlign`, the header is a flex
        // row (table-header-layout.css), and Tabulator copies `cssClass` onto the
        // header element as well as onto the cells. Column groups keep their own
        // centred layout.
        if (!isGroup) {
            columnCopy.cssClass = [columnCopy.cssClass, `header-align-${columnCopy.hozAlign}`]
                .filter(Boolean)
                .join(' ');
        }

        if (
            glossary.isInitialized &&
            !skipGlossaryAnnotation &&
            !('titleFormatter' in columnCopy)
        ) {
            columnCopy.titleFormatter = tableMeta.headerGlossaryKey
                ? createGlossaryKeyTitleFormatter(tableMeta.headerGlossaryKey)
                : titleFormatter;
        }

        // Column groups have no formatter to wrap.
        if (glossary.isInitialized && !skipCellGlossaryAnnotation && !isGroup) {
            const wrapped = createCellFormatter(glossary, columnCopy.formatter);
            if (wrapped !== null) {
                columnCopy.formatter = wrapped;
            }
        }

        if (typeof columnCopy.formatter === 'function') {
            columnCopy.formatter = nodeFormatter(columnCopy.formatter);
        }

        // Filter options drive the header filter menu (see TableFilterController)
        // and must not reach Tabulator, which would render a filter row.
        delete columnCopy.headerFilter;
        delete columnCopy.headerFilterParams;

        delete columnCopy.tableMeta;

        return columnCopy;
    };

    return {
        // The boundary to Tabulator: `tableMeta` is stripped and every formatter wrapped,
        // so what is left is Tabulator's own column options.
        definitions: /** @type {import('tabulator-tables').ColumnDefinition[]} */ (
            columns.map((column) => processColumn(column))
        ),
        headerSized: floorPass.headerSized,
    };
}
