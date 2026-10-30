// @vitest-browser

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TableModule } from '../../../src/common/tables/tableModule.js';
import { FakeTabulator, resetFakeTabulator } from '../../support/tableHarness.js';
import { createTestModuleOptions } from '../../support/glossaryFixture.js';
import { required } from '../../support/required.js';

/** @typedef {import('tabulator-tables').ColumnComponent} ColumnComponent */

vi.mock('../../../src/common/tables/tabulatorBuild.js', async () => ({
    Tabulator: (await import('../../support/tableHarness.js')).FakeTabulator,
}));

class TestTableModule extends TableModule {
    /**
     * @param {string} key - The operation's key; a later one replaces it.
     * @param {() => void} operation - Run now if visible, else on show.
     * @returns {boolean} Whether it ran now.
     */
    queueWhenHidden(key, operation) {
        return this.deferUntilReady(key, operation);
    }

    /** @param {(column: ColumnComponent) => boolean | undefined} getShouldShow */
    applyVisibility(getShouldShow) {
        this._applyColumnVisibility(getShouldShow);
    }

    /** @override */
    async _renderBody() {}
}

customElements.define('test-visibility-table', TestTableModule);

describe('TableModule visibility deferral', () => {
    beforeEach(() => {
        resetFakeTabulator();
        vi.useFakeTimers();
    });

    // Synchronously: show() redraws right after the flush, so the deferred change and
    // the redraw land in the same paint.
    it('flushes operations deferred while hidden synchronously when the module is shown', async () => {
        const container = document.createElement('div');
        container.id = 'table-host';
        document.body.appendChild(container);
        const tableModule = TestTableModule.create('table-module', createTestModuleOptions());
        document.body.appendChild(tableModule);
        /** @type {string[]} */
        const calls = [];

        tableModule.createTable({
            container,
            columns: [{ field: 'name' }],
            data: [{ name: 'Ada' }],
        });
        required(FakeTabulator.instances[0]).emit('tableBuilt');
        // The settle redraw ends the build.
        await vi.runAllTimersAsync();
        tableModule.hide();

        expect(tableModule.queueWhenHidden('data-update', () => calls.push('flushed'))).toBe(false);

        tableModule.show();

        expect(calls).toEqual(['flushed']);
    });

    // A build is made for the state at its start: an operation arriving while it runs
    // (a mode switch during the first build) waits until it has settled.
    it('holds an operation that arrives during a build until the build has settled', async () => {
        const container = document.createElement('div');
        document.body.appendChild(container);
        const tableModule = TestTableModule.create('table-module', createTestModuleOptions());
        document.body.appendChild(tableModule);
        /** @type {string[]} */
        const calls = [];

        tableModule.createTable({
            container,
            columns: [{ field: 'name' }],
            data: [{ name: 'Ada' }],
        });
        tableModule.queueWhenHidden('mode', () => calls.push('applied'));
        await Promise.resolve();
        expect(calls).toEqual([]);

        required(FakeTabulator.instances[0]).emit('tableBuilt');
        await vi.runAllTimersAsync();

        expect(calls).toEqual(['applied']);
    });

    // A table hidden while it built would take the change at the wrong width, and
    // the show after it would find nothing deferred to redraw for.
    it('holds an operation that waited for a build until the table is shown, when it was hidden meanwhile', async () => {
        const container = document.createElement('div');
        document.body.appendChild(container);
        const tableModule = TestTableModule.create('table-module', createTestModuleOptions());
        document.body.appendChild(tableModule);
        /** @type {string[]} */
        const calls = [];

        tableModule.createTable({ container, columns: [{ field: 'name' }], data: [] });
        tableModule.queueWhenHidden('mode', () => calls.push('applied'));
        tableModule.hide();
        required(FakeTabulator.instances[0]).emit('tableBuilt');
        await vi.runAllTimersAsync();
        expect(calls).toEqual([]);

        tableModule.show();
        expect(calls).toEqual(['applied']);
    });

    it('runs only the latest operation per key that waited for a build, and none once torn down', async () => {
        const container = document.createElement('div');
        document.body.appendChild(container);
        const tableModule = TestTableModule.create('table-module', createTestModuleOptions());
        document.body.appendChild(tableModule);
        /** @type {string[]} */
        const calls = [];

        tableModule.createTable({ container, columns: [{ field: 'name' }], data: [] });
        tableModule.queueWhenHidden('mode', () => calls.push('first'));
        tableModule.queueWhenHidden('mode', () => calls.push('latest'));
        required(FakeTabulator.instances[0]).emit('tableBuilt');
        await vi.runAllTimersAsync();
        expect(calls).toEqual(['latest']);

        tableModule.createTable({ container, columns: [{ field: 'name' }], data: [] });
        tableModule.queueWhenHidden('mode', () => calls.push('after teardown'));
        tableModule.remove();
        await vi.runAllTimersAsync();
        expect(calls).toEqual(['latest']);
    });

    it('lets an operation deferred while hidden replace one under its key that waited for the build', async () => {
        // A student picked during a build, then another picked while the tab is hidden:
        // the table must show the second.
        const container = document.createElement('div');
        document.body.appendChild(container);
        const tableModule = TestTableModule.create('table-module', createTestModuleOptions());
        document.body.appendChild(tableModule);
        /** @type {string[]} */
        const calls = [];

        tableModule.createTable({ container, columns: [{ field: 'name' }], data: [] });
        tableModule.queueWhenHidden('student', () => calls.push('first'));
        tableModule.hide();
        tableModule.queueWhenHidden('student', () => calls.push('second'));
        required(FakeTabulator.instances[0]).emit('tableBuilt');
        await vi.runAllTimersAsync();
        tableModule.show();

        expect(calls).toEqual(['second']);
    });

    // A deferred operation has no caller left to catch its throw; unreported, it
    // is an unhandled rejection naming neither the module nor the operation.
    it('logs an operation that throws after a build with its key', async () => {
        const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
        const container = document.createElement('div');
        document.body.appendChild(container);
        const tableModule = TestTableModule.create('table-module', createTestModuleOptions());
        document.body.appendChild(tableModule);
        const failure = new Error('boom');

        tableModule.createTable({
            container,
            columns: [{ field: 'name' }],
            data: [{ name: 'Ada' }],
        });
        tableModule.queueWhenHidden('student', () => {
            throw failure;
        });
        required(FakeTabulator.instances[0]).emit('tableBuilt');
        await vi.runAllTimersAsync();

        expect(consoleError).toHaveBeenCalledWith(
            "TableModule[table-module]: Error executing pending operation 'student':",
            failure,
        );
        consoleError.mockRestore();
    });
});

