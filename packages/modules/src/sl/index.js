/**
 * `@tba3/modules/sl-domain` — the Schulleitungs-Vokabular: what a host needs to turn a
 * school's documents into rows, options and metrics before any card is mounted.
 *
 * Like `@tba3/modules/domain` this carries no d3, no Tabulator and no DOM, so a data
 * service, a dataset builder or a header-control table can read it without pulling a chart
 * in. `buildLevelDefinitions` reads a `competence-levels.json` into the per-Fach/Domäne
 * scales, `getScaleIdForDomain` resolves one of them, `buildCompetenceLevelIndex` groups
 * the result rows and `deriveClassNames` orders the classes. `hasSurveyRows` and
 * `detectHistorySurveyScales` answer which Befragungsdaten a dataset and its history
 * carry, `calculateDetailedBoxPlotStats` produces their quartiles. `SUMMARY_METRICS` names
 * the selectable Kennzahlen with `DEFAULT_SUMMARY_METRIC_ID` as the initial one and
 * `deriveSummaryAverages` their reference averages; the `MATERIAL_*` lists are the
 * Material card's choices, narrowed to a dataset by `deriveMaterialSubjectOptions`.
 * `VIZ_MODES` names the display modes the SL cards accept.
 */

export { buildCompetenceLevelIndex, deriveClassNames } from './slCompetenceLevelIndex.js';
export { buildLevelDefinitions, getScaleIdForDomain } from './utils/slLevelDefinitions.js';
export { hasSurveyRows } from './utils/slSurveyRows.js';
export { calculateDetailedBoxPlotStats } from './utils/slBoxPlotStats.js';
export { VIZ_MODES } from './slVizModes.js';
export { deriveSummaryAverages } from './utils/slSchoolSummaryMetrics.js';
export { detectHistorySurveyScales } from './modules/charts/longitudinal/historyAdapter.js';

export {
    DEFAULT_SUMMARY_METRIC_ID,
    SUMMARY_METRICS,
} from './utils/slSchoolSummaryMetricRegistry.js';

export {
    deriveMaterialSubjectOptions,
    MATERIAL_SUBJECT_OPTIONS,
    MATERIAL_TYPE_OPTIONS,
} from './utils/slSubjectConfig.js';
