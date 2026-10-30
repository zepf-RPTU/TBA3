import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it, vi } from 'vitest';

/**
 * Chart motion is set twice — the D3 transitions read `MOTION`, the CSS transitions
 * read the `--motion-duration-*` tokens — and a tooltip fading at one pace over a mark
 * moving at another reads as two unrelated animations. The reduced-motion half pins
 * that `animate()` hands back the bare selection, so every chain written against it
 * lands its end state at once instead of animating.
 */

/**
 * Load a fresh copy of the module: it caches the media query on first use.
 * @param {boolean} reduce - What the stubbed `prefers-reduced-motion` query reports.
 */
async function loadMotion(reduce) {
    vi.resetModules();
    vi.stubGlobal('window', { matchMedia: () => ({ matches: reduce }) });
    return import('../../../src/common/charts/motionPreference.js');
}

// The first load transforms the module and pulls in all of d3: seconds on a loaded
// machine, which belongs to no single test's timeout.
beforeAll(() => loadMotion(false));

/** A selection stand-in that records the transition chain started on it. */
function fakeSelection() {
    const transition = {
        duration: vi.fn(() => transition),
        ease: vi.fn(() => transition),
    };
    const selection = { transition: vi.fn(() => transition) };
    // `animate` reaches only `transition()` on it; the rest of a selection is never read.
    return {
        selection: /** @type {import('d3').Selection<any, any, any, any> & typeof selection} */ (
            /** @type {unknown} */ (selection)
        ),
        transition,
    };
}

describe('MOTION', () => {
    it('matches the --motion-duration-* tokens CSS transitions read', async () => {
        // SLOW is the chart zoom's alone; no stylesheet transition runs that long.
        const { MOTION } = await loadMotion(false);
        const css = readFileSync(
            new URL('../../../../module-base/src/styles/tokens.css', import.meta.url),
            'utf8',
        );
        const token = (/** @type {string} */ name) =>
            Number(css.match(new RegExp(`--motion-duration-${name}:\\s*(\\d+)ms;`))?.[1]);

        expect({ FAST: token('fast'), BASE: token('base') }).toEqual({
            FAST: MOTION.FAST_MS,
            BASE: MOTION.BASE_MS,
        });
    });
});

describe('animate', () => {
    it('returns the bare selection under reduced motion', async () => {
        const { animate } = await loadMotion(true);
        const { selection } = fakeSelection();

        expect(animate(selection, { durationMs: 300 })).toBe(selection);
        expect(selection.transition).not.toHaveBeenCalled();
    });

    it('returns the bare selection for a zero duration', async () => {
        const { animate } = await loadMotion(false);
        const { selection } = fakeSelection();

        expect(animate(selection, { durationMs: 0 })).toBe(selection);
        expect(selection.transition).not.toHaveBeenCalled();
    });
});
