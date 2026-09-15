// @vitest-browser

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@tba3/modules/common/tables/tabulatorBuild.js', () => ({
    Tabulator: { findTable: vi.fn() },
}));
import { Tabulator } from '@tba3/modules/common/tables/tabulatorBuild.js';

// WHY: these actions are what the export menu runs. They must (a) be enabled
// (real onSelect, no placeholder), (b) hand Tabulator the options that make the
// CSV reflect the table's current state and open cleanly in German Excel, and
// (c) drive the PDF composer with one page per slice — otherwise the menu still
// "works" but the files are wrong.

const fakeCanvasSize = { width: 800, height: 600 };
const toCanvas = vi.fn(async () => makeFakeCanvas(fakeCanvasSize.width, fakeCanvasSize.height));
const getFontEmbedCSS = vi.fn(async () => '');
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
    loadHtmlToImage: async () => ({ toCanvas, getFontEmbedCSS }),
    loadJsPdf: async () => FakeJsPdf,
}));

const { createDefaultExportActions, createTableExportActions, createVisualExportActions } =
    await import('../../../../src/common/export/exportActions.js');

function makeFakeCanvas(width, height) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    canvas.toBlob = (cb, type) => cb(new Blob(['x'], { type }));
    return canvas;
}

function mountCard({ withTable = false, rendered = true } = {}) {
    const card = document.createElement('div');
    card.className = 'module-container';
    card.innerHTML = `
        <div class="content-module-header"><h2 class="content-module-title">Titel</h2></div>
        <div class="content-module-body" id="body-1">${withTable ? '<div class="tabulator"></div>' : '<svg></svg>'}</div>`;
    document.body.appendChild(card);
    // jsdom has no layout; a rendered card reports a real box, a hidden one none.
    card.getBoundingClientRect = () =>
        rendered
            ? {
                  width: 800,
                  height: 600,
                  top: 0,
                  left: 0,
                  right: 800,
                  bottom: 600,
                  x: 0,
                  y: 0,
                  toJSON() {},
              }
            : {
                  width: 0,
                  height: 0,
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  x: 0,
                  y: 0,
                  toJSON() {},
              };
    return card;
}

function labels(actions) {
    return actions.map((a) => a.label);
}

