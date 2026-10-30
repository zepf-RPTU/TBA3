// @vitest-browser

import { afterEach, describe, expect, it } from 'vitest';

import '@tba3/module-base/styles/tokens.css';
import '../../../styles/tokens.css';
import { inkToken, shadeToken } from '../../../src/common/services/paletteTokens.js';

// A palette token is one light-dark() pair, so a subtree painting in one scheme (paper
// under a dark page) resolves it without a publish of its own. That holds only if every
// computed token is computed for both schemes, from the stylesheet tokens each scheme
// paints, which a light-dark() value only yields where it is painted.

/** @type {HTMLElement[]} */
const cleanup = [];

afterEach(() => {
    cleanup.splice(0).forEach((node) => node.remove());
    delete document.documentElement.dataset.colorScheme;
    // The tokens paletteToken wrote onto the page.
    document.documentElement.removeAttribute('style');
});

describe('palette tokens across colour schemes', () => {
    it('resolves a stylesheet token in either scheme, whatever the page shows', () => {
        document.documentElement.dataset.colorScheme = 'dark';
        const style = document.documentElement.style;

        // A zero step leaves the shade at its base, so the token shows what each scheme resolved.
        const shade = shadeToken('var(--default-bar-color)', 1, 0);
        expect(style.getPropertyValue(shade.slice(4, -1))).toBe('light-dark(#cccccc, #555e6d)');
        const undeclared = shadeToken('var(--not-declared)', 1, 0);
        expect(style.getPropertyValue(undeclared.slice(4, -1))).toBe('');
    });

    it('publishes a computed token as one light-dark() pair that an element resolves by its scheme', () => {
        const ink = inkToken('var(--default-bar-color)');
        const paper = document.createElement('i');
        paper.dataset.colorScheme = 'light';
        paper.style.color = ink;
        document.body.append(paper);
        cleanup.push(paper);
        document.documentElement.dataset.colorScheme = 'dark';

        // Light grey takes dark ink; the dark scheme's slate bar takes white.
        expect(document.documentElement.style.getPropertyValue(ink.slice(4, -1))).toBe(
            'light-dark(#111827, #ffffff)',
        );
        expect(getComputedStyle(paper).color).toBe('rgb(17, 24, 39)');
        const screen = document.createElement('i');
        screen.dataset.colorScheme = 'dark';
        screen.style.color = ink;
        document.body.append(screen);
        cleanup.push(screen);
        expect(getComputedStyle(screen).color).toBe('rgb(255, 255, 255)');
    });
});
