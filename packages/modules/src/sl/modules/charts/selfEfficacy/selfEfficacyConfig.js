/**
 * SelfEfficacyConfig — ChartHostModule descriptor for the self-efficacy chart, box plot
 * or stacked bar: full-size or as a thumbnail (`thumbnail`).
 */

import { SelfEfficacyBoxPlot } from './selfEfficacyBoxPlot.js';
import { SelfEfficacyStackedBar } from './selfEfficacyStackedBar.js';
import { StripBarChart } from '../../../../common/charts/stripBar/stripBarChart.js';
import { buildRatingBuckets } from '../../../utils/slRatingAppearance.js';
import { ratingBandTooltip } from '../../../utils/slBoxPlotStats.js';
import { getRatingCategoryDescription } from '../../../utils/slRatingDistribution.js';
import { VIZ_MODES } from '../../../slVizModes.js';
import { SL_DATASETS } from '../../../slDatasets.js';
import { findSelfEfficacy } from '../../../utils/slSurveyLookup.js';

/**
 * One Selbstwirksamkeit row: a group, or the school (`Schule`). A row exists only once
 * a group has a value, so its `values` are never empty and its `statistics` never null.
 * @typedef {import('../../../utils/slSurveyDerivation.js').SurveyAggregate & {statistics: import('../../../utils/slBoxPlotStats.js').BoxPlotStats}} SelfEfficacyRow
 */

/**
 * The chart's options: the chart-host options plus the row selection — the `groupName`
 * group, the school with `showOnlySchoolData`, or with neither every group and the school.
 * @typedef {import('../../../../common/charts/host/chartHostModule.js').ChartHostOptions & {
 *     groupName?: string | null,
 *     showOnlySchoolData?: boolean,
 *     vizMode: string | import('@preact/signals-core').Signal<string>,
 * }} SelfEfficacyOptions
 */

/**
 * The chart's state: the visualisation, which picks the renderer.
 * @typedef {{vizMode: string}} SelfEfficacyState
 */

/** @typedef {SelfEfficacyBoxPlot|SelfEfficacyStackedBar|StripBarChart} SelfEfficacyRenderer */

/** @typedef {import('../../../../common/charts/host/chartHostModule.js').ChartHostModule<SelfEfficacyRenderer, SelfEfficacyOptions, null, SelfEfficacyState>} SelfEfficacyHost */

/**
 * Whether a row has box-plot statistics to draw. Every built row does — a group enters
 * the aggregate with its first value — so this narrows the type, not the rows.
 * @param {import('../../../utils/slSurveyDerivation.js').SurveyAggregate|null} row
 * @returns {row is SelfEfficacyRow}
 */
const hasStatistics = (row) => row !== null && row.statistics !== null;

/**
 * One group's rating bands as strip segments: each named by its band (`gut`), with its
 * headcount, and a tooltip of the band's range and share over the group mean.
 * @param {SelfEfficacyRow} row
 * @returns {import('../../../../common/charts/stripBar/stripBarChart.js').StripSegment[]}
 */
function ratingStripSegments(row) {
    return buildRatingBuckets(row.distribution).map((bucket) => {
        const name = getRatingCategoryDescription(bucket.key) || bucket.label;
        return {
            ...bucket,
            label: name,
            tooltip: ratingBandTooltip(bucket, { title: name, mean: row.statistics.mean }),
        };
    });
}

/**
 * Whether the host's options select one row — a group's or the school's — rather than
 * every group and the school.
 * @param {SelfEfficacyHost} host
 * @returns {boolean}
 */
const selectsOneRow = (host) =>
    Boolean(host.options.groupName) || host.options.showOnlySchoolData === true;

/**
 * The rows the host's row selection draws (`SelfEfficacyOptions`).
 * @param {SelfEfficacyHost} host
 * @returns {SelfEfficacyRow[]|null} `null` when the selected one is missing.
 */
function readSelfEfficacyRows(host) {
    const documents = host.options.context.documents;
    if (selectsOneRow(host)) {
        // No group is the school row.
        const row = findSelfEfficacy(documents, host.options.groupName || null);
        return hasStatistics(row) ? [row] : null;
    }
    const byGroup = documents.getDataset(SL_DATASETS.SELF_EFFICACY_BY_GROUP);
    const school = documents.getDataset(SL_DATASETS.SELF_EFFICACY_SCHOOL);
    return [...byGroup, school].filter(hasStatistics);
}

// ============================================================================
// CONFIG DESCRIPTOR
// ============================================================================

/** @type {import('../../../../common/charts/host/chartHostModule.js').ChartHostConfig<SelfEfficacyRenderer, SelfEfficacyOptions, null, import('../../../../common/charts/host/chartHostModule.js').NoVerbs, SelfEfficacyState>} */
export const selfEfficacyConfig = {
    documents: [
        SL_DATASETS.SELF_EFFICACY_BY_GROUP,
        SL_DATASETS.SELF_EFFICACY_SCHOOL,
        SL_DATASETS.SELF_EFFICACY_INDEX,
    ],

    defaultOptions: {
        showOnlySchoolData: false,
    },

    /**
     * The visualisation is the `vizMode` option: the app's signal itself.
     * @param {SelfEfficacyHost} host
     * @returns {import('@tba3/module-base').StateInit<SelfEfficacyState>}
     */
    initialState: (host) => ({ vizMode: host.options.vizMode }),

    /**
     * A mode change re-renders: it creates the other renderer class.
     * @param {SelfEfficacyHost} host
     * @returns {string}
     */
    rebuildOn: (host) => host.state.vizMode.value,

    /**
     * @param {SelfEfficacyHost} host
     * @returns {SelfEfficacyRenderer|null} `null` when the selected row is missing.
     */
    createRenderer(host) {
        const container = host.chartArea;
        const rows = readSelfEfficacyRows(host);
        if (!rows) return null;

        const { thumbnail } = host.options;
        const isBoxPlot = host.state.vizMode.value === VIZ_MODES.BOXPLOT;
        if (!thumbnail && !isBoxPlot && selectsOneRow(host)) {
            return new StripBarChart(container, ratingStripSegments(rows[0]), {
                ...host.rendererOptions,
                rowLabel: rows[0].groupName,
            });
        }
        const Renderer = isBoxPlot ? SelfEfficacyBoxPlot : SelfEfficacyStackedBar;
        return new Renderer(container, rows, host.rendererOptions);
    },
};
