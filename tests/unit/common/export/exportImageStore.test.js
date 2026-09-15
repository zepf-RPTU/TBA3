import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// WHY: the report is only as good as the images behind it. Where IndexedDB is
// missing (private mode, old WebViews — and this node test) the store must
// keep working for the session, say so once, and still keep the apps apart —
// otherwise ticking a module silently produces a report with no cards.

const { exportImageStore } = await import('../../../../src/common/export/exportImageStore.js');

const record = (title, view = 'overview') => ({
    title,
    view,
    type: 'chart',
    blob: new Blob(['x'], { type: 'image/png' }),
    width: 10,
    height: 5,
    capturedAt: 1,
    docOrder: 0,
});

describe('exportImageStore without IndexedDB', () => {
    let warn;

    beforeEach(() => {
        warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    });

    afterEach(async () => {
        await exportImageStore.clear();
        vi.restoreAllMocks();
    });

    it('falls back to memory and warns exactly once across operations', async () => {
        await exportImageStore.put('a', record('A'));
        await exportImageStore.put('b', record('B'));
        await exportImageStore.list();

        expect(warn).toHaveBeenCalledTimes(1);
        expect(warn.mock.calls[0][0]).toMatch(/IndexedDB unavailable/);
    });

    it('put/list/delete/clear round-trip records with their item ids', async () => {
        await exportImageStore.put('a', record('A'));
        await exportImageStore.put('b', record('B', 'item'));

        expect((await exportImageStore.list()).find((entry) => entry.itemId === 'a')?.title).toBe(
            'A',
        );
        expect((await exportImageStore.list()).map((entry) => entry.itemId).sort()).toEqual([
            'a',
            'b',
        ]);

        await exportImageStore.delete('a');
        expect((await exportImageStore.list()).map((entry) => entry.itemId)).toEqual(['b']);

        await exportImageStore.clear();
        expect(await exportImageStore.list()).toEqual([]);
    });

    it('overwrites a re-captured item in place', async () => {
        await exportImageStore.put('a', record('old'));
        await exportImageStore.put('a', record('new'));

        const records = await exportImageStore.list();
        expect(records).toHaveLength(1);
        expect(records[0].title).toBe('new');
    });

    it('scopes list() and clear() to the current app', async () => {
        // No page URL here, so the app id is the fallback 'tba3'; simulate a
        // second app by planting a record under another prefix.
        await exportImageStore.put('a', record('A'));
        globalThis.location = /** @type {any} */ ({ pathname: '/ma/' });
        try {
            await exportImageStore.put('a', record('MA'));
            expect((await exportImageStore.list()).map((entry) => entry.title)).toEqual(['MA']);
            await exportImageStore.clear();
            expect(await exportImageStore.list()).toEqual([]);
        } finally {
            delete globalThis.location;
        }
        expect((await exportImageStore.list()).map((entry) => entry.title)).toEqual(['A']);
    });
});
