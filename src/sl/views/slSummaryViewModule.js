/**
 * SlSummaryViewModule — the SL "Überblick" landing view: one card per subject×domain,
 * each showing the school's value for the selected metric beside one bar per reference
 * average and per class, drawn as that column's deviation from the school value.
 *
 * The view owns the y scale. It builds every row once and hands each ChartHostModule
 * the shared y domain, so bar heights stay comparable across subjects.
 */

import { BaseViewModule } from '../../common/modules/baseViewModule.js';
import { createElement, createPlaceholder, queryEl } from '@tba3/module-base';
import { ChartHostModule } from '@tba3/modules/charts';
import {
    buildSummaryRows,
    classDeviationConfig,
    CompetenceShareQueries,
    estimateMinRowWidth,
    resolveLabelLineCount,
    SolutionRateQueries,
} from '@tba3/modules/charts/class-deviation';
import { DEFAULT_SUMMARY_METRIC_ID } from '@tba3/modules/sl-domain';
import { glossaryAnnotator } from '@tba3/modules/glossary';
import { slDataFromStore } from '../slDataPort.js';
import { SL_DATA_KEYS } from '../slDataKeys.js';
import './slSummaryViewModule.css';

// Module-specific constants
const CONFIG = {
    rowsContainerClass: 'summary-rows',
    rowCardClass: 'summary-row-card',
    rowIdPrefix: 'sl-summary-row',
    /** Note shown in place of the cards when no row could be built. */
    emptyStateClass: 'summary-empty-state',
    /** CSS custom property the responsive card grid sizes its columns against. */
    minWidthProperty: '--summary-row-min-width',
    /**
     * Card identity for the ordering pass. Not the id: ContentModule moves the
     * container's id onto its inner body div when it builds the card shell, so
     * after mount the card element itself no longer carries one.
     */
    rowKeyAttribute: 'data-summary-row',
};

/**
 * Stable DOM id for one subject×domain card.
 * @param {{subjectName: string, domainId: string|null}} row - The row or absence the card stands for.
 * @returns {string} Its id, stable across metric changes so the hosts are never remounted.
 */
function buildRowId(row) {
    const domainPart = row.domainId ?? 'gesamt';
    return `${CONFIG.rowIdPrefix}-${row.subjectName}-${domainPart}`
        .toLowerCase()
        .replace(/[^a-z0-9-]+/g, '-');
}

/**
 * The column labels one card carries. Its entries *are* its columns.
 * @param {{entries?: Array<{label: string}>}} row - One built row.
 * @returns {string[]} The labels, in column order.
 */
function listRowLabels(row) {
    return (row?.entries ?? []).map((entry) => entry.label);
}

export class SlSummaryViewModule extends BaseViewModule {
    /** @type {import('@tba3/modules/sl/utils/slSchoolSummaryMetricRegistry.js').SummaryQueries|null} */
    #queries = null;

    /**
     * @param {string} id - Unique identifier for this module
     * @param {HTMLElement} container - Container element
     * @param {import('../../common/modules/baseViewModule.js').ViewModuleOptions} [options={}] - Configuration options
     */
    constructor(id, container, options = {}) {
        super(id, container, options);
    }

    // ─── State observers (the declarative header controls write app state) ──

    /**
     * Known residual gap: a header control changed *during* the render, while
     * the row cards hydrate, writes state before this observer exists and is
     * dropped — the cards keep the metric their payload was built from until the
     * next change. Left as is: a
     * sub-second window behind the render cover, self-healing on the next
     * interaction, and closing it would mean tracking a control-state
     * fingerprint across the await purely for that case.
     */
    #observeHeaderState() {
        // Recompute once here for both — the shared y domain spans all rows, so a
        // child cannot derive it on its own.
        this.observeState('summaryMetric', () => this.#refreshRows());

        // A card's ⌀ toggle writes the app's comparison state; the rows are rebuilt from it.
        this.observeState('comparisonState', () => this.#refreshRows());
    }

    /**
     * Rebuild the payload, push it to every row card, and restamp layout + order.
     * Every registered child is a row card (see #initializeModules).
     */
    #refreshRows() {
        const chartData = this.#buildChartData();

        this.#applyLayoutMetrics(chartData);
        for (const card of this.childModules) {
            void card
                .update(chartData)
                .catch((error) =>
                    console.error(`SlSummaryViewModule: row refresh failed for ${card.id}:`, error),
                );
        }
    }

