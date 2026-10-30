// @vitest-browser

import { afterEach, describe, it, expect, vi } from 'vitest';
import { ModalDialog, isUnclaimedEscape } from '../../../src/common/overlays/index.js';
import { createTestContext } from '../../support/glossaryFixture.js';

/** @type {ModalDialog[]} */
let dialogs = [];

/**
 * @param {() => void} [onClose]
 * @returns {ModalDialog} A dialog with a panel holding its close button.
 */
function make(onClose) {
    const dialog = new ModalDialog({
        className: 'test-dialog',
        glossary: createTestContext('en').glossary,
        onClose,
    });
    const panel = document.createElement('div');
    panel.className = 'panel';
    panel.append(dialog.closeButton);
    dialog.element.append(panel);
    dialogs.push(dialog);
    return dialog;
}

afterEach(() => {
    dialogs.forEach((dialog) => dialog.destroy());
    dialogs = [];
});

describe('ModalDialog', () => {
    it('opens as a modal named by its show label', () => {
        const dialog = make();
        dialog.show('Aufgabe anzeigen');

        expect(dialog.element.parentElement).toBe(document.body);
        expect(dialog.element.matches(':modal')).toBe(true);
        expect(dialog.element.getAttribute('aria-label')).toBe('Aufgabe anzeigen');
        expect(dialog.closeButton.getAttribute('aria-label')).toBe('Schließen');
    });

    it('closes on its close button and the backdrop only', () => {
        const onClose = vi.fn();
        const dialog = make(onClose);
        const documentClicks = vi.fn();
        document.addEventListener('click', documentClicks);
        dialog.show('Aufgabe anzeigen');

        /** @type {HTMLElement} */ (dialog.element.querySelector('.panel')).click();
        expect(onClose).not.toHaveBeenCalled();
        // Document-level delegation (the table menus) must keep working inside.
        expect(documentClicks).toHaveBeenCalledOnce();

        dialog.closeButton.click();
        expect(onClose).toHaveBeenCalledTimes(1);
        expect(dialog.isOpen).toBe(false);

        dialog.show('Aufgabe anzeigen');
        dialog.element.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
        dialog.element.click();
        expect(onClose).toHaveBeenCalledTimes(2);

        document.removeEventListener('click', documentClicks);
    });

    it('stays open for a press that began in the panel and ended on the backdrop', () => {
        const onClose = vi.fn();
        const dialog = make(onClose);
        dialog.show('Aufgabe anzeigen');

        // A text selection or chart marquee dragged out of the panel clicks the dialog.
        /** @type {HTMLElement} */ (dialog.element.querySelector('.panel')).dispatchEvent(
            new PointerEvent('pointerdown', { bubbles: true }),
        );
        dialog.element.click();
        expect(onClose).not.toHaveBeenCalled();
        expect(dialog.isOpen).toBe(true);
        dialog.destroy();
    });

    it('notifies a close the browser made (Escape) once', async () => {
        const onClose = vi.fn();
        const dialog = make(onClose);
        dialog.show('Aufgabe anzeigen');

        // Registered after ModalDialog's own listener, so it resolves once that one ran.
        const closed = new Promise((resolve) =>
            dialog.element.addEventListener('close', resolve, { once: true }),
        );
        dialog.element.close();
        await closed;

        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('does not let a queued close event close a dialog reopened before it arrived', async () => {
        // The SL overlay closes and reopens on the next card; the late event must
        // not tear down the new card's charts.
        const onClose = vi.fn();
        const dialog = make(onClose);
        dialog.show('Aufgabe anzeigen');
        const closed = new Promise((resolve) =>
            dialog.element.addEventListener('close', resolve, { once: true }),
        );
        dialog.close();
        dialog.show('Aufgabe anzeigen');
        await closed;

        expect(onClose).toHaveBeenCalledTimes(1);
        expect(dialog.isOpen).toBe(true);
    });
});

describe('isUnclaimedEscape', () => {
    /**
     * @param {string} key
     * @returns {KeyboardEvent}
     */
    const keydown = (key) => new KeyboardEvent('keydown', { key, cancelable: true });

    it('accepts an Escape nothing claimed, and nothing else', () => {
        expect(isUnclaimedEscape(keydown('Escape'))).toBe(true);
        expect(isUnclaimedEscape(keydown('Enter'))).toBe(false);
    });

    it('leaves an Escape a handler already used alone', () => {
        const event = keydown('Escape');
        event.preventDefault();
        expect(isUnclaimedEscape(event)).toBe(false);
    });

    it('leaves the Escape to an open auto popover, which closes first', () => {
        const popover = document.createElement('div');
        popover.popover = 'auto';
        document.body.append(popover);
        popover.showPopover();

        expect(isUnclaimedEscape(keydown('Escape'))).toBe(false);

        popover.remove();
    });

    it('leaves the Escape to an open modal, which closes on it', () => {
        const dialog = make();
        dialog.show('Aufgabe anzeigen');
        expect(isUnclaimedEscape(keydown('Escape'))).toBe(false);

        dialog.close();
        expect(isUnclaimedEscape(keydown('Escape'))).toBe(true);
    });
});
