// @vitest-browser

import { describe, expect, it, vi } from 'vitest';

import { toCanvas } from 'html-to-image';
import '@tba3/module-base/styles/tokens.css';
import '../../../../src/styles/export-capture.css';
import { captureExportRoot } from '../../../../src/common/export/exportCapture.js';
import { required } from '../../../../packages/modules/test/support/required.js';
import { queryHtml } from '../../../../packages/modules/test/support/dom.js';
import { exportableModule } from '../../support/exportableModule.js';

vi.mock('html-to-image', () => ({ toCanvas: vi.fn() }));

// The capture stage is what gets rasterized: a button, preset bar or collapsed body
// leaking into the clone, or content dropping out of it, makes every PDF/PNG wrong
// while the download still succeeds.

const PRINT_TABLE_HTML =
    '<table class="tabulator-print-table"><tbody><tr><td>row 1</td></tr><tr><td>row 2</td></tr></tbody></table>';

/**
 * The module body inside a card or its clone.
 * @param {Element} root
 * @returns {HTMLElement}
 */
function bodyOf(root) {
    return queryHtml(root, '.content-module-body');
}

/**
 * Mount a module card with header actions, a form control and a chart or table body.
 * @param {{collapsed?: boolean, withTable?: boolean}} [options] - Whether the card is collapsed, and whether its body is a table.
 * @returns {HTMLDivElement}
 */
function buildModuleCard({ collapsed = false, withTable = false } = {}) {
    const card = document.createElement('div');
    card.className = `module-container${collapsed ? ' collapsed' : ''}`;
    const body = withTable
        ? '<div class="tabulator"><div class="tabulator-tableholder">visible rows only</div></div>'
        : '<svg></svg>';
    card.innerHTML = `
        <div class="content-module-header">
            <button type="button" class="content-module-toggle"><svg class="icon content-module-chevron"></svg></button>
            <h2 class="content-module-title">Lerngruppenübersicht</h2>
            <div class="content-module-header-actions">
                <div class="table-preset-container"><button>Preset</button></div>
                <div class="btn-group module-export-button-wrapper">
                    <button data-header-action-button="export-trigger">Export</button>
                    <ul class="header-action-dropdown"></ul>
                </div>
            </div>
        </div>
        <div class="content-module-subtitle">Untertitel</div>
        <div class="content-module-body" id="module-1">
            <select id="student"><option>A</option><option>B</option></select>
            ${body}
        </div>`;
    document.body.appendChild(card);
    return card;
}

/**
 * Capture `card` and return the clone html-to-image was handed, with where it sat
 * at that moment.
 * @param {HTMLElement} card - The live module card.
 * @param {((cloneOf: (live: Element) => Element|null) => void)} [prepareClone] - The module's clone fix-up.
 * @returns {Promise<{clone: HTMLElement, stage: HTMLElement|null, connected: boolean}>} What was rasterized.
 */
async function captureClone(card, prepareClone) {
    /** @type {{clone: HTMLElement, stage: HTMLElement|null, connected: boolean}|null} */
    let rasterized = null;
    vi.mocked(toCanvas).mockImplementationOnce(async (node) => {
        rasterized = { clone: node, stage: node.parentElement, connected: node.isConnected };
        return document.createElement('canvas');
    });
    const module = exportableModule(card);
    if (prepareClone) module.prepareExportClone = prepareClone;
    await captureExportRoot({ module });
    return /** @type {NonNullable<typeof rasterized>} */ (rasterized);
}

