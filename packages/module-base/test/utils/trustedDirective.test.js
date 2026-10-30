// @vitest-browser

import { html, render } from 'lit';
import { describe, expect, it } from 'vitest';

import { cssVarsAttr, trusted } from '../../index.js';

describe('trusted()', () => {
    it('renders vouched-for markup as elements, with its custom properties set', () => {
        const host = document.createElement('div');
        render(html`<p>${trusted(`<b${cssVarsAttr({ '--band': 'red' })}>bold</b>`)}</p>`, host);

        const bold = /** @type {HTMLElement} */ (host.querySelector('p > b'));
        expect(bold.textContent).toBe('bold');
        expect(bold.style.getPropertyValue('--band')).toBe('red');
    });

    it('keeps the nodes when a re-render passes the same markup, and swaps them for new markup', () => {
        const host = document.createElement('div');
        const view = (/** @type {string} */ markup) => html`<p>${trusted(markup)}</p>`;
        render(view('<i>a</i>'), host);
        const first = host.querySelector('i');

        render(view('<i>a</i>'), host);
        expect(host.querySelector('i')).toBe(first);

        render(view('<i>b</i>'), host);
        expect(host.querySelector('i')?.textContent).toBe('b');
    });

    it('renders nothing for null', () => {
        const host = document.createElement('div');
        render(html`<p>${trusted(null)}</p>`, host);
        expect(host.querySelector('p')?.children).toHaveLength(0);
    });

    it('refuses an attribute position', () => {
        const host = document.createElement('div');
        expect(() => render(html`<p title=${trusted('<b>x</b>')}></p>`, host)).toThrow(
            'trusted() renders element content, not an attribute value',
        );
    });
});
