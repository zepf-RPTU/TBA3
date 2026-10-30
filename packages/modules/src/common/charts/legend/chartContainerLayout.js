/**
 * The chart body scaffold an HTML legend panel sits in: the SVG area beside the panel,
 * or, for a chart's key (`ChartRenderer.chartKey`), over it or beside it. Planned from a
 * renderer's `legend` option, and installed only once the renderer it replaces in the
 * same container is gone.
 */

const CHART_WITH_LEGEND_CLASS = 'chart-with-legend-panel';
const CHART_WITH_KEY_CLASS = 'chart-with-key';
/** An `auto` key placed beside the plot (`placeKeyBeside`); without it, over the plot. */
const KEY_BESIDE_CLASS = 'chart-with-key--beside';
const SVG_AREA_CLASS = 'chart-svg-area';
const LEGEND_PANEL_CLASS = 'chart-legend-panel';
/**
 * The padded frame a chart draws in (`chartRenderer.css`): the plot area alone, so a
 * container a direct drawing framed before nests no second frame around the key layout.
 */
const PLOT_AREA_CLASS = 'chart-container';

/**
 * What a chart lays into its container: the plot area's id, and where its HTML legend
 * panel goes.
 * @typedef {object} ContainerLayoutPlan
 * @property {string} plotAreaId - The id the chart prefixes its node ids with: the SVG area's beside a panel, else the container's own (or its module's).
 * @property {'side'|'top'|'auto'|null} legend - A side panel of pills, the chart's key over the plot (`top`) or (`auto`) beside it while the plot keeps its room (`placeKeyBeside`), or no panel: the chart draws into the container itself.
 */

/**
 * Plan a chart's layout in its container, without touching the container.
 * @param {string} containerId - The container's id, or that of the module around it.
 * @param {'side'|'top'|'auto'} [legend] - The panel the chart asks for; none draws into the container itself.
 * @returns {ContainerLayoutPlan}
 */
export function prepareContainerLayout(containerId, legend) {
    return legend
        ? { plotAreaId: `${containerId}-svg`, legend }
        : { plotAreaId: containerId, legend: null };
}

/**
 * Lay the plan into the container: the SVG area and the panel (the pair already there
 * when it carries the plan's id, else a new pair in place of the container's content),
 * or, without a panel, the container itself, freed of the legend layout a renderer
 * before it left there.
 * @param {HTMLElement} container - Host content body.
 * @param {ContainerLayoutPlan} plan
 * @returns {{ plotArea: HTMLElement, legendPanel: HTMLElement | null }} Where the chart draws, and where its HTML legend does.
 */
export function installContainerLayout(container, { plotAreaId, legend }) {
    if (!legend) {
        releaseChartSvgLegendLayout(container);
        container.classList.add(PLOT_AREA_CLASS);
        return { plotArea: container, legendPanel: null };
    }
    container.classList.remove(PLOT_AREA_CLASS);
    const key = legend === 'side' ? null : legend;
    container.classList.toggle(CHART_WITH_LEGEND_CLASS, !key);
    container.classList.toggle(CHART_WITH_KEY_CLASS, !!key);
    // An `auto` key starts over the plot; the renderer's first measure places it.
    container.classList.remove(KEY_BESIDE_CLASS);

    const svgArea = /** @type {HTMLDivElement|null} */ (
        container.querySelector(`.${SVG_AREA_CLASS}`)
    );
    const legendPanel = /** @type {HTMLDivElement|null} */ (
        container.querySelector(`.${LEGEND_PANEL_CLASS}`)
    );
    // A key over the plot comes first in the DOM as on screen, so Tab and a screen
    // reader reach it before the marks; a panel beside the plot follows it.
    const panelFirst = !!key;
    if (svgArea && legendPanel && svgArea.id === plotAreaId) {
        orderPanel(container, legendPanel, panelFirst);
        return { plotArea: svgArea, legendPanel };
    }

    const plotArea = document.createElement('div');
    plotArea.className = `${SVG_AREA_CLASS} ${PLOT_AREA_CLASS}`;
    plotArea.id = plotAreaId;
    const panel = document.createElement('div');
    panel.className = LEGEND_PANEL_CLASS;
    container.replaceChildren(...(panelFirst ? [panel, plotArea] : [plotArea, panel]));
    return { plotArea, legendPanel: panel };
}

/**
 * Place an `auto` key beside the plot or over it, in the DOM as on screen: over the
 * plot it comes first, beside it it follows. A move keeps the keyboard focus on the
 * entry that had it.
 * @param {HTMLElement} container - Laid out with a key (`installContainerLayout`).
 * @param {HTMLElement} legendPanel
 * @param {boolean} beside
 */
export function placeKeyBeside(container, legendPanel, beside) {
    container.classList.toggle(KEY_BESIDE_CLASS, beside);
    orderPanel(container, legendPanel, !beside);
}

/**
 * Put the panel before or after the plot area, the focus kept where it was.
 * @param {HTMLElement} container
 * @param {HTMLElement} legendPanel
 * @param {boolean} first
 */
function orderPanel(container, legendPanel, first) {
    if ((container.firstElementChild === legendPanel) === first) return;
    const focused = legendPanel.contains(document.activeElement)
        ? /** @type {HTMLElement} */ (document.activeElement)
        : null;
    if (first) container.prepend(legendPanel);
    else container.append(legendPanel);
    focused?.focus({ preventScroll: true });
}

/**
 * Free a container no renderer draws into any more of the layout the last one left: its
 * key-layout classes and its plot area and panel. A chart message (a descriptor's empty state, the
 * host's failure sentence) stays.
 * @param {HTMLElement} container - Host content body.
 */
export function releaseChartLayout(container) {
    releaseChartSvgLegendLayout(container);
    // A snapshot: removing from the live collection while walking it would skip nodes.
    for (const child of Array.from(container.children)) {
        if (!child.classList.contains('chart-message')) child.remove();
    }
}

/**
 * Remove the key-layout classes: before a renderer without a panel takes over the
 * container, and when no renderer does.
 * @param {HTMLElement} container
 */
function releaseChartSvgLegendLayout(container) {
    container.classList.remove(CHART_WITH_LEGEND_CLASS, CHART_WITH_KEY_CLASS, KEY_BESIDE_CLASS);
}
