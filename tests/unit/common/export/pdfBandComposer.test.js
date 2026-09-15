// @vitest-browser

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// WHY: the report export hands the composer whole row bands. It must place
// each band at its planned offset on the page, open exactly the planned pages,
// and still stamp the shared footer — a PDF with bands drawn on top of each
// other or an unnumbered page is a broken export even though a file appears.
// And it must render one band at a time: a report of many full-width cards
// would otherwise hold every band canvas in memory before the first page is
// written.

const jsPdfInstances = [];

class FakeJsPdf {
    constructor(options) {
        this.options = options;
        this.addImage = vi.fn();
        this.addPage = vi.fn();
        this.setPage = vi.fn();
        this.setFont = vi.fn();
        this.setFontSize = vi.fn();
        this.setTextColor = vi.fn();
        this.text = vi.fn();
        this.setProperties = vi.fn();
        this.save = vi.fn();
        this.internal = { pageSize: { getWidth: () => 210, getHeight: () => 297 } };
        jsPdfInstances.push(this);
    }
}

vi.mock('../../../../src/common/export/exportLibs.js', () => ({
    loadHtmlToImage: async () => {
        throw new Error('not needed');
    },
    loadJsPdf: async () => FakeJsPdf,
}));

const { A4, createPdfComposer, planBandPages } =
    await import('../../../../src/common/export/pdfComposer.js');

function makeCanvas(width, height) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    return canvas;
}

/** A band descriptor whose render() hands out a fresh canvas and can be spied on. */
function makeBand(width, height) {
    return { widthPx: width, heightPx: height, render: vi.fn(() => makeCanvas(width, height)) };
}

describe('pdf composer addBands', () => {
    beforeEach(() => {
        jsPdfInstances.length = 0;
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('draws two short bands on one portrait page at their planned offsets and stamps one footer', async () => {
        const composer = await createPdfComposer();
        const bands = [makeBand(1800, 600), makeBand(1800, 400)];
        const plan = planBandPages(bands.map(({ widthPx, heightPx }) => ({ widthPx, heightPx })));

        composer.addBands(bands, { title: 'Bericht' });
        composer.save('bericht.pdf');

        const doc = jsPdfInstances[0];
        expect(doc.options.orientation).toBe('portrait');
        expect(doc.addPage).not.toHaveBeenCalled();
        expect(composer.pageCount()).toBe(1);
        expect(doc.addImage).toHaveBeenCalledTimes(2);
        const [, , x0, y0, w0, h0] = doc.addImage.mock.calls[0];
        const [, , , y1] = doc.addImage.mock.calls[1];
        expect(x0).toBeCloseTo(A4.margin + plan.pages[0][0].xMm, 6);
        expect(y0).toBe(A4.margin);
        expect(w0).toBeCloseTo(plan.pages[0][0].widthMm, 6);
        expect(h0).toBeCloseTo(plan.pages[0][0].heightMm, 6);
        expect(y1).toBeCloseTo(A4.margin + plan.pages[0][1].yMm, 6);
        expect(doc.text).toHaveBeenCalledTimes(1);
        expect(doc.text.mock.calls[0][0]).toContain('Bericht');
        expect(doc.text.mock.calls[0][0]).toContain('Seite 1/1');
        expect(doc.save).toHaveBeenCalledWith('bericht.pdf');
    });

    it('opens one page per planned page and numbers them all', async () => {
        const composer = await createPdfComposer();
        const box = { width: A4.w - 2 * A4.margin, height: A4.h - 2 * A4.margin - A4.footer };
        const scale = box.width / 1800;
        const tallHeight = Math.round((box.height * 0.6) / scale);

        composer.addBands(
            [makeBand(1800, tallHeight), makeBand(1800, tallHeight), makeBand(1800, tallHeight)],
            { title: 'Bericht' },
        );
        composer.save('bericht.pdf');

        const doc = jsPdfInstances[0];
        expect(composer.pageCount()).toBe(3);
        expect(doc.addPage).toHaveBeenCalledTimes(2);
        expect(doc.addImage).toHaveBeenCalledTimes(3);
        expect(doc.text.mock.calls.map((call) => call[0])).toEqual([
            expect.stringContaining('Seite 1/3'),
            expect.stringContaining('Seite 2/3'),
            expect.stringContaining('Seite 3/3'),
        ]);
    });

    it('renders each band exactly once, and only after the previous band was fully written', async () => {
        const composer = await createPdfComposer();
        const box = { width: A4.w - 2 * A4.margin, height: A4.h - 2 * A4.margin - A4.footer };
        const scale = box.width / 1800;
        const pagePx = box.height / scale;
        // short | taller than a page (shrunk onto a page of its own) | short
        const bands = [
            makeBand(1800, 400),
            makeBand(1800, Math.round(pagePx * 1.5)),
            makeBand(1800, 400),
        ];

        composer.addBands(bands, { title: 'Bericht' });

        const doc = jsPdfInstances[0];
        expect(doc.addImage).toHaveBeenCalledTimes(3); // one placement per band
        bands.forEach((band) => expect(band.render).toHaveBeenCalledTimes(1));

        // Call order: render(n) < addImage(n) < render(n+1) — one band at a time.
        const renderOrder = bands.map((band) => band.render.mock.invocationCallOrder[0]);
        const imageOrder = doc.addImage.mock.invocationCallOrder;
        renderOrder.forEach((order, index) => {
            expect(order).toBeLessThan(imageOrder[index]);
            if (index > 0) expect(order).toBeGreaterThan(imageOrder[index - 1]);
        });
    });
});
