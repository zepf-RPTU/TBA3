/**
 * The one way code writes an HTML string into the document.
 *
 * Every write goes through here, so each one is a call a reviewer can find, and the
 * `tba3/no-raw-html-sink` lint rule forbids the raw `innerHTML` / `insertAdjacentHTML`
 * forms. Where the page enforces Trusted Types (`require-trusted-types-for 'script'` in
 * the CSP), the browser enforces it too: a string reaches an HTML sink only as the
 * `TrustedHTML` this module's `tba3` policy makes. Strings a library writes on its own
 * go through the page's `default` policy instead, which sanitizes them.
 *
 * Nothing here cleans the markup. The caller vouches for it: every interpolated value
 * escaped with `escapeHtml`, and anything that is meant to stay HTML either bundled
 * with the app or sanitized where it entered.
 *
 * The CSP allows no `style` attribute either, so a value computed at run time rides in
 * the markup as `cssVarsAttr()` and every write here sets it through CSSOM once the
 * markup is parsed. Only custom properties: the stylesheet decides what they paint.
 */

import { escapeHtml } from './escapeHtml.js';

/**
 * The policy, or null where the browser has no Trusted Types and a plain string is
 * what the sinks take.
 */
const policy =
    globalThis.trustedTypes?.createPolicy('tba3', { createHTML: (html) => html }) ?? null;

/**
 * @param {string} html - Markup the caller vouches for.
 * @returns {any} A `TrustedHTML` where the browser has Trusted Types, else the string.
 */
function trusted(html) {
    return policy ? policy.createHTML(html) : html;
}

/**
 * The attribute that carries custom properties through markup built as text.
 * @param {Record<string, string | number>} vars - Custom property name (`--…`) to value.
 * @returns {string} ` data-css-vars="…"`, ready to append to an opening tag.
 */
export function cssVarsAttr(vars) {
    const declarations = Object.entries(vars).map(([name, value]) => `${name}:${value}`);
    return ` data-css-vars="${escapeHtml(declarations.join(';'))}"`;
}

/**
 * Set the custom properties `cssVarsAttr` stamped on every element under `root`.
 * @param {ParentNode} root - Where markup was just parsed.
 * @param {string} html - The markup; without the attribute there is nothing to search for.
 */
function applyCssVars(root, html) {
    if (!html.includes('data-css-vars')) return;
    for (const element of root.querySelectorAll('[data-css-vars]')) {
        const { style, dataset } = /** @type {HTMLElement} */ (element);
        for (const declaration of (dataset.cssVars ?? '').split(';')) {
            const colon = declaration.indexOf(':');
            const name = declaration.slice(0, colon);
            if (name.startsWith('--')) style.setProperty(name, declaration.slice(colon + 1));
        }
    }
}

/**
 * Replace an element's content with markup.
 * @param {Element} element
 * @param {string} html - Markup the caller vouches for: escaped values, trusted sources.
 */
export function setTrustedHTML(element, html) {
    element.innerHTML = trusted(html);
    applyCssVars(element, html);
}

/**
 * Parse markup into a detached fragment, for an API that takes a node rather than a
 * string — Tabulator cell formatters, a `replaceChildren`.
 * @param {string} html - Markup the caller vouches for: escaped values, trusted sources.
 * @returns {DocumentFragment} The parsed content, custom properties set.
 */
export function trustedFragment(html) {
    const template = document.createElement('template');
    template.innerHTML = trusted(html);
    applyCssVars(template.content, html);
    return template.content;
}
