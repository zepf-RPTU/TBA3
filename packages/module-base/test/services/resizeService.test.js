// @vitest-browser
/**
 * The shared resize observer's flush order and failure contract.
 *
 * A resize callback may be async. If the service only
 * guarded synchronous throws, a failed redraw would escape as an `unhandledrejection`,
 * and the global handler would report one chart's problem as a page-wide failure.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { resizeService } from '../../src/services/resizeService.js';

const DEBOUNCE_MS = 10;

/**
 * Resolve once `predicate()` holds, or reject when it still does not after two seconds.
 * @param {() => boolean} predicate
 * @returns {Promise<void>}
 */
const until = (predicate) =>
    vi.waitFor(() => expect(predicate()).toBe(true), { timeout: 2000, interval: 10 });

/** @type {HTMLDivElement} */
let host;

/** @type {Array<() => void>} Every observation a test below starts; released after each test. */
let releases = [];

/**
 * Observe through the service and remember the release.
 * @param {Parameters<typeof resizeService.observe>} args
 * @returns {() => void}
 */
function observe(...args) {
    const release = resizeService.observe(...args);
    releases.push(release);
    return release;
}

beforeEach(() => {
    host = document.createElement('div');
    host.style.width = '200px';
    host.style.height = '100px';
    document.body.appendChild(host);
});

afterEach(() => {
    releases.forEach((release) => release());
    releases = [];
    host.remove();
});

describe('resizeService registration', () => {
    it('stops delivering once the observation is released', async () => {
        const released = vi.fn();
        observe(host, released, { debounceMs: DEBOUNCE_MS })();
        const live = vi.fn();
        const sibling = document.createElement('div');
        document.body.appendChild(sibling);
        observe(sibling, live, { debounceMs: DEBOUNCE_MS });

        host.style.width = '310px';
        sibling.style.width = '310px';
        await until(() => live.mock.calls.length > 0);

        expect(released).not.toHaveBeenCalled();
        sibling.remove();
    });

    it("a replaced observation's old release leaves the new one alone", async () => {
        const first = observe(host, () => {}, { debounceMs: DEBOUNCE_MS });
        const second = vi.fn();
        observe(host, second, { debounceMs: DEBOUNCE_MS });
        first();

        host.style.width = '330px';
        await until(() => second.mock.calls.length > 0);
        expect(second).toHaveBeenCalled();
    });
});

describe('resizeService flush order', () => {
    it('measures every observer resized in one burst before any of them draws', async () => {
        // A measure after a draw reads a box the draw just invalidated — one forced
        // layout per chart instead of one per flush.
        const sibling = document.createElement('div');
        sibling.style.width = '200px';
        sibling.style.height = '100px';
        document.body.appendChild(sibling);
        /** @type {string[]} */
        const log = [];
        /**
         * @param {string} name - Which observer logs.
         * @param {boolean} stale - What its measure answers.
         */
        const handler = (name, stale) => ({
            measure: () => {
                log.push(`measure ${name}`);
                return stale;
            },
            draw: () => log.push(`draw ${name}`),
        });
        const third = document.createElement('div');
        document.body.appendChild(third);
        observe(host, handler('a', true), { debounceMs: DEBOUNCE_MS });
        observe(sibling, handler('b', true), { debounceMs: DEBOUNCE_MS });
        observe(third, handler('c', false), { debounceMs: DEBOUNCE_MS });
        await until(() => log.length === 5);
        log.length = 0;

        host.style.width = '370px';
        sibling.style.width = '370px';
        third.style.width = '370px';
        await until(() => log.length === 5);

        expect(log).toEqual(['measure a', 'measure b', 'measure c', 'draw a', 'draw b']);
        sibling.remove();
        third.remove();
    });

    it('does not draw an observation an earlier draw of the same flush released', async () => {
        // An owner torn down by a sibling's redraw has released its observation;
        // its draw, already collected for this flush, would run on a destroyed owner.
        const sibling = document.createElement('div');
        sibling.style.width = '200px';
        sibling.style.height = '100px';
        document.body.appendChild(sibling);
        const released = vi.fn();
        /** @type {() => void} */
        let releaseSibling = () => {};
        const first = vi.fn(() => releaseSibling());
        observe(host, first, { debounceMs: DEBOUNCE_MS });
        releaseSibling = observe(sibling, released, { debounceMs: DEBOUNCE_MS, busy: true });

        // Observing reports both boxes once, in one flush: the host's draw runs first.
        await until(() => first.mock.calls.length > 0);

        expect(released).not.toHaveBeenCalled();
        expect(sibling.hasAttribute('aria-busy')).toBe(false);
        sibling.remove();
    });
});

describe('resizeService busy marking', () => {
    it('marks a busy observation aria-busy from the resize until its callback has run', async () => {
        // A redraw pending behind the debounce is what an e2e settle must wait out.
        /** @type {boolean[]} */
        const busyDuringCallback = [];
        const callback = vi.fn(() => {
            busyDuringCallback.push(host.getAttribute('aria-busy') === 'true');
        });
        observe(host, callback, { debounceMs: DEBOUNCE_MS, busy: true });
        await until(() => callback.mock.calls.length > 0);

        host.style.width = '350px';
        // The busy window lasts one debounce: the callback records it rather than a poll.
        await until(() => callback.mock.calls.length > 1);

        expect(busyDuringCallback.at(-1)).toBe(true);
        expect(host.hasAttribute('aria-busy')).toBe(false);
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

        observe(host, callback, { debounceMs: DEBOUNCE_MS });
        host.style.width = '320px';

        await until(() => callback.mock.calls.length > 0);
        // An escaped rejection reaches the window from a task queued once the rejecting
        // task's microtasks have run; this timer is queued later and so lands after it.
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

        observe(host, callback, { debounceMs: DEBOUNCE_MS });
        host.style.width = '340px';

        await until(() => callback.mock.calls.length > 0);

        expect(error).toHaveBeenCalledWith('[ResizeService] Callback error:', boom);

        error.mockRestore();
    });

    it('keeps delivering to the other observers after one of them fails', async () => {
        const error = vi.spyOn(console, 'error').mockImplementation(() => {});

        const sibling = document.createElement('div');
        sibling.style.width = '200px';
        sibling.style.height = '100px';
        document.body.appendChild(sibling);

        // A throwing measure, the step every observation of a flush runs before any
        // draws: each draw runs apart, so only a measure can take the others down.
        const failing = {
            measure: vi.fn(() => {
                throw new Error('measure failed');
            }),
            draw: vi.fn(),
        };
        const healthy = vi.fn();

        observe(host, failing, { debounceMs: DEBOUNCE_MS });
        observe(sibling, healthy, { debounceMs: DEBOUNCE_MS });
        host.style.width = '360px';
        sibling.style.width = '360px';

        await until(() => failing.measure.mock.calls.length > 0 && healthy.mock.calls.length > 0);

        expect(healthy).toHaveBeenCalled();

        sibling.remove();
        error.mockRestore();
    });
});
