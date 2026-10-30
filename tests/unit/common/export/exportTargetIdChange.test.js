// @vitest-browser

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeCanvas } from '../../support/canvas.js';
import { flush } from '../../support/reportFixture.js';
import { createMemoryImageStore } from '../../../../src/common/export/memoryImageStore.js';
import { captureExportRoot } from '../../support/fakeExportCapture.js';
import { createTestAppContext } from '../../support/glossaryFixture.js';
import { mountExportCard } from '../../support/exportCard.js';

// A card that shows one item at a time (EN item detail) re-points its export control
// under a new id per item. The control is reused for that, so unless the service
// follows the new id the checkbox keeps ticking the previous item: its capture is
// overwritten and the report shows one card for two items. A capture still running
// for the previous id must not tick it: its image shows what the card no longer does.

vi.mock(
    '../../../../src/common/export/exportCapture.js',
    () => import('../../support/fakeExportCapture.js'),
);
const images = createMemoryImageStore();
/** @type {import('vitest').MockInstance<typeof images.put>} Set per test: the suite restores spies after each. */
let put;
/** @type {import('vitest').MockInstance<typeof images.delete>} */
let remove;

const context = createTestAppContext('en', {}, images);
const { exportCart } = context;

const ID_A = 'module-en-item-detail--item-a';
const ID_B = 'module-en-item-detail--item-b';

describe('an export control re-pointed under a new id follows the new id', () => {
    /** @type {Awaited<ReturnType<typeof mountExportCard>>} */
    let mounted;

    /**
     * Show another item, and let the control follow it.
     * @param {string} item
     */
    async function show(item) {
        mounted.identity.value = item;
        await Promise.resolve();
        await mounted.card.updateComplete;
    }

    beforeEach(async () => {
        exportCart.clear();
        vi.spyOn(console, 'error').mockImplementation(() => {});
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        captureExportRoot.mockReset();
        captureExportRoot.mockResolvedValue(makeCanvas());
        put = vi.spyOn(images, 'put');
        remove = vi.spyOn(images, 'delete');
        mounted = await mountExportCard({
            id: 'en-item-detail',
            context,
            parent: document.body,
        });
        await show('item-a');
    });

    afterEach(() => {
        mounted.card.remove();
    });

    it('reuses the checkbox under the new id', async () => {
        const first = mounted.batchButton();
        await show('item-b');

        // No rebuild, so no flicker.
        expect(mounted.batchButton()).toBe(first);
        expect(
            mounted.card.querySelectorAll('[data-header-action-button="batch-select"]'),
        ).toHaveLength(1);
    });

    it('ticks the item on screen now, not the one the control was built for', async () => {
        await show('item-b');

        mounted.batchButton().click();
        await flush();

        expect(put).toHaveBeenCalledTimes(1);
        expect(put.mock.calls[0][1]).toBe(ID_B);
        expect(exportCart.isSelected(ID_B)).toBe(true);
        expect(exportCart.isSelected(ID_A)).toBe(false);
    });

    it('keeps the tick of an item shown again', async () => {
        mounted.batchButton().click();
        await flush();
        await show('item-b');
        expect(mounted.batchButton().getAttribute('aria-checked')).toBe('false');

        await show('item-a');

        expect(exportCart.isSelected(ID_A)).toBe(true);
        expect(mounted.batchButton().getAttribute('aria-checked')).toBe('true');
        expect(remove).not.toHaveBeenCalled();
    });

    it('does not tick a capture whose card moved on to another item meanwhile', async () => {
        /** @type {(canvas: HTMLCanvasElement) => void} */
        let finishCapture = () => {};
        captureExportRoot.mockImplementation(
            () =>
                new Promise((resolve) => {
                    finishCapture = resolve;
                }),
        );
        mounted.batchButton().click();
        await flush();

        await show('item-b');
        finishCapture(makeCanvas());
        await flush();

        expect(put).not.toHaveBeenCalled();
        expect(exportCart.selection.value).toEqual([]);
    });

    it('names the dataset the page shows, so ticks in two datasets coexist', async () => {
        const inA = await mountExportCard({
            id: 'en-group-table',
            context: createTestAppContext('en', {}, images, { id: 'en_8a', label: '8a' }),
            parent: document.body,
        });
        inA.batchButton().click();
        await flush();

        expect(put.mock.calls.at(-1)?.[1]).toBe('module-en-group-table--en-8a');
        inA.card.remove();
    });
});
