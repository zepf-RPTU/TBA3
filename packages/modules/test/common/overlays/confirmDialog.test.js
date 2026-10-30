// @vitest-browser
/**
 * The confirmation before a destructive action: only the confirming button says yes;
 * Cancel, Escape and the backdrop say no, and the dialog leaves the page either way.
 */

import { describe, it, expect } from 'vitest';
import { confirmDialog } from '../../../src/common/overlays/index.js';
import { createTestContext } from '../../support/glossaryFixture.js';
import { required } from '../../support/required.js';

const KEYS = {
    labelKey: 'general.buttons.element_texts.close.label',
    messageKey: 'general.buttons.element_texts.close.label',
    confirmKey: 'general.buttons.element_texts.close.label',
};

/** @returns {Promise<boolean>} The open confirmation's answer. */
const ask = () => confirmDialog({ glossary: createTestContext('en').glossary, ...KEYS });

/** @returns {HTMLDialogElement} The open confirmation. */
const dialog = () =>
    required(
        /** @type {HTMLDialogElement|null} */ (document.querySelector('dialog.confirm-dialog')),
    );

/** @returns {HTMLButtonElement[]} Cancel, then the confirming button. */
const buttons = () => [...dialog().querySelectorAll('button')];

describe('confirmDialog', () => {
    it('opens with Cancel focused, and says yes only on the confirming button', async () => {
        const answer = ask();
        expect(dialog().matches(':modal')).toBe(true);
        expect(document.activeElement).toBe(buttons()[0]);

        buttons()[1].click();

        await expect(answer).resolves.toBe(true);
        await Promise.resolve();
        expect(document.querySelector('dialog.confirm-dialog')).toBeNull();
    });

    it('is titled with the action and confirms in the danger fill', async () => {
        const answer = ask();
        const title = required(dialog().querySelector('h2'));
        expect(title.textContent).toBe(dialog().getAttribute('aria-label'));
        expect(buttons()[1].classList.contains('btn--danger')).toBe(true);
        buttons()[0].click();
        await answer;
    });

    it('says no on Cancel', async () => {
        const answer = ask();
        buttons()[0].click();
        await expect(answer).resolves.toBe(false);
    });

    it('says no when closed any other way (Escape)', async () => {
        const answer = ask();
        // What the browser does on Escape: a cancel, then a close.
        dialog().close();
        await expect(answer).resolves.toBe(false);
    });
});
