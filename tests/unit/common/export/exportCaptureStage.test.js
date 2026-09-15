// @vitest-browser

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
    EXPORT_EXCLUDE_SELECTOR,
    buildCaptureStage,
    findTablesInRoot,
    resolveCaptureRoot,
} from '../../../../src/common/export/exportCapture.js';

vi.mock('@tba3/modules/common/tables/tabulatorBuild.js', () => ({
    Tabulator: { findTable: vi.fn() },
}));
import { Tabulator } from '@tba3/modules/common/tables/tabulatorBuild.js';
// The collapse rules the reveal logic relies on (a collapsed card's body is display:none).
import '@tba3/module-base/modules/contentModule.css';

// WHY: the capture stage is what gets rasterized. If a button, preset bar or
// collapsed body leaks into (or content drops out of) the clone, every PDF/PNG
// is wrong while the download itself still "works".

const PRINT_TABLE_HTML =
    '<table class="tabulator-print-table"><tbody><tr><td>row 1</td></tr><tr><td>row 2</td></tr></tbody></table>';

function buildModuleCard({ collapsed = false, withTable = false } = {}) {
    const card = document.createElement('div');
    card.className = `module-container${collapsed ? ' collapsed' : ''}`;
    const body = withTable
        ? '<div class="tabulator"><div class="tabulator-tableholder">visible rows only</div></div>'
        : '<svg></svg>';
    card.innerHTML = `
        <div class="content-module-header">
            <svg class="icon content-module-chevron"></svg>
            <h2 class="content-module-title">Klassenübersicht</h2>
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

describe('resolveCaptureRoot', () => {
    afterEach(() => {
        document.body.innerHTML = '';
    });

    it('maps a body id (ContentModule transfers the module id to the body) to the enclosing card', () => {
        const card = buildModuleCard();
        expect(resolveCaptureRoot('module-1')).toBe(card);
        expect(resolveCaptureRoot(card.querySelector('#module-1'))).toBe(card);
    });

    it('returns a bare element as-is and null for unknown targets', () => {
        const loose = document.createElement('div');
        document.body.appendChild(loose);
        expect(resolveCaptureRoot(loose)).toBe(loose);
        expect(resolveCaptureRoot('does-not-exist')).toBeNull();
        expect(resolveCaptureRoot(null)).toBeNull();
    });
});

describe('buildCaptureStage', () => {
    let getHtml;

    beforeEach(() => {
        getHtml = vi.fn(() => PRINT_TABLE_HTML);
        Tabulator.findTable.mockImplementation(() => [{ getHtml }]);
    });

    afterEach(() => {
        document.body.innerHTML = '';
        Tabulator.findTable.mockReset();
    });

    it('keeps title/subtitle/body but removes every interactive control from the clone', () => {
        const card = buildModuleCard();
        const { stage, clone } = buildCaptureStage(card);

        expect(clone.querySelector('.content-module-title')?.textContent).toBe('Klassenübersicht');
        expect(clone.querySelector('.content-module-subtitle')?.textContent).toBe('Untertitel');
        expect(clone.querySelector('.content-module-body')).not.toBeNull();
        expect(clone.querySelectorAll(EXPORT_EXCLUDE_SELECTOR)).toHaveLength(0);
        expect(clone.querySelector('.content-module-header-actions')).toBeNull();
        expect(clone.querySelector('.content-module-chevron')).toBeNull();

        // The live card is untouched.
        expect(card.querySelector('.content-module-header-actions')).not.toBeNull();
        expect(stage.contains(clone)).toBe(true);
    });

    it('expands collapsed cards so hidden content is exported, without touching the live card', () => {
        const card = buildModuleCard({ collapsed: true });
        const { clone } = buildCaptureStage(card);

        expect(clone.classList.contains('collapsed')).toBe(false);
        expect(card.classList.contains('collapsed')).toBe(true);
    });

    it('swaps virtual-DOM Tabulator nodes for the full HTML output of the active rows and lets the body grow', () => {
        const card = buildModuleCard({ withTable: true });
        const { clone } = buildCaptureStage(card);

        expect(Tabulator.findTable).toHaveBeenCalledWith(card.querySelector('.tabulator'));
        expect(getHtml).toHaveBeenCalledWith('active', true);
        expect(clone.querySelector('.tabulator')).toBeNull();
        expect(clone.querySelectorAll('.tabulator-print-table td')).toHaveLength(2);
        expect(clone.querySelector('.content-module-body').style.height).toBe('auto');
    });

    it('reveals tables hidden inside collapsed cards for the clone build, redraws them, and restores the live state', () => {
        // WHY: SL section tables use responsiveLayout:'hide' — collapsed (0-width)
        // sections hide every column and getHtml() comes back empty. The real
        // content-module stylesheet (imported above) hides a collapsed card's body,
        // so the table reports no client rects, exactly as in the app.
        const card = buildModuleCard({ collapsed: true, withTable: true });
        const redraw = vi.fn();
        Tabulator.findTable.mockImplementation(() => [{ getHtml, redraw, destroyed: false }]);

        const { clone } = buildCaptureStage(card);

        expect(redraw).toHaveBeenCalledWith(true);
        expect(getHtml).toHaveBeenCalledWith('active', true);
        expect(clone.classList.contains('collapsed')).toBe(false);
        expect(clone.querySelectorAll('.tabulator-print-table td')).toHaveLength(2);
        // Live card is collapsed again once the clone exists.
        expect(card.classList.contains('collapsed')).toBe(true);
    });

    it('freezes chart bodies at their live pixel height (SVGs size via height:100%)', () => {
        const card = buildModuleCard();
        const liveBody = card.querySelector('.content-module-body');
        Object.defineProperty(liveBody, 'clientHeight', { value: 320, configurable: true });
        Object.defineProperty(liveBody, 'scrollHeight', { value: 320, configurable: true });

        const { clone } = buildCaptureStage(card);
        expect(clone.querySelector('.content-module-body').style.height).toBe('320px');
    });

    it('lets scrolling bodies expand to their full content', () => {
        const card = buildModuleCard();
        const liveBody = card.querySelector('.content-module-body');
        Object.defineProperty(liveBody, 'clientHeight', { value: 200, configurable: true });
        Object.defineProperty(liveBody, 'scrollHeight', { value: 900, configurable: true });

        const { clone } = buildCaptureStage(card);
        expect(clone.querySelector('.content-module-body').style.height).toBe('auto');
    });

    it('copies runtime form state (cloneNode only copies attributes)', () => {
        const card = buildModuleCard();
        card.querySelector('select').selectedIndex = 1;

        const { clone } = buildCaptureStage(card);
        expect(clone.querySelector('select').selectedIndex).toBe(1);
    });

    it('mounts the stage as the next sibling of the live root and marks it data-exporting', () => {
        const card = buildModuleCard();
        const { stage } = buildCaptureStage(card);

        expect(card.nextSibling).toBe(stage);
        expect(stage.hasAttribute('data-exporting')).toBe(true);
        expect(stage.classList.contains('export-capture-stage')).toBe(true);
    });

    // html-to-image deep-clones <svg> subtrees without inlining computed styles,
    // so CSS-painted chart content (competence bands via --ks-band-color, axis
    // text) would rasterize with SVG defaults — black — unless the stage
    // resolves that paint onto the elements first.
    // (jsdom applies the cascade but does not resolve var(); the browser path
    // with --ks-band-color is covered by tests/e2e/module-export.spec.js.)
    it('inlines stylesheet-driven SVG paint on the clone so it survives rasterization', () => {
        const style = document.createElement('style');
        style.textContent =
            '.bar-segment.competency-level { fill: rgb(214, 69, 80); } .axis text { fill: rgb(90, 90, 90); stroke: none; }';
        document.head.appendChild(style);
        const card = buildModuleCard();
        card.querySelector('.content-module-body svg').innerHTML = `
            <rect class="bar-segment competency-level"></rect>
            <g class="axis"><text>A1</text></g>`;

        const { clone } = buildCaptureStage(card);

        const rect = clone.querySelector('rect');
        const text = clone.querySelector('text');
        expect(rect.style.getPropertyValue('fill')).toBe('rgb(214, 69, 80)');
        expect(text.style.getPropertyValue('fill')).toBe('rgb(90, 90, 90)');
        // The live chart is untouched.
        expect(card.querySelector('rect').style.getPropertyValue('fill')).toBe('');
        style.remove();
    });
});

describe('findTablesInRoot', () => {
    afterEach(() => {
        document.body.innerHTML = '';
        Tabulator.findTable.mockReset();
    });

    it('returns the Tabulator instance behind every .tabulator element in DOM order', () => {
        const root = document.createElement('div');
        root.innerHTML =
            '<div class="tabulator" id="t1"></div><div class="tabulator" id="t2"></div>';
        document.body.appendChild(root);
        const instances = { t1: { name: 't1' }, t2: { name: 't2' } };
        Tabulator.findTable.mockImplementation((el) => [instances[el.id]]);

        expect(findTablesInRoot(root).map((t) => t.name)).toEqual(['t1', 't2']);
    });

    it('skips a .tabulator element no instance is registered for', () => {
        Tabulator.findTable.mockImplementation(() => false);
        const root = document.createElement('div');
        root.innerHTML = '<div class="tabulator"></div>';
        expect(findTablesInRoot(root)).toEqual([]);
    });
});
