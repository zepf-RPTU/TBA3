/**
 * EnStudentInfoTableModule (EN) - Displays student summary information for EN
 * Includes dual-domain columns (Hören/Lesen), GER levels, style percentages,
 * and mode-switching via column show/hide.
 *
 * Follows the Domäne mode through setState({ mode }) (withDomainMode), pushed
 * by the owning view.
 */

import { BaseStudentInfoTableModule } from '../../../common/tables/baseStudentInfoTableModule.js';
import { withDomainMode } from './enWithDomainMode.js';
import { EN_TERMS } from '../../enTerms.js';
import { createGerLevelHtml } from '../../../common/domain/levels.js';
import { COLUMN_GROW_RATIOS } from '../../../common/tables/columnWidthConstants.js';
import { createColumnDef, createTraitsColumn } from '../../../common/tables/columnFactories.js';
import { LABELS } from '../../../common/tables/tableLabels.js';
import { createProgressBarColumn } from '../../../common/tables/progressBarColumn.js';
import {
    deriveDomainResultFields,
    shouldShowColumnForMode,
    buildStyleFieldUpdate,
} from './enDomainModeRules.js';

/**
 * EnStudentInfoTableModule - EN-specific student info table with dual-domain support
 * @augments BaseStudentInfoTableModule
 */
export class EnStudentInfoTableModule extends withDomainMode(BaseStudentInfoTableModule) {
    #tableInitialized = false;

    /**
     * Creates a new EnStudentInfoTableModule instance
     * @param {string} id - Unique identifier for this module
     * @param {string|HTMLElement} container - Container element for the info table
     * @param {{[key: string]: any}} [options={}] - Configuration options
     */
    constructor(id, container, options = {}) {
        options.enConfig.assertExactlyTwoDomains();
        super(id, container, options);
    }

    // ========================================================================
    // BASE CLASS HOOKS
    // ========================================================================

    /** @override */
    _getColumns() {
        return this.#getAllColumns();
    }

    /** @override */
    _buildTableData(studentData, _schuelerId) {
        const enConfig = this.getOption('enConfig');
        const [d0, d1] = enConfig.domainIds;
        const d0Prefix = enConfig.domainFieldPrefix(d0);
        const d1Prefix = enConfig.domainFieldPrefix(d1);

        // Result counts from the adapted student record, keyed by what they count
        const d1ResultCounts = studentData[`${d1Prefix}ResultCounts`];
        const d0ResultCounts = studentData[`${d0Prefix}ResultCounts`];

        // Get GER values
        const d1Ger = studentData[enConfig.fieldName(d1, 'CompLevel') ?? ''] || 'N/A';
        const d0Ger = studentData[enConfig.fieldName(d0, 'CompLevel') ?? ''] || 'N/A';

        const d1GerHtml = createGerLevelHtml(d1Ger);
        const d0GerHtml = createGerLevelHtml(d0Ger);

        // Style percentages from the adapted student record. Without a row in a domain
        // the student has none, and the style cells show "N/A" rather than 0 %.
        const styleDataDomain0 = studentData[d0] ?? {};
        const styleDataDomain1 = studentData[d1] ?? {};

        const styleDefaults = Object.fromEntries(
            enConfig.styleCategories.map((c) => [c.fieldName, null]),
        );

        return [
            {
                gender: studentData.gender || 'N/A',
                // Per-domain percentage/count fields for the progress bar formatter
                ...deriveDomainResultFields('d0', d0ResultCounts),
                ...deriveDomainResultFields('d1', d1ResultCounts),
                // GER HTML, plus the plain level the download accessor reads.
                d1GerHtml,
                d0GerHtml,
                d1Ger,
                d0Ger,
                [d0]: styleDataDomain0,
                [d1]: styleDataDomain1,
                ...styleDefaults,
                traits: studentData.traits,
            },
        ];
    }

