import { describe, it, expect, beforeEach } from 'vitest';

import { createTestContext } from '../../support/glossaryFixture.js';
import { formatStandardBands } from '../../../src/sl/utils/slCompetenceLevels.js';
import {
    GER_LEVELS,
    KS_LEVELS,
    KS_SPLIT_LEVELS,
    ladderValueGroup,
    ROMAN_LEVELS,
    VERA3_ROMAN_LEVELS,
    scaleValueGroup,
} from '../../support/competenceScaleFixture.js';

/**
 * Naming the competence band a standard starts at — the parenthetical in
 * "den Regelstandard oder höher (≥ III bzw. B1)".
 *
 * Typed into `info-boxes.json`, that text would pin the whole file to the demo fixture's
 * two scales: it is true for `sl`, half-true for a `MiStd--…OptStd` ladder, and says
 * nothing at all on a `KS 1…KS 5` ladder. The file carries no numbers — only
 * prose and placeholders — so resolving the bands from the payload is what lets one shared
 * file serve every dataset.
 *
 * This answers *where a band begins or ends*, one entry per scale, whereas
 * `resolveCompetenceLevelBandAlias` answers *which levels count* and returns every one of
 * them. A share needs the second; prose needs the first.
 */

/** @typedef {import('../../../src/common/services/competenceScalePayload.js').StandardBand|null} Band */

/**
 * A scale value group whose levels carry `standardBand:<id>` tags, as the server ships them.
 * @param {string[]} levelNames - The ladder, lowest first.
 * @param {Band[]} bands - The standard band per level; `null` leaves it untagged.
 * @returns {import('../../../src/common/data/schemas/competenceLevels.js').CompetenceLevelsValueGroup}
 */
const bandedScaleValueGroup = (levelNames, bands) => ladderValueGroup(levelNames, [], { bands });

// The shipped scale shapes, named for the state ladder each models.
const ROMAN = bandedScaleValueGroup(ROMAN_LEVELS, ['low', 'low', null, 'medium', null, 'high']);
const VERA3 = bandedScaleValueGroup(VERA3_ROMAN_LEVELS, ['low', null, 'medium', null, 'high']);
const GER = bandedScaleValueGroup(GER_LEVELS, ['low', null, 'medium', null, 'high']);
const GER_SPLIT = bandedScaleValueGroup(
    ['A1.1', 'A1.2', 'A2.1', 'A2.2', 'B1.1', 'B1.2'],
    ['low', 'low', null, null, 'medium', 'medium'],
);
const STD = bandedScaleValueGroup(
    ['MiStd--', 'MiStd-', 'MiStd', 'ReStd', 'ReStd+', 'OptStd'],
    ['low', 'low', null, 'medium', null, 'high'],
);
const KS = bandedScaleValueGroup(KS_LEVELS, [null, 'low', null, 'medium', null, 'high']);
const KS_SPLIT = bandedScaleValueGroup(KS_SPLIT_LEVELS, [
    null,
    'low',
    'low',
    null,
    'medium',
    null,
    'high',
]);

