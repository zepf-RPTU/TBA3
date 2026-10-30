/**
 * Notifications: a body-level toast region that replaces `alert()`.
 *
 * A failed boot (construction or the first render rejecting) is the bootstrap's own inline
 * `role="alert"` in the app container, a dataset that failed to load under a running
 * shell the app's notice above the views. Everything else — an export that failed, a
 * view that could not be shown, a promise nobody caught, during the boot or after
 * it — reaches the user through here, in the glossary's words, never the
 * exception's: that stays in the console, where the callers log it. Nothing is
 * sent anywhere: the data is school data, and a remote error sink is the operator's
 * decision, not a default.
 *
 * Two shapes. A *transient* toast confirms or informs and leaves on its own; a
 * *persistent* one reports lost work and stays until closed, so it announces as
 * `role="alert"` and carries a close button. Both are plain text: `textContent`,
 * never markup.
 *
 * The region is a `popover="manual"` in the top layer, so it paints above the page
 * and every popover opened before its first toast. A modal `<dialog>` makes
 * everything outside it inert, so while one is open the region moves into it and
 * back to the body when it closes: a failure raised while a dialog is open is
 * still announced and still closable. Re-showing the region would replay every
 * standing toast's enter animation, so it is only re-shown when it moves or another
 * popover may cover it.
 *
 * The region is page state; the words are the app's, so every call that needs the
 * glossary (a persistent toast's close label, a failure's sentence) is handed it.
 */

/** @typedef {import('@tba3/modules/context').GlossaryAnnotator} GlossaryAnnotator */

import { createIcon } from '@tba3/module-base';
import { topModalDialog } from '@tba3/modules/overlays';
import './notificationService.css';

/** How long a transient toast stays. */
const TRANSIENT_LIFETIME_MS = 6000;
/** Matches the leave transition in notificationService.css (`--motion-duration-fast`). */
const LEAVE_MS = 150;

const NOTIFICATION_REGION_CLASS = 'toast-region';

/** @type {HTMLElement|null} */
let region = null;

/**
 * The single toast region, appended when the error channel goes up (or on first use).
 * @returns {HTMLElement}
 */
function ensureRegion() {
    if (region?.isConnected) return region;
    region = document.createElement('div');
    region.className = NOTIFICATION_REGION_CLASS;
    region.setAttribute('role', 'status');
    region.setAttribute('aria-live', 'polite');
    region.popover = 'manual';
    document.body.appendChild(region);
    return region;
}

/**
 * Put the region on top of the top layer: inside the top open modal dialog, if there
 * is one (outside it the region would be inert), else in the body. A popover opened after
 * the region (the notes drawer, the tour, a glossary popup) stacks above it, so while
 * one is open the region is shown again.
 * @param {HTMLElement} host - The toast region.
 */
function raise(host) {
    const modal = topModalDialog();
    const parent = modal ?? document.body;
    const covered = document.querySelector(`:popover-open:not(.${NOTIFICATION_REGION_CLASS})`);
    if (host.parentElement === parent && host.matches(':popover-open') && !covered) return;
    // Moving a shown popover hides it; showing it again puts it on top of the top layer.
    if (host.matches(':popover-open')) host.hidePopover();
    if (host.parentElement !== parent) {
        parent.append(host);
        modal?.addEventListener(
            'close',
            () => {
                if (host.parentElement === modal) raise(host);
            },
            { once: true },
        );
    }
    host.showPopover();
}

/**
 * Take a toast out: fade, then remove.
 * @param {HTMLElement} toast
 */
function dismiss(toast) {
    if (!toast.isConnected || toast.classList.contains('is-leaving')) return;
    toast.classList.add('is-leaving');
    setTimeout(() => toast.remove(), LEAVE_MS);
}

/**
 * The persistent toast already showing this sentence, if one is still up.
 * @param {HTMLElement} host - The toast region.
 * @param {string} text - The sentence to match.
 * @returns {HTMLElement|null} The standing toast, or null when this is the first.
 */
function findStandingToast(host, text) {
    for (const child of host.children) {
        const el = /** @type {HTMLElement} */ (child);
        if (!el.classList.contains('toast--persistent')) continue;
        if (el.classList.contains('is-leaving')) continue;
        if (el.querySelector('.toast-text')?.textContent === text) return el;
    }
    return null;
}

/**
 * Show a message.
 * @param {string} text - The sentence, from the glossary; rendered as text.
 * @param {{persistent?: false} | {persistent: true, glossary: GlossaryAnnotator}} [options] - `persistent` keeps the toast until the reader closes it and announces it assertively; its close button is labelled from `glossary`.
 */
export function notify(text, options = {}) {
    const host = ensureRegion();
    const persistent = options.persistent === true;

    // One repeated failure is one message. A resize drag can raise the same
    // failure dozens of times; a persistent toast per occurrence would bury the
    // page under alerts the reader has to close one by one.
    if (persistent) {
        const standing = findStandingToast(host, text);
        if (standing) return;
    }

    const toast = document.createElement('div');
    toast.className = persistent ? 'toast toast--persistent' : 'toast';

    const message = document.createElement('span');
    message.className = 'toast-text';
    message.textContent = text;
    toast.appendChild(message);

    if (options.persistent) {
        toast.setAttribute('role', 'alert');
        toast.prepend(createIcon('cancel', { className: 'toast-error-icon' }));
        const close = document.createElement('button');
        close.type = 'button';
        close.className = 'btn btn--icon btn--size-toolbar-xs';
        close.setAttribute(
            'aria-label',
            options.glossary.getRequiredEntryText('general.buttons.element_texts.close.label'),
        );
        close.append(createIcon('close'));
        close.addEventListener('click', () => dismiss(toast));
        toast.appendChild(close);
    } else {
        setTimeout(() => dismiss(toast), TRANSIENT_LIFETIME_MS);
    }

    // Raised first: a toast added to a shown live region is announced, one shown
    // together with the region may not be.
    raise(host);
    host.appendChild(toast);
}

/**
 * Report a failure the reader can act on only by knowing it happened. Logs the
 * exception for the developer and shows the glossary sentence to the reader.
 * @param {GlossaryAnnotator} glossary - The app's glossary, which words the sentence.
 * @param {string} glossaryPath - The `general.messages.*` entry to show.
 * @param {string} context - Console prefix naming the caller.
 * @param {unknown} error
 */
export function notifyFailure(glossary, glossaryPath, context, error) {
    console.error(`${context}:`, error);
    notify(glossary.getRequiredEntryText(glossaryPath), { persistent: true, glossary });
}

/**
 * Route the errors nothing else caught into the same channel, until the returned
 * disposer is called.
 * @param {GlossaryAnnotator} glossary - The app's glossary, which words the report.
 * @returns {() => void} Removes the listeners again.
 */
export function installGlobalErrorNotifications(glossary) {
    // The live region exists, shown and empty, before the first message: one created
    // together with its first toast may not be announced.
    raise(ensureRegion());
    const listeners = new AbortController();
    const { signal } = listeners;
    const report = (/** @type {unknown} */ error) =>
        notifyFailure(glossary, 'general.messages.unexpected-error', 'Uncaught', error);
    window.addEventListener('unhandledrejection', (event) => report(event.reason), { signal });
    window.addEventListener(
        'error',
        (event) => {
            // An ErrorEvent carrying no Error object is the browser reporting itself
            // ("ResizeObserver loop completed with undelivered notifications", a
            // cross-origin "Script error."); it stays in the console.
            if (!event.error) return;
            report(event.error);
        },
        { signal },
    );
    return () => listeners.abort();
}
