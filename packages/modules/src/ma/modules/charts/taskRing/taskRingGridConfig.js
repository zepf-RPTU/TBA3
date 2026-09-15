/**
 * TaskRingGridConfig — ChartHostModule descriptor for the MA task-ring grid.
 *
 * Deliberately thin: the orchestration lives in the feature-local
 * TaskRingGridController beside it.
 */

import { getTaskRingGridController } from './taskRingGridController.js';

/** @typedef {import('./taskRingBase.js').TaskRingChart} TaskRingChart */

// =============================================================================
// CONFIG DESCRIPTOR
// =============================================================================

/**
 * The host as this config leaves it — the `publicAPI` verbs bound onto the instance.
 * @typedef {import('../../../../common/charts/host/chartHostModule.js').ChartHostModule & {
 *     setKsLevelFilter(level: string|null): void,
 *     updateSelectedStudentsOptimized(selectedStudents: Array<any>): boolean,
 *     getSelectedDomain(): string|null,
 *     selectDomain(domainId: string|null): boolean,
 * }} TaskRingGridHost
 */

/** @type {import('../../../../common/charts/host/chartHostModule.js').ChartHostConfig} */
export const taskRingGridConfig = {
    glossaryPath: 'ma.items.item-donuts',

    defaultOptions: {
        showModuleTitle: true,
        enableModuleExport: true,
        enableDomainSelection: false,
        defaultInnerRingVisible: true, // set to false for the overview to start with inner ring hidden
    },

    /**
     * One selected student means this grid *is* that student's card (the student
     * and parent views point one host at one student in turn). No selection, or
     * several, is the class grid with a highlight — the same card either way, so
     * it stays unscoped.
     * @param {import('../../../../common/charts/host/chartHostModule.js').ChartHostModule} host - The host owning this grid.
     * @returns {string|null} The student id when the grid stands for one student, otherwise `null`.
     */
    getExportIdentity(host) {
        const selected = getTaskRingGridController(host).state?.lastSelectedStudents;
        return Array.isArray(selected) && selected.length === 1 ? String(selected[0]) : null;
    },

    // =========================================================================
    // CREATE — builds the grid DOM + TaskRingChart instances
    // =========================================================================

    /**
     * Build the grid DOM and one ring per Leitidee.
     * @param {import('../../../../common/charts/host/chartHostModule.js').ChartHostModule} host - The host whose container the grid is built in.
     * @param {object} data - Everything the rings are computed from.
     * @param {Array} data.itemArray - The items the ring segments stand for.
     * @param {Array} data.studentArray - The class's students.
     * @param {Array} data.domains - The Leitideen the booklet declares, one ring each.
     * @param {Array|null} data.selectedStudents - Students to highlight; `null` draws the class figures.
     * @returns {Promise<TaskRingChart[]|TaskRingChart>} The created rings, in grid order.
     */
    async createRenderer(host, data) {
        return getTaskRingGridController(host).create(data);
    },

    // =========================================================================
    // UPDATE
    // =========================================================================

    /**
     * Re-solve the grid and push new data into the existing rings.
     * @param {import('../../../../common/charts/host/chartHostModule.js').ChartHostModule} host - The host owning the live grid.
     * @param {TaskRingChart[]} charts - The rings created earlier, in grid order.
     * @param {object} data - The new items, students, Leitideen and selection.
     */
    async onUpdate(host, charts, data) {
        await getTaskRingGridController(host).update(charts, data);
    },

    onCleanup(host) {
        getTaskRingGridController(host).cleanup();
    },

    // =========================================================================
    // PUBLIC API
    // =========================================================================

    publicAPI: {
        /**
         * KS-level filter (from the ksDistribution chart, wired by the overview
         * view): highlight the matching students across all rings. Reactive
         * (setState) — the chart holds the immutable studentArray and resolves
         * the highlighted slice from the level, so no data is re-pushed.
         * @param {import('../../../../common/charts/host/chartHostModule.js').ChartHostModule} host - The host owning this grid.
         * @param {string|null} level - The Kompetenzstufe to highlight, or null to clear.
         */
        setKsLevelFilter(host, level) {
            getTaskRingGridController(host).setKsLevelFilter(level);
        },

        /**
         * Optimized update when only selectedStudents change.
         * @param {import('../../../../common/charts/host/chartHostModule.js').ChartHostModule} host - The host owning this grid.
         * @param {Array} selectedStudents - The new selection.
         * @returns {boolean} True if optimized path succeeded
         */
        updateSelectedStudentsOptimized(host, selectedStudents) {
            // The controller resyncs the export controls itself — the selection
            // is part of this host's export identity and the KS-level filter
            // reaches the controller without passing through here.
            return getTaskRingGridController(host).updateSelectedStudentsOptimized(
                selectedStudents,
            );
        },

        /**
         * The Leitidee the grid currently has selected — the front door to this
         * config's state for the view that opens the matching focus chart.
         * @param {import('../../../../common/charts/host/chartHostModule.js').ChartHostModule} host - The host owning this grid.
         * @returns {string|null} The selected domain id, or null before the first render.
         */
        getSelectedDomain(host) {
            return host.configState.selectedDomain ?? null;
        },

        /**
         * Select a Leitidee the way a ring click does, without reporting it
         * through `onDomainSelected` — the chart-only views call this with the
         * app-state Leitidee they already know.
         * @param {import('../../../../common/charts/host/chartHostModule.js').ChartHostModule} host - The host owning this grid.
         * @param {string|null} domainId - The Leitidee to select.
         * @returns {boolean} Whether the selection moved.
         */
        selectDomain(host, domainId) {
            return getTaskRingGridController(host).selectDomain(domainId);
        },
    },
};