describe('formatStandardBands', () => {
    /** @type {import('../../../src/common/services/competenceLevelPalette.js').CompetenceLevelPalette} */
    let palette;

    beforeEach(() => {
        palette = createTestContext('sl').palette;
    });

    it('names the band each scale reaches the standard at, not every qualifying level', () => {
        // `sl`: the demo fixture's two scales, where the placeholder must produce exactly
        // "III bzw. B1".
        palette.registerCompetenceLevelScales([ROMAN, GER]);

        expect(formatStandardBands(palette, 'ge_medium')).toBe('III bzw. B1');
    });

    it('names an exact set of two levels as their range, so neither is left out', () => {
        // `Ia` and `Ib` are both tagged low: "Ib" alone would drop Ia from the set.
        palette.registerCompetenceLevelScales([ROMAN, GER]);

        expect(formatStandardBands(palette, 'e_low')).toBe('Ia–Ib bzw. A1');
    });

    it('names GER sub-levels as levels, the floor, the ceiling or the range', () => {
        // Regelstandard spans B1.1 and B1.2: `ge_medium` names its floor B1.1 and
        // `e_medium` the whole set.
        palette.registerCompetenceLevelScales([GER_SPLIT]);

        expect(formatStandardBands(palette, 'e_low')).toBe('A1.1–A1.2');
        expect(formatStandardBands(palette, 'ge_medium')).toBe('B1.1');
        expect(formatStandardBands(palette, 'e_medium')).toBe('B1.1–B1.2');
    });

    it('reads each ladder off its own rungs', () => {
        palette.registerCompetenceLevelScales([STD]);
        expect(formatStandardBands(palette, 'ge_medium')).toBe('ReStd');

        palette = createTestContext('sl').palette;
        palette.registerCompetenceLevelScales([KS]);
        expect(formatStandardBands(palette, 'ge_medium')).toBe('KS 3');
        // `k.h.N.` ships no tag; its position below the low band is what puts it inside
        // `le_low`. `le_low` names the ceiling of that set — `KS 1` — and the share side
        // is what proves `k.h.N.` was counted (see slCompetenceScaleHandling.test.js).
        expect(formatStandardBands(palette, 'le_low')).toBe('KS 1');
    });

    it('names a shared band once, so the prose does not read "KS 3 bzw. KS 3"', () => {
        // The export ships two ladders that agree on the upper rungs. Whether they end up as
        // one registry scale or two, the prose must not repeat the band.
        palette.registerCompetenceLevelScales([KS, KS_SPLIT]);

        expect(formatStandardBands(palette, 'ge_medium')).toBe('KS 3');
    });

    it('names the boundary the alias operator points at, not a fixed end of the set', () => {
        // `ge_medium` must answer "Regelstandard", never "Optimalstandard" — the prose says
        // "≥", so the floor of the qualifying set is named; the scale is walked by
        // position, so a scale listed top-down would otherwise invert.
        palette.registerCompetenceLevelScales([ROMAN]);

        expect(formatStandardBands(palette, 'ge_medium')).toBe('III');
        expect(formatStandardBands(palette, 'e_high')).toBe('V');
        // `le_X` prose says "unterhalb …" / "≤", so it names the ceiling: `le_medium` is
        // "III", not the bottom rung.
        expect(formatStandardBands(palette, 'le_medium')).toBe('III');
        expect(formatStandardBands(palette, 'le_low')).toBe('Ib');
    });

    it.each([
        ['VERA 3 (I…V)', VERA3, 'I', 'I'],
        ['VERA 8 (Ia…V)', ROMAN, 'Ia–Ib', 'Ib'],
    ])('reads a %s ladder off its own levels', (_label, ladder, eLow, leLow) => {
        palette.registerCompetenceLevelScales([ladder]);

        expect(formatStandardBands(palette, 'ge_medium')).toBe('III');
        expect(formatStandardBands(palette, 'le_medium')).toBe('III');
        expect(formatStandardBands(palette, 'e_high')).toBe('V');
        expect(formatStandardBands(palette, 'e_low')).toBe(eLow);
        expect(formatStandardBands(palette, 'le_low')).toBe(leLow);
    });

    it('names the top of a split bottom band for le_low, so the prose reads "KS 1b bzw. KS 1"', () => {
        // The unsplit ladder calls its low band "KS 1" — literally "unter
        // Mindeststandard" — while the other splits it into KS 1a / KS 1b. A floor rule
        // would name `k.h.N.` for one scale and `KS 1a` for the other, and the sentence
        // "unterhalb des Mindeststandards (k.h.N. bzw. KS 1a)" would leave `KS 1` unnamed
        // although the sibling `shareRange(levelAlias=le_low)` counts it. The ceiling names
        // both bands.
        //
        // ORDER: Mathematik first, because `collectMaximalScales` registers the deepest
        // ladder first and `getStandardBandSelection` reports scales in registration order.
        palette.registerCompetenceLevelScales([KS, KS_SPLIT]);

        expect(formatStandardBands(palette, 'le_low')).toBe('KS 1b bzw. KS 1');
    });

    it('reports nothing for a band no loaded scale tags', () => {
        // This GER ladder stops at B1, so "Optimalstandard" is unanswerable there.
        // Empty, not a guess — the caller drops the sentence rather than naming a band
        // the dataset does not have.
        palette.registerCompetenceLevelScales([GER_SPLIT]);

        expect(formatStandardBands(palette, 'e_high')).toBe('');
        expect(formatStandardBands(palette, 'ge_high')).toBe('');
    });

    it('leaves out a scale without the band and still names the others', () => {
        palette.registerCompetenceLevelScales([ROMAN, GER_SPLIT]);

        expect(formatStandardBands(palette, 'e_high')).toBe('V');
    });

    it('tells "not an alias" apart from "an alias nothing matched"', () => {
        // Same contract as `resolveCompetenceLevelBandAlias`: null means the caller wrote
        // something that is not an alias at all, which is an authoring error in
        // info-boxes.json and must not be silently rendered as an empty parenthesis.
        palette.registerCompetenceLevelScales([ROMAN]);

        expect(formatStandardBands(palette, 'Regelstandard')).toBeNull();
        expect(formatStandardBands(palette, '')).toBeNull();
        // A template that left the argument out.
        expect(formatStandardBands(palette, undefined)).toBeNull();
    });

    it('reports nothing when the scales name no standard at all', () => {
        // A GER scale as a state export can ship it: name === nameShort and no
        // `standardBand:` tag, so no level settles a band question.
        palette.registerCompetenceLevelScales([
            scaleValueGroup(
                ['A1', 'A2', 'B1'].map((nameShort) => ({ nameShort, name: nameShort })),
            ),
        ]);

        expect(formatStandardBands(palette, 'ge_medium')).toBe('');
    });
});
