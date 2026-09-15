/**
 * CompetencyDetailSectionConfig — ChartHostModule descriptor for one competency
 * detail section in the SL overview grids.
 *
 * An update is a full teardown and rebuild rather than a patch. Used by the subject
 * and class grids in SlOverviewViewModule, as the full section behind a card's detail
 * overlay and as the compact watermark inside the card.
 */

import { CompetencyDetailRenderer } from './competencyDetailRenderer.js';
import { resolveCompetencyDetailChartInput } from '../shared/competencyChartData.js';
import { ensureChartSvgLegendLayout } from '../../shared/chartContainerLayout.js';

// ============================================================================
// CONFIG DESCRIPTOR
// ============================================================================

/**
 * The host as this config leaves it — the `publicAPI` verb bound onto the instance.
 * @typedef {import('../../../../../common/charts/host/chartHostModule.js').ChartHostModule & {
 *     setVizMode(mode: string): void,
 * }} CompetencyDetailSectionHost
 */

/** @type {import('../../../../../common/charts/host/chartHostModule.js').ChartHostConfig} */
export const competencyDetailSectionConfig = {
    defaultOptions: {
        enableModuleExport: true,
        className: null,
        showOnlySchoolData: false,
        qualityVizMode: 'stacked_bar',
        compact: false,
    },

    /**
     * Create a CompetencyDetailRenderer for this section.
     * Sets up a wrapper with an HTML legend panel (same pattern as competencyChartConfig).
     * A compact preview draws no legend, so it renders straight into the host
     * container without the SVG/legend split.
     * @param {import('../../../../../common/charts/host/chartHostModule.js').ChartHostModule} host - The host whose container the chart draws into.
     * @param {object} data - The class entries this section draws.
     * @returns {object|null} The renderer, or `null` when the host's container has already left the DOM.
     */
    createRenderer(host, data) {
        const container = document.getElementById(host.id);
        if (!container) {
            return null;
        }

        const chartData = resolveCompetencyDetailChartInput(data);
        const vizMode = host.configState.vizMode || host.getOption('qualityVizMode');

        const rendererOptions = {
            className: host.getOption('className'),
            showOnlySchoolData: host.getOption('showOnlySchoolData'),
            qualityVizMode: vizMode,
            teachingQuality: data.teachingQuality || null,
            stateEntries: data.stateEntries || null,
        };

        if (host.getOption('compact') === true) {
            return new CompetencyDetailRenderer(host.id, chartData, {
                ...rendererOptions,
                compact: true,
            });
        }

        const svgAreaId = `${host.id}-svg`;
        const { legendPanel: legendContainer } = ensureChartSvgLegendLayout(container, {
            svgAreaId,
        });

        return new CompetencyDetailRenderer(svgAreaId, chartData, {
            ...rendererOptions,
            legendContainer,
        });
    },

    publicAPI: {
        /**
         * Switch the visualisation by updating renderer state in-place.
         * @param {import('../../../../../common/charts/host/chartHostModule.js').ChartHostModule} host - The host owning the chart.
         * @param {string} mode - The visualisation to switch to.
         */
        setVizMode(host, mode) {
            host.configState.vizMode = mode;
            if (host.chart) {
                host.chart.setState({ vizMode: mode });
            }
        },
    },
};
