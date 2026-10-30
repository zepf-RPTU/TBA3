/**
 * `@tba3/modules/ma-domain` — the Mathe vocabulary a host needs before any card exists.
 *
 * `MA_DATASETS` are the derived datasets every MA card reads from its context's store,
 * the Aufgabenpools (`ITEM_POOLS`) among them. `resolveGrouping` picks one
 * grouping, with its rings, from `ITEM_RINGS`; `LEITIDEE_GROUPING` is the grouping a
 * booklet starts in.
 * All pure data: no d3, no DOM.
 */

export { MA_DATASETS } from './maDatasets.js';
export { LEITIDEE_GROUPING, resolveGrouping } from './utils/maItemRings.js';
