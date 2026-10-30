// @vitest-browser

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeJsPdf, jsPdfInstances } from '../../support/fakeJsPdf.js';
import { required } from '../../../../packages/modules/test/support/required.js';
import { A4, planBandPages, planPdfPages } from '../../../../src/common/export/pdfPagePlan.js';
import { createPdfComposer } from '../../../../src/common/export/pdfComposer.js';
import { makeCanvas } from '../../support/canvas.js';

// The report export hands the composer whole row bands. It must place each band at
// its planned offset, open exactly the planned pages and stamp the shared footer,
// and render one band at a time: a report of many full-width cards would otherwise
// hold every band canvas in memory before the first page is written.

vi.mock('../../../../src/common/export/exportLibs.js', () => ({
    loadHtmlToImage: async () => {
        throw new Error('not needed');
    },
    loadJsPdf: async () => FakeJsPdf,
}));

/**
 * A band descriptor whose render() hands out a fresh canvas and can be spied on.
 * @param {number} widthPx
 * @param {number} heightPx
 * @returns {{widthPx: number, heightPx: number, render: import('vitest').Mock<() => HTMLCanvasElement>}}
 */
function makeBand(widthPx, heightPx) {
    return { widthPx, heightPx, render: vi.fn(() => makeCanvas(widthPx, heightPx)) };
}

describe('pdf composer addBands', () => {
    beforeEach(() => {
        jsPdfInstances.length = 0;
    });

    it('draws two short bands on one portrait page at their planned offsets and stamps one footer', async () => {
        const composer = await createPdfComposer({ appId: 'en', title: 'Bericht' });
        const bands = [makeBand(1800, 600), makeBand(1800, 400)];
        const plan = planBandPages(bands.map(({ widthPx, heightPx }) => ({ widthPx, heightPx })));

        composer.addBands(bands);
        composer.save('bericht.pdf');

        const doc = jsPdfInstances[0];
        expect(required(doc.options).orientation).toBe('portrait');
        expect(doc.addPage).not.toHaveBeenCalled();
        expect(doc.addImage).toHaveBeenCalledTimes(2);
        const [, , x0, y0, w0, h0] = doc.addImage.mock.calls[0];
        const [, , , y1] = doc.addImage.mock.calls[1];
        expect(x0).toBeCloseTo(A4.marginMm + plan.pages[0][0].xMm, 6);
        expect(y0).toBe(A4.marginMm);
        expect(w0).toBeCloseTo(plan.pages[0][0].widthMm, 6);
        expect(h0).toBeCloseTo(plan.pages[0][0].heightMm, 6);
        expect(y1).toBeCloseTo(A4.marginMm + plan.pages[0][1].yMm, 6);
        expect(doc.text).toHaveBeenCalledTimes(1);
        // The title goes to the document properties, not the footer.
        expect(doc.text.mock.calls[0][0]).toMatch(
            /^TBA3 · EN · \d{2}\.\d{2}\.\d{4} \d{2}:\d{2} · Seite 1\/1$/,
        );
        expect(doc.save).toHaveBeenCalledWith('bericht.pdf');
    });

    it('opens one page per planned page and numbers them all', async () => {
        const composer = await createPdfComposer({ appId: 'en', title: 'Bericht' });
        const box = {
            widthMm: A4.widthMm - 2 * A4.marginMm,
            heightMm: A4.heightMm - 2 * A4.marginMm - A4.footerMm,
        };
        const scale = box.widthMm / 1800;
        const tallHeight = Math.round((box.heightMm * 0.6) / scale);

        composer.addBands([
            makeBand(1800, tallHeight),
            makeBand(1800, tallHeight),
            makeBand(1800, tallHeight),
        ]);
        composer.save('bericht.pdf');

        const doc = jsPdfInstances[0];
        expect(doc.addPage).toHaveBeenCalledTimes(2);
        expect(doc.addImage).toHaveBeenCalledTimes(3);
        expect(doc.text.mock.calls.map((call) => call[0])).toEqual([
            expect.stringContaining('Seite 1/3'),
            expect.stringContaining('Seite 2/3'),
            expect.stringContaining('Seite 3/3'),
        ]);
    });

    it('renders each band exactly once, and only after the previous band was fully written', async () => {
        const composer = await createPdfComposer({ appId: 'en', title: 'Bericht' });
        const box = {
            widthMm: A4.widthMm - 2 * A4.marginMm,
            heightMm: A4.heightMm - 2 * A4.marginMm - A4.footerMm,
        };
        const scale = box.widthMm / 1800;
        const pagePx = box.heightMm / scale;
        // short | taller than a page (shrunk onto a page of its own) | short
        const bands = [
            makeBand(1800, 400),
            makeBand(1800, Math.round(pagePx * 1.5)),
            makeBand(1800, 400),
        ];

        composer.addBands(bands);

        const doc = jsPdfInstances[0];
        expect(doc.addImage).toHaveBeenCalledTimes(3);
        bands.forEach((band) => expect(band.render).toHaveBeenCalledTimes(1));

        // Call order: render(n) < addImage(n) < render(n+1).
        const renderOrder = bands.map((band) => band.render.mock.invocationCallOrder[0]);
        const imageOrder = doc.addImage.mock.invocationCallOrder;
        renderOrder.forEach((order, index) => {
            expect(order).toBeLessThan(imageOrder[index]);
        });
        renderOrder.slice(1).forEach((order, index) => {
            expect(order).toBeGreaterThan(imageOrder[index]);
        });
    });
});

describe('pdf composer addCapture', () => {
    beforeEach(() => {
        jsPdfInstances.length = 0;
    });

    it('slices whole rows onto pages and opens no page for a tail under half a row', async () => {
        // 3445 rows of a 403-wide capture fill exactly six portrait pages; the plan's
        // sum of page heights falls short of 3445 by a float residue, which once opened
        // a seventh page carrying a one-row slice.
        const composer = await createPdfComposer({ appId: 'en', title: 'Tabelle' });
        const canvas = makeCanvas(403, 3445);

        composer.addCapture(canvas, { paginate: true });
        composer.save('tabelle.pdf');

        const doc = jsPdfInstances[0];
        expect(doc.addImage).toHaveBeenCalledTimes(6);
        expect(doc.text.mock.calls.at(-1)?.[0]).toContain('Seite 6/6');
        const slices = doc.addImage.mock.calls.map(
            (call) => /** @type {HTMLCanvasElement} */ (call[0]),
        );
        expect(slices.reduce((rows, slice) => rows + slice.height, 0)).toBe(3445);
    });

    it('draws a capture taller than a page whole on one page when not paginating', async () => {
        const composer = await createPdfComposer({ appId: 'en', title: 'Diagramm' });
        const canvas = makeCanvas(403, 3445);
        const plan = planPdfPages({ widthPx: 403, heightPx: 3445 }, { paginate: false });

        composer.addCapture(canvas, { paginate: false });
        composer.save('diagramm.pdf');

        const doc = jsPdfInstances[0];
        expect(doc.addPage).not.toHaveBeenCalled();
        expect(doc.addImage).toHaveBeenCalledTimes(1);
        const [image, , x, y, w, h] = doc.addImage.mock.calls[0];
        expect(image).toBe(canvas);
        expect(x).toBeCloseTo(A4.marginMm + plan.xMm, 6);
        expect(y).toBe(A4.marginMm);
        expect(w).toBeCloseTo(plan.imageWidthMm, 6);
        expect(h).toBeCloseTo(3445 * plan.scale, 6);
        expect(doc.text.mock.calls[0][0]).toContain('Seite 1/1');
    });
});
