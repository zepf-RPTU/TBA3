/**
 * SlMatrixViewModule — the SL "Gesamtbild" view: the competence
 * distribution chart beside the InfoBox analysis text.
 */

import { BaseViewModule } from '../../common/modules/baseViewModule.js';
import { ChartHostModule } from '@tba3/modules/charts';
import { competenceChartConfig } from '@tba3/modules/charts/competence-overview';
import { InfoBoxModule } from '@tba3/modules/info-box';
import { hasSlResults } from '@tba3/modules/sl-domain';
import { render } from 'lit';
import { chartsRowTemplate } from './slChartsRow.js';
import { materialStatePatch } from '../slMaterialNavigation.js';

const CONFIG = {
    chartId: 'sl-matrix-chart',
    textId: 'sl-matrix-text',
};

/**
 * @augments {BaseViewModule<import('../slAppModule.js').SlState>}
 */
export class SlMatrixViewModule extends BaseViewModule {
    /**
     * The competence overview beside the Entwicklungspotenziale Kasten, when the dataset has results.
     * @override
     */
    async _renderView() {
        if (!hasSlResults(this.options.context.documents)) {
            console.warn('SlMatrixViewModule: No competence-levels data');
            render(chartsRowTemplate(null, null), this);
            return;
        }

        const chart = ChartHostModule.createChart(CONFIG.chartId, competenceChartConfig, {
            ...this._childOptions(),
            glossaryKey: 'sl.matrix.chart',
            showModuleTitle: true,
        });
        const text = InfoBoxModule.create(CONFIG.textId, {
            ...this._childOptions(),
            glossaryKey: 'sl.matrix.text',
            onOpenMaterial: this.#openMaterial,
        });
        text.data = { boxKey: 'matrix' };
        render(chartsRowTemplate(chart, text), this);
    }

    /**
     * An info-box material link's handler.
     * @param {{subject: string, type: string}} selection - The Fach, as the payload names it, and the Typ.
     * @returns {Promise<void>} Settles once the material view is shown.
     */
    #openMaterial = (selection) =>
        this.navigate('material', { statePatch: materialStatePatch(selection) });
}

customElements.define('tba-sl-matrix-view', SlMatrixViewModule);
