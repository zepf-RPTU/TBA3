// @vitest-browser
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MaterialSelectionModule } from '../../../../src/sl/modules/material/materialSelectionModule.js';
import { mountModule } from '../../../support/dom.js';
import { competenceValueGroup, SCHOOL_ID } from '../../../support/slValueGroupFactories.js';
import { createSubjectContext } from '../../../support/subjectContext.js';

/**
 * The card shows a page for every Fach the dataset offers — the header lets no other be
 * chosen — and says there is no data for a selection that names none of them.
 */

/**
 * The school's value group in one Fach.
 * @param {string} subject
 * @returns {ReturnType<typeof competenceValueGroup>}
 */
const schoolValueGroup = (subject) =>
    competenceValueGroup({
        id: SCHOOL_ID,
        type: 'school',
        name: 'Schule',
        subject,
        levels: { I: 1 },
    });

/** @type {MaterialSelectionModule|null} */
let card = null;
/** @type {HTMLElement} */
let host;

beforeEach(() => {
    host = document.createElement('div');
    document.body.replaceChildren(host);
});

afterEach(() => {
    card?.remove();
    card = null;
});

/**
 * A mounted card over a school that sat the given Fächer.
 * @param {string[]} subjectNames - The Fächer, in payload order.
 * @param {string} subject - The selected Fach.
 * @returns {Promise<MaterialSelectionModule>}
 */
async function mountCard(subjectNames, subject) {
    card = MaterialSelectionModule.create('material', {
        context: await createSubjectContext('sl', {
            documents: {
                'competence-levels.json': subjectNames.map(schoolValueGroup),
            },
        }),
        subject,
        type: 'Übersicht',
    });
    await mountModule(card, undefined, host);
    return card;
}

describe('MaterialSelectionModule', () => {
    it('shows the page of a Fach no list names, straight from the payload', async () => {
        const mounted = await mountCard(['Deutsch', 'Französisch'], 'Französisch');

        expect(mounted.contentContainer.textContent).toContain('Französisch');
        expect(mounted.getExportIdentity()).toEqual(['Französisch', 'Übersicht']);
    });

    it('says there is no data for a Fach the dataset does not offer', async () => {
        // `Gesamt` has no page, and a dataset without a Fach leaves none chosen.
        const mounted = await mountCard(['Deutsch', 'Französisch'], 'Gesamt');

        expect(mounted.contentContainer.textContent?.trim()).toBe('Keine Daten');
    });
});
