import { glossaryAnnotator } from '../../../common/glossary/glossaryAnnotator.js';
import { createColumnDef } from '../../../common/tables/columnFactories.js';
import { COLUMN_GROW_RATIOS } from '../../../common/tables/columnWidthConstants.js';

/**
 * Sorts styles according to the order registered from API data.
 * @param {Array} styles - Array of style strings
 * @param {Array<{value: string, fieldName: string, label: string}>} [styleCategories] - Aufgabenniveau vocabulary in priority order; an unregistered style sorts after all of them.
 * @returns {Array} Sorted array of styles
 */
export function sortStylesByPriority(styles, styleCategories = []) {
    const cats = styleCategories;
    return styles.sort((a, b) => {
        const indexA = cats.findIndex((c) => c.value === a);
        const indexB = cats.findIndex((c) => c.value === b);
        const priorityA = indexA === -1 ? cats.length : indexA;
        const priorityB = indexB === -1 ? cats.length : indexB;
        return priorityA - priorityB;
    });
}

/**
 * Formatter for the combined styles column.
 * Returns an HTML string for faster Tabulator cell rendering.
 * @param {object} cell - Tabulator cell object
 * @param {Array<{value: string, fieldName: string, label: string}>} styleCategories - Aufgabenniveau vocabulary in priority order.
 * @returns {string} HTML string for the cell
 */
function formatStylesColumn(cell, styleCategories) {
    const styles = cell.getValue() || [];
    if (!Array.isArray(styles) || styles.length === 0) {
        return '';
    }

    const sortedStyles = sortStylesByPriority([...styles], styleCategories);
    const parts = ['<div class="en-styles-cell">'];
    for (let i = 0; i < sortedStyles.length; i++) {
        const style = sortedStyles[i];
        const content = glossaryAnnotator.annotateHTML(style);
        parts.push(`<div class="en-styles-cell-item">${content}</div>`);
    }

    parts.push('</div>');
    return parts.join('');
}

/**
 * Style-priority index for a single style value (categories registered from API data).
 * Unregistered styles sort after all known categories.
 * @param {string} style - The style value to rank.
 * @param {Array<{value: string, fieldName: string, label: string}>} styleCategories - Aufgabenniveau vocabulary in priority order.
 * @returns {number} Its index, or the category count for an unregistered style so it sorts last.
 */
function styleCategoryIndex(style, styleCategories) {
    const cats = styleCategories;
    const index = cats.findIndex((c) => c.value === style);
    return index === -1 ? cats.length : index;
}

/**
 * Creates the EN "Stile" column shared by the item table and the per-student
 * data table. The list filter is derived from the styles present in `data`,
 * matching is array-membership, sorting is by the row's primary (highest
 * priority) style, and cells render via formatStylesColumn.
 * @param {Array} data - Processed rows carrying `combinedStyles` / `primaryStyle`
 * @param {object} [options={}] - Per-table adjustments to the shared column.
 * @param {Array} [options.styleCategories=[]] - Style categories in priority order (from EnConfig)
 * @param {string} [options.title='Stile'] - Column header text
 * @param {number} [options.widthGrow=COLUMN_GROW_RATIOS.style] - Responsive grow ratio
 * @returns {object} Tabulator column definition
 */
export function createStylesColumn(
    data,
    { styleCategories = [], title = 'Stile', widthGrow = COLUMN_GROW_RATIOS.style } = {},
) {
    return createColumnDef(title, 'combinedStyles', {
        headerFilter: 'list',
        headerFilterParams: function () {
            const allStyles = new Set();
            data.forEach((item) => {
                if (Array.isArray(item.combinedStyles)) {
                    item.combinedStyles.forEach((style) => allStyles.add(style));
                }
            });
            const values = { '': 'Alle' };
            sortStylesByPriority(Array.from(allStyles), styleCategories).forEach((style) => {
                values[style] = style;
            });
            return { values };
        },
        headerFilterFunc: function (headerValue, rowValue) {
            if (!headerValue || !rowValue) return true;
            return Array.isArray(rowValue) ? rowValue.includes(headerValue) : false;
        },
        widthGrow,
        hozAlign: 'center',
        formatter: (cell) => formatStylesColumn(cell, styleCategories),
        // The field holds an array, which the download would otherwise stringify
        // to '["A","B"]'. Sorted like the cell so both read the same order.
        accessorDownload: (value) =>
            Array.isArray(value)
                ? sortStylesByPriority([...value], styleCategories).join(', ')
                : '',
        sorter: function (a, b, aRow, bRow) {
            return (
                styleCategoryIndex(aRow.getData().primaryStyle || '', styleCategories) -
                styleCategoryIndex(bRow.getData().primaryStyle || '', styleCategories)
            );
        },
    });
}
