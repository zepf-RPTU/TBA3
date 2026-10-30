/**
 * GroupComparisonConfig — ChartHostModule descriptor for the SL group comparison:
 * two groups on one metric, drawn as a population pyramid, with its selectors in the
 * host's controls strip above it.
 */

import { computed } from '@preact/signals-core';
import { html } from 'lit';
import { live } from 'lit/directives/live.js';
import { repeat } from 'lit/directives/repeat.js';
import { GroupComparisonChart } from './groupComparisonChart.js';
import {
    COMPARISON_ROWS,
    COMPARISON_SOURCES,
    POINTS_MIXED_BOOKLETS,
} from './groupComparisonChartTypes.js';

/** Each chart type's traits (`family`, …), for an owner that words its text per measure. */
export { CHART_TYPE_CONFIG as GROUP_COMPARISON_CHART_TYPES } from './groupComparisonChartTypes.js';
import './groupComparisonConfig.css';

/** @typedef {import('./groupComparisonChartTypes.js').GroupComparisonSelection} GroupComparisonSelection */
/** @typedef {import('./groupComparisonChart.js').GroupComparisonControl} GroupComparisonControl */

/** @typedef {import('../../../../common/charts/host/chartHostModule.js').ChartHostOptions} GroupComparisonOptions */

/**
 * The host's state, derived from the live chart's selection. Both keys are empty until
 * the first renderer exists.
 * @typedef {{controls: GroupComparisonControl[], selection: GroupComparisonSelection|null}} GroupComparisonState
 */

/** @typedef {import('../../../../common/charts/host/chartHostModule.js').ChartHostModule<GroupComparisonChart, GroupComparisonOptions, null, GroupComparisonState>} GroupComparisonHost */

/**
 * One labelled select of the strip. The wrapping `<label>` names the select; each option
 * is selected through `live`, so a choice the model did not take snaps back.
 * @param {GroupComparisonControl} control
 * @returns {import('lit').TemplateResult}
 */
function controlField(control) {
    return html`<label class="control-field group-comparison-control"
        ><span class="control-label group-comparison-control-label">${control.label}</span
        ><select
            class="control-select control-select--card group-comparison-control-select"
            ?disabled=${control.disabled === true}
            @change=${(/** @type {Event} */ event) =>
                control.apply(/** @type {HTMLSelectElement} */ (event.currentTarget).value)}
        >
            ${control.options.map(
                (option) =>
                    html`<option
                        value=${option.value}
                        ?disabled=${option.disabled}
                        .selected=${live(option.value === control.selectedValue)}
                    >
                        ${option.text}
                    </option>`,
            )}
        </select></label
    >`;
}

// ============================================================================
// CONFIG DESCRIPTOR
// ============================================================================

/** @type {import('../../../../common/charts/host/chartHostModule.js').ChartHostConfig<GroupComparisonChart, GroupComparisonOptions, null, import('../../../../common/charts/host/chartHostModule.js').NoVerbs, GroupComparisonState>} */
export const groupComparisonConfig = {
    glossaryPath: 'sl.comparison.comparison-plot',

    documents: [COMPARISON_SOURCES, COMPARISON_ROWS, POINTS_MIXED_BOOKLETS],
    defaultOptions: {
        showModuleTitle: true,
    },

    /**
     * @param {GroupComparisonHost} host
     * @returns {import('@tba3/module-base').StateInit<GroupComparisonState>}
     */
    initialState: (
        host,
    ) => /** @type {import('@tba3/module-base').StateInit<GroupComparisonState>} */ ({
        controls: computed(() => host.chart?.getControlModel() ?? []),
        selection: computed(() => host.chart?.selection ?? null),
    }),

    /**
     * @param {GroupComparisonHost} host
     * @returns {string|null} Null before the chart has selectors.
     */
    getExportIdentity(host) {
        const selection = host.state.controls.value
            .map((control) => control.selectedValue)
            .filter((value) => value != null && value !== '')
            .join('-');
        return selection || null;
    },

    /**
     * The selectors, keyed by id: a select keeps its node, and with it the focus a
     * keyboard change left on it.
     * @param {GroupComparisonHost} host
     * @returns {import('lit').TemplateResult}
     */
    bodyControls: (host) =>
        html`<div class="group-comparison-controls layout-row layout-row--wrap">
            ${repeat(host.state.controls.value, (control) => control.id, controlField)}
        </div>`,

    /**
     * @param {GroupComparisonHost} host
     * @returns {GroupComparisonChart}
     */
    createRenderer(host) {
        const documents = host.options.context.documents;
        const data = {
            sources: documents.getDataset(COMPARISON_SOURCES),
            rowsOf: (/** @type {GroupComparisonSelection} */ selection) =>
                documents.getDataset(COMPARISON_ROWS, selection),
            pointsMixedBooklets: (/** @type {GroupComparisonSelection} */ selection) =>
                documents.getDataset(POINTS_MIXED_BOOKLETS, selection),
        };
        return new GroupComparisonChart(host.chartArea, data, host.rendererOptions);
    },
};
