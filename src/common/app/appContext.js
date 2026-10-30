/**
 * The per-app context: everything one dashboard owns that its modules read — the
 * package's `ModuleContext` (document store, glossary, palette) plus the app's
 * identity, the dataset its exports are scoped to, its export cart, and the host
 * `runtime` the cards read. Built once by `BaseAppModule` and handed down
 * explicitly as the `context` option; nothing here is module-level state.
 */

import { createModuleContext } from '@tba3/modules/context';
import { showItemPreview } from '@tba3/modules/overlays';
import { ExportCart } from '../export/exportCart.js';
import { createExportService } from '../export/exportService.js';

/**
 * Which dataset the page shows, as the export layer names it. Switching dataset is a
 * full page reload while the batch-export cart survives in sessionStorage, so a capture
 * must record which dataset it came from, or a tick made under one group silently
 * restores itself under the next and the two captures overwrite each other. The app
 * resolves it rather than the export layer reading the URL: without `?scope=` the URL
 * says nothing about which dataset the default resolves to.
 * @typedef {{id: string, label: string}} ExportDataset
 */

/**
 * The part of the app context the export layer reads.
 * @typedef {import('@tba3/modules/context').ModuleContext & {
 *   appId: string,
 *   viewLabel: (viewType: string) => string,
 *   exportDataset: ExportDataset,
 *   exportCart: ExportCart,
 * }} ExportContext
 */

/**
 * @typedef {ExportContext & {
 *   runtime: import('@tba3/module-base').ModuleRuntime,
 *   itemPreview: NonNullable<import('@tba3/modules/context').ModuleContext['itemPreview']>,
 * }} AppContext
 */

/**
 * @param {object} options
 * @param {string} options.appId - The dashboard (`en`, `ma`, `sl`); also its glossary namespace.
 * @param {import('@tba3/module-base/glossary').GlossaryTree} options.glossaryData - The app's assembled glossary.
 * @param {(viewType: string) => string} options.viewLabel - A view's name as the sidebar shows it, empty for a key the app does not have: an export names its view by it, never by the key.
 * @param {{id: string, label: string}} options.dataset - The dataset the URL selected.
 * @param {import('@tba3/modules/context').ContextStoreOptions} options.store - The dataset's requests and their loader.
 * @param {import('../export/exportImageStore.js').ImageStore} options.images - Where the cart keeps its captures.
 * @returns {AppContext}
 */
export function createAppContext({ appId, glossaryData, viewLabel, dataset, store, images }) {
    const moduleContext = createModuleContext({ glossaryData, namespace: appId, store });
    const exportDataset = Object.freeze({
        id: dataset.id,
        label: dataset.label,
    });
    /** @type {ExportContext} */
    const exportContext = {
        ...moduleContext,
        appId,
        viewLabel,
        exportDataset,
        exportCart: new ExportCart({ appId, images }),
    };
    return {
        ...exportContext,
        itemPreview: (item) => showItemPreview(moduleContext.glossary, item),
        runtime: Object.freeze({
            exportService: createExportService(exportContext),
            decorateText: (/** @type {string} */ html) => moduleContext.glossary.annotateHTML(html),
        }),
    };
}
