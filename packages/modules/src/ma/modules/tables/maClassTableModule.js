/**
 * MaClassTableModule - Composite module for class overview table
 * Combines table with header and filtering capabilities
 *
 * Paired with the KS bar by the owning view: the bar's segment click arrives
 * through `setKsLevelFilter(level)`, a table reset goes back through the
 * `onKsFilterCleared` option.
 */

import {
    BaseClassTableModule,
    CLASS_TABLE_DEFAULT_SORT,
    createTraitFilterParams,
} from '../../../common/tables/baseClassTableModule.js';
import { getThemeColors } from '../../../common/services/themeService.js';
import { Preset } from '../../../common/tables/preset.js';
import { glossaryAnnotator } from '../../../common/glossary/glossaryAnnotator.js';
import { applyTemplateTokens } from '@tba3/module-base/glossary/glossaryText.js';
import { compareLevelLabels } from '../../../common/domain/levels.js';
import { retainNamedColumns, createListFilter } from '../../../common/tables/tableDataUtils.js';
import { getTraitsAsText } from '../../../common/tables/traitUtils.js';
import {
    createKsColumn,
    createRichtigColumn,
    createColumnDef,
    createStudentIdLinkColumn,
    createTraitsColumn,
} from '../../../common/tables/columnFactories.js';
import { createDistributionDownloadColumns } from '../../../common/tables/tableExport.js';
import { createProgressBarColumn } from '../../../common/tables/progressBarColumn.js';
import { setupProgressBarSorting } from '../../../common/tables/progressBarSorting.js';
import { COLUMN_GROW_RATIOS } from '../../../common/tables/columnWidthConstants.js';

/** This table's controls in the glossary: the presets and the student-id link. */
const INTERFACE_GLOSSARY_PATH = 'ma.class.class-table.interface';

/**
 * The thresholds to judge one student's score against.
 *
 * A student's own `ksThresholds` come from the booklet they actually sat, so in a
 * class holding two difficulty variants each half is measured against its own cut
 * scores — the shared fallback would put the boundary in the wrong place for one of
 * them. Students without their own fall back to the class-level thresholds
 * resolved from the payload's class row.
 * @param {object} row - Student record
 * @param {number[]|null} fallback - Thresholds for datasets that ship none
 * @returns {number[]} The student's own Schwellenwerte, the class fallback, or an empty list when neither exists.
 */
function thresholdsFor(row, fallback) {
    return row?.ksThresholds?.length ? row.ksThresholds : (fallback ?? []);
}

/**
 * The part of a task pool the class table reads (tba3 passes the MA `MaTaskPool`).
 * @typedef {object} MaClassTablePool
 * @property {string} id - Pool id: 'all' for the whole booklet, else the Leitidee's domain id.
 * @property {'all'|'leitidee'} type - Pool kind; a 'leitidee' pool drops the Kompetenzstufe
 *   column and the ±Schwellenwert presets.
 */

/**
 * MaClassTableModule - Reusable class table component
 * Encapsulates the class overview table with filtering and export
 * @augments BaseClassTableModule
 */
export class MaClassTableModule extends BaseClassTableModule {
    #nrItems = 0;
    /**
     * Ordered band labels of the scale in play, for the Kompetenzstufe filter menu.
     * Null until the data supplies them; until then the menu sorts by registered scale
     * order (`compareLevelLabels`) rather than a hardcoded VERA-3 default.
     * @type {string[]|null}
     */
    #ksLevels = null;
    /** @type {MaClassTablePool|null} */
    #pool = null;
    /**
     * Booklet-level threshold fallback for students whose rows carry no
     * `ksThresholds`; null when the class row ships no table counted in solved
     * items (typed absence — `_getPresets` gates on it, and `![]` would lie).
     * Booklet-level, so it deliberately survives pool switches.
     * @type {number[]|null}
     */
    #classKsThresholds = null;

