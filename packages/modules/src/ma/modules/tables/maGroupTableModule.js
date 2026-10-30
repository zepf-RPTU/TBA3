/**
 * MaGroupTableModule — the Mathe group overview table, scoped to an item pool: the whole
 * booklet or one Leitidee, picked in its toolbar's Aufgabenpool menu.
 */

import {
    BaseGroupTableModule,
    createGroupRankPresets,
} from '../../../common/tables/baseGroupTableModule.js';
import { applyTemplateTokens } from '@tba3/module-base/glossary';
import { headerActionRadioDropdown, renderIcon } from '@tba3/module-base';
import { signal } from '@preact/signals-core';
import { html, nothing } from 'lit';
import {
    createCompetenceLevelColumn,
    createRichtigColumn,
} from '../../../common/tables/columnFactories.js';
import { createProgressBarColumns } from '../../../common/tables/progressBarColumn.js';
import { MA_DATASETS } from '../../maDatasets.js';
import { TERM_CONSTANTS } from '../../../common/domain/terms.js';
import { formatStudentFullName } from '../../../common/domain/studentIdentity.js';

/** @typedef {import('../../utils/maItemPools.js').MaItemPool} MaItemPool */
/** @typedef {import('../../../common/domain/studentIdentity.js').StudentName} StudentName */

/**
 * @typedef {import('../../../common/tables/baseGroupTableModule.js').BaseGroupTableOptions & {
 *   onCompetenceLevelFilterChanged?: (levels: string[]) => void,
 * }} MaGroupTableOptions
 */

/** @augments {BaseGroupTableModule<MaGroupTableOptions>} */
export class MaGroupTableModule extends BaseGroupTableModule {
    /**
     * @override
     * @type {import('../../../common/data/documentStore.js').DocumentList}
     */
    static documents = [
        MA_DATASETS.STUDENT_RECORDS,
        MA_DATASETS.TRAIT_LABELS,
        MA_DATASETS.STUDENT_RECORDS_BY_DOMAIN,
        MA_DATASETS.GROUP_COMPETENCE_LEVEL_THRESHOLDS,
        MA_DATASETS.ITEM_POOLS,
    ];

    /**
     * The Leitidee the Aufgabenpool menu picked; null for the whole booklet. The menu
     * shows it at once, the table once `#rescope` has run.
     * @type {import('@preact/signals-core').Signal<MaItemPool|null>}
     */
    #pool = signal(/** @type {MaItemPool|null} */ (null));
    /**
     * @type {MaItemPool|null} The pool the table's columns, rows, presets and export
     * identity are scoped to: the picked one once its re-scope runs.
     */
    #shownPool = null;
    /** @type {Promise<void>} The re-scope in flight; the next one waits for it. */
    #rescoping = Promise.resolve();

    /** @override */
    _setup() {
        super._setup();
        // The competence-level bar shows what the Kompetenzstufe filter holds.
        this.onChange(
            () => this.#filteredLevels(),
            (levels) => this.options.onCompetenceLevelFilterChanged?.(levels),
        );
    }

