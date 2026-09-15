/**
 * Notifications after bootstrap: a body-level toast region that replaces `alert()`.
 *
 * The bootstrap `try` owns failures before `init()` resolves (an inline
 * `role="alert"` in the app container). Everything after it — an export that
 * failed, a view that could not be shown, a promise nobody caught — reaches the
 * user through here, in the glossary's words, never the exception's: that stays
 * in the console, where the callers log it.
 *
 * Two shapes. A *transient* toast confirms or informs and leaves on its own; a
 * *persistent* one reports lost work and stays until closed, so it announces as
 * `role="alert"` and carries a close button. Both are plain text: `textContent`,
 * never markup.
 *
 * The region is skipped by `modalFocus.js` when it makes the page inert, so a
 * failure raised while a dialog is open is still announced and still closable.
 */

import { iconSvg } from '@tba3/module-base';
import { glossaryAnnotator } from '@tba3/modules/glossary';
import './notificationService.css';

/** How long a transient toast stays, in ms. */
const TRANSIENT_MS = 6000;
/** Matches the leave transition in notificationService.css. */
const LEAVE_MS = 200;

export const NOTIFICATION_REGION_CLASS = 'toast-region';

/** @type {HTMLElement|null} */
let region = null;

/**
 * The single toast region, appended on first use.
 * @returns {HTMLElement} The region.
 */
function ensureRegion() {
    if (region?.isConnected) return region;
    region = document.createElement('div');
    region.className = NOTIFICATION_REGION_CLASS;
    region.setAttribute('role', 'status');
    region.setAttribute('aria-live', 'polite');
    document.body.appendChild(region);
    return region;
}

/**
 * Take a toast out: fade, then remove.
 * @param {HTMLElement} toast - The toast element.
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
 * @param {{ persistent?: boolean }} [options] - `persistent` keeps the toast until the reader closes it and announces it assertively.
 * @returns {HTMLElement} The toast element.
 */
export function notify(text, { persistent = false } = {}) {
    const host = ensureRegion();

    // One repeated failure is one message. A resize drag can raise the same
    // failure dozens of times; a persistent toast per occurrence would bury the
    // page under alerts the reader has to close one by one.
    if (persistent) {
        const standing = findStandingToast(host, text);
        if (standing) return standing;
    }

    const toast = document.createElement('div');
    toast.className = persistent ? 'toast toast--persistent' : 'toast';

    const message = document.createElement('span');
    message.className = 'toast-text';
    message.textContent = text;
    toast.appendChild(message);

    if (persistent) {
        toast.setAttribute('role', 'alert');
        const close = document.createElement('button');
        close.type = 'button';
        close.className = 'btn btn--icon btn--size-toolbar-xs toast-close';
        close.setAttribute(
            'aria-label',
            glossaryAnnotator.getRequiredEntryText('general.buttons.element_texts.close.label'),
        );
        close.innerHTML = iconSvg('close');
        close.addEventListener('click', () => dismiss(toast));
        toast.appendChild(close);
    } else {
        setTimeout(() => dismiss(toast), TRANSIENT_MS);
    }

    host.appendChild(toast);
    return toast;
}

/**
 * Report a failure the reader can act on only by knowing it happened. Logs the
 * exception for the developer and shows the glossary sentence to the reader.
 * @param {string} glossaryPath - The `general.messages.*` entry to show.
 * @param {string} context - Console prefix naming the caller.
 * @param {unknown} error - The exception.
 */
export function notifyFailure(glossaryPath, context, error) {
    console.error(`${context}:`, error);
    notify(glossaryAnnotator.getRequiredEntryText(glossaryPath), { persistent: true });
}

/**
 * Route the errors nothing else caught into the same channel. Installed once by
 * the bootstrap after `init()` succeeded; before that the bootstrap's own `try`
 * owns the page.
 */
export function installGlobalErrorNotifications() {
    const report = (/** @type {unknown} */ error) =>
        notifyFailure('general.messages.unexpected-error', 'Uncaught', error);
    window.addEventListener('unhandledrejection', (event) => report(event.reason));
    window.addEventListener('error', (event) => {
        // An ErrorEvent carrying no Error object is the browser reporting itself,
        // not an application failure: "ResizeObserver loop completed with
        // undelivered notifications" during a window drag, a cross-origin
        // "Script error.". Neither is something the reader can act on, so it
        // stays in the console.
        if (!event.error) return;
        report(event.error);
    });
}
