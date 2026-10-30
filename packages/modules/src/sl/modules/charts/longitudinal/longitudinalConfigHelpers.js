/**
 * Shared building blocks for the longitudinal ChartHostModule configs: the pieces
 * identical across them, and the descriptor every line chart is built from.
 */

import { computed } from '@preact/signals-core';
import { LongitudinalLineChart } from './longitudinalLineChart.js';
import { STUDENT_SHARE_AXIS_TITLE } from '../../../../common/domain/terms.js';
import { SL_DATASETS } from '../../../slDatasets.js';

/** @typedef {import('../../../../common/charts/renderers/chartRenderer.js').ChartRenderer} ChartRenderer */
/** @typedef {import('./longitudinalLineChart.js').LineSeries} LineSeries */

/**
 * The datasets every line-chart card declares.
 * @type {import('../../../../common/data/documentStore.js').DocumentList}
 */
const LONGITUDINAL_DOCUMENTS = [
    SL_DATASETS.LONGITUDINAL_SUBJECT_DOMAINS,
    SL_DATASETS.LONGITUDINAL_TIMELINES,
    SL_DATASETS.LONGITUDINAL_MAX_SHARE,
];

/**
 * A longitudinal card's options: the chart-host options plus the selections — signals,
 * which the host keeps as its state (so a card binds no verb), or
 * fixed values.
 * @typedef {import('../../../../common/charts/host/chartHostModule.js').ChartHostOptions & {
 *     domainIndex: number | import('@preact/signals-core').Signal<number>,
 *     isStacked: boolean | import('@preact/signals-core').Signal<boolean>,
 * }} LongitudinalOptions
 */

/**
 * A longitudinal card's state: the selected Bereich and whether the series stack.
 * @typedef {{domainIndex: number, isStacked: boolean}} LongitudinalState
 */

/**
 * A longitudinal card's host.
 * @template {ChartRenderer} TChart
 * @typedef {import('../../../../common/charts/host/chartHostModule.js').ChartHostModule<TChart, LongitudinalOptions, null, LongitudinalState>} LongitudinalHost
 */

/**
 * A longitudinal card's descriptor.
 * @template {ChartRenderer} TChart
 * @typedef {import('../../../../common/charts/host/chartHostModule.js').ChartHostConfig<TChart, LongitudinalOptions, null, import('../../../../common/charts/host/chartHostModule.js').NoVerbs, LongitudinalState>} LongitudinalConfig
 */

/**
 * The Bereich the host's "Bereich" selector points at.
 * @template {ChartRenderer} TChart
 * @param {LongitudinalHost<TChart>} host - The host, read for its store and its `domainIndex`.
 * @returns {import('../../../utils/slHistory.js').LongitudinalSubjectDomain|undefined} Undefined for an index past the list.
 */
export function selectedSubjectDomain(host) {
    return host.options.context.documents.getDataset(SL_DATASETS.LONGITUDINAL_SUBJECT_DOMAINS)[
        host.state.domainIndex.value
    ];
}

/**
 * The line-chart timelines of every Bereich.
 * @template {ChartRenderer} TChart
 * @param {LongitudinalHost<TChart>} host
 * @returns {import('../../../utils/slLongitudinalTimelines.js').LongitudinalTimelines}
 */
export function readTimelines(host) {
    return host.options.context.documents.getDataset(SL_DATASETS.LONGITUDINAL_TIMELINES);
}

/**
 * One of the selected Bereich's timelines.
 * @template {ChartRenderer} TChart
 * @param {LongitudinalHost<TChart>} host - The host, read for its store and its `domainIndex`.
 * @param {'teachingQuality'|'competenceLevelShares'} key
 * @returns {import('./longitudinalLineChart.js').LineSeries['timeline']} Empty for an index past the list.
 */
export function selectedDomainTimeline(host, key) {
    return readTimelines(host).bySubjectDomain[host.state.domainIndex.value]?.[key] ?? [];
}

/**
 * The descriptor of one longitudinal line-chart card; the three differ only in their
 * glossary entry, their series and whether they follow the "Bereich" selector.
 * @param {object} card - What sets the card apart.
 * @param {string} card.glossaryPath
 * @param {(host: LongitudinalHost<LongitudinalLineChart>) => Omit<LineSeries, 'years'>} card.seriesOf - What it draws, for the host's current state; read inside a `computed`, so a signal it reads redraws the chart. Every card spans the history's years.
 * @param {boolean} [card.followsBereich] - Whether it shows the selected Bereich, which then tells two exports apart.
 * @returns {LongitudinalConfig<LongitudinalLineChart>}
 */
export function lineChartConfig({ glossaryPath, seriesOf, followsBereich = false }) {
    return {
        glossaryPath,
        documents: LONGITUDINAL_DOCUMENTS,
        defaultOptions: LONGITUDINAL_DEFAULT_OPTIONS,
        initialState: longitudinalInitialState,
        ...(followsBereich ? { getExportIdentity: longitudinalDomainExportIdentity } : {}),
        createRenderer: (host) =>
            new LongitudinalLineChart(host.chartArea, {
                ...host.rendererOptions,
                series: computed(() => ({ ...seriesOf(host), years: readTimelines(host).years })),
                yAxisLabel: STUDENT_SHARE_AXIS_TITLE,
                isStacked: host.state.isStacked,
                yMax: host.options.context.documents.getDataset(SL_DATASETS.LONGITUDINAL_MAX_SHARE),
            }),
    };
}

/**
 * Export identity for the longitudinal charts that follow the "Bereich"
 * selector: one host serves every domain in turn, so the selected domain is
 * what tells two captures apart.
 * @template {ChartRenderer} TChart
 * @param {LongitudinalHost<TChart>} host
 * @returns {string} The selected domain, as an export-safe token.
 */
export function longitudinalDomainExportIdentity(host) {
    return `domain${host.state.domainIndex.value}`;
}

/**
 * The state a longitudinal host starts in: its selection options.
 * @template {ChartRenderer} TChart
 * @param {LongitudinalHost<TChart>} host
 * @returns {import('@tba3/module-base').StateInit<LongitudinalState>}
 */
export function longitudinalInitialState(host) {
    return {
        domainIndex: host.options.domainIndex,
        isStacked: host.options.isStacked,
    };
}

/**
 * The defaultOptions skeleton common to the longitudinal configs. Title and subtitle
 * come from each config's glossary entry. The host copies the values, so one object
 * serves every config.
 */
export const LONGITUDINAL_DEFAULT_OPTIONS = Object.freeze({
    showModuleTitle: true,
    showSubtitle: true,
});