    /**
     * Override base _renderInfoTable to use the EN "create once, update via
     * replaceData + applyModeChange" optimization pattern.
     * @override
     * @protected
     * @param {string} schuelerId - Student ID
     */
    async _renderInfoTable(schuelerId) {
        if (!this._studentArray || !this._rawStudentArray) {
            return;
        }

        const studentData = this._studentArray.find((student) => student.studentId === schuelerId);

        if (!studentData) {
            this.clear();
            return;
        }

        const tableData = this._buildTableData(studentData, schuelerId);

        // Create table only once, then update data
        if (!this.#tableInitialized || !this.table) {
            if (this.table) {
                this.table.destroy();
                this.table = null;
            }

            const columns = this._getColumns().map((col) => ({ ...col, headerSort: false }));

            this.table = this.createTable({
                containerId: this.contentContainer.id,
                columns,
                data: tableData,
                options: {
                    selectableRows: false,
                    disablePresets: true,
                },
            });

            this.#tableInitialized = true;
            // Initial mode application is handled by the mixin's _onTableReady()
        } else {
            this.table.replaceData(tableData);
            this._applyModeChange(this._state.mode);
        }
    }

    /**
     * Creates a GER column definition for a domain
     * @param {string} domainKey - The domain's field prefix, which names the value column.
     * @param {string} domainLabel - The domain's display name, shown in the header.
     * @returns {object} Tabulator column definition
     */
    #createGerColumn(domainKey, domainLabel) {
        return createColumnDef(`${EN_TERMS.GER_PREFIX} ${domainLabel}`, `${domainKey}GerHtml`, {
            formatter: 'html',
            hozAlign: 'center',
            widthGrow: COLUMN_GROW_RATIOS.level,
            // The field holds pre-baked markup; the download takes the plain level.
            accessorDownload: (_value, data) => data[`${domainKey}Ger`] ?? '',
        });
    }

    /**
     * Get all column definitions (all columns created upfront)
     * @returns {Array} Column definitions
     */
    #getAllColumns() {
        const enConfig = this.getOption('enConfig');
        return [
            createColumnDef(EN_TERMS.GENDER, 'gender', {
                hozAlign: 'center',
                widthGrow: COLUMN_GROW_RATIOS.gender,
            }),
            createTraitsColumn(EN_TERMS.TRAITS),
            createProgressBarColumn(
                { fieldPrefix: 'd0', showCounts: true },
                `${enConfig.domainLabels[0]} – ${LABELS.VERTEILUNG}: ${LABELS.RICHTIG} | ${LABELS.UNBEARBEITET} | ${LABELS.FALSCH}`,
                'd0Percentages',
                { tableMeta: { skipCellGlossaryAnnotation: true }, headerSort: false },
            ),
            this.#createGerColumn('d0', enConfig.domainLabels[0]),
            createProgressBarColumn(
                { fieldPrefix: 'd1', showCounts: true },
                `${enConfig.domainLabels[1]} – ${LABELS.VERTEILUNG}: ${LABELS.RICHTIG} | ${LABELS.UNBEARBEITET} | ${LABELS.FALSCH}`,
                'd1Percentages',
                { tableMeta: { skipCellGlossaryAnnotation: true }, headerSort: false },
            ),
            this.#createGerColumn('d1', enConfig.domainLabels[1]),
            ...enConfig.styleCategories.map((cat) =>
                createColumnDef(cat.label, cat.fieldName, {
                    hozAlign: 'center',
                    widthGrow: COLUMN_GROW_RATIOS.percentage,
                    visible: false,
                    formatter: function (cell) {
                        const value = cell.getValue();
                        return value !== undefined && value !== null
                            ? `${value.toFixed(1)}%`
                            : 'N/A';
                    },
                }),
            ),
        ];
    }

    // ========================================================================
    // TABLE LIFECYCLE
    // ========================================================================

    // The initial mode is applied by the withTableModeState mixin's
    // _onTableReady() once the table is built (Tabulator 6 initialises
    // asynchronously — getRows()/getColumns() only return data after
    // tableBuilt + redraw); no override needed here.

    /**
     * Apply mode change — re-render table for the new domain.
     * @param {string} mode - 'all', 'domain0', or 'domain1'
     */
    _applyModeChange(mode) {
        if (!this.table) return;

        const enConfig = this.getOption('enConfig');

        if (mode !== 'all') {
            this.table.getRows().forEach((row) => {
                row.update(buildStyleFieldUpdate(row.getData()[mode], enConfig.styleCategories));
            });
        }

        const columns = this.table.getColumns();
        const styleFields = new Set(enConfig.styleCategories.map((c) => c.fieldName));

        this._applyColumnVisibilityChanges(columns, (column) =>
            shouldShowColumnForMode(column.getField(), mode, enConfig.domainIds, styleFields),
        );
    }

    /**
     * Clear the info table (extends base to reset EN-specific state)
     * @override
     */
    clear() {
        this.#tableInitialized = false;
        super.clear();
    }
}
