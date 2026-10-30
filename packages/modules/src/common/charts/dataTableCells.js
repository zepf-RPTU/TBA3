/**
 * The cells and columns a chart's `dataTable()` builds its table from
 * (`host/chartDataTable.js`): a figure shows as the chart prints it and exports as the
 * number, a share with its headcount as two. A value the data does not carry is an
 * empty cell, never a dash or a 0. Plain data, so a domain reader may build cells too.
 */

import { TERM_CONSTANTS } from '../domain/terms.js';
import { formatCount, formatPercent, isFiniteNumber } from '../utils/numberFormat.js';

/** @typedef {import('./host/chartDataTable.js').ChartDataCell} ChartDataCell */
/** @typedef {import('./host/chartDataTable.js').ChartDataColumn} ChartDataColumn */

/**
 * One figure, shown as `format` prints it and exported as the number.
 * @param {number|null|undefined} value - The figure; anything non-finite is missing.
 * @param {(value: number) => string} [format] - How it shows; a percentage by default.
 * @returns {ChartDataCell}
 */
export function figureCell(value, format = formatPercent) {
    return isFiniteNumber(value)
        ? { text: format(value), values: [value] }
        : { text: '', values: [null] };
}

/**
 * A column of percentages (`figureCell`), exported under its label with the unit.
 * @param {string} label
 * @returns {ChartDataColumn}
 */
export function percentColumn(label) {
    return { label, fields: [`${label} (%)`] };
}

/**
 * A column of shares with their headcounts (`shareCountCell`), exported as two fields.
 * @param {string} label - The level, band or group the shares are of.
 * @returns {ChartDataColumn}
 */
export function shareCountColumn(label) {
    return {
        label,
        fields: [
            `${label} ${TERM_CONSTANTS.SHARE} (%)`,
            `${label} ${TERM_CONSTANTS.STUDENT_COUNT}`,
        ],
    };
}

/**
 * Count-and-shares columns: the headcount, then a share-and-count column per label (a
 * Kompetenzstufe, a rating band).
 * @param {string[]} labels - What the shares are of, in order.
 * @returns {ChartDataColumn[]}
 */
export function shareCountColumns(labels) {
    return [{ label: TERM_CONSTANTS.STUDENT_COUNT }, ...labels.map(shareCountColumn)];
}

/**
 * A share with its headcount, `15,4 % (4)`, exported as two numbers. Without a count
 * (a source that delivers shares alone) the share shows alone; without a share the cell
 * is empty.
 * @param {number|null|undefined} share - The share, 0–100.
 * @param {number|null} [count]
 * @returns {ChartDataCell}
 */
export function shareCountCell(share, count = null) {
    if (!isFiniteNumber(share)) return { text: '', values: [null, null] };
    const text = formatPercent(share);
    return isFiniteNumber(count)
        ? { text: `${text} (${formatCount(count)})`, values: [share, count] }
        : { text, values: [share, null] };
}
