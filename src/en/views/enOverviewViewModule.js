/**
 * EnOverviewViewModule — the EN Überblick view: the scatterplot of student performance
 * between the two GER distribution charts, one per domain.
 */

import { html, render } from 'lit';
import { BaseViewModule } from '../../common/modules/baseViewModule.js';
import { ChartHostModule } from '@tba3/modules/charts';
import { enCompetenceLevelDistributionConfig } from '@tba3/modules/charts/en-competence-level-distribution';
import { scatterplotConfig } from '@tba3/modules/charts/scatterplot';
import { EN_DATASETS, enDomainListRuns } from '@tba3/modules/en-domain';
import './enOverviewViewModule.css';

const CONFIG = {
    leftChartContainerId: 'en-overview-left-chart',
    scatterplotContainerId: 'en-overview-scatterplot',
    rightChartContainerId: 'en-overview-right-chart',
};

// The distributions take the two layout slots in the payload's domain order: its first
// domain left, its second right. They share one entry, never keyed by a domain id, so
// any two domains find it.
const COMPETENCE_LEVEL_SLOTS = [CONFIG.leftChartContainerId, CONFIG.rightChartContainerId];

/** @augments {BaseViewModule<import('../enAppModule.js').EnState>} */
export class EnOverviewViewModule extends BaseViewModule {
    /**
     * Nothing calls a host afterwards: the view base hands them the ⌀ toggles.
     * @override
     * @returns {Promise<void>}
     */
    async _renderView() {
        this.classList.add('en-overview-view');
        const { glossary, documents } = this.options.context;
        const enConfig = documents.getDataset(EN_DATASETS.CONFIG);
        const { domainIds, domainLabels } = enConfig;
        const scatterplot = ChartHostModule.createChart(
            CONFIG.scatterplotContainerId,
            scatterplotConfig,
            {
                ...this._childOptions(),
                glossaryReplacements: { Domänen: enDomainListRuns(glossary, enConfig) },
                onStudentSelected: (studentId) => this._openStudent(studentId),
            },
        );
        scatterplot.className = 'en-overview-center';
        const [left, right] = COMPETENCE_LEVEL_SLOTS.map((containerId, slot) => {
            const host = ChartHostModule.createChart(
                containerId,
                enCompetenceLevelDistributionConfig,
                {
                    ...this._childOptions(),
                    // The copy names the Domäne the payload calls it, linked by its id.
                    glossaryReplacements: {
                        Domäne: [
                            {
                                text: domainLabels[slot],
                                glossaryKey: glossary.resolveDomainEntryKey(domainIds[slot]),
                            },
                        ],
                    },
                    // Each y-axis faces outward.
                    yAxisSide: slot === 0 ? 'left' : 'right',
                    domainId: domainIds[slot],
                },
            );
            host.className = slot === 0 ? 'en-overview-left' : 'en-overview-right';
            return host;
        });
        render(html`${left}${scatterplot}${right}`, this);
    }
}

customElements.define('tba-en-overview-view', EnOverviewViewModule);
