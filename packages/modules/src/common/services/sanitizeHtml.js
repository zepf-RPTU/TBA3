/**
 * Where HTML from outside the repo is cleaned; nothing else imports DOMPurify.
 */

import DOMPurify from 'dompurify';

/**
 * Strip everything from `html` that the profile does not allow. `data-*` always goes,
 * which DOMPurify keeps by default: a trusted write applies `data-css-vars`, and
 * `data-glossary-key` turns text into a term.
 * @param {string} html - Markup of unknown origin.
 * @param {import('dompurify').Config} [config] - DOMPurify's profile; omitted, its default (no scripts, no handlers).
 * @returns {string} The cleaned markup.
 */
export function sanitizeHtml(html, config) {
    return /** @type {string} */ (DOMPurify.sanitize(html, { ...config, ALLOW_DATA_ATTR: false }));
}
