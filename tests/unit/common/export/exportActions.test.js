// @vitest-browser

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeJsPdf, jsPdfInstances } from '../../support/fakeJsPdf.js';
import { required } from '../../../../packages/modules/test/support/required.js';
import { exportableModule } from '../../support/exportableModule.js';
import { makeCanvas } from '../../support/canvas.js';
import { createTestAppContext } from '../../support/glossaryFixture.js';
import { createDefaultExportActions } from '../../../../src/common/export/exportActions.js';

// The export menu runs these actions. They ask the captured module for its rows and
// wrap them so the file opens cleanly in German Excel, and drive the PDF composer
// with one page per slice; a menu that downloads wrong files still looks working.

const fakeCanvasSize = { width: 800, height: 600 };
const toCanvas = vi.fn(async (/** @type {HTMLElement} */ _node) =>
    makeCanvas(fakeCanvasSize.width, fakeCanvasSize.height),
);
const getFontEmbedCSS = vi.fn(async () => '');

vi.mock('../../../../src/common/export/exportLibs.js', () => ({
    loadHtmlToImage: async () => ({ toCanvas, getFontEmbedCSS }),
    loadJsPdf: async () => FakeJsPdf,
}));

/** The app the files are exported from. */
// Labels that differ from the keys: an export names its view by the label.
const APP = {
    ...createTestAppContext('en'),
    viewLabel: (/** @type {string} */ view) =>
        ({ group: 'Lerngruppe', item: 'Aufgaben' })[view] ?? '',
};

/**
 * Mount a module card into the document.
 * @param {{withTable?: boolean, rendered?: boolean}} [options] - Whether it holds a table, and whether it reports a box.
 * @returns {HTMLDivElement}
 */
