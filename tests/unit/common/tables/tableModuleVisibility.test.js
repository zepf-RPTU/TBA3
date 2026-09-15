// @vitest-browser

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TableModule } from '@tba3/modules/common/tables/tableModule.js';
import { FakeTabulator, resetFakeTabulator } from '../../support/tableHarness.js';

vi.mock('@tba3/modules/common/tables/tabulatorBuild.js', async () => ({
    Tabulator: (await import('../../support/tableHarness.js')).FakeTabulator,
}));

class TestTableModule extends TableModule {
    queueWhenHidden(key, operation) {
        return this.deferOperationUntilVisible(key, operation);
    }

    isVisibilityLocked(field) {
        return this._isColumnVisibilityLocked(field);
    }

    _doRender() {}
}

describe('TableModule visibility deferral', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
        resetFakeTabulator();
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    // Synchronously: show() redraws right after the flush so the deferred content
    // change and the redraw land in the same paint instead of a stale paint + snap.
    it('flushes operations deferred while hidden synchronously when the module is shown', () => {
        const container = document.createElement('div');
        container.id = 'table-host';
        document.body.appendChild(container);
        const tableModule = new TestTableModule('table-module', container);
        const calls = [];

        tableModule.createTable({
            containerId: 'table-host',
            columns: [{ field: 'name' }],
            data: [{ name: 'Ada' }],
            options: { disablePresets: true },
        });
        FakeTabulator.instances[0].emit('tableBuilt');

        expect(tableModule.queueWhenHidden('data-update', () => calls.push('flushed'))).toBe(false);

        tableModule.show();

        expect(calls).toEqual(['flushed']);
    });
});

describe('TableModule column visibility lock', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
        resetFakeTabulator();
    });

    // WHY: the hidden sort-target and export-only columns must never be revealed
    // by a mode- or filter-driven visibility pass. EN's pass shows any field it
    // does not recognise when the mode is 'all', so it needs this predicate to
    // tell "the user could toggle this" from "its visibility is fixed".
    it('reports columns excluded from the visibility menu as locked', () => {
        const container = document.createElement('div');
        container.id = 'table-host';
        document.body.appendChild(container);
        const tableModule = new TestTableModule('table-module', container);

        tableModule.createTable({
            containerId: 'table-host',
            columns: [
                { field: 'name' },
                {
                    field: 'correctCount',
                    visible: false,
                    tableMeta: { excludeFromColumnVisibilityMenu: true },
                },
            ],
            data: [{ name: 'Ada', correctCount: 3 }],
            options: { disablePresets: true },
        });

        expect(tableModule.isVisibilityLocked('correctCount')).toBe(true);
        expect(tableModule.isVisibilityLocked('name')).toBe(false);
    });
});
