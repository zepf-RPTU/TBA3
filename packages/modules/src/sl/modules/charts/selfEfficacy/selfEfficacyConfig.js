/**
 * SelfEfficacyConfig — ChartHostModule descriptor for the self-efficacy views, box
 * plot or stacked bar.
 *
 * The renderer class depends on the viz mode, so a mode change is a full re-render
 * rather than a state update: the instance itself changes. Used by the subject and
 * class grids in SlOverviewViewModule, full behind a card's overlay and compact within.
 */

import { SelfEfficacyBoxPlot } from './selfEfficacyBoxPlot.js';
import { SelfEfficacyStackedBar } from './selfEfficacyStackedBar.js';
import { VIZ_MODES } from '../../../slVizModes.js';
import {
    ensureChartSvgLegendLayout,
    releaseChartSvgLegendLayout,
} from '../shared/chartContainerLayout.js';

// ============================================================================
// CONFIG DESCRIPTOR
// ============================================================================

/**
 * The host as this config leaves it — the `publicAPI` verb bound onto the instance.
 * @typedef {import('../../../../common/charts/host/chartHostModule.js').ChartHostModule & {
 *     setVizMode(mode: string): void,
 * }} SelfEfficacyHost
 */

/** @type {import('../../../../common/charts/host/chartHostModule.js').ChartHostConfig} */
export const selfEfficacyConfig = {
    defaultOptions: {
        enableModuleExport: true,
        defaultVizMode: VIZ_MODES.STACKED_BAR,
        chartHeight: 400,
        isVertical: false,
        compact: false,
    },

    /**
     * Create a SelfEfficacyBoxPlot or SelfEfficacyStackedBar renderer
     * depending on the current viz mode.
     *
     * For horizontal stacked-bar mode, sets up a wrapper with an HTML legend panel
     * (same pattern as competencyChartConfig). Vertical and boxplot modes render
     * directly into the host container without a legend panel.
     *
     * A compact preview takes neither: no legend panel and no configured height,
     * so the watermark is sized by the thumbnail card it sits in.
     * @param {import('../../../../common/charts/host/chartHostModule.js').ChartHostModule} host - The host whose container the chart draws into.
     * @param {object} data - The Selbstwirksamkeit rows to draw.
     * @returns {object|null} The renderer, or `null` when the host's container has already left the DOM.
     */
    createRenderer(host, data) {
        const container = document.getElementById(host.id);
        if (!container) {
            return null;
        }

        const vizMode = host.configState.vizMode || host.getOption('defaultVizMode');
        const height = host.getOption('chartHeight');
        const isVertical = host.getOption('isVertical');

        if (host.getOption('compact') === true) {
            return vizMode === VIZ_MODES.BOXPLOT
                ? new SelfEfficacyBoxPlot(host.id, data, { compact: true })
                : new SelfEfficacyStackedBar(host.id, data, { compact: true });
        }

        if (vizMode === VIZ_MODES.BOXPLOT) {
            // Remove wrapper if switching from stacked-bar
            releaseChartSvgLegendLayout(container);
            return new SelfEfficacyBoxPlot(host.id, data, { height });
        } else {
            const opts = { height };
            if (isVertical) opts.isVertical = true;

            if (!isVertical) {
                // Horizontal mode — set up sub-containers for SVG + HTML legend panel
                const svgAreaId = `${host.id}-svg`;
                const { legendPanel: legendContainer } = ensureChartSvgLegendLayout(container, {
                    svgAreaId,
                });
                opts.legendContainer = legendContainer;
                return new SelfEfficacyStackedBar(svgAreaId, data, opts);
            } else {
                // Vertical mode — render directly, no legend panel
                releaseChartSvgLegendLayout(container);
                return new SelfEfficacyStackedBar(host.id, data, opts);
            }
        }
    },

    publicAPI: {
        /**
         * Switch the visualisation. Requires a full re-render because the renderer
         * class changes (BoxPlot vs StackedBar).
         * @param {import('../../../../common/charts/host/chartHostModule.js').ChartHostModule} host - The host owning the chart.
         * @param {string} mode - The visualisation to switch to.
         */
        setVizMode(host, mode) {
            host.configState.vizMode = mode;
            // Re-render with current data — creates the appropriate renderer class
            const currentData = host.getData();
            if (currentData) {
                host.rerender(currentData);
            }
        },
    },
};
