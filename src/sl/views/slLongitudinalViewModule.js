/**
 * SlLongitudinalViewModule — the SL "Entwicklung" view: the multi-year chart cards.
 */

import { computed } from '@preact/signals-core';
import { html, render } from 'lit';
import { BaseViewModule } from '../../common/modules/baseViewModule.js';
import { ChartHostModule } from '@tba3/modules/charts';
import {
    longitudinalBoxPlotConfig,
    selfEfficacyLongConfig,
    longitudinalCompetenceLevelShareConfig,
    teachingQualityConfig,
} from '@tba3/modules/charts/longitudinal';
import { SL_DATASETS } from '@tba3/modules/sl-domain';
import { LONGITUDINAL_CHART_TYPES, LONGITUDINAL_VIEW_MODES } from '../slConstants.js';
import './slLongitudinalViewModule.css';

const CONFIG = {
    teachingQualityId: 'sl-long-teaching-quality',
    selfEfficacyId: 'sl-long-self-efficacy',
    boxPlotId: 'sl-long-box-plot',
    competenceLevelDistributionId: 'sl-long-competence-level-distribution',
};

/**
 * One chart card of the view. A card whose source data is absent is not created.
 * @typedef {object} LongitudinalCard
 * @property {string} id - Id of the element the card mounts in.
 * @property {import('@tba3/modules/charts').ChartHostConfig<any, any, null, any, any>} config
 * @property {boolean} present
 * @property {string} [className] - An extra class on the card, for its own layout.
 */

/** @augments {BaseViewModule<import('../slAppModule.js').SlState>} */
export class SlLongitudinalViewModule extends BaseViewModule {
    // The three cards #applyChartType shows or hides.
    /** @type {ChartHostModule<any>|null} */
    #teachingQualityModule = null;
    /** @type {ChartHostModule<any>|null} */
    #selfEfficacyModule = null;
    /** @type {ChartHostModule<any>|null} */
    #boxPlotModule = null;

    /**
     * @override
     * @returns {Promise<void>}
     */
    async _renderView() {
        const hosts = this.#createHosts(this.#listCards().filter((card) => card.present));
        render(html`<div class="sl-charts-row longitudinal-charts-row">${hosts}</div>`, this);
    }

    /**
     * Show the two survey cards, or the box plot in their place. Without a box-plot card
     * (a dataset with one scale only, where the header offers no switch) the survey
     * cards stay.
     * @param {import('../slConstants.js').LongitudinalChartType} chartType
     */
    #applyChartType(chartType) {
        const boxplot =
            chartType === LONGITUDINAL_CHART_TYPES.BOXPLOT && this.#boxPlotModule !== null;
        for (const host of [this.#teachingQualityModule, this.#selfEfficacyModule]) {
            if (boxplot) host?.hide();
            else host?.show();
        }
        if (boxplot) this.#boxPlotModule?.show();
        else this.#boxPlotModule?.hide();
    }

    /**
     * The view's cards, in display order, and which of them have source data.
     * @returns {LongitudinalCard[]} Every card the view can show.
     */
    #listCards() {
        const documents = this.options.context.documents;

        // The probe the header's chart-type toggle asks.
        const { hasTeachingQuality, hasSelfEfficacy, offersBoxPlot } = documents.getDataset(
            SL_DATASETS.HISTORY_SURVEY_SCALES,
        );

        return [
            {
                id: CONFIG.teachingQualityId,
                config: teachingQualityConfig,
                present: hasTeachingQuality,
            },
            { id: CONFIG.selfEfficacyId, config: selfEfficacyLongConfig, present: hasSelfEfficacy },
            {
                id: CONFIG.boxPlotId,
                config: longitudinalBoxPlotConfig,
                present: offersBoxPlot,
                className: 'longitudinal-chart-card--box-plot',
            },
            // Exists iff the header's Bereich select has an item.
            {
                id: CONFIG.competenceLevelDistributionId,
                config: longitudinalCompetenceLevelShareConfig,
                present: documents.getDataset(SL_DATASETS.LONGITUDINAL_SUBJECT_DOMAINS).length > 0,
            },
        ];
    }

    /**
     * Create one child ChartHostModule per card, handed the header's Bereich and
     * stacking as signals.
     * @param {LongitudinalCard[]} cards - The cards that have data.
     * @returns {ChartHostModule<any>[]} The hosts, in display order.
     */
    #createHosts(cards) {
        const appState = this.options.appState;
        const moduleOpts = this._childOptions({
            bodyClassName: 'longitudinal-chart-body',
            domainIndex: appState.selectedDomainIndex,
            isStacked: computed(
                () => appState.longitudinalViewMode.value === LONGITUDINAL_VIEW_MODES.STACKED,
            ),
        });
        const hosts = new Map(
            cards.map((card) => {
                const host = ChartHostModule.createChart(card.id, card.config, moduleOpts);
                host.className = ['longitudinal-chart-card', card.className]
                    .filter(Boolean)
                    .join(' ');
                return [card.id, host];
            }),
        );

        this.#teachingQualityModule = hosts.get(CONFIG.teachingQualityId) ?? null;
        this.#selfEfficacyModule = hosts.get(CONFIG.selfEfficacyId) ?? null;
        this.#boxPlotModule = hosts.get(CONFIG.boxPlotId) ?? null;

        // Before they are placed, so the first render already shows the header's chart
        // type; watched from here, so no change during their first render is lost.
        this.#applyChartType(appState.longitudinalChartType.value);
        this.watch(appState.longitudinalChartType, (chartType) => this.#applyChartType(chartType));

        return [...hosts.values()];
    }
}

customElements.define('tba-sl-longitudinal-view', SlLongitudinalViewModule);
