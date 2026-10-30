// @vitest-browser
/**
 * The markup a chart tooltip is built from: structured text in, escaped rows out.
 */

import { describe, expect, it } from 'vitest';

import { cursorTooltip } from '../../../src/common/services/cursorTooltip.js';
import { MISSING_VALUE } from '../../../src/common/utils/numberFormat.js';
import { setTrustedHTML } from '@tba3/module-base';
import { createTestContext } from '../../support/glossaryFixture.js';

/**
 * @param {import('../../../src/common/services/cursorTooltip.js').TooltipContent} content
 * @returns {HTMLDivElement} The rendered tooltip body.
 */
function render(content) {
    const host = document.createElement('div');
    host.innerHTML = cursorTooltip.buildHTML(content);
    return host;
}

/**
 * @param {Element} host - A rendered tooltip body, or its divider.
 * @returns {string[][]} Each row's label and value text.
 */
const rowTexts = (host) =>
    [...host.querySelectorAll(':scope > .tooltip-row')].map((row) => [
        row.querySelector('.label')?.textContent ?? '',
        row.querySelector('.value')?.textContent ?? '',
    ]);

describe('cursorTooltip.buildHTML', () => {
    it('prints names as text, never as markup', () => {
        // Group and student names come from the payload; a name holding `<img
        // onerror>` would otherwise run in the page.
        const host = render({
            title: '<img src=x onerror=alert(1)>',
            subtitle: 'A & B',
            rows: [{ label: '<b>8a</b>', value: '<i>12</i>' }],
        });

        expect(host.querySelector('img, b, i')).toBeNull();
        expect(host.querySelector('.tooltip-title')?.textContent).toBe(
            '<img src=x onerror=alert(1)>',
        );
        expect(host.querySelector('.tooltip-subtitle')?.textContent).toBe('A & B');
        expect(rowTexts(host)).toEqual([['<b>8a</b>:', '<i>12</i>']]);
    });

    it('prints the missing-value dash for a row without a value', () => {
        const host = render({
            rows: [
                { label: 'A', value: null },
                { label: 'B', value: undefined },
                { label: 'C', value: '' },
                { label: 'D', value: 0 },
            ],
        });

        expect(rowTexts(host)).toEqual([
            ['A:', MISSING_VALUE],
            ['B:', MISSING_VALUE],
            ['C:', MISSING_VALUE],
            ['D:', '0'],
        ]);
    });

    it('skips a falsy row, so a conditional row reads `condition && row`', () => {
        const host = render({
            rows: [false, { label: 'A', value: '1' }, null, undefined],
        });

        expect(rowTexts(host)).toEqual([['A:', '1']]);
    });

    it('draws footer rows under the divider, and no divider without them', () => {
        const withFooter = render({
            rows: [{ label: 'A', value: '1' }],
            footer: [{ label: 'Mittelwert', value: '3,40' }],
        });
        const divider = withFooter.querySelector('.tooltip-divider');

        expect(rowTexts(withFooter)).toEqual([['A:', '1']]);
        expect(divider && rowTexts(divider)).toEqual([['Mittelwert:', '3,40']]);
        expect(render({ footer: [false] }).querySelector('.tooltip-divider')).toBeNull();
    });
});

describe('cursorTooltip.toPlainText', () => {
    // The text is a chart mark's accessible name, so a screen reader hears what a
    // sighted reader sees in the tooltip — rows in order, the gap as the dash.
    it('reads title, subtitle, rows and footer as one text', () => {
        const text = cursorTooltip.toPlainText({
            title: '8a',
            subtitle: 'Klasse',
            rows: [{ label: 'Anteil', value: '36,0 %' }, false, { label: 'Anzahl', value: null }],
            footer: [{ label: 'Mittelwert', value: '3,40' }],
        });

        expect(text).toBe(`8a. Klasse. Anteil: 36,0 %. Anzahl: ${MISSING_VALUE}. Mittelwert: 3,40`);
    });

    it('leaves out the parts the content lacks', () => {
        expect(cursorTooltip.toPlainText({ rows: [{ label: 'A', value: 1 }] })).toBe('A: 1');
        expect(cursorTooltip.toPlainText({})).toBe('');
    });
});

describe('cursorTooltip row keys', () => {
    it('draws a row key as the marker it names, painted without a style attribute', () => {
        // Several Landesschnitte share a hue and differ by shape and fill, so the
        // key matches a tooltip row to its marker. The CSP forbids style attributes, so
        // the paint goes in as custom properties.
        cursorTooltip.show(document.body, {
            rows: [
                {
                    label: 'Landesschnitt',
                    value: '50 %',
                    key: {
                        symbol: 'triangle',
                        paint: {
                            fill: 'red',
                            stroke: 'blue',
                            strokeWidth: 2,
                            dotFill: 'green',
                        },
                    },
                },
                { label: 'Lerngruppe', value: '40 %' },
            ],
        });
        const tooltip = /** @type {HTMLElement} */ (document.getElementById('cursor-tooltip'));
        const [keyed, plain] = tooltip.querySelectorAll('.tooltip-row');
        const key = /** @type {SVGSVGElement} */ (keyed.querySelector('.tooltip-key'));

        expect(key.querySelector('path')?.getAttribute('d')).toMatch(/^M/);
        expect(key.querySelector('.tooltip-key-dot')).not.toBeNull();
        expect(key.style.getPropertyValue('--tooltip-key-fill')).toBe('red');
        expect(plain.querySelector('.tooltip-key')).toBeNull();
        cursorTooltip.hide();
    });

    it('keeps a row key in the markup a delegated tooltip annotates', () => {
        // One renderer serves both tooltip paths; the delegated one runs the markup
        // through the glossary annotator, which must not strip the key or its paint.
        const content = {
            rows: [
                {
                    label: 'Landesschnitt',
                    value: '50 %',
                    key: {
                        symbol: 'circle',
                        paint: { fill: 'red', stroke: 'blue', strokeWidth: 1 },
                    },
                },
            ],
        };
        const annotated = createTestContext().glossary.annotateHTML(
            cursorTooltip.buildHTML(content),
        );
        const host = document.createElement('div');
        setTrustedHTML(host, annotated);

        const key = /** @type {SVGSVGElement} */ (host.querySelector('.tooltip-key'));
        expect(key.querySelector('path')?.getAttribute('d')).toMatch(/^M/);
        expect(key.style.getPropertyValue('--tooltip-key-fill')).toBe('red');
    });
});
