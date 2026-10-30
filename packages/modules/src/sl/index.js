/**
 * `@tba3/modules/sl-domain` — the Schulleitungs-Vokabular: what a host needs to turn a
 * school's documents into rows, options and metrics before any card is mounted.
 *
 * `SL_DATASETS` are the derived datasets every SL card reads from its context's store;
 * `hasSlResults` and `getSurveyRows` answer over that store.
 *
 * Like `@tba3/modules/domain` this carries no d3, no Tabulator, no DOM and nothing from a
 * card folder (dependency-cruiser's `domain-boundary` guards it), so a data service, a
 * dataset builder or a header-control table can read it without pulling a chart in.
 */

export { hasSlResults, SL_DATASETS } from './slDatasets.js';
export { domainsOfSubject } from './slCompetenceLevelIndex.js';
export {
    listCompetenceGroups,
    listCompetenceSubjects,
    selectCompetenceSlice,
} from './slCompetenceSlices.js';
export { findSelfEfficacy } from './utils/slSurveyLookup.js';
export { VIZ_MODES } from './slVizModes.js';

export {
    DEFAULT_SUMMARY_METRIC_ID,
    SUMMARY_METRICS,
} from './utils/slSchoolSummaryMetricRegistry.js';

export { MATERIAL_TYPE_OPTIONS } from './utils/slSubjectConfig.js';

/** @typedef {import('./utils/slHistory.js').LongitudinalSubjectDomain} LongitudinalSubjectDomain */
