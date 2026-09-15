/**
 * ScatterplotConfig — ChartHostModule descriptor for the EN scatterplot: student
 * performance across two Domänen, with optional click-to-select.
 */

import { Scatterplot } from './scatterplot.js';
import { getEnGerThresholds, toScatterPoints } from './scatterPointAdapter.js';
import { ensureComparisonModeDropdown } from '../../../../common/charts/host/comparisonModeControl.js';
import { setActiveModes } from '../../../../common/charts/host/comparisonSync.js';

/**
 * The three chart properties the parsed style aggregation feeds, named here because
 * the mapping does not read as obvious:
 * the chart's `classAverages` takes the aggregation's **`classDomainAverages`** (one value
 * per Domäne). The aggregation's own `classAverages` are per learning style, which this
 * chart does not draw, and reading them here would put the wrong numbers on the class
 * marker rather than fail.
 * @param {{classDomainAverages?: object, className?: string, comparisonGroups?: Array<object>}|null|undefined} styleAverages - The `parseStyleAggregation` result, absent until the aggregation loads.
 * @returns {{classAverages: object|null, classLabel: string|null, comparisons: Array<object>}} The class marker's values and label, and the comparison groups to draw.
 */
function scatterAveragesFrom(styleAverages) {
    return {
        classAverages: styleAverages?.classDomainAverages ?? null,
        classLabel: styleAverages?.className ?? null,
        // Comparison groups stay a list: a payload can carry several Landesschnitte
        // (a state that splits by track ships one per track), and the chart renders
        // every group it is given rather than choosing one. A group that is absent
        // from the payload is simply absent here — the chart draws no marker for it,
        // never a substitute value.
        comparisons: styleAverages?.comparisonGroups ?? [],
    };
}

// ============================================================================
// CONFIG DESCRIPTOR
// ============================================================================

/**
 * The host as this config leaves it — the `publicAPI` verbs bound onto the instance.
 * @typedef {import('../../../../common/charts/host/chartHostModule.js').ChartHostModule & {
 *     setActiveModes(activeModes: string[]): void,
 *     getSelectedIds(): Set<string>,
 *     setSelectedIds(selectedIds: Set<string>): void,
 *     clearSelection(): void,
 *     setTouchSelectionArmed(armed: boolean): void,
 * }} ScatterplotHost
 */

/** @type {import('../../../../common/charts/host/chartHostModule.js').ChartHostConfig} */
export const scatterplotConfig = {
    glossaryPath: 'en.overview.scatterplot',

    defaultOptions: {
        showModuleTitle: true,
        enableModuleExport: true,
        domainTitles: null,
        enableSelection: false,
        selectedStudentIds: null,
        onSelectionChanged: null,
        startZoomed: false,
    },

    /**
     * Create the Scatterplot renderer.
     * @param {import('../../../../common/charts/host/chartHostModule.js').ChartHostModule} host - The host whose container the chart draws into and whose options it reads.
     * @param {object} data - The view's payload for this render: student array, parsed style averages and initial zoom state.
     * @returns {Scatterplot|null} The renderer, or `null` when the host's container has already left the DOM.
     */
    createRenderer(host, data) {
        if (!document.getElementById(host.id)) {
            console.warn(
                `ScatterplotConfig[${host.id}]: Container removed from DOM, skipping render`,
            );
            return null;
        }

        const styleAverages = data.styleAverages;
        const enConfig = host.getOption('enConfig');

        const chart = new Scatterplot(host.id, {
            enConfig,
            points: toScatterPoints(data.studentArray, enConfig),
            gerThresholds: getEnGerThresholds(enConfig),
            domainTitles: host.getOption('domainTitles'),
            ...scatterAveragesFrom(styleAverages),
            startZoomed: data.startZoomed || host.getOption('startZoomed') || false,
            enableSelection: host.getOption('enableSelection'),
            selectedStudentIds: host.getOption('selectedStudentIds') || new Set(),
            onSelectionChanged: host.getOption('onSelectionChanged'),
            onStudentClick: ({ studentId }) => host.getOption('onStudentSelected')?.(studentId),
            comparisonState: host.getOption('comparisonState') ?? null,
        });

        // The menu offers the groups this render was given — one absent from the
        // payload draws no marker, so it gets no toggle either.
        ensureComparisonModeDropdown(host, host.getOption('comparisonState'), () =>
            chart.comparisons.map((group) => ({ id: group.id, label: group.name })),
        );
        return chart;
    },

    publicAPI: {
        setActiveModes,

        /**
         * Get currently selected student IDs.
         * @param {import('../../../../common/charts/host/chartHostModule.js').ChartHostModule} host - The host owning the renderer.
         * @returns {Set<string>} The selection, or an empty set while no renderer exists.
         */
        getSelectedIds(host) {
            return host.chart?.getSelectedIds() || new Set();
        },

        /**
         * Set selected student IDs.
         * @param {import('../../../../common/charts/host/chartHostModule.js').ChartHostModule} host - The host owning the renderer.
         * @param {Set<string>} selectedIds - The selection to apply.
         */
        setSelectedIds(host, selectedIds) {
            host.chart?.setSelectedIds(selectedIds);
        },

        /**
         * Clear all selections.
         * @param {import('../../../../common/charts/host/chartHostModule.js').ChartHostModule} host - The host owning the renderer.
         */
        clearSelection(host) {
            host.chart?.clearSelection();
        },

        /**
         * Arm or disarm touch marquee selection; mouse drags are never gated.
         * @param {import('../../../../common/charts/host/chartHostModule.js').ChartHostModule} host - The host owning the renderer.
         * @param {boolean} armed - Whether a touch drag should draw a marquee.
         */
        setTouchSelectionArmed(host, armed) {
            host.chart?.setTouchSelectionArmed(armed);
        },
    },
};
