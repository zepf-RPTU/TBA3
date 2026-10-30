// @vitest-browser

import { onChange } from '@tba3/module-base';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { record, select } from '../../support/reportFixture.js';
import { createMemoryImageStore } from '../../../../src/common/export/memoryImageStore.js';
import { ExportCart } from '../../../../src/common/export/exportCart.js';
import { exportTabId } from '../../../../src/common/export/exportTab.js';

/** @type {import('../../../../src/common/export/exportImageStore.js').ImageStore} The page's store, which outlives a reload. */
let images;
/** @type {import('vitest').MockInstance} */
let put;
/** @type {import('vitest').MockInstance} */
let remove;
/** @type {import('vitest').MockInstance} */
let clear;

/** The views in sidebar order, as the report reads them. */
const VIEW_ORDER = ['welcome', 'overview', 'item'];

/**
 * A fresh cart for one dashboard, as a page load builds it: it reads what the tab stored.
 * @param {string} [appId] - The dashboard the cart scopes itself to.
 * @returns {ExportCart}
 */
const loadCart = (appId = 'en') => new ExportCart({ appId, images });

/**
 * Tick a target captured on `view`, at `docOrder` among its cards.
 * @param {ExportCart} cart
 * @param {string} id
 * @param {string} view
 * @param {number} [docOrder]
 * @param {number} [capturedAt]
 * @returns {Promise<void>}
 */
const tickOn = (cart, id, view, docOrder = 0, capturedAt = 0) =>
    cart.add(id, { ...record(id), view, docOrder, capturedAt });

/**
 * @param {ExportCart} cart
 * @returns {Promise<Array<{id: string, span: number}>>} The report's cards and widths, in order.
 */
const report = async (cart) =>
    (await cart.readReport(VIEW_ORDER)).items.map(({ id, span }) => ({ id, span }));

/** @returns {Promise<string[]>} The ids the store holds a capture for. */
const storedIds = async () => (await images.list('en')).map((entry) => entry.itemId).sort();

beforeEach(() => {
    sessionStorage.clear();
    images = createMemoryImageStore();
    put = vi.spyOn(images, 'put');
    remove = vi.spyOn(images, 'delete');
    clear = vi.spyOn(images, 'clear');
});

describe('ExportCart keeps one cart per dashboard and tab', () => {
    it("keeps each dashboard's cart apart", async () => {
        // Export target ids are unique only within one dashboard, and the report view
        // is per dashboard: "Auswahl leeren" in one app must not wipe another's.
        await select(loadCart('en'), 'module-chart');

        const ma = loadCart('ma');
        expect(ma.selection.value).toEqual([]);
        await select(ma, 'module-chart');
        ma.clear();

        expect(loadCart('en').selection.value).toEqual(['module-chart']);
    });

    it('keeps the ticks, their order and their widths across a reload of the tab', async () => {
        const cart = loadCart();
        await tickOn(cart, 'a', 'overview');
        await tickOn(cart, 'b', 'item');
        await report(cart);
        cart.arrange([
            { id: 'b', span: 6 },
            { id: 'a', span: 12 },
        ]);

        const reloaded = loadCart();
        expect(reloaded.selection.value).toEqual(['b', 'a']);
        expect(await report(reloaded)).toEqual([
            { id: 'b', span: 6 },
            { id: 'a', span: 12 },
        ]);
    });

    it("stores the report with this tab's cart, out of every other tab's reach", async () => {
        await select(loadCart(), 'a');

        /** @param {Storage} storage */
        const cartKeys = (storage) =>
            Object.keys(storage).filter((key) => key.startsWith('tba3_export'));
        expect(cartKeys(sessionStorage)).toEqual([`tba3_export_cart_en_${exportTabId('en')}`]);
        expect(cartKeys(localStorage)).toEqual([]);
    });

    it('reads a corrupt or foreign record as an empty cart, and normalizes an unknown width', async () => {
        const key = `tba3_export_cart_en_${exportTabId('en')}`;
        vi.spyOn(console, 'error').mockImplementation(() => {});
        sessionStorage.setItem(key, '{not json');
        expect(loadCart().selection.value).toEqual([]);

        sessionStorage.setItem(
            key,
            JSON.stringify([{ id: 'a', span: 5 }, { span: 6 }, { id: '', span: 6 }, 'b']),
        );
        await images.put('en', 'a', record('a'));
        expect(await report(loadCart())).toEqual([{ id: 'a', span: 12 }]);
    });
});

