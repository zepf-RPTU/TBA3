import { describe, expect, it } from 'vitest';

import { A4, planPdfPages } from '../../../../src/common/export/pdfComposer.js';

// WHY: page geometry is what the user sees in the exported PDF — a capture
// that silently gets clipped, downscaled below legibility or split at the wrong
// row is a broken export even though "a file was downloaded".

const portraitBox = { width: A4.w - 2 * A4.margin, height: A4.h - 2 * A4.margin - A4.footer };
const landscapeBox = { width: A4.h - 2 * A4.margin, height: A4.w - 2 * A4.margin - A4.footer };

describe('planPdfPages', () => {
    it('fills the portrait content width for an ordinary module and needs one page', () => {
        const plan = planPdfPages({ widthPx: 1000, heightPx: 700 });

        expect(plan.orientation).toBe('portrait');
        expect(plan.imageWidthMm).toBe(portraitBox.width);
        expect(plan.scale).toBeCloseTo(portraitBox.width / 1000, 6);
        expect(plan.pages).toHaveLength(1);
        expect(plan.pages[0]).toMatchObject({ srcY: 0, srcH: 700 });
        expect(plan.pages[0].heightMm).toBeCloseTo(700 * plan.scale, 6);
    });

    it('slices a tall capture into consecutive pages that cover the full height exactly once', () => {
        const heightPx = 5000;
        const plan = planPdfPages({ widthPx: 1000, heightPx });

        const pageSrcHeight = portraitBox.height / plan.scale;
        expect(plan.pages.length).toBe(Math.ceil(heightPx / pageSrcHeight));

        // Contiguous, non-overlapping slices covering the whole image.
        let expectedY = 0;
        for (const page of plan.pages) {
            expect(page.srcY).toBeCloseTo(expectedY, 6);
            expect(page.heightMm).toBeLessThanOrEqual(portraitBox.height + 1e-6);
            expectedY += page.srcH;
        }
        expect(expectedY).toBeCloseTo(heightPx, 6);
    });

    it('switches to landscape for clearly wide content that fits one landscape page (2:1 chart)', () => {
        const plan = planPdfPages({ widthPx: 2000, heightPx: 1000 });

        expect(plan.orientation).toBe('landscape');
        expect(plan.imageWidthMm).toBe(landscapeBox.width);
        expect(plan.pages).toHaveLength(1);
        expect(plan.pages[0].heightMm).toBeLessThanOrEqual(landscapeBox.height);
    });

    it('keeps portrait for mildly wide content (1.43:1) — landscape would need a second page', () => {
        const plan = planPdfPages({ widthPx: 1000, heightPx: 700 });

        expect(plan.orientation).toBe('portrait');
        expect(plan.pages).toHaveLength(1);
    });

    it('keeps portrait for near-square content (1.2:1)', () => {
        expect(planPdfPages({ widthPx: 1200, heightPx: 1000 }).orientation).toBe('portrait');
    });

    it('is unit-agnostic: device pixels and CSS pixels give the same mm layout', () => {
        const css = planPdfPages({ widthPx: 800, heightPx: 3000 });
        const device = planPdfPages({ widthPx: 1600, heightPx: 6000 });

        expect(device.orientation).toBe(css.orientation);
        expect(device.pages.length).toBe(css.pages.length);
        expect(device.pages[0].heightMm).toBeCloseTo(css.pages[0].heightMm, 6);
        expect(device.pages[0].srcH).toBeCloseTo(css.pages[0].srcH * 2, 6);
    });
});
