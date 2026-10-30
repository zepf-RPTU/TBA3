/**
 * `@tba3/modules/charts` — the chart host and the pieces every averaging chart shares.
 *
 * A chart type is a config descriptor handed to a `ChartHostModule`, not a subclass; the
 * descriptors are the package's `@tba3/modules/charts/<name>` exports. Needs d3, an
 * optional peer dependency.
 */

export { ChartHostModule } from './host/chartHostModule.js';
export { renderChartMessage } from './chartMessage.js';
export { domainListRuns, subjectDomainLabelRuns } from './domainLabelFormatter.js';

export { createComparisonState } from './comparisonState.js';

/** @typedef {import('./comparisonState.js').ComparisonState} ComparisonState */
/** @typedef {import('./comparisonState.js').ComparisonStateReader} ComparisonStateReader */
/** @typedef {import('./renderers/chartRenderer.js').ChartRenderer} ChartRenderer */
/** @typedef {import('./host/chartHostModule.js').ChartHostOptions} ChartHostOptions */
/**
 * @template {ChartRenderer} [TChart=ChartRenderer]
 * @template {ChartHostOptions} [TOptions=ChartHostOptions]
 * @template [TController=null]
 * @template {object} [TApi=import('./host/chartHostModule.js').NoVerbs]
 * @template {object} [TState={}]
 * @typedef {import('./host/chartHostModule.js').ChartHostConfig<TChart, TOptions, TController, TApi, TState>} ChartHostConfig
 */
