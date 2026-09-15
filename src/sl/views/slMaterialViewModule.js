/**
 * SlMaterialViewModule — the SL Material view: one MaterialSelectionModule for
 * browsing the teaching materials.
 */

import { BaseViewModule } from '../../common/modules/baseViewModule.js';
import { MaterialSelectionModule } from '@tba3/modules/material-selection';
import { slDataFromStore } from '../slDataPort.js';

export class SlMaterialViewModule extends BaseViewModule {
    /** @type {MaterialSelectionModule|null} */
    #materialSelectionModule = null;

    /**
     * Creates a new SlMaterialViewModule instance
     * @param {string} id - Unique identifier for this module
     * @param {HTMLElement} container - Container element
     * @param {import('../../common/modules/baseViewModule.js').ViewModuleOptions} [options={}] - Configuration options
     */
    constructor(id, container, options = {}) {
        super(id, container, options);
    }

    /**
     * Render the material view module
     * @override
     * @param {object} _data - Data for rendering
     * @returns {Promise<void>}
     */
    async _renderView(_data = {}) {
        this.#createDOM();
        await this.#initializeModules();
        this.#observeHeaderState();
    }

    /**
     * Creates the DOM structure for the material view
     */
    #createDOM() {
        const container = this.container;
        if (!container) {
            return;
        }
        container.className = 'sl-material-view view-base';
        container.innerHTML = `<div id="sl-material-module"></div>`;
    }

    // ─── State observers (the declarative header controls write app state) ──

    /**
     * Follow the header's Fach/Typ selection. The keys are also written by an
     * info-box material link before it navigates here — a view created after
     * that write seeds itself in #initializeMaterialSelectionModule.
     */
    #observeHeaderState() {
        this.observeState('materialSubject', (subject) => {
            this.#materialSelectionModule?.setSelection('subject', subject);
        });

        this.observeState('materialType', (type) => {
            this.#materialSelectionModule?.setSelection('type', type);
        });
    }

    /**
     * Initialize all child modules
     * @returns {Promise<void>}
     */
    async #initializeModules() {
        await this.#initializeMaterialSelectionModule();
    }

    /**
     * Initialize the material selection module
     */
    async #initializeMaterialSelectionModule() {
        const container = this.getContainer('sl-material-module', 'MaterialSelection');
        if (!container) return;

        this.#materialSelectionModule = new MaterialSelectionModule(
            'sl-material-module',
            container,
            {
                ...this._childOptions(),
                slData: slDataFromStore(this.getOption('dataStore')),
                glossaryKey: 'sl.material.material',
                showModuleTitle: true,
            },
        );

        await this._hydrateChildren([[this.#materialSelectionModule]]);

        // Apply a selection made before this view existed (an info-box link).
        const appState = this.options.appState;
        const subject = appState?.getStateValue('materialSubject');
        const type = appState?.getStateValue('materialType');
        if (subject) this.#materialSelectionModule.setSelection('subject', subject);
        if (type) this.#materialSelectionModule.setSelection('type', type);
    }
}
