/**
 * Shared cart and image-store records for the report view suites, and the report view
 * they render into.
 *
 * Each suite builds its app context, whose cart keeps its captures in a memory store of
 * its own; the cart a helper ticks into is that context's `exportCart`.
 */

import { vi } from 'vitest';
import { ReportViewModule } from '../../../src/common/views/report/reportViewModule.js';
import { viewOptions } from './viewOptions.js';

/** A 1×1 PNG, so a capture decodes as a real one does. */
const PNG_BYTES = Uint8Array.from(
    atob(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
    ),
    (char) => char.charCodeAt(0),
);

/**
 * One stored capture on the overview, shaped the way an image store's `list(appId)`
 * returns it.
 * @param {string} itemId - The capture's export target id.
 * @returns {import('../../../src/common/export/exportImageStore.js').StoredExportImage}
 */
export function record(itemId) {
    return {
        itemId,
        tabId: 'tab',
        title: itemId,
        view: 'overview',
        docOrder: 0,
        capturedAt: 1,
        width: 100,
        height: 50,
        blob: new Blob([PNG_BYTES], { type: 'image/png' }),
        datasetLabel: '8a',
    };
}

/**
 * Tick a target into the cart with its capture, as the batch checkbox does.
 * @param {import('../../../src/common/export/exportCart.js').ExportCart} exportCart - The app's cart.
 * @param {string} id
 * @returns {Promise<void>}
 */
export function select(exportCart, id) {
    return exportCart.add(id, record(id));
}

/** Let the report's pending image-list read and re-render settle. */
export async function flush() {
    await new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * The `viewConfig` option a report view takes in a test: one view, the one every record
 * was captured on. The report reads only each view's label and the key order, so the
 * entry is cast from that much.
 * @type {{[viewType: string]: import('../../../src/common/app/appModule.js').LabelledViewConfigEntry}}
 */
const REPORT_VIEW_CONFIG =
    /** @type {{[viewType: string]: import('../../../src/common/app/appModule.js').LabelledViewConfigEntry}} */ (
        /** @type {unknown} */ ({ overview: { label: 'Übersicht' } })
    );

/**
 * A report view over a fresh cart holding `ids`, each with its stored capture: the cart
 * emptied (with it its arrangement and images), blob URLs stubbed, the view placed in the
 * page and its first report read settled.
 * @param {ReturnType<typeof import('./glossaryFixture.js').createTestAppOptions>} appOptions
 * @param {string[]} ids - The targets ticked before the view renders.
 * @returns {Promise<ReportViewModule>} The view, rendered with one card per id.
 */
export async function mountReportView(appOptions, ids) {
    const { exportCart } = appOptions.context;
    exportCart.clear();
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:card');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});

    /** @type {import('./viewOptions.js').TestViewOptions} */
    const options = { ...viewOptions(), ...appOptions, viewConfig: REPORT_VIEW_CONFIG };
    const view = ReportViewModule.create(
        'report',
        /** @type {ReportViewModule['options']} */ (options),
    );
    for (const id of ids) await select(exportCart, id);
    document.body.append(view);
    await view.contentComplete;
    // As the view lifecycle shows every view it activates.
    view.show();
    await flush();
    return view;
}
