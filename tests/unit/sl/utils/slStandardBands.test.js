import { describe, it, expect, beforeEach } from 'vitest';

import {
    registerCompetenceLevelScales,
    resetCompetenceLevelPalette,
} from '@tba3/modules/common/services/competenceLevelPalette.js';
import { resolveStandardBandsForAlias } from '@tba3/modules/sl/utils/slCompetenceLevels.js';
import { scalePayloadRow } from '../../support/competenceScaleFixture.js';

/**
 * Naming the competence band a standard starts at — the parenthetical in
 * "den Regelstandard oder höher (≥ III bzw. B1)".
 *
 * That text was typed into `info_boxes.json`, which pinned the whole file to the demo
 * fixture's two scales: it is true for `sl`, half-true for Bremen's `MiStd--…OptStd`, and
 * says nothing at all on Nordrhein-Westfalen's `KS 1…KS 5`. Since the file carries no numbers — only
 * prose and placeholders — that wording was the single thing keeping one shared file
 * from serving every dataset, and it left every Kasten empty on any other scale.
 *
 * The distinction being pinned throughout: this answers *where a rank begins*, one entry
 * per scale, whereas `resolveCompetenceLevelRankAlias` answers *which levels count* and
 * returns every one of them. A share needs the second; prose needs the first.
 */

const KMK_NAMES = [
    'unter Mindeststandard',
    'Mindeststandard',
    'Regelstandard',
    'Regelstandard plus',
    'Optimalstandard',
];

/**
 * A scale row whose levels carry KMK standard names, so ranks resolve.
 * `ranks` is one entry per level: a number names that standard, `null` leaves the level
 * unnamed the way NRW ships `k.h.N.`
 */
function scaleRow(levelNames, ranks) {
    return scalePayloadRow(
        levelNames.map((nameShort, index) => ({
            nameShort,
            rank: ranks[index],
            name: ranks[index] === null ? null : KMK_NAMES[ranks[index] - 1],
        })),
    );
}

// The shipped scale shapes, named for the state ladder each models.
const ROMAN = scaleRow(['Ia', 'Ib', 'II', 'III', 'IV', 'V'], [1, 1, 2, 3, 4, 5]);
const GER = scaleRow(['A1', 'A2', 'B1', 'B2', 'C1'], [1, 2, 3, 4, 5]);
const NI_GER = scaleRow(['A1.1', 'A1.2', 'A2.1', 'A2.2', 'B1.1', 'B1.2'], [1, 1, 2, 2, 3, 3]);
const HB = scaleRow(
    ['MiStd--', 'MiStd-', 'MiStd', 'ReStd', 'ReStd+', 'OptStd'],
    [1, 1, 2, 3, 4, 5],
);
const NRW = scaleRow(['k.h.N.', 'KS 1', 'KS 2', 'KS 3', 'KS 4', 'KS 5'], [null, 1, 2, 3, 4, 5]);

