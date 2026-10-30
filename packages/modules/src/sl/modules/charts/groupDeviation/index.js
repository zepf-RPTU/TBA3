/**
 * `@tba3/modules/charts/group-deviation` — the Lerngruppenabweichungs-Descriptor together
 * with the summary its cards draw from (`getSchoolSummary`, the `SCHOOL_SUMMARY` dataset of
 * the store per selection) and the grid's minimum card width measured from it (`summaryMinRowWidth`).
 */

export { groupDeviationConfig } from './groupDeviationConfig.js';
export { getSchoolSummary } from './schoolSummary.js';
export { summaryMinRowWidth } from './groupDeviationChart.js';

/** @typedef {import('./groupDeviationConfig.js').GroupDeviationOptions} GroupDeviationOptions */
/** @typedef {import('./groupDeviationConfig.js').GroupDeviationHost} GroupDeviationHost */
/** @typedef {import('./schoolSummary.js').SchoolSummary} SchoolSummary */
/** @typedef {import('../../../utils/slSchoolSummaryMetrics.js').SummaryCard} SummaryCard */