describe('ExportCart ticks', () => {
    it('ticks a target once, however often the tick arrives, with its newest image', async () => {
        // A tick that lands after another tab or a repeated click already selected the
        // target must not untick it: adding is idempotent, not a toggle.
        const cart = loadCart();
        const changed = vi.fn();
        onChange(() => cart.selection.value, changed);

        await select(cart, 'module-a');
        await select(cart, 'module-a');

        expect(cart.selection.value).toEqual(['module-a']);
        expect(changed).toHaveBeenCalledOnce();
        expect(put.mock.calls.map(([, id]) => id)).toEqual(['module-a', 'module-a']);
    });

    it('ticks nothing when the image cannot be stored', async () => {
        // A tick always has its image (`readReport` relies on it).
        const cart = loadCart();
        put.mockRejectedValueOnce(new Error('quota'));

        await expect(select(cart, 'module-a')).rejects.toThrow('quota');
        expect(cart.selection.value).toEqual([]);
    });

    it('remove deletes the image, clear clears them all', async () => {
        const cart = loadCart();
        await select(cart, 'module-a');
        await select(cart, 'module-b');

        cart.remove('module-a');
        expect(remove).toHaveBeenCalledWith('en', 'module-a');

        cart.clear();
        expect(clear).toHaveBeenCalledExactlyOnceWith('en');
        expect(cart.selection.value).toEqual([]);
    });

    it('does not change the selection when the report is only rearranged', async () => {
        // The report view follows `selection`: a rearrangement it saves itself must not
        // send it back to re-read the report.
        const cart = loadCart();
        await select(cart, 'a');
        await select(cart, 'b');
        await report(cart);
        const changed = vi.fn();
        onChange(() => cart.selection.value, changed);

        cart.arrange([
            { id: 'b', span: 4 },
            { id: 'a', span: 8 },
        ]);

        expect(changed).not.toHaveBeenCalled();
        expect(await report(cart)).toEqual([
            { id: 'b', span: 4 },
            { id: 'a', span: 8 },
        ]);
    });
});

