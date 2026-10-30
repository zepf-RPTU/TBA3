/**
 * The style lollipop's legend: one entry per domain (grouped mode) or the group
 * lollipop (single-domain mode), each the filled pill the chart draws, the student's
 * hollow pill, and one entry per delivered comparison group.
 */

import { GLOSSARY_KEYS } from '../../../../common/glossary/glossaryKeys.js';
import { comparisonMarkerLegendItem } from '../../../../common/charts/comparisonSeries.js';
import { MARK_DEFAULTS } from '../../../../common/charts/chartDefaults.js';
import { TERM_CONSTANTS } from '../../../../common/domain/terms.js';

/** @typedef {import('../../../../common/charts/legend/htmlLegendPanel.js').ChartKeyItem} LegendItem */

/**
 * @param {import('./styleLollipopChart.js').StyleLollipopChart} chart
 * @param {boolean} isGrouped - Whether both domains share each row.
 * @returns {LegendItem[]} One entry per drawn series, in draw order.
 */
export function buildLegendItems(chart, isGrouped) {
    /** @type {LegendItem[]} */
    const items = [];

    if (isGrouped) {
        for (const id of chart.enConfig.domainIds) {
            const { label, glossaryKey, color } = chart.domainStyles[id];
            // Explicit runs even without a key: a domain name is never matched as free text.
            items.push({
                label,
                labelSegments: [{ text: label, glossaryKey }],
                symbol: 'pill',
                color,
            });
        }
    }

    // The row colour of single-domain mode; grouped mode draws no student pill.
    const rowColor = chart.domainStyles[isGrouped ? chart.enConfig.domainIds[0] : chart.mode].color;
    if (chart.studentValues) {
        // The pill in miniature: hollow, outlined in the row colour.
        items.push({
            label: TERM_CONSTANTS.STUDENT,
            symbol: 'pill',
            color: 'var(--color-card-background)',
            hollow: true,
            stroke: rowColor,
            strokeWidth: MARK_DEFAULTS.outlineWidthPx,
        });
    }

    if (!isGrouped) {
        items.push({
            label: chart.styleAverages?.groupName ?? undefined,
            glossaryKey: GLOSSARY_KEYS.LERNGRUPPENSCHNITT,
            symbol: 'pill',
            color: rowColor,
        });
    }

    for (const group of chart.comparisonGroups) {
        items.push(comparisonMarkerLegendItem(group));
    }

    return items;
}
