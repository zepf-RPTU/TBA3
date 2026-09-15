/**
 * The item-detail panel's three empty-state sentences.
 *
 * They moved out of the module and into `en.item-detail.messages.*` on 2026-09-08,
 * and the module reads them through a **computed** key
 * (`` `en.item-detail.messages.${key}` ``). Structure-check rule 8 resolves literal
 * glossary paths only, so a computed one is exactly the case it cannot see — and none of
 * the checked-in EN fixtures produce an item with an empty solver group, so the e2e layer
 * never renders these either. This file is the only thing standing between a renamed entry
 * and `[Missing glossary entry: …]` on screen.
 */

import { describe, it, expect, beforeEach } from 'vitest';

import { glossaryAnnotator } from '@tba3/modules/common/glossary/glossaryAnnotator.js';
import { applyTemplateTokens } from '@tba3/module-base/glossary/glossaryText.js';
import { EN_TERMS } from '@tba3/modules/en/enTerms.js';
import { initGlossaryForTests } from '../../../support/glossaryFixture.js';

/** The three keys `#renderStudentsHtml` can compute, and nothing else. */
const MESSAGE_KEYS = ['none-solved', 'all-solved', 'no-student-data'];

/**
 * Resolve one message the way the module does.
 * @param {string} key - The computed key's last segment.
 * @returns {string} The sentence, with the group term filled in.
 */
function resolveMessage(key) {
    return applyTemplateTokens(
        glossaryAnnotator.getRequiredEntryText(`en.item-detail.messages.${key}`),
        { Lernende: EN_TERMS.STUDENTS },
    );
}

beforeEach(() => initGlossaryForTests('en'));

describe('en.item.item-details.messages', () => {
    it.each(MESSAGE_KEYS)('resolves %s to a real sentence', (key) => {
        const text = resolveMessage(key);

        expect(text).not.toContain('Missing glossary entry');
        expect(text.length).toBeGreaterThan(10);
    });

    it('substitutes the group term, leaving no token behind', () => {
        for (const key of MESSAGE_KEYS) {
            const text = resolveMessage(key);

            // The failure this guards is silent: an unsubstituted `{{Lernende}}` still
            // renders, as literal braces in the middle of a German sentence.
            expect(text).not.toContain('{{');
            expect(text).toContain(EN_TERMS.STUDENTS);
        }
    });

    it('keeps the three sentences distinct', () => {
        // WHY: `none-solved` and `no-student-data` both start "Keine …" and are chosen one
        // branch apart; collapsing them would tell a reader with no data that every student
        // got it wrong.
        const texts = MESSAGE_KEYS.map(resolveMessage);

        expect(new Set(texts).size).toBe(MESSAGE_KEYS.length);
    });

    it('names the token `Lernende`, which is the half the module has to match', () => {
        // This file resolves the messages the way the module does rather than through it,
        // so a token renamed on *one* side would otherwise pass here and render literal
        // braces in the app. Pinning the name is what makes the entry and the module's
        // one-line `{ Lernende: EN_TERMS.STUDENTS }` a contract instead of a coincidence.
        for (const key of MESSAGE_KEYS) {
            const raw = glossaryAnnotator.getRequiredEntryText(`en.item-detail.messages.${key}`);

            expect(raw).toContain('{{Lernende}}');
        }
    });

    it('spells the group term with the colon form', () => {
        // The glossary spells the group term `Schüler:innen`; these entries carry it
        // through EN_TERMS rather than spelling it themselves.
        expect(EN_TERMS.STUDENTS).toBe('Schüler:innen');
        expect(resolveMessage('all-solved')).not.toContain('Schüler*');
    });
});