describe('export action factories', () => {
    let downloads;
    let createObjectURL;

    beforeEach(() => {
        downloads = [];
        createObjectURL = vi.fn(() => 'blob:fake');
        globalThis.URL.createObjectURL = createObjectURL;
        globalThis.URL.revokeObjectURL = vi.fn();
        HTMLAnchorElement.prototype.click = function () {
            downloads.push({ name: this.download, href: this.href });
        };
        jsPdfInstances.length = 0;
        toCanvas.mockClear();
        fakeCanvasSize.width = 800;
        fakeCanvasSize.height = 600;
        globalThis.requestAnimationFrame = (cb) => {
            cb(0);
            return 0;
        };
    });

    afterEach(() => {
        document.body.innerHTML = '';
        Tabulator.findTable.mockReset();
        vi.restoreAllMocks();
    });

    it('offers PDF/PNG/JPG for visual modules and CSV/JSON/PDF for tables — every entry enabled', () => {
        const visual = createVisualExportActions({
            getCaptureRoot: () => null,
            getTitle: () => 't',
        });
        const table = createTableExportActions({ getCaptureRoot: () => null, getTitle: () => 't' });

        expect(labels(visual)).toEqual(['PDF', 'PNG', 'JPG']);
        expect(labels(table)).toEqual(['CSV', 'JSON', 'PDF']);
        [...visual, ...table].forEach((action) => {
            expect(typeof action.onSelect).toBe('function');
            expect(action.disabled).toBeUndefined();
        });
    });

    it('picks the default action set from the export target type', () => {
        expect(labels(createDefaultExportActions({ type: 'table' }))).toEqual([
            'CSV',
            'JSON',
            'PDF',
        ]);
        expect(labels(createDefaultExportActions({ type: 'chart' }))).toEqual([
            'PDF',
            'PNG',
            'JPG',
        ]);
        expect(labels(createDefaultExportActions({ type: 'info-box' }))).toEqual([
            'PDF',
            'PNG',
            'JPG',
        ]);
    });

    it('CSV: asks Tabulator for the active rows with ";" delimiter and prepends a single BOM', async () => {
        const card = mountCard({ withTable: true });
        const download = vi.fn((_type, _name, _opts, _range, intercept) =>
            intercept('Name;Wert\nA;1'),
        );
        Tabulator.findTable.mockImplementation(() => [{ download }]);
        let blob;
        globalThis.URL.createObjectURL = vi.fn((b) => {
            blob = b;
            return 'blob:fake';
        });

        const [csv] = createDefaultExportActions({
            type: 'table',
            container: 'body-1',
            title: 'Klasse',
        });
        await csv.onSelect({ title: 'Klasse', exportTarget: { view: 'class' } });

        expect(download).toHaveBeenCalledWith(
            'csv',
            null,
            { delimiter: ';', bom: false },
            'active',
            expect.any(Function),
        );
        // Blob.text() strips a leading BOM on decode — check the raw bytes.
        const bytes = new Uint8Array(await blob.arrayBuffer());
        expect(Array.from(bytes.slice(0, 3))).toEqual([0xef, 0xbb, 0xbf]);
        const text = new TextDecoder('utf-8', { ignoreBOM: true }).decode(bytes);
        expect(text.slice(1)).toBe('Name;Wert\nA;1');
        expect(text.indexOf(String.fromCharCode(0xfeff), 1)).toBe(-1);
        expect(downloads[0].name).toMatch(/^tba3-tba3-class-klasse-\d{8}-\d{4}\.csv$/);
        expect(card.querySelector('.tabulator')).not.toBeNull(); // live DOM untouched
    });

    it('JSON: a single table is emitted as-is, several tables as one array', async () => {
        mountCard({ withTable: true });
        const download = vi.fn((_type, _name, _opts, _range, intercept) => intercept('[{"a":1}]'));
        Tabulator.findTable.mockImplementation(() => [{ download }]);
        let blob;
        globalThis.URL.createObjectURL = vi.fn((b) => {
            blob = b;
            return 'blob:fake';
        });

        const [, json] = createDefaultExportActions({
            type: 'table',
            container: 'body-1',
            title: 'K',
        });
        await json.onSelect({});
        expect(download).toHaveBeenCalledWith('json', null, {}, 'active', expect.any(Function));
        expect(await blob.text()).toBe('[{"a":1}]');
    });

    it('fails loud when a table export target has no table', async () => {
        mountCard();
        Tabulator.findTable.mockImplementation(() => false);
        const [csv] = createDefaultExportActions({
            type: 'table',
            container: 'body-1',
            title: 'K',
        });
        await expect(csv.onSelect({})).rejects.toThrow(/No table/);
    });

    it('fails loud instead of rasterizing a hidden (display:none) module to a blank tile', async () => {
        mountCard({ rendered: false });
        const [pdf, png] = createDefaultExportActions({
            type: 'chart',
            container: 'body-1',
            title: 'Chart',
        });
        await expect(png.onSelect({})).rejects.toThrow(/not visible/);
        await expect(pdf.onSelect({})).rejects.toThrow(/not visible/);
        expect(toCanvas).not.toHaveBeenCalled();
    });

    it('PNG/JPG: rasterizes the module card and downloads with the matching extension', async () => {
        mountCard();
        const [, png, jpg] = createDefaultExportActions({
            type: 'chart',
            container: 'body-1',
            title: 'Chart',
        });

        await png.onSelect({ exportTarget: { view: 'item' } });
        await jpg.onSelect({ exportTarget: { view: 'item' } });

        expect(toCanvas).toHaveBeenCalledTimes(2);
        expect(toCanvas.mock.calls[0][0].classList.contains('module-container')).toBe(true);
        expect(downloads.map((d) => d.name)).toEqual([
            expect.stringMatching(/^tba3-tba3-item-chart-\d{8}-\d{4}\.png$/),
            expect.stringMatching(/^tba3-tba3-item-chart-\d{8}-\d{4}\.jpg$/),
        ]);
        // Stage cleaned up.
        expect(document.querySelector('.export-capture-stage')).toBeNull();
    });

    it('PDF: one page for a short capture, n pages (addPage n-1 times) for a tall one, footer on each', async () => {
        mountCard();
        const [pdf] = createDefaultExportActions({
            type: 'chart',
            container: 'body-1',
            title: 'Chart',
        });

        await pdf.onSelect({ exportTarget: { view: 'item' } });
        const shortDoc = jsPdfInstances.at(-1);
        expect(shortDoc.options).toMatchObject({
            orientation: 'portrait',
            format: 'a4',
            unit: 'mm',
        });
        expect(shortDoc.addImage).toHaveBeenCalledTimes(1);
        expect(shortDoc.addPage).not.toHaveBeenCalled();
        expect(shortDoc.text).toHaveBeenCalledTimes(1);
        expect(shortDoc.text.mock.calls[0][0]).toMatch(/Seite 1\/1$/);
        expect(shortDoc.save).toHaveBeenCalledWith(
            expect.stringMatching(/^tba3-tba3-item-chart-\d{8}-\d{4}\.pdf$/),
        );

        // jsdom has no 2D context; slicing a tall capture needs one.
        vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
            () => /** @type {any} */ ({
                fillRect: vi.fn(),
                drawImage: vi.fn(),
            }),
        );
        fakeCanvasSize.width = 800;
        fakeCanvasSize.height = 4000; // ≈ 3.5 pages at A4 content ratio
        await pdf.onSelect({ exportTarget: { view: 'item' } });
        const tallDoc = jsPdfInstances.at(-1);
        expect(tallDoc.addImage.mock.calls.length).toBeGreaterThan(1);
        expect(tallDoc.addPage).toHaveBeenCalledTimes(tallDoc.addImage.mock.calls.length - 1);
        expect(tallDoc.text).toHaveBeenCalledTimes(tallDoc.addImage.mock.calls.length);
    });
});
