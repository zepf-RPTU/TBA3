/**
 * ItemRingGridConfig — ChartHostModule descriptor for the MA item-ring grid; the
 * orchestration is ItemRingGridController's.
 */

import { soleSelectedStudent, studentSelection } from './selection.js';
import { ItemRingGridController } from './itemRingGridController.js';
import { MA_DATASETS } from '../../../maDatasets.js';

/** @typedef {import('./itemRingBase.js').ItemRingChart} ItemRingChart */
/**
 * @typedef {import('../../../../common/charts/host/chartHostModule.js').ChartHostOptions & {
 *     defaultInnerRingVisible?: boolean,
 *     ringGrouping: import('@preact/signals-core').Signal<string>,
 *     student?: import('@preact/signals-core').ReadonlySignal<string|null>,
 *     ringId?: import('@preact/signals-core').ReadonlySignal<string|null>,
 *     onRingSelected?: (ringId: string) => void,
 * }} ItemRingGridOptions
 */

/**
 * @typedef {object} ItemRingGridState
 * @property {string[]|null} selectedStudents - `null` draws the group figures.
 * @property {string|null} selectedRing
 * @property {boolean} innerRingVisible
 */

/**
 * @typedef {import('../../../../common/charts/host/chartHostModule.js').ChartHostModule<ItemRingChart, ItemRingGridOptions, import('./itemRingGridController.js').ItemRingGridController, ItemRingGridState>} ItemRingGridChartHost
 */

/**
 * The verbs `publicAPI` binds onto the host, as its callers see them.
 * @typedef {{
 *     setCompetenceLevelFilter(level: string|null): void,
 * }} ItemRingGridVerbs
 */

/**
 * The host as this config leaves it — the `publicAPI` verb bound onto the instance.
 * @typedef {ItemRingGridChartHost & ItemRingGridVerbs} ItemRingGridHost
 */

/** @type {import('../../../../common/charts/host/chartHostModule.js').ChartHostConfig<ItemRingChart, ItemRingGridOptions, import('./itemRingGridController.js').ItemRingGridController, ItemRingGridVerbs, ItemRingGridState>} */
export const itemRingGridConfig = {
    glossaryPath: 'ma.item.item-ring-grid',

    /**
     * @param {ItemRingGridChartHost} host
     * @returns {import('../../../../common/charts/host/chartDataTable.js').ChartDataTables}
     */
    dataTable: (host) => host.controller.dataTable(),

    documents: [MA_DATASETS.ITEM_RECORDS, MA_DATASETS.STUDENT_RECORDS, MA_DATASETS.ITEM_RINGS],

    /**
     * @param {ItemRingGridChartHost} host
     * @returns {ItemRingGridState}
     */
    initialState: (host) => ({
        selectedStudents: studentSelection(host.options.student?.peek() ?? null),
        selectedRing: null,
        innerRingVisible: host.options.defaultInnerRingVisible ?? true,
    }),

    createController: (host) => new ItemRingGridController(host),

    // Another grouping is another set of rings: the grid is built anew.
    rebuildOn: (host) => host.options.ringGrouping.value,

    defaultOptions: {
        showModuleTitle: true,
    },

    /**
     * One selected student means this grid *is* that student's card. No selection, or
     * several, is the group grid with a highlight — the same card either way, so
     * it stays unscoped.
     * @param {ItemRingGridChartHost} host
     * @returns {string|null}
     */
    getExportIdentity(host) {
        return soleSelectedStudent(host.state.selectedStudents.value);
    },

    /**
     * @param {ItemRingGridChartHost} host
     * @returns {ItemRingChart[]|ItemRingChart} In grid order.
     */
    createRenderer(host) {
        return host.controller.create();
    },

    headerActions: (host) => [
        host.controller.groupingDropdown(),
        host.controller.innerRingToggle(),
    ],

    // =========================================================================
    // PUBLIC API
    // =========================================================================

    publicAPI: {
        /**
         * Highlight one Kompetenzstufe's students across all rings.
         * @param {ItemRingGridChartHost} host
         * @param {string|null} level - `null` clears.
         */
        setCompetenceLevelFilter(host, level) {
            host.controller.setCompetenceLevelFilter(level);
        },
    },
};
