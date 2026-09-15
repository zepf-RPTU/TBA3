// @vitest-browser
/**
 * The shared resize observer's failure contract.
 *
 * Every chart registers `() => this._render()` — an async function — as its
 * resize callback. If the service only guarded synchronous throws, a failed
 * redraw would escape as an `unhandledrejection`, and the global handler would
 * report one chart's problem as a page-wide failure.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { resizeService } from '@tba3/module-base/services/resizeService.js';

const DEBOUNCE_MS = 10;

/** Resolve once `predicate()` holds, or reject after `timeoutMs`. */
async function until(predicate, timeoutMs = 2000) {
    const deadline = Date.now() + timeoutMs;
    while (!predicate()) {
        if (Date.now() > deadline) throw new Error('Timed out waiting for the resize callback');
        await new Promise((resolve) => setTimeout(resolve, 10));
    }
}

let host;

/** Every scope a test below registers under; released after each test. */
const SCOPES = ['scope-a', 'scope-c', 'scope-d', 'scope-e'];

beforeEach(() => {
    host = document.createElement('div');
    host.style.width = '200px';
    host.style.height = '100px';
    document.body.appendChild(host);
});

afterEach(() => {
    for (const scope of SCOPES) resizeService.removeByScope(scope);
    host.remove();
});

describe('resizeService registration', () => {
    it('registers and releases an observation by scope', () => {
        expect(resizeService.observe(host, () => {}, { scopeId: 'scope-a' })).toBe(true);

        expect(resizeService.removeByScope('scope-a')).toBe(1);
        expect(resizeService.removeByScope('scope-a')).toBe(0);
    });

    it('refuses a callback that is not a function', () => {
        const error = vi.spyOn(console, 'error').mockImplementation(() => {});

        expect(resizeService.observe(host, /** @type {any} */ ('nope'))).toBe(false);
        expect(resizeService.unobserve(host)).toBe(false);

        error.mockRestore();
    });
});

describe('resizeService callback failures', () => {
    it('logs a rejected async callback instead of letting it escape unhandled', async () => {
        const error = vi.spyOn(console, 'error').mockImplementation(() => {});
        const unhandled = vi.fn();
        window.addEventListener('unhandledrejection', unhandled);

        const boom = new Error('render failed');
        const callback = vi.fn(async () => {
            throw boom;
        });

        resizeService.observe(host, callback, { scopeId: 'scope-c', debounceMs: DEBOUNCE_MS });
        host.style.width = '320px';

        await until(() => callback.mock.calls.length > 0);
        // Give an escaping rejection every chance to reach the window.
        await new Promise((resolve) => setTimeout(resolve, 50));

        expect(error).toHaveBeenCalledWith('[ResizeService] Callback error:', boom);
        expect(unhandled).not.toHaveBeenCalled();

        window.removeEventListener('unhandledrejection', unhandled);
        error.mockRestore();
    });

    it('logs a synchronous throw from a callback the same way', async () => {
        const error = vi.spyOn(console, 'error').mockImplementation(() => {});

        const boom = new Error('sync failure');
        const callback = vi.fn(() => {
            throw boom;
        });

        resizeService.observe(host, callback, { scopeId: 'scope-d', debounceMs: DEBOUNCE_MS });
        host.style.width = '340px';

        await until(() => callback.mock.calls.length > 0);
        await new Promise((resolve) => setTimeout(resolve, 50));

        expect(error).toHaveBeenCalledWith('[ResizeService] Callback error:', boom);

        error.mockRestore();
    });

    it('keeps delivering to the other observers after one of them fails', async () => {
        const error = vi.spyOn(console, 'error').mockImplementation(() => {});

        const sibling = document.createElement('div');
        sibling.style.width = '200px';
        sibling.style.height = '100px';
        document.body.appendChild(sibling);

        const failing = vi.fn(async () => {
            throw new Error('render failed');
        });
        const healthy = vi.fn();

        resizeService.observe(host, failing, { scopeId: 'scope-e', debounceMs: DEBOUNCE_MS });
        resizeService.observe(sibling, healthy, { scopeId: 'scope-e', debounceMs: DEBOUNCE_MS });
        host.style.width = '360px';
        sibling.style.width = '360px';

        await until(() => failing.mock.calls.length > 0 && healthy.mock.calls.length > 0);

        expect(healthy).toHaveBeenCalled();

        sibling.remove();
        error.mockRestore();
    });
});
