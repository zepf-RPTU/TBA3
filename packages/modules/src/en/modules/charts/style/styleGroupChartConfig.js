/**
 * ChartHostModule descriptor for the EN Teilkompetenzen card of a set of students: one
 * lollipop over the students `applySync` hands it. Nothing is drawn until the first
 * `applySync`.
 */

import { sameItems, writeState } from '@tba3/module-base';
import { calculateStyleAveragesForStudents } from '../../../utils/enStyleAggregation.js';
import { EN_DATASETS } from '../../../enDatasets.js';
import { clearChartMessage } from '../../../../common/charts/chartMessage.js';
import { getRecordsByIds } from '../../../../common/data/datasetIndex.js';
import {
    buildStyleLollipop,
    styleComparisonModes,
    resolveStyleAverages,
    showStyleEmptyState,
    styleDataset,
} from './styleChartShared.js';

/** @typedef {import('./styleLollipopChart.js').StyleLollipopChart} StyleLollipopChart */
/**
 * @typedef {import('../../../../common/charts/host/chartHostModule.js').ChartHostOptions & {
 *     domainMode?: string | import('@preact/signals-core').Signal<string>,
 * }} StyleGroupOptions
 */

/**
 * `styleAverages` are the resolved averages over the students the table last synced,
 * `null` before its first sync; `empty` marks a sync that matched no student.
 * @typedef {{mode: string, styleAverages: ParsedStyleAggregation | null, empty: boolean}} StyleGroupState
 */

/** @typedef {import('../../../../common/charts/host/chartHostModule.js').ChartHostModule<StyleLollipopChart, StyleGroupOptions, StyleGroupChartController, StyleGroupState>} StyleGroupHost */
/** @typedef {import('../../../utils/enStyleAggregationAdapter.js').ParsedStyleAggregation} ParsedStyleAggregation */

/**
 * @typedef {object} StyleSyncPayload
 * @property {string[]} [ids] - Ids of the students to draw: the selected rows, else the visible ones.
 */

/**
 * Mirrors the group table into the host's state: the lollipop shares its `mode` and
 * `styleAverages` signals, so each redraws it.
 */
class StyleGroupChartController {
    /** @type {string[]|null} The ids of the last table sync, sorted. */
    #syncedIds = null;

    /**
     * @param {StyleGroupHost} host
     */
    constructor(host) {
        this.host = host;
    }

    // ========================================================================
    // EVENT HANDLERS
    // ========================================================================

    /**
     * @param {StyleSyncPayload} data
     */
    applySync(data) {
        const ids = data.ids ?? [];
        // The table re-fires the same ids on every redraw and, reordered, on every sort;
        // the chart already shows their averages.
        const sorted = [...ids].sort();
        if (sameItems(sorted, this.#syncedIds)) return;
        this.#syncedIds = sorted;

        const students = getRecordsByIds(
            this.host.options.context.documents,
            EN_DATASETS.STUDENT_RECORDS_BY_ID,
            ids,
        );
        // A selection without a single style value has no profile to draw: the card shows
        // its empty state, never the whole group's values under the filter.
        const selectionAverages = calculateStyleAveragesForStudents(
            students,
            styleDataset(this.host, EN_DATASETS.CONFIG),
        );
        if (selectionAverages === null) {
            this.host.state.empty.value = true;
            return;
        }
        writeState(this.host.state, {
            styleAverages: resolveStyleAverages(this.host, selectionAverages),
            empty: false,
        });
    }
}

// ============================================================================
// CONFIG DESCRIPTOR
// ============================================================================

/**
 * The verbs `publicAPI` binds onto the host, as its callers see them.
 * @typedef {{
 *     applySync(data: StyleSyncPayload): void,
 * }} StyleGroupChartVerbs
 */

/**
 * The host as this config leaves it — the `publicAPI` verbs bound onto the instance.
 * @typedef {StyleGroupHost & StyleGroupChartVerbs} StyleGroupChartHost
 */

/** @type {import('../../../../common/charts/host/chartHostModule.js').ChartHostConfig<StyleLollipopChart, StyleGroupOptions, StyleGroupChartController, StyleGroupChartVerbs, StyleGroupState>} */
export const styleGroupChartConfig = {
    documents: [EN_DATASETS.STUDENT_RECORDS_BY_ID, EN_DATASETS.STYLE_AVERAGES, EN_DATASETS.CONFIG],

    comparisonModes: styleComparisonModes,

    /**
     * @param {StyleGroupHost} host
     * @returns {import('@tba3/module-base').StateInit<StyleGroupState>}
     */
    initialState: (host) => ({
        mode: host.options.domainMode ?? 'all',
        styleAverages: null,
        empty: false,
    }),

    /**
     * @param {StyleGroupHost} host
     * @returns {boolean[]} Whether the card is empty, and whether it has synced.
     */
    rebuildOn: (host) => [host.state.empty.value, host.state.styleAverages.value !== null],

    createController: (host) => new StyleGroupChartController(host),

    /**
     * @param {StyleGroupHost} host
     * @returns {StyleLollipopChart|null} `null` before the first sync and in the empty state.
     */
    createRenderer(host) {
        clearChartMessage(host.chartArea);
        const { styleAverages, empty } = host.state;
        if (empty.value) {
            showStyleEmptyState(host);
            return null;
        }
        if (!styleAverages.value) return null;
        return buildStyleLollipop(host, {
            // Not null while a lollipop exists: `rebuildOn` rebuilds without one then.
            styleAverages:
                /** @type {import('@preact/signals-core').Signal<ParsedStyleAggregation>} */ (
                    styleAverages
                ),
            studentValues: null,
        });
    },

    /**
     * A domain switch redraws the card, so the mode belongs in the export id.
     * @param {StyleGroupHost} host
     * @returns {string[]}
     */
    getExportIdentity(host) {
        return [host.state.mode.value];
    },

    publicAPI: {
        /**
         * @param {StyleGroupHost} host
         * @param {StyleSyncPayload} data
         */
        applySync(host, data) {
            host.controller.applySync(data);
        },
    },
};
