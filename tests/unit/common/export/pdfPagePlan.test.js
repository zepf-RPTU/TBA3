import { describe, expect, it } from 'vitest';

import {
    A4,
    BAND_GAP_MM,
    planBandPages,
    planPdfPages,
} from '../../../../src/common/export/pdfPagePlan.js';

// A capture that is clipped, downscaled below legibility or split at the wrong row is
// a broken export although a file downloads. The report's bands must never be cut:
// not when the previous band ended near the page bottom, and not when a band is
// taller than a page.

const portraitBox = {
    widthMm: A4.widthMm - 2 * A4.marginMm,
    heightMm: A4.heightMm - 2 * A4.marginMm - A4.footerMm,
};
const landscapeBox = {
    widthMm: A4.heightMm - 2 * A4.marginMm,
    heightMm: A4.widthMm - 2 * A4.marginMm - A4.footerMm,
};

describe('planPdfPages', () => {
    it('keeps an ordinary 1.43:1 module portrait at full content width on one page', () => {
        const plan = planPdfPages({ widthPx: 1000, heightPx: 700 }, { paginate: false });

        expect(plan.orientation).toBe('portrait');
        expect(plan.imageWidthMm).toBe(portraitBox.widthMm);
        expect(plan.scale).toBeCloseTo(portraitBox.widthMm / 1000, 6);
        expect(plan.pages).toHaveLength(1);
        expect(plan.pages[0]).toMatchObject({ srcYPx: 0, srcHPx: 700 });
    });

    it('slices a tall capture into consecutive pages that cover the full height exactly once', () => {
        const heightPx = 5000;
        const plan = planPdfPages({ widthPx: 1000, heightPx }, { paginate: true });

        const pageSrcHeight = portraitBox.heightMm / plan.scale;
        expect(plan.pages.length).toBe(Math.ceil(heightPx / pageSrcHeight));

        let expectedY = 0;
        for (const page of plan.pages) {
            expect(page.srcYPx).toBeCloseTo(expectedY, 6);
            expect(page.srcHPx * plan.scale).toBeLessThanOrEqual(portraitBox.heightMm + 1e-6);
            expectedY += page.srcHPx;
        }
        expect(expectedY).toBeCloseTo(heightPx, 6);
    });

    it('shrinks a tall capture onto one page, centred, aspect kept, when not paginating', () => {
        const plan = planPdfPages({ widthPx: 1000, heightPx: 5000 }, { paginate: false });

        expect(plan.orientation).toBe('portrait');
        expect(plan.pages).toEqual([{ srcYPx: 0, srcHPx: 5000 }]);
        expect(5000 * plan.scale).toBeCloseTo(portraitBox.heightMm, 6);
        expect(plan.imageWidthMm).toBeCloseTo(1000 * plan.scale, 6);
        expect(plan.xMm).toBeCloseTo((portraitBox.widthMm - plan.imageWidthMm) / 2, 6);
    });

    it('switches to landscape exactly when the capture fits one landscape page at full width', () => {
        const boundary = landscapeBox.widthMm / landscapeBox.heightMm;

        expect(
            planPdfPages({ widthPx: 1000 * boundary * 1.01, heightPx: 1000 }, { paginate: false })
                .orientation,
        ).toBe('landscape');
        expect(
            planPdfPages({ widthPx: 1000 * boundary * 0.99, heightPx: 1000 }, { paginate: false })
                .orientation,
        ).toBe('portrait');
    });

    it('switches to landscape for wide content that fits one landscape page (2:1 chart)', () => {
        const plan = planPdfPages({ widthPx: 2000, heightPx: 1000 }, { paginate: false });

        expect(plan.orientation).toBe('landscape');
        expect(plan.imageWidthMm).toBe(landscapeBox.widthMm);
        expect(plan.pages).toHaveLength(1);
        expect(plan.pages[0].srcHPx * plan.scale).toBeLessThanOrEqual(landscapeBox.heightMm);
    });

    it('keeps portrait for near-square content (1.2:1)', () => {
        expect(
            planPdfPages({ widthPx: 1200, heightPx: 1000 }, { paginate: false }).orientation,
        ).toBe('portrait');
    });

    it('is unit-agnostic: device pixels and CSS pixels give the same mm layout', () => {
        const css = planPdfPages({ widthPx: 800, heightPx: 3000 }, { paginate: true });
        const device = planPdfPages({ widthPx: 1600, heightPx: 6000 }, { paginate: true });

        expect(device.orientation).toBe(css.orientation);
        expect(device.pages.length).toBe(css.pages.length);
        expect(device.pages[0].srcHPx * device.scale).toBeCloseTo(
            css.pages[0].srcHPx * css.scale,
            6,
        );
        expect(device.pages[0].srcHPx).toBeCloseTo(css.pages[0].srcHPx * 2, 6);
    });
});

describe('planBandPages', () => {
    const shortBand = { widthPx: 1800, heightPx: 600 }; // ~62 mm on the page

    it('stacks bands that fit on the same portrait page, separated by the band gap', () => {
        const plan = planBandPages([shortBand, shortBand]);
        const scale = portraitBox.widthMm / 1800;

        expect(plan.pages).toHaveLength(1);
        expect(plan.pages[0]).toHaveLength(2);
        expect(plan.pages[0][0]).toMatchObject({
            band: 0,
            xMm: 0,
            yMm: 0,
            widthMm: portraitBox.widthMm,
        });
        expect(plan.pages[0][0].heightMm).toBeCloseTo(600 * scale, 6);
        expect(plan.pages[0][1].band).toBe(1);
        expect(plan.pages[0][1].yMm).toBeCloseTo(600 * scale + BAND_GAP_MM, 6);
    });

    it('moves a band that would overflow the page to the next page instead of splitting it', () => {
        const scale = portraitBox.widthMm / 1800;
        // Each band is just over half the page.
        const bigBand = { widthPx: 1800, heightPx: (portraitBox.heightMm * 0.55) / scale };
        const plan = planBandPages([bigBand, bigBand]);

        expect(plan.pages).toHaveLength(2);
        expect(plan.pages[0]).toHaveLength(1);
        expect(plan.pages[1]).toHaveLength(1);
        expect(plan.pages[1][0]).toMatchObject({
            band: 1,
            xMm: 0,
            yMm: 0,
            widthMm: portraitBox.widthMm,
        });
        expect(plan.pages[1][0].heightMm).toBeCloseTo(portraitBox.heightMm * 0.55, 6);
    });

    it('shrinks a band taller than a page onto a page of its own, centred, aspect kept', () => {
        const scale = portraitBox.widthMm / 1800;
        const tallBand = { widthPx: 1800, heightPx: (portraitBox.heightMm / scale) * 2.5 };
        const plan = planBandPages([shortBand, tallBand, shortBand]);

        expect(plan.pages.map((page) => page.map((p) => p.band))).toEqual([[0], [1], [2]]);
        const [placement] = plan.pages[1];
        expect(placement.heightMm).toBeCloseTo(portraitBox.heightMm, 6);
        expect(placement.widthMm).toBeCloseTo(portraitBox.widthMm / 2.5, 6);
        expect(placement.widthMm / placement.heightMm).toBeCloseTo(
            tallBand.widthPx / tallBand.heightPx,
            6,
        );
        expect(placement.xMm).toBeCloseTo((portraitBox.widthMm - placement.widthMm) / 2, 6);
        expect(placement.yMm).toBe(0);
    });
});
