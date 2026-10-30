/**
 * MaItemViewModule — the MA Aufgaben view: the item table left, the item-ring charts
 * right, and a focus chart in chart-only mode.
 */

import { MaLayoutViewBase } from './maLayoutViewBase.js';
import { ChartHostModule } from '@tba3/modules/charts';
import { itemSuccessLollipopConfig } from '@tba3/modules/charts/item-success-lollipop';
import { MaItemTableModule } from '@tba3/modules/tables/ma-item';
import './maItemViewModule.css';

const CONFIG = {
    tableId: 'ma-item-table',
    lollipopContainerId: 'ma-item-lollipop',
};

export class MaItemViewModule extends MaLayoutViewBase {
    /**
     * The lollipop above the item table, in the split panel; the rings mark no student.
     * @override
     * @returns {import('./maLayoutViewBase.js').SplitViewSpec}
     * @protected
     */
    _splitView() {
        const table = MaItemTableModule.create(CONFIG.tableId, {
            showModuleTitle: true,
            glossaryKey: 'ma.item.item-table',
            ...this._childOptions(),
            showCompetences: this._showCompetences(),
        });
        table.className = 'table-container';
        const lollipop = ChartHostModule.createChart(
            CONFIG.lollipopContainerId,
            itemSuccessLollipopConfig,
            this._childOptions(),
        );
        lollipop.className = 'lollipop-section';
        return { prefix: 'item', left: [lollipop, table] };
    }
}

customElements.define('tba-ma-item-view', MaItemViewModule);
