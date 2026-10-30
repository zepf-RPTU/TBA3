/**
 * EnGroupViewModule — the EN Lerngruppe view: the aggregate style chart above the
 * filterable group table, whose header hosts the scatterplot-search button that opens
 * the student-selection modal.
 */

import { html, render } from 'lit';
import { BaseViewModule } from '../../common/modules/baseViewModule.js';
import { ChartHostModule } from '@tba3/modules/charts';
import { EN_DATASETS, enDomainListRuns } from '@tba3/modules/en-domain';
import { ScatterplotFilterModule } from '@tba3/modules/charts/scatterplot';
import { styleGroupChartConfig } from '@tba3/modules/charts/style';
import { EnGroupTableModule, SCATTER_SEARCH_BUTTON_SELECTOR } from '@tba3/modules/tables/en-group';
import './enGroupViewModule.css';

const CONFIG = {
    styleChartContainerId: 'en-group-style-chart',
    groupTableContainerId: 'en-group-table',
};

/** @augments {BaseViewModule<import('../enAppModule.js').EnState>} */
export class EnGroupViewModule extends BaseViewModule {
    /** @type {import('@tba3/modules/charts/style').StyleGroupChartHost|null} */
    #chartModule = null;
    /** @type {EnGroupTableModule|null} */
    #groupTableModule = null;

    /** @type {ScatterplotFilterModule|null} */
    #filterModal = null;

    /**
     * @override
     * @returns {Promise<void>}
     */
    async _renderView() {
        this.classList.add('en-group-view');
        this.#constructModules();
        render(html`${this.#chartModule}${this.#groupTableModule}`, this);
    }

    /**
     * The two tour steps no module on this view can declare, both about the
     * student filter:
     * - `en.group.filter` anchors to the scatter-search button in the group
     *   table's toolbar, which belongs to no module of its own;
     * - `en.group.scatterplot` describes the selection modal, which is closed
     *   while the tour runs, so it has no anchor and shows centred (a
     *   null-returning `getAnchor` would read as a lost anchor).
     * Everything else on this view (header, lollipop, group table) derives.
     * @override
     * @returns {Array<{glossaryPath: string, getAnchor?: () => (HTMLElement|null)}>}
     */
    get tourExtras() {
        return [
            {
                glossaryPath: 'en.group.filter',
                getAnchor: () =>
                    this.#groupTableModule?.querySelector(SCATTER_SEARCH_BUTTON_SELECTOR) ?? null,
            },
            { glossaryPath: 'en.group.scatterplot' },
        ];
    }

    #constructModules() {
        const domainMode = this.options.appState.currentMode;
        const { glossary, documents } = this.options.context;
        const enConfig = documents.getDataset(EN_DATASETS.CONFIG);
        const glossaryReplacements = { Domänen: enDomainListRuns(glossary, enConfig) };
        // Styles are a property of the data, not of every domain pair: a dataset without
        // style buckets gets no style chart.
        if (enConfig.styleCategories.length > 0) {
            const chart = ChartHostModule.createChart(
                CONFIG.styleChartContainerId,
                styleGroupChartConfig,
                this._childOptions({
                    showModuleTitle: true,
                    glossaryKey: 'en.group.lollipop',
                    glossaryReplacements,
                    collapsible: true,
                    domainMode,
                }),
            );
            chart.className = 'chart-section';
            this.#chartModule = chart;
        }

        this.#groupTableModule = EnGroupTableModule.create(
            CONFIG.groupTableContainerId,
            this._childOptions({
                glossaryKey: 'en.group.group-table',
                glossaryReplacements,
                domainMode,
                showModuleTitle: true,
                onOpenScatterSearch: () => this.#openFilterModal(),
                onDataSync: (
                    /** @type {import('@tba3/modules/charts/style').StyleSyncPayload} */ data,
                ) => this.#chartModule?.applySync(data),
                onStudentSelected: (/** @type {string} */ studentId) =>
                    this._openStudent(studentId),
            }),
        );
        this.#groupTableModule.className = 'table-section';
    }

    async #openFilterModal() {
        // The table owns the confirmed selection; the modal starts from a copy.
        const selectedStudentIds = this.#groupTableModule?.externalStudentIds ?? new Set();
        if (!this.#filterModal) {
            // Outside the view's tree, in its own <dialog>: the tour and the notes
            // drawer derive their entries from the module tree, but the modal has its
            // own tour card (tourExtras) and is no note target.
            const filterModal = ScatterplotFilterModule.create('group-scatterplot-filter', {
                ...this._childOptions(),
                onConfirm: (selectedIds) =>
                    this.#groupTableModule?.applyExternalStudentFilter(selectedIds),
            });
            this.resources.trackSubscription(() => filterModal.remove());
            this.#filterModal = filterModal;
        }

        await this.#filterModal.open(selectedStudentIds);
    }
}

customElements.define('tba-en-group-view', EnGroupViewModule);
