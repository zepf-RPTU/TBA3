/**
 * One student's summary row: both domains' results and GER levels, and the style shares.
 * Follows the Domäne mode of its `domainMode` option (DomainModeController) by showing
 * and hiding columns.
 */

import { BaseStudentInfoTableModule } from '../../../common/tables/baseStudentInfoTableModule.js';
import { DomainModeController } from './domainModeController.js';
import { createDomainColumns } from './enTableColumns.js';
import { buildEnDomainFields } from './enDomainModeRules.js';
import { EN_DATASETS } from '../../enDatasets.js';

/** @typedef {import('../../../common/tables/columnFactories.js').RowData} RowData */

/**
 * @typedef {import('../../../common/tables/baseStudentDataTableModule.js').StudentTableOptions &
 *   import('./domainModeController.js').DomainModeOptions} EnStudentInfoTableOptions
 */

/** @augments {BaseStudentInfoTableModule<EnStudentInfoTableOptions>} */
export class EnStudentInfoTableModule extends BaseStudentInfoTableModule {
    /**
     * @override
     * @type {import('../../../common/data/documentStore.js').DocumentList}
     */
    static documents = [EN_DATASETS.STUDENT_RECORDS, EN_DATASETS.TRAIT_LABELS, EN_DATASETS.CONFIG];

    /** @type {DomainModeController} */
    #domain;

    /** @override */
    _setup() {
        super._setup();
        this.#domain = new DomainModeController(this, (mode) => this._applyModeChange(mode));
    }

    // ========================================================================
    // BASE CLASS HOOKS
    // ========================================================================

    /**
     * The records in `en.studentRecords`, each with its per-domain fields.
     * @override
     * @returns {RowData[]}
     */
    _readStudentRecords() {
        const records = this.options.context.documents.getDataset(EN_DATASETS.STUDENT_RECORDS);
        return records.map((student) => ({
            ...student,
            ...buildEnDomainFields(student, this.#domain.enConfig),
        }));
    }

    /**
     * Every column is created upfront; the Domäne mode shows and hides them. The
     * distribution export columns follow each domain's bar, as in the group table.
     * @override
     */
    _getColumns() {
        return this.#domain.withModeVisibility([
            ...this._createIdentityColumns(
                this.options.context.documents.getDataset(EN_DATASETS.TRAIT_LABELS),
            ),
            ...createDomainColumns(this.options.context, this.#domain),
        ]);
    }

    /**
     * Show the new mode's columns. The style columns read the mode themselves, so no
     * row changes.
     * @param {string} mode - `'all'` or a domain id
     */
    _applyModeChange(mode) {
        // Before the first build the EN config may not be loaded; the build reads the mode.
        if (!this.table) return;
        this._applyColumnVisibility(this.#domain.columnVisibility(mode));
    }
}

customElements.define('tba-en-student-info-table', EnStudentInfoTableModule);
