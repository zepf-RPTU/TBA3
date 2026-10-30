import { describe, it, expect, beforeEach, vi } from 'vitest';

import { BOOKLET_PROPERTY } from '../support/competenceLevelGroups.js';
import { createTestContext } from '../support/glossaryFixture.js';
import { sharesOf, slContextFor } from '../support/slInfoBoxFixture.js';
import { competenceValueGroup } from '../support/slValueGroupFactories.js';

/**
 * The school's value group of one Fach, listing `levelNames` with one student each.
 * @param {string[]} levelNames
 * @param {{namesStandards: boolean}} options - Whether the levels carry their KMK bands.
 * @returns {ReturnType<typeof competenceValueGroup>}
 */
const schoolValueGroup = (levelNames, { namesStandards }) =>
    competenceValueGroup({
        id: 'schule',
        type: 'school',
        name: 'Schule',
        subject: 'Deutsch',
        levels: Object.fromEntries(levelNames.map((level) => [level, 1])),
        namesStandards,
    });
import { resolveCompetenceLevelBandAlias } from '../../src/sl/utils/slCompetenceLevels.js';
import { buildCompetenceLevelRows } from '../../src/sl/modules/charts/groupComparison/competenceLevelRows.js';
import { sortCompetenceLevels } from '../../src/common/services/competenceLevelPaint.js';
import {
    GER_LEVELS,
    KS_LEVELS,
    KS_SPLIT_LEVELS,
    ROMAN_LEVELS,
    VERA3_ROMAN_LEVELS,
    ladderValueGroup,
    scaleValueGroup,
} from '../support/competenceScaleFixture.js';

/**
 * SL loads one German state's export per dataset, and those states do not share a
 * competence-level vocabulary: `Ia…V`, `A1…C1`, `A1.1…B1.2`, `MiStd--…OptStd` and
 * `k.h.N., KS 1…KS 5` all occur, with four to seven levels.
 *
 * Every assertion here pins behaviour derived from the payload's scale, never from a
 * hardcoded list of level names. Such a list does not blank the screen — it renders
 * charts that look normal and say something false.
 */

const STD_LEVELS = ['MiStd--', 'MiStd-', 'MiStd', 'ReStd', 'ReStd+', 'OptStd'];
const GER_SPLIT_LEVELS = ['A1.1', 'A1.2', 'A2.1', 'A2.2', 'B1.1', 'B1.2'];

/** @type {import('../../src/common/services/competenceLevelPalette.js').CompetenceLevelPalette} */
let palette;

beforeEach(() => {
    palette = createTestContext('sl').palette;
});

describe('sortCompetenceLevels', () => {
    it('orders a state scale by the payload, not alphabetically', () => {
        // Alphabetically `k.h.N.` — the lowest level — sorts after `KS 5`. The
        // stacked bar still renders, still totals 100 %, and puts the students who did
        // not reach the scale at the top of the chart.
        palette.registerCompetenceLevelScales([ladderValueGroup(KS_LEVELS)]);

        expect(sortCompetenceLevels(palette, ['KS 3', 'k.h.N.', 'KS 5', 'KS 1'])).toEqual([
            'k.h.N.',
            'KS 1',
            'KS 3',
            'KS 5',
        ]);
    });

    it('keeps a standard-named ladder in order rather than sorting OptStd into the middle', () => {
        // Alphabetically: MiStd, MiStd-, MiStd--, OptStd, ReStd, ReStd+ — the highest
        // level lands fourth of six and the two sub-minimum levels straddle the minimum.
        palette.registerCompetenceLevelScales([ladderValueGroup(STD_LEVELS)]);

        expect(sortCompetenceLevels(palette, [...STD_LEVELS].sort())).toEqual(STD_LEVELS);
    });

    it('sends levels the scale does not contain to the end, in input order', () => {
        palette.registerCompetenceLevelScales([ladderValueGroup(ROMAN_LEVELS)]);

        expect(sortCompetenceLevels(palette, ['V', 'zzz', 'Ia', 'aaa'])).toEqual([
            'Ia',
            'V',
            'zzz',
            'aaa',
        ]);
    });
});

