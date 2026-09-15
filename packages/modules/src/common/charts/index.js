/**
 * `@tba3/modules/charts` — the chart host and the pieces every averaging chart shares.
 *
 * A chart type is not a subclass: it is a config descriptor handed to a
 * `ChartHostModule`, and the descriptors live at `@tba3/modules/charts/<name>` (see the
 * package's `exports` map). Mount one host per chart, hand it the descriptor and the
 * options that descriptor documents.
 *
 * **Needs d3** — an optional peer dependency. A host that imports only
 * `@tba3/modules/domain` or `@tba3/modules/tables` never pulls it.
 */

export { ChartHostModule } from './host/chartHostModule.js';
export { applyCompetencyBandPaint } from './chartUtils.js';
export { ensureComparisonModeDropdown } from './host/comparisonModeControl.js';
export { hasSameActiveModes, setActiveModes } from './host/comparisonSync.js';

export {
    bindComparisonState,
    createComparisonState,
    initialActiveModes,
} from './comparisonState.js';

export {
    comparisonLegendEntry,
    comparisonMarkerLegendPaint,
    comparisonSeriesColor,
    comparisonSeriesLabel,
    comparisonSeriesPaint,
    comparisonSeriesVisual,
    markerPaintForIndex,
} from './comparisonSeries.js';
