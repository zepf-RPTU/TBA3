/**
 * MaGroupViewModule — the MA Lerngruppe view: the competence-level distribution bar above
 * the group table, which the bar's segment clicks filter.
 */

import { BaseViewModule } from '../../common/modules/baseViewModule.js';
import { html, render } from 'lit';
import { ChartHostModule } from '@tba3/modules/charts';
import { simpleCompetenceLevelBarConfig } from '@tba3/modules/charts/competence-level-bar';
import { MaGroupTableModule } from '@tba3/modules/tables/ma-group';
import './maGroupViewModule.css';

const CONFIG = {
    competenceLevelBarContainerId: 'ma-group-competence-level-bar',
    tableId: 'ma-group-table',
};

/** @augments {BaseViewModule<import('../maAppModule.js').MaState>} */
export class MaGroupViewModule extends BaseViewModule {
    /**
     * @override
     * @returns {Promise<void>}
     */
    async _renderView() {
        this.classList.add('ma-group-view');

        const competenceLevelBar = ChartHostModule.createChart(
            CONFIG.competenceLevelBarContainerId,
            simpleCompetenceLevelBarConfig,
            {
                ...this._childOptions(),
                // The click only toggles the table's filter; the highlight comes back
                // through onCompetenceLevelFilterChanged.
                onLevelToggled: (level) => table.toggleCompetenceLevelFilter(level),
            },
        );
        competenceLevelBar.className = 'competence-level-bar-wrapper';
        const table = MaGroupTableModule.create(CONFIG.tableId, {
            showModuleTitle: true,
            glossaryKey: 'ma.group.group-table',
            ...this._childOptions(),
            onCompetenceLevelFilterChanged: (levels) => competenceLevelBar.updateHighlight(levels),
            onStudentSelected: (studentId) => this._openStudent(studentId),
        });
        table.className = 'table-container';

        render(html`${competenceLevelBar}${table}`, this);
    }
}

customElements.define('tba-ma-group-view', MaGroupViewModule);
