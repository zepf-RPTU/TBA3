/**
 * Shared base for group overview tables, one row per student. The subclass supplies the
 * remaining columns and the student records.
 */

import { TableModule } from './tableModule.js';
import { COLUMN_GROW_RATIOS } from './columnWidthConstants.js';
import {
    createColumnDef,
    createGenderColumn,
    createStudentIdLinkColumn,
    createTraitsColumn,
} from './columnFactories.js';

/** @type {ReadonlyArray<import('tabulator-tables').Sorter>} */
const GROUP_TABLE_DEFAULT_SORT = Object.freeze([{ column: 'lastName', dir: 'asc' }]);

/**
 * @typedef {import('./tableModule.js').TableOptions & {
 *   onStudentSelected?: (studentId: string) => void,
 * }} BaseGroupTableOptions
 */

/**
 * @template {BaseGroupTableOptions} [O=BaseGroupTableOptions]
 * @augments {TableModule<O>}
 */
export class BaseGroupTableModule extends TableModule {
    /**
     * The table's full column definitions.
     * @abstract
     * @returns {import('./columnFactories.js').TableColumnDefinition[]}
     */
    _getColumns() {
        throw new Error(`${this.constructor.name} must implement _getColumns()`);
    }

    /**
     * The table's rows, one per student, read from the `documents` store.
     * @abstract
     * @returns {Array<{[field: string]: any}>}
     */
    _readStudentRecords() {
        throw new Error(`${this.constructor.name} must implement _readStudentRecords()`);
    }

    // ========================================================================
    // LIFECYCLE
    // ========================================================================

    /**
     * @override
     * @returns {Promise<void>}
     */
    async _renderBody() {
        await this._reloadRows();
    }

    /**
     * Show the current student records, with the current columns (`setRows`).
     * @protected
     * @returns {Promise<void>}
     */
    async _reloadRows() {
        await this.setRows(this._readStudentRecords(), {
            columns: this._getColumns(),
            initialSort: GROUP_TABLE_DEFAULT_SORT,
        });
    }

    /**
     * The columns every group table opens with: id link, names, gender and Merkmale,
     * the last two filterable. A link click hands the id to `onStudentSelected`. Names
     * are never glossary terms, so they skip annotation.
     * @protected
     * @param {string|((rowData: {[field: string]: any}) => string)} linkTooltip - The id link's tooltip, or the tooltip of one row.
     * @param {ReadonlyMap<string, string>} traitLabels - The subject catalog's `TRAIT_LABELS`.
     * @returns {import('./columnFactories.js').TableColumnDefinition[]}
     */
    _createIdentityColumns(linkTooltip, traitLabels) {
        const nameOptions = {
            hozAlign: /** @type {const} */ ('left'),
            headerFilter: 'input',
            widthGrow: COLUMN_GROW_RATIOS.medium,
            tableMeta: { skipGlossaryAnnotation: true },
            formatter: 'plaintext',
        };
        return [
            createStudentIdLinkColumn({
                tooltip: linkTooltip,
                onSelect: (studentId) => this.options.onStudentSelected?.(studentId),
            }),
            createColumnDef('Name', 'lastName', nameOptions),
            createColumnDef('Vorname(n)', 'firstName', nameOptions),
            createGenderColumn({ filterable: true }),
            createTraitsColumn(this.options.context.glossary, traitLabels, { filterable: true }),
        ];
    }
}

/**
 * "Stärkste 5" / "Schwächste 5" by a score field. A student
 * without a score is neither among the best nor the worst five.
 * @param {string} scoreField - The column the presets sort by.
 * @param {(row: import('./columnFactories.js').RowData) => number|null} [scoreOf] - A row's score, when the column's sorter
 *   computes it; the field's value by default.
 * @returns {import('./preset.js').PresetSpec[]}
 */
export function createGroupRankPresets(scoreField, scoreOf = (row) => row[scoreField]) {
    const filters = [
        (/** @type {import('./columnFactories.js').RowData} */ row) => scoreOf(row) != null,
    ];
    return ['best-five', 'worst-five'].map((key) => ({
        key,
        filters,
        sort: { column: scoreField, dir: key === 'best-five' ? 'desc' : 'asc' },
        limit: 5,
    }));
}