describe('resolveStandardBandsForAlias', () => {
    beforeEach(() => {
        resetCompetenceLevelPalette();
    });

    it('names the band each scale reaches the rank at, not every qualifying level', () => {
        // `sl`: the demo fixture's two scales, and the exact string its info boxes used
        // to hardcode. This is the case that proves the placeholder is a faithful
        // replacement rather than a rewording.
        registerCompetenceLevelScales([ROMAN, GER]);

        expect(resolveStandardBandsForAlias('ge_3')).toEqual(['III', 'B1']);
        // The share question over the same alias spans six levels — the contrast is the
        // whole point of having two resolvers.
        expect(resolveStandardBandsForAlias('ge_3').length).toBe(2);
    });

    it('collapses a split band to the band, which is what the German already said', () => {
        // `Ia` and `Ib` are both rank 1 and both paint band `I`. The hand-written prose
        // read "(I bzw. A1)" — the band — so reporting `nameShort` would have been a
        // regression in wording even though it is more precise.
        registerCompetenceLevelScales([ROMAN, GER]);

        expect(resolveStandardBandsForAlias('e_1')).toEqual(['I', 'A1']);
    });

    it('collapses Niedersachsen sub-bands the same way', () => {
        // A1.1/A1.2 → A1, and Regelstandard starts at B1.1 → B1.
        registerCompetenceLevelScales([NI_GER]);

        expect(resolveStandardBandsForAlias('e_1')).toEqual(['A1']);
        expect(resolveStandardBandsForAlias('ge_3')).toEqual(['B1']);
    });

    it('reads Bremen and Nordrhein-Westfalen off their own ladders', () => {
        registerCompetenceLevelScales([HB]);
        expect(resolveStandardBandsForAlias('ge_3')).toEqual(['ReStd']);

        resetCompetenceLevelPalette();
        registerCompetenceLevelScales([NRW]);
        expect(resolveStandardBandsForAlias('ge_3')).toEqual(['KS 3']);
        // `k.h.N.` ships no name; its position below "unter Mindeststandard" is what
        // makes it rank 1. `le_1` names the ceiling of that set — `KS 1` — and the
        // share side is what proves `k.h.N.` was counted (see slCompetenceLevels tests).
        expect(resolveStandardBandsForAlias('le_1')).toEqual(['KS 1']);
    });

    it('names a shared band once, so NRW does not read "KS 3 bzw. KS 3"', () => {
        // NRW ships two ladders that agree on the upper rungs. Whether they end up as
        // one registry scale or two, the prose must not repeat the band.
        registerCompetenceLevelScales([
            NRW,
            scaleRow(
                ['k.h.N.', 'KS 1a', 'KS 1b', 'KS 2', 'KS 3', 'KS 4', 'KS 5'],
                [null, 1, 1, 2, 3, 4, 5],
            ),
        ]);

        expect(resolveStandardBandsForAlias('ge_3')).toEqual(['KS 3']);
    });

    it('names the boundary the alias operator points at, not a fixed end of the set', () => {
        // `ge_3` must answer "Regelstandard", never "Optimalstandard" — the prose says
        // "≥", so the floor of the qualifying set is named; the scale is walked by
        // position, so a scale listed top-down would otherwise invert.
        registerCompetenceLevelScales([ROMAN]);

        expect(resolveStandardBandsForAlias('ge_3')).toEqual(['III']);
        expect(resolveStandardBandsForAlias('e_5')).toEqual(['V']);
        // `le_N` prose says "unterhalb …" / "≤", so it names the ceiling: `le_2` is
        // "II", not the bottom rung.
        expect(resolveStandardBandsForAlias('le_2')).toEqual(['II']);
    });

    it('names the top of a split bottom band for e_1, so NRW reads "KS 1b bzw. KS 1"', () => {
        // NRW's Deutsch ladder calls its rank-1 band "KS 1" — literally "unter
        // Mindeststandard" — while Mathematik splits it into KS 1a / KS 1b. A floor rule
        // named `k.h.N.` for one scale and `KS 1a` for the other, and the sentence
        // "unterhalb des Mindeststandards (k.h.N. bzw. KS 1a)" left `KS 1` unnamed although
        // the sibling `shareRange(levelAlias=e_1)` counts it. The ceiling names both bands.
        //
        // ORDER: Mathematik first, because `collectMaximalScales` registers the deepest
        // ladder first and `getStandardBandNames` reports scales in registration order.
        // This read "KS 1 bzw. KS 1b" until the registry became scale-aware — back then
        // Deutsch overwrote Mathematik's `k.h.N.` *in place*, so it inherited position 0
        // and looked like the earlier registration. That order was an artifact of the
        // collision (item 9), not the documented contract.
        registerCompetenceLevelScales([
            NRW,
            scaleRow(
                ['k.h.N.', 'KS 1a', 'KS 1b', 'KS 2', 'KS 3', 'KS 4', 'KS 5'],
                [null, 1, 1, 2, 3, 4, 5],
            ),
        ]);

        expect(resolveStandardBandsForAlias('e_1')).toEqual(['KS 1b', 'KS 1']);
    });

    it('reports nothing for a rank no loaded scale reaches', () => {
        // Niedersachsen's GER ladder stops at B1, so "Optimalstandard" is unanswerable there.
        // Empty, not a guess — the caller drops the sentence rather than naming a band
        // the dataset does not have.
        registerCompetenceLevelScales([NI_GER]);

        expect(resolveStandardBandsForAlias('e_5')).toEqual([]);
    });

    it('tells "not an alias" apart from "an alias nothing matched"', () => {
        // Same contract as `resolveCompetenceLevelRankAlias`: null means the caller wrote
        // something that is not an alias at all, which is an authoring error in
        // info_boxes.json and must not be silently rendered as an empty parenthesis.
        registerCompetenceLevelScales([ROMAN]);

        expect(resolveStandardBandsForAlias('Regelstandard')).toBeNull();
        expect(resolveStandardBandsForAlias('')).toBeNull();
        expect(resolveStandardBandsForAlias(undefined)).toBeNull();
        expect(resolveStandardBandsForAlias('ge_9')).toEqual([]);
    });

    it('reports nothing when the scales name no standard at all', () => {
        // A GER scale as a state export can ship it: name === nameShort, naming no
        // KMK standard. Every level keeps the full [1,5] rank interval, so none of them
        // settles a rank question.
        registerCompetenceLevelScales([
            {
                competenceLevels: ['A1', 'A2', 'B1'].map((nameShort) => ({
                    nameShort,
                    name: nameShort,
                })),
            },
        ]);

        expect(resolveStandardBandsForAlias('ge_3')).toEqual([]);
    });
});
