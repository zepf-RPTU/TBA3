// @vitest-browser
import { describe, expect, it, vi } from 'vitest';
import { measureTexts } from '../../../../../src/common/charts/renderers/internal/chartTextMeasurement.js';
import '../../../../../src/common/charts/renderers/chartRenderer.css';

/** @type {import('../../../../../src/common/charts/renderers/internal/chartTextMeasurement.js').MeasureFont} */
const FONT = {
    fontSizePx: 13,
    fontFamily: 'sans-serif',
    fontWeight: null,
    rotationDeg: 0,
};

describe('measureTexts', () => {
    it('measures a string once per font for the page, and again at another size', () => {
        // Every chart re-measures its labels on each resize; a miss is a forced
        // layout, and the boxes do not depend on which chart asks.
        const getBBox = vi.spyOn(SVGGraphicsElement.prototype, 'getBBox');

        const [first] = measureTexts(['Leseverstehen (cache)'], FONT);
        expect(first?.width).toBeGreaterThan(0);
        const calls = getBBox.mock.calls.length;

        expect(measureTexts(['Leseverstehen (cache)'], FONT)).toEqual([first]);
        expect(getBBox.mock.calls.length).toBe(calls);

        const [larger] = measureTexts(['Leseverstehen (cache)'], { ...FONT, fontSizePx: 26 });
        expect(getBBox.mock.calls.length).toBe(calls + 1);
        expect(larger?.width).toBeGreaterThan(/** @type {{width: number}} */ (first).width);
    });

    it('measures again in a new offscreen SVG once the old one left the document', () => {
        // A detached SVG measures every box as 0×0, which would lay a chart out
        // with no room for its labels.
        measureTexts(['Hörverstehen (detach)'], FONT);
        const svg = /** @type {SVGSVGElement} */ (document.body.querySelector(':scope > svg'));
        svg.remove();

        const [box] = measureTexts(['Global (detach)'], FONT);

        expect(box?.width).toBeGreaterThan(0);
        expect(document.body.querySelector(':scope > svg')).not.toBe(svg);
    });

    it('measures digits as a chart draws them, at equal width', () => {
        // A chart's text inherits `tabular-nums` (chartRenderer.css). Arial kerns `11`
        // and Candara's own digits are proportional, so a measure without it comes out
        // narrower than the drawn label.
        const container = document.createElement('div');
        container.className = 'chart-container';
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        container.append(svg);
        document.body.append(container);
        for (const fontFamily of ['Arial', 'Candara']) {
            const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            Object.assign(text.style, { fontSize: '13px', fontFamily });
            text.textContent = '1111';
            svg.append(text);

            const [box] = measureTexts(['1111'], { ...FONT, fontFamily });

            expect(box?.width).toBeCloseTo(text.getBBox().width, 2);
        }
        container.remove();
    });

    it('gives a rotated text the box it takes on screen', () => {
        // A rotated tick label takes the room of its turned box, which the live text's
        // client rect shows.
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        Object.assign(text.style, { fontSize: '13px', fontFamily: 'sans-serif' });
        text.setAttribute('transform', 'rotate(-45)');
        text.textContent = 'Teilaufgabe 12 (rotate)';
        svg.append(text);
        document.body.append(svg);
        const screen = text.getBoundingClientRect();
        svg.remove();

        const [box] = measureTexts(['Teilaufgabe 12 (rotate)'], { ...FONT, rotationDeg: -45 });

        expect(box?.width).toBeCloseTo(screen.width, 0);
        expect(box?.height).toBeCloseTo(screen.height, 0);
    });
});
