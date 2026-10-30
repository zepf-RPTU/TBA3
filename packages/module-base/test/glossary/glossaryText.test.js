import { describe, expect, it } from 'vitest';
import {
    applyMarkupTokens,
    applyTemplateTokens,
    glossaryTermAttrs,
    stampGlossaryTermTabStop,
} from '../../src/glossary/glossaryText.js';

describe('glossaryTermAttrs', () => {
    it('escapes the key in the term markup and puts own classes first', () => {
        expect(glossaryTermAttrs('a"b', 'cell')).toBe(
            'class="cell glossary-term" data-glossary-key="a&quot;b" role="button" tabindex="0" aria-expanded="false"',
        );
    });

    it('makes a term a tab stop unless it sits inside a control', () => {
        // Focus is the keyboard's only way to a term's popup, and a second tab stop
        // inside a sortable header would sort the column on Enter instead.
        expect(glossaryTermAttrs('k')).toContain('tabindex="0"');
        expect(glossaryTermAttrs('k', '', { focusable: false })).not.toContain('tabindex');
    });
});

describe('template tokens with text runs', () => {
    const RUNS = [{ text: 'Englisch: ' }, { text: 'Lesen & Co', glossaryKey: 'lesen' }];

    it('joins the runs into the text a title or an export name shows', () => {
        expect(applyTemplateTokens('{{Bereich}}', { Bereich: RUNS })).toBe('Englisch: Lesen & Co');
    });

    it('marks up a keyed run as the term of its entry and escapes every run', () => {
        expect(applyMarkupTokens('<b>{{Bereich}}</b>', { Bereich: RUNS })).toBe(
            `<b>Englisch: <span ${glossaryTermAttrs('lesen')}>Lesen &amp; Co</span></b>`,
        );
    });

    it('escapes a plain text value', () => {
        expect(applyMarkupTokens('{{X}}', { X: '<i>' })).toBe('&lt;i&gt;');
    });
});

describe('stampGlossaryTermTabStop', () => {
    /** @returns {Element & {attrs: Record<string, string>}} An element that records its attributes. */
    const fakeTerm = () => {
        /** @type {Record<string, string>} */
        const attrs = {};
        return /** @type {any} */ ({
            attrs,
            setAttribute: (/** @type {string} */ name, /** @type {string} */ value) => {
                attrs[name] = value;
            },
        });
    };

    it('makes a rendered term the button its markup would be, a tab stop by default', () => {
        const term = fakeTerm();
        stampGlossaryTermTabStop(term);
        expect(term.attrs).toEqual({ role: 'button', tabindex: '0', 'aria-expanded': 'false' });
    });

    it('leaves a term its owner focuses by script out of the tab order', () => {
        const term = fakeTerm();
        stampGlossaryTermTabStop(term, '-1');
        expect(term.attrs.tabindex).toBe('-1');
        expect(term.attrs.role).toBe('button');
    });
});
