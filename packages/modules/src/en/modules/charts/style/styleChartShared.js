/**
 * What every EN Teilkompetenzen card draws alike: the ⌀ menu, the style lollipop,
 * the empty state and the lollipop's minimum card height. The lollipop puts its key over
 * the plot; the spider web puts it beside the web only while the web keeps its room
 * (`legend: 'auto'`), since a right-hand key would cost it a third of its radius on a
 * narrow card.
 */

import { StyleLollipopChart } from './styleLollipopChart.js';
import { renderChartMessage } from '../../../../common/charts/chartMessage.js';
import { comparisonModeEntries } from '../../../../common/charts/comparisonSeries.js';
import { EN_DATASETS } from '../../../enDatasets.js';

/** @typedef {import('../../../utils/enStyleAggregationAdapter.js').ParsedStyleAggregation} ParsedStyleAggregation */

/** @typedef {import('./styleGroupChartConfig.js').StyleGroupHost|import('./styleStudentChartConfig.js').StyleStudentHost} StyleHost */

/**
 * @template T
 * @param {StyleHost} host
 * @param {import('../../../../common/data/documentStore.js').DatasetKey<T>} key
 * @returns {T}
 */
export function styleDataset(host, key) {
    return host.options.context.documents.getDataset(key);
}

/**
 * The groups a style card's ⌀ menu offers. Known before any chart exists: the
 * comparison groups are whole populations that pass through the selection unchanged,
 * so the group averages already name exactly what either renderer paints.
 * @param {StyleHost} host
 * @returns {Array<{id: string, label: string}>}
 */
export function styleComparisonModes(host) {
    return comparisonModeEntries(styleDataset(host, EN_DATASETS.STYLE_AVERAGES).comparisonGroups);
}

/**
 * The style averages a lollipop draws: the table's filtered values where it supplied
 * them, over the group-level parse. Merged rather than swapped because
 * calculateStyleAveragesForStudents returns the group values only — the comparison
 * groups and the group name the chart labels its own series with live on the parse.
 * @param {StyleHost} host
 * @param {{groupAverages: {[categoryKey: string]: number|null}}} [styleAverages] - Group averages over the current table selection; without them, the group-level parse stands.
 * @returns {ParsedStyleAggregation} One object for the chart, so no renderer resolves this precedence itself.
 */
export function resolveStyleAverages(host, styleAverages) {
    const groupStyleAverages = styleDataset(host, EN_DATASETS.STYLE_AVERAGES);
    return styleAverages ? { ...groupStyleAverages, ...styleAverages } : groupStyleAverages;
}

/**
 * Construct the lollipop renderer into the host's chart area. It shares the host's `mode`
 * signal, so a Domäne switch redraws it. Whenever its minimum height changes, it hands it
 * to the host's container (`writeLollipopMinHeight`).
 * @param {StyleHost} host
 * @param {object} data - What the lollipop draws: values, or the host's signals of them, shared.
 * @param {ParsedStyleAggregation | import('@preact/signals-core').Signal<ParsedStyleAggregation>} data.styleAverages - The resolved averages (`resolveStyleAverages`).
 * @param {{[key: string]: number|null} | null | import('@preact/signals-core').Signal<{[key: string]: number|null} | null>} data.studentValues - The selected student's values, or `null` when no student is selected.
 * @returns {StyleLollipopChart}
 */
export function buildStyleLollipop(host, { styleAverages, studentValues }) {
    applyLollipopMinHeight(host, true);
    return new StyleLollipopChart(host.chartArea, {
        ...host.rendererOptions,
        mode: host.state.mode,
        styleAverages,
        studentValues,
        enConfig: styleDataset(host, EN_DATASETS.CONFIG),
        onMinHeight: (minHeightPx) => writeLollipopMinHeight(host, minHeightPx),
    });
}

/**
 * No student matches the current filter: show the placeholder in place of a chart. The
 * host frees the retired renderer's frame once it is gone; the message stays.
 * @param {StyleHost} host
 */
export function showStyleEmptyState(host) {
    renderChartMessage(host.chartArea, {
        text: host.options.context.glossary.getRequiredEntryText('general.messages.no-data'),
    });
}

const LOLLIPOP_MIN_HEIGHT = '--style-lollipop-min-height';

/**
 * Give the host's card (the `.chart-section` grid item) the lollipop's minimum
 * height plus the header chrome, so the CSS grid row it lives in won't shrink the chart
 * below the point where its rows can no longer fit their own minimum size.
 * @param {StyleHost} host
 * @param {number} minHeightPx - The lollipop's minimum container height.
 */
function writeLollipopMinHeight(host, minHeightPx) {
    // The card's chrome above the body: its header and subtitle.
    const chrome =
        host.contentContainer.getBoundingClientRect().top - host.getBoundingClientRect().top;
    host.style.setProperty(LOLLIPOP_MIN_HEIGHT, `${Math.ceil(minHeightPx + chrome)}px`);
}

/**
 * Whether the lollipop's minimum height holds for the host's card: it does while the
 * lollipop shows, not while the card shows something else (the spider). The lollipop
 * reports the height only when it changes, so the card keeps the last one for the time
 * it does not apply, and it holds again at once when the lollipop is back.
 * @param {StyleHost} host
 * @param {boolean} applies - Whether the lollipop shows.
 */
export function applyLollipopMinHeight(host, applies) {
    host.style.minHeight = applies ? `var(${LOLLIPOP_MIN_HEIGHT})` : '';
}
