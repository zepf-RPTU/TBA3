/**
 * `@tba3/modules/charts/longitudinal` — the three Längsschnitt-Descriptoren, the parallel
 * coordinates renderer and the converters that turn a `history.json` into their timelines.
 *
 * Which of the three a dataset can fill is `detectHistorySurveyScales` in
 * `@tba3/modules/sl-domain`. Each descriptor is also reachable on its own at
 * `@tba3/modules/charts/longitudinal-*`.
 */

export { slKsDistributionConfig } from './longitudinalKsShareConfig.js';
export { selfEfficacyLongConfig } from './selfEfficacyLongConfig.js';
export { teachingQualityConfig } from './teachingQualityConfig.js';
export { ParallelCoordinatesChart } from './parallelCoordinatesChart.js';

export {
    convertDomainToTimeline,
    convertSelfEfficacyToTimeline,
    convertTeachingQualityToTimeline,
} from './longitudinalDataService.js';