    // ─── Lifecycle ──────────────────────────────────────────────────────────

    /** @override */
    async _renderView(_data = {}) {
        const chartData = this.#buildChartData();

        this.#createDOM(this.#listCards(chartData));
        this.#applyLayoutMetrics(chartData);
        await this.#initializeModules(chartData);
        this.#observeHeaderState();
    }

    // ─── DOM ────────────────────────────────────────────────────────────────

    /**
     * Creates the DOM structure — a vertical `.summary-rows` column with one
     * chart-card placeholder per subject×domain.
     *
     * "Per subject×domain" includes the ones the current metric cannot answer: their
     * card carries the reason instead of bars (see `#listCards`). The card set is
     * therefore metric-independent, which is what lets a metric change move a card
     * between the two states without any DOM surgery — the hosts stay mounted and
     * simply re-render.
     *
     * With no subject×domain at all the container stays (so `#applyLayoutMetrics` keeps
     * working) and a load-failure note is added beside it.
     * @param {Array<object>} cards - The cards to mount, rows and absences alike.
     */
    #createDOM(cards) {
        const container = this.container;
        if (!container) {
            return;
        }
        container.className = 'sl-summary-view view-base';
        container.innerHTML = '';

        const rowsContainer = createElement(
            'div',
            { className: CONFIG.rowsContainerClass },
            cards.map((card) => {
                const placeholder = createPlaceholder(buildRowId(card), CONFIG.rowCardClass);
                placeholder.setAttribute(CONFIG.rowKeyAttribute, buildRowId(card));
                return placeholder;
            }),
        );

        container.appendChild(rowsContainer);

