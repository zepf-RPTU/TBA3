// @vitest-browser

/**
 * ChartRenderer's comparison-visibility state — the map the EN marker charts fade by.
 *
 * Both functions are pure and take the active ids as a list, so the shared base never
 * depends on one app's state object; the apps pass `getActiveComparisons()`. Called
 * on the prototype: neither reads `this`.
 */

import { describe, expect, it } from 'vitest';

import { ChartRenderer } from '@tba3/modules/common/charts/renderers/chartRenderer.js';

const proto = ChartRenderer.prototype;

describe('initVisibilityState', () => {
    it('gives a mode the chart cannot draw no key at all — not a true', () => {
        // WHY: the keys are the chart's toggleable modes, i.e. the groups its payload
        // carries. An app-active id outside that list used to default to visible, which
        // is how an untoggleable state marker rendered on datasets with no state group.
        const state = proto.initVisibilityState.call({}, ['school'], ['school', 'state'], {
            includeStudent: false,
            includeClass: false,
        });

        expect(state).toEqual({ school: true });
        expect('state' in state).toBe(false);
    });

    it('keys every toggleable mode, on or off, and adds student/class only when asked', () => {
        const state = proto.initVisibilityState.call({}, ['school', 'state'], ['state']);

        expect(state).toEqual({ school: false, state: true, student: true, class: true });
    });

    it('shows every drawable mode when the host has no comparison state at all', () => {
        // WHY: null is "no opinion", not "none active". A host that hands the chart
        // averages and no state means to see them — and the loop is already limited to
        // the modes this payload carries, so this cannot revive a marker for a group
        // the data does not contain. tba3 always supplies a state, so nothing in the
        // dashboards exercises this.
        const state = proto.initVisibilityState.call({}, ['school', 'state'], null, {
            includeStudent: false,
            includeClass: false,
        });

        expect(state).toEqual({ school: true, state: true });
    });

    it('keeps an empty list meaning "none" — an opinion is not an absence', () => {
        const state = proto.initVisibilityState.call({}, ['school', 'state'], [], {
            includeStudent: false,
            includeClass: false,
        });

        expect(state).toEqual({ school: false, state: false });
    });
});

describe('updateVisibilityFromModes', () => {
    it('follows the new active list and re-asserts the always-on keys without mutating', () => {
        // WHY: student/class are not comparison modes — a toggle event carries only the
        // comparison ids, and must not switch the chart's own series off as a side effect.
        const current = { school: true, state: false, student: false, class: false };

        const next = proto.updateVisibilityFromModes.call(
            {},
            ['state'],
            ['school', 'state'],
            current,
        );

        expect(next).toEqual({ school: false, state: true, student: true, class: true });
        expect(current).toEqual({ school: true, state: false, student: false, class: false });
    });
});
