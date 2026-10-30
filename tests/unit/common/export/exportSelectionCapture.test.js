// @vitest-browser

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeCanvas } from '../../support/canvas.js';
import { flush } from '../../support/reportFixture.js';
import { createMemoryImageStore } from '../../../../src/common/export/memoryImageStore.js';
import { captureExportRoot } from '../../support/fakeExportCapture.js';
import { createTestAppContext } from '../../support/glossaryFixture.js';
import { mountExportCard } from '../../support/exportCard.js';

// The report shows only what was captured, so ticking a module must capture and
// store it before it counts as selected, leave it unselected when the capture fails,
// and drop the image again on untick; otherwise the cart and the report drift apart.

vi.mock(
    '../../../../src/common/export/exportCapture.js',
    () => import('../../support/fakeExportCapture.js'),
);
const images = createMemoryImageStore();
/** @type {import('vitest').MockInstance<typeof images.put>} Set per test: the suite restores spies after each. */
let put;
/** @type {import('vitest').MockInstance<typeof images.delete>} */
let remove;

const ITEM_ID = 'module-test-chart';

const context = createTestAppContext('en', {}, images);
const { exportCart } = context;

describe('batch-select tick captures the module', () => {
    /** @type {HTMLElement} */
    let view;
    /** @type {import('@tba3/module-base').ContentModule} */
    let card;
    /** @type {() => HTMLButtonElement} */
    let batchButton;

    /**
     * Mount the card second in a view, after another card.
     * @param {string} [viewKey]
     */
    async function mountInView(viewKey) {
        view = document.createElement('div');
        view.className = 'view-base';
        const first = document.createElement('div');
        first.className = 'module-container';
        view.append(first);
        document.body.append(view);
        ({ card, batchButton } = await mountExportCard({
            id: 'test-chart',
            context,
            parent: view,
            viewKey,
        }));
    }

    beforeEach(async () => {
        exportCart.clear();
        vi.spyOn(console, 'error').mockImplementation(() => {});
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        document.querySelectorAll('.toast').forEach((toast) => toast.remove());
        captureExportRoot.mockReset();
        put = vi.spyOn(images, 'put');
        remove = vi.spyOn(images, 'delete');
        await mountInView();
    });

    afterEach(() => {
        view.remove();
        window.location.hash = '';
    });

    it('is busy during the capture, stores the image with its view and on-screen position, then selects', async () => {
        /** @type {(canvas: HTMLCanvasElement) => void} */
        let finishCapture = () => {};
        captureExportRoot.mockImplementation(
            () =>
                new Promise((resolve) => {
                    finishCapture = resolve;
                }),
        );

        batchButton().click();
        await flush();
        // Held, not disabled: the tick keeps the focus the click gave it.
        expect(batchButton().getAttribute('aria-disabled')).toBe('true');
        expect(batchButton().getAttribute('aria-busy')).toBe('true');
        expect(exportCart.isSelected(ITEM_ID)).toBe(false);

        finishCapture(makeCanvas());
        await flush();
        await flush();

        expect(captureExportRoot).toHaveBeenCalledTimes(1);
        expect(captureExportRoot.mock.calls[0][0].module).toBe(card);
        expect(put).toHaveBeenCalledTimes(1);
        const [appId, storedId, record] = put.mock.calls[0];
        expect(appId).toBe('en');
        expect(storedId).toBe(ITEM_ID);
        expect(record).toMatchObject({
            title: 'Testdiagramm',
            view: 'overview',
            width: 640,
            height: 320,
            docOrder: 1,
        });
        expect(record.blob).toBeInstanceOf(Blob);
        expect(exportCart.isSelected(ITEM_ID)).toBe(true);
        expect(batchButton().getAttribute('aria-checked')).toBe('true');
        expect(batchButton().hasAttribute('aria-disabled')).toBe(false);
        expect(batchButton().hasAttribute('aria-busy')).toBe(false);
    });

    it('records the view the card sits in, whatever the hash says', async () => {
        // The definition is built while a view renders, before the router has synced
        // the hash, so the hash would name the view being left.
        view.remove();
        await mountInView('group');
        captureExportRoot.mockResolvedValue(makeCanvas());
        window.location.hash = '#overview';

        batchButton().click();
        await flush();
        await flush();

        expect(put.mock.calls[0][2].view).toBe('group');
    });

    it('leaves the item unselected and tells the user when the capture fails', async () => {
        captureExportRoot.mockRejectedValue(new Error('not visible'));

        batchButton().click();
        await flush();
        await flush();

        expect(put).not.toHaveBeenCalled();
        expect(exportCart.isSelected(ITEM_ID)).toBe(false);
        expect(batchButton().getAttribute('aria-checked')).toBe('false');
        expect(batchButton().hasAttribute('aria-disabled')).toBe(false);
        expect(document.querySelectorAll('.toast[role="alert"]')).toHaveLength(1);
    });

    it('untick deselects immediately and removes the stored image', async () => {
        captureExportRoot.mockResolvedValue(makeCanvas());
        batchButton().click();
        await flush();
        await flush();
        expect(exportCart.isSelected(ITEM_ID)).toBe(true);

        batchButton().click();
        expect(exportCart.isSelected(ITEM_ID)).toBe(false);
        expect(remove).toHaveBeenCalledWith('en', ITEM_ID);
        expect(captureExportRoot).toHaveBeenCalledTimes(1);
        await card.updateComplete;
        expect(batchButton().getAttribute('aria-checked')).toBe('false');
    });

    it('stores nothing and reports failure when the card unmounts during the capture', async () => {
        /** @type {(canvas: HTMLCanvasElement) => void} */
        let finishCapture = () => {};
        captureExportRoot.mockImplementation(
            () =>
                new Promise((resolve) => {
                    finishCapture = resolve;
                }),
        );

        batchButton().click();
        await flush();
        card.remove();
        await flush();
        finishCapture(makeCanvas());
        await flush();
        await flush();

        expect(put).not.toHaveBeenCalled();
        expect(exportCart.isSelected(ITEM_ID)).toBe(false);
        expect(document.querySelectorAll('.toast[role="alert"]')).toHaveLength(1);
    });

    it('ignores clicks while a capture is still running', async () => {
        captureExportRoot.mockImplementation(() => new Promise(() => {}));

        batchButton().click();
        await flush();
        batchButton().click();
        await flush();

        expect(captureExportRoot).toHaveBeenCalledTimes(1);
    });
});
