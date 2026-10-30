// @vitest-browser

import { describe, it, expect } from 'vitest';
import { createIcon, iconSvg } from '../../src/utils/icons.js';

describe('icons', () => {
    // Every icon in the app resolves through this one registry, so a typo must
    // fail loudly instead of leaving an empty button behind.
    it('throws on an unknown icon name', () => {
        expect(() => iconSvg('not_an_icon')).toThrow(/Unknown icon "not_an_icon"/);
        expect(() => createIcon('')).toThrow(/Unknown icon/);
    });
});
