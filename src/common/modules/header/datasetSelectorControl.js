/**
 * The dataset-selector header control, which switches datasets, labelled by the
 * glossary `interface` entry `dataset-select`. One declaration, so the selector-items
 * injection and the no-op navigation guard have a single home. A menu, not a select: a switch reloads the page, and a select reports every
 * arrow key on the closed field as a choice.
 */

import { datasetSelectorItems } from '../../app/scopeSearchParams.js';

/**
 * @param {{
 *   datasetOptions: Array<{id: string, label: string}>,
 *   currentDataset: {id: string, label: string},
 *   navigate: (datasetId: string) => void
 * }} ctx - The app's header-control context (extra members are ignored)
 * @returns {import('./headerOrchestrator.js').HeaderControlDeclaration} A menu whose items and current value are injected from `ctx` on every render.
 */
export function datasetSelectorControl(ctx) {
    return {
        type: 'menu',
        id: 'dataset-selector',
        options: {
            glossarySubKey: 'dataset-select',
            containerClass: 'header-module-select',
        },
        injectState(control) {
            control.options.items = datasetSelectorItems(ctx.datasetOptions, ctx.currentDataset);
            control.options.value = ctx.currentDataset.id;
        },
        /** @param {import('./headerModule.js').HeaderControlChange} data - The chosen dataset. */
        onChange(data) {
            if (data.value === ctx.currentDataset.id) return;
            ctx.navigate(data.value);
        },
    };
}
