/**
 * EN header controls — the per-view control declarations the app hands to the
 * HeaderOrchestrator.
 */

import { datasetSelectorControl } from '../common/modules/header/datasetSelectorControl.js';
import { stateChoiceControl } from '../common/modules/header/stateChoiceControl.js';
import { EN_DATASETS } from '@tba3/modules/en-domain';

/** @typedef {import('../common/modules/header/headerOrchestrator.js').HeaderControlDeclaration} HeaderControlDeclaration */

/** @typedef {import('../common/app/appModule.js').HeaderControlContext<import('./enAppModule.js').EnState>} HeaderControlContext */

/**
 * Build the Domäne switch: `Alle` plus one entry per domain of the dataset.
 * @param {HeaderControlContext} ctx
 * @param {() => import('../common/modules/header/headerModule.js').HeaderControlItem[]} domainItems - Resolved when the switch renders.
 * @returns {HeaderControlDeclaration}
 */
function domainSwitch(ctx, domainItems) {
    return stateChoiceControl(ctx, {
        type: 'modeSwitch',
        id: 'domain-switch',
        options: { glossarySubKey: 'domain-group' },
        resolveItems: domainItems,
        stateKey: 'currentMode',
    });
}

/**
 * Build the EN views' header controls. The Domäne labels come from the data-derived EN
 * config (`EN_DATASETS.CONFIG`), so the switch reads them when it renders — only on the
 * views that wait for the documents.
 * @param {HeaderControlContext} ctx
 * @returns {{[viewKey: string]: HeaderControlDeclaration[]}} The controls of each view that has any.
 */
export function buildEnViewHeaderControls(ctx) {
    const domainItems = () => {
        const { domainIds, domainLabels } = ctx.documents.getDataset(EN_DATASETS.CONFIG);
        return [
            { value: 'all', glossarySubKey: 'domain-all' },
            ...domainIds.map((value, i) => ({ value, label: domainLabels[i] })),
        ];
    };

    return {
        welcome: [datasetSelectorControl(ctx)],
        group: [domainSwitch(ctx, domainItems)],
        item: [domainSwitch(ctx, domainItems)],
        student: [domainSwitch(ctx, domainItems)],
    };
}
