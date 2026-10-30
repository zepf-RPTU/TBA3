// @vitest-browser

/**
 * A replacement given as text runs puts each keyed run into the card title as the term
 * of its entry, and the title's text (export names, the tour) reads the runs as text.
 */

import { describe, expect, it } from 'vitest';
import { ContentModule } from '../../index.js';
import { DEFAULT_RUNTIME } from '../../src/modules/moduleRuntime.js';

class TitledCard extends ContentModule {
    /** @override */
    async _renderBody() {}
}
customElements.define('test-title-tokens-card', TitledCard);

/**
 * A titled card over a one-entry glossary whose title is `{{Bereich}}`.
 * @param {boolean} showSubtitle
 * @returns {Promise<TitledCard>} Connected and rendered.
 */
async function card(showSubtitle) {
    const context = {
        documents: { ensure: async () => {} },
        glossaryData: { card: { title: 'Ergebnis: {{Bereich}}', subtitle: 'Text' } },
        runtime: DEFAULT_RUNTIME,
    };
    const module = TitledCard.create(`title-tokens-${showSubtitle}`, {
        context,
        glossaryKey: 'card',
        showModuleTitle: true,
        showSubtitle,
        glossaryReplacements: {
            Bereich: [{ text: 'Englisch: ' }, { text: 'Lesen & Co', glossaryKey: 'lesen' }],
        },
    });
    document.body.append(module);
    await module.updateComplete;
    return module;
}

describe('ContentModule title tokens', () => {
    it.each([false, true])(
        'links a keyed run as its term, with or without a subtitle (%s)',
        async (showSubtitle) => {
            const module = await card(showSubtitle);
            const title = /** @type {HTMLElement} */ (module.titleElement);

            expect(module.cardTitle).toBe('Ergebnis: Englisch: Lesen & Co');
            expect(title.textContent).toBe('Ergebnis: Englisch: Lesen & Co');
            expect(
                [...title.querySelectorAll('[data-glossary-key]')].map((term) => [
                    term.textContent,
                    term.getAttribute('data-glossary-key'),
                ]),
            ).toEqual([['Lesen & Co', 'lesen']]);
            module.remove();
        },
    );
});
