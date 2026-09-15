/**
 * `@tba3/modules/en-domain` — the Englisch vocabulary a host needs before any card exists.
 *
 * `AGG_TYPE_STYLE` names the aggregation the Hör-/Lesestil results arrive under, and
 * `parseStyleAggregation` turns that document into the rows the Stil chart draws. Both are
 * pure data: no d3, no DOM, so a dataset builder can read them without pulling a chart in.
 */

export { AGG_TYPE_STYLE } from './enTerms.js';
export { parseStyleAggregation } from './utils/enStyleAggregationAdapter.js';
