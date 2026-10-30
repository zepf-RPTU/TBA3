/**
 * MA header controls — the per-view control declarations the app hands to the
 * HeaderOrchestrator.
 */

import { datasetSelectorControl } from '../common/modules/header/datasetSelectorControl.js';
import { stateChoiceControl } from '../common/modules/header/stateChoiceControl.js';
import { LAYOUT_MODES } from './maConstants.js';

/** @typedef {import('../common/modules/header/headerOrchestrator.js').HeaderControlDeclaration} HeaderControlDeclaration */

/** @typedef {import('../common/app/appModule.js').HeaderControlContext<import('./maAppModule.js').MaState>} HeaderControlContext */

/**
 * Build the layout switch, which decides how much of the view the item rings get.
 * @param {HeaderControlContext} ctx
 * @returns {HeaderControlDeclaration}
 */
function layoutMode(ctx) {
    return stateChoiceControl(ctx, {
        type: 'modeSwitch',
        id: 'layout-mode',
        options: { glossarySubKey: 'layout-group' },
        items: [
            { value: LAYOUT_MODES.BOTH, glossarySubKey: 'layout-both' },
            { value: LAYOUT_MODES.TABLE_ONLY, glossarySubKey: 'layout-table' },
            { value: LAYOUT_MODES.CHART_ONLY, glossarySubKey: 'layout-charts' },
        ],
        stateKey: 'layoutMode',
    });
}

/**
 * The header controls of each MA view that has any.
 * @param {HeaderControlContext} ctx
 * @returns {{[viewKey: string]: HeaderControlDeclaration[]}}
 */
export function buildMaViewHeaderControls(ctx) {
    return {
        welcome: [datasetSelectorControl(ctx)],
        item: [layoutMode(ctx)],
        student: [layoutMode(ctx)],
    };
}
