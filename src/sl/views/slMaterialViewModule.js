/**
 * SlMaterialViewModule — the SL Material view: one MaterialSelectionModule for
 * browsing the teaching materials.
 */

import { render } from 'lit';
import { BaseViewModule } from '../../common/modules/baseViewModule.js';
import { MaterialSelectionModule } from '@tba3/modules/material-selection';

/** @augments {BaseViewModule<import('../slAppModule.js').SlState>} */
export class SlMaterialViewModule extends BaseViewModule {
    /**
     * @override
     * @returns {Promise<void>}
     */
    async _renderView() {
        const appState = this.options.appState;
        const materialSelectionModule = MaterialSelectionModule.create('sl-material-module', {
            ...this._childOptions(),
            glossaryKey: 'sl.material.material',
            showModuleTitle: true,
            subject: appState.materialSubject,
            type: appState.materialType,
        });

        render(materialSelectionModule, this);
    }
}

customElements.define('tba-sl-material-view', SlMaterialViewModule);
