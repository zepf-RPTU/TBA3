/**
 * The EN group overview table. Follows the Domäne mode of its `domainMode` option
 * (DomainModeController) by showing and hiding columns, and hands its selected (else
 * visible) ids to `onDataSync`.
 */

import {
    BaseGroupTableModule,
    createGroupRankPresets,
} from '../../../common/tables/baseGroupTableModule.js';
import { DomainModeController } from './domainModeController.js';
import { createColumnDef } from '../../../common/tables/columnFactories.js';
import { createDomainColumns } from './enTableColumns.js';
import { compareNumbers } from '../../../common/utils/compare.js';
import { headerActionButton, renderIcon } from '@tba3/module-base';
import { buildEnDomainFields } from './enDomainModeRules.js';
import { EN_DATASETS } from '../../enDatasets.js';

/** @typedef {import('../../../common/tables/columnFactories.js').RowData} RowData */

/**
 * Header-action selector of the scatterplot-search button. Exported so a tour step
 * can anchor to the button without repeating the id.
 */
export const SCATTER_SEARCH_BUTTON_SELECTOR = '[data-header-action-button="scatter-search"]';

/**
 * @typedef {import('../../../common/tables/baseGroupTableModule.js').BaseGroupTableOptions &
 *   import('./domainModeController.js').DomainModeOptions & {
 *     onOpenScatterSearch?: () => void,
 *     onDataSync?: (data: import('../charts/style/styleGroupChartConfig.js').StyleSyncPayload) => void,
 * }} EnGroupTableOptions
 */

/** @augments {BaseGroupTableModule<EnGroupTableOptions>} */
export class EnGroupTableModule extends BaseGroupTableModule {
    /**
     * @override
     * @type {import('../../../common/data/documentStore.js').DocumentList}
     */
    static documents = [EN_DATASETS.STUDENT_RECORDS, EN_DATASETS.TRAIT_LABELS, EN_DATASETS.CONFIG];

    /** @override */
    static selectableRows = true;

    /** @type {DomainModeController} */
    #domain;

    /** @type {ReadonlySet<string>} */
    #externalStudentIds = new Set();

    /** @override */
    _setup() {
        super._setup();
        this.#domain = new DomainModeController(this, (mode) => this._applyModeChange(mode));
    }

    /**
     * The Domäne mode rescopes this table in place, so it tells two captures apart;
     * filters and sorting narrow the same report card.
     * @override
     */
    getExportIdentity() {
        return this.#domain.mode;
    }

    // ========================================================================
    // BASE CLASS HOOKS
    // ========================================================================

