// @vitest-browser

import { signal } from '@preact/signals-core';
import { describe, expect, it, vi } from 'vitest';
import { BaseStudentDataTableModule } from '../../../src/common/tables/baseStudentDataTableModule.js';
import { BaseStudentInfoTableModule } from '../../../src/common/tables/baseStudentInfoTableModule.js';
import { createTestModuleOptions } from '../../support/glossaryFixture.js';
import { mountTable } from '../../support/tableHarness.js';

vi.mock('../../../src/common/tables/tabulatorBuild.js', async () => ({
    Tabulator: (await import('../../support/tableHarness.js')).FakeTabulator,
}));

// A student table follows the app's selected student itself: the view hands it the
// signal, and a switch while the table is hidden (another layout mode, a folded card)
// lands when it is shown again — never into a table nobody sees.

/** @type {{[studentId: string]: Array<{name: string}>}} Each student's item rows. */
const ITEM_ROWS = {
    s1: [{ name: 'Aufgabe 1' }],
    s2: [{ name: 'Aufgabe 2' }, { name: 'Aufgabe 3' }],
};

class DataTable extends BaseStudentDataTableModule {
    /**
     * @override
     * @param {string} studentId
     */
    _readStudent(studentId) {
        return { rows: ITEM_ROWS[studentId] ?? [], reachedSpanOf: () => null };
    }

    /** @override */
    _tableSpec() {
        return { columns: [{ field: 'name' }] };
    }
}
customElements.define('test-student-data-table', DataTable);

class InfoTable extends BaseStudentInfoTableModule {
    /**
     * @override
     * @returns {import('../../../src/common/tables/columnFactories.js').TableColumnDefinition[]}
     */
    _getColumns() {
        return [{ field: 'name' }];
    }

    /**
     * @override
     * @returns {Array<{studentId: string, name: string}>}
     */
    _readStudentRecords() {
        return [
            { studentId: 's1', name: 'Ada' },
            { studentId: 's2', name: 'Ben' },
        ];
    }
}
customElements.define('test-student-info-table', InfoTable);

/** @typedef {Parameters<typeof DataTable.create>[1]} StudentTableOptions */

describe.each([
    [
        'the student data table',
        (/** @type {string} */ id, /** @type {StudentTableOptions} */ options) =>
            DataTable.create(id, options),
        (/** @type {string} */ id) => ITEM_ROWS[id],
    ],
    [
        'the student info table',
        (/** @type {string} */ id, /** @type {StudentTableOptions} */ options) =>
            InfoTable.create(id, options),
        (/** @type {string} */ id) => [{ studentId: id, name: id === 's1' ? 'Ada' : 'Ben' }],
    ],
])('%s follows its studentId signal', (_name, create, rowsOf) => {
    /**
     * @param {import('@preact/signals-core').Signal<string|null>} studentId
     */
    async function mount(studentId) {
        const module = create(`student-table-${Math.random()}`, {
            ...createTestModuleOptions(),
            studentId,
        });
        const table = await mountTable(module);
        return { module, table };
    }

    it('re-reads the rows when the student changes', async () => {
        const studentId = signal(/** @type {string|null} */ ('s1'));
        const { table } = await mount(studentId);
        expect(table.getData()).toEqual(rowsOf('s1'));

        studentId.value = 's2';

        await vi.waitFor(() => expect(table.getData()).toEqual(rowsOf('s2')));
    });

    it('applies a change made while hidden once it is shown, and leaves it for no student', async () => {
        const studentId = signal(/** @type {string|null} */ ('s1'));
        const { module, table } = await mount(studentId);

        module.hide();
        studentId.value = 's2';
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(table.getData()).toEqual(rowsOf('s1'));

        module.show();
        await vi.waitFor(() => expect(table.getData()).toEqual(rowsOf('s2')));

        studentId.value = null;
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(table.getData()).toEqual(rowsOf('s2'));
    });
});

describe('the student data table export identity', () => {
    it('names the student it follows', async () => {
        const studentId = signal(/** @type {string|null} */ ('s1'));
        const module = DataTable.create('student-identity', {
            ...createTestModuleOptions(),
            studentId,
        });
        await mountTable(module);
        expect(module.getExportIdentity()).toBe('s1');

        studentId.value = 's2';
        expect(module.getExportIdentity()).toBe('s2');
    });
});
