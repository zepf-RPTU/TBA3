/**
 * SlComparisonViewModule — the SL Vergleich view: the group comparison chart with its
 * title and description.
 */

import { BaseViewModule } from '../../common/modules/baseViewModule.js';
import { ChartHostModule } from '@tba3/modules/charts';
import {
    GROUP_COMPARISON_CHART_TYPES,
    groupComparisonConfig,
} from '@tba3/modules/charts/group-comparison';
import { InfoBoxModule } from '@tba3/modules/info-box';
import { render } from 'lit';
import { chartsRowTemplate } from './slChartsRow.js';

const CONFIG = {
    groupComparisonContainerId: 'sl-comparison-group-chart',
    textId: 'sl-comparison-text',
};

/** Which info-box entry describes the comparison on screen: the measure family's. */
const COMPARISON_BOX_KEYS = {
    competence: 'comparisonCompetence',
    points: 'comparisonPoints',
    rating: 'comparisonRating',
};

/** @augments {BaseViewModule<import('../slAppModule.js').SlState>} */
export class SlComparisonViewModule extends BaseViewModule {
    /** @type {InfoBoxModule|null} */
    #textModule = null;

    /**
     * @override
     * @returns {Promise<void>}
     */
    async _renderView() {
        const chart = ChartHostModule.createChart(
            CONFIG.groupComparisonContainerId,
            groupComparisonConfig,
            this._childOptions(),
        );
        // The chart's selection, derived in the host's state from its controls: the box
        // follows every change.
        this.watch(chart.state.selection, (selection) => {
            if (selection) this.#handleSelectionChanged(selection);
        });
        this.#textModule = InfoBoxModule.create(
            CONFIG.textId,
            this._childOptions({ glossaryKey: 'sl.comparison.results' }),
        );

        // The empty state, until the chart reports its first selection.
        this.#textModule.data = {};
        render(chartsRowTemplate(chart, this.#textModule), this);
    }

    /**
     * Render the box for a new selection; the box computes the summary itself.
     * @param {import('@tba3/modules/charts/group-comparison').GroupComparisonSelection} selection
     */
    #handleSelectionChanged(selection) {
        if (!this.#textModule) return;
        this.#textModule.data = {
            boxKey: COMPARISON_BOX_KEYS[GROUP_COMPARISON_CHART_TYPES[selection.chartType].family],
            placeholderContext: { comparison: selection },
        };
    }
}

customElements.define('tba-sl-comparison-view', SlComparisonViewModule);
