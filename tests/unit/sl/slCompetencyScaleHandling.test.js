import { describe, it, expect, beforeEach, vi } from 'vitest';

import {
    registerCompetenceLevelScales,
    resetCompetenceLevelPalette,
} from '@tba3/modules/common/services/competenceLevelPalette.js';
import { resolveCompetenceLevelRankAlias } from '@tba3/modules/sl/utils/slCompetenceLevels.js';
import { buildCompetencyLevelRows } from '@tba3/modules/sl/modules/charts/groupComparison/competencyLevelRows.js';
import { sortCompetencyLevels } from '@tba3/modules/common/charts/chartUtils.js';
import {
    buildKsCategoryOrder,
    convertDomainToTimeline,
} from '@tba3/modules/sl/modules/charts/longitudinal/longitudinalDataService.js';
import { scalePayloadRow } from '../support/competenceScaleFixture.js';

/**
 * SL loads one German state's export per dataset, and those states do not share a
 * competence-level vocabulary: `Ia…V`, `A1…C1`, `A1.1…B1.2`, `MiStd--…OptStd` and
 * `k.h.N., KS 1…KS 5` all occur, with band counts from four to seven.
 *
 * Every assertion here pins behaviour that used to be derived from a hardcoded list of
 * level names. The failures that list produced were not blank screens — they were
 * charts that rendered normally and said something false.
 */

const NRW_LEVELS = ['k.h.N.', 'KS 1', 'KS 2', 'KS 3', 'KS 4', 'KS 5'];
/** NRW's Mathematik ladder — the same rungs, but with the first split in two. */
const NRW_MATH_LEVELS = ['k.h.N.', 'KS 1a', 'KS 1b', 'KS 2', 'KS 3', 'KS 4', 'KS 5'];
const HB_LEVELS = ['MiStd--', 'MiStd-', 'MiStd', 'ReStd', 'ReStd+', 'OptStd'];
const NI_GER_LEVELS = ['A1.1', 'A1.2', 'A2.1', 'A2.2', 'B1.1', 'B1.2'];
const ROMAN_LEVELS = ['Ia', 'Ib', 'II', 'III', 'IV', 'V'];
const GER_LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1'];

function scaleRow(levelNames) {
    return { competenceLevels: levelNames.map((nameShort) => ({ nameShort, name: nameShort })) };
}

/** One entry of `domainArray`, trimmed to what the longitudinal converter reads. */
function domainResult(levelNames, counts, { fach = 'Deutsch', domaene = 'le' } = {}) {
    const ksCounts = Object.fromEntries(
        levelNames.map((level, index) => [level, counts[index] ?? 0]),
    );
    return {
        fach,
        domaene,
        stats: {
            nrStudents: counts.reduce((sum, count) => sum + count, 0),
            ksCounts,
            ksOrder: levelNames,
        },
    };
}

/**
 * One `type: 'school'` row of `history.json` — the shape the server answers
 * `?comparison=year` with, and the only source the KS timeline reads.
 */
function historyRow(
    levelNames,
    counts,
    { year = '2026', simulated = false, fach = 'Deutsch', domaene = 'le' } = {},
) {
    const total = counts.reduce((sum, count) => sum + count, 0);
    return {
        id: 'school-1',
        type: 'school',
        name: 'Beispielschule',
        subject: { name: fach },
        domain: { id: domaene },
        properties: [
            { key: 'testPeriod', value: year },
            ...(simulated ? [{ key: 'simulated', value: 'true' }] : []),
        ],
        competenceLevels: levelNames.map((nameShort, index) => ({
            nameShort,
            descriptiveStatistics: {
                total,
                frequency: counts[index] ?? 0,
                mean: total ? (counts[index] ?? 0) / total : 0,
            },
        })),
    };
}

beforeEach(() => {
    resetCompetenceLevelPalette();
});

describe('sortCompetencyLevels', () => {
    it('orders a state scale by the payload, not alphabetically', () => {
        // WHY: alphabetically `k.h.N.` — the lowest level — sorts after `KS 5`. The
        // stacked bar still renders, still totals 100 %, and puts the students who did
        // not reach the scale at the top of the chart.
        registerCompetenceLevelScales([scaleRow(NRW_LEVELS)]);

        expect(sortCompetencyLevels(['KS 3', 'k.h.N.', 'KS 5', 'KS 1'])).toEqual([
            'k.h.N.',
            'KS 1',
            'KS 3',
            'KS 5',
        ]);
    });

    it("keeps Bremen's standard ladder in order rather than sorting OptStd into the middle", () => {
        // Alphabetically: MiStd, MiStd-, MiStd--, OptStd, ReStd, ReStd+ — the highest
        // level lands fourth of six and the two sub-minimum levels straddle the minimum.
        registerCompetenceLevelScales([scaleRow(HB_LEVELS)]);

        expect(sortCompetencyLevels([...HB_LEVELS].sort())).toEqual(HB_LEVELS);
    });

    it('sends levels the scale does not contain to the end, in input order', () => {
        registerCompetenceLevelScales([scaleRow(ROMAN_LEVELS)]);

        expect(sortCompetencyLevels(['V', 'zzz', 'Ia', 'aaa'])).toEqual(['Ia', 'V', 'zzz', 'aaa']);
    });
});

