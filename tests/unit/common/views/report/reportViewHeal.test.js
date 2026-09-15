// @vitest-browser

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// WHY: the cart (localStorage) and the images (IndexedDB) can drift when the
// image side is lost — IndexedDB unusable/evicted while the cart survived. A
// selection without an image is useless to the report; leaving it in the cart
// makes the toolbar count and the module checkboxes disagree with the report.
// The report therefore drops such orphans and says so — but it must never
// mistake a tick that lands *while* the image list is being read for an orphan
// (a tick stores its image before it selects, so an id selected both before and
// after the read with no record is the only safe definition of "orphan").

const list = vi.fn(async () => []);
vi.mock('../../../../../src/common/export/exportImageStore.js', () => ({
    exportImageStore: {
        list: (...args) => list(...args),
        get: async () => null,
        delete: async () => {},
        clear: async () => {},
    },
}));

const { exportSelectionManager } =
    await import('../../../../../src/common/export/exportSelectionManager.js');
const { ReportViewModule } =
    await import('../../../../../src/common/views/report/reportViewModule.js');
const { initGlossaryForTests } = await import('../../../support/glossaryFixture.js');
initGlossaryForTests('en');

function record(itemId, view = 'overview') {
    return {
        itemId,
        title: itemId,
        view,
        docOrder: 0,
        capturedAt: 1,
        width: 100,
        height: 50,
        blob: new Blob(['png'], { type: 'image/png' }),
    };
}

function select(id) {
    exportSelectionManager.registerTarget(id, {
        id,
        title: id,
        type: 'chart',
        view: 'overview',
        container: null,
    });
    exportSelectionManager.toggleSelection(id);
}

async function flush() {
    await new Promise((resolve) => setTimeout(resolve, 0));
}

describe('report view heals orphaned selections', () => {
    let container;
    let view;

    beforeEach(() => {
        localStorage.clear();
        exportSelectionManager.clearSelection();
        list.mockReset();
        list.mockResolvedValue([]);
        globalThis.URL.createObjectURL = vi.fn(() => 'blob:card');
        globalThis.URL.revokeObjectURL = vi.fn();
        container = document.createElement('div');
        document.body.appendChild(container);
        view = new ReportViewModule('report', container, {
            viewConfig: { overview: { label: 'Übersicht' } },
        });
    });

    afterEach(() => {
        view.destroy();
        document.body.innerHTML = '';
        vi.restoreAllMocks();
    });

    it('deselects a selection whose image is gone and tells the user', async () => {
        select('a');
        select('b');
        list.mockResolvedValue([record('a')]);

        await view._doRender();
        await flush();

        expect(exportSelectionManager.getPersistedSelectedIds()).toEqual(['a']);
        expect(container.querySelectorAll('.report-card')).toHaveLength(1);
        const notice = container.querySelector('.report-notice');
        expect(notice.hidden).toBe(false);
        expect(notice.textContent).toContain('1 Element ohne gespeichertes Bild');
    });

    it('does not treat a tick that lands while the images are listed as an orphan', async () => {
        select('a');
        // The list is in flight; the user's tick for "c" completes meanwhile
        // (image stored, then selected) — the list result predates that image.
        // The selection is added without the manager's emit on purpose: the
        // emit would start a superseding refresh and mask the rule under test.
        // The refresh must be safe on its own — "orphan" means selected both
        // before and after the read.
        list.mockImplementation(async () => {
            exportSelectionManager.selectedIds.add('c');
            return [record('a')];
        });

        await view._doRender();
        await flush();

        expect(exportSelectionManager.getPersistedSelectedIds().sort()).toEqual(['a', 'c']);
        expect(container.querySelector('.report-notice').hidden).toBe(true);
    });

    it('does not report anything when every selection has its image', async () => {
        select('a');
        list.mockResolvedValue([record('a')]);

        await view._doRender();
        await flush();

        expect(exportSelectionManager.getPersistedSelectedIds()).toEqual(['a']);
        expect(container.querySelector('.report-notice').hidden).toBe(true);
        expect(container.querySelectorAll('.report-card')).toHaveLength(1);
    });
});