    /**
     * Creates a new MaClassTableModule instance
     * @param {string} id - Unique identifier for this module
     * @param {string|HTMLElement} container - Container element or selector
     * @param {{[key: string]: any}} [options={}] - Configuration options. `options.pool`
     *   is the active task pool scoping the table; omit it for the whole booklet ('all').
     */
    constructor(id, container, options = {}) {
        super(id, container, options);

        this.setDefaults({
            enableModuleExport: true,
        });

        this.#pool = options.pool ?? null;

        // Wired by the owning view to the KS bar's highlight.
        if (typeof options.onKsFilterCleared === 'function') {
            this.registerCallback('ksFilterCleared', options.onKsFilterCleared);
        }

        // A click on a student id link; the view selects the student and navigates.
        if (typeof options.onStudentSelected === 'function') {
            this.registerCallback('studentSelected', options.onStudentSelected);
        }
    }

    /**
     * Whether the active pool restricts the table to a single Leitidee.
     * Leitidee pools drop the Kompetenzstufe column and the ±Schwellenwert
     * presets, since KS is not defined for a single content area.
     * @returns {boolean} True while a Leitidee pool is active.
     */
    #isLeitideePool() {
        return this.#pool != null && this.#pool.type !== 'all';
    }

    // ========================================================================
    // PUBLIC API (called by the owning view)
    // ========================================================================

    /**
     * Filter the Kompetenzstufe column to one level (the KS bar's segment click).
     * @param {string|null} level - The level to keep, or null to clear the filter
     */
    setKsLevelFilter(level) {
        // Leitidee pools have no Kompetenzstufe column to filter — ignore the sync.
        if (this.#isLeitideePool()) return;

        this._setTableFilterValue('ks', level || '');
    }

    /**
     * Full reset: tell the KS bar to drop its active selection, so a highlighted
     * segment never outlives the table filter it stands for.
     * @override
     */
    _onTableReset() {
        this.triggerCallback('ksFilterCleared');
    }

    // ========================================================================
    // BASE CLASS HOOK IMPLEMENTATIONS
    // ========================================================================

    /** @override */
    _getTraitsAsTextFn() {
        return getTraitsAsText;
    }

    /**
     * Store nrItems, the band scale, and the threshold fallback before render.
     * @override
     */
    _onBeforeRender(data) {
        this.#nrItems = data.nrItems;
        if (data.ksLevels?.length) {
            this.#ksLevels = data.ksLevels;
        }
        this.#classKsThresholds = data.classKsThresholds ?? null;
    }

    /**
     * Retain only needed columns.
     * @override
     */
    _preprocessData(studentArray) {
        return retainNamedColumns(studentArray, [
            'studentId',
            'lastName',
            'firstName',
            'gender',
            'traits',
            // `ksThresholds` has no column of its own — the ±Schwellenwert presets read it
            // off the row, so dropping it here silently empties those filters.
            'summedResult',
            'percentage',
            'ks',
            'ksThresholds',
            'percentageCorrect',
            'percentageIncorrect',
            'percentageNotAttempted',
            'correctCount',
            'incorrectCount',
            'notAttemptedCount',
        ]);
    }

    /** @override */
    _getTableOptions() {
        return {
            selectableRows: false,
            selectableRowsPersistence: false,
        };
    }

    /** @override */
    _getColumns({ genderFilterParams, traitFilterParams }) {
        const baseColumns = [
            createStudentIdLinkColumn('ID', 'studentId', {
                // `_preprocessData` drops an empty name, so either part may be missing.
                getTooltipText: ({ rowData }) =>
                    rowData.firstName && rowData.lastName
                        ? applyTemplateTokens(
                              glossaryAnnotator.getRequiredEntryText(
                                  `${INTERFACE_GLOSSARY_PATH}.student-link.tooltip`,
                              ),
                              { name: `${rowData.firstName} ${rowData.lastName}` },
                          )
                        : glossaryAnnotator.getRequiredEntryText(
                              `${INTERFACE_GLOSSARY_PATH}.student-link-unnamed.tooltip`,
                          ),
                style: () => ({
                    color: getThemeColors().button.primary,
                    '--interactive-hover-color': getThemeColors().button.primaryHover,
                }),
                onClick: ({ value }) => this.triggerCallback('studentSelected', value),
            }),
            createColumnDef('Name', 'lastName', {
                widthGrow: COLUMN_GROW_RATIOS.name,
                headerFilter: 'input',
            }),
            createColumnDef('Vorname(n)', 'firstName', {
                widthGrow: COLUMN_GROW_RATIOS.name,
                headerFilter: 'input',
            }),
            {
                title: 'Geschlecht',
                field: 'gender',
                headerFilter: 'list',
                headerFilterParams: genderFilterParams,
                hozAlign: 'center',
                widthGrow: COLUMN_GROW_RATIOS.gender,
            },
        ];

        const resultColumns = [
            createRichtigColumn({
                totalItems: this.#nrItems,
                headerFilter: false,
                headerSort: true,
                sorter: 'number',
            }),
            createProgressBarColumn({ showCounts: true }),
            ...createDistributionDownloadColumns({ follows: 'percentageCombined' }),
        ];

        // Kompetenzstufe is only defined for the whole booklet, not per Leitidee.
        if (!this.#isLeitideePool()) {
            // MA-specific: generate KS filter params with sort order
            const ksFilterParams = createListFilter(
                this._currentStudentArray ?? [],
                'ks',
                null,
                this.#ksLevels ?? compareLevelLabels,
            );
            resultColumns.push(
                createKsColumn({
                    headerFilter: true,
                    headerSort: true,
                    headerFilterParams: ksFilterParams,
                }),
            );
        }

        const traitColumns = [
            createTraitsColumn('Merkmale', { headerFilterParams: traitFilterParams }),
        ];

        return [...baseColumns, ...resultColumns, ...traitColumns];
    }

    /**
     * Presets for MA class table.
     * @override
     */
    _getPresets() {
        const tooltipBasePath = INTERFACE_GLOSSARY_PATH;

        const presets = [
            new Preset({
                label: glossaryAnnotator.getRequiredEntryText(`${tooltipBasePath}.best-five.label`),
                tooltipText: glossaryAnnotator.getRequiredEntryText(
                    `${tooltipBasePath}.best-five.tooltip`,
                ),
                sort: [{ column: 'summedResult', dir: 'desc' }],
                limit: 5,
            }),
            new Preset({
                label: glossaryAnnotator.getRequiredEntryText(
                    `${tooltipBasePath}.worst-five.label`,
                ),
                tooltipText: glossaryAnnotator.getRequiredEntryText(
                    `${tooltipBasePath}.worst-five.tooltip`,
                ),
                sort: [{ column: 'summedResult', dir: 'asc' }],
                limit: 5,
            }),
        ];

        // The ±Schwellenwert presets are Kompetenzstufe-boundary based and only
        // meaningful for the whole booklet — drop them on Leitidee pools.
        if (this.#isLeitideePool()) {
            return presets;
        }

        // Offered only when the class row's cut scores count solved items, the unit
        // `summedResult` is in — `resolveClassKsThresholds` delivers null for any other
        // table. A student's own thresholds still judge their row once the presets exist.
        const fallback = this.#classKsThresholds;
        if (!fallback) {
            return presets;
        }

        presets.push(
            new Preset({
                label: glossaryAnnotator.getRequiredEntryText(`${tooltipBasePath}.one-above.label`),
                tooltipText: glossaryAnnotator.getRequiredEntryText(
                    `${tooltipBasePath}.one-above.tooltip`,
                ),
                sort: [{ column: 'summedResult', dir: 'desc' }],
                filters: [
                    {
                        field: 'summedResult',
                        type: 'custom',
                        value: (data) => {
                            const points = data.summedResult;
                            return thresholdsFor(data, fallback).some(
                                (threshold) => points === threshold,
                            );
                        },
                    },
                ],
            }),
            new Preset({
                label: glossaryAnnotator.getRequiredEntryText(`${tooltipBasePath}.one-below.label`),
                tooltipText: glossaryAnnotator.getRequiredEntryText(
                    `${tooltipBasePath}.one-below.tooltip`,
                ),
                sort: [{ column: 'summedResult', dir: 'desc' }],
                filters: [
                    {
                        field: 'summedResult',
                        type: 'custom',
                        value: (data) => {
                            const points = data.summedResult;
                            return thresholdsFor(data, fallback).some(
                                (threshold) => points === threshold - 1,
                            );
                        },
                    },
                ],
            }),
        );

        return presets;
    }

    /**
     * Setup progress bar sorting after table creation.
     * @override
     */
    _onAfterTableCreated() {
        if (this.table) {
            setupProgressBarSorting(this.table, 'percentageCombined');
        }
    }

    // ========================================================================
    // EXPORT FUNCTIONALITY
    // ========================================================================

    /**
     * Re-scope the table to a task pool (Gesamt / a single Leitidee) **in place**.
     *
     * Only three things differ between pools — the Kompetenzstufe column, the
     * "Richtig (von N)" denominator, and the preset set — so the Tabulator instance
     * and the whole module shell (title bar, export + column-visibility buttons,
     * the pool selector in the subtitle) are kept alive and updated rather than
     * destroyed and rebuilt. That is what keeps the toolbar from flickering.
     *
     * Active filter-menu values (Name, Geschlecht, Merkmale) are preserved across
     * the switch; the Kompetenzstufe filter cannot be (its column disappears), and
     * the active preset is cleared because a preset's meaning changes with the pool.
     * @param {MaClassTablePool} pool - The pool to scope to
     * @param {object} data - Pool-scoped data
     * @param {Array} data.studentArray - Student records scoped to the pool
     * @param {number} data.nrItems - Number of items in the pool
     * @returns {Promise<void>}
     */
    async setActivePool(pool, { studentArray, nrItems }) {
        if (!this.table) {
            console.warn(
                `${this.constructor.name}[${this.id}]: Cannot set pool - no table initialized`,
            );
            return;
        }

        this.#pool = pool;
        this.#nrItems = nrItems;
        this._currentStudentArray = studentArray;

        // A preset's meaning is pool-specific (and the ±Schwellenwert presets do not
        // exist on a Leitidee), so drop any active preset selection. The filter it
        // installed is cleared below, with the data swap.
        this._clearPresetState();

        // Rebuild the column set for the new pool: this is what adds/removes the
        // Kompetenzstufe column and rescopes the "Richtig (von N)" header.
        const genderFilterParams = createListFilter(studentArray, 'gender');
        const traitFilterParams = createTraitFilterParams(studentArray, this._getTraitsAsTextFn());
        this.updateColumns(this._getColumns({ genderFilterParams, traitFilterParams }));

        await this.safeReplaceData(this._preprocessData(studentArray), {
            beforeReplace: () => {
                this.table?.clearSort();
                // Drop the programmatic filter of any preset that was active: a
                // "Stärkste 5" row-limit pins the *old* pool's top ids, and a
                // ±Schwellenwert filter compares against booklet-wide thresholds.
                // Both would otherwise survive replaceData with no button to show
                // for them. The filter menu's values are untouched by this —
                // safeReplaceData re-attaches their filter afterwards.
                this.table?.clearFilter();
            },
            afterReplace: () => this.table?.setSort([...CLASS_TABLE_DEFAULT_SORT]),
        });

        if (!this.table) return; // safeReplaceData destroyed the table on failure

        // No pool switch carries a Kompetenzstufe filter across (the column either
        // disappears or comes back empty), so the KS chart must drop its highlight —
        // otherwise it advertises a filter the table is no longer applying.
        this.triggerCallback('ksFilterCleared');

        // The button row must now show 2 presets (Leitidee) or 4 (Gesamt).
        this._updatePresets(this._getPresets());

        // New header cells: re-register the progress-bar sort affordance.
        setupProgressBarSorting(this.table, 'percentageCombined');

        // The pool is part of this table's export identity and nothing here
        // re-renders through ContentModule, so the id would otherwise stay stale.
        this.syncExportControls();
    }

    /**
     * One instance serves every Leitidee: `setActivePool()` rescopes the columns
     * and rows in place, so the pool is what tells two captures apart.
     * @override
     */
    getExportIdentity() {
        return this.#pool?.id ?? this.#pool?.type ?? null;
    }
}
