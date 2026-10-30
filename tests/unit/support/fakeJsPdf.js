import { vi } from 'vitest';

/**
 * Every FakeJsPdf built since the last reset, in construction order.
 * @type {FakeJsPdf[]}
 */
export const jsPdfInstances = [];

/** Stand-in for jsPDF that records its drawing calls instead of rendering. */
export class FakeJsPdf {
    /** @param {import('jspdf').jsPDFOptions} [options] - What the composer constructed the document with. */
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