    /**
     * The rows, from the records in `en.studentRecords`: identity, and the per-domain
     * fields (summed results included).
     * @override
     * @returns {RowData[]}
     */
    _readStudentRecords() {
        const records = this.options.context.documents.getDataset(EN_DATASETS.STUDENT_RECORDS);
        return records.map((student) => ({
            studentId: student.studentId,
            lastName: student.lastName,
            firstName: student.firstName,
            gender: student.gender,
            traits: student.traits,
            ...buildEnDomainFields(student, this.#domain.enConfig),
        }));
    }

    /** @override */
    _getColumns() {
        const { glossary, documents } = this.options.context;
        const baseColumns = this._createIdentityColumns(
            glossary.getRequiredEntryText(`${this._interfaceGlossaryPath}.student-link.tooltip`),
            documents.getDataset(EN_DATASETS.TRAIT_LABELS),
        );

        baseColumns.push(
            ...createDomainColumns(this.options.context, this.#domain, { filterable: true }),
            // The presets' hidden sort target (setSort needs a column): the summed
            // result of the domain in force, read by the sorter, so a mode switch
            // rewrites no row.
            createColumnDef('rankScore', 'rankScore', {
                visible: false,
                sorter: (_a, _b, aRow, bRow) =>
                    compareNumbers(
                        this.#rankScore(aRow.getData()),
                        this.#rankScore(bRow.getData()),
                    ),
                tableMeta: { excludeFromColumnVisibilityMenu: true },
            }),
        );

        return this.#domain.withModeVisibility(baseColumns);
    }

    /**
     * The scatterplot search button before the standard table-local header controls
     * (column visibility, filters, Reset).
     * @override
     * @returns {unknown}
     */
    _tableHeaderActions() {
        return [this.#scatterSearchButton(), super._tableHeaderActions()];
    }

    /** @returns {ReadonlySet<string>} The students the scatterplot filter keeps; empty is none. */
    get externalStudentIds() {
        return this.#externalStudentIds;
    }

    /**
     * Apply the scatterplot's confirmed student filter without replacing table data:
     * a persistent filter on `studentId`, so it survives presets and re-renders. `null`
     * or no ids clear it.
     * @param {Iterable<string>|null} studentIds
     */
    applyExternalStudentFilter(studentIds) {
        const ids = new Set(studentIds ?? []);
        this.#externalStudentIds = ids;
        this._setPersistentFilter(
            'externalStudents',
            ids.size === 0 ? null : (rowData) => ids.has(rowData.studentId),
        );
    }

    /**
     * The Reset button clears the scatterplot filter too.
     * @override
     */
    _onTableReset() {
        this.applyExternalStudentFilter(null);
    }

    /** @override */
    _getPresets() {
        return createGroupRankPresets('rankScore', (row) => this.#rankScore(row));
    }

    /**
     * What the presets rank a student by: the correct count of the domain in force,
     * in `all` the mean of both. No result is null, and the presets leave such a
     * student out rather than ranking them as 0.
     * @param {RowData} row
     * @returns {number|null}
     */
    #rankScore(row) {
        const [d0, d1] = this.#domain.enConfig.domainIds;
        const mode = this.#domain.mode;
        if (mode === d0) return row.d0CorrectCount;
        if (mode === d1) return row.d1CorrectCount;
        return row.d0CorrectCount === null || row.d1CorrectCount === null
            ? null
            : (row.d0CorrectCount + row.d1CorrectCount) / 2;
    }

    /**
     * Header button for the scatterplot student search. A click only calls
     * `onOpenScatterSearch`; the table owns no modal.
     * @returns {import('lit').TemplateResult}
     */
    #scatterSearchButton() {
        return headerActionButton({
            name: 'scatter-search',
            ariaLabel: this.options.context.glossary.getRequiredEntryText(
                'general.buttons.element_texts.scatter-search.tooltip',
            ),
            buttonContent: renderIcon('filter_alt'),
            onClick: () => this.options.onOpenScatterSearch?.(),
        });
    }

    /**
     * @override
     * @param {import('../../../common/tables/tableModule.js').DisplayedRows} shown
     */
    _onDisplayedRowsChanged({ rows, selected }) {
        // The chart resolves the ids against `en.studentRecords`.
        const drawn = selected.length > 0 ? selected : rows;
        this.options.onDataSync?.({ ids: drawn.map((r) => r.studentId) });
    }

    /**
     * Show and hide columns for the new mode. The style columns read the mode
     * themselves, so no row changes, but a sort on one is re-run: nothing else
     * re-sorts the rows. The deselect and an active preset's re-rank reach
     * `_onDisplayedRowsChanged` as one report, so the chart draws the rows they leave.
     * @param {string} mode
     */
    _applyModeChange(mode) {
        const table = this.table;
        if (!table) return;

        // A domain switch resets the chart to every shown student.
        table.deselectRow();
        this._applyColumnVisibility(this.#domain.columnVisibility(mode));
        // The same sorters again: Tabulator re-sorts, and the unchanged sort ends no preset.
        const sorters = table.getSorters();
        if (sorters.length > 0) {
            table.setSort(sorters.map(({ field, dir }) => ({ column: field, dir })));
        }
        // The presets rank by the domain in force; an active one re-ranks.
        this._refreshPresets();
    }
}

customElements.define('tba-en-group-table', EnGroupTableModule);
