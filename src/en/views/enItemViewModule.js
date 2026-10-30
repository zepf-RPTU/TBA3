/**
 * EnItemViewModule — the EN Aufgaben view: item table, item lollipop and the detail
 * panel in a 2×2 grid.
 */

import { html, render } from 'lit';
import { BaseViewModule } from '../../common/modules/baseViewModule.js';
import { ChartHostModule } from '@tba3/modules/charts';
import { EN_DATASETS, enDomainListRuns } from '@tba3/modules/en-domain';
import { itemLollipopConfig } from '@tba3/modules/charts/item-lollipop';
import { EnItemDetailModule } from '@tba3/modules/en-item-detail';
import { EnItemTableModule } from '@tba3/modules/tables/en-item';
import './enItemViewModule.css';

const CONFIG = {
    itemLollipopChartContainerId: 'item-itemLollipop',
    itemTableContainerId: 'item-table',
    itemDetailContainerId: 'item-detail',
};

/** @augments {BaseViewModule<import('../enAppModule.js').EnState>} */
export class EnItemViewModule extends BaseViewModule {
    /** @type {EnItemTableModule|null} */
    #itemTableModule = null;
    /** @type {import('@tba3/modules/charts/item-lollipop').ItemLollipopHost|null} */
    #itemLollipopChartModule = null;
    /** @type {EnItemDetailModule|null} */
    #itemDetailModule = null;

    /**
     * @override
     * @returns {Promise<void>}
     */
    async _renderView() {
        this.classList.add('en-item-view');
        this.#constructModules();
        // The lollipop draws from the table's first sync, so all three are placed in
        // one render.
        render(
            html`${this.#itemLollipopChartModule}${this.#itemTableModule}${this.#itemDetailModule}`,
            this,
        );
    }

    #constructModules() {
        const { glossary, documents } = this.options.context;
        const glossaryReplacements = {
            Domänen: enDomainListRuns(glossary, documents.getDataset(EN_DATASETS.CONFIG)),
        };
        this.#itemLollipopChartModule = ChartHostModule.createChart(
            CONFIG.itemLollipopChartContainerId,
            itemLollipopConfig,
            this._childOptions({
                glossaryKey: 'en.item.lollipop',
                glossaryReplacements,
                collapsible: true,
                domainMode: this.options.appState.currentMode,
            }),
        );
        this.#itemLollipopChartModule.className = 'chart-section';

        this.#itemTableModule = EnItemTableModule.create(
            CONFIG.itemTableContainerId,
            this._childOptions({
                glossaryKey: 'en.item.item-table',
                glossaryReplacements,
                domainMode: this.options.appState.currentMode,
                showModuleTitle: true,
                onDataSync: (
                    /** @type {import('@tba3/modules/charts/item-lollipop').ItemLollipopSyncPayload} */ data,
                ) => this.#itemLollipopChartModule?.applySync(data),
                onItemSelected: (
                    /** @type {import('@tba3/modules/en-item-detail').ItemSelection} */ payload,
                ) => {
                    void this.#itemDetailModule?.onItemSelected(payload);
                },
            }),
        );
        this.#itemTableModule.className = 'table-section';

        this.#itemDetailModule = EnItemDetailModule.create(
            CONFIG.itemDetailContainerId,
            this._childOptions({
                glossaryKey: 'en.item.item-details',
                showModuleTitle: true,
                onStudentSelected: (/** @type {string} */ studentId) =>
                    this._openStudent(studentId),
            }),
        );
        this.#itemDetailModule.className = 'detail-section';
    }
}

customElements.define('tba-en-item-view', EnItemViewModule);
