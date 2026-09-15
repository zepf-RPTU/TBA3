// @vitest-browser

/**
 * KS distribution — which comparison groups are drawn follows the app's comparison state.
 *
 * The app toggles comparison *ids* (`school`, `state`, …) — the same ids the item
 * lollipop's averages carry, which is what lets one ⌀ toggle drive every MA chart. The
 * KS chart draws by group *name*, so the base renderer owns the translation for EN and
 * MA alike. Called on the prototype with only the fields the rule reads: constructing a
 * renderer needs d3 and a live container, and the rule depends on neither.
 */

import { describe, expect, it } from 'vitest';

import { BaseKsDistributionChartRenderer } from '@tba3/modules/common/charts/ksDistribution/baseKsDistributionChartRenderer.js';

const proto = BaseKsDistributionChartRenderer.prototype;

/** The MA fixture's three groups: the class first, then the two comparison populations. */
function makeGroups() {
    return {
        groupIdToName: new Map([
            ['3a-mathe', '3a'],
            ['school', 'Schulschnitt'],
            ['state', 'Landesschnitt'],
        ]),
        primaryGroupName: '3a',
        comparisonGroupIds: ['school', 'state'],
    };
}

describe('KS distribution — visible groups follow the comparison state', () => {
    it('draws every group the payload carries when the host has no comparison state', () => {
        // WHY: null is "no opinion", not "none active" — the same rule the marker
        // charts follow. Only a consumer reaches this; tba3 always supplies a state.
        const chart = makeGroups();

        proto.syncVisibleGroups.call(chart, null);

        expect([...chart.visibleGroups].sort()).toEqual(['3a', 'Landesschnitt', 'Schulschnitt']);
    });

    it('always draws the primary group, whatever the modes say', () => {
        // WHY: the class is what the chart is *about*; the toggles only add references
        // beside it. With every comparison off, the class bar still stands.
        const chart = makeGroups();

        proto.syncVisibleGroups.call(chart, []);

        expect([...chart.visibleGroups]).toEqual(['3a']);
    });

    it('reveals exactly the active ids the payload carries, by name', () => {
        // WHY: an active id the payload lacks (`state:hb` here) has no bar to show and
        // must add nothing — the toggle menu never offered it, and drawing a substitute
        // would be a comparison the data does not contain.
        const chart = makeGroups();

        proto.syncVisibleGroups.call(chart, ['state', 'state:hb']);

        expect([...chart.visibleGroups]).toEqual(['3a', 'Landesschnitt']);
    });

    it('reads activeModes from reactive state when called without an argument', () => {
        // The base calls it this way after every data sync, so a fresh payload is drawn
        // against the state the app already holds — no per-chart copy to go stale.
        const chart = { ...makeGroups(), _state: { activeModes: ['school'] } };

        proto.syncVisibleGroups.call(chart);

        expect([...chart.visibleGroups]).toEqual(['3a', 'Schulschnitt']);
    });

    it('offers every payload comparison group to the toggle, but never the primary row', () => {
        // WHY: the same rule as above, seen from the menu — toggling the primary row
        // would change nothing, so it is not on offer. Paired with the shared control's
        // empty ⇒ remove rule, a class-only payload takes the button away.
        expect(proto.getDrawableComparisonIds.call(makeGroups())).toEqual(['school', 'state']);
        expect(
            proto.getDrawableComparisonIds.call({
                groupIdToName: new Map([['3a-mathe', '3a']]),
                primaryGroupName: '3a',
                comparisonGroupIds: [],
            }),
        ).toEqual([]);
    });
});
