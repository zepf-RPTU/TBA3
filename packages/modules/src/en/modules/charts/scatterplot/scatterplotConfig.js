/**
 * ChartHostModule descriptor for the EN scatterplot: student performance across two
 * Domänen, with optional click-to-select.
 */

import { Scatterplot } from './scatterplot.js';
import { getEnGerThresholds, toScatterPoints } from './scatterPointAdapter.js';
import { zoomToggle } from './scatterZoomController.js';
import { EN_DATASETS } from '../../../enDatasets.js';

/**
 * The three chart properties the parsed style aggregation feeds. The chart's
 * `groupAverages` takes the aggregation's `groupDomainAverages` (one value per Domäne);
 * the aggregation's own `groupAverages` are per learning style, which this chart does
 * not draw.
 * @param {import('../../../utils/enStyleAggregationAdapter.js').ParsedStyleAggregation} styleAverages
 * @returns {{groupAverages: {[domainId: string]: number}, groupName: string|null, comparisons: import('../../../utils/enStyleAggregationAdapter.js').StyleComparisonGroup[]}}
 */
function scatterAveragesFrom(styleAverages) {
    return {
        groupAverages: styleAverages.groupDomainAverages,
        groupName: styleAverages.groupName,
        comparisons: styleAverages.comparisonGroups,
    };
}

// ============================================================================
// CONFIG DESCRIPTOR
// ============================================================================

/**
 * @typedef {import('../../../../common/charts/host/chartHostModule.js').ChartHostOptions & {
 *     enableSelection?: boolean,
 *     selectedIds?: import('@preact/signals-core').Signal<ReadonlySet<string>>,
 *     touchSelectionArmed?: import('@preact/signals-core').Signal<boolean>,
 *     onStudentSelected?: (studentId: string) => void,
 * }} ScatterplotOptions
 */

/**
 * `selectedIds` is replaced, never changed in place, so every write is a change. The
 * chart shares all three signals, and the host the two its owner hands it.
 * @typedef {{isZoomed: boolean, selectedIds: ReadonlySet<string>, touchSelectionArmed: boolean}} ScatterplotState
 */

/**
 * @typedef {import('../../../../common/charts/host/chartHostModule.js').ChartHostModule<Scatterplot, ScatterplotOptions, null, ScatterplotState>} ScatterplotChartHost
 */

/**
 * The verb `publicAPI` binds onto the host, as its callers see it.
 * @typedef {{
 *     selectAll(): void,
 * }} ScatterplotVerbs
 */

/**
 * The host as this config leaves it — the `publicAPI` verb bound onto the instance.
 * @typedef {ScatterplotChartHost & ScatterplotVerbs} ScatterplotHost
 */

/** @type {import('../../../../common/charts/host/chartHostModule.js').ChartHostConfig<Scatterplot, ScatterplotOptions, null, ScatterplotVerbs, ScatterplotState>} */
export const scatterplotConfig = {
    glossaryPath: 'en.overview.scatterplot',

    documents: [EN_DATASETS.STUDENT_RECORDS, EN_DATASETS.STYLE_AVERAGES, EN_DATASETS.CONFIG],

    defaultOptions: {
        showModuleTitle: true,
        enableSelection: false,
    },

    /**
     * @param {ScatterplotChartHost} host
     * @returns {import('@tba3/module-base').StateInit<ScatterplotState>} The owner's selection signals, shared.
     */
    initialState: (host) => ({
        isZoomed: true,
        selectedIds: host.options.selectedIds ?? new Set(),
        touchSelectionArmed: host.options.touchSelectionArmed ?? false,
    }),

    /**
     * @param {ScatterplotChartHost} host
     * @returns {Scatterplot}
     */
    createRenderer(host) {
        const documents = host.options.context.documents;
        const enConfig = documents.getDataset(EN_DATASETS.CONFIG);

        return new Scatterplot(host.chartArea, {
            ...host.rendererOptions,
            enConfig,
            points: toScatterPoints(documents.getDataset(EN_DATASETS.STUDENT_RECORDS), enConfig),
            gerThresholds: getEnGerThresholds(enConfig),
            ...scatterAveragesFrom(documents.getDataset(EN_DATASETS.STYLE_AVERAGES)),
            enableSelection: host.options.enableSelection,
            selectedIds: host.state.selectedIds,
            touchSelectionArmed: host.state.touchSelectionArmed,
            onStudentClick: ({ studentId }) => host.options.onStudentSelected?.(studentId),
            isZoomed: host.state.isZoomed,
        });
    },

    headerActions: zoomToggle,

    publicAPI: {
        /**
         * Select every student the chart plots: a student without a percentage in a
         * domain draws no point and stays unselected. Before the chart exists the
         * selection stays.
         * @param {ScatterplotChartHost} host
         */
        selectAll(host) {
            const points = host.chart?.points;
            if (!points) return;
            host.state.selectedIds.value = new Set(points.map((point) => point.studentId));
        },
    },
};
