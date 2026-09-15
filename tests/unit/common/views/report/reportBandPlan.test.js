import { describe, expect, it } from 'vitest';

import { A4, planBandPages } from '../../../../../src/common/export/pdfComposer.js';
import {
    planReportBands,
    planReportPages,
} from '../../../../../src/common/views/report/reportLayout.js';

// WHY: the report promises "what you arrange is what you get" — the preview
// draws the pages these planners produce and the PDF is composed from the same
// ones. So the band planner must wrap exactly like the preview shows, the page
// planner must never cut a card (not when the previous band ended near the page
// bottom, and not when a band is taller than a whole page), and the millimetre
// rectangles the preview positions cards by must match the packed pages.

const portraitBox = { width: A4.w - 2 * A4.margin, height: A4.h - 2 * A4.margin - A4.footer };

const card = (id, span, width = 1000, height = 500) => ({ id, span, width, height });

describe('planReportBands', () => {
    it('gives a full-width card its own band, scaled to the full band width', () => {
        const [band] = planReportBands([card('a', 12, 1000, 500)], { width: 1800, gap: 24 });

        expect(band.width).toBe(1800);
        expect(band.items).toHaveLength(1);
        expect(band.items[0]).toMatchObject({ id: 'a', x: 0, y: 0, w: 1800 });
        expect(band.items[0].h).toBeCloseTo(900, 6);
        expect(band.height).toBeCloseTo(900, 6);
    });

    it('places two half-width cards side by side in one band with the gap between them', () => {
        const [band, ...rest] = planReportBands([card('a', 6), card('b', 6)], {
            width: 1800,
            gap: 24,
        });
        const columnWidth = (1800 - 24 * 11) / 12;
        const halfWidth = columnWidth * 6 + 24 * 5;

        expect(rest).toHaveLength(0);
        expect(band.items.map((item) => item.id)).toEqual(['a', 'b']);
        expect(band.items[0].x).toBe(0);
        expect(band.items[0].w).toBeCloseTo(halfWidth, 6);
        expect(band.items[1].x).toBeCloseTo(halfWidth + 24, 6);
        expect(band.items[1].x + band.items[1].w).toBeCloseTo(1800, 6);
    });

    it('wraps like CSS grid auto-placement: 2/3 + 1/2 do not share a row', () => {
        const bands = planReportBands([card('a', 8), card('b', 6), card('c', 6)]);

        expect(bands.map((band) => band.items.map((item) => item.id))).toEqual([['a'], ['b', 'c']]);
    });

    it('makes a band as tall as its tallest scaled card', () => {
        const [band] = planReportBands([card('short', 6, 1000, 200), card('tall', 6, 1000, 800)]);

        expect(band.height).toBeCloseTo(band.items[1].h, 6);
        expect(band.items[0].h).toBeLessThan(band.height);
    });

    it('scales each card by its own column width, keeping its aspect ratio', () => {
        const [band] = planReportBands([card('a', 4, 800, 400), card('b', 8, 800, 400)]);

        expect(band.items[0].h / band.items[0].w).toBeCloseTo(0.5, 6);
        expect(band.items[1].h / band.items[1].w).toBeCloseTo(0.5, 6);
        expect(band.items[1].w).toBeGreaterThan(band.items[0].w * 2);
    });
});

