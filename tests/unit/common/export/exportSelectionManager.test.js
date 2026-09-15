// @vitest-browser

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const remove = vi.fn(async () => {});
const clear = vi.fn(async () => {});
vi.mock('../../../../src/common/export/exportImageStore.js', () => ({
    exportImageStore: { delete: (...args) => remove(...args), clear: (...args) => clear(...args) },
}));

// WHY: export target ids are only unique within one dashboard, and the report
// view is per dashboard too. A cart shared across EN/MA/SL would show one app's
// count for another's selections and let "Auswahl leeren" in one app wipe the
// others' — so each app must persist its own cart, and the old shared cart must
// not resurface.

let instance = 0;

/**
 * A fresh manager for one dashboard path. The module reads the app off the URL at
 * evaluation time, and the browser caches a module per URL for good, so each load
 * imports it under a new query string — that is what makes it evaluate again.
 * @param {string} pathname - The dashboard path the manager should scope itself to.
 * @returns {Promise<import('../../../../src/common/export/exportSelectionManager.js').exportSelectionManager>} The manager.
 */
async function loadManagerAt(pathname) {
    window.history.replaceState(null, '', pathname);
    instance += 1;
    const url = new URL('../../../../src/common/export/exportSelectionManager.js', import.meta.url);
    url.searchParams.set('instance', String(instance));
    const { exportSelectionManager } = await import(/* @vite-ignore */ url.href);
    return exportSelectionManager;
}

function registerAndSelect(manager, id) {
    manager.registerTarget(id, { id, title: id, type: 'chart', view: 'overview', container: null });
    manager.toggleSelection(id);
}

describe('exportSelectionManager persistence', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    afterEach(() => {
        window.history.replaceState(null, '', '/');
        remove.mockClear();
        clear.mockClear();
    });

    it("persists each dashboard's cart under its own key", async () => {
        const en = await loadManagerAt('/en/');
        registerAndSelect(en, 'module-chart');

        const ma = await loadManagerAt('/ma/');
        expect(ma.getPersistedSelectedIds()).toEqual([]);
        registerAndSelect(ma, 'module-chart');
        ma.clearSelection();

        const enAgain = await loadManagerAt('/en/');
        expect(enAgain.getPersistedSelectedIds()).toEqual(['module-chart']);
        expect(Object.keys(localStorage).sort()).toEqual([
            'tba3_export_selections_en',
            'tba3_export_selections_ma',
        ]);
    });

    it('drops the pre-scoping shared cart instead of importing ids of unknown origin', async () => {
        localStorage.setItem(
            'tba3_export_selections_v2',
            JSON.stringify({
                version: 3,
                selectedIds: ['module-old'],
                selectedItems: [
                    { id: 'module-old', title: 'Alt', type: 'chart', view: 'overview' },
                ],
            }),
        );

        const en = await loadManagerAt('/en/');

        expect(en.getPersistedSelectedIds()).toEqual([]);
        expect(localStorage.getItem('tba3_export_selections_v2')).toBeNull();
    });
});

// WHY: a checkbox is ticked purely from the cart, so a cart that outlives the
// visit that filled it silently re-ticks modules the user never picked this
// time. The cart is therefore a basket for one browsing session — but a dataset
// switch is a full page reload (`classSearchParams.navigateToClass`) and must
// stay inside that session, or building a report across two classes is
// impossible. The sessionStorage marker is what tells the two apart.
describe('exportSelectionManager scopes the cart to one browsing session', () => {
    beforeEach(() => {
        localStorage.clear();
        sessionStorage.clear();
    });

    afterEach(() => {
        window.history.replaceState(null, '', '/');
        vi.restoreAllMocks();
        clear.mockClear();
    });

    it('drops a cart left by an earlier session, images included', async () => {
        localStorage.setItem(
            'tba3_export_selections_en',
            JSON.stringify({
                version: 3,
                selectedIds: ['module-chart--klasse-8a'],
            }),
        );

        const en = await loadManagerAt('/en/');

        expect(en.getPersistedSelectedIds()).toEqual([]);
        expect(localStorage.getItem('tba3_export_selections_en')).toBeNull();
        expect(clear).toHaveBeenCalledTimes(1);
    });

    it('keeps the cart across a reload of the same tab — the dataset switch', async () => {
        const en = await loadManagerAt('/en/');
        registerAndSelect(en, 'module-chart--klasse-8a');
        clear.mockClear();

        const afterReload = await loadManagerAt('/en/');

        expect(afterReload.getPersistedSelectedIds()).toEqual(['module-chart--klasse-8a']);
        expect(clear).not.toHaveBeenCalled();
    });

    it('marks the session per dashboard, so each app is gated on its own first load', async () => {
        await loadManagerAt('/en/');
        localStorage.setItem(
            'tba3_export_selections_ma',
            JSON.stringify({
                version: 3,
                selectedIds: ['module-chart--klasse-3b'],
            }),
        );

        const ma = await loadManagerAt('/ma/');

        expect(ma.getPersistedSelectedIds()).toEqual([]);
        expect(clear).toHaveBeenCalledTimes(1);
    });

    it('leaves the stored cart alone when session storage is unavailable', async () => {
        localStorage.setItem(
            'tba3_export_selections_en',
            JSON.stringify({
                version: 3,
                selectedIds: ['module-chart--klasse-8a'],
            }),
        );
        const readItem = Storage.prototype.getItem;
        vi.spyOn(Storage.prototype, 'getItem').mockImplementation(function (key) {
            if (key === 'tba3_export_session_en') throw new Error('blocked');
            return readItem.call(this, key);
        });

        const en = await loadManagerAt('/en/');

        expect(en.getPersistedSelectedIds()).toEqual(['module-chart--klasse-8a']);
        expect(clear).not.toHaveBeenCalled();
    });
});

