/**
 * `@tba3/modules/charts/scatterplot` — the Streudiagramm descriptor and the filter card
 * that drives its selection.
 *
 * Mount `ScatterplotFilterModule` beside the chart host and wire its callbacks to the
 * host's `publicAPI`; the descriptor works on its own without it.
 */

export { scatterplotConfig } from './scatterplotConfig.js';
export { ScatterplotFilterModule } from './scatterplotFilterModule.js';
