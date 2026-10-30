import { describe, expect, it, vi } from 'vitest';
import { captureRecord } from '../../support/captureRecord.js';

// Where IndexedDB is missing (private mode, old WebViews, this node test) the page store
// must keep working for the session and say so once; otherwise ticking a module silently
// produces a report with no cards.

/** The dashboard the records are filed under. */
const APP = 'tba3';

describe('the page store without IndexedDB', () => {
    it('falls back to memory and warns exactly once across operations', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        // A page of its own: the store warns once per page.
        vi.resetModules();
        const { exportImageStore: store } =
            await import('../../../../src/common/export/exportImageStore.js');

        await store.put(APP, 'a', captureRecord('A'));
        await store.put(APP, 'b', captureRecord('B'));

        expect((await store.list(APP)).map((entry) => entry.itemId).sort()).toEqual(['a', 'b']);
        expect(warn).toHaveBeenCalledTimes(1);
        expect(warn.mock.calls[0][0]).toMatch(/IndexedDB unavailable/);
    });
});
