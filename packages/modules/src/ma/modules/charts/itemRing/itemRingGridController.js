import { ItemRingChart } from './itemRingBase.js';
import { lastRowPlacement, resolveItemRingGrid } from './itemRingGridLayout.js';
import {
    headerActionButton,
    headerActionRadioDropdown,
    onChange,
    queryEl,
    renderIcon,
    resizeService,
    sameItems,
} from '@tba3/module-base';
import { html, nothing, render } from 'lit';
import { legendSwatchListTemplate } from '../../../../common/charts/legend/htmlLegendPanel.js';
import { MANNEQUIN_PATH } from './itemRingFigure.js';
import { groupStats, ringFigures, selectionCounter } from './ringStatistics.js';
import { ringSelection, studentSelection } from './selection.js';
import {
    findOwningModuleTitle,
    markScrollRegion,
    unmarkScrollRegion,
} from '../../../../common/utils/scrollRegion.js';
import * as d3 from 'd3';
import { MA_DATASETS } from '../../../maDatasets.js';
import { resolveGrouping, resolveShownRing, ringItems } from '../../../utils/maItemRings.js';
import { TERM_CONSTANTS } from '../../../../common/domain/terms.js';
import { percentOf, toPercent } from '../../../../common/domain/itemResultCounts.js';
import { figureCell, percentColumn } from '../../../../common/charts/dataTableCells.js';
import { formatCount } from '../../../../common/utils/numberFormat.js';
import { DATA_MARK_CLASS } from '../../../../common/services/dataMark.js';
import { applyTemplateTokens } from '@tba3/module-base/glossary';

/** @typedef {import('./itemRingGridConfig.js').ItemRingGridChartHost} ItemRingGridChartHost */
/** @typedef {import('../../../utils/maItemRings.js').ItemRingChartDefinition} ItemRingChartDefinition */
/** @typedef {import('./itemRingGridLayout.js').ItemRingGridLayout} ItemRingGridLayout */
/** @typedef {import('../../../utils/maItemDataAdapter.js').MaItemRecord} MaItemRecord */
/** @typedef {import('../../../utils/maStudentDataAdapter.js').MaStudentRecord} MaStudentRecord */
/** @typedef {d3.Selection<HTMLButtonElement | HTMLDivElement, unknown, null, undefined>} RingCellSelection */

/**
 * The selection the rings draw is not part of this: it is the host's.
 * @typedef {object} GridBuildInput
 * @property {ItemRingChartDefinition[]} chartDefs - The rings, "Gesamt" first.
 * @property {MaItemRecord[]} itemArray - Every item of the booklet.
 * @property {MaStudentRecord[]} studentArray - Every student of the group.
 */

const RESIZE_DEBOUNCE_MS = 150;

