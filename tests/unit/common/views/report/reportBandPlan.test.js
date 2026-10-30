import { describe, expect, it } from 'vitest';

import { A4, BAND_GAP_MM } from '../../../../../src/common/export/pdfPagePlan.js';
import { planReportPages } from '../../../../../src/common/views/report/reportLayout.js';

// The preview draws the pages this planner produces and the PDF is composed from the
// same ones: cards wrap into bands as the preview shows, no card is cut by a page
// break, and the millimetre rectangles the preview positions cards by match the
// packed pages.

const portraitBox = {
    widthMm: A4.widthMm - 2 * A4.marginMm,
    heightMm: A4.heightMm - 2 * A4.marginMm - A4.footerMm,
};

/**
 * @param {string} id
 * @param {number} span - Grid columns the card occupies.
 * @param {number} [widthPx] - The capture's width.
 * @param {number} [heightPx] - The capture's height.
 * @returns {import('../../../../../src/common/views/report/reportLayout.js').ReportCardInput}
 */
const card = (id, span, widthPx = 1000, heightPx = 500) => ({
    id,
    span,
    record: { width: widthPx, height: heightPx },
});

describe('planReportPages: row bands', () => {
    // The 12 grid columns share the content width with 11 gutters of the
    // page's band gap, so a half-width card is (186 - 4) / 2 = 91 mm wide.
    const halfWidthMm = (portraitBox.widthMm - BAND_GAP_MM) / 2;

    it('gives a full-width card its own band, scaled to the full content width', () => {
        const [[rect, ...rest]] = planReportPages([card('a', 12, 1000, 500)]);

        expect(rest).toHaveLength(0);
        expect(rect).toMatchObject({ id: 'a', xMm: 0, yMm: 0, wMm: portraitBox.widthMm });
        expect(rect.hMm).toBeCloseTo(portraitBox.widthMm / 2, 6);
    });

    it('places two half-width cards side by side in one band with the gap between them', () => {
        const [page] = planReportPages([card('a', 6), card('b', 6)]);

        expect(page.map((rect) => rect.id)).toEqual(['a', 'b']);
        expect(page[0].xMm).toBe(0);
        expect(page[0].wMm).toBeCloseTo(halfWidthMm, 6);
        expect(page[1].xMm).toBeCloseTo(halfWidthMm + BAND_GAP_MM, 6);
        expect(page[1].yMm).toBe(page[0].yMm);
        expect(page[1].xMm + page[1].wMm).toBeCloseTo(portraitBox.widthMm, 6);
    });

    it('wraps like CSS grid auto-placement: 2/3 + 1/2 do not share a row', () => {
        const [page] = planReportPages([card('a', 8), card('b', 6), card('c', 6)]);
        const [a, b, c] = page;

        expect(a.yMm).toBe(0);
        expect(b.yMm).toBeGreaterThan(0);
        expect(c.yMm).toBe(b.yMm);
        expect(b.xMm).toBe(0);
    });

    it('makes a band as tall as its tallest scaled card', () => {
        const [page] = planReportPages([
            card('short', 6, 1000, 200),
            card('tall', 6, 1000, 800),
            card('next', 12),
        ]);
        const [short, tall, next] = page;

        expect(short.hMm).toBeLessThan(tall.hMm);
        expect(next.yMm).toBeCloseTo(tall.hMm + BAND_GAP_MM, 6);
    });

    it('scales each card by its own column width, keeping its aspect ratio', () => {
        const [[a, b]] = planReportPages([card('a', 4, 800, 400), card('b', 8, 800, 400)]);

        expect(a.hMm / a.wMm).toBeCloseTo(0.5, 6);
        expect(b.hMm / b.wMm).toBeCloseTo(0.5, 6);
        expect(b.wMm).toBeGreaterThan(a.wMm * 2);
    });
});

describe('planReportPages', () => {
    it('centres a card too tall for a page on a page of its own, aspect kept', () => {
        // 1000 x 4000 at full content width would be 744 mm tall, past the 265 mm page.
        const pages = planReportPages([card('a', 12, 1000, 4000)]);

        expect(pages).toHaveLength(1);
        const [rect] = pages[0];
        expect(rect.hMm).toBeCloseTo(portraitBox.heightMm, 6);
        expect(rect.hMm / rect.wMm).toBeCloseTo(4, 6);
        expect(rect.xMm).toBeCloseTo((portraitBox.widthMm - rect.wMm) / 2, 6);
        expect(rect.xMm).toBeGreaterThan(0);
        expect(rect.yMm).toBe(0);
    });

    it('breaks to a second page once the bands no longer fit, keeping report order', () => {
        // Each full-width card is 186 x 93 mm on the page; four of them plus the
        // gaps exceed the 265 mm content height.
        const cards = ['a', 'b', 'c', 'd'].map((id) => card(id, 12, 1000, 500));
        const pages = planReportPages(cards);

        expect(pages).toHaveLength(2);
        expect(pages.flat().map((rect) => rect.id)).toEqual(['a', 'b', 'c', 'd']);
        pages.forEach((page) => {
            page.forEach((rect) => {
                expect(rect.xMm).toBeGreaterThanOrEqual(0);
                expect(rect.xMm + rect.wMm).toBeLessThanOrEqual(portraitBox.widthMm + 1e-6);
                expect(rect.yMm + rect.hMm).toBeLessThanOrEqual(portraitBox.heightMm + 1e-6);
            });
        });
        expect(pages[1][0].yMm).toBe(0);
    });
});
