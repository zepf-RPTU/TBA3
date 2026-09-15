/**
 * Shared EN table column builders.
 *
 * The item table and the per-student data table both render a "Nr." column whose
 * value is prefixed with a single-letter domain abbreviation (e.g. "H-01") while
 * in the combined 'all' mode, and unprefixed once a single domain is selected.
 * This module keeps that mode-aware formatter/sorter in one place; the prefix rule
 * itself lives in `enDomainPrefix.js`.
 */

import { createItemNumberColumn as createSharedItemNumberColumn } from '../../../common/tables/columnFactories.js';
import { withDomainPrefix } from '../../utils/enDomainPrefix.js';

/**
 * The single-task preview payload for an EN item/student-data row: the EN row shape
 * (`exercise.name`, `competenceLevel`, `combinedStyles`) mapped onto the
 * subject-agnostic payload an `onItemPreview` handler receives.
 * @param {object} rowData - Tabulator row data
 * @returns {{number: string, title: string, domainLabel: string, level: string, styles: Array<string>}} The preview payload.
 */
function toItemPreview(rowData) {
    return {
        number: withDomainPrefix(rowData.name, rowData.domainLabel),
        title: rowData.exercise?.name ?? '',
        domainLabel: rowData.domainLabel ?? '',
        level: rowData.competenceLevel || '',
        styles: rowData.combinedStyles ?? rowData.style ?? [],
    };
}

/**
 * Creates the mode-aware "Nr." (item number) column shared by the EN item and
 * student-data tables. In 'all' mode the value is prefixed with the domain
 * abbreviation; otherwise it is shown as-is. Sorting uses the prefixed value for
 * every row in 'all' mode — task-parent rows included, although they display
 * unprefixed — so the column clusters by domain rather than interleaving
 * Hören and Lesen tasks by number.
 * @param {() => string} getMode - Thunk returning the live mode ('all' | domain id)
 * @param {object} [options={}] - Per-table adjustments to the shared column.
 * @param {string} [options.title='Nr.'] - Column header text
 * @param {boolean} [options.includeTaskRow=false] - When true, task-grouping parent
 *   rows (`isTaskRow`) are rendered without a domain prefix (item table task mode).
 * @param {((task: object) => void) | null} [options.onItemPreview] - When provided, a "show
 *   task" button is added to the number (skipped for task-parent rows) that hands the row's
 *   preview payload to this handler.
 * @returns {object} Tabulator column definition
 */
export function createItemNumberColumn(
    getMode,
    { title = 'Nr.', includeTaskRow = false, onItemPreview = null } = {},
) {
    const isTaskRow = (rowData) => includeTaskRow && rowData.isTaskRow;
    return createSharedItemNumberColumn({
        title,
        getDisplayName: (name, rowData) =>
            !isTaskRow(rowData) && getMode() === 'all'
                ? withDomainPrefix(name, rowData.domainLabel)
                : name,
        getSortKey: (name, rowData) =>
            getMode() === 'all' ? withDomainPrefix(name, rowData.domainLabel) : name,
        // Task-parent aggregate rows have no single task to preview.
        isPreviewable: (rowData) => !isTaskRow(rowData),
        onShowTask: onItemPreview ? (rowData) => onItemPreview(toItemPreview(rowData)) : null,
    });
}
