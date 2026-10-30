/**
 * The Pilotierung difference in one spelling, wherever it is printed.
 */

import { formatPercentPoints } from './numberFormat.js';

/**
 * The signed Pilotierung difference in the result colours: green at or above the pilot
 * rate, red below.
 * @param {number} diffPP
 * @param {string} [className] - Further classes for the span.
 * @returns {string} The `(±n PP)` span.
 */
export function pilotDiffHtml(diffPP, className = '') {
    const diffClass = diffPP >= 0 ? 'result-diff--up' : 'result-diff--down';
    return `<span class="${className ? `${className} ` : ''}${diffClass}">(${formatPercentPoints(diffPP, 0)})</span>`;
}
