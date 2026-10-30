/**
 * GroupComparisonChart — the SL group comparison: two groups on one metric, drawn as
 * a population pyramid. Every chart type is a registry row (`CHART_TYPE_CONFIG`) whose
 * preparer returns the one row model `drawPyramid()` draws, so adding a type is a row
 * rather than a renderer.
 */

import { createState, writeState } from '@tba3/module-base';
import { ChartRenderer } from '../../../../common/charts/renderers/chartRenderer.js';
import { CHART_TYPE_CONFIG, groupLabelOf, subjectGroupOf } from './groupComparisonChartTypes.js';
import { drawPyramid, measurePyramidMargins } from './groupComparisonPyramidRender.js';
import {
    getValidCategoryOptions,
    ensureValidCategory,
    resolveDefaultGroups,
    buildGroupOptions,
    buildChartTypeOptions,
    buildSubjectControl,
    getUniqueValuesForCategory,
} from './groupComparisonControlModel.js';
import { shareRows } from '../../../../common/charts/shareRows.js';
import { shareCountCell, shareCountColumn } from '../../../../common/charts/dataTableCells.js';
import { TERM_CONSTANTS } from '../../../../common/domain/terms.js';

/** @typedef {import('./groupComparisonChartTypes.js').GroupComparisonSelection} GroupComparisonSelection */

/**
 * One selector of the control strip.
 * @typedef {object} GroupComparisonControl
 * @property {string} id
 * @property {string} label
 * @property {string|null} selectedValue
 * @property {Array<{value: string, text: string, disabled?: boolean}>} options - A disabled one stays listed but cannot be picked.
 * @property {boolean} [disabled]
 * @property {(value: string) => void} apply
 */

/**
 * The rows a selection draws, or `null` when it has nothing to draw.
 * @typedef {(selection: GroupComparisonSelection) => import('./groupComparisonChartTypes.js').ComparisonRecord[]|null} GroupComparisonRowsOf
 */

export class GroupComparisonChart extends ChartRenderer {
    /** @type {import('./groupComparisonChartTypes.js').GroupComparisonSources} */
    #sources;

    /** @type {GroupComparisonRowsOf} */
    #rowsOf;

    /** @type {(selection: GroupComparisonSelection) => boolean} Whether a selection's Lösungsquoten mix booklets (`POINTS_MIXED_BOOKLETS`). */
    #pointsMixedBooklets;

