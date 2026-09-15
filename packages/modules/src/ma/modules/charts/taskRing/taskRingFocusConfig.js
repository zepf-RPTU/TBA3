/**
 * TaskRingFocusConfig — ChartHostModule configuration for the task ring focus chart.
 *
 * Shows a detailed domain-level task ring chart for a single domain.
 */

import { TaskRingFocusChart } from './taskRingFocus.js';

/**
 * Record what this host now shows, so its export target id follows the swap.
 * Kept on `configState` because `getExportIdentity(host)` is called from the
 * export sync, long after the data that carried the domain has gone.
 * @param {import('../../../../common/charts/host/chartHostModule.js').ChartHostModule} host - The host the identity is recorded on.
 * @param {object | null} domain - The Leitidee now shown, or `null` for none.
 * @param {Array|null} selectedStudents - The current selection; one student makes the capture that student's.
 */
function rememberExportIdentity(host, domain, selectedStudents) {
    host.configState.exportDomain = domain?.domain ?? null;
    // One student means the view focused this chart on them; none or several is
    // the class chart with a highlight, which is the same card.
    host.configState.exportStudent =
        Array.isArray(selectedStudents) && selectedStudents.length === 1
            ? String(selectedStudents[0])
            : null;
}

// ============================================================================
// CONFIG DESCRIPTOR
// ============================================================================

/** @type {import('../../../../common/charts/host/chartHostModule.js').ChartHostConfig} */
export const taskRingFocusConfig = {
    glossaryPath: 'ma.items.task-ring-focus',

    defaultOptions: {
        showModuleTitle: true,
        enableModuleExport: true,
    },

    /**
     * One host serves every Leitidee in turn (`onUpdate` swaps the domain in
     * place rather than rebuilding the shell), so the domain — and the student,
     * where the view focuses one — is what tells two captures apart.
     * @param {import('../../../../common/charts/host/chartHostModule.js').ChartHostModule} host - The host owning this chart.
     * @returns {Array<string|null>} The recorded Leitidee and student, either of which may be `null`.
     */
    getExportIdentity(host) {
        return [host.configState.exportDomain ?? null, host.configState.exportStudent ?? null];
    },

    /**
     * Create the TaskRingFocusChart renderer.
     * @param {import('../../../../common/charts/host/chartHostModule.js').ChartHostModule} host - The host the chart draws into; its title follows the Leitidee.
     * @param {object} data - The Leitidee and what it shows.
     * @param {Array} data.domainItems - Items filtered for this domain
     * @param {Array} data.studentArray - Student data array
     * @param {object} data.domain - Domain object containing domain metadata
     * @param {Array|null} [data.selectedStudents] - Optional selected-student subset
     * @returns {TaskRingFocusChart} The renderer for this host.
     */
    createRenderer(host, data) {
        const { domainItems, studentArray, domain, selectedStudents = null } = data;
        rememberExportIdentity(host, domain, selectedStudents);
        host.setTitle(domain?.domainLabel || domain?.domain || '');
        // Target the content body, not the outer container — when showModuleTitle
        // is active, the outer container holds header + body children and the SVG
        // must render inside the body, not alongside it.
        const bodyEl = host.contentContainer;
        if (!bodyEl.id) {
            bodyEl.id = `${host.id}-body`;
        }
        return new TaskRingFocusChart(bodyEl.id, domainItems, studentArray, domain, {
            selectedStudents,
        });
    },

    /**
     * Update the existing focus chart in place so domain selection does not
     * tear down the surrounding host shell and header controls.
     *
     * Reactive: pushes the new slice through setState (the chart syncs the
     * changed keys into chartState and re-renders). Re-passing the same
     * studentArray is a no-op thanks to referential diffing.
     * @param {import('../../../../common/charts/host/chartHostModule.js').ChartHostModule} host - The host owning the live chart.
     * @param {Array<object>} charts - The host's charts; this config creates exactly one.
     * @param {object} data - The Leitidee, items, students and selection to show now.
     */
    async onUpdate(host, charts, data) {
        const chart = charts[0];
        if (!chart) {
            await host.rerender(data);
            return;
        }

        const { domainItems, studentArray, domain, selectedStudents = null } = data;

        rememberExportIdentity(host, domain, selectedStudents);
        // setTitle resyncs the export controls, which is what picks up the id
        // the line above just changed — so it has to come after it.
        host.setTitle(domain?.domainLabel || domain?.domain || '');
        chart.setState({
            items: domainItems,
            students: studentArray,
            domain,
            selectedStudents,
        });
    },
};