describe('captureExportRoot', () => {
    it('fails for a card that has unmounted', async () => {
        // A card torn down mid-capture must fail the capture, not rasterize a
        // detached node.
        const card = buildModuleCard();
        card.remove();
        await expect(captureExportRoot({ module: exportableModule(card) })).rejects.toThrow(
            'not mounted',
        );
    });

    it('clones the card only once it has settled', async () => {
        // A build still in flight would be cloned half done.
        const card = buildModuleCard();
        const module = exportableModule(card);
        /** @type {() => void} */
        let settle = () => {};
        module.whenSettled = () =>
            new Promise((resolve) => {
                settle = resolve;
            });
        vi.mocked(toCanvas).mockImplementationOnce(async () => document.createElement('canvas'));

        const capturing = captureExportRoot({ module });
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(document.querySelector('.export-capture-stage')).toBeNull();

        settle();
        await expect(capturing).resolves.toBeInstanceOf(HTMLCanvasElement);
    });

    it('fails, undoing its preparation, for a card that unmounts while it settles', async () => {
        // A view switch during the preparation: rasterizing would store a blank tile.
        const card = buildModuleCard();
        const restore = vi.fn();
        const module = exportableModule(card);
        module.prepareExportCapture = () => restore;
        module.whenSettled = async () => {
            card.remove();
        };
        const rasterized = vi.mocked(toCanvas).mock.calls.length;

        await expect(captureExportRoot({ module })).rejects.toThrow('not mounted');
        expect(restore).toHaveBeenCalledOnce();
        expect(vi.mocked(toCanvas).mock.calls).toHaveLength(rasterized);
        expect(document.querySelector('.export-capture-stage')).toBeNull();
    });

    it('keeps title/subtitle/body but removes every interactive control from the clone', async () => {
        const card = buildModuleCard();
        const { stage, clone, connected } = await captureClone(card);

        expect(clone.querySelector('.content-module-title')?.textContent).toBe(
            'Lerngruppenübersicht',
        );
        expect(clone.querySelector('.content-module-subtitle')?.textContent).toBe('Untertitel');
        expect(clone.querySelector('.content-module-body')).not.toBeNull();
        expect(clone.querySelector('.content-module-header-actions')).toBeNull();
        expect(clone.querySelector('.table-preset-container')).toBeNull();
        expect(clone.querySelector('.content-module-toggle')).toBeNull();
        expect(clone.querySelector('[data-header-action-button]')).toBeNull();
        expect(clone.querySelector('.header-action-dropdown')).toBeNull();

        // The live card is untouched; the clone was rasterized from the
        // off-screen stage in the document, which is gone afterwards.
        expect(card.querySelector('.content-module-header-actions')).not.toBeNull();
        expect(connected).toBe(true);
        expect(stage?.classList.contains('export-capture-stage')).toBe(true);
        expect(document.querySelector('.export-capture-stage')).toBeNull();
    });

    it('hands the module a live → clone mapper, and leaves the body to grow', async () => {
        // Only the module knows what its clone is missing (a virtual-DOM table
        // carries the visible rows only). It looks its own live node up, so the
        // mapper must answer for every element of the tree, the root included, and
        // never with a live node.
        const card = buildModuleCard({ withTable: true });
        const liveTable = /** @type {HTMLElement} */ (card.querySelector('.tabulator'));

        let rootCopy = null;
        let tableCopy = null;
        const { clone } = await captureClone(card, (cloneOf) => {
            rootCopy = cloneOf(card);
            tableCopy = cloneOf(liveTable);
            const printed = document.createElement('div');
            printed.innerHTML = PRINT_TABLE_HTML;
            tableCopy?.replaceWith(printed);
        });

        expect(rootCopy).toBe(clone);
        expect(tableCopy).not.toBe(liveTable);

        expect(clone.querySelector('.tabulator')).toBeNull();
        expect(clone.querySelectorAll('.tabulator-print-table td')).toHaveLength(2);
        // A chart host pins its own body (ChartHostModule.prepareExportClone); the stage
        // fixes no height.
        expect(bodyOf(clone).style.height).toBe('');
        expect(card.querySelector('.tabulator')).toBe(liveTable);
    });

    it('copies runtime form state (cloneNode only copies attributes)', async () => {
        const card = buildModuleCard();
        required(card.querySelector('select')).selectedIndex = 1;

        const { clone } = await captureClone(card);
        expect(required(clone.querySelector('select')).selectedIndex).toBe(1);
    });

    // A report or PDF exported in dark mode must not put dark cards on white paper; a
    // PNG keeps the screen's scheme.
    it('captures for paper in the light scheme, and for the screen in its own', async () => {
        const style = document.createElement('style');
        // As contentModule.css paints it.
        style.textContent = '.content-module-subtitle { color: var(--text-secondary); }';
        document.head.appendChild(style);
        document.documentElement.dataset.colorScheme = 'dark';
        /** @type {Array<{background: unknown, ink: string}>} */
        const captures = [];
        vi.mocked(toCanvas).mockImplementation(async (node, options) => {
            captures.push({
                background: options?.backgroundColor,
                ink: getComputedStyle(required(node.querySelector('.content-module-subtitle')))
                    .color,
            });
            return document.createElement('canvas');
        });
        const module = exportableModule(buildModuleCard());

        try {
            await captureExportRoot({ module }, { paper: true });
            await captureExportRoot({ module });

            expect(captures).toEqual([
                { background: 'rgb(255, 255, 255)', ink: 'rgb(102, 102, 102)' },
                { background: 'rgb(30, 36, 48)', ink: 'rgb(179, 186, 198)' },
            ]);
        } finally {
            vi.mocked(toCanvas).mockReset();
            delete document.documentElement.dataset.colorScheme;
            style.remove();
        }
    });

    // html-to-image deep-clones <svg> subtrees without inlining computed styles, so
    // CSS-painted chart content (competence bands via --competence-level-band-color,
    // axis text) rasterizes black unless the stage resolves that paint onto the
    // elements first.
    it('inlines stylesheet-driven SVG paint on the clone so it survives rasterization', async () => {
        const style = document.createElement('style');
        style.textContent =
            '.bar-segment.competence-level { fill: var(--competence-level-band-color); } .axis text { fill: rgb(90, 90, 90); stroke: none; }';
        document.head.appendChild(style);
        const card = buildModuleCard();
        required(card.querySelector('.content-module-body svg')).innerHTML = `
            <rect class="bar-segment competence-level" style="--competence-level-band-color: rgb(214, 69, 80)"></rect>
            <g class="axis"><text>A1</text></g>`;

        const { clone } = await captureClone(card);

        const rect = required(clone.querySelector('rect'));
        const text = required(clone.querySelector('text'));
        expect(rect.style.getPropertyValue('fill')).toBe('rgb(214, 69, 80)');
        expect(text.style.getPropertyValue('fill')).toBe('rgb(90, 90, 90)');
        expect(required(card.querySelector('rect')).style.getPropertyValue('fill')).toBe('');
        style.remove();
    });
});
