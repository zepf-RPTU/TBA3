/**
 * The dataset-selector header control — the one declared unit every app mounts
 * to switch datasets (EN/MA "Klasse", MA/EN id `class-selector`; SL "Schule",
 * id `school-selector`). Shared so the selector-items injection and the no-op
 * navigation guard have a single home; the per-app catalogs
 * (src/{en,ma,sl}/*HeaderControls.js) supply only id and label.
 */

import { datasetSelectorItems } from '../../app/classSearchParams.js';

/**
 * @param {{
 *   datasetOptions: Array<{id: string, label: string}>,
 *   currentDataset: {id: string, label: string},
 *   navigate: (datasetId: string) => void
 * }} ctx - The app's header-control context (extra members are ignored)
 * @param {{id: string, label: string}} spec - Control id and visible label
 * @returns {object} A header-control definition: a select whose items and current value are injected from `ctx` on every render.
 */
export function datasetSelectorControl(ctx, { id, label }) {
    return {
        type: 'select',
        id,
        options: {
            label,
            containerClass: 'header-module-select',
        },
        injectState(control) {
            control.options.items = datasetSelectorItems(ctx.datasetOptions, ctx.currentDataset);
            control.options.defaultValue = ctx.currentDataset.id;
        },
        onChange(data) {
            const datasetId = data?.selectedValue;
            if (!datasetId || datasetId === ctx.currentDataset.id) return;

            ctx.navigate(datasetId);
        },
    };
}