describe('buildCompetencyLevelRows', () => {
    it('builds a row per band of a scale it has never seen before, highest first', () => {
        // WHY: rows used to be produced by mapping every level onto A1…C1. A scale that
        // did not map produced no rows at all, which is why the Vergleich pyramid was
        // empty for every scale other than the GER.
        registerCompetenceLevelScales([scaleRow(NRW_LEVELS)]);

        const rows = buildCompetencyLevelRows([NRW_LEVELS]);

        expect(rows.map((r) => r.sharedLabel)).toEqual([
            'KS 5',
            'KS 4',
            'KS 3',
            'KS 2',
            'KS 1',
            'k.h.N.',
        ]);
    });

    it('aligns two scales of equal depth band by band, whatever they are called', () => {
        registerCompetenceLevelScales([scaleRow(ROMAN_LEVELS), scaleRow(GER_LEVELS)]);

        const rows = buildCompetencyLevelRows([ROMAN_LEVELS, GER_LEVELS]);

        // Ia/Ib share the lowest band, so the roman ladder is five bands deep too.
        expect(rows.map((r) => r.labels)).toEqual([
            ['V', 'C1'],
            ['IV', 'B2'],
            ['III', 'B1'],
            ['II', 'A2'],
            ['Ia/Ib', 'A1'],
        ]);
    });

    it('anchors a shallower scale at the top and leaves its missing rows one-sided', () => {
        // WHY: Niedersachsen measures Deutsch on five bands and Englisch on three —
        // A1.1…B1.2 is six levels but only three GER bands — and the Kategorie "Fach"
        // control compares them directly. Padding the shorter ladder would invent a
        // level; anchoring at the bottom would put Englisch's strongest band opposite
        // Deutsch's weakest.
        const deutsch = ['MiStd-', 'MiStd', 'ReStd', 'ReStd+', 'OptStd'];
        registerCompetenceLevelScales([scaleRow(deutsch), scaleRow(NI_GER_LEVELS)]);

        const rows = buildCompetencyLevelRows([deutsch, NI_GER_LEVELS]);

        expect(rows).toHaveLength(5);
        expect(rows.map((r) => r.labels)).toEqual([
            ['OptStd', 'B1.1/B1.2'],
            ['ReStd+', 'A2.1/A2.2'],
            ['ReStd', 'A1.1/A1.2'],
            ['MiStd', null],
            ['MiStd-', null],
        ]);
        expect(rows[3].sourceLevels[1]).toEqual([]);
    });

    it('keeps two levels of one ladder apart when a second ladder collides by name', () => {
        // WHY: Nordrhein-Westfalen ships both ladders in one export — six bands for
        // Deutsch/Englisch and seven for Mathematik, where `KS 1` is split into `KS 1a` and
        // `KS 1b`. The registry is keyed by level name, so `KS 2…KS 5` belong to whichever
        // registered last and carry *its* band index: `KS 1b` (band 2 of seven) and `KS 2`
        // (band 2 of six) came back identical. Grouping on that index drew them as one
        // pyramid row labelled `KS 1b/KS 2` — two different competence levels, one row, no
        // visual cue.
        registerCompetenceLevelScales([scaleRow(NRW_LEVELS), scaleRow(NRW_MATH_LEVELS)]);

        const rows = buildCompetencyLevelRows([NRW_MATH_LEVELS]);

        expect(rows).toHaveLength(NRW_MATH_LEVELS.length);
        expect(rows.map((row) => row.sharedLabel)).toEqual([...NRW_MATH_LEVELS].reverse());
    });

    it('returns no rows when no level is registered, rather than a scale of empty ones', () => {
        expect(buildCompetencyLevelRows([NRW_LEVELS])).toEqual([]);
    });
});

