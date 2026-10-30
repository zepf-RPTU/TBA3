// @vitest-browser

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TableModule } from '../../../src/common/tables/tableModule.js';
import { FakeTabulator, resetFakeTabulator } from '../../support/tableHarness.js';
import { createTestModuleOptions } from '../../support/glossaryFixture.js';
import { required } from '../../support/required.js';
import { mountModule } from '../../support/dom.js';

vi.mock('../../../src/common/tables/tabulatorBuild.js', async () => ({
    Tabulator: (await import('../../support/tableHarness.js')).FakeTabulator,
}));

// An export rasterizes a clone of the card, which cannot carry a Tabulator table:
// it renders only the rows in view, and a table built inside a collapsed card has laid
// out no columns. Without these hooks the exported file holds a few rows, or none.

class TestTableModule extends TableModule {
    /** @override */
    async _renderBody() {
        this.createTable({
            container: this.contentContainer,
            columns: [{ field: 'name' }],
            data: [{ name: 'Ada' }],
        });
        required(FakeTabulator.instances.at(-1)).emit('tableBuilt');
    }
}

customElements.define('test-export-table', TestTableModule);

/**
 * A rendered table card.
 * @param {{[key: string]: any}} [options]
 * @returns {Promise<TestTableModule>}
 */
async function mountTable(options = {}) {
    const module = TestTableModule.create('class-table', {
        ...createTestModuleOptions(),
        showModuleTitle: true,
        title: 'Lerngruppe',
        ...options,
    });
    return mountModule(module, {});
}

beforeEach(() => {
    resetFakeTabulator();
});

describe('TableModule export capture hooks', () => {
    it('swaps its own table for the full styled table of the active rows in the clone, live DOM untouched', async () => {
        const module = await mountTable();
        const printTable = document.createElement('table');
        printTable.className = 'tabulator-print-table';
        printTable.insertRow().insertCell().textContent = 'Ada';
        const generateTable = vi.fn(() => printTable);
        // The export module and options Tabulator keeps internally, which the clone hook reads.
        const table = Object.assign(required(FakeTabulator.instances[0]), {
            modules: { export: { generateTable } },
            options: { htmlOutputConfig: { columnHeaders: true } },
        });

        const card = module;
        const clone = /** @type {HTMLElement} */ (card.cloneNode(true));
        const liveNodes = [card, ...card.querySelectorAll('*')];
        const cloneNodes = [clone, ...clone.querySelectorAll('*')];
        const cloneOf = (/** @type {Element} */ live) =>
            cloneNodes[liveNodes.indexOf(live)] ?? null;

        module.prepareExportClone(cloneOf);

        expect(generateTable).toHaveBeenCalledWith(
            { columnHeaders: true },
            true,
            'active',
            'htmlOutput',
        );
        expect(required(clone.querySelector('table td')).textContent).toBe('Ada');
        expect(clone.contains(cloneOf(table.element))).toBe(false);
        expect(card.contains(table.element)).toBe(true);
    });

    it('opens a collapsed card, lays the table out with room, and collapses it again', async () => {
        // ResponsiveLayout: 'hide' drops every column of a zero-width table,
        // so the export of a collapsed card would be a headline with nothing under it.
        const module = await mountTable({ collapsible: true });
        module.collapse();
        module.show();
        const table = required(FakeTabulator.instances[0]);
        table.redraw = vi.fn();
        // A real table has rows to give it height; a redraw skips a table with no box.
        table.element.style.height = '40px';
        const card = module;
        expect(card.classList.contains('collapsed')).toBe(true);

        const restore = module.prepareExportCapture();
        await module.whenSettled();

        expect(card.classList.contains('collapsed')).toBe(false);
        expect(table.redraw).toHaveBeenCalledWith(true);

        restore();
        expect(card.classList.contains('collapsed')).toBe(true);
    });

    it('leaves an open card alone', async () => {
        const module = await mountTable();
        module.show();
        const table = required(FakeTabulator.instances[0]);
        table.redraw = vi.fn();

        const restore = module.prepareExportCapture();
        await module.whenSettled();

        expect(table.redraw).not.toHaveBeenCalled();
        restore();
        expect(module.classList.contains('collapsed')).toBe(false);
    });
});
