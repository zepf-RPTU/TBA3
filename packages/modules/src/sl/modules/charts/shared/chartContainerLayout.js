/**
 * Shared DOM layout helpers for hosted chart bodies.
 *
 * These helpers only own inner chart-body scaffolding. ChartHostModule owns the
 * module shell, and renderers still own the SVG or HTML content they draw.
 */

import './chartContainerLayout.css';

const CHART_WITH_LEGEND_CLASS = 'chart-with-legend-panel';
const SVG_AREA_CLASS = 'chart-svg-area';
const LEGEND_PANEL_CLASS = 'chart-legend-panel';

/**
 * Ensure a chart body contains a stable SVG area plus HTML legend panel.
 * Reuses an existing wrapper when it already targets the requested SVG id.
 * @param {HTMLElement} container - Host content body.
 * @param {object} options - Which SVG area to target, and whether to rebuild rather than reuse.
 * @param {string} options.svgAreaId - Id assigned to the SVG area child.
 * @param {boolean} [options.reset=false] - Force rebuilding the wrapper.
 * @returns {{ svgArea: HTMLDivElement, legendPanel: HTMLDivElement }} The two stable children the chart and its HTML legend render into.
 */
export function ensureChartSvgLegendLayout(
    container,
    { svgAreaId, reset = false } = /** @type {any} */ ({}),
) {
    if (!(container instanceof HTMLElement)) {
        throw new Error('[ensureChartSvgLegendLayout] container must be an HTMLElement');
    }
    if (!svgAreaId) {
        throw new Error('[ensureChartSvgLegendLayout] svgAreaId is required');
    }

    let svgArea = /** @type {HTMLDivElement} */ (container.querySelector(`.${SVG_AREA_CLASS}`));
    let legendPanel = /** @type {HTMLDivElement} */ (
        container.querySelector(`.${LEGEND_PANEL_CLASS}`)
    );
    const shouldRebuild = reset || !svgArea || !legendPanel || svgArea.id !== svgAreaId;

    container.classList.add(CHART_WITH_LEGEND_CLASS);

    if (shouldRebuild) {
        container.innerHTML = '';

        svgArea = document.createElement('div');
        svgArea.className = SVG_AREA_CLASS;
        svgArea.id = svgAreaId;

        legendPanel = document.createElement('div');
        legendPanel.className = LEGEND_PANEL_CLASS;

        container.appendChild(svgArea);
        container.appendChild(legendPanel);
    }

    return { svgArea, legendPanel };
}

/**
 * Remove the shared SVG/legend-panel layout marker before a direct renderer
 * takes over the host body.
 * @param {HTMLElement|null} container - Host body to unmark; a nullish container is a no-op.
 */
export function releaseChartSvgLegendLayout(container) {
    container?.classList?.remove(CHART_WITH_LEGEND_CLASS);
}
