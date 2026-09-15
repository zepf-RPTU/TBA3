// @vitest-browser
/**
 * colorSchemeService: the stored preference is one of system / light / dark, the
 * <html> attribute always carries the *resolved* scheme, and the OS preference is
 * followed only while `system` is chosen.
 *
 * Runs in real Chromium because it needs `matchMedia` and `localStorage`; the OS
 * preference itself cannot be flipped from inside the page, so the change listener is
 * driven through a stubbed `matchMedia`.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import {
    COLOR_SCHEMES,
    applyColorScheme,
    getActiveColorScheme,
    initColorScheme,
} from '@tba3/modules/common/services/colorSchemeService.js';

const STORAGE_KEY = 'tba3_color_scheme';

const resolved = () => document.documentElement.dataset.colorScheme;

beforeEach(() => {
    localStorage.removeItem(STORAGE_KEY);
    delete document.documentElement.dataset.colorScheme;
});

afterEach(() => {
    localStorage.removeItem(STORAGE_KEY);
    delete document.documentElement.dataset.colorScheme;
    vi.restoreAllMocks();
});

describe('colorSchemeService', () => {
    it('offers system, light and dark', () => {
        expect(COLOR_SCHEMES.map((scheme) => scheme.id)).toEqual(['system', 'light', 'dark']);
    });

    it('stamps the resolved scheme and persists the choice', () => {
        expect(applyColorScheme('dark')).toBe('dark');
        expect(resolved()).toBe('dark');
        expect(localStorage.getItem(STORAGE_KEY)).toBe('dark');
        expect(getActiveColorScheme()).toBe('dark');

        applyColorScheme('light');
        expect(resolved()).toBe('light');
    });

    it('falls back to system for an unknown id', () => {
        expect(applyColorScheme('sepia')).toBe('system');
        expect(getActiveColorScheme()).toBe('system');
        expect(['light', 'dark']).toContain(resolved());
    });

    it('resolves system from the OS preference', () => {
        const query = { matches: true, addEventListener: vi.fn() };
        vi.spyOn(window, 'matchMedia').mockReturnValue(/** @type {any} */ (query));

        applyColorScheme('system');
        expect(localStorage.getItem(STORAGE_KEY)).toBe('system');
        expect(resolved()).toBe('dark');
    });

    it('initColorScheme applies the stored preference and follows the OS only under system', () => {
        const query = { matches: false, addEventListener: vi.fn() };
        vi.spyOn(window, 'matchMedia').mockReturnValue(/** @type {any} */ (query));
        localStorage.setItem(STORAGE_KEY, 'system');
        const onSystemChange = vi.fn();

        initColorScheme(onSystemChange);
        expect(resolved()).toBe('light');
        expect(query.addEventListener).toHaveBeenCalledWith('change', expect.any(Function));
        const [, listener] = query.addEventListener.mock.calls[0];

        query.matches = true;
        listener();
        expect(resolved()).toBe('dark');
        expect(onSystemChange).toHaveBeenCalledTimes(1);

        // An explicit choice is not overridden by the OS.
        applyColorScheme('light');
        query.matches = false;
        listener();
        expect(resolved()).toBe('light');
        expect(onSystemChange).toHaveBeenCalledTimes(1);
    });
});
