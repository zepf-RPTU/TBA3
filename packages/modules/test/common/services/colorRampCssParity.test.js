import { readFileSync } from 'node:fs';
import { lab } from 'd3-color';
import { describe, expect, it } from 'vitest';
import { SURFACES, getRampStops } from '../../../src/common/services/colorRamp.js';

// The palette resolves without a document (Node, first paint), so these literals
// live in JS, while the page paints the same surfaces and grayscale steps from CSS.
// Every contrast decision is made against SURFACES, so a surface changed in only one
// place would validate the ramps against a colour nobody sees.

const root = new URL('../../../../../', import.meta.url);
const read = (/** @type {string} */ path) => readFileSync(new URL(path, root), 'utf8');

/**
 * The declarations of every rule whose selector list holds `selector`, in source order.
 * @param {string} css
 * @param {string} selector - One selector of the rules' lists.
 * @returns {Record<string, string>} Custom property → value.
 */
function declarationsOf(css, selector) {
    const bodies = [...css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)]
        .filter(([, selectors]) => selectors.split(',').some((each) => each.trim() === selector))
        .map(([, , body]) => body);
    expect(bodies.length, selector).toBeGreaterThan(0);
    return Object.fromEntries(
        bodies.flatMap((body) =>
            [...body.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map(([, name, value]) => [
                name,
                value.trim(),
            ]),
        ),
    );
}

/**
 * A declared value as one scheme paints it: an argument of `light-dark(<light>, <dark>)`,
 * split at its top-level comma, or the value itself where both schemes share it.
 * @param {string} value
 * @param {'light'|'dark'} scheme
 * @returns {string}
 */
function inScheme(value, scheme) {
    const inner = /^light-dark\(([\s\S]*)\)$/.exec(value)?.[1];
    if (!inner) return value;
    let depth = 0;
    for (let i = 0; i < inner.length; i++) {
        if (inner[i] === '(') depth++;
        else if (inner[i] === ')') depth--;
        else if (inner[i] === ',' && depth === 0) {
            return (scheme === 'light' ? inner.slice(0, i) : inner.slice(i + 1)).trim();
        }
    }
    throw new Error(`"${value}" has no top-level comma`);
}

const baseTokens = declarationsOf(read('packages/module-base/src/styles/tokens.css'), ':root');

describe('colour literals shared with the stylesheets', () => {
    it('SURFACES is --color-card-background of each scheme', () => {
        for (const scheme of /** @type {const} */ (['light', 'dark'])) {
            expect(inScheme(baseTokens['--color-card-background'], scheme)).toBe(SURFACES[scheme]);
        }
    });

    it('the grayscale ramp is --gray-1…5 of each scheme', () => {
        const grays = declarationsOf(
            read('packages/modules/styles/competence-levels.css'),
            "html[data-competence-level-theme='grayscale']",
        );
        for (const scheme of /** @type {const} */ (['light', 'dark'])) {
            expect(
                [1, 2, 3, 4, 5].map((step) => inScheme(grays[`--gray-${step}`], scheme)),
            ).toEqual([...getRampStops('grayscale', scheme)]);
        }
    });
});

// Shadows barely show on dark, so lightness carries elevation: dark mirrors light's
// ladder rather than inverting it.
describe('the surface ladder', () => {
    const lightness = (/** @type {string} */ color) => lab(color).l;
    const pages = [
        declarationsOf(read('src/styles/foundation/variables.css'), ':root'),
        declarationsOf(read('src/sl/variables.css'), ':root'),
    ].map((block) => block['--color-background-page']);
    /**
     * @param {'light'|'dark'} scheme
     * @returns {number[]} The lightness of the card, hover, secondary and muted surfaces.
     */
    const steps = (scheme) =>
        [
            '--color-card-background',
            '--color-background-hover',
            '--color-background-secondary',
            '--color-background-muted',
        ].map((name) => lightness(inScheme(baseTokens[name], scheme)));

    it('card = table body in both schemes', () => {
        expect(baseTokens['--color-background']).toBe('var(--color-card-background)');
    });

    it('light: hover, secondary and muted step darker than the card; every page sits below it', () => {
        const ladder = steps('light');
        ladder.slice(1).forEach((step, i) => expect(step).toBeLessThan(ladder[i]));
        for (const page of pages)
            expect(lightness(inScheme(page, 'light'))).toBeLessThan(ladder[0]);
    });

    it('dark: every page is darkest, then hover, secondary and muted step lighter than the card', () => {
        const ladder = steps('dark');
        ladder.slice(1).forEach((step, i) => expect(step).toBeGreaterThan(ladder[i]));
        for (const page of pages) expect(lightness(inScheme(page, 'dark'))).toBeLessThan(ladder[0]);
    });
});