describe('convertDomainToTimeline', () => {
    it("keeps the scale's own levels as the timeline categories", () => {
        // WHY: the categories were forced onto A1…C1. For every other scale none of the
        // levels mapped, so all five came out zero — and the chart still drew, with a
        // legend naming GER bands the data does not contain.
        registerCompetenceLevelScales([scaleRow(NRW_LEVELS)]);

        const timeline = convertDomainToTimeline(
            [domainResult(NRW_LEVELS, [2, 4, 6, 8, 3, 1])],
            [historyRow(NRW_LEVELS, [2, 4, 6, 8, 3, 1])],
        );

        expect(Object.keys(timeline.at(-1).categories)).toEqual(NRW_LEVELS);
        expect(timeline.at(-1).categories['KS 3']).toBeCloseTo((8 / 24) * 100, 10);
    });

    it('reads the years off the payload and marks the generated ones', () => {
        // WHY: `measured` is what the box plot and the tooltips use to say "aktuell", and
        // it is now nothing but `properties[simulated]`. Deriving it from the year string
        // again — the thing this replaced — would silently relabel a generated year as
        // real on any dataset whose measured year is not the one that was hardcoded.
        registerCompetenceLevelScales([scaleRow(NRW_LEVELS)]);

        const timeline = convertDomainToTimeline(
            [domainResult(NRW_LEVELS, [2, 4, 6, 8, 3, 1])],
            [
                historyRow(NRW_LEVELS, [1, 3, 7, 9, 3, 1], { year: '2025', simulated: true }),
                historyRow(NRW_LEVELS, [2, 4, 6, 8, 3, 1], { year: '2026' }),
            ],
        );

        expect(timeline.map((entry) => entry.year)).toEqual(['2025', '2026']);
        expect(timeline.map((entry) => entry.measured)).toEqual([false, true]);
    });

    it('orders the timeline oldest-first however the payload arrived', () => {
        // WHY: the x-scale takes the years in array order, so a payload that emits the
        // generated block after the measured one — which is exactly what the server does
        // — would otherwise draw 2026 before 2025 and read as a decline.
        registerCompetenceLevelScales([scaleRow(NRW_LEVELS)]);

        const timeline = convertDomainToTimeline(
            [domainResult(NRW_LEVELS, [2, 4, 6, 8, 3, 1])],
            [
                historyRow(NRW_LEVELS, [2, 4, 6, 8, 3, 1], { year: '2026' }),
                historyRow(NRW_LEVELS, [1, 3, 7, 9, 3, 1], { year: '2024', simulated: true }),
                historyRow(NRW_LEVELS, [3, 3, 6, 8, 3, 1], { year: '2025', simulated: true }),
            ],
        );

        expect(timeline.map((entry) => entry.year)).toEqual(['2024', '2025', '2026']);
    });

    it('ignores rows for another Fach or Domäne', () => {
        // WHY: one history document carries every (Fach, Domäne) the school sat. Matching
        // loosely would stack Englisch's bands onto Deutsch's chart, at which point the
        // shares no longer total 100 % and the legend names levels twice.
        registerCompetenceLevelScales([scaleRow(NRW_LEVELS)]);

        const timeline = convertDomainToTimeline(
            [domainResult(NRW_LEVELS, [2, 4, 6, 8, 3, 1])],
            [
                historyRow(NRW_LEVELS, [2, 4, 6, 8, 3, 1]),
                historyRow(NRW_LEVELS, [9, 9, 9, 9, 9, 9], { fach: 'Englisch' }),
                historyRow(NRW_LEVELS, [9, 9, 9, 9, 9, 9], { domaene: 'rs' }),
            ],
        );

        expect(timeline).toHaveLength(1);
        expect(timeline[0].categories['KS 3']).toBeCloseTo((8 / 24) * 100, 10);
    });

    it('returns nothing for an all-zero domain instead of a flat line at 100/N %', () => {
        // WHY: the simulator this replaced floored each bucket at 0.1 and renormalised to
        // 100 %, so N empty buckets came back as N identical lines — 20 % across five GER
        // keys for 2021-2024, dropping to 0 % in the one measured year. It
        // looked exactly like a finding. The read path must drop such a year outright,
        // not divide by a cohort nobody in it placed on the scale.
        registerCompetenceLevelScales([scaleRow(NRW_LEVELS)]);

        const empty = historyRow(NRW_LEVELS, [0, 0, 0, 0, 0, 0]);
        // A cohort exists; nobody placed on the scale.
        empty.competenceLevels.forEach((level) => {
            level.descriptiveStatistics.total = 24;
        });

        expect(
            convertDomainToTimeline([domainResult(NRW_LEVELS, [0, 0, 0, 0, 0, 0])], [empty]),
        ).toEqual([]);
    });

    it('returns nothing when the history document is missing entirely', () => {
        // WHY: a dataset whose acquisition failed to deliver history.json must render the
        // host's empty state. Reaching for `.length` on undefined would take the whole
        // view down instead of one card.
        registerCompetenceLevelScales([scaleRow(NRW_LEVELS)]);

        const domain = [domainResult(NRW_LEVELS, [2, 4, 6, 8, 3, 1])];
        expect(convertDomainToTimeline(domain, [])).toEqual([]);
        expect(convertDomainToTimeline(domain, undefined)).toEqual([]);
    });
});

