/**
 * CompetencyChartConfig — ChartHostModule configuration for the SL competency
 * distribution (overview) chart on the Welcome view.
 */

import { CompetencyOverviewRenderer } from './competencyOverviewRenderer.js';
import { ensureChartSvgLegendLayout } from '../../shared/chartContainerLayout.js';
import {
    findOwningModuleTitle,
    markScrollRegion,
} from '../../../../../common/utils/scrollRegion.js';
import './competencyChartConfig.css';

// ============================================================================
// CONFIG DESCRIPTOR
// ============================================================================

/** @type {import('../../../../../common/charts/host/chartHostModule.js').ChartHostConfig} */
export const competencyChartConfig = {
    defaultOptions: {
        enableModuleExport: true,
    },

    /**
     * Create the competency distribution (overview) renderer with an SVG + HTML
     * legend layout.
     * @param {import('../../../../../common/charts/host/chartHostModule.js').ChartHostModule} host - The host whose container the chart draws into.
     * @param {object} data - The competence-level entries to draw.
     * @returns {object|null} The renderer, or `null` when the host's container has already left the DOM.
     */
    createRenderer(host, data) {
        const container = document.getElementById(host.id);
        if (!container) {
            console.warn(
                `CompetencyChartConfig[${host.id}]: Container removed from DOM, skipping render`,
            );
            return null;
        }

        const svgAreaId = `${host.id}-svg`;
        const { svgArea, legendPanel: legendContainer } = ensureChartSvgLegendLayout(container, {
            svgAreaId,
        });
        // The renderer widens its SVG past the container when subjects × classes
        // × label width demand it; this class gives that overflow a scrollbar.
        svgArea.classList.add('sl-competency-overview-svg');
        markScrollRegion(svgArea, findOwningModuleTitle(svgArea));
        return new CompetencyOverviewRenderer(svgAreaId, data.competenceLevels, {
            legendContainer,
        });
    },
};