    /**
     * Whether the active pool is a single Leitidee, for which no Kompetenzstufe is defined.
     * @returns {boolean}
     */
    #isLeitideePool() {
        return this.#shownPool?.type === 'leitidee';
    }

    // ========================================================================
    // PUBLIC API
    // ========================================================================

    /**
     * Add a level to the Kompetenzstufe filter, or take it out when the filter holds it
     * already (the competence-level bar's segment click). A Leitidee pool has no such column, and the
     * request changes nothing.
     * @param {string} level
     */
    toggleCompetenceLevelFilter(level) {
        const levels = this.#filteredLevels();
        this._setTableFilterValue(
            'competenceLevelName',
            levels.includes(level) ? levels.filter((kept) => kept !== level) : [...levels, level],
        );
    }

    /**
     * @returns {string[]} The levels the Kompetenzstufe filter holds; none on a Leitidee
     *   pool, which has no such column.
     */
    #filteredLevels() {
        const value = this._filterValues.value.competenceLevelName;
        return Array.isArray(value) ? value : [];
    }

    // ========================================================================
    // BASE CLASS HOOKS
    // ========================================================================

    /**
     * The students scoped to the active pool: the whole-booklet records for `all`,
     * each student's counts for one content area on a Leitidee pool.
     * @override
     */
    _readStudentRecords() {
        const documents = this.options.context.documents;
        const pool = this.#shownPool;
        if (pool?.type !== 'leitidee') return documents.getDataset(MA_DATASETS.STUDENT_RECORDS);
        // Every Leitidee pool is a declared Leitidee, so its records exist.
        return /** @type {import('../../utils/maStudentDataAdapter.js').MaStudentRecord[]} */ (
            documents.getDataset(MA_DATASETS.STUDENT_RECORDS_BY_DOMAIN).get(pool.id)
        );
    }

    /** @override */
    _getColumns() {
        const interfacePath = this._interfaceGlossaryPath;
        // Resolved once per column build: the tooltip runs in every cell render.
        const tooltip = this.options.context.glossary.getRequiredEntryText(
            `${interfacePath}.student-link.tooltip`,
        );
        const baseColumns = this._createIdentityColumns(
            (rowData) =>
                applyTemplateTokens(tooltip, {
                    name: formatStudentFullName(/** @type {StudentName} */ (rowData)),
                }),
            this.options.context.documents.getDataset(MA_DATASETS.TRAIT_LABELS),
        );

        const richtigColumn = createRichtigColumn();
        const resultColumns = [
            richtigColumn,
            ...createProgressBarColumns(this.options.context, {
                countLabel: TERM_CONSTANTS.ITEM_COUNT,
                // The Richtig column already shows the correct count.
                skipFields: [/** @type {string} */ (richtigColumn.field)],
            }),
        ];

        if (!this.#isLeitideePool()) {
            resultColumns.push(
                createCompetenceLevelColumn(this.options.context.palette, { headerFilter: true }),
            );
        }

        return [...baseColumns, ...resultColumns];
    }

    /**
     * The Aufgabenpool menu before the standard table-local header controls (column
     * visibility, filters, Reset).
     * @override
     * @returns {unknown}
     */
    _tableHeaderActions() {
        return [this.#poolMenu(), super._tableHeaderActions()];
    }

    /**
     * Reset also returns the table to the whole booklet.
     * @override
     */
    _onTableReset() {
        if (this.#pool.peek()) this.#pickPool(null);
    }

    /**
     * Every rows load (the first build and each re-scope) also writes the subtitle of
     * the pool it loads.
     * @override
     * @returns {Promise<void>}
     */
    _reloadRows() {
        this.setSubtitle(this.#poolSubtitle());
        return super._reloadRows();
    }

    /**
     * @override
     * @returns {import('../../../common/tables/preset.js').PresetSpec[]}
     */
    _getPresets() {
        const ranks = createGroupRankPresets('correctCount');

        // Offered only when the group's cut scores count solved items like
        // `correctCount` (the dataset is null otherwise), and on a Leitidee greyed out:
        // the Kompetenzstufe is the whole booklet's. The rank presets stay first: the
        // index-based carry-over in `updatePresets` relies on it.
        const thresholds = this.options.context.documents.getDataset(
            MA_DATASETS.GROUP_COMPETENCE_LEVEL_THRESHOLDS,
        );
        if (!thresholds) return ranks;

        // One point either way changes the student's Kompetenzstufe: a score at a
        // level's floor, or one point below it.
        return [
            ...ranks,
            {
                key: 'near-boundary',
                sort: { column: 'correctCount', dir: 'desc' },
                filters: [
                    (row) =>
                        thresholds.includes(row.correctCount) ||
                        thresholds.includes(row.correctCount + 1),
                ],
                unavailable: this.#isLeitideePool(),
            },
        ];
    }

    // ========================================================================
    // ITEM POOL
    // ========================================================================

    /**
     * The Aufgabenpool menu: one radio row per pool, "Gesamt" first. A booklet without a
     * Leitidee split has one pool and no menu.
     * @returns {unknown} The dropdown, or `nothing`.
     */
    #poolMenu() {
        const pools = this.options.context.documents.getDataset(MA_DATASETS.ITEM_POOLS);
        if (pools.length < 2) return nothing;
        const active = this.#pool.value ?? pools[0];
        const label = this.options.context.glossary.getRequiredEntryText(
            `${this._interfaceGlossaryPath}.pool-menu.label`,
        );
        return headerActionRadioDropdown({
            name: 'item-pool',
            ariaLabel: `${label}: ${active.label}`,
            menuLabel: label,
            buttonContent: renderIcon('category'),
            options: pools,
            getSelected: () => (this.#pool.peek() ?? pools[0]).id,
            onSelect: (id) => this.#pickPool(pools.find((pool) => pool.id === id) ?? null),
        });
    }

    /**
     * Pick a pool: the menu shows it at once, the table re-scopes once it is built and
     * shown, and a later pick replaces a waiting one.
     * @param {MaItemPool|null} pool - Null or the whole-booklet pool for Gesamt.
     */
    #pickPool(pool) {
        this.#pool.value = pool?.type === 'leitidee' ? pool : null;
        this.deferUntilReady('poolChange', () => this.#applyPool());
    }

    /**
     * The subtitle of the shown pool, which says what the Lösungsquoten count: the
     * whole booklet's items, or a Leitidee's few (noisy, and without a Kompetenzstufe).
     * None for a booklet without a Leitidee split, which has no menu.
     * @returns {import('lit').TemplateResult|null}
     */
    #poolSubtitle() {
        const pools = this.options.context.documents.getDataset(MA_DATASETS.ITEM_POOLS);
        if (pools.length < 2) return null;
        const pool = this.#shownPool ?? pools[0];
        // The rows' own N ("x von N"), not the item list's IQB ids: the results also
        // count items without an id. The largest, as a student without results has 0.
        const count = Math.max(0, ...this._readStudentRecords().map((row) => row.totalCount));
        const entry =
            pool.type !== 'leitidee'
                ? 'pool-hint-all'
                : count === 1
                  ? 'pool-hint-single-item'
                  : 'pool-hint';
        const text = applyTemplateTokens(
            this.options.context.glossary.getRequiredEntryText(
                `${this._interfaceGlossaryPath}.${entry}.body`,
            ),
            { pool: pool.label, count },
        );
        // A template, not markup: the pool's label comes from the payload.
        return html`${text}`;
    }

    /**
     * The pool changed: re-scope the table once the switch before it is done. A burst
     * of switches collapses — each re-scope reads the latest pool.
     * @returns {Promise<void>} Resolves once the table shows the latest pool.
     */
    #applyPool() {
        // Caught here, so one failed re-scope does not leave the chain rejected and
        // skip every pool switch after it.
        this.#rescoping = this.#rescoping
            .then(() => this.#rescope())
            .catch((error) =>
                console.error(`MaGroupTableModule[${this.id}]: re-scope failed:`, error),
            );
        return this.#rescoping;
    }

    /**
     * Re-scope the table to the current pool in place: only the Kompetenzstufe column,
     * the rows' counts and the preset set differ between pools, so the Tabulator
     * instance and the module shell are updated, not rebuilt (no toolbar flicker).
     * @returns {Promise<void>}
     */
    async #rescope() {
        const pool = this.#pool.peek();
        if (pool === this.#shownPool) return;
        // Without a table yet the next build reads the pool itself: it is shown then.
        this.#shownPool = pool;
        // The export identity reads `#shownPool`, a plain field the export control's
        // signal tracking cannot see.
        this.syncExportControls();
        if (!this.table) return;

        await this._reloadRows();
    }

    /**
     * One instance serves every Leitidee: a pool switch rescopes the columns and
     * rows in place, so the pool is what tells two captures apart.
     * @override
     */
    getExportIdentity() {
        return this.#shownPool?.id ?? null;
    }
}

customElements.define('tba-ma-group-table', MaGroupTableModule);