describe('ExportCart.readReport places the cards', () => {
    it('appends new cards at full width in view order, then on-screen order, then capture time', async () => {
        const cart = loadCart();
        await tickOn(cart, 'kept', 'item');
        await report(cart);
        cart.arrange([{ id: 'kept', span: 6 }]);
        await tickOn(cart, 'item-2', 'item', 1, 10);
        await tickOn(cart, 'overview-late', 'overview', 0, 50);
        await tickOn(cart, 'overview-early', 'overview', 0, 20);
        await tickOn(cart, 'item-1', 'item', 0, 30);
        await tickOn(cart, 'mystery', 'unknown', 0, 0);
        await tickOn(cart, 'welcome', 'welcome', 3, 99);

        expect(await report(cart)).toEqual([
            { id: 'kept', span: 6 },
            { id: 'welcome', span: 12 },
            { id: 'overview-early', span: 12 },
            { id: 'overview-late', span: 12 },
            { id: 'item-1', span: 12 },
            { id: 'item-2', span: 12 },
            { id: 'mystery', span: 12 },
        ]);
    });

    it('keeps the placement it made, so a later tick lands after it', async () => {
        const cart = loadCart();
        await tickOn(cart, 'item', 'item');
        await report(cart);
        await tickOn(cart, 'welcome', 'welcome');

        expect((await report(cart)).map((entry) => entry.id)).toEqual(['item', 'welcome']);
    });

    // D2: the arrangement belongs to the ticks. Dropped with them, it cannot come back
    // when the same cards are ticked again — whether or not the report was on screen.
    it('forgets the arrangement when the cart is cleared, report on screen or not', async () => {
        const cart = loadCart();
        await tickOn(cart, 'a', 'overview');
        await tickOn(cart, 'b', 'item');
        await report(cart);
        cart.arrange([
            { id: 'b', span: 4 },
            { id: 'a', span: 6 },
        ]);

        cart.clear();
        await tickOn(cart, 'a', 'overview');
        await tickOn(cart, 'b', 'item');

        expect(await report(cart)).toEqual([
            { id: 'a', span: 12 },
            { id: 'b', span: 12 },
        ]);
    });

    it('forgets the arrangement of a cleared cart across a reload', async () => {
        const cart = loadCart();
        await tickOn(cart, 'a', 'overview');
        await report(cart);
        cart.arrange([{ id: 'a', span: 4 }]);
        cart.clear();

        const reloaded = loadCart();
        await tickOn(reloaded, 'a', 'overview');
        expect(await report(reloaded)).toEqual([{ id: 'a', span: 12 }]);
    });

    it('starts a card ticked again after a single untick afresh', async () => {
        const cart = loadCart();
        await tickOn(cart, 'a', 'overview');
        await tickOn(cart, 'b', 'item');
        await report(cart);
        cart.arrange([
            { id: 'a', span: 4 },
            { id: 'b', span: 6 },
        ]);

        cart.remove('a');
        await tickOn(cart, 'a', 'overview');

        expect(await report(cart)).toEqual([
            { id: 'b', span: 6 },
            { id: 'a', span: 12 },
        ]);
    });
});

// The cart (sessionStorage) and the images (IndexedDB) drift when IndexedDB is unusable
// or evicted while the cart survives. A tick without an image makes the toolbar count and
// the module checkboxes disagree with the report, so the cart drops such orphans and
// reports how many. A tick that lands while the image list is being read is not one: a
// tick stores its image before it selects, so only an id ticked both before and after the
// read with no record is an orphan.
describe('ExportCart.readReport heals the cart against the image store', () => {
    it('drops a tick whose image is gone and counts it', async () => {
        const cart = loadCart();
        await select(cart, 'a');
        await select(cart, 'b');
        // The browser evicted b's capture.
        await images.delete('en', 'b');

        const { items, healedCount } = await cart.readReport(VIEW_ORDER);

        expect(items.map((item) => item.id)).toEqual(['a']);
        expect(healedCount).toBe(1);
        expect(cart.selection.value).toEqual(['a']);
    });

    it('does not treat a tick that lands while the images are listed as an orphan', async () => {
        const cart = loadCart();
        await select(cart, 'a');
        // The tick for "c" completes while the list is in flight, so the list result
        // predates its image.
        const listStored = images.list.bind(images);
        vi.spyOn(images, 'list').mockImplementationOnce(async (appId) => {
            const stored = await listStored(appId);
            await select(cart, 'c');
            return stored;
        });

        const { healedCount } = await cart.readReport(VIEW_ORDER);

        expect(healedCount).toBe(0);
        expect([...cart.selection.value].sort()).toEqual(['a', 'c']);
    });

    it('deletes an image nobody ticks any more and leaves it out', async () => {
        const cart = loadCart();
        await select(cart, 'a');
        // A capture whose tick was lost (the tab closed mid-tick).
        await images.put('en', 'gone', record('gone'));

        const { items, healedCount } = await cart.readReport(VIEW_ORDER);

        expect(items.map((item) => item.id)).toEqual(['a']);
        expect(healedCount).toBe(0);
        await expect.poll(storedIds).toEqual(['a']);
    });
});
