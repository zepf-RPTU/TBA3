/**
 * The scatterplot's zoom: the axis domains for either state and the toggle button in the
 * host's title bar. Whether the chart is zoomed is host state (`isZoomed`), so it
 * survives a re-render; a toggle redraws the chart at the new domain. Free functions
 * over the renderer; the bounds math is the pure half in `scatterZoomDomain.js`.
 */

import { headerActionButton, renderIcon } from '@tba3/module-base';
import { nothing } from 'lit';
import { calculateZoomDomain } from './scatterZoomDomain.js';
import { CHART_CONFIG, PERCENT_RANGE } from './scatterplotConstants.js';

/** @typedef {import('./scatterplot.js').Scatterplot} Scatterplot */

/**
 * Both axes' domains: the data's padded extent when zoomed, the full percent range
 * otherwise, and also when the data fills every band: there is no toggle then
 * (`zoomToggle`), and the full view is the one that shows every band whole.
 * @param {Scatterplot} chart
 * @param {boolean} isZoomed
 * @returns {{x: ReadonlyArray<number>, y: ReadonlyArray<number>}}
 */
export function zoomDomains(chart, isZoomed) {
    if (!isZoomed || chart.coversEveryBand) return { x: PERCENT_RANGE, y: PERCENT_RANGE };
    const { xMin, xMax, yMin, yMax } = calculateZoomDomain(chart.points, {
        domainIds: chart.axisDomainIds,
        averages: chart.drawnAverages,
        paddingPP: CHART_CONFIG.ZOOM.PADDING_PP,
    });
    return { x: [xMin, xMax], y: [yMin, yMax] };
}

/**
 * The zoom toggle of the host's title bar, unless every competence-level band already
 * holds a point on each axis (`chart.coversEveryBand`): zooming would then reveal nothing
 * the full view does not already show, and the chart draws the full view.
 * @param {import('./scatterplotConfig.js').ScatterplotChartHost} host - The host whose header carries the control and which keeps `isZoomed`.
 * @returns {unknown} The toggle, or `nothing` without a renderer or without anything to zoom into.
 */
export function zoomToggle(host) {
    const chart = host.chart;
    if (!chart || chart.coversEveryBand) return nothing;

    return headerActionButton({
        name: 'zoom-toggle',
        ariaLabel: host.options.context.glossary.getRequiredEntryText(
            'general.buttons.element_texts.zoom.label',
        ),
        pressed: host.state.isZoomed.value,
        // The zoom frames the plot alone: the table lists every point either way.
        inactive: host.showsTable,
        buttonContent: renderIcon('zoom_in'),
        // The renderer shares the host's signal, so the write redraws it.
        onClick: () => {
            host.state.isZoomed.value = !host.state.isZoomed.value;
        },
    });
}
