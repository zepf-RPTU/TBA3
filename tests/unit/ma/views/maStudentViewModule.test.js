// @vitest-browser

import { describe, it, expect, vi } from 'vitest';

/**
 * The student view rebuilds its task rings whenever the selection changes. Those rings
 * must be drawn from the app payload as it stands at that moment, not from the one the
 * view held when it wired the callback — the children are stood in so the only thing
 * observed is what data the ring host is handed.
 */

const captured = vi.hoisted(() => ({ tableOptions: null, ringData: [] }));

vi.mock('../../../../src/ma/modules/maStudentTables/maStudentTablesModule.js', async () => {
    const { BaseModule } = await import('@tba3/module-base/modules/baseModule.js');
    class MaStudentTablesModule extends BaseModule {
        constructor(id, container, options) {
            super(id, container, options);
            captured.tableOptions = options;
        }
        mount() {}
        async hydrate() {}
        setSelectedStudentId() {}
        redraw() {}
    }
    return { MaStudentTablesModule };
});

vi.mock('../../../../src/ma/modules/maStudentTopBar/maStudentTopBarModule.js', async () => {
    const { BaseModule } = await import('@tba3/module-base/modules/baseModule.js');
    class MaStudentTopBarModule extends BaseModule {
        mount() {}
        async hydrate() {}
        async setStudent() {}
    }
    return { MaStudentTopBarModule };
});

vi.mock('@tba3/modules/ma/modules/charts/taskRing/taskRingHostUtils.js', () => ({
    remountChartHost: async ({ data }) => {
        captured.ringData.push(data);
        return { module: null, status: 'rebuild' };
    },
    updateTaskRingHostIfReusable: async () => 'rebuild',
}));

const { MaStudentViewModule } = await import('../../../../src/ma/views/maStudentViewModule.js');

const payload = (label) => ({
    studentArray: [{ studentId: 's1' }, { studentId: 's2' }],
    rawStudentArray: [],
    itemArray: [{ iqbId: `${label}-1`, domain: 'zo' }],
});

describe('MaStudentViewModule', () => {
    it('draws a new selection from the current app payload, not the one it was built with', async () => {
        const container = document.createElement('div');
        document.body.appendChild(container);
        const view = new MaStudentViewModule('ma-student', container, {
            appState: { observe: () => () => {}, getStateValue: () => null, updateState() {} },
            dataStore: { getDataset: () => [] },
        });

        const first = payload('first');
        view.setData(first);
        await view._renderView();
        expect(captured.ringData.at(-1).itemArray).toBe(first.itemArray);

        // The app payload moves on; the table then reports a selection.
        const second = payload('second');
        view.setData(second);
        captured.tableOptions.onSelectionChanged('s2');

        await vi.waitFor(() => expect(captured.ringData).toHaveLength(2));
        expect(captured.ringData.at(-1)).toMatchObject({
            itemArray: second.itemArray,
            studentArray: second.studentArray,
            selectedStudents: ['s2'],
        });
    });
});
