/**
 * The item-detail panel's three empty-state sentences. The module reads them through a
 * computed key (`` `en.item-detail.${path}` ``), which the static glossary-path
 * check cannot resolve, and no EN fixture has an item with an empty solver group, so e2e
 * never renders them. Only this file catches a renamed entry.
 */

import { describe, it, expect } from 'vitest';

import { createTestContext } from '../../../support/glossaryFixture.js';
import { TERM_CONSTANTS } from '../../../../src/common/domain/index.js';

/** The three empty-state keys `#studentsTemplate` resolves. */
const MESSAGE_KEYS = ['none-solved', 'all-solved', 'no-student-data'];

/**
 * Resolve one message the way the module does.
 * @param {string} key - The computed key's last segment.
 * @returns {string}
 */
function resolveMessage(key) {
    return createTestContext('en').glossary.getRequiredEntryText(`en.item-detail.messages.${key}`);
}

describe('en.item.item-details.messages', () => {
    it.each(MESSAGE_KEYS)('resolves %s to a real sentence', (key) => {
        const text = resolveMessage(key);

        expect(text).not.toContain('Missing glossary entry');
        expect(text.length).toBeGreaterThan(10);
    });

    it('names the group with the shared term and carries no token', () => {
        for (const key of MESSAGE_KEYS) {
            const text = resolveMessage(key);

            // The module prints the entry as it is: a `{{…}}` token would render as
            // literal braces in the middle of a German sentence.
            expect(text).not.toContain('{{');
            expect(text).toContain(TERM_CONSTANTS.STUDENTS);
        }
    });
});
