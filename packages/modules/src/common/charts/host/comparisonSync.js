/**
 * comparisonSync — pushing the app's comparison state into a chart that keeps it
 * as renderer state.
 *
 * Every view observes the app's comparison state and hands its charts the absolute
 * list of active group ids (`setActiveModes`), including the catch-up on resume. A
 * chart that holds `activeModes` as state only needs the list copied in — and
 * skipped when it already shows it, or the catch-up would redraw every chart for
 * nothing.
 */

/**
 * Guard against re-rendering for a comparison state the chart already shows
 * (a view's resume catch-up replays the latest value, which may be the one already drawn).
 * @param {object|null} chart - The live chart, if one exists yet.
 * @param {string[]} nextActiveModes - The comparison group ids the event carries.
 * @returns {boolean} True when the chart's active modes already match, order included.
 */
export function hasSameActiveModes(chart, nextActiveModes) {
    if (!chart || !Array.isArray(nextActiveModes)) return false;

    const currentActiveModes = chart.getState('activeModes') || [];
    if (currentActiveModes.length !== nextActiveModes.length) return false;

    return currentActiveModes.every((mode, index) => mode === nextActiveModes[index]);
}

/**
 * The `setActiveModes` publicAPI verb for a host whose chart keeps `activeModes` as state.
 * @param {import('./chartHostModule.js').ChartHostModule} host - The host owning the chart.
 * @param {string[]} activeModes - The comparison group ids to show.
 * @returns {void}
 */
export function setActiveModes(host, activeModes) {
    if (!host.chart || !Array.isArray(activeModes)) return;
    if (hasSameActiveModes(host.chart, activeModes)) return;
    host.chart.setState({ activeModes: [...activeModes] });
}