/** The keys the grid's keyboard model reads (#wireGridKeyboard). */
const GRID_KEYS = new Set(['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'Home', 'End']);

/** @type {{[key: string]: number}} The ring steps from a mark: ←/→ are the ring's own walk. */
const RING_STEPS = { ArrowDown: 1, ArrowUp: -1 };

/** @type {{[key: string]: number}} The ring steps from a selectable ring's button. */
const BUTTON_STEPS = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 };

/**
 * Resolve the live chart area the item-ring grid draws into (`host.chartArea`).
 * @param {ItemRingGridChartHost} host
 * @returns {HTMLElement|null} `null` once the host is destroyed or detached.
 */
function getLiveItemRingContainer(host) {
    const container = host.chartArea;

    if (host.destroyed || !container.isConnected) {
        return null;
    }

    return container;
}

/**
 * The item-ring grid's layout, resize and selection. What the grid shows — the selected
 * students, the selected ring, the inner ring — is the host's state, the grouping the
 * app's; what it derived to show it is kept here. The grid follows the host's `student`
 * and `ringId` options into that state.
 */
export class ItemRingGridController {
    /** @type {(() => void)|null} Releases the grid's resize observation. */
    #unobserveResize = null;
    /** @type {(() => void)|null} Stops the legend following the selection and the inner ring. */
    #unfollowLegend = null;
    /**
     * @type {ItemRingChartDefinition[]} The rings the live grid was built from: a
     * relayout indexes the live rings by position, so it reads this list, not the
     * grouping in force, which may already have moved on before `rebuildOn` rebuilds.
     */
    #chartDefs = [];
    /** The name of the grouping the live grid was built from, which heads its table's ring column. */
    #groupingLabel = '';

    /**
     * Built in the host's setup: from then on the selection follows the `student` option
     * and the selected ring the `ringId` option.
     * @param {ItemRingGridChartHost} host
     */
    constructor(host) {
        this.host = host;
        const { student, ringId } = host.options;
        if (student) {
            host.onChange(
                () => student.value,
                (studentId) => {
                    host.state.selectedStudents.value = studentSelection(studentId);
                },
            );
        }
        if (ringId) {
            host.onChange(
                () => ringId.value,
                () => {
                    // A grid not built yet takes the ring when it is.
                    if (this.#chartDefs.length > 0) this.#selectRing(this.#shownRingId());
                },
            );
        }
    }

    /** @returns {string[]|null} `null` draws the group figures. */
    get #selectedStudents() {
        return this.host.state.selectedStudents.value;
    }

    /** @returns {boolean} */
    get #innerRingVisible() {
        return this.host.state.innerRingVisible.value;
    }

    /** @returns {MaStudentRecord[]} Every student of the group: what a selection is judged against. */
    get #students() {
        return this.host.options.context.documents.getDataset(MA_DATASETS.STUDENT_RECORDS);
    }

    /** @returns {import('../../../utils/maItemRings.js').ItemRingSets} Every grouping's rings. */
    get #ringSets() {
        return this.host.options.context.documents.getDataset(MA_DATASETS.ITEM_RINGS);
    }

    /**
     * The grouping in force: the `ringGrouping` option's, or the Leitidee when it is unset or names a
     * grouping this payload lacks — the rings, the subtitle and the menu's tick agree.
     * @returns {import('../../../utils/maItemRings.js').ItemRingGrouping}
     */
    #currentGrouping() {
        return resolveGrouping(this.#ringSets, this.host.options.ringGrouping.value);
    }

    /**
     * Build the grid DOM and its rings, synchronously: the host's render cycle is
     * what discards a superseded pass, and it can only do that for work that has
     * not already happened out of its sight.
     * @returns {ItemRingChart|ItemRingChart[]} In grid order.
     */
    create() {
        const host = this.host;
        const documents = host.options.context.documents;
        const itemArray = documents.getDataset(MA_DATASETS.ITEM_RECORDS);
        const studentArray = this.#students;
        const { rings, label } = this.#currentGrouping();
        const chartDefs = [this.#ringSets.total, ...rings];
        this.#chartDefs = chartDefs;
        this.#groupingLabel = label;

        if (!itemArray.length || rings.length === 0) {
            this.destroy();
            return new ItemRingChart(host.chartArea, [], studentArray, host.rendererOptions);
        }

        host.state.selectedRing.value = this.#shownRingId();
        // A template, so the payload's grouping label is escaped.
        host.setSubtitle(html`${this.#groupingSubtitle()}`);

        return this.#build({ chartDefs, itemArray, studentArray });
    }

    /**
     * The ring the grid shows selected: with a `ringId` option the ring it names; without
     * one the ring selected before. Either falls back to the
     * grouping's first ring with items, which is also where a grouping switch lands.
     * @returns {string|null} `null` when no ring of the grouping carries items.
     */
    #shownRingId() {
        const { ringId, ringGrouping } = this.host.options;
        const requested = ringId ? ringId.peek() : this.host.state.selectedRing.peek();
        return resolveShownRing(this.#ringSets, ringGrouping.peek(), requested).ringId;
    }

    /**
     * Select a ring the way a ring click does, without reporting it. Nothing changes for
     * a ring that is already selected or that cannot be selected (an empty ring, a grid
     * without `onRingSelected`, a grid not built yet).
     * @param {string|null} ringId
     * @returns {boolean} Whether the selection moved.
     */
    #selectRing(ringId) {
        if (!ringId || this.host.state.selectedRing.value === ringId) return false;

        const container = getLiveItemRingContainer(this.host);
        if (!container) return false;

        if (!markSelectedRing(container, ringId)) return false;
        this.host.state.selectedRing.value = ringId;
        return true;
    }

    /**
     * Undo what the grid put on the chart area, so the host can be re-rendered — or torn
     * down — without leaving its resize observer or scroll-region marks behind.
     */
    destroy() {
        this.#unobserveResize?.();
        this.#unobserveResize = null;
        this.#unfollowLegend?.();
        this.#unfollowLegend = null;
        const container = getLiveItemRingContainer(this.host);
        const grid = container?.querySelector('.item-ring-grid-body');
        if (grid instanceof HTMLElement) unmarkScrollRegion(grid);
        container?.classList.remove('item-ring-grid-host');
    }

    /**
     * One tab stop for the whole grid, the grid body: ↓, → and Home from it enter the
     * first ring (End the last; ↑ and ← do nothing), ↑/↓ move between rings, and ←/→ walk the marks of a ring
     * (its own MarkKeyboard), or move between rings whose card is the button. A ring is
     * entered on its card's button, else its first shown mark. Bound in the capture
     * phase, so a ring's own walk never sees ↑/↓.
     * @param {HTMLElement} gridElement - The `.item-ring-grid-body`.
     * @param {ReadonlyArray<ItemRingChart>} rings - The rings, in the order of their cards.
     */
    #wireGridKeyboard(gridElement, rings) {
        const cards = [...gridElement.querySelectorAll(':scope > .item-ring-card')];
        /**
         * The first ring from `from` on, stepping by `step`, that the keyboard can enter.
         * @param {number} from
         * @param {number} step
         * @returns {Element|null} Its card's button, else its first shown mark.
         */
        const entryFrom = (from, step) => {
            for (let index = from; index >= 0 && index < cards.length; index += step) {
                const entry = cards[index].matches('button')
                    ? cards[index]
                    : rings[index].firstShownMark();
                if (entry) return entry;
            }
            return null;
        };
        gridElement.addEventListener(
            'keydown',
            (event) => {
                if (!GRID_KEYS.has(event.key)) return;
                const target = /** @type {Element} */ (event.target);
                /** @type {Element|null} */
                let entry;
                if (target === gridElement) {
                    if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') return;
                    entry = event.key === 'End' ? entryFrom(cards.length - 1, -1) : entryFrom(0, 1);
                } else {
                    const card = target.closest('.item-ring-card');
                    const at = card ? cards.indexOf(card) : -1;
                    if (at === -1) return;
                    const onButton = card === target && target.matches('button');
                    /** @type {number|undefined} */
                    const step = (onButton ? BUTTON_STEPS : RING_STEPS)[event.key];
                    if (step === undefined) return;
                    // Past the first or last ring, focus stays where it is.
                    entry = entryFrom(at + step, step);
                }
                event.preventDefault();
                event.stopPropagation();
                /** @type {HTMLElement|SVGElement|null} */ (entry)?.focus();
            },
            { capture: true },
        );
    }

    /**
     * Select the students of one Kompetenzstufe, resolved from the student records: the
     * host's selection signal, which every live ring shares and so redraws from. A
     * selection that already holds exactly those students is left as it is.
     * @param {string|null} level - `null` clears.
     */
    setCompetenceLevelFilter(level) {
        const filtered = level
            ? this.#students.filter((s) => s.competenceLevelName === level).map((s) => s.studentId)
            : null;
        if (sameItems(filtered, this.#selectedStudents)) return;
        this.host.state.selectedStudents.value = filtered;
    }

    /**
     * The grid as tables: first each ring's totals, as its centre prints them (Gesamt
     * included), then one row per item, ring by ring (Gesamt left out, as every item is
     * in it). Read in the host's table effect, so it follows the selection.
     * @returns {import('../../../../common/charts/host/chartDataTable.js').ChartDataTables} `null` with no item in any ring.
     */
    dataTable() {
        const items = this.#itemTable();
        return items ? [this.#ringTotalsTable(), items] : null;
    }

    /**
     * One row per ring: its item count and the Lösungsquote its centre shows, the
     * group's and, with a proper subset of students selected, the selection's.
     * @returns {import('../../../../common/charts/host/chartDataTable.js').ChartDataTable}
     */
    #ringTotalsTable() {
        const { documents, glossary, palette } = this.host.options.context;
        const items = documents.getDataset(MA_DATASETS.ITEM_RECORDS);
        const selection = ringSelection(glossary, this.#selectedStudents, this.#students);
        const rate = TERM_CONSTANTS.SOLUTION_RATE;
        return {
            columns: [
                { label: this.#groupingLabel },
                { label: TERM_CONSTANTS.SUBTASKS, fields: [TERM_CONSTANTS.SUBTASKS] },
                percentColumn(`${rate} ${TERM_CONSTANTS.GROUP}`),
                ...(selection.isSubset ? [percentColumn(`${rate} ${selection.name}`)] : []),
            ],
            rows: this.#chartDefs.map((ring) => {
                const ringItemArray = ringItems(items, ring);
                const group = groupStats(palette, ringItemArray);
                const shown = ringFigures(palette, ringItemArray, selection, group).ringStats;
                const rateOf = (/** @type {typeof group} */ stats) =>
                    figureCell(stats.totalOpportunities > 0 ? stats.successRate : null);
                return [
                    { text: ring.title },
                    figureCell(group.totalItems, formatCount),
                    rateOf(group),
                    ...(selection.isSubset ? [rateOf(shown)] : []),
                ];
            }),
        };
    }

    /**
     * @returns {import('../../../../common/charts/host/chartDataTable.js').ChartDataTable|null} One row per item, ring by ring; `null` with no item in any ring.
     */
    #itemTable() {
        const { documents, glossary } = this.host.options.context;
        const items = documents.getDataset(MA_DATASETS.ITEM_RECORDS);
        const students = this.#students;
        const rows = this.#chartDefs
            .slice(1)
            .flatMap((ring) => ringItems(items, ring).map((item) => ({ ring, item })));
        if (rows.length === 0) return null;
        const selection = ringSelection(glossary, this.#selectedStudents, students);
        const subset = selection.isSubset;
        const pilots = items.some((item) => item.pilotSolutionFrequency !== null);
        const rate = TERM_CONSTANTS.SOLUTION_RATE;
        // The selection's Lösungsquote of one item, counted as its ring counts it: none
        // where no selected student was scored on it.
        const countSelection = subset
            ? selectionCounter(/** @type {ReadonlyArray<string>} */ (selection.ids))
            : null;
        /**
         * @param {MaItemRecord} item
         * @returns {number|null}
         */
        const selectionRate = (item) => {
            const counted = countSelection?.(item);
            return counted ? percentOf(counted[0], counted[1]) : null;
        };
        return {
            columns: [
                { label: TERM_CONSTANTS.SUBTASK },
                { label: TERM_CONSTANTS.EXERCISE },
                { label: this.#groupingLabel },
                { label: TERM_CONSTANTS.ITEM_COMPETENCE_LEVEL },
                percentColumn(`${rate} ${TERM_CONSTANTS.GROUP}`),
                ...(subset ? [percentColumn(`${rate} ${selection.name}`)] : []),
                ...(pilots
                    ? [
                          percentColumn(
                              glossary.getRequiredEntryText(
                                  'ma.item.item-ring-grid.tooltips.pilot',
                              ),
                          ),
                      ]
                    : []),
            ],
            rows: rows.map(({ ring, item }) => [
                { text: item.name },
                { text: item.exerciseName },
                { text: ring.title },
                { text: item.competenceLevel },
                figureCell(percentOf(item.solvedCount, item.responseCount)),
                ...(subset ? [figureCell(selectionRate(item))] : []),
                ...(pilots
                    ? [
                          figureCell(
                              item.pilotSolutionFrequency === null
                                  ? null
                                  : toPercent(item.pilotSolutionFrequency),
                          ),
                      ]
                    : []),
            ]),
        };
    }

    /**
     * Build the grid DOM — legend row, grid body, one ring per definition — into the
     * host's live chart area.
     * @param {GridBuildInput} input
     * @returns {ItemRingChart[]} In grid order; none once the host is gone.
     */
    #build({ chartDefs, itemArray, studentArray }) {
        const host = this.host;
        const container = getLiveItemRingContainer(host);
        if (!container) {
            return [];
        }

        const containerSel = d3.select(container);
        containerSel.selectAll('*').remove();
        // A column: the legend row, then the grid, which scrolls in wrap mode and so
        // has to be keyboard-reachable.
        containerSel.classed('item-ring-grid-host', true);
        const legend = /** @type {HTMLDivElement} */ (
            containerSel.append('div').attr('class', 'item-ring-legend').node()
        );
        const drawLegend = () =>
            render(
                itemRingLegendTemplate({
                    innerRingVisible: this.#innerRingVisible,
                    selectedStudents: this.#selectedStudents,
                    studentArray,
                    glossary: this.host.options.context.glossary,
                }),
                legend,
            );
        drawLegend();
        this.#unfollowLegend?.();
        this.#unfollowLegend = onChange(
            () => [this.#selectedStudents, this.#innerRingVisible],
            drawLegend,
        );
        const gridElement = /** @type {HTMLElement} */ (
            containerSel.append('div').attr('class', 'item-ring-grid-body').node()
        );
        markScrollRegion(gridElement, findOwningModuleTitle(container));

        const { layout, titleLayout } = resolveItemRingGrid(chartDefs, gridElement);

        // A ring is selectable only where someone listens for the selection.
        const enableRingSelection = typeof host.options.onRingSelected === 'function';
        const totalId = this.#ringSets.total.id;
        applyGridGeometry(gridElement, layout);
        const chartsContainer = d3.select(gridElement);
        const chartInstances = titleLayout.charts.map((chartDef, index) => {
            // Gesamt and empty rings stay inert: no hover, no click, no selection. A
            // selectable ring is a button, so the keyboard reaches and selects it like a
            // click does.
            const selectable = chartDef.id !== totalId && !chartDef.isEmpty && enableRingSelection;
            const chartItemDiv = chartsContainer
                .append(selectable ? 'button' : 'div')
                // The grid body is the one tab stop (#wireGridKeyboard).
                .attr('tabindex', selectable ? '-1' : null)
                .attr('class', 'item-ring-card')
                .attr('data-ring', chartDef.id)
                .attr('id', `${host.id}-ring-${index}`);

            // Without the `--selectable` class and the handlers, the cell carries neither
            // the pointer cursor nor the highlight outlines.
            if (selectable) this.#wireRingSelection(chartItemDiv, chartDef.id);

            const chart = new ItemRingChart(
                /** @type {HTMLElement} */ (chartItemDiv.node()),
                itemArray,
                studentArray,
                {
                    ...host.rendererOptions,
                    ring: chartDef,
                    selectedStudents: host.state.selectedStudents,
                    innerRingVisible: host.state.innerRingVisible,
                    // The button is the keyboard target; its marks would nest inside it.
                    focusableMarks: !selectable,
                    tabStop: false,
                },
            );
            chart.setTitleLayout(ringTitle(layout, titleLayout, index));
            return chart;
        });
        placeLastRow(gridElement, layout);
        this.#wireGridKeyboard(gridElement, chartInstances);

        // Highlight the resolved ring without reporting it: only a click reports, so
        // a shared `ringId` stays at what a reader chose. It is resolved in
        // create(), never names an empty ring, and is null when none has items.
        const selectedRing = host.state.selectedRing.value;
        if (enableRingSelection && selectedRing) markSelectedRing(gridElement, selectedRing);
        this.#observeResize(container);

        return chartInstances;
    }

    /**
     * The inner-ring toggle of the host's header, while a grid is on screen: the empty
     * stand-in has no inner ring to toggle. A live grid's legend follows the
     * state, so that subscription is what marks one.
     * @returns {unknown} The toggle, or `nothing`.
     */
    innerRingToggle() {
        if (!this.#unfollowLegend) return nothing;
        const visible = this.#innerRingVisible;
        return headerActionButton({
            name: 'inner-ring',
            ariaLabel: this.host.options.context.glossary.getRequiredEntryText(
                'ma.item.item-ring-grid.inner-ring-toggle.label',
            ),
            pressed: visible,
            // The table lists each item's Aufgabenniveau either way.
            inactive: this.host.showsTable,
            // A filled ring while the inner ring is shown, an empty one while it is not.
            buttonContent: renderIcon(visible ? 'radio_button_checked' : 'radio_button_unchecked'),
            // The legend follows the state: its label stops naming the inner ring.
            onClick: () => {
                this.host.state.innerRingVisible.value = !visible;
            },
        });
    }

    /**
     * The grouping dropdown of the host's header, while a grid is on screen: Leitidee,
     * then each competence type the items carry. A payload without competences has only
     * the Leitidee, and so no dropdown.
     * @returns {unknown} The dropdown, or `nothing`.
     */
    groupingDropdown() {
        const grouping = this.host.options.ringGrouping;
        if (!this.#unfollowLegend) return nothing;
        const { groupings } = this.#ringSets;
        if (groupings.length <= 1) return nothing;
        return headerActionRadioDropdown({
            name: 'ring-grouping',
            ariaLabel: this.host.options.context.glossary.getRequiredEntryText(
                'ma.item.item-ring-grid.grouping-toggle.label',
            ),
            buttonContent: renderIcon('category'),
            options: groupings,
            getSelected: () => this.#currentGrouping().id,
            onSelect: (id) => {
                grouping.value = id;
            },
        });
    }

    /**
     * The subtitle naming the grouping the rings follow.
     * @returns {string}
     */
    #groupingSubtitle() {
        return applyTemplateTokens(
            this.host.options.context.glossary.getRequiredEntryText(
                'ma.item.item-ring-grid.grouping-subtitle',
            ),
            { grouping: this.#currentGrouping().label },
        );
    }

    /**
     * Make a ring's cell select its ring and report it to `onRingSelected`.
     * @param {RingCellSelection} chartItemDiv - The ring's cell, a button.
     * @param {string} ringId
     */
    #wireRingSelection(chartItemDiv, ringId) {
        chartItemDiv
            .classed('item-ring-card--selectable', true)
            .attr('type', 'button')
            .attr('aria-pressed', 'false')
            .on('click', () => {
                // Selectable rings are wired only where `onRingSelected` is set.
                if (this.#selectRing(ringId)) this.host.options.onRingSelected?.(ringId);
            });
    }

    /**
     * Re-solve the grid whenever the chart area changes size.
     * @param {HTMLElement} container - The host's live chart area.
     */
    #observeResize(container) {
        // Observing reports the box once on start; the build just solved the grid for
        // that box, so only a box that differs from it is worth solving again.
        let solvedFor = `${container.offsetWidth}x${container.offsetHeight}`;
        this.#unobserveResize?.();
        this.#unobserveResize = resizeService.observe(
            container,
            {
                measure: () => {
                    const el = getLiveItemRingContainer(this.host);
                    if (!el || el.offsetWidth === 0 || el.offsetHeight === 0) return false;
                    const size = `${el.offsetWidth}x${el.offsetHeight}`;
                    if (size === solvedFor) return false;
                    solvedFor = size;
                    return true;
                },
                draw: () => this.#relayout(container),
            },
            { debounceMs: RESIZE_DEBOUNCE_MS },
        );
    }

    /**
     * Fit the grid to a new box without rebuilding it: the ring geometry is CSS, so the
     * solved tracks, cell size and text size go onto the grid body, the partial last row
     * is placed again, and each ring takes its new title layout and redraws into its
     * resized cell — the selection and the inner-ring toggle stay as they are.
     * @param {HTMLElement} container - The host's live chart area.
     */
    #relayout(container) {
        const gridElement = queryEl(container, '.item-ring-grid-body');
        if (!gridElement) return;
        const { layout, titleLayout } = resolveItemRingGrid(this.#chartDefs, gridElement);
        applyGridGeometry(gridElement, layout);
        placeLastRow(gridElement, layout);
        this.host.charts.forEach((chart, index) =>
            chart.setTitleLayout(ringTitle(layout, titleLayout, index)),
        );
        // Measured here, after the geometry write, not in the resize service's measure
        // phase: the new cell sizes exist only once the custom properties are set.
        this.host.drawStale();
    }
}

/**
 * Mark one ring selected and every other selectable ring not.
 * @param {HTMLElement} container - An element holding the rings.
 * @param {string} ringId
 * @returns {boolean} Whether a selectable ring for it exists.
 */
function markSelectedRing(container, ringId) {
    const rings = [...container.querySelectorAll('.item-ring-card--selectable')];
    const target = rings.find(
        (ring) => ring instanceof HTMLElement && ring.dataset.ring === ringId,
    );
    if (!target) return false;
    for (const ring of rings) {
        ring.classList.toggle('selected', ring === target);
        ring.setAttribute('aria-pressed', String(ring === target));
    }
    return true;
}

/**
 * Centre a partial last row under the full ones: its first ring starts at the column
 * `lastRowPlacement` gives, and an odd shortfall moves the row half a cell pitch right,
 * rounded to a whole pixel so the ring edges stay crisp.
 * @param {HTMLElement} gridElement - The grid body; its children are the rings, in order.
 * @param {ItemRingGridLayout} layout
 */
function placeLastRow(gridElement, layout) {
    const cells = /** @type {HTMLElement[]} */ ([...gridElement.children]);
    const lastRow = lastRowPlacement(cells.length, layout.estimatedCols);
    const shift = Math.round((layout.cellWidthPx + layout.columnGap) / 2);
    cells.forEach((cell, index) => {
        cell.style.gridColumnStart =
            lastRow && index === lastRow.firstIndex ? String(lastRow.columnStart) : '';
        cell.style.transform =
            lastRow?.halfCellShift && index >= lastRow.firstIndex ? `translateX(${shift}px)` : '';
    });
}

/**
 * One ring's share of the solved grid: the text size of every cell, its own title lines,
 * and the line count every cell's title band reserves.
 * @param {ItemRingGridLayout} layout
 * @param {import('./itemRingGridLayout.js').ItemRingTitleLayout} titleLayout
 * @param {number} index - The ring's position in grid order.
 * @returns {import('./itemRingBase.js').RingTitle}
 */
function ringTitle(layout, titleLayout, index) {
    return {
        fontSize: layout.fontSize,
        titleLines: titleLayout.charts[index].titleLines,
        titleLineCount: titleLayout.titleLineCount,
    };
}

/**
 * Hand the solved geometry to the stylesheet: tracks and cell size as custom properties
 * on the grid body, which the `.item-ring-grid-body` rules in `itemRingBase.css` read.
 * @param {HTMLElement} gridElement - The grid body.
 * @param {ItemRingGridLayout} layout
 */
function applyGridGeometry(gridElement, layout) {
    const { style } = gridElement;
    style.setProperty('--ring-cols', String(layout.estimatedCols));
    style.setProperty('--ring-rows', String(layout.estimatedRows));
    style.setProperty('--ring-w', `${layout.cellWidthPx}px`);
    style.setProperty('--ring-h', `${layout.cellHeightPx}px`);
    style.setProperty('--ring-fs', `${layout.fontSize}px`);
    gridElement.toggleAttribute('data-wrap', layout.wrapMode);
}

/**
 * The German legend text for one of the row's entries.
 * @param {import('../../../../common/glossary/glossaryAnnotator.js').GlossaryAnnotator} glossary
 * @param {string} key - The key under the grid's `legend` entry.
 * @returns {string}
 */
function legendText(glossary, key) {
    return glossary.getRequiredEntryText(`ma.item.item-ring-grid.legend.${key}`);
}

/**
 * The ring's selection figure in miniature, for the legend.
 * @returns {SVGSVGElement}
 */
function mannequinNode() {
    const root = d3.create('svg').attr('viewBox', '-3.5 -6.25 7 12.5');
    root.append('path').attr('d', MANNEQUIN_PATH);
    return /** @type {SVGSVGElement} */ (root.node());
}

/**
 * The one-row key to a ring's encodings, HTML under the card title, on the shared swatch
 * key's row variant (html-legend-panel.css). Gelöst against nicht gelöst, which both
 * rings say — the outer one by swapping colour, the level band by dropping to the same
 * 0.35 its unsolved arcs composite at — in one neutral swatch, whose label names which
 * ring is which; the Pilotierung tick; and, while a selection is drawn, its tick and
 * figure. The tick and figure entries lead with the mark as the ring draws it.
 * @param {object} input
 * @param {boolean} input.innerRingVisible - The label stops naming the level ring while it is hidden.
 * @param {string[]|null} input.selectedStudents
 * @param {MaStudentRecord[]} input.studentArray - Every student of the group, which the selection is judged against.
 * @param {import('../../../../common/glossary/glossaryAnnotator.js').GlossaryAnnotator} input.glossary
 * @returns {import('lit').TemplateResult}
 */
function itemRingLegendTemplate({ innerRingVisible, selectedStudents, studentArray, glossary }) {
    const items = [
        {
            label: legendText(glossary, innerRingVisible ? 'result' : 'result-outer-only'),
            mark: html`<span
                class="legend-swatch ${DATA_MARK_CLASS} item-ring-legend-swatch--result"
                aria-hidden="true"
            ></span>`,
        },
        {
            label: legendText(glossary, 'pilot'),
            mark: html`<span class="item-ring-legend-mark" aria-hidden="true"></span>`,
        },
    ];
    // The rings draw the selection's tick only for a proper subset.
    const selection = ringSelection(glossary, selectedStudents, studentArray);
    if (selection.isSubset) {
        items.push({
            label: selection.name,
            mark: html`<span class="item-ring-legend-selection" aria-hidden="true">
                <span class="item-ring-legend-mark item-ring-legend-mark--selection"></span>
                ${mannequinNode()}
            </span>`,
        });
    }
    return legendSwatchListTemplate(items, { row: true });
}
