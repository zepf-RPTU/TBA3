/**
 * MaOverviewViewModule — the MA Überblick view: the competence-level distribution chart left, the
 * item-ring grid right. A click on a competence-level segment highlights that level's students in
 * the rings.
 */

import { html, render } from 'lit';
import { BaseViewModule } from '../../common/modules/baseViewModule.js';
import { ChartHostModule } from '@tba3/modules/charts';
import { maCompetenceLevelDistributionConfig } from '@tba3/modules/charts/ma-competence-level-distribution';
import { itemRingGridConfig } from '@tba3/modules/charts/item-ring-grid';
import './maOverviewViewModule.css';

const CONFIG = {
    competenceLevelChartContainerId: 'ma-overview-competenceLevelDistribution',
    itemRingContainerId: 'ma-overview-itemRing',
};

/** @augments {BaseViewModule<import('../maAppModule.js').MaState>} */
export class MaOverviewViewModule extends BaseViewModule {
    /**
     * @override
     * @returns {Promise<void>}
     */
    async _renderView() {
        this.classList.add('ma-overview-view');
        const itemRings = ChartHostModule.createChart(
            CONFIG.itemRingContainerId,
            itemRingGridConfig,
            this._childOptions({
                defaultInnerRingVisible: false,
                ringGrouping: this.options.appState.itemRingGrouping,
            }),
        );
        itemRings.className = 'overview-item-ring-chart-container';
        const competenceLevelDistribution = ChartHostModule.createChart(
            CONFIG.competenceLevelChartContainerId,
            maCompetenceLevelDistributionConfig,
            this._childOptions({
                onLevelSelected: (/** @type {string|null} */ level) =>
                    itemRings.setCompetenceLevelFilter(level),
            }),
        );
        competenceLevelDistribution.className = 'overview-competence-level-chart-container';
        render(
            html`<div class="layout-grid overview-charts-section">
                ${competenceLevelDistribution}${itemRings}
            </div>`,
            this,
        );
    }
}

customElements.define('tba-ma-overview-view', MaOverviewViewModule);
