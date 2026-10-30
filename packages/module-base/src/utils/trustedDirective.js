/**
 * `trusted(html)`: the one way a lit-html template renders an HTML string as markup.
 *
 * Interpolating a string into `html\`…\`` renders it as text, so markup that is meant
 * to stay markup (glossary-decorated copy, an icon's `<svg>`, sanitized API text) goes
 * through here. The trust contract is `setTrustedHTML`'s. The string is parsed by
 * `trustedFragment`, so it passes the page's `tba3` policy and its `cssVarsAttr` custom
 * properties are set.
 *
 * lit's own `unsafeHTML`/`unsafeSVG` are barred by `tba3/no-raw-html-sink`: they would
 * hand any string to the `lit-html` policy, a second sink nobody reviews.
 */

import { noChange, nothing } from 'lit';
import { Directive, PartType, directive } from 'lit/directive.js';

import { trustedFragment } from './trustedHtml.js';

/** @augments Directive */
class TrustedDirective extends Directive {
    /** @type {string|null} The markup on screen, so a re-render with the same string patches nothing. */
    #markup = null;

    /** @param {import('lit/directive.js').PartInfo} partInfo */
    constructor(partInfo) {
        super(partInfo);
        if (partInfo.type !== PartType.CHILD) {
            throw new Error('trusted() renders element content, not an attribute value');
        }
    }

    /**
     * @param {string | null | undefined} html - Markup the caller vouches for; null or undefined renders nothing.
     * @returns {DocumentFragment | typeof nothing | typeof noChange} The parsed markup, or lit's sentinel.
     */
    render(html) {
        if (html == null) {
            this.#markup = null;
            return nothing;
        }
        if (html === this.#markup) return noChange;
        this.#markup = html;
        return trustedFragment(html);
    }
}

/**
 * Render markup inside a lit-html template, in element content: `html\`<p>${trusted(copy)}</p>\``.
 * HTML parsing context only — a fragment inside an `svg\`…\`` template parses as HTML elements.
 */
export const trusted = directive(TrustedDirective);