describe('buildCompetenceLevelRows', () => {
    it('builds a row per band of a scale it has never seen before, highest first', () => {
        // Mapping every level onto A1…C1 produces no rows at all for a scale that
        // does not map, leaving the Vergleich pyramid empty for every scale other than
        // the GER.
        palette.registerCompetenceLevelScales([ladderValueGroup(KS_LEVELS)]);

        const rows = buildCompetenceLevelRows(palette, [{ order: KS_LEVELS }]);

        expect(rows.map((r) => r.labels[0])).toEqual([
            'KS 5',
            'KS 4',
            'KS 3',
            'KS 2',
            'KS 1',
            'k.h.N.',
        ]);
    });

    it('aligns two scales level by level from the top, whatever they are called', () => {
        palette.registerCompetenceLevelScales([
            ladderValueGroup(ROMAN_LEVELS),
            ladderValueGroup(GER_LEVELS),
        ]);

        const rows = buildCompetenceLevelRows(palette, [
            { order: ROMAN_LEVELS },
            { order: GER_LEVELS },
        ]);

        // Ia and Ib are two levels, so the roman ladder is one level deeper.
        expect(rows.map((r) => r.labels)).toEqual([
            ['V', 'C1'],
            ['IV', 'B2'],
            ['III', 'B1'],
            ['II', 'A2'],
            ['Ib', 'A1'],
            ['Ia', 'Ia'],
        ]);
        expect(rows[5].sourceLevels[1]).toBeNull();
    });

    it('anchors a shallower scale at the top and leaves its missing rows one-sided', () => {
        // An export can measure Deutsch on five levels and Englisch on six (A1.1…B1.2),
        // and the Kategorie "Fach" control compares them directly. Padding the shorter
        // ladder would invent a level; anchoring at the bottom would put Deutsch's
        // strongest level opposite Englisch's second strongest.
        const deutsch = ['MiStd-', 'MiStd', 'ReStd', 'ReStd+', 'OptStd'];
        palette.registerCompetenceLevelScales([
            ladderValueGroup(deutsch),
            ladderValueGroup(GER_SPLIT_LEVELS),
        ]);

        const rows = buildCompetenceLevelRows(palette, [
            { order: deutsch },
            { order: GER_SPLIT_LEVELS },
        ]);

        expect(rows).toHaveLength(6);
        // A row the shallower scale does not reach is named by the other's label and
        // holds none of its levels.
        expect(rows.map((r) => r.labels)).toEqual([
            ['OptStd', 'B1.2'],
            ['ReStd+', 'B1.1'],
            ['ReStd', 'A2.2'],
            ['MiStd', 'A2.1'],
            ['MiStd-', 'A1.2'],
            ['A1.1', 'A1.1'],
        ]);
        expect(rows[5].sourceLevels[0]).toBeNull();
    });

    it('keeps two levels of one ladder apart when a second ladder collides by name', () => {
        // A state export can ship both ladders at once — six bands for
        // Deutsch/Englisch and seven for Mathematik, where `KS 1` is split into `KS 1a` and
        // `KS 1b`. `KS 1b` (band 2 of seven) and `KS 2` (band 2 of six) share a band
        // index; grouping on that index draws them as one pyramid row labelled
        // `KS 1b/KS 2` — two different competence levels, one row, no visual cue.
        palette.registerCompetenceLevelScales([
            ladderValueGroup(KS_LEVELS),
            ladderValueGroup(KS_SPLIT_LEVELS),
        ]);

        const rows = buildCompetenceLevelRows(palette, [{ order: KS_SPLIT_LEVELS }]);

        expect(rows).toHaveLength(KS_SPLIT_LEVELS.length);
        expect(rows.map((row) => row.labels[0])).toEqual([...KS_SPLIT_LEVELS].reverse());
    });

    it('returns no rows when no level is registered, rather than a scale of empty ones', () => {
        expect(buildCompetenceLevelRows(palette, [{ order: KS_LEVELS }])).toEqual([]);
    });
});

