/**
 * `@tba3/modules/domain` — the VERA vocabulary and the rules that go with it.
 *
 * The one subpath with no dependencies at all: no d3, no Tabulator, no DOM. A host that
 * only needs to read, sort and label competence levels can stop here.
 *
 * `createGerLevelHtml` is the exception to "no DOM": it returns a markup *string* and
 * reads the palette for the band colour, so it needs the scales registered
 * (`@tba3/modules/theme`) but never touches a document.
 */

export { TERM_CONSTANTS } from './terms.js';

export {
    compareItemLevelToReportedLevel,
    compareLevelLabels,
    createGerLevelHtml,
    getItemLevelColor,
    getItemLevelOrdinal,
    parseItemLevel,
} from './levels.js';

export {
    getKsThresholds,
    getScaleLevels,
    parseEquivalenceTables,
    resolveEquivalenceTable,
} from './competenceScale.js';

export {
    deriveRankBounds,
    MAX_STANDARD_RANK,
    MIN_STANDARD_RANK,
    parseStandardRank,
    satisfiesEveryPossibleRank,
} from './competenceStandardRanks.js';

export { buildItemMeansMap, toPercent } from './itemMeans.js';
export { buildItemResultCounts, NO_RESULT_COUNTS, resultShare } from './itemResultCounts.js';
export { sortItemsWithinExercises } from './bookletOrder.js';
export { computePilotierung, selectPilotierungswert } from './pilotierung.js';
export { GENDER_MAP, RESULT_CORRECT, RESULT_VALUES } from './apiValueMaps.js';

export {
    extractTraits,
    getTraitFallbackLabel,
    getTraitLabel,
    resetTraitRegistry,
} from './traitRegistry.js';

export {
    assignComparisonOrdinals,
    buildLegendLabelSegments,
    disambiguatingShortLabel,
    isComparisonValueGroup,
    ordinalShortLabel,
    OTHER_AVERAGE_ROLE,
    resolveAverageRole,
    SHORT_LABEL_PREFIX_BY_TYPE,
} from './comparisonGroupLabels.js';
