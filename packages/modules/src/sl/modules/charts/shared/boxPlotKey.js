/**
 * The key every SL box plot shows in its legend panel: how to read the figure, and which
 * colour is which measure when one chart draws both. Display-only blocks for the
 * renderer's `chartKey`; school leaders get no other explanation of a box plot.
 */

import { TERM_CONSTANTS } from '../../../../common/domain/terms.js';

/** @typedef {import('../../../../common/charts/legend/htmlLegendPanel.js').ChartKey} ChartKey */

/** What each part of `drawBoxPlotFigure` stands for, in the order the eye meets it. */
const ANATOMY_ITEMS = Object.freeze([
    { key: 'box', label: 'Box: mittlere 50 % der Werte' },
    { key: 'median', label: `Strich in der Box: ${TERM_CONSTANTS.MEDIAN}` },
    { key: 'mean', label: `◇: ${TERM_CONSTANTS.MEAN}` },
    { key: 'whiskers', label: 'Linien: übrige Werte' },
    { key: 'outliers', label: `○: ${TERM_CONSTANTS.OUTLIERS}` },
]);

/**
 * The key's blocks: the measures' colours when there is more than one, then the
 * figure's anatomy.
 * @param {Array<{label: string, color: string}>} [series] - The measures the chart draws, each in its colour.
 * @returns {ChartKey}
 */
export function boxPlotKey(series = []) {
    return [
        ...(series.length > 1
            ? [
                  {
                      title: TERM_CONSTANTS.LEGEND,
                      items: series.map(({ label, color }) => ({ key: label, label, color })),
                  },
              ]
            : []),
        { title: TERM_CONSTANTS.BOX_PLOT, items: [...ANATOMY_ITEMS] },
    ];
}