describe('resolveCompetenceLevelBandAlias', () => {
    /** @typedef {import('../../src/common/services/competenceScalePayload.js').StandardBand|null} Band */

    /**
     * A ladder with one `standardBand:<id>` tag per level; `null` leaves a level untagged.
     * @param {string[]} levelNames - The ladder, lowest first.
     * @param {Band[]} bands
     * @returns {ReturnType<typeof ladderValueGroup>}
     */
    const banded = (levelNames, bands) => ladderValueGroup(levelNames, [], { bands });

    it('says so when no loaded scale can express the alias, instead of failing silently', async () => {
        // When no loaded scale names a standard (GER Englisch scales name none),
        // `ge_medium` resolves to no level names and `getCompetenceLevelShare` rejects the
        // query before reading a value group, so the untagged-scale warning cannot cover it.
        // The Überblick then comes up empty, indistinguishable from a rendering bug.
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const shares = sharesOf(
            await slContextFor({
                competenceLevels: [schoolValueGroup(KS_LEVELS, { namesStandards: false })],
            }),
        );
        warn.mockClear();

        expect(shares.getAliasLevels('ge_medium')).toEqual([]);
        expect(warn).toHaveBeenCalledWith(expect.stringContaining('ge_medium'));
        expect(warn).toHaveBeenCalledWith(expect.stringContaining('"medium" band'));

        // Once per alias — it is resolved per metric, per row build, every render.
        shares.getAliasLevels('ge_medium');
        expect(warn).toHaveBeenCalledTimes(1);

        warn.mockRestore();
    });

    it('stays quiet for a scale that does name its standards', () => {
        // Same alias as the case above: the dedup cache is keyed by palette, so the fresh
        // `beforeEach` palette re-arms it and this cannot pass on inherited suppression.
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        palette.registerCompetenceLevelScales([
            scaleValueGroup([
                { nameShort: 'MiStd-', name: 'unter Mindeststandard' },
                { nameShort: 'ReStd', name: 'Regelstandard' },
                { nameShort: 'OptStd', name: 'Optimalstandard' },
            ]),
        ]);

        expect(resolveCompetenceLevelBandAlias(palette, 'ge_medium')).toEqual(['ReStd', 'OptStd']);
        expect(warn).not.toHaveBeenCalled();

        warn.mockRestore();
    });

    it('resolves a missing high band to nothing and warns once', async () => {
        // A ladder that tops out at Regelstandard plus has no Optimalstandard to count.
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const shares = sharesOf(
            await slContextFor({
                competenceLevels: [
                    {
                        ...schoolValueGroup(['MiStd-', 'MiStd', 'ReStd', 'ReStd+'], {
                            namesStandards: false,
                        }),
                        properties: [
                            BOOKLET_PROPERTY,
                            { key: 'standardBand:1', value: 'low' },
                            { key: 'standardBand:3', value: 'medium' },
                        ],
                    },
                ],
            }),
        );

        expect(shares.getAliasLevels('e_high')).toEqual([]);
        expect(shares.getAliasLevels('e_high')).toEqual([]);
        expect(warn).toHaveBeenCalledTimes(1);
        expect(warn).toHaveBeenCalledWith(expect.stringContaining('"high" band'));

        warn.mockRestore();
    });

    it('counts k.h.N. into le_low by position, although it carries no tag', () => {
        palette.registerCompetenceLevelScales([
            banded(KS_LEVELS, [null, 'low', null, 'medium', null, 'high']),
        ]);

        expect(resolveCompetenceLevelBandAlias(palette, 'le_low')).toEqual(['k.h.N.', 'KS 1']);
        // `e_low` is the tagged levels only.
        expect(resolveCompetenceLevelBandAlias(palette, 'e_low')).toEqual(['KS 1']);
    });

    it('places untagged levels by position: ReStd+ above the medium floor, MiStd below its ceiling', () => {
        palette.registerCompetenceLevelScales([
            banded(
                ['MiStd--', 'MiStd-', 'MiStd', 'ReStd', 'ReStd+', 'OptStd'],
                ['low', 'low', null, 'medium', null, 'high'],
            ),
        ]);

        expect(resolveCompetenceLevelBandAlias(palette, 'ge_medium')).toEqual([
            'ReStd',
            'ReStd+',
            'OptStd',
        ]);
        expect(resolveCompetenceLevelBandAlias(palette, 'le_medium')).toEqual([
            'MiStd--',
            'MiStd-',
            'MiStd',
            'ReStd',
        ]);
    });

    it('takes a medium band of several levels whole', () => {
        // B1.1 and B1.2 are both Regelstandard: `ge_medium` starts at B1.1, `e_medium`
        // is both.
        palette.registerCompetenceLevelScales([
            banded(
                ['A1.1', 'A1.2', 'A2.1', 'A2.2', 'B1.1', 'B1.2'],
                ['low', 'low', null, null, 'medium', 'medium'],
            ),
        ]);

        expect(resolveCompetenceLevelBandAlias(palette, 'ge_medium')).toEqual(['B1.1', 'B1.2']);
        expect(resolveCompetenceLevelBandAlias(palette, 'e_medium')).toEqual(['B1.1', 'B1.2']);
    });

    it.each([
        ['VERA 3 (I…V)', VERA3_ROMAN_LEVELS, ['low', null, 'medium', null, 'high'], ['I']],
        ['VERA 8 (Ia…V)', ROMAN_LEVELS, ['low', 'low', null, 'medium', null, 'high'], ['Ia', 'Ib']],
    ])('resolves the same aliases on a %s ladder', (_label, levels, bands, lowLevels) => {
        palette.registerCompetenceLevelScales([banded(levels, /** @type {Band[]} */ (bands))]);

        expect(resolveCompetenceLevelBandAlias(palette, 'ge_medium')).toEqual(['III', 'IV', 'V']);
        expect(resolveCompetenceLevelBandAlias(palette, 'le_low')).toEqual(lowLevels);
        expect(resolveCompetenceLevelBandAlias(palette, 'e_high')).toEqual(['V']);
        expect(resolveCompetenceLevelBandAlias(palette, 'le_medium')).toEqual([
            ...lowLevels,
            'II',
            'III',
        ]);
    });

    it('returns null, silently, for a string that is no alias', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        palette.registerCompetenceLevelScales([ladderValueGroup(ROMAN_LEVELS)]);

        expect(resolveCompetenceLevelBandAlias(palette, 'Regelstandard')).toBeNull();
        expect(resolveCompetenceLevelBandAlias(palette, '')).toBeNull();
        expect(warn).not.toHaveBeenCalled();

        warn.mockRestore();
    });
});
