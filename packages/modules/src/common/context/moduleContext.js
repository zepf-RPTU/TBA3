/**
 * The per-app state the concrete modules read: the app's document store, its glossary
 * (the tree and the annotator over it) and its competence-level palette. One context per app, built once and handed down explicitly: as the `context`
 * option every module forwards to its children (`BaseModule._childOptions`), and as a
 * parameter to the renderers, helpers and column factories a module calls. Nothing here
 * is a module-level singleton, so two apps (or two tests) never share one.
 */

import { GlossaryAnnotator } from '../glossary/glossaryAnnotator.js';
import { CompetenceLevelPalette } from '../services/competenceLevelPalette.js';
import { DocumentStore } from '../data/documentStore.js';
import { createDatasetRegistration } from '../services/datasetRegistration.js';

/**
 * What a module reads of its app.
 * @typedef {import('@tba3/module-base').BaseContext & {
 *   documents: DocumentStore,
 *   glossary: GlossaryAnnotator,
 *   palette: CompetenceLevelPalette,
 *   itemPreview?: (item: import('../overlays/itemPreviewOverlay.js').ItemPreview) => void,
 * }} ModuleContext
 * `glossary` annotates `glossaryData`; `palette` fills as the documents land. `itemPreview`
 * shows an item's preview, which the host sets; without it no table offers the button.
 */

/**
 * What every dataset builder gets after its inputs (`dataset()`): the parts of the context
 * that exist before the store.
 * @typedef {Pick<ModuleContext, 'glossary' | 'palette'>} DatasetContext
 */

/**
 * The store a context builds: what `DocumentStore` takes, minus the landing hook and the
 * builders' context, which the context wires itself.
 * @typedef {Omit<import('../data/documentStore.js').DocumentStoreOptions, 'onLand' | 'datasetContext'>} ContextStoreOptions
 */

/**
 * Build an app's context, its document store included: the store's landing hook
 * registers the scales the documents carry with this context's palette and glossary
 * (`createDatasetRegistration`), before anything reads them, and its dataset builders
 * get the glossary and palette after their inputs.
 * @param {object} options
 * @param {import('@tba3/module-base/glossary').GlossaryTree|null} options.glossaryData
 * @param {string} options.namespace - The tree's top-level key whose `shared.element_texts` is the term index (tba3: the app id).
 * @param {ContextStoreOptions} [options.store] - The requests the store may send and its loader; without it an empty store.
 * @returns {ModuleContext} A fresh context: the glossary built, the palette empty.
 */
export function createModuleContext({ glossaryData, namespace, store = {} }) {
    const glossary = new GlossaryAnnotator(glossaryData, namespace);
    const palette = new CompetenceLevelPalette();
    /** @type {DatasetContext} */
    const parts = { glossary, palette };
    return {
        ...parts,
        glossaryData,
        documents: new DocumentStore({
            ...store,
            onLand: createDatasetRegistration(parts),
            datasetContext: parts,
        }),
    };
}
