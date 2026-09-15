/**
 * TeachingQualityConfig — ChartHostModule descriptor for the longitudinal
 * Unterrichtsqualität chart.
 *
 * In `parallel` mode it draws bucket distributions across years; in `boxplot` mode a
 * combined figure merging Unterrichtsqualität *and* Selbstwirksamkeit.
 */

import { LongitudinalBoxPlotChart } from './longitudinalBoxPlotChart.js';
import { MISSING_GLOSSARY_TITLE } from '@tba3/module-base/glossary/glossaryText.js';
import {
    buildRatingBucketLabels,
    convertTeachingQualityToTimeline,
    getBucketColors,
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
 *     setChartType(chartType: string): void,
 * }} TeachingQualityHost
 */

/** @type {import('../../../../common/charts/host/chartHostModule.js').ChartHostConfig} */
export const teachingQualityConfig = {
    glossaryPath: 'sl.longitudinal.parallel.teaching-quality',
    defaultOptions: baseLongitudinalOptions(),

    getExportIdentity: longitudinalDomainExportIdentity,

    createRenderer(host, data) {
        if (!document.getElementById(host.id)) return null;

        const chartType = host.configState.chartType || 'parallel';
        const domainIndex = host.configState.domainIndex ?? 0;

        if (chartType === 'boxplot') {
            // Combined boxplot with both teaching quality and self-efficacy.
            // Pass the selected domain so the TQ boxplot tracks the "Bereich"
            // selector, matching the parallel-coordinates mode.
            return new LongitudinalBoxPlotChart(host.id, data.domainArray, data.history, {
                domainIndex,
            });
        }

        // Parallel-coordinates mode
        const domainGroup = data.domainArray?.[domainIndex];
        const timeline = domainGroup
            ? convertTeachingQualityToTimeline(domainGroup, data.history)
            : [];

        return makeParallelChart(host, timeline, {
            categoryColors: getBucketColors(),
            categoryLabels: buildRatingBucketLabels(),
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
            // Falls back to a full rerender for boxplot mode or on first load.
            const domainGroup = currentData.domainArray?.[index];
            const timeline = domainGroup
                ? convertTeachingQualityToTimeline(domainGroup, currentData.history)
                : [];

            if (timeline.length > 0 && host.chart?.updateData?.(timeline)) return;
            host.rerender(currentData);
        },

        setStacked,

        setChartType(host, chartType) {
            host.configState.chartType = chartType;

            const glossaryKey =
                chartType === 'boxplot'
                    ? 'sl.longitudinal.boxplot.combined'
                    : 'sl.longitudinal.parallel.teaching-quality';
            host.glossaryKey = glossaryKey;
            host.loadInfoFromGlossary(glossaryKey, host.glossaryData);

            // The header was built from the previous entry; re-render it from
            // the one just loaded (glossary copy, never literals).
            host.setTitle(host.glossaryTitle ?? MISSING_GLOSSARY_TITLE);
            host.setSubtitle(host.glossarySubtitle ?? '');

            const currentData = host.getData();
            if (currentData) host.rerender(currentData);
        },
    },
};
