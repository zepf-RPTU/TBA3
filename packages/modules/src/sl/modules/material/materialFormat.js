/**
 * How the Materialien pages print a figure: German locale numbers, percentages,
 * percentage-point deltas, ranges and the headcount/female-share summary, with a
 * missing value rendered as a dash rather than `NaN` or `0`.
 */

import { getNumberFormat } from '../../../common/utils/numberFormat.js';

export const EPSILON = 1e-9;

/**
 * Whether a value is a real number, so a missing figure renders as a dash rather than
 * as `NaN` or `0`.
 * @param {*} value - The value to test.
 * @returns {value is number} True for a finite number.
 */
export function isFiniteNumber(value) {
    return typeof value === 'number' && Number.isFinite(value);
}

/**
 * Format a number for the material templates.
 * @param {*} value - The figure to format.
 * @param {number} [digits] - Fraction digits, fixed so a column of figures aligns.
 * @returns {string} The formatted number, or an em dash when there is no figure.
 */
export function formatNumber(value, digits = 1) {
    if (!isFiniteNumber(value)) {
        return '&mdash;';
    }

    return getNumberFormat({
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
    }).format(value);
}

/**
 * Format a fraction as a percentage.
 * @param {*} value - The share, as a fraction.
 * @param {number} [digits] - Fraction digits.
 * @returns {string} The formatted percentage, or an em dash when there is no figure.
 */
export function formatPercent(value, digits = 1) {
    if (!isFiniteNumber(value)) {
        return '&mdash;';
    }

    return `${formatNumber(value * 100, digits)}&nbsp;%`;
}

/**
 * Format a difference between two shares as percentage points, signed and tone-coded.
 * @param {*} value - The difference, as a fraction.
 * @param {number} [digits] - Fraction digits.
 * @returns {string} The formatted delta in a toned span, or an em dash when there is no figure.
 */
export function formatPercentPointDelta(value, digits = 1) {
    if (!isFiniteNumber(value)) {
        return '&mdash;';
    }

    const sign = value > EPSILON ? '+' : '';
    const tone =
        value > EPSILON
            ? ' material-delta--positive'
            : value < -EPSILON
              ? ' material-delta--negative'
              : '';

    return `<span class="material-delta${tone}">${sign}${formatNumber(value * 100, digits)}&nbsp;%</span>`;
}

/**
 * Headcount, with the female share appended when the payload carries one.
 * @param {*} count - Number of students.
 * @param {*} femaleShare - Female share as a fraction, if known.
 * @returns {string} The summary, or an em dash without a headcount.
 */
export function formatStudentSummary(count, femaleShare) {
    if (!Number.isFinite(count)) {
        return '&mdash;';
    }

    if (!isFiniteNumber(femaleShare)) {
        return `${count}`;
    }

    return `${count} (${formatNumber(femaleShare * 100, 1)}&nbsp;% weibl.)`;
}

/**
 * Format a min–max range as percentages.
 * @param {{min?: *, max?: *}|null} range - The range, as fractions.
 * @param {number} [digits] - Fraction digits.
 * @returns {string} The formatted range, or an em dash when either end is missing.
 */
export function formatPercentRange(range, digits = 1) {
    if (!range || !isFiniteNumber(range.min) || !isFiniteNumber(range.max)) {
        return '&mdash;';
    }

    return `${formatNumber(range.min * 100, digits)}&nbsp;% - ${formatNumber(range.max * 100, digits)}&nbsp;%`;
}

/**
 * Format a min–max range as plain numbers.
 * @param {{min?: *, max?: *}|null} range - The range.
 * @param {number} [digits] - Fraction digits.
 * @returns {string} The formatted range, or an em dash when either end is missing.
 */
export function formatPlainRange(range, digits = 1) {
    if (!range || !isFiniteNumber(range.min) || !isFiniteNumber(range.max)) {
        return '&mdash;';
    }

    return `${formatNumber(range.min, digits)} - ${formatNumber(range.max, digits)}`;
}

/**
 * The min–max range of whatever real numbers a list contains.
 * @param {Array<*>} [values] - The values, which may include gaps.
 * @returns {{min: number, max: number}|null} The range, or `null` when no value was usable.
 */
export function buildRange(values = []) {
    const numericValues = values.filter(isFiniteNumber);
    if (numericValues.length === 0) {
        return null;
    }

    return {
        min: Math.min(...numericValues),
        max: Math.max(...numericValues),
    };
}