function mountCard({ withTable = false, rendered = true } = {}) {
    const card = document.createElement('div');
    card.className = 'module-container';
    card.innerHTML = `
        <div class="content-module-header"><h2 class="content-module-title">Titel</h2></div>
        <div class="content-module-body" id="body-1">${withTable ? '<div class="tabulator"></div>' : '<svg></svg>'}</div>`;
    document.body.appendChild(card);
    // Fixes which cards count as rendered: a rendered card reports a box, a hidden one none.
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

describe('export action factories', () => {
    /** @type {{name: string, href: string}[]} */
    let downloads;
    /** @type {import('vitest').MockInstance<(obj: Blob) => string>} */
    let createObjectURL;

    beforeEach(() => {
        downloads = [];
        createObjectURL = /** @type {import('vitest').MockInstance<(obj: Blob) => string>} */ (
            vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:fake')
        );
        vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
        vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(
            /** @this {HTMLAnchorElement} */
            function () {
                downloads.push({ name: this.download, href: this.href });
            },
        );
        jsPdfInstances.length = 0;
        toCanvas.mockClear();
        fakeCanvasSize.width = 800;
        fakeCanvasSize.height = 600;
        vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
            cb(0);
            return 0;
        });
    });

    it('CSV: asks the module for its rows and prepends a single BOM', async () => {
        const card = mountCard({ withTable: true });
        const dataText = vi.fn(() => [{ title: 'Lerngruppe', text: 'Name;Wert\nA;1' }]);

        const [csv] = createDefaultExportActions(
            {
                moduleId: 'target',
                identity: null,
                type: 'table',
                title: 'Lerngruppe',
                view: 'group',
                module: exportableModule(card, dataText),
            },
            APP,
        );
        await csv.onSelect();
        const blob = createObjectURL.mock.calls[0][0];

        expect(dataText).toHaveBeenCalledWith('csv');
        // Blob.text() strips a leading BOM on decode, so check the raw bytes.
        const bytes = new Uint8Array(await blob.arrayBuffer());
        expect(Array.from(bytes.slice(0, 3))).toEqual([0xef, 0xbb, 0xbf]);
        const text = new TextDecoder('utf-8', { ignoreBOM: true }).decode(bytes);
        expect(text.slice(1)).toBe('Name;Wert\nA;1');
        expect(text.indexOf(String.fromCharCode(0xfeff), 1)).toBe(-1);
        expect(downloads[0].name).toMatch(/^tba3-en-lerngruppe-lerngruppe-\d{8}-\d{4}\.csv$/);
        // The live DOM is untouched.
        expect(card.querySelector('.tabulator')).not.toBeNull();
    });

    /**
     * The CSV and JSON actions of a table target whose module hands over these blocks.
     * @param {import('@tba3/module-base').ExportDataBlock[]} blocks
     * @returns {import('../../../../src/common/export/exportActions.js').ExportAction[]} CSV, then JSON.
     */
    const dataActions = (blocks) =>
        createDefaultExportActions(
            {
                moduleId: 'target',
                identity: null,
                type: 'table',
                title: 'K',
                module: exportableModule(mountCard({ withTable: true }), () => blocks),
            },
            APP,
        ).slice(0, 2);

    it('JSON: a single table is emitted as-is, several as one array of titled tables', async () => {
        await dataActions([{ title: 'A', text: '[{"a":1}]' }])[1].onSelect();
        expect(await createObjectURL.mock.calls[0][0].text()).toBe('[{"a":1}]');

        await dataActions([
            { title: 'A', text: '[{"a":1}]' },
            { title: 'Schüler "B"', text: '[{"b":2}]' },
        ])[1].onSelect();
        expect(JSON.parse(await createObjectURL.mock.calls[1][0].text())).toEqual([
            { title: 'A', rows: [{ a: 1 }] },
            { title: 'Schüler "B"', rows: [{ b: 2 }] },
        ]);
    });

    it('CSV: several tables each get their title on a line above the header', async () => {
        await dataActions([
            { title: 'Schüler:innen', text: 'Name;Wert\nA;1' },
            { title: 'Mittel; gesamt', text: 'Gruppe;Wert\nLand;2' },
        ])[0].onSelect();
        const text = await createObjectURL.mock.calls[0][0].text();

        expect(text).toBe('Schüler:innen\nName;Wert\nA;1\n\n"Mittel; gesamt"\nGruppe;Wert\nLand;2');
    });

    it('keeps the download URL alive while the browser fetches the file', async () => {
        // The browser may read the blob only after the click returns; a URL revoked
        // right away loses the download.
        vi.useFakeTimers();
        try {
            await dataActions([{ title: 'A', text: 'Name;Wert\nA;1' }])[0].onSelect();
            vi.advanceTimersByTime(1000);
            expect(URL.revokeObjectURL).not.toHaveBeenCalled();
            vi.advanceTimersByTime(60_000);
            expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:fake');
        } finally {
            vi.useRealTimers();
        }
    });

    it('offers a chart with a data table both its image formats and its data', async () => {
        const card = mountCard();
        const dataText = vi.fn(() => [
            { title: 'Kompetenzstufen', text: 'Gruppe;Anteil\n8a;12,5' },
        ]);
        const actions = createDefaultExportActions(
            {
                moduleId: 'target',
                identity: null,
                type: 'chart',
                title: 'Kompetenzstufen',
                module: exportableModule(card, dataText),
            },
            APP,
        );
        expect(actions.map((action) => action.label)).toEqual(['PDF', 'PNG', 'JPG', 'CSV', 'JSON']);

        await required(actions.find((action) => action.label === 'CSV')).onSelect();
        expect(dataText).toHaveBeenCalledWith('csv');
        expect(downloads[0].name).toMatch(/\.csv$/);
    });

    it('fails loud when a table export target hands over no rows', async () => {
        const card = mountCard();
        const [csv] = createDefaultExportActions(
            {
                moduleId: 'target',
                identity: null,
                type: 'table',
                title: 'K',
                module: exportableModule(card, () => []),
            },
            APP,
        );
        await expect(csv.onSelect()).rejects.toThrow(/No data/);
    });

    it('fails loud instead of rasterizing a hidden (display:none) module to a blank tile', async () => {
        const card = mountCard({ rendered: false });
        const [pdf, png] = createDefaultExportActions(
            {
                moduleId: 'target',
                identity: null,
                type: 'visual',
                module: exportableModule(card),
                title: 'Chart',
                view: 'item',
            },
            APP,
        );
        await expect(png.onSelect()).rejects.toThrow(/not visible/);
        await expect(pdf.onSelect()).rejects.toThrow(/not visible/);
        expect(toCanvas).not.toHaveBeenCalled();
    });

    it('PNG/JPG: rasterizes the module card and downloads with the matching extension', async () => {
        const card = mountCard();
        const [, png, jpg] = createDefaultExportActions(
            {
                moduleId: 'target',
                identity: null,
                type: 'visual',
                module: exportableModule(card),
                title: 'Chart',
                view: 'item',
            },
            APP,
        );

        await png.onSelect();
        await jpg.onSelect();

        expect(toCanvas).toHaveBeenCalledTimes(2);
        expect(toCanvas.mock.calls[0][0].classList.contains('module-container')).toBe(true);
        expect(downloads.map((d) => d.name)).toEqual([
            expect.stringMatching(/^tba3-en-aufgaben-chart-\d{8}-\d{4}\.png$/),
            expect.stringMatching(/^tba3-en-aufgaben-chart-\d{8}-\d{4}\.jpg$/),
        ]);
        expect(document.querySelector('.export-capture-stage')).toBeNull();
    });

    it('PDF: one page for a visual of any height, n pages (addPage n-1 times) for a tall table, footer on each', async () => {
        const card = mountCard();
        const [pdf] = createDefaultExportActions(
            {
                moduleId: 'target',
                identity: null,
                type: 'visual',
                module: exportableModule(card),
                title: 'Chart',
                view: 'item',
            },
            APP,
        );

        await pdf.onSelect();
        const shortDoc = required(jsPdfInstances.at(-1));
        expect(shortDoc.options).toMatchObject({
            orientation: 'portrait',
            format: 'a4',
            unit: 'mm',
        });
        expect(shortDoc.addImage).toHaveBeenCalledTimes(1);
        expect(shortDoc.addPage).not.toHaveBeenCalled();
        expect(shortDoc.text).toHaveBeenCalledTimes(1);
        expect(shortDoc.text.mock.calls[0][0]).toMatch(/Seite 1\/1$/);
        // The footer names the view by its label, never by its key.
        expect(shortDoc.text.mock.calls[0][0]).toMatch(
            /^TBA3 · EN · Aufgaben · \d{2}\.\d{2}\.\d{4} \d{2}:\d{2} · Seite 1\/1$/,
        );
        expect(shortDoc.save).toHaveBeenCalledWith(
            expect.stringMatching(/^tba3-en-aufgaben-chart-\d{8}-\d{4}\.pdf$/),
        );

        fakeCanvasSize.width = 800;
        fakeCanvasSize.height = 4000; // ≈ 3.5 pages at A4 content ratio
        await pdf.onSelect();
        const tallVisualDoc = required(jsPdfInstances.at(-1));
        expect(tallVisualDoc.addImage).toHaveBeenCalledTimes(1);
        expect(tallVisualDoc.addPage).not.toHaveBeenCalled();

        const tablePdf = required(
            createDefaultExportActions(
                {
                    moduleId: 'target',
                    identity: null,
                    type: 'table',
                    module: exportableModule(card),
                    title: 'Chart',
                    view: 'item',
                },
                APP,
            ).at(-1),
        );
        await tablePdf.onSelect();
        const tallDoc = required(jsPdfInstances.at(-1));
        expect(tallDoc.addImage.mock.calls.length).toBeGreaterThan(1);
        expect(tallDoc.addPage).toHaveBeenCalledTimes(tallDoc.addImage.mock.calls.length - 1);
        expect(tallDoc.text).toHaveBeenCalledTimes(tallDoc.addImage.mock.calls.length);
    });
});
