// @vitest-browser

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// WHY: most modules keep one export id for life, but a module that shows one
// item at a time (EN item detail) resyncs its header under a new id per item.
// The wrapper is reused for that resync, so unless the service rebinds it, the
// checkbox keeps ticking the previous item — its capture is overwritten and the
// report shows one card for two items. The stale id must also leave the cart,
// or it points at a container that now shows something else.

const captureExportRoot = vi.fn();
const put = vi.fn(async () => {});
const remove = vi.fn(async () => {});
const clear = vi.fn(async () => {});
const getRecord = vi.fn(async () => null);

vi.mock('../../../../src/common/export/exportCapture.js', async (importOriginal) => {
    const original = /** @type {any} */ (await importOriginal());
    return { ...original, captureExportRoot: (...args) => captureExportRoot(...args) };
});
vi.mock('../../../../src/common/export/exportImageStore.js', () => ({
    exportImageStore: {
        put: (...args) => put(...args),
        delete: (...args) => remove(...args),
        clear: (...args) => clear(...args),
        get: (...args) => getRecord(...args),
    },
}));

const { exportSelectionManager } =
    await import('../../../../src/common/export/exportSelectionManager.js');
const { exportService } = await import('../../../../src/common/export/exportService.js');

const ID_A = 'module-en-item-detail-item-a';
const ID_B = 'module-en-item-detail-item-b';

function makeCanvas() {
    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 320;
    canvas.toBlob = (cb) => cb(new Blob(['png'], { type: 'image/png' }));
    return canvas;
}

/** The header slot ContentModule owns, inside a mountable module card. */
function mountHeaderActions() {
    const card = document.createElement('div');
    card.className = 'module-container';
    card.innerHTML = `
        <div class="content-module-header"><div class="content-module-header-actions"></div></div>
        <div class="content-module-body" id="detail-body"></div>`;
    document.body.appendChild(card);
    return /** @type {HTMLElement} */ (card.querySelector('.content-module-header-actions'));
}

/** What ContentModule#syncExportControls does for the currently shown item. */
function syncFor(headerActions, id) {
    return exportService.createModuleExportButton(
        { id, title: 'Aufgabendetails', type: 'item-detail', container: 'detail-body' },
        { targetContainer: headerActions },
    );
}

const batchButtonOf = (wrapper) =>
    /** @type {HTMLButtonElement} */ (
        wrapper.querySelector('[data-header-action-button="batch-select"]')
    );

async function flush() {
    await new Promise((resolve) => setTimeout(resolve, 0));
}

describe('an export wrapper resynced under a new id follows the new id', () => {
    let headerActions;

    beforeEach(() => {
        localStorage.clear();
        exportSelectionManager.clearSelection();
        vi.spyOn(console, 'error').mockImplementation(() => {});
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        globalThis.alert = vi.fn();
        captureExportRoot.mockReset();
        captureExportRoot.mockResolvedValue(makeCanvas());
        put.mockClear();
        remove.mockClear();
        headerActions = mountHeaderActions();
    });

    afterEach(() => {
        document.body.innerHTML = '';
        vi.restoreAllMocks();
    });

    it('reuses the wrapper but retires the previous registration', () => {
        const first = syncFor(headerActions, ID_A);
        const second = syncFor(headerActions, ID_B);

        expect(second).toBe(first); // no teardown/rebuild — the flicker-free path
        expect(exportSelectionManager.getItem(ID_A)).toBeNull();
        expect(exportSelectionManager.getItem(ID_B)).not.toBeNull();
        expect(
            headerActions.querySelectorAll('[data-header-action-button="batch-select"]'),
        ).toHaveLength(1);
    });

    it('ticks the item on screen now, not the one the wrapper was built for', async () => {
        syncFor(headerActions, ID_A);
        const wrapper = syncFor(headerActions, ID_B);

        batchButtonOf(wrapper).click();
        await flush();

        expect(put).toHaveBeenCalledTimes(1);
        expect(put.mock.calls[0][0]).toBe(ID_B);
        expect(exportSelectionManager.isSelected(ID_B)).toBe(true);
        expect(exportSelectionManager.isSelected(ID_A)).toBe(false);
    });

    it('leaves an unchanged id alone so a plain resync keeps its tick', async () => {
        const wrapper = syncFor(headerActions, ID_A);
        batchButtonOf(wrapper).click();
        await flush();

        syncFor(headerActions, ID_A);

        expect(exportSelectionManager.isSelected(ID_A)).toBe(true);
        expect(batchButtonOf(wrapper).getAttribute('aria-checked')).toBe('true');
        expect(remove).not.toHaveBeenCalled();
    });
});
