// @vitest-browser
/**
 * The toast channel: a transient toast leaves on its own, a persistent one announces as
 * an alert and stays until closed, and the text is rendered as text.
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';

import {
    installGlobalErrorNotifications,
    notify,
    notifyFailure,
} from '../../../../src/common/services/notificationService.js';
import { ModalDialog } from '@tba3/modules/overlays';
import { createTestAppContext } from '../../support/glossaryFixture.js';

const { glossary } = createTestAppContext('en');

const region = () => document.querySelector('.toast-region');
const toasts = () => document.querySelectorAll('.toast');

/** @returns {HTMLElement} The newest toast. */
const latestToast = () => /** @type {HTMLElement} */ ([...toasts()].at(-1));

// The service's timings, restated: a transient toast's lifetime, and a wait that
// outlasts the leave transition before the toast is removed.
const TRANSIENT_LIFETIME_MS = 6000;
const LEAVE_SETTLED_MS = 200;

beforeEach(() => {
    vi.useFakeTimers();
    region()?.remove();
});

describe('notify', () => {
    it('shows a transient toast in a polite live region and takes it away again', () => {
        notify('Bericht gespeichert');

        expect(region()?.getAttribute('aria-live')).toBe('polite');
        expect(toasts()).toHaveLength(1);
        expect(toasts()[0].textContent).toBe('Bericht gespeichert');

        vi.advanceTimersByTime(TRANSIENT_LIFETIME_MS + LEAVE_SETTLED_MS);

        expect(toasts()).toHaveLength(0);
    });

    it('keeps a persistent toast as an alert until its close button is used', () => {
        notify('Der Export ist fehlgeschlagen.', { persistent: true, glossary });
        const toast = latestToast();

        vi.advanceTimersByTime(60_000);
        expect(toast.isConnected).toBe(true);
        expect(toast.getAttribute('role')).toBe('alert');

        const close = /** @type {HTMLButtonElement} */ (
            toast.querySelector('button[aria-label="Schließen"]')
        );
        expect(close.getAttribute('aria-label')).toBe('Schließen');
        close.click();
        vi.advanceTimersByTime(LEAVE_SETTLED_MS);

        expect(toast.isConnected).toBe(false);
    });

    it('renders the message as text, never as markup', () => {
        notify('<img src=x onerror="window.__pwned=1">');
        const toast = latestToast();

        expect(toast.querySelector('img')).toBeNull();
        expect(toast.querySelector('.toast-text')?.textContent).toBe(
            '<img src=x onerror="window.__pwned=1">',
        );
    });

    it('paints a toast over a popover opened after the region', () => {
        // The region is shown when the error channel goes up; the notes drawer or the
        // tour opened later would otherwise cover every toast.
        notify('eins');
        const cover = document.createElement('div');
        cover.popover = 'manual';
        cover.style.cssText = 'inset: 0; width: auto; height: auto; margin: 0;';
        document.body.append(cover);
        cover.showPopover();

        notify('zwei');
        const toast = latestToast();
        const box = toast.getBoundingClientRect();
        const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);

        expect(toast.contains(hit)).toBe(true);
        cover.remove();
    });

    it('puts the toast into the modal opened last, not the first in the document', async () => {
        // The modal below the top one is inert: a toast in it could not be closed.
        const lower = new ModalDialog({ className: 'lower', glossary });
        const upper = new ModalDialog({ className: 'upper', glossary });
        // First in document order is the lower one, which the toast must not go into.
        document.body.append(lower.element, upper.element);
        lower.show('unten');
        upper.show('oben');

        notify('eins');
        expect(region()?.parentElement).toBe(upper.element);

        // The region follows to the modal below once the upper one has closed.
        const closed = new Promise((resolve) =>
            upper.element.addEventListener('close', resolve, { once: true }),
        );
        upper.close();
        await closed;
        expect(region()?.parentElement).toBe(lower.element);

        lower.close();
        upper.destroy();
        lower.destroy();
    });

    it('creates the region once and stacks toasts inside it', () => {
        notify('eins');
        notify('zwei');

        expect(document.querySelectorAll('.toast-region')).toHaveLength(1);
        expect(toasts()).toHaveLength(2);
    });

    it('shows one persistent toast for a failure that repeats', () => {
        notify('Ein unerwarteter Fehler ist aufgetreten.', { persistent: true, glossary });
        const first = latestToast();
        notify('Ein unerwarteter Fehler ist aufgetreten.', { persistent: true, glossary });

        expect(toasts()).toHaveLength(1);
        expect(latestToast()).toBe(first);
    });

    it('shows the message again once the reader has closed it', () => {
        notify('Der Export ist fehlgeschlagen.', { persistent: true, glossary });
        const first = latestToast();
        /** @type {HTMLButtonElement} */ (
            first.querySelector('button[aria-label="Schließen"]')
        ).click();
        vi.advanceTimersByTime(LEAVE_SETTLED_MS);

        notify('Der Export ist fehlgeschlagen.', { persistent: true, glossary });

        expect(latestToast()).not.toBe(first);
        expect(toasts()).toHaveLength(1);
    });
});

describe('notifyFailure', () => {
    it('logs the exception for the developer and shows the glossary sentence to the reader', () => {
        const error = vi.spyOn(console, 'error').mockImplementation(() => {});
        const cause = new Error('boom');

        notifyFailure(glossary, 'general.messages.export-failed', '[Test] failed', cause);

        expect(error).toHaveBeenCalledWith('[Test] failed:', cause);
        expect(toasts()[0].getAttribute('role')).toBe('alert');
        expect(toasts()[0].textContent).toContain('Der Export ist fehlgeschlagen.');
        expect(toasts()[0].textContent).not.toContain('boom');
        error.mockRestore();
    });
});

describe('installGlobalErrorNotifications', () => {
    /** @type {import('vitest').MockInstance} */
    let consoleError;

    // Installed once for the block; beforeAll runs the returned disposer after it.
    beforeAll(() => installGlobalErrorNotifications(glossary));

    beforeEach(() => {
        consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => consoleError.mockRestore());

    it('reports an uncaught exception to the reader', () => {
        window.dispatchEvent(
            new ErrorEvent('error', { error: new Error('boom'), message: 'boom' }),
        );

        expect(toasts()).toHaveLength(1);
        expect(toasts()[0].textContent).toContain('Ein unerwarteter Fehler ist aufgetreten.');
    });

    it('ignores an ErrorEvent that carries no exception', () => {
        // Browser notices, not failures of this app: the ResizeObserver notice
        // raised while a window is dragged and the cross-origin "Script error."
        // both arrive with `error === null`.
        window.dispatchEvent(
            new ErrorEvent('error', {
                error: null,
                message: 'ResizeObserver loop completed with undelivered notifications.',
            }),
        );
        window.dispatchEvent(new ErrorEvent('error', { error: null, message: 'Script error.' }));

        expect(toasts()).toHaveLength(0);
    });

    it('reports an unhandled promise rejection', () => {
        window.dispatchEvent(
            new PromiseRejectionEvent('unhandledrejection', {
                promise: Promise.resolve(),
                reason: new Error('render failed'),
            }),
        );

        expect(toasts()).toHaveLength(1);
        expect(toasts()[0].textContent).toContain('Ein unerwarteter Fehler ist aufgetreten.');
    });
});
