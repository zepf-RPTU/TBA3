// @vitest-browser
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SlBaseTableModule } from '@tba3/modules/sl/modules/tables/slBaseTableModule.js';
import { resetFakeTabulator, stubCanvasTextMeasurement } from '../../../support/tableHarness.js';

vi.mock('@tba3/modules/common/tables/tabulatorBuild.js', async () => ({
    Tabulator: (await import('../../../support/tableHarness.js')).FakeTabulator,
}));

// WHY this file exists: TableModule's header toolbar widgets (column
// visibility, filters) bind to `this.table`, which in a multi-table module is
// only the last-created table. Probing the SL dashboard (2026-08-15) showed
// the "Klassenübersicht" module's column menu toggling exactly one of its five
// tables, and reading its checked-state from a collapsed, responsive-hidden
// one. SlBaseTableModule therefore offers the shared toolbar only while it
// manages a single table. The positive case is here so the negative one cannot
// pass by the toolbar simply never being built in this harness.

class TestSlTableModule extends SlBaseTableModule {
    /** @type {any[]} */
    tables = [];

    _getActiveTables() {
        return this.tables;
    }

    createTable(spec) {
        const table = super.createTable(spec);
        if (table) this.tables.push(table);
        return table;
    }
}

const COLUMNS = [
    { title: 'Fach', field: 'subjectName' },
    { title: 'Domäne', field: 'domain' },
];

/** Await enough animation frames for scheduleSettled's frame + follow-up frame. */
function flushRedrawFrames() {
    return new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(resolve))),
    );
}

stubCanvasTextMeasurement();

let root;
let modules;

function makeModule() {
    const host = document.createElement('div');
    host.id = `sl-toolbar-host-${modules.length}`;
    root.appendChild(host);
    const module = new TestSlTableModule(host.id, host, { showModuleTitle: true, title: 'Test' });
    module.mount();
    modules.push(module);
    return module;
}

/** Give the module a fresh table host inside its content area, as _createTableHost does. */
function tableHostFor(module, suffix) {
    const el = document.createElement('div');
    el.id = `${module.id}-table-${suffix}`;
    module.contentContainer.appendChild(el);
    return el.id;
}

function buildTable(module, suffix) {
    return module.createTable({
        containerId: tableHostFor(module, suffix),
        columns: COLUMNS,
        data: [{ subjectName: 'Deutsch', domain: 'Lesen' }],
        options: { disablePresets: true },
    });
}

const columnMenuOf = (module) =>
    module.headerActionsContainer?.querySelector('[data-header-action-button="table-columns"]');

beforeEach(() => {
    resetFakeTabulator();
    modules = [];
    root = document.createElement('div');
    document.body.appendChild(root);
});

afterEach(() => {
    modules.forEach((module) => module.destroy?.());
    root.remove();
});

describe('SlBaseTableModule — module-level table toolbar', () => {
    it('offers the column-visibility menu while it manages a single table', async () => {
        const module = makeModule();
        const table = buildTable(module, 'only');

        table.emit('tableBuilt');
        await flushRedrawFrames();

        expect(columnMenuOf(module)).not.toBeNull();
    });

    it('offers no column-visibility menu once it manages several tables — one menu cannot drive them all', async () => {
        const module = makeModule();
        const first = buildTable(module, 'school');
        const second = buildTable(module, 'class-a');

        first.emit('tableBuilt');
        second.emit('tableBuilt');
        await flushRedrawFrames();

        expect(columnMenuOf(module)).toBeNull();
    });
});
