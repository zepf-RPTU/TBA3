// @vitest-browser

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// WHY: a written PDF ends the workflow the cart was filled for. Left standing,
// that cart is what re-ticks the checkboxes of modules the user is already done
// with on the next visit — the same leftover state the session gate removes on
// the other side (exportSelectionManager.test.js). It must go only *after* the
// document exists: clearing on a failed compose would throw away captures the
// user cannot retake without revisiting every view.

const list = vi.fn(async () => []);
vi.mock('../../../../../src/common/export/exportImageStore.js', () => ({
    exportImageStore: {
        list: (...args) => list(...args),
        get: async () => null,
        delete: async () => {},
        clear: async () => {},
    },
}));

const save = vi.fn();
const addBands = vi.fn();
vi.mock('../../../../../src/common/export/pdfComposer.js', async (importOriginal) => ({
    // Only the composer is faked: reportLayout.js reads the real page geometry
    // from this module, and band planning must stay real for the export path.
    ...(await importOriginal()),
    createPdfComposer: async () => ({ addBands, save }),
}));

const { exportSelectionManager } =
    await import('../../../../../src/common/export/exportSelectionManager.js');
const { ReportViewModule } =
    await import('../../../../../src/common/views/report/reportViewModule.js');
const { initGlossaryForTests } = await import('../../../support/glossaryFixture.js');
initGlossaryForTests('en');

function record(itemId) {
    return {
        itemId,
        title: itemId,
        view: 'overview',
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

describe('report view clears the cart once the PDF is written', () => {
    let container;
    let view;

    beforeEach(async () => {
        localStorage.clear();
        exportSelectionManager.clearSelection();
        save.mockReset();
        addBands.mockReset();
        globalThis.URL.createObjectURL = vi.fn(() => 'blob:card');
        globalThis.URL.revokeObjectURL = vi.fn();
        // jsdom has no decoder; the export awaits one per card before composing.
        HTMLImageElement.prototype.decode = vi.fn(async () => {});

        select('a');
        select('b');
        list.mockResolvedValue([record('a'), record('b')]);

        container = document.createElement('div');
        document.body.appendChild(container);
        view = new ReportViewModule('report', container, {
            viewConfig: { overview: { label: 'Übersicht' } },
        });
        await view._doRender();
        await flush();
    });

    afterEach(() => {
        view.destroy();
        document.body.innerHTML = '';
        vi.restoreAllMocks();
    });

    it('empties the cart and says so after a successful export', async () => {
        list.mockResolvedValue([]);

        container.querySelector('[data-report-action="export"]').click();
        await flush();

        expect(save).toHaveBeenCalledTimes(1);
        expect(exportSelectionManager.getPersistedSelectedIds()).toEqual([]);
        expect(container.querySelector('.report-notice').textContent).toContain(
            'Auswahl wurde geleert',
        );
        expect(container.querySelectorAll('.report-card')).toHaveLength(0);
    });

    it('keeps the cart when writing the document fails', async () => {
        save.mockImplementation(() => {
            throw new Error('jsPDF unavailable');
        });
        vi.spyOn(console, 'error').mockImplementation(() => {});
        vi.spyOn(globalThis, 'alert').mockImplementation(() => {});

        container.querySelector('[data-report-action="export"]').click();
        await flush();

        expect(exportSelectionManager.getPersistedSelectedIds()).toEqual(['a', 'b']);
        expect(container.querySelectorAll('.report-card')).toHaveLength(2);
    });
});
