/**
 * DOM helpers for views and modules: element construction, typed queries, event tests
 * and the notice callout.
 */

import { html, nothing } from 'lit';
import { renderIcon } from './icons.js';

/** Every element that takes keyboard focus on its own, as a selector. */
export const FOCUSABLE =
    'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * @param {string} tagName
 * @param {object} [options] - Properties to assign after creation; anything omitted is left untouched.
 * @param {string|Array<string|undefined>} [options.className] - One class, or several to add; empty entries are skipped.
 * @param {string} [options.textContent] - Text content, set before any children are appended.
 * @param {{[name: string]: string|null|undefined}} [options.attributes] - Attributes to set, by name; nullish values are skipped.
 * @param {{[key: string]: string|null|undefined}} [options.dataset] - `data-*` values to set, by key; nullish values are skipped.
 * @param {Array<Node|null|undefined>} [children] - Children to append; nullish entries are skipped.
 * @returns {HTMLElement}
 */
export function createElement(tagName, options = {}, children = []) {
    const element = document.createElement(tagName);
    const { className, textContent, attributes, dataset } = options;

    if (Array.isArray(className)) {
        element.className = className.filter(Boolean).join(' ');
    } else if (className) {
        element.className = className;
    }
    if (textContent !== undefined) element.textContent = textContent;

    if (attributes) {
        Object.entries(attributes).forEach(([name, value]) => {
            if (value !== undefined && value !== null) element.setAttribute(name, String(value));
        });
    }

    if (dataset) {
        Object.entries(dataset).forEach(([name, value]) => {
            if (value !== undefined && value !== null) element.dataset[name] = String(value);
        });
    }

    element.append(...children.filter((child) => child instanceof Node));
    return element;
}

/**
 * Query a single element as an HTMLElement. Centralizes the
 * `querySelector(...)` → HTMLElement cast so call sites don't repeat it.
 * @param {Element|Document|null} root - A nullish root yields null.
 * @param {string} selector
 * @returns {HTMLElement|null}
 */
export function queryEl(root, selector) {
    return /** @type {HTMLElement|null} */ (root?.querySelector(selector) ?? null);
}

/**
 * Query an element the caller's own markup guarantees, typed as the caller declares it.
 * @template {Element} [T=HTMLElement]
 * @param {ParentNode} root
 * @param {string} selector
 * @returns {T}
 * @throws {Error} when nothing matches, so a markup change fails where it happens
 */
export function requireEl(root, selector) {
    const element = root.querySelector(selector);
    if (!element) throw new Error(`No element matches ${selector}`);
    return /** @type {T} */ (element);
}

/**
 * Whether a key activates a button-like control: Enter or Space, as a native button
 * does. A caller on a non-button element still calls `preventDefault()` itself, so
 * Space does not scroll the page.
 * @param {KeyboardEvent} event
 * @returns {boolean}
 */
export function isActivationKey(event) {
    return event.key === 'Enter' || event.key === ' ';
}

/**
 * Whether a click on an in-app link carries a modifier key: that click is the
 * browser's (a new tab or window), a plain one navigates through the app.
 * @param {MouseEvent} event
 * @returns {boolean}
 */
export function isModifiedClick(event) {
    return event.ctrlKey || event.metaKey || event.shiftKey || event.altKey;
}

/**
 * Whether an event travelled through an element matching `selector` below `boundary`.
 * Reads the composed path rather than `event.target.closest(...)`: a handler that
 * rebuilds its DOM on click (a menu row replaced on toggle) detaches the target before
 * the event reaches later listeners, and `closest()` on a detached node finds nothing.
 * @param {Event} event
 * @param {string} selector - What to look for on the nodes in the path.
 * @param {EventTarget|null} boundary - Where the search stops, itself not tested: the listener's element.
 * @returns {boolean}
 */
export function eventPathMatches(event, selector, boundary) {
    for (const node of event.composedPath()) {
        if (node === boundary) return false;
        if (node instanceof Element && node.matches(selector)) return true;
    }
    return false;
}

/**
 * The notice callout — a warning icon beside a bold message, for placeholder and
 * in-progress states. Its look is styles/notice-callout.css, which the host imports.
 * @param {object} spec
 * @param {string} spec.message - The message, as plain text.
 * @param {import('lit').TemplateResult|typeof nothing} [spec.detail] - Further lines under the message.
 * @param {string} [spec.ariaLabel] - Names the region.
 * @param {'note'|'status'|'alert'} [spec.role] - `status` announces a notice that appears later; `alert` one that reports a failure, which also paints it as one (`--color-error`, a cancel glyph).
 * @param {string} [spec.className] - An owner class beside `notice-callout`, for the owner's placement rules.
 * @returns {import('lit').TemplateResult}
 */
export function noticeCallout({ message, detail = nothing, ariaLabel, role = 'note', className }) {
    return html`<div
        class=${className ? `${className} notice-callout` : 'notice-callout'}
        role=${role}
        aria-label=${ariaLabel || nothing}
    >
        <span class="notice-callout-icon" aria-hidden="true"
            >${renderIcon(role === 'alert' ? 'cancel' : 'warning')}</span
        >
        <div class="notice-callout-copy layout-stack">
            <p class="notice-callout-message">${message}</p>
            ${detail}
        </div>
    </div>`;
}
