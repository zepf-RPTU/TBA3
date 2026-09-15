/**
 * SelfEfficacyLongConfig — ChartHostModule descriptor for the longitudinal
 * Selbstwirksamkeit parallel-coordinates chart.
 *
 * Hidden when the view switches to boxplot mode: the combined boxplot lives in the
 * Unterrichtsqualität module.
 */

import {
    buildRatingBucketLabels,
    convertSelfEfficacyToTimeline,
    getBucketColors,
} from './longitudinalDataService.js';
import {
    baseLongitudinalOptions,
    setStacked,
    makeParallelChart,
} from './longitudinalConfigHelpers.js';

// ============================================================================
// CONFIG DESCRIPTOR
// ============================================================================

/**
 * The host as this config leaves it — the `publicAPI` verb bound onto the instance.
 * @typedef {import('../../../../common/charts/host/chartHostModule.js').ChartHostModule & {
 *     setStacked(isStacked: boolean): void,
 * }} SelfEfficacyLongHost
 */

/** @type {import('../../../../common/charts/host/chartHostModule.js').ChartHostConfig} */
export const selfEfficacyLongConfig = {
    glossaryPath: 'sl.longitudinal.parallel.self-efficacy',
    defaultOptions: baseLongitudinalOptions(),

    createRenderer(host, data) {
        if (!document.getElementById(host.id)) return null;

        const timeline = convertSelfEfficacyToTimeline(data.history);

        return makeParallelChart(host, timeline, {
            categoryColors: getBucketColors(),
            categoryLabels: buildRatingBucketLabels(),
        });
    },

    publicAPI: {
        setStacked,
    },
};
