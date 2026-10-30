/**
 * A titled card that exports as an image, built over the app's own runtime: its header
 * carries the export service's real controls, the batch checkbox among them. Its
 * identity is a signal, so a test re-points it the way a card that shows one item at a
 * time does.
 */

import { signal } from '@preact/signals-core';
import { ContentModule } from '@tba3/module-base';
import { mountModule, queryHtml } from '../../../packages/modules/test/support/dom.js';

/**
 * @typedef {import('@tba3/module-base').ContentOptions & {
 *   identity?: import('@preact/signals-core').Signal<string|null>,
 * }} ExportCardOptions
 */

/** @augments {ContentModule<ExportCardOptions>} */
class ExportCard extends ContentModule {
    /** @override */
    async _renderBody() {}

    /**
     * @override
     * @returns {'visual'} An image.
     */
    _getExportType() {
        return 'visual';
    }

    /**
     * @override
     * @returns {string|null} The item the card shows now.
     */
    getExportIdentity() {
        return this.options.identity?.value ?? null;
    }
}

customElements.define('test-batch-export-card', ExportCard);

/**
 * Mount an export card at the end of `parent`, titled and in the given view.
 * @param {object} options
 * @param {string} options.id - The card's module id.
 * @param {import('../../../src/common/app/appContext.js').AppContext} options.context - The app whose runtime and cart the card uses.
 * @param {HTMLElement} options.parent - Where it is placed.
 * @param {string} [options.viewKey]
 * @param {import('@preact/signals-core').Signal<string|null>} [options.identity] - What it shows; nothing beyond itself by default.
 * @returns {Promise<{card: ContentModule, identity: import('@preact/signals-core').Signal<string|null>, batchButton: () => HTMLButtonElement}>}
 */
export async function mountExportCard({
    id,
    context,
    parent,
    viewKey = 'overview',
    identity = signal(null),
}) {
    const card = ExportCard.create(id, {
        context,
        showModuleTitle: true,
        title: 'Testdiagramm',
        viewKey,
        identity,
    });
    await mountModule(card, undefined, parent);
    // The export control is placed in a microtask after the first render.
    await Promise.resolve();
    await card.updateComplete;
    return {
        card,
        identity,
        batchButton: () =>
            /** @type {HTMLButtonElement} */ (
                queryHtml(card, '[data-header-action-button="batch-select"]')
            ),
    };
}
