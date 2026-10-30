// @vitest-browser

import { describe, expect, it } from 'vitest';
import { ContentModule } from '../../index.js';

class Reader extends ContentModule {
    /** @override */
    static documents = ['items.json'];

    #rendered = 0;

    /** @returns {number} How often the body rendered. */
    get rendered() {
        return this.#rendered;
    }

    /** @override */
    async _renderBody() {
        this.#rendered++;
    }
}
customElements.define('test-document-reader', Reader);

describe('ContentModule documents', () => {
    it('renders nothing once removed while its documents load', async () => {
        // A card removed before its fetch answers would otherwise build its content
        // into a torn-down element that nothing tears down.
        let land = () => {};
        const documents = {
            ensure: () =>
                new Promise((resolve) => {
                    land = () => resolve(undefined);
                }),
        };
        const card = Reader.create('reader', { context: { documents, glossaryData: null } });
        document.body.append(card);
        const firstPass = card.contentComplete;

        card.remove();
        // Teardown waits out a move, one microtask.
        await Promise.resolve();
        land();
        await firstPass;

        expect(card.rendered).toBe(0);
    });
});
