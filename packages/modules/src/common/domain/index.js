/**
 * `@tba3/modules/domain` — the VERA vocabulary and the rules that go with it.
 *
 * Nothing reachable from it imports d3, Tabulator, a stylesheet, the glossary
 * annotator or a card folder (dependency-cruiser's `domain-boundary`).
 */

export { TERM_CONSTANTS } from './terms.js';

export { getCompetenceLevelThresholds, resolveGroupEquivalenceTable } from './competenceScale.js';

export { buildItemResultCounts, itemResultFields, toPercent } from './itemResultCounts.js';
export { readCorrectShare, readItemResults, readResultCounts } from './resultAggregations.js';
export {
    formatStudentName,
    readStudentIdentity,
    readStudentName,
    toStudentSelectItems,
} from './studentIdentity.js';
export { sortItemsWithinExercises } from './bookletOrder.js';
export { RESULT_CODE } from './apiValueMaps.js';
