/**
 * ItemSuccessLollipopConfig — ChartHostModule descriptor for the MA item-success
 * lollipop: the share of students who solved each task, with configurable average
 * overlays (Landesschnitt, Schulschnitt) supplied through the `averages` option.
 */

import { ItemSuccessLollipopChart } from './itemSuccessLollipopChart.js';
import { ensureComparisonModeDropdown } from '../../../../common/charts/host/comparisonModeControl.js';

/**
 * Whether one average is currently shown. The app's shared comparison state is the
 * one owner of "is this average drawn?" — the same state the KS chart's groups follow,
 * keyed by the same ids (`school`, `state`, …) — so a rebuilt chart (theme change,
 * resize) and every other MA chart answer from the same place. The renderer asks at
 * draw time through the `isAverageVisible` predicate instead of keeping a copy.
 * @param {import('../../../../common/charts/host/chartHostModule.js').ChartHostModule} host - The host owning this chart.
 * @param {string} id - The average's id.
 * @returns {boolean} True when the average should be drawn.
 */
function getAverageVisible(host, id) {
    // No comparison state means no opinion about visibility, so every average the
    // payload carries is drawn.
    return host.getOption('comparisonState')?.isActive(id) ?? true;
}

// ============================================================================
// AVERAGES DROPDOWN
// ============================================================================

/**
 * Create the ⌀ comparison dropdown in the module header, bound to the app's shared
 * comparison state.
 * @param {import('../../../../common/charts/host/chartHostModule.js').ChartHostModule} host - The host whose header carries the control.
 * @param {object} chart - The live renderer, read for the averages it actually has; with none, the control is removed rather than shown empty.
 */
function ensureAveragesDropdown(host, chart) {
    ensureComparisonModeDropdown(host, host.getOption('comparisonState'), () =>
        Array.from(chart.chartState.averages, ([id, avg]) => ({ id, label: avg.name })),
    );
}

// ============================================================================
// CONFIG DESCRIPTOR
// ============================================================================

/**
 * The host as this config leaves it — the `publicAPI` verb bound onto the instance.
 * @typedef {import('../../../../common/charts/host/chartHostModule.js').ChartHostModule & {
 *     setActiveModes(activeModes: string[]): void,
 * }} ItemSuccessLollipopHost
 */

/** @type {import('../../../../common/charts/host/chartHostModule.js').ChartHostConfig} */
export const itemSuccessLollipopConfig = {
    glossaryPath: 'ma.items.item-graph',

    defaultOptions: {
        showModuleTitle: true,
        enableModuleExport: true,
        collapsible: true,
        startCollapsed: true,
    },

    createRenderer(host, data) {
        const chart = new ItemSuccessLollipopChart(host.id, data.itemArray, {
            isAverageVisible: (id) => getAverageVisible(host, id),
        });
        chart.setData(data.itemArray);

        // Register only explicitly supplied averages.
        const averages = host.getOption('averages') || [];
        for (const avg of averages) {
            chart.registerAverage(avg.id, {
                name: avg.name,
                label: avg.label,
                color: avg.color,
                typeIndex: avg.typeIndex,
                shape: avg.shape,
                generator: avg.generator,
            });
        }

        return chart;
    },

    // The dropdown is a module-header control rebuilt once per render cycle, so it
    // belongs in the host's post-create hook rather than in `createRenderer`: the host
    // skips `onRendered` when the cycle was superseded, so a stale pass can no longer
    // wire the control to a renderer it is about to destroy. (The registry itself is
    // complete as soon as `createRenderer` has run its `registerAverage` loop — nothing
    // in `create()` adds to it — so this is about the render cycle, not about the data.)
    onRendered(host, charts) {
        const chart = charts[0];
        if (chart) ensureAveragesDropdown(host, chart);
    },

    publicAPI: {
        // The predicate reads the app state at draw time, so a toggle — from this
        // header or the KS chart's — only needs a redraw. The view hands over the
        // whole state on every resume, so skip the redraw for a state the chart is
        // already drawn against. The charts that hold `activeModes` as renderer state
        // use the shared `setActiveModes` for this; this one holds none, so it keeps
        // the drawn list on the host instead.
        setActiveModes(host, activeModes) {
            const drawn = Array.isArray(activeModes) ? activeModes.join(',') : null;
            if (drawn !== null && drawn === host.configState.drawnComparisonModes) return;
            host.configState.drawnComparisonModes = drawn;

            void host.chart?.refresh().catch((error) => {
                console.error(
                    `ItemSuccessLollipopConfig[${host.id}]: average refresh failed:`,
                    error,
                );
            });
        },
    },
};