    /**
     * @param {HTMLElement} container
     * @param {{sources: import('./groupComparisonChartTypes.js').GroupComparisonSources, rowsOf: GroupComparisonRowsOf, pointsMixedBooklets: (selection: GroupComparisonSelection) => boolean}} data - The payloads, the rows each selection draws, and whether its Lösungsquoten mix booklets.
     * @param {import('../../../../common/charts/renderers/chartRenderer.js').ChartRendererOptions} options - The app's context.
     */
    constructor(container, { sources, rowsOf, pointsMixedBooklets }, options) {
        super(container, options);

        this.#sources = sources;
        this.#rowsOf = rowsOf;
        this.#pointsMixedBooklets = pointsMixedBooklets;

        // The default pair depends on the payload, so it is seeded once the selectors'
        // defaults are in.
        /** @type {import('@tba3/module-base').State<GroupComparisonSelection>} */
        this.state = createState(
            /** @type {import('@tba3/module-base').StateInit<GroupComparisonSelection>} */ ({
                chartType: 'competenceLevel',
                subjectIndex: 0,
                category: 'gender',
                scopeFilter: null,
                group1: null,
                group2: null,
            }),
        );
        writeState(this.state, this.#defaultGroups(this.selection));
    }

    /**
     * A snapshot of the selection, for reading; every write goes through `writeState()`.
     * It reads the state's signals, so a `computed` over it follows every change (the
     * host's `selection` and `controls`).
     * @returns {GroupComparisonSelection}
     */
    get selection() {
        const state = this.state;
        return {
            chartType: state.chartType.value,
            subjectIndex: state.subjectIndex.value,
            category: state.category.value,
            scopeFilter: state.scopeFilter.value,
            group1: state.group1.value,
            group2: state.group2.value,
        };
    }

    /**
     * @returns {boolean} True when the payload names a Fach/Domäne.
     * @override
     */
    validateData() {
        if (this.#sources.subjectDomainList.length === 0) {
            console.warn('[GroupComparisonChart] No domain data provided');
            return false;
        }
        return true;
    }

    /**
     * @override
     * @param {import('./groupComparisonPyramidRender.js').PyramidBar} bar
     * @param {{measureLabel?: string}} context - What its row measures.
     * @returns {import('../../../../common/services/cursorTooltip.js').TooltipContent} The segment's share and headcount in its group.
     */
    formatTooltipContent({ group, label, segment }, { measureLabel = '' } = {}) {
        return {
            title: group.label,
            rows: shareRows({
                label: measureLabel,
                value: label,
                share: segment.share,
                count: segment.count,
                total: group.count,
            }),
        };
    }

    /**
     * Both groups' defaults for a selection's category (`resolveDefaultGroups`); with no
     * values both clear, so no pair from the previous category lingers.
     * @param {GroupComparisonSelection} selection
     * @returns {{group1: string|null, group2: string|null}}
     */
    #defaultGroups(selection) {
        const entry = this.#sources.subjectDomainList[selection.subjectIndex];
        const groups = resolveDefaultGroups(this.#uniqueValues(selection), {
            category: selection.category,
            currentSubject: entry && subjectGroupOf(entry, selection.chartType),
        });
        return { group1: groups?.group1 ?? null, group2: groups?.group2 ?? null };
    }

    /**
     * The values a selection's category offers, read from the rows the chart draws for
     * it, so a selector never scans rows the store has already built.
     * @param {GroupComparisonSelection} selection
     * @returns {string[]}
     */
    #uniqueValues(selection) {
        return getUniqueValuesForCategory(this.#rowsOf(selection), selection.category);
    }

    /**
     * The selectors, in strip order — and the only home of the control-id vocabulary.
     * Each entry carries its own `apply`, so a caller dispatches a change without
     * knowing which ids exist.
     *
     * Every control here is an *identity* control: it decides what is compared, not
     * how one comparison is drawn. `chartType` counts despite its "Diagrammtyp" label
     * — it picks the measured quantity (Kompetenzstufen, Lösungsquote, Selbstwirksamkeit,
     * Unterrichtsqualität), each backed by its own payload, so each is its own card.
     * That is why the whole model feeds the host's export identity.
     * @returns {GroupComparisonControl[]}
     */
    getControlModel() {
        const selection = this.selection;
        const controlLabel = (/** @type {string} */ id) =>
            this.context.glossary.getRequiredEntryText(
                `sl.comparison.comparison-plot.interface.${id}.label`,
            );
        const subjectControl = buildSubjectControl(
            selection,
            this.#sources.subjectDomainList,
            controlLabel('subjectIndex-none'),
        );
        const uniqueValues = this.#uniqueValues(selection);
        const labelOf = groupLabelOf(this.#sources, selection);
        return [
            {
                id: 'chartType',
                label: controlLabel('chartType'),
                selectedValue: selection.chartType,
                options: buildChartTypeOptions(this.#sources, {
                    // Judged on the pair a switch to it compares: under the Kategorie
                    // Fach, Kompetenzstufen compare Fach/Domänen, the Lösungsquote Fächer.
                    pointsMixedBooklets: this.#pointsMixedBooklets(
                        this.#withValidCategory({ chartType: 'points' }),
                    ),
                }),
                apply: (value) =>
                    this.#selectWithValidCategory({
                        chartType: /** @type {GroupComparisonSelection['chartType']} */ (value),
                    }),
            },
            {
                id: 'subjectIndex',
                label: controlLabel('subjectIndex'),
                selectedValue: subjectControl.selectedValue,
                options: subjectControl.options,
                disabled: subjectControl.disabled,
                apply: (value) => this.#applySubjectSelection(value),
            },
            {
                id: 'scopeFilter',
                label: controlLabel('scopeFilter'),
                selectedValue: selection.scopeFilter || '__all__',
                options: [
                    { value: '__all__', text: TERM_CONSTANTS.SCHOOL },
                    ...this.#scopeGroups(selection).map((value) => ({
                        value,
                        text: value,
                    })),
                ],
                apply: (value) =>
                    this.#selectWithValidCategory({
                        scopeFilter: value === '__all__' ? null : value,
                    }),
            },
            {
                id: 'category',
                label: controlLabel('category'),
                selectedValue: selection.category,
                options: getValidCategoryOptions(selection),
                // The options are the valid categories, so a picked value is one.
                apply: (value) =>
                    this.#applyCategorySelection(
                        /** @type {GroupComparisonSelection['category']} */ (value),
                    ),
            },
            {
                id: 'group1',
                label: controlLabel('group1'),
                selectedValue: selection.group1,
                options: buildGroupOptions(uniqueValues, selection.group2, labelOf),
                apply: (value) => this.#applyGroupSelection('group1', value),
            },
            {
                id: 'group2',
                label: controlLabel('group2'),
                selectedValue: selection.group2,
                options: buildGroupOptions(uniqueValues, selection.group1, labelOf),
                apply: (value) => this.#applyGroupSelection('group2', value),
            },
        ];
    }

    /**
     * Adopt a new Fach/Domäne, given as its index among the subject options.
     * @param {string} newValue
     */
    #applySubjectSelection(newValue) {
        const { chartType, category } = this.selection;
        if (CHART_TYPE_CONFIG[chartType].subjectScope === 'none' || category === 'subject') return;

        const subjectIndex = Number.parseInt(newValue, 10);
        if (Number.isNaN(subjectIndex)) return;

        this.#selectWithValidCategory({ subjectIndex });
    }

    /**
     * Adopt a new Kategorie; both groups reset to its defaults.
     * @param {GroupComparisonSelection['category']} category
     */
    #applyCategorySelection(category) {
        writeState(this.state, {
            category,
            ...this.#defaultGroups({ ...this.selection, category }),
        });
    }

    /**
     * The groups a selection can be narrowed to: those with rows in its measure and
     * Fach/Domäne before it is narrowed to one.
     * @param {GroupComparisonSelection} selection
     * @returns {string[]}
     */
    #scopeGroups(selection) {
        return this.#uniqueValues({ ...selection, category: 'group', scopeFilter: null });
    }

    /**
     * The selection a new measure, Fach/Domäne or scope leads to. A scope group without
     * rows in the new selection falls back to the Schule, and the Kategorie to one valid
     * for the new selection; the pair stays while both groups still have rows there, and
     * otherwise both reset to the Kategorie's defaults, so no select is left on a value it
     * no longer offers.
     * @param {Partial<Pick<GroupComparisonSelection, 'chartType'|'subjectIndex'|'scopeFilter'>>} change
     * @returns {GroupComparisonSelection}
     */
    #withValidCategory(change) {
        const next = { ...this.selection, ...change };
        if (next.scopeFilter !== null && !this.#scopeGroups(next).includes(next.scopeFilter)) {
            next.scopeFilter = null;
        }
        const category = /** @type {GroupComparisonSelection['category']} */ (
            ensureValidCategory(next.category, next)
        );
        const values = this.#uniqueValues({ ...next, category });
        const pairStays =
            category === this.selection.category &&
            [next.group1, next.group2].every((group) => group !== null && values.includes(group));
        const groups = pairStays ? {} : this.#defaultGroups({ ...next, category });
        return { ...next, category, ...groups };
    }

    /**
     * Adopt a new measure, Fach/Domäne or scope (`#withValidCategory`).
     * @param {Partial<Pick<GroupComparisonSelection, 'chartType'|'subjectIndex'|'scopeFilter'>>} change
     */
    #selectWithValidCategory(change) {
        writeState(this.state, this.#withValidCategory(change));
    }

    /**
     * Adopt one group's new value. Picking the other group's value moves that group to
     * the next one, so the pair never compares a group with itself.
     * @param {'group1'|'group2'} key
     * @param {string} value
     */
    #applyGroupSelection(key, value) {
        const otherKey = key === 'group1' ? 'group2' : 'group1';
        let other = this.selection[otherKey];
        if (value === other) {
            other =
                this.#uniqueValues(this.selection).find((candidate) => candidate !== value) ||
                other;
        }
        writeState(this.state, { [key]: value, [otherKey]: other });
    }

    /**
     * @override
     * @returns {import('../../../../common/charts/host/chartDataTable.js').ChartDataTable|null} `null` while a message stands in for the pyramid.
     */
    dataTable() {
        if (this.#sources.subjectDomainList.length === 0) return null;
        const prepared = this.#prepareData();
        if (!('data' in prepared)) return null;
        const { measureLabel, rows, groups } = prepared.data;
        return {
            columns: [
                { label: measureLabel },
                ...groups.map((group) => shareCountColumn(group.label)),
            ],
            rows: rows.map((row, index) => [
                // One label, or the groups' own where their ladders name the band apart.
                { text: [...new Set(row.labels)].join(' / ') },
                ...groups.map((group) => {
                    const { share, count } = group.rows[index];
                    return shareCountCell(share, count);
                }),
            ]),
        };
    }

    /**
     * Draw the selection's pyramid, or move the drawn one to it: every selector change
     * redraws in place, and `drawPyramid` joins the marks, so a group swap or a new
     * measure animates from what is on screen.
     * @override
     */
    renderChart() {
        const durationMs = this.drawDurationMs;
        const { g, layout } = this.initializeSVG(measurePyramidMargins(this));
        this.#draw({ g, plot: layout.chart }, this.#prepareData(), durationMs);
    }

    /**
     * The current selection's comparison: its rows, split and counted by the chart
     * type's preparer, or the glossary key of the message that says why there is none.
     * @returns {{ data: import('./groupComparisonDataUtils.js').GroupComparisonChartData } | { messageKey: string }}
     */
    #prepareData() {
        // A category with a single value has nothing to compare it with.
        if (this.#uniqueValues(this.selection).length === 1) {
            return { messageKey: 'sl.comparison.comparison-plot.messages.one-group' };
        }
        const config = CHART_TYPE_CONFIG[this.selection.chartType];
        // The control disables the Lösungsquote for such a pair, but one already on it
        // stays: the message says why, and picking another measure moves on.
        if (this.selection.chartType === 'points' && this.#pointsMixedBooklets(this.selection)) {
            return { messageKey: 'sl.comparison.comparison-plot.messages.points-mixed-booklets' };
        }
        // The same rows the info box summarises for this selection.
        const rows = this.#rowsOf(this.selection);
        if (!rows) return { messageKey: config.noDataMessageKey };
        const data = config.prepare(rows, this.selection, this.#sources, this.context.palette);
        return data.rows.length > 0
            ? { data }
            : { messageKey: 'sl.comparison.comparison-plot.messages.no-groups' };
    }

    /**
     * Draw the prepared comparison, or say over an empty plot why nothing can be drawn.
     * @param {import('./groupComparisonPyramidRender.js').PyramidTarget} target
     * @param {{ data: import('./groupComparisonDataUtils.js').GroupComparisonChartData } | { messageKey: string }} prepared
     * @param {number} durationMs - How long the drawn pyramid moves.
     */
    #draw(target, prepared, durationMs) {
        if ('data' in prepared) {
            drawPyramid(this, target, prepared.data, { durationMs });
            return;
        }

        // The message stands alone: the pyramid it replaces goes, its transitions with it.
        target.g.selectAll('*').interrupt().remove();
        this.renderNoDataOverlay(this.context.glossary.getRequiredEntryText(prepared.messageKey));
    }
}
