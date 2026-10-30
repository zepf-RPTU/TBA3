/**
 * ChartHostModule descriptor for one student's EN Teilkompetenzen card: a spider in
 * mode `all`, a lollipop per domain.
 */

import { computed } from '@preact/signals-core';
import { getRecordsByIds } from '../../../../common/data/datasetIndex.js';
import { StyleSpiderChart } from './styleSpiderChart.js';
import { EN_DATASETS } from '../../../enDatasets.js';
import { buildStyleCategoryPerformance } from '../../../utils/enStyleAggregation.js';
import {
    applyLollipopMinHeight,
    buildStyleLollipop,
    resolveStyleAverages,
    showStyleEmptyState,
    styleComparisonModes,
    styleDataset,
} from './styleChartShared.js';

/**
 * Either renderer the card draws.
 * @typedef {StyleSpiderChart|import('./styleLollipopChart.js').StyleLollipopChart} StyleChart
 */

/**
 * @typedef {import('../../../../common/charts/host/chartHostModule.js').ChartHostOptions & {
 *     domainMode?: string | import('@preact/signals-core').Signal<string>,
 *     studentId?: string | null | import('@preact/signals-core').Signal<string|null>,
 * }} StyleStudentOptions
 */

/**
 * @typedef {{mode: string, studentId: string|null}} StyleStudentState
 */

/** @typedef {import('../../../../common/charts/host/chartHostModule.js').ChartHostModule<StyleChart, StyleStudentOptions, null, StyleStudentState>} StyleStudentHost */

/**
 * @param {StyleStudentHost} host
 * @returns {import('../../../utils/enStudentDataAdapter.js').EnStudentRecord|null}
 */
function selectedStudent(host) {
    const studentId = host.state.studentId.value;
    if (!studentId) return null;
    const [student] = getRecordsByIds(
        host.options.context.documents,
        EN_DATASETS.STUDENT_RECORDS_BY_ID,
        [studentId],
    );
    return student ?? null;
}

// ============================================================================
// CONFIG DESCRIPTOR
// ============================================================================

/** @type {import('../../../../common/charts/host/chartHostModule.js').ChartHostConfig<StyleChart, StyleStudentOptions, null, import('../../../../common/charts/host/chartHostModule.js').NoVerbs, StyleStudentState>} */
export const styleStudentChartConfig = {
    documents: [
        EN_DATASETS.STUDENT_RECORDS,
        EN_DATASETS.STUDENT_RECORDS_BY_ID,
        EN_DATASETS.STYLE_AVERAGES,
        EN_DATASETS.CONFIG,
    ],

    comparisonModes: styleComparisonModes,

    /**
     * @param {StyleStudentHost} host
     * @returns {import('@tba3/module-base').StateInit<StyleStudentState>}
     */
    initialState: (host) => ({
        mode: host.options.domainMode ?? 'all',
        studentId: host.options.studentId ?? null,
    }),

    /**
     * @param {StyleStudentHost} host
     * @returns {boolean} Whether the spider draws.
     */
    rebuildOn: (host) => host.state.mode.value === 'all',

    /**
     * @param {StyleStudentHost} host
     * @returns {StyleChart|null} `null` for a group with no student.
     */
    createRenderer(host) {
        if (styleDataset(host, EN_DATASETS.STUDENT_RECORDS).length === 0) {
            showStyleEmptyState(host);
            return null;
        }
        const enConfig = styleDataset(host, EN_DATASETS.CONFIG);
        // One lookup per student: the spider names and draws the record, the lollipop
        // draws its values.
        const student = computed(() => selectedStudent(host));
        if (host.state.mode.value === 'all') {
            applyLollipopMinHeight(host, false);
            return new StyleSpiderChart(host.chartArea, {
                ...host.rendererOptions,
                student,
                enConfig,
                groupStyleAverages: styleDataset(host, EN_DATASETS.STYLE_AVERAGES),
            });
        }
        return buildStyleLollipop(host, {
            styleAverages: resolveStyleAverages(host),
            // No student draws the group alone, as the spider does: no student pill, key
            // entry or column.
            studentValues: computed(() =>
                student.value ? buildStyleCategoryPerformance(student.value, enConfig) : null,
            ),
        });
    },

    /**
     * The card keeps one renderer and re-points it at whichever student is selected, and
     * redraws on a domain switch, so both belong in the export id.
     * @param {StyleStudentHost} host
     * @returns {Array<string|null>}
     */
    getExportIdentity(host) {
        return [host.state.studentId.value, host.state.mode.value];
    },
};
