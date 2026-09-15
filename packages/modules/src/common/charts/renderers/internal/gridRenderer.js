/**
 * GridRenderer — draws horizontal gridlines into a chart group.
 *
 * A collaborator the renderer *has* (`renderer.grid`). The method is
 * host-independent — it takes the target group + scale as arguments — so this
 * collaborator is stateless. Gridlines are solid hairlines one shade off the surface
 * (the theme's grid colour): dashed rules read as "projection / threshold" noise, and
 * separating the grid by opacity is theme-fragile.
 * @module gridRenderer
 */

import { getThemeColors } from '../../../services/themeService.js';
import * as d3 from 'd3';

export class GridRenderer {
    /**
     * Create horizontal gridlines inside group `g`, returning the created selection.
     * @param {*} g - D3 group selection to append the gridlines to
     * @param {object} [options] - The y scale to draw against, the plot width, and the tick choice.
     * @returns {*} The created grid selection, or null when no y scale was supplied.
     */
    createGridLines(g, options = /** @type {any} */ ({})) {
        const { yScale = null, chartWidth = 0, yTicks = null } = options;

        let yGrid = null;

        if (yScale) {
            const axis = d3
                .axisLeft(yScale)
                .tickSize(-chartWidth)
                .tickFormat(() => '');
            if (yTicks != null) axis.ticks(yTicks);

            yGrid = g.append('g').attr('class', 'grid y-grid').call(axis);

            yGrid.selectAll('line').attr('stroke', getThemeColors().chart.gridColor);

            yGrid.select('.domain').remove();
            yGrid.selectAll('text').remove();
        }

        return yGrid;
    }
}
