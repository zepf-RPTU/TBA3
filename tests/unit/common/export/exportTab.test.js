// @vitest-browser

import { describe, expect, it, vi } from 'vitest';
import { claimExportTab, exportTabId } from '../../../../src/common/export/exportTab.js';

// The boot awaits the claim before anything reads the cart: a lock request that fails
// must leave the tab as a page without Web Locks is left, keeping its id, never hang it.

describe('claimExportTab', () => {
    it('keeps the tab id, unlocked, when the lock request rejects', async () => {
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        vi.spyOn(navigator.locks, 'request').mockRejectedValue(new Error('lock failed'));
        const tabId = exportTabId('lock-rejects');

        await claimExportTab('lock-rejects');

        expect(exportTabId('lock-rejects')).toBe(tabId);
    });

    it('keeps the tab id, unlocked, when the lock request throws', async () => {
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        vi.spyOn(navigator.locks, 'request').mockImplementation(() => {
            throw new Error('locks unavailable');
        });
        const tabId = exportTabId('lock-throws');

        await claimExportTab('lock-throws');

        expect(exportTabId('lock-throws')).toBe(tabId);
    });
});
