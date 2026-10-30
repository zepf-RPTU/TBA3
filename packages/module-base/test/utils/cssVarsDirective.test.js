// @vitest-browser

import { html, render } from 'lit';
import { describe, expect, it } from 'vitest';

import { cssVars } from '../../index.js';

// The CSP blocks every `style` attribute, so a custom property a template binds has to
// arrive through CSSOM on the first render already — where lit's styleMap writes one.

describe('cssVars()', () => {
    it('sets custom properties, and drops one no longer named', () => {
        const host = document.createElement('div');
        const view = (/** @type {{[name: string]: string|null}} */ vars) =>
            html`<p ${cssVars(vars)}></p>`;

        render(view({ '--a': '1', '--b': '2' }), host);
        const p = /** @type {HTMLElement} */ (host.querySelector('p'));
        expect(p.style.getPropertyValue('--a')).toBe('1');

        render(view({ '--a': '3', '--b': null }), host);
        expect(p.style.getPropertyValue('--a')).toBe('3');
        expect(p.style.getPropertyValue('--b')).toBe('');
    });

    it('refuses a property that is not a custom one', () => {
        const host = document.createElement('div');
        expect(() => render(html`<p ${cssVars({ color: 'red' })}></p>`, host)).toThrow(
            'cssVars() sets custom properties, not color',
        );
    });
});
