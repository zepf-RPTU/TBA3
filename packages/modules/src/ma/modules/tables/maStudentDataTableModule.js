/**
 * MaStudentDataTableModule (MA) - Displays task-by-task results for a single student
 * Includes domain, KS level, and result columns with replaceData optimization.
 */

import {
    BaseStudentDataTableModule,
    isItemBelowReportedLevel,
    isItemAboveReportedLevel,
} from '../../../common/tables/baseStudentDataTableModule.js';
import { MA_TERM_CONSTANTS } from '../../maTerms.js';
import { TERM_CONSTANTS } from '../../../common/domain/terms.js';
import { createListFilter } from '../../../common/tables/tableDataUtils.js';
import { createResultFormatter } from '../../../common/tables/cellFormatters.js';
import { createKsColumn, createColumnDef } from '../../../common/tables/columnFactories.js';
import { createMaItemNumberColumn } from './maTableColumns.js';
import {
    COLUMN_GROW_RATIOS,
    VISUAL_COLUMN_MIN_WIDTHS,
} from '../../../common/tables/columnWidthConstants.js';
import { Preset } from '../../../common/tables/preset.js';
import { compareLevelLabels } from '../../../common/domain/levels.js';
import { glossaryAnnotator } from '../../../common/glossary/glossaryAnnotator.js';

/**
 * MaStudentDataTableModule - MA-specific student data table
 * @augments BaseStudentDataTableModule
 */
export class MaStudentDataTableModule extends BaseStudentDataTableModule {
    /** @type {any[]|null} */
    #studentArray = null;
    /** @type {string|null} */
    #achievedKs = null;

    /**
     * Creates a new MaStudentDataTableModule instance
     * @param {string} id - Unique identifier for this module
     * @param {string|HTMLElement} container - Container element for the data table
     * @param {object} options - Configuration options
     */
    constructor(id, container, options = {}) {
        super(id, container, options);
    }

    // ========================================================================
    // BASE CLASS HOOKS
    // ========================================================================

    /** @override */
    _onBeforeRender(data) {
        if (data.studentArray) {
            this.#studentArray = data.studentArray;
        }
    }

    /** @override */
    async _renderForStudent(schuelerId) {
        await this.#renderDataTable(schuelerId);
    }

    /**
     * Render the student data table
     * @param {string} schuelerId - Student ID
     */
    async #renderDataTable(schuelerId) {
        this.#achievedKs = Array.isArray(this.#studentArray)
            ? (this.#studentArray.find((s) => s.studentId === schuelerId)?.ks ?? null)
            : null;

        const relatedData = this._prepareStudentRows(schuelerId, [
            'domainLabel',
            'exerciseName',
            'name',
            'competenceLevel',
            'ergebnis',
        ]);

        if (relatedData.length === 0) {
            this.clear();
            return;
        }

        // Define columns
        const columns = [
            createColumnDef(MA_TERM_CONSTANTS.DOMAIN, 'domainLabel', {
                widthGrow: COLUMN_GROW_RATIOS.domain,
                headerFilter: 'list',
                headerFilterParams: createListFilter(relatedData, 'domainLabel'),
            }),
            createMaItemNumberColumn(this.getOption('onItemPreview')),
            createColumnDef('Aufgabe', 'exerciseName', {
                widthGrow: COLUMN_GROW_RATIOS.description,
                headerFilter: 'list',
                headerFilterParams: createListFilter(relatedData, 'exerciseName'),
            }),
            createKsColumn({
                field: 'competenceLevel',
                title: TERM_CONSTANTS.ITEM_LEVEL,
                headerFilter: 'list',
                headerFilterParams: createListFilter(
                    relatedData,
                    'competenceLevel',
                    null,
                    compareLevelLabels,
                ),
                headerSort: true,
            }),
            {
                title: 'Ergebnis',
                field: 'ergebnis',
                hozAlign: 'center',
                minWidth: VISUAL_COLUMN_MIN_WIDTHS.resultIcon,
                widthGrow: COLUMN_GROW_RATIOS.text,
                headerFilter: 'list',
                headerFilterParams: {
                    values: {
                        '': 'Alle',
                        1: '✓ Richtig',
                        0: '✗ Falsch',
                        '-1': '⊘ Unbearbeitet',
                    },
                },
                formatter: createResultFormatter,
            },
        ];

        // If table exists, use replaceData for better performance
        if (
            await this.safeReplaceData(relatedData, {
                beforeReplace: () => this.table?.clearSort(),
                afterReplace: () => {
                    this.table?.setSort('name', 'asc');
                    this._updatePresets(this._getPresets());
                },
            })
        )
            return;

        // Create the data table
        this.table = this.createTable({
            containerId: this.contentContainer.id,
            columns,
            data: relatedData,
            initialSort: [{ column: 'name', dir: 'asc' }],
            options: {
                selectableRows: false,
                height: '100%',
            },
            presets: this._getPresets(),
        });
    }

    /**
     * Level presets for the student data table. Predicates compare each item's
     * Aufgabenniveau (Kompetenzstufe) against the student's achieved Kompetenzstufe.
     * @protected
     * @returns {Array<Preset>} One preset per Kompetenzstufe, relative to the student's own achieved level.
     */
    _getPresets() {
        const achievedKs = this.#achievedKs;
        const tooltipBasePath = 'ma.student.student-item-table.interface';

        return [
            new Preset({
                label: glossaryAnnotator.getRequiredEntryText(`${tooltipBasePath}.below-ks.label`),
                tooltipText: glossaryAnnotator.getRequiredEntryText(
                    `${tooltipBasePath}.below-ks.tooltip`,
                ),
                sort: [{ column: 'name', dir: 'asc' }],
                filters: [
                    {
                        field: 'competenceLevel',
                        type: 'custom',
                        value: (row) =>
                            row.ergebnis !== 1 &&
                            isItemBelowReportedLevel(row.competenceLevel, achievedKs),
                    },
                ],
            }),
            new Preset({
                label: glossaryAnnotator.getRequiredEntryText(`${tooltipBasePath}.above-ks.label`),
                tooltipText: glossaryAnnotator.getRequiredEntryText(
                    `${tooltipBasePath}.above-ks.tooltip`,
                ),
                sort: [{ column: 'name', dir: 'asc' }],
                filters: [
                    {
                        field: 'competenceLevel',
                        type: 'custom',
                        value: (row) =>
                            row.ergebnis === 1 &&
                            isItemAboveReportedLevel(row.competenceLevel, achievedKs),
                    },
                ],
            }),
        ];
    }
}
