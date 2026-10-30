/**
 * Shared base for single-row student info tables. The table follows its
 * `studentId` option; the subclass supplies the columns.
 */

import { TableModule } from './tableModule.js';
import { followStudent } from './tableModeController.js';
import { createGenderColumn, createTraitsColumn } from './columnFactories.js';

/**
 * @template {import('./baseStudentDataTableModule.js').StudentTableOptions} [O=import('./baseStudentDataTableModule.js').StudentTableOptions]
 * @augments {TableModule<O>}
 */
export class BaseStudentInfoTableModule extends TableModule {
    /**
     * The Tabulator layout. The default shares the card's whole width out to the columns.
     * @type {'fitColumns'|'fitDataFill'}
     */
    static layout = 'fitColumns';

    /** @type {import('./tableModeController.js').TableModeController<string|null>} The student shown. */
    #student;

    /** @override */
    _setup() {
        super._setup();
        this.#student = followStudent(this, this.options.studentId);
    }

    // ========================================================================
    // BASE CLASS HOOKS
    // ========================================================================

    /**
     * @abstract
     * @returns {import('./columnFactories.js').TableColumnDefinition[]}
     */
    _getColumns() {
        throw new Error(`${this.constructor.name} must implement _getColumns()`);
    }

    /**
     * The columns every student info table opens with: gender and Merkmale.
     * @protected
     * @param {ReadonlyMap<string, string>} traitLabels - The subject catalog's `TRAIT_LABELS`.
     * @returns {import('./columnFactories.js').TableColumnDefinition[]}
     */
    _createIdentityColumns(traitLabels) {
        return [
            createGenderColumn(),
            createTraitsColumn(this.options.context.glossary, traitLabels),
        ];
    }

    /**
     * The rows the table picks its student's from, one per student, read from the
     * `documents` store; Tabulator shows and downloads only the defined columns.
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
        const studentId = this.#student.value;
        const studentData = studentId
            ? this._readStudentRecords().find((student) => student.studentId === studentId)
            : null;
        if (!studentData) {
            this.clear();
            return;
        }

        await this.setRows([studentData], {
            columns: this._getColumns(),
            options: {
                columnDefaults: { headerSort: false },
                layout: /** @type {typeof BaseStudentInfoTableModule} */ (this.constructor).layout,
            },
        });
    }
}
