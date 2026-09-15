// @vitest-browser

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// WHY: the report can only show what was captured, so ticking a module must
// (a) capture and store it before it counts as selected, (b) leave it
// unselected when the capture fails instead of adding an imageless card, and
// (c) drop the image again on untick — otherwise the cart and the report drift
// apart and the user exports blanks or ghosts.

const captureExportRoot = vi.fn();
const put = vi.fn(async () => {});
const remove = vi.fn(async () => {});
const clear = vi.fn(async () => {});

vi.mock('../../../../src/common/export/exportCapture.js', async (importOriginal) => {
    const original = /** @type {any} */ (await importOriginal());
    return { ...original, captureExportRoot: (...args) => captureExportRoot(...args) };
});
vi.mock('../../../../src/common/export/exportImageStore.js', () => ({
    exportImageStore: {
        put: (...args) => put(...args),
        delete: (...args) => remove(...args),
        clear: (...args) => clear(...args),
    },
}));

const { exportSelectionManager } =
    await import('../../../../src/common/export/exportSelectionManager.js');
const { enhanceExportButton } = await import('../../../../src/common/export/exportSelectionUI.js');

const ITEM_ID = 'module-test-chart';

function makeCanvas(width = 640, height = 320) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    canvas.toBlob = (cb) => cb(new Blob(['png'], { type: 'image/png' }));
    return canvas;
}

/** A view with two cards; the export target is the second one. */
function mountView() {
    const view = document.createElement('div');
    view.className = 'view-base';
    view.innerHTML = `
        <div class="module-container"><div class="content-module-body" id="first-body"></div></div>
        <div class="module-container">
            <div class="content-module-header"><div class="content-module-header-actions"></div></div>
            <div class="content-module-body" id="target-body"></div>
        </div>`;
    document.body.appendChild(view);

    const wrapper = document.createElement('div');
    wrapper.className = 'module-export-button-wrapper';
    wrapper.innerHTML =
        '<button type="button" data-header-action-button="export-trigger">Export</button>';
    view.querySelector('.content-module-header-actions').appendChild(wrapper);
    return { view, wrapper };
}

async function flush() {
    await new Promise((resolve) => setTimeout(resolve, 0));
}

describe('batch-select tick captures the module', () => {
    let wrapper;
    let batchBtn;

    beforeEach(() => {
        localStorage.clear();
        exportSelectionManager.clearSelection();
        vi.spyOn(console, 'error').mockImplementation(() => {});
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        document.querySelectorAll('.toast').forEach((toast) => toast.remove());
        captureExportRoot.mockReset();
        put.mockClear();
        remove.mockClear();

        ({ wrapper } = mountView());
        exportSelectionManager.registerTarget(ITEM_ID, {
            id: ITEM_ID,
            title: 'Testdiagramm',
            type: 'chart',
            view: 'overview',
            container: 'target-body',
        });
        enhanceExportButton(wrapper, ITEM_ID);
        batchBtn = wrapper.querySelector('[data-header-action-button="batch-select"]');
    });

    afterEach(() => {
        document.body.innerHTML = '';
        vi.restoreAllMocks();
    });

    it('is busy during the capture, stores the image with its view and on-screen position, then selects', async () => {
        let finishCapture;
        captureExportRoot.mockImplementation(
            () =>
                new Promise((resolve) => {
                    finishCapture = resolve;
                }),
        );

        batchBtn.click();
        await flush();
        expect(batchBtn.disabled).toBe(true);
        expect(batchBtn.getAttribute('aria-busy')).toBe('true');
        expect(exportSelectionManager.isSelected(ITEM_ID)).toBe(false);

        finishCapture(makeCanvas(640, 320));
        await flush();
        await flush();

        expect(captureExportRoot).toHaveBeenCalledTimes(1);
        expect(captureExportRoot.mock.calls[0][0]).toBe(
            document.getElementById('target-body').closest('.module-container'),
        );
        expect(put).toHaveBeenCalledTimes(1);
        const [storedId, record] = put.mock.calls[0];
        expect(storedId).toBe(ITEM_ID);
        expect(record).toMatchObject({
            title: 'Testdiagramm',
            view: 'overview',
            width: 640,
            height: 320,
            docOrder: 1,
        });
        expect(record.blob).toBeInstanceOf(Blob);
        expect(exportSelectionManager.isSelected(ITEM_ID)).toBe(true);
        expect(batchBtn.getAttribute('aria-checked')).toBe('true');
        expect(batchBtn.disabled).toBe(false);
        expect(batchBtn.hasAttribute('aria-busy')).toBe(false);
    });

    it('records the view the user is on at tick time when the target names none', async () => {
        // Registration happens while a view renders, before the router has
        // synced the hash — so the view must be read when the user ticks.
        exportSelectionManager.registerTarget(ITEM_ID, {
            id: ITEM_ID,
            title: 'Testdiagramm',
            type: 'chart',
            view: null,
            container: 'target-body',
        });
        captureExportRoot.mockResolvedValue(makeCanvas());
        window.location.hash = '#class';

        batchBtn.click();
        await flush();
        await flush();

        expect(put.mock.calls[0][1].view).toBe('class');
        window.location.hash = '';
    });

    it('leaves the item unselected and tells the user when the capture fails', async () => {
        captureExportRoot.mockRejectedValue(new Error('not visible'));

        batchBtn.click();
        await flush();
        await flush();

        expect(put).not.toHaveBeenCalled();
        expect(exportSelectionManager.isSelected(ITEM_ID)).toBe(false);
        expect(batchBtn.getAttribute('aria-checked')).toBe('false');
        expect(batchBtn.disabled).toBe(false);
        expect(document.querySelectorAll('.toast[role="alert"]')).toHaveLength(1);
    });

    it('untick deselects immediately and removes the stored image', async () => {
        captureExportRoot.mockResolvedValue(makeCanvas());
        batchBtn.click();
        await flush();
        await flush();
        expect(exportSelectionManager.isSelected(ITEM_ID)).toBe(true);

        batchBtn.click();
        expect(exportSelectionManager.isSelected(ITEM_ID)).toBe(false);
        expect(batchBtn.getAttribute('aria-checked')).toBe('false');
        expect(remove).toHaveBeenCalledWith(ITEM_ID);
        expect(captureExportRoot).toHaveBeenCalledTimes(1);
    });

    it('drops the stored image and reports failure when the target unmounts during the capture', async () => {
        let finishCapture;
        captureExportRoot.mockImplementation(
            () =>
                new Promise((resolve) => {
                    finishCapture = resolve;
                }),
        );

        batchBtn.click();
        await flush();
        exportSelectionManager.unregister(ITEM_ID);
        finishCapture(makeCanvas());
        await flush();
        await flush();

        expect(put).toHaveBeenCalledTimes(1);
        expect(remove).toHaveBeenCalledWith(ITEM_ID);
        expect(exportSelectionManager.isSelected(ITEM_ID)).toBe(false);
        expect(batchBtn.getAttribute('aria-checked')).toBe('false');
        expect(document.querySelectorAll('.toast[role="alert"]')).toHaveLength(1);
    });

    it('ignores clicks while a capture is still running', async () => {
        captureExportRoot.mockImplementation(() => new Promise(() => {}));

        batchBtn.click();
        await flush();
        batchBtn.click();
        await flush();

        expect(captureExportRoot).toHaveBeenCalledTimes(1);
    });
});
