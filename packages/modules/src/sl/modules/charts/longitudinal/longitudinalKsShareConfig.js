/**
 * KsDistributionConfig — ChartHostModule descriptor for the longitudinal
 * Kompetenzstufen distribution.
 *
 * Always a ParallelCoordinatesChart; the boxplot toggle does not affect it.
 */

import {
    convertDomainToTimeline,
    buildKsCategoryColors,
    buildKsCategoryOrder,
} from './longitudinalDataService.js';
import {
    baseLongitudinalOptions,
    setStacked,
    makeParallelChart,
    longitudinalDomainExportIdentity,
} from './longitudinalConfigHelpers.js';

// ============================================================================
// CONFIG DESCRIPTOR
// ============================================================================

/**
 * The host as this config leaves it — the `publicAPI` verbs bound onto the instance.
 * @typedef {import('../../../../common/charts/host/chartHostModule.js').ChartHostModule & {
 *     setDomainIndex(index: number): void,
 *     setStacked(isStacked: boolean): void,
 * }} LongitudinalKsShareHost
 */

/** @type {import('../../../../common/charts/host/chartHostModule.js').ChartHostConfig} */
export const slKsDistributionConfig = {
    glossaryPath: 'sl.longitudinal.parallel.ks-distribution',
    defaultOptions: baseLongitudinalOptions(),

    getExportIdentity: longitudinalDomainExportIdentity,

    createRenderer(host, data) {
        if (!document.getElementById(host.id)) return null;

        const domainIndex = host.configState.domainIndex ?? 0;
        const domainGroup = data.domainArray?.[domainIndex];
        const timeline = domainGroup ? convertDomainToTimeline(domainGroup, data.history) : [];

        // No `categoryLabels`: the categories *are* the scale's own level names, so there
        // is nothing to translate and the renderer's default labelling is correct.
        const scaleId = domainGroup?.[0]?.stats?.scaleId;
        return makeParallelChart(host, timeline, {
            categoryColors: timeline.length > 0 ? buildKsCategoryColors(timeline, scaleId) : {},
            categoryOrder: domainGroup ? buildKsCategoryOrder(domainGroup) : [],
        });
    },

    publicAPI: {
        setDomainIndex(host, index) {
            host.configState.domainIndex = index;
            // The id changed with the domain, and the in-place update path
            // below returns without re-rendering — nothing else would resync.
            host.syncExportControls();
            const currentData = host.getData();
            if (!currentData) return;

            // Compute the new timeline for the selected domain and update the chart
            // in-place so D3 transitions the lines to their new positions.
            // Falls back to a full rerender when the chart is not yet rendered.
            const domainGroup = currentData.domainArray?.[index];
            const timeline = domainGroup
                ? convertDomainToTimeline(domainGroup, currentData.history)
                : [];
            const scaleId = domainGroup?.[0]?.stats?.scaleId;
            const newColors = timeline.length > 0 ? buildKsCategoryColors(timeline, scaleId) : null;

            // No labels argument, so `updateData` leaves the (empty) label map alone — the
            // categories are the scale's level names either way. A domain switch that
            // changes the scale also changes the category set, which `updateData` reports
            // as a miss, so the rerender below picks up the new categoryOrder.
            if (timeline.length > 0 && host.chart?.updateData?.(timeline, newColors)) return;
            host.rerender(currentData);
        },

        setStacked,
    },
};
