/**
 * The page's Trusted Types `default` policy: what the browser does with an HTML string
 * that reaches a sink without being `TrustedHTML`.
 *
 * Our own code never gets here — it renders lit-html templates (lit's own `lit-html`
 * policy) or writes through `trusted()` / `setTrustedHTML` / `trustedFragment`
 * (module-base), which the `tba3/no-raw-html-sink` lint rule enforces; our Tabulator
 * formatters hand back nodes (columnDefinitionProcessor.js). What does are the libraries
 * that write `innerHTML` themselves: Tabulator (its built-in formatters), Quill (toolbar icons),
 * html-to-image and jsPDF. Their strings are sanitized with DOMPurify's default profile
 * rather than rejected, so they keep working under `require-trusted-types-for 'script'`
 * without being trusted blindly. Script sinks get no rule here and stay blocked.
 */

import { sanitizeHtml } from '@tba3/modules/sanitize';

/**
 * Create the `default` policy where the browser has Trusted Types, unless the page
 * already has one (a page holds at most one, and the unit suite bootstraps more than
 * once per page). Must run before any library writes HTML.
 */
export function installDefaultTrustedTypesPolicy() {
    const factory = globalThis.trustedTypes;
    if (!factory || factory.defaultPolicy) return;
    factory.createPolicy('default', { createHTML: (html) => sanitizeHtml(html) });
}
