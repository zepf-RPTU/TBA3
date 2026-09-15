// @vitest-browser
/**
 * The toast channel that replaced `alert()`: a transient toast leaves on its
 * own, a persistent one announces as an alert and stays until closed, and the
 * text is rendered as text.
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';

import {
    installGlobalErrorNotifications,
    notify,
    notifyFailure,
    NOTIFICATION_REGION_CLASS,
} from '../../../../src/common/services/notificationService.js';
import { initGlossaryForTests } from '../../support/glossaryFixture.js';

const region = () => document.querySelector(`.${NOTIFICATION_REGION_CLASS}`);
const toasts = () => document.querySelectorAll('.toast');

beforeEach(() => {
    initGlossaryForTests('en');
    vi.useFakeTimers();
    region()?.remove();
});

afterEach(() => {
    vi.useRealTimers();
});

describe('notify', () => {
    it('shows a transient toast in a polite live region and takes it away again', () => {
        notify('Bericht gespeichert');

        expect(region()?.getAttribute('aria-live')).toBe('polite');
        expect(toasts()).toHaveLength(1);
        expect(toasts()[0].textContent).toBe('Bericht gespeichert');

        vi.advanceTimersByTime(6000 + 200);

        expect(toasts()).toHaveLength(0);
    });

    it('keeps a persistent toast as an alert until its close button is used', () => {
        const toast = notify('Der Export ist fehlgeschlagen.', { persistent: true });

        vi.advanceTimersByTime(60_000);
        expect(toast.isConnected).toBe(true);
        expect(toast.getAttribute('role')).toBe('alert');

        const close = /** @type {HTMLButtonElement} */ (toast.querySelector('.toast-close'));
        expect(close.getAttribute('aria-label')).toBe('Schließen');
        close.click();
        vi.advanceTimersByTime(200);

        expect(toast.isConnected).toBe(false);
    });

    it('renders the message as text, never as markup', () => {
        const toast = notify('<img src=x onerror="window.__pwned=1">');

        expect(toast.querySelector('img')).toBeNull();
        expect(toast.querySelector('.toast-text')?.textContent).toBe(
            '<img src=x onerror="window.__pwned=1">',
        );
    });

    it('creates the region once and stacks toasts inside it', () => {
        notify('eins');
        notify('zwei');

        expect(document.querySelectorAll(`.${NOTIFICATION_REGION_CLASS}`)).toHaveLength(1);
        expect(toasts()).toHaveLength(2);
    });

    it('shows one persistent toast for a failure that repeats', () => {
        const first = notify('Ein unerwarteter Fehler ist aufgetreten.', { persistent: true });
        const again = notify('Ein unerwarteter Fehler ist aufgetreten.', { persistent: true });

        expect(again).toBe(first);
        expect(toasts()).toHaveLength(1);
    });

    it('still shows a persistent toast for a different failure', () => {
        notify('Der Export ist fehlgeschlagen.', { persistent: true });
        notify('Die Ansicht konnte nicht geladen werden.', { persistent: true });

        expect(toasts()).toHaveLength(2);
    });

    it('shows the message again once the reader has closed it', () => {
        const first = notify('Der Export ist fehlgeschlagen.', { persistent: true });
        /** @type {HTMLButtonElement} */ (first.querySelector('.toast-close')).click();
        vi.advanceTimersByTime(200);

        const second = notify('Der Export ist fehlgeschlagen.', { persistent: true });

        expect(second).not.toBe(first);
        expect(toasts()).toHaveLength(1);
    });
});

describe('notifyFailure', () => {
    it('logs the exception for the developer and shows the glossary sentence to the reader', () => {
        const error = vi.spyOn(console, 'error').mockImplementation(() => {});
        const cause = new Error('boom');

        notifyFailure('general.messages.export-failed', '[Test] failed', cause);

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

    // Installed once: the handlers are registered for the page's lifetime by
    // design, so there is nothing to tear down between cases.
    beforeAll(() => installGlobalErrorNotifications());

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
        // How browsers announce themselves rather than a failure of this app:
        // the ResizeObserver notice raised while a window is dragged, and the
        // cross-origin "Script error.". Both arrive with `error === null`.
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

    it('does not stack a toast per occurrence while one is still standing', () => {
        for (let i = 0; i < 5; i++) {
            window.dispatchEvent(
                new ErrorEvent('error', { error: new Error('boom'), message: 'boom' }),
            );
        }

        expect(toasts()).toHaveLength(1);
    });
});
