/**
 * EnStudentViewModule — the EN Schüler:in view: spider chart, student info and data
 * tables, and the item detail panel.
 */

import { html, render } from 'lit';
import { BaseViewModule } from '../../common/modules/baseViewModule.js';
import { ChartHostModule } from '@tba3/modules/charts';
import { styleStudentChartConfig } from '@tba3/modules/charts/style';
import { EN_DATASETS } from '@tba3/modules/en-domain';
import { EnItemDetailModule } from '@tba3/modules/en-item-detail';
import { EnStudentTablesModule } from '../modules/enStudentTables/enStudentTablesModule.js';
import './enStudentViewModule.css';

const CONFIG = {
    spiderChartContainerId: 'student-spider',
    studentTablesContainerId: 'student-tables',
    itemDetailContainerId: 'student-detail',
};

/** @augments {BaseViewModule<import('../enAppModule.js').EnState>} */
export class EnStudentViewModule extends BaseViewModule {
    /** @type {import('@tba3/modules/charts/style').StyleStudentHost|null} */
    #spiderChartModule = null;
    /** @type {EnStudentTablesModule|null} */
    #studentTableModule = null;
    /** @type {EnItemDetailModule|null} */
    #itemDetailModule = null;

    /**
     * @override
     * @returns {Promise<void>}
     */
    async _renderView() {
        this.classList.add('en-student-view');
        this.#constructModules();
        render(
            html`
                <div class="layout-grid content-grid">
                    <div class="view-section left-column">${this.#studentTableModule}</div>
                    <div class="view-section right-column">
                        ${this.#spiderChartModule}${this.#itemDetailModule}
                    </div>
                </div>
            `,
            this,
        );
    }

    #constructModules() {
        const domainMode = this.options.appState.currentMode;

        // A dataset without style buckets gets no style chart.
        const { styleCategories } = this.options.context.documents.getDataset(EN_DATASETS.CONFIG);
        if (styleCategories.length > 0) {
            this.#spiderChartModule = ChartHostModule.createChart(
                CONFIG.spiderChartContainerId,
                styleStudentChartConfig,
                {
                    ...this._childOptions(),
                    showModuleTitle: true,
                    collapsible: true,
                    glossaryKey: 'en.student.spider-lollipop',
                    domainMode,
                    studentId: this.options.appState.currentStudentId,
                },
            );
            this.#spiderChartModule.className = 'chart-section';
        }

        this.#studentTableModule = EnStudentTablesModule.create(CONFIG.studentTablesContainerId, {
            ...this._childOptions(),
            showModuleTitle: true,
            glossaryKey: 'en.student.student-tables',
            domainMode,
            studentId: this.options.appState.currentStudentId,
            infoGlossaryKey: 'en.student.student-row',
            dataGlossaryKey: 'en.student.student-item-table',
            onItemSelected: (payload) => {
                void this.#itemDetailModule?.onItemSelected(payload);
            },
            onStudentSelected: (studentId) => this._selectStudent(studentId),
        });

        this.#itemDetailModule = EnItemDetailModule.create(CONFIG.itemDetailContainerId, {
            ...this._childOptions(),
            glossaryKey: 'en.student.item-details',
            showModuleTitle: true,
            onStudentSelected: (studentId) => this._selectStudent(studentId),
        });
        this.#itemDetailModule.className = 'detail-section';
    }
}

customElements.define('tba-en-student-view', EnStudentViewModule);