describe('planBandPages', () => {
    const shortBand = { widthPx: 1800, heightPx: 600 }; // ~62 mm on the page

    it('stacks bands that fit on the same portrait page, separated by the gap', () => {
        const plan = planBandPages([shortBand, shortBand], { gapMm: 4 });
        const scale = portraitBox.width / 1800;

        expect(plan.pages).toHaveLength(1);
        expect(plan.pages[0]).toHaveLength(2);
        expect(plan.pages[0][0]).toMatchObject({
            band: 0,
            xMm: 0,
            yMm: 0,
            widthMm: portraitBox.width,
        });
        expect(plan.pages[0][0].heightMm).toBeCloseTo(600 * scale, 6);
        expect(plan.pages[0][1].band).toBe(1);
        expect(plan.pages[0][1].yMm).toBeCloseTo(600 * scale + 4, 6);
    });

    it('moves a band that would overflow the page to the next page instead of splitting it', () => {
        const scale = portraitBox.width / 1800;
        // Two bands each just over half the page: the second must not be split.
        const bigBand = { widthPx: 1800, heightPx: (portraitBox.height * 0.55) / scale };
        const plan = planBandPages([bigBand, bigBand]);

        expect(plan.pages).toHaveLength(2);
        expect(plan.pages[0]).toHaveLength(1);
        expect(plan.pages[1]).toHaveLength(1);
        expect(plan.pages[1][0]).toMatchObject({
            band: 1,
            xMm: 0,
            yMm: 0,
            widthMm: portraitBox.width,
        });
        expect(plan.pages[1][0].heightMm).toBeCloseTo(portraitBox.height * 0.55, 6);
    });

    it('shrinks a band taller than a page onto a page of its own, centred, aspect kept', () => {
        const scale = portraitBox.width / 1800;
        const tallBand = { widthPx: 1800, heightPx: (portraitBox.height / scale) * 2.5 };
        const plan = planBandPages([shortBand, tallBand, shortBand]);

        // One page each: the tall band never shares, and never gets cut.
        expect(plan.pages.map((page) => page.map((p) => p.band))).toEqual([[0], [1], [2]]);
        const [placement] = plan.pages[1];
        expect(placement.heightMm).toBeCloseTo(portraitBox.height, 6);
        expect(placement.widthMm).toBeCloseTo(portraitBox.width / 2.5, 6);
        expect(placement.widthMm / placement.heightMm).toBeCloseTo(
            tallBand.widthPx / tallBand.heightPx,
            6,
        );
        expect(placement.xMm).toBeCloseTo((portraitBox.width - placement.widthMm) / 2, 6);
        expect(placement.yMm).toBe(0);
    });

    it('returns no pages for no bands', () => {
        expect(planBandPages([]).pages).toEqual([]);
    });
});

describe('planReportPages', () => {
    it('puts two half-width cards side by side on one page, inside the content box', () => {
        const [page, ...rest] = planReportPages([card('a', 6, 1000, 400), card('b', 6, 1000, 400)]);

        expect(rest).toHaveLength(0);
        expect(page.map((rect) => rect.id)).toEqual(['a', 'b']);
        expect(page[0].xMm).toBe(0);
        expect(page[0].yMm).toBe(0);
        expect(page[1].xMm).toBeGreaterThan(page[0].xMm + page[0].wMm); // the gutter
        expect(page[1].xMm + page[1].wMm).toBeCloseTo(portraitBox.width, 6);
        page.forEach((rect) => expect(rect.hMm / rect.wMm).toBeCloseTo(0.4, 6));
    });

    it('centres a card too tall for a page on a page of its own, aspect kept', () => {
        // 1000 x 4000 at full content width would be 744 mm tall — far past 265.
        const pages = planReportPages([card('a', 12, 1000, 4000)]);

        expect(pages).toHaveLength(1);
        const [rect] = pages[0];
        expect(rect.hMm).toBeCloseTo(portraitBox.height, 6);
        expect(rect.hMm / rect.wMm).toBeCloseTo(4, 6);
        expect(rect.xMm).toBeCloseTo((portraitBox.width - rect.wMm) / 2, 6);
        expect(rect.xMm).toBeGreaterThan(0); // genuinely inset, not flush left
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
                expect(rect.xMm + rect.wMm).toBeLessThanOrEqual(portraitBox.width + 1e-6);
                expect(rect.yMm + rect.hMm).toBeLessThanOrEqual(portraitBox.height + 1e-6);
            });
        });
        expect(pages[1][0].yMm).toBe(0); // a new page starts at the top
    });
});
