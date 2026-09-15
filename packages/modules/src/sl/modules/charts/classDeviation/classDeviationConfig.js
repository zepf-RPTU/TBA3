/**
 * classDeviationConfig — ChartHostModule descriptor for one subject×domain row of the
 * SL "Überblick" view.
 *
 * One host per row. The view computes every row plus the shared y domain and label
 * band, then broadcasts the whole payload on a metric change; each host picks its own
 * slice by (subjectName, domainId) and re-renders.
 */

import { ClassDeviationChart } from './classDeviationChart.js';
import { ensureComparisonModeDropdown } from '../../../../common/charts/host/comparisonModeControl.js';

/**
 * Pick this host's entry out of one half of a summary payload (rows or absences).
 * @param {import('../../../../common/charts/host/chartHostModule.js').ChartHostModule} host - The host, whose options name its subject×domain.
 * @param {Array<object>|null} entries - One half of the payload.
 * @returns {object|null} This host's entry, or `null` when that half does not contain it.
 */
function selectEntryForHost(host, entries) {
    const subjectName = host.getOption('subjectName');
    const domainId = host.getOption('domainId') ?? null;

    return (
        (entries ?? []).find(
            (entry) => entry.subjectName === subjectName && (entry.domainId ?? null) === domainId,
        ) ?? null
    );
}

/**
 * Renderer input for the subject×domain this host owns.
 *
 * `row` is null when the metric yields no data for it, and `absence` then carries the
 * reason — the two halves of the payload partition the dataset, so exactly one of them
 * matches. Passing both means the chart never has to say "keine Daten" without knowing
 * which kind of absence it is looking at.
 * @param {import('../../../../common/charts/host/chartHostModule.js').ChartHostModule} host - The host the data is resolved for.
 * @param {object} data - The full summary payload.
 * @returns {object} The row or its absence, plus the y scale and label-band height every card shares. The column band is not passed: the chart derives it from the row's own entries.
 */
function resolveChartData(host, data) {
    return {
        row: selectEntryForHost(host, data?.rows),
        absence: selectEntryForHost(host, data?.absences),
        yDomain: data?.yDomain,
        labelLines: data?.labelLines,
        metric: data?.metric,
    };
}

// ============================================================================
// CONFIG DESCRIPTOR
// ============================================================================

/** @type {import('../../../../common/charts/host/chartHostModule.js').ChartHostConfig} */
export const classDeviationConfig = {
    glossaryPath: 'sl.summary.deviation',

    defaultOptions: {
        showModuleTitle: true,
        enableModuleExport: true,
        subjectName: '',
        domainId: null,
    },

    /**
     * Always builds a renderer: a row with no data under the current metric is
     * handed through as `row: null`, and the chart draws its no-data message.
     * Returning null here would leave the card blank on the next theme rerender.
     * @param {import('../../../../common/charts/host/chartHostModule.js').ChartHostModule} host - The host whose container the card draws into.
     * @param {object} data - The full summary payload.
     * @returns {ClassDeviationChart} The renderer for this card.
     */
    createRenderer(host, data) {
        // Idempotent, so re-running it on every render keeps the toggle alive across
        // metric changes and theme rebuilds without duplicating it. It offers the
        // reference averages this payload carries and writes the app's comparison
        // state — the same state every other card reads, so one toggle moves them all.
        ensureComparisonModeDropdown(host, host.getOption('comparisonState'), () =>
            (data?.averages ?? []).map((average) => ({ id: average.id, label: average.label })),
        );

        return new ClassDeviationChart(host.id, resolveChartData(host, data));
    },

    /**
     * Data reload — same full re-render as a metric change.
     * @param {import('../../../../common/charts/host/chartHostModule.js').ChartHostModule} host - The host owning the card.
     * @param {object} _charts - Unused: the rerender builds a fresh chart.
     * @param {object} data - The new summary payload.
     */
    // The view rebuilds the whole payload on a metric or ⌀ change and pushes it
    // through update(). `rerender` stores the payload on the host, so a later
    // KS-theme rebuild (which re-renders from `host.getData()`) keeps this metric.
    async onUpdate(host, _charts, data) {
        await host.rerender(data);
    },
};
