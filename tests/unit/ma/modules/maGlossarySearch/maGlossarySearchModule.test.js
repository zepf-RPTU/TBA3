// @vitest-browser

import { afterEach, describe, expect, it } from 'vitest';
import { userEvent } from 'vitest/browser';

import { MaGlossarySearchModule } from '../../../../../src/ma/modules/maGlossarySearch/maGlossarySearchModule.js';
import { createTestAppContext } from '../../../support/glossaryFixture.js';
import { required } from '../../../../../packages/modules/test/support/required.js';

/** @type {MaGlossarySearchModule|null} */
let search = null;

/** @returns {Promise<MaGlossarySearchModule>} The search, rendered over the MA glossary. */
async function mountSearch() {
    search = MaGlossarySearchModule.create('help-search', {
        context: createTestAppContext('ma'),
    });
    document.body.append(search);
    await search.updateComplete;
    return search;
}

/**
 * @param {MaGlossarySearchModule} host
 * @returns {string[]} The ids of the entries it shows.
 */
const shownIds = (host) =>
    [...host.querySelectorAll('.help-item:not([hidden])')].map(
        (item) => /** @type {HTMLElement} */ (item).dataset.id ?? '',
    );

afterEach(() => {
    search?.remove();
    search = null;
});

describe('MaGlossarySearchModule', () => {
    it('names its field with a visible label, not only a placeholder', async () => {
        const host = await mountSearch();
        const input = required(host.querySelector('input'));

        const label = required(host.querySelector(`label[for="${input.id}"]`));
        expect(label.textContent?.trim()).toBe('Im Glossar suchen');
    });

    it('lists the entries alphabetically', async () => {
        const host = await mountSearch();
        const titles = [...host.querySelectorAll('.help-item-title')].map(
            (title) => title.textContent ?? '',
        );

        // An empty list is sorted too.
        expect(titles.length).toBeGreaterThan(1);
        expect(titles).toEqual([...titles].sort((a, b) => a.localeCompare(b, 'de')));
    });

    it('finds an entry by another of its names, and announces the count', async () => {
        // "Niveaustufe" is an alias of the Aufgabenniveau, in neither its title nor body.
        const host = await mountSearch();
        const input = /** @type {HTMLInputElement} */ (required(host.querySelector('input')));

        await userEvent.type(input, 'Niveaustufe');
        await host.updateComplete;

        expect(shownIds(host)).toContain('aufgabenniveau');
        expect(host.querySelector('[role="status"]')?.textContent).toMatch(/gefunden/);
        // The field keeps what was typed: the match is case-blind, the field is not.
        expect(input.value).toBe('Niveaustufe');
    });

    it('offers a way back from an empty result', async () => {
        const host = await mountSearch();
        await userEvent.type(required(host.querySelector('input')), 'zzzz');
        await host.updateComplete;
        expect(shownIds(host)).toEqual([]);

        /** @type {HTMLButtonElement} */ (
            required(host.querySelector('.help-no-results button'))
        ).click();
        await host.updateComplete;

        expect(shownIds(host).length).toBeGreaterThan(0);
        expect(/** @type {HTMLInputElement} */ (host.querySelector('input')).value).toBe('');
    });
});
