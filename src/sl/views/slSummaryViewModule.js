/**
 * SlSummaryViewModule — the SL "Überblick" landing view: one card per subject×domain,
 * each showing the school's value for the selected metric beside one bar per reference
 * average and per group, drawn as that column's deviation from the school value.
 */

import { BaseViewModule } from '../../common/modules/baseViewModule.js';
import { queryEl } from '@tba3/module-base';
import { html, nothing, render } from 'lit';
import { ChartHostModule, subjectDomainLabelRuns } from '@tba3/modules/charts';
import {
    groupDeviationConfig,
    getSchoolSummary,
    summaryMinRowWidth,
} from '@tba3/modules/charts/group-deviation';
import { sanitizeFileStem } from '../../common/export/exportFiles.js';
import './slSummaryViewModule.css';

/** @typedef {import('@tba3/modules/charts/group-deviation').SummaryCard} SummaryCard */
/** @typedef {import('@tba3/modules/charts/group-deviation').SchoolSummary} SchoolSummary */

const CONFIG = {
    rowsContainerClass: 'summary-rows',
    rowCardClass: 'summary-row-card',
    rowIdPrefix: 'sl-summary-row',
    /** Note shown in place of the cards when no row could be built. */
    emptyStateClass: 'summary-empty-state',
    /** CSS custom property the responsive card grid sizes its columns against. */
    minWidthProperty: '--summary-chart-min-width',
};

/**
 * DOM id for one subject×domain card.
 * @param {SummaryCard} row
 * @returns {string} Its id, stable across metric changes so the hosts are never remounted.
 */
function buildRowId(row) {
    return sanitizeFileStem(`${CONFIG.rowIdPrefix}-${row.subjectName}-${row.domainId ?? 'gesamt'}`);
}

/** @augments {BaseViewModule<import('../slAppModule.js').SlState>} */
export class SlSummaryViewModule extends BaseViewModule {
    /**
     * The cards redraw on a metric change or a ⌀ toggle themselves; the grid's
     * minimum card width depends on both. Observed once the grid is placed: the
     * cards read the state when they first draw.
     */
    #observeHeaderState() {
        this.watch(this.options.appState.summaryMetric, this.#relayout);
        this.watch(this.options.comparisonState.activeModes, this.#relayout);
    }

    /** @override */
    async _renderView() {
        const summary = this.#summary();

        this.#render(summary.cards);
        this.#applyLayoutMetrics(summary);
        this.#observeHeaderState();
    }

    /**
     * Re-measure the grid's minimum card width for the current selection.
     * @returns {void}
     */
    #relayout = () => this.#applyLayoutMetrics(this.#summary());

    /**
     * Render the grid: one chart card per subject×domain in payload order. With none, the
     * container stays, for `#applyLayoutMetrics`, and the empty-state note goes beside it.
     * @param {ReadonlyArray<SummaryCard>} cards - The cards to place, rows and absences alike.
     */
    #render(cards) {
        this.classList.add('sl-summary-view');
        if (cards.length === 0) {
            console.warn('SlSummaryViewModule: No summary rows could be built from the documents');
        }
        const emptyState =
            cards.length === 0
                ? html`<p class=${CONFIG.emptyStateClass}>
                      ${this.options.context.glossary.getRequiredEntryText(
                          'sl.summary.messages.empty',
                      )}
                  </p>`
                : nothing;
        render(
            html`
                <div class=${CONFIG.rowsContainerClass}>
                    ${cards.map((card) => this.#createModule(card))}
                </div>
                ${emptyState}
            `,
            this,
        );
    }

    /**
     * Set the grid's minimum card width: how wide a card must be before a second fits
     * beside it.
     * @param {SchoolSummary} summary
     */
    #applyLayoutMetrics(summary) {
        queryEl(this, `.${CONFIG.rowsContainerClass}`)?.style.setProperty(
            CONFIG.minWidthProperty,
            `${summaryMinRowWidth(summary)}px`,
        );
    }

    /**
     * Read from app state; the view keeps no copy.
     * @returns {string}
     */
    #metricId() {
        return this.options.appState.summaryMetric.value;
    }

    /**
     * The same memoised summary every card renders from, read here for the card set
     * and the grid geometry.
     * @returns {SchoolSummary} The summary of the current selection.
     */
    #summary() {
        return getSchoolSummary(this.options.context.documents, {
            metricId: this.#metricId(),
            comparisonState: this.options.comparisonState,
        });
    }

    /**
     * The host of one card, not yet placed; it follows the app's metric signal.
     * @param {SummaryCard} row
     * @returns {import('@tba3/modules/charts/group-deviation').GroupDeviationHost}
     */
    #createModule(row) {
        const containerId = buildRowId(row);
        const host = ChartHostModule.createChart(containerId, groupDeviationConfig, {
            ...this._childOptions(),
            // The glossary title wins over the `title` option, so the per-row label
            // is injected as a template token (see sl.summary.deviation), its Domäne
            // linked to the entry for that Domäne of that Fach.
            glossaryReplacements: {
                Bereich: subjectDomainLabelRuns(
                    this.options.context.glossary,
                    row.subjectName,
                    row.domainId,
                    row.domainName,
                ),
            },
            title: row.rowLabel,
            subjectName: row.subjectName,
            domainId: row.domainId,
            metricId: this.options.appState.summaryMetric,
        });
        host.className = CONFIG.rowCardClass;
        return host;
    }
}

customElements.define('tba-sl-summary-view', SlSummaryViewModule);