// WHY: a selection without its image is useless to the report and an image
// without its selection is an orphan in IndexedDB; the manager owns both sides
// so every caller (checkbox, toolbar, report card) drops them with one call.
describe('exportSelectionManager owns the stored images', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    afterEach(() => {
        window.history.replaceState(null, '', '/');
        remove.mockClear();
        clear.mockClear();
    });

    it('deselect and toggle-off delete the image, clearSelection clears them all', async () => {
        const en = await loadManagerAt('/en/');
        registerAndSelect(en, 'a');
        registerAndSelect(en, 'b');

        en.deselect('a');
        expect(remove).toHaveBeenCalledWith('a');
        expect(en.toggleSelection('b')).toBe(false);
        expect(remove).toHaveBeenCalledWith('b');

        registerAndSelect(en, 'c');
        en.clearSelection();
        expect(clear).toHaveBeenCalledTimes(1);
        expect(en.getPersistedSelectedIds()).toEqual([]);
    });

    it('does not touch the store for an id that is not selected', async () => {
        const en = await loadManagerAt('/en/');
        en.deselect('never-selected');
        expect(remove).not.toHaveBeenCalled();
    });
});

// WHY: two tabs of the same app share the cart. Without re-reading it when
// another tab writes, tab A keeps an id tab B unticked (image already deleted)
// and writes it back on its next save — a selection without an image.
describe('exportSelectionManager follows the cart written by another tab', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    afterEach(() => {
        window.history.replaceState(null, '', '/');
    });

    it('re-reads its own key on a storage event and notifies listeners', async () => {
        const en = await loadManagerAt('/en/');
        registerAndSelect(en, 'a');
        registerAndSelect(en, 'b');
        const listener = vi.fn();
        en.on('selectionChanged', listener);

        // Tab B unticked "b".
        const newValue = JSON.stringify({ version: 3, selectedIds: ['a'] });
        localStorage.setItem('tba3_export_selections_en', newValue);
        window.dispatchEvent(
            new StorageEvent('storage', { key: 'tba3_export_selections_en', newValue }),
        );

        expect(en.getPersistedSelectedIds()).toEqual(['a']);
        expect(en.isSelected('b')).toBe(false);
        expect(listener).toHaveBeenCalledWith(
            expect.objectContaining({ selectedIds: ['a'], external: true }),
        );
    });

    it('ignores storage events for other keys and other apps', async () => {
        const en = await loadManagerAt('/en/');
        registerAndSelect(en, 'a');
        const listener = vi.fn();
        en.on('selectionChanged', listener);

        window.dispatchEvent(
            new StorageEvent('storage', {
                key: 'tba3_export_selections_ma',
                newValue: '{"version":3,"selectedIds":[]}',
            }),
        );
        window.dispatchEvent(
            new StorageEvent('storage', { key: 'tba3_report_layout_v1', newValue: '{}' }),
        );

        expect(en.getPersistedSelectedIds()).toEqual(['a']);
        expect(listener).not.toHaveBeenCalled();
    });
});

// WHY: restoring a tick on re-registration is right for a module that remounts
// after a view switch, and wrong when two cards share one id — then the restored
// tick belongs to a capture of something else, and the next tick overwrites it.
// That is how every SL overview card ended up sharing one report card, so the
// collision has to announce itself instead of silently reusing the selection.
describe('exportSelectionManager flags a reused export id', () => {
    /** @type {import("vitest").MockInstance} */
    let warn;

    beforeEach(() => {
        localStorage.clear();
        warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    });

    afterEach(() => {
        window.history.replaceState(null, '', '/');
        remove.mockClear();
        vi.restoreAllMocks();
    });

    const registerAs = (manager, id, title) =>
        manager.registerTarget(id, { id, title, type: 'chart' });

    it('warns when a ticked id re-registers under another title', async () => {
        const sl = await loadManagerAt('/sl/');
        registerAs(sl, 'shared-id', 'Deutsch');
        sl.toggleSelection('shared-id');

        // The next overview card opens the same overlay, so it claims the same id.
        registerAs(sl, 'shared-id', 'Mathe');

        expect(warn).toHaveBeenCalledTimes(1);
        expect(warn.mock.calls[0][0]).toContain('shared-id');
        expect(warn.mock.calls[0][0]).toContain('Deutsch');
        expect(warn.mock.calls[0][0]).toContain('Mathe');
    });

    it('stays quiet when the same module remounts, and keeps its tick', async () => {
        const sl = await loadManagerAt('/sl/');
        registerAs(sl, 'chart-a', 'Lesen');
        sl.toggleSelection('chart-a');

        // View switch: the module unmounts and comes back unchanged.
        sl.unregister('chart-a');
        registerAs(sl, 'chart-a', 'Lesen');

        expect(warn).not.toHaveBeenCalled();
        expect(sl.isSelected('chart-a')).toBe(true);
    });

    it('stays quiet for a registration that restores no tick', async () => {
        const sl = await loadManagerAt('/sl/');
        registerAs(sl, 'fresh', 'Deutsch');
        registerAs(sl, 'fresh', 'Mathe');

        expect(warn).not.toHaveBeenCalled();
    });

    it('forgets the title once the tick is gone, so a later reuse is not misreported', async () => {
        const sl = await loadManagerAt('/sl/');
        registerAs(sl, 'shared-id', 'Deutsch');
        sl.toggleSelection('shared-id');
        sl.deselect('shared-id');

        registerAs(sl, 'shared-id', 'Mathe');

        expect(warn).not.toHaveBeenCalled();
    });
});
