/**
 * MaterialSelectionModule - shows the material page for the selected Fach × Seitentyp.
 * Both arrive as signals, which the module follows.
 */

import { untracked } from '@preact/signals-core';
import { ContentModule, createState, trusted } from '@tba3/module-base';
import { html, render } from 'lit';
import { MATERIAL_PAGES } from './materialContentResolver.js';
import { MATERIAL_SUBJECT_CONTEXT } from './materialSubjectContext.js';
import { SL_DATASETS } from '../../slDatasets.js';
import './materialSelectionModule.css';

/**
 * @typedef {import('@tba3/module-base').ContentOptions & {
 *     context: import('../../../common/context/moduleContext.js').ModuleContext,
 *     subject: string | import('@preact/signals-core').Signal<string>,
 *     type: string | import('@preact/signals-core').Signal<string>,
 * }} MaterialSelectionOptions
 */

/** @augments {ContentModule<MaterialSelectionOptions>} */
export class MaterialSelectionModule extends ContentModule {
    /**
     * @override
     * @type {import('../../../common/data/documentStore.js').DocumentList}
     */
    static documents = [SL_DATASETS.AVAILABLE_MATERIAL_SUBJECTS, MATERIAL_SUBJECT_CONTEXT];

    /** @type {import('@tba3/module-base').State<{subject: string, type: string}> | null} */
    #state = null;

    /**
     * @returns {import('@tba3/module-base').State<{subject: string, type: string}>}
     */
    get state() {
        return (this.#state ??= createState({
            subject: this.options.subject,
            type: this.options.type,
        }));
    }

    /** @override */
    _setup() {
        super._setup();
        // Before the first content pass, that pass shows the page.
        this.effect(() => {
            void this.state.subject.value;
            void this.state.type.value;
            untracked(() => {
                if (this.initialized) this.#updateContent();
            });
        });
    }

    /**
     * @override
     * @returns {'visual'}
     */
    _getExportType() {
        return 'visual';
    }

    /**
     * Subject and type change in place, so one instance
     * shows every subject × type combination in turn.
     * @override
     */
    getExportIdentity() {
        return [this.state.subject.value, this.state.type.value];
    }

    /**
     * @override
     * @returns {Promise<void>}
     */
    async _renderBody() {
        this.contentContainer.classList.add('material-selection-module', 'styled-scrollbar');
        this.#updateContent();
    }

    /**
     * Show the page of the current Fach × Seitentyp; a Fach the dataset does not offer
     * (`Gesamt`, or none in a dataset without one) and a Seitentyp without a page have none.
     */
    #updateContent() {
        const subject = this.state.subject.value;
        const renderPage = MATERIAL_PAGES[this.state.type.value];
        const { documents, glossary, palette } = this.options.context;
        if (
            !renderPage ||
            !documents.getDataset(SL_DATASETS.AVAILABLE_MATERIAL_SUBJECTS).includes(subject)
        ) {
            render(
                html`<p class="material-inline-note">
                    ${glossary.getRequiredEntryText('general.messages.no-data-short')}
                </p>`,
                this.contentContainer,
            );
            return;
        }
        const page = renderPage(documents.getDataset(MATERIAL_SUBJECT_CONTEXT, subject), {
            palette,
            glossary,
        });
        // The page is one markup document, glossary-annotated as a whole.
        render(trusted(glossary.annotateHTML(page).trim()), this.contentContainer);
    }
}

customElements.define('tba-material-selection', MaterialSelectionModule);
