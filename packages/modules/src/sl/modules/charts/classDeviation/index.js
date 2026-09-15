/**
 * `@tba3/modules/charts/class-deviation` — the Klassenabweichungs-Descriptor together with
 * the queries that build its rows.
 *
 * `buildSummaryRows` turns one of the Kennzahlen from `@tba3/modules/sl-domain` plus the
 * share and rate queries into the chart's rows; the two measurement helpers let a host
 * reserve the width the labels will need.
 */

export { classDeviationConfig } from './classDeviationConfig.js';
export { estimateMinRowWidth, resolveLabelLineCount } from './classDeviationChart.js';
export { CompetenceShareQueries } from '../../../utils/slCompetenceShares.js';
export { SolutionRateQueries } from '../../../utils/slSolutionRates.js';
export { buildSummaryRows } from '../../../utils/slSchoolSummaryMetrics.js';