describe('resolveCompetenceLevelRankAlias', () => {
    it('says so when no loaded scale can express the alias, instead of failing silently', () => {
        // WHY: this is the one path `slCompetenceShares` never sees. When no loaded scale
        // names a standard, `ge_3` resolves to no level names at all and
        // `getCompetenceLevelShare` rejects the query before reading a single row — so
        // the per-row warning cannot fire. The Überblick then comes up empty, which is
        // correct but indistinguishable from a rendering bug. GER Englisch
        // scales name no standard; an export carrying only such scales
        // lands here.
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        registerCompetenceLevelScales([scaleRow(NRW_LEVELS)]);

        expect(resolveCompetenceLevelRankAlias('ge_3')).toEqual([]);
        expect(warn).toHaveBeenCalledWith(expect.stringContaining('ge_3'));

        // Once per alias — it is resolved per metric, per row build, every render.
        resolveCompetenceLevelRankAlias('ge_3');
        expect(warn).toHaveBeenCalledTimes(1);

        warn.mockRestore();
    });

    it('stays quiet for a scale that does name its standards', () => {
        // Deliberately the same alias as the case above: the dedup cache is keyed by
        // palette version, so the `beforeEach` reset re-arms it and this cannot pass by
        // inheriting the previous test's suppression.
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        registerCompetenceLevelScales([
            scalePayloadRow([
                { nameShort: 'MiStd-', name: 'unter Mindeststandard' },
                { nameShort: 'ReStd', name: 'Regelstandard' },
                { nameShort: 'OptStd', name: 'Optimalstandard' },
            ]),
        ]);

        expect(resolveCompetenceLevelRankAlias('ge_3')).toEqual(['ReStd', 'OptStd']);
        expect(warn).not.toHaveBeenCalled();

        warn.mockRestore();
    });

    it('names the missing rank, not the missing field, when the scales do name standards', () => {
        // WHY: the two causes have different remedies. "No scale declares any standard" is
        // the export's fault and points at the missing `standardRank:<id>` properties; "no
        // scale has a level of *this* rank" — `e_5` against a ladder topping out at rank 4,
        // or a threshold like `ge_9` that the alias grammar accepts — means the payload is
        // already correct and sending the reader to inspect it wastes their time.
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        registerCompetenceLevelScales([
            scalePayloadRow([
                { nameShort: 'MiStd-', name: 'unter Mindeststandard' },
                { nameShort: 'ReStd', name: 'Regelstandard' },
                { nameShort: 'ReStd+', name: 'Regelstandard plus' },
            ]),
        ]);

        expect(resolveCompetenceLevelRankAlias('e_5')).toEqual([]);
        expect(warn).toHaveBeenCalledWith(
            expect.stringContaining('has a level of the KMK standard'),
        );
        expect(warn).not.toHaveBeenCalledWith(expect.stringContaining('declares a KMK standard'));

        warn.mockRestore();
    });

    it('warns again for the same alias after the registry is replaced', () => {
        // WHY: the dedup cache used to be keyed by alias alone and outlived
        // `resetCompetenceLevelPalette`, so whichever test touched an alias first disarmed
        // every later assertion about it — and in production a re-registration would go
        // unreported. Keying on `getPaletteVersion()` ties the cache to the registry it
        // describes.
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        registerCompetenceLevelScales([scaleRow(GER_LEVELS)]);

        expect(resolveCompetenceLevelRankAlias('ge_3')).toEqual([]);
        expect(warn).toHaveBeenCalledTimes(1);

        resetCompetenceLevelPalette();
        registerCompetenceLevelScales([scaleRow(GER_LEVELS)]);

        expect(resolveCompetenceLevelRankAlias('ge_3')).toEqual([]);
        expect(warn).toHaveBeenCalledTimes(2);

        warn.mockRestore();
    });
});

describe('buildKsCategoryOrder', () => {
    it('takes the payload order, which Object.keys would re-sort', () => {
        // `ksOrder` exists because integer-like keys ('1a', '2') come back from
        // Object.keys in numeric order regardless of insertion order.
        expect(buildKsCategoryOrder([domainResult(NRW_LEVELS, [1, 1, 1, 1, 1, 1])])).toEqual(
            NRW_LEVELS,
        );
    });

    it('unions the domains of a group without duplicating shared levels', () => {
        const order = buildKsCategoryOrder([
            domainResult(NRW_LEVELS, [1, 1, 1, 1, 1, 1]),
            domainResult(NRW_LEVELS, [2, 2, 2, 2, 2, 2]),
        ]);

        expect(order).toEqual(NRW_LEVELS);
    });
});
