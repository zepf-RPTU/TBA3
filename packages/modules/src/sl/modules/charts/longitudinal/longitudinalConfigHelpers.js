/**
 * Shared building blocks for the three longitudinal ChartHostModule configs
 * (KS distribution, self-efficacy, teaching quality). Each config still owns its
 * own descriptor — they diverge meaningfully (boxplot mode, domain switching) —
 * but these helpers hold the pieces that were byte-identical across all three.
 */

import { ParallelCoordinatesChart } from './parallelCoordinatesChart.js';
import { TERM_CONSTANTS } from '../../../../common/domain/terms.js';

/**
 * Construct a ParallelCoordinatesChart with the options shared by all three
 * longitudinal parallel charts. Only the category metadata varies per chart.
 * @param {object} host - ChartHostModule instance
 * @param {Array} timeline - Timeline data
 * @param {object} [meta] - The category metadata that distinguishes one longitudinal chart from another.
 * @param {object} [meta.categoryColors] - Colour per series.
 * @param {object} [meta.categoryLabels] - Display label per series.
 * @param {Array<string>} [meta.categoryOrder] - Draw and stack order; without it the data's own order is used.
 * @returns {ParallelCoordinatesChart} The renderer.
 */
export function makeParallelChart(
    host,
    timeline,
    { categoryColors = {}, categoryLabels = {}, categoryOrder } = {},
) {
    const options = {
        yAxisLabel: `Anteil ${TERM_CONSTANTS.STUDENTS} (%)`,
        initialStacked: host.configState.isStacked ?? false,
        categoryPrefix: '',
        categoryColors,
        categoryLabels: categoryLabels || {},
        yMax: host.getOption('yMax') ?? null,
    };
    if (categoryOrder) options.categoryOrder = categoryOrder;
    return new ParallelCoordinatesChart(host.id, timeline, options);
}

/**
 * Shared `setStacked` verb: persist the toggle and push it to the live chart via
 * reactive state. The owning view calls it from its app-state observer.
 * @param {object} host - ChartHostModule instance
 * @param {boolean} isStacked - The new stacking state.
 */
export function setStacked(host, isStacked) {
    host.configState.isStacked = isStacked;
    if (host.chart?.setState) {
        host.chart.setState({ isStacked });
    }
}

/**
 * Export identity for the longitudinal charts that follow the "Bereich"
 * selector: one host serves every domain in turn, so the selected domain is
 * what tells two captures apart. The chart type (parallel vs boxplot) is left
 * out on purpose — that is the same domain drawn differently, one card.
 * @param {import('../../../../common/charts/host/chartHostModule.js').ChartHostModule} host - The host owning the chart.
 * @returns {string} The selected domain, as an export-safe token.
 */
export function longitudinalDomainExportIdentity(host) {
    return `domain${host.configState.domainIndex ?? 0}`;
}

/**
 * The defaultOptions skeleton shared by the longitudinal configs. Title and
 * subtitle come from each config's glossary entry.
 * @returns {object} The shared defaultOptions.
 */
export function baseLongitudinalOptions() {
    return {
        showModuleTitle: true,
        enableModuleExport: true,
        showSubtitle: true,
    };
}