        if (cards.length === 0) {
            container.appendChild(
                createElement('p', {
                    className: CONFIG.emptyStateClass,
                    textContent: glossaryAnnotator.getRequiredEntryText(
                        'sl.summary.messages.empty',
                    ),
                }),
            );
        }
    }

    /**
     * Every card the grid shows: the rows that resolved, then the ones that did not.
     *
     * Absences trail the rows so the readable cards come first, and the order within
     * each half is the payload's own. Deliberately not merged into the metric sort —
     * an absence has no value to rank.
     * @param {object} chartData - The built payload.
     * @param {Array<object>} [chartData.rows] - The rows that resolved, best first.
     * @param {Array<object>} [chartData.absences] - The subject×domains that did not, with their reason.
     * @returns {Array<object>} The cards in display order.
     */
    #listCards({ rows, absences }) {
        return [...(rows ?? []), ...(absences ?? [])];
    }

    // ─── Layout ─────────────────────────────────────────────────────────────

    /**
     * Feed the grid the two things only the payload knows: how wide a card must
     * be before a second card fits beside it, and the best-to-worst card order.
     *
     * The width is the widest card's, not each card's own, so the grid stays
     * uniform even though cards no longer carry the same columns. "Widest" is a
     * question of labels as much as of column count — a card of few columns with
     * long test-group names can need more room than one of many short ones — so
     * every card is costed and the largest wins.
     *
     * Order is applied via CSS `order` rather than by moving nodes — a metric
     * change reshuffles the ranking, and remounting the hosts to reorder them
     * would throw away every rendered chart.
     * @param {object} chartData - The built payload, read for its rows and row order.
     */
    #applyLayoutMetrics(chartData) {
        const rowsContainer = queryEl(this.container, `.${CONFIG.rowsContainerClass}`);
        if (!rowsContainer) {
            return;
        }

        // Seeded with the no-column floor rather than 0: under a metric no
        // subject×domain can answer there are no rows to cost, and a 0 here would
        // hand the grid a min-width narrower than the school-value box, packing
        // three cramped absence cards into a row that fits one.
        const minRowWidth = Math.max(
            estimateMinRowWidth([]),
            ...(chartData.rows ?? []).map((row) => estimateMinRowWidth(listRowLabels(row))),
        );

        rowsContainer.style.setProperty(CONFIG.minWidthProperty, `${minRowWidth}px`);

        // Ranked rows first, absent ones after — so a card that loses its row under
        // the current metric sinks below the ones that still have data.
        const cards = this.#listCards(chartData);
        const orderByRowKey = new Map(cards.map((card, index) => [buildRowId(card), index]));
        for (const card of rowsContainer.children) {
            const order =
                orderByRowKey.get(card.getAttribute(CONFIG.rowKeyAttribute) ?? '') ?? cards.length;
            /** @type {HTMLElement} */ (card).style.order = String(order);
        }
    }

    // ─── Data helpers ───────────────────────────────────────────────────────

    #getQueries() {
        if (!this.#queries) {
            const slData = slDataFromStore(this.getOption('dataStore'));
            this.#queries = {
                shares: new CompetenceShareQueries({ moduleId: this.id, slData }),
                rates: new SolutionRateQueries({ moduleId: this.id, slData }),
            };
        }
        return this.#queries;
    }

    /**
     * Build the full payload shared by every row: the rows themselves plus the
     * y domain and the label band they all draw against.
     *
     * `labelLines` is resolved here, over *every* card's labels at once, because
     * the label band is part of the chart area a card has left for its bars: a
     * card that reserved one line where another reserved two would draw the same
     * deviation at a different height and quietly break the shared y domain.
     *
     * The metric is read from app state, which the metric-select control's
     * `onChange` (slHeaderControls.js) writes — so the view keeps no copy of it.
     * @returns {object} The rows, the absences, the shared y domain, and the shared label-line count.
     */
    #buildChartData() {
        const competenceLevels =
            this.getOption('dataStore')?.getRawData(SL_DATA_KEYS.COMPETENCE_LEVELS) ?? [];

        const appState = this.options.appState;

        const summary = buildSummaryRows({
            queries: this.#getQueries(),
            competenceLevels,
            metricId: appState?.getStateValue('summaryMetric') ?? DEFAULT_SUMMARY_METRIC_ID,
            // Seeded with every delivered average; without a state to ask,
            // `buildSummaryRows` plots them all.
            activeAverageIds: this.options.comparisonState?.getActiveModes() ?? null,
        });

        return {
            ...summary,
            labelLines: resolveLabelLineCount(summary.rows.flatMap(listRowLabels)),
        };
    }

    // ─── Child modules ──────────────────────────────────────────────────────

    async #initializeModules(chartData) {
        const cards = this.#listCards(chartData);
        if (!cards.length) {
            console.warn('SlSummaryViewModule: No summary rows could be built from the DataStore');
            return;
        }

        const moduleOpts = {
            ...this._childOptions(),
        };

        await this._hydrateChildren(
            cards.map((card) => [this.#createModule(card, moduleOpts, chartData)]),
        );
    }

    /**
     * Helper — create and mount a single ChartHostModule for one row. Mounted
     * here so the row body class is on the shell before it renders.
     * @param {object} row - The row or absence this card stands for.
     * @param {object} opts - Options shared by every card's host.
     * @param {object} chartData - The built payload, from which this card's slice is taken.
     * @returns {ChartHostModule} The mounted, not yet hydrated host.
     */
    #createModule(row, opts, chartData) {
        const containerId = buildRowId(row);
        const mod = new ChartHostModule(containerId, containerId, classDeviationConfig, {
            ...opts,
            // The glossary title wins over the `title` option, so the per-row label
            // is injected as a template token (see sl.summary.deviation).
            glossaryReplacements: { Bereich: row.rowLabel },
            title: row.rowLabel,
            subjectName: row.subjectName,
            domainId: row.domainId,
        });

        mod.mount(chartData);
        mod.contentContainer.classList.add('summary-row-body');
        return mod;
    }
}
