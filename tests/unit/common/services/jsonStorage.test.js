// @vitest-browser

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readJson, writeJson } from '../../../../src/common/services/jsonStorage.js';

// The notes keep a JSON record in localStorage, the report layout one in sessionStorage.
// A missing or corrupt one reads as absent and never throws into the store that asked,
// and neither does a write that storage refuses.

describe('jsonStorage', () => {
    beforeEach(() => {
        localStorage.clear();
        sessionStorage.clear();
    });

    it('keeps a record in the storage area asked for', () => {
        writeJson('k', { tab: true }, 'sessionStorage');

        expect(readJson('k', 'sessionStorage')).toEqual({ tab: true });
        expect(readJson('k')).toBeNull();
    });

    it('reads a missing record as absent, and a corrupt one too, logging why', () => {
        const error = vi.spyOn(console, 'error').mockImplementation(() => {});

        expect(readJson('k')).toBeNull();
        expect(error).not.toHaveBeenCalled();
        localStorage.setItem('k', '{not json');
        expect(readJson('k')).toBeNull();
        expect(error).toHaveBeenCalledOnce();
    });

    it('logs a refused write instead of throwing', () => {
        const error = vi.spyOn(console, 'error').mockImplementation(() => {});
        vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
            throw new Error('quota');
        });

        writeJson('k', {});

        expect(error).toHaveBeenCalledOnce();
    });
});