describe('TableModule column visibility pass', () => {
    beforeEach(() => {
        resetFakeTabulator();
    });

    /**
     * @param {string} field
     * @param {boolean} visible - Whether it starts visible.
     */
    const fakeColumn = (field, visible) => {
        const column = {
            visible,
            getField: () => field,
            isVisible: () => column.visible,
            show: vi.fn(() => {
                column.visible = true;
            }),
            hide: vi.fn(() => {
                column.visible = false;
            }),
        };
        return column;
    };

    // The hidden sort-target and export-only columns must never be revealed
    // by a mode- or filter-driven visibility pass, and a column the rule does not
    // govern keeps the visibility the user gave it.
    it('never touches menu-excluded columns and leaves undecided ones alone', () => {
        const container = document.createElement('div');
        container.id = 'table-host';
        document.body.appendChild(container);
        const tableModule = TestTableModule.create('table-module', createTestModuleOptions());
        document.body.appendChild(tableModule);

        tableModule.createTable({
            container,
            columns: [
                { field: 'name' },
                {
                    field: 'correctCount',
                    visible: false,
                    tableMeta: { excludeFromColumnVisibilityMenu: true },
                },
            ],
            data: [{ name: 'Ada', correctCount: 3 }],
        });
        const columns = [
            fakeColumn('name', true),
            fakeColumn('correctCount', false),
            fakeColumn('gender', false),
        ];
        // The visibility pass reads only these members of a column.
        required(tableModule.table).getColumns = () =>
            /** @type {ColumnComponent[]} */ (/** @type {unknown} */ (columns));

        tableModule.applyVisibility((column) =>
            column.getField() === 'name'
                ? false
                : column.getField() === 'correctCount' || undefined,
        );

        expect(columns.map((column) => column.visible)).toEqual([false, false, false]);
        expect(columns[1].show).not.toHaveBeenCalled();
        expect(columns[2].show).not.toHaveBeenCalled();
    });
});
