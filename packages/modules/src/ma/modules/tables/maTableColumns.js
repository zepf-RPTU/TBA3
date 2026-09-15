/**
 * Shared MA table column builders.
 *
 * The item table and the per-student data table both render a "Nr." column for
 * the task number. This module keeps that column — together with the "show task"
 * preview trigger behind the number — in one place so the affordance is identical
 * across both MA tables.
 */

import { createItemNumberColumn } from '../../../common/tables/columnFactories.js';

/**
 * The single-task preview payload for an MA item/student-data row: the MA row shape
 * (`exerciseName`, item Aufgabenniveau) mapped onto the subject-agnostic payload an
 * `onItemPreview` handler receives.
 * @param {object} rowData - Tabulator row data
 * @returns {{number: string, title: string, domainLabel: string, level: string}} The preview payload.
 */
function toItemPreview(rowData) {
    return {
        number: rowData.name ?? '',
        title: rowData.exerciseName ?? '',
        domainLabel: rowData.domainLabel ?? '',
        level: rowData.competenceLevel || '',
    };
}

/**
 * Creates the MA "Nr." (item number) column. Given a handler, the cell renders the
 * number plus a "show task" button that hands the row's preview payload to it.
 * @param {((task: object) => void) | null} onItemPreview - Receives the preview payload; `null` renders no button.
 * @returns {object} Tabulator column definition
 */
export function createMaItemNumberColumn(onItemPreview) {
    return createItemNumberColumn({
        onShowTask: onItemPreview ? (rowData) => onItemPreview(toItemPreview(rowData)) : null,
    });
}
