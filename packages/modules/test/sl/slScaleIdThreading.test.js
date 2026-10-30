// @vitest-browser
// (stackedBarUtils.js -> themeService.js reads getComputedStyle at import time; the legend
//  section writes into a panel element)

import { describe, it, expect, beforeEach, vi } from 'vitest';

import { createTestContext } from '../support/glossaryFixture.js';
import {
    getCompetenceAppearance,
    getCompetenceColor,
} from '../../src/common/services/themeService.js';
import { buildStackedSegments } from '../../src/common/utils/stackedBarUtils.js';
import { processSegments } from '../../src/common/tables/stackedBarCell.js';
import { parseCompetenceLevels } from '../../src/common/domain/competenceLevelAdapter.js';
import { SL_DATASETS } from '../../src/sl/index.js';
import { getScaleIdForDomain } from '../../src/sl/utils/slLevelDefinitions.js';
import { buildCompetenceLevelRows } from '../../src/sl/modules/charts/groupComparison/competenceLevelRows.js';
import {
    extractLevelOrder,
    buildSubjectDomainList,
    domainStudentRecords,
    prepareCompetenceGroupData,
} from '../../src/sl/modules/charts/groupComparison/groupComparisonCompetenceData.js';
import { prepareCompetenceLevelNames } from '../../src/sl/modules/charts/competence/shared/competenceChartData.js';
import { buildCompetenceLevelKeyBlock } from '../../src/sl/modules/charts/competence/shared/competenceLegend.js';
import { competenceValueGroup, studentValueGroup } from '../support/slValueGroupFactories.js';
import { slContextFor } from '../support/slInfoBoxFixture.js';
import { required } from '../support/required.js';
import { KS_LEVELS, KS_SPLIT_LEVELS, scaleValueGroup } from '../support/competenceScaleFixture.js';
import { createSubjectContext } from '../support/subjectContext.js';
import { competenceLevelShare } from '../../src/sl/utils/slCompetenceShares.js';

/**
 * A value group listing `names` as its levels, as `scaleIdOf` reads one.
 * @param {string[]} names
 * @returns {{competenceLevels: Array<{nameShort: string}>}}
 */
const levelRun = (names) => ({ competenceLevels: names.map((nameShort) => ({ nameShort })) });

/** @typedef {import('../support/competenceLevelGroups.js').StudentLevelsValueGroup} StudentLevelsValueGroup */

/**
 * WHY, for every assertion here: a state export can ship two ladders at once —
 * Deutsch/Englisch on `k.h.N., KS 1 … KS 5` and Mathematik on `k.h.N., KS 1a, KS 1b,
 * KS 2 … KS 5` — so five level names mean two different things on one page. A caller
 * that does not say which ladder it means resolves a bare `KS 3` to whichever ladder
 * registered it last: the wrong ramp for one Fach, ordinal ties in the Vergleich, and a
 * legend enumerating the other ladder. These pin that every SL path names its ladder.
 * The scale id is the palette's own (the level sequence joined by `|`).
 */

const DEUTSCH = KS_LEVELS;
const MATHE = KS_SPLIT_LEVELS;
const DEUTSCH_ID = DEUTSCH.join('|');
const MATHE_ID = MATHE.join('|');

/**
 * @param {string[]} levelNames - The ladder's levels, lowest first.
 * @param {number[]} counts - Headcount per level; a missing one is 0.
 * @returns {{[nameShort: string]: number}} nameShort → frequency, for `competenceValueGroup`.
 */
function levelCounts(levelNames, counts) {
    return Object.fromEntries(levelNames.map((level, index) => [level, counts[index] ?? 0]));
}

/** The two-ladder school: a school and an 8a value group per Fach, each listing every level. */
function nrwValueGroups() {
    return [
        competenceValueGroup({
            id: 'schule',
            type: 'school',
            name: 'Schule',
            subject: 'Deutsch',
            domainId: 'le',
            levels: levelCounts(DEUTSCH, [1, 1, 1, 1, 1, 1]),
            namesStandards: false,
        }),
        competenceValueGroup({
            id: '8a-de',
            type: 'group',
            name: '8a',
            subject: 'Deutsch',
            domainId: 'le',
            levels: levelCounts(DEUTSCH, [1, 2, 3, 4, 5, 6]),
            namesStandards: false,
        }),
        competenceValueGroup({
            id: 'schule',
            type: 'school',
            name: 'Schule',
            subject: 'Mathematik',
            levels: levelCounts(MATHE, [1, 1, 1, 1, 1, 1, 1]),
            namesStandards: false,
        }),
        competenceValueGroup({
            id: '8a-ma',
            type: 'group',
            name: '8a',
            subject: 'Mathematik',
            levels: levelCounts(MATHE, [1, 2, 3, 4, 5, 6, 7]),
            namesStandards: false,
        }),
    ];
}

/**
 * A student of group 8a at one level.
 * @param {string} id - The student id, also its name.
 * @param {string} subject
 * @param {string} level - The level reached.
 * @param {string} [domainId]
 * @returns {StudentLevelsValueGroup}
 */
function student8a(id, subject, level, domainId) {
    return studentValueGroup({
        id,
        subject,
        groupName: '8a',
        gender: 'female',
        level,
        ...(domainId && { domain: { id: domainId, name: domainId } }),
    });
}

/**
 * A store holding the value groups, their scales registered on the palette: the case's context
 * becomes the one that owns the store, so `palette` is the store's.
 * @param {import('../support/competenceLevelGroups.js').CurrentLevelsValueGroup[]} competenceLevels - `competence-levels.json`.
 * @param {StudentLevelsValueGroup[]} students - `students-competence-levels.json`.
 * @returns {Promise<import('../../src/common/data/index.js').DocumentStore>}
 */
async function storeFor(competenceLevels, students) {
    const context = await createSubjectContext('sl', {
        documents: {
            'competence-levels.json': competenceLevels,
            'students-competence-levels.json': students,
        },
    });
    palette = context.palette;
    return context.documents;
}

/** @type {import('../../src/common/services/competenceLevelPalette.js').CompetenceLevelPalette} */
let palette;

beforeEach(() => {
    palette = createTestContext('sl').palette;
});

describe('scaleIdOf — the id a value group hands to the scoped lookups', () => {
    // The registry keys a scale by its level sequence, and a value group lists only the
    // levels its population reached. `scaleIdOf` turns such a value group into the `scaleId`
    // the scoped lookups accept, so no SL caller has to resolve by bare name.
    it('returns the registered id for a full ladder and the container for a truncated run', () => {
        palette.registerCompetenceLevelScales(nrwValueGroups().slice(0, 2));

        expect(palette.scaleIdOf(levelRun(DEUTSCH))).toBe(DEUTSCH_ID);
        // Bottom-truncated value groups: the domain reached `KS 1 … KS 5` but not `k.h.N.`.
        expect(palette.scaleIdOf(levelRun(DEUTSCH.slice(1)))).toBe(DEUTSCH_ID);
    });

    it('refuses to guess when a run sits inside two ladders, and says so once', () => {
        // `KS 2 … KS 5` is a run of both ladders. Picking either silently
        // paints a Deutsch row with the Mathematik ramp; the caller has the Fach and can
        // decide, so this returns nothing and the console names the ambiguity.
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        palette.registerCompetenceLevelScales(nrwValueGroups());

        expect(palette.scaleIdOf(levelRun(DEUTSCH.slice(2)))).toBeUndefined();
        expect(palette.scaleIdOf(levelRun(DEUTSCH.slice(2)))).toBeUndefined();
        expect(warn).toHaveBeenCalledTimes(1);
        expect(palette.scaleIdOf(levelRun(MATHE.slice(1, 4)))).toBe(MATHE_ID);
        expect(palette.scaleIdOf(levelRun(['zzz']))).toBeUndefined();
        expect(palette.scaleIdOf(levelRun([]))).toBeUndefined();
    });
});

describe("the data services name every value group's ladder", () => {
    it("stamps stats.scaleId and each student's competenceScaleId in buildDomainResultsFromJson", async () => {
        const store = await storeFor(nrwValueGroups(), [
            student8a('s1', 'Deutsch', 'KS 3', 'le'),
            student8a('s2', 'Mathematik', 'KS 3'),
        ]);

        const results = store.getDataset(SL_DATASETS.DOMAIN_RESULTS);
        const deutsch = required(results.find((result) => result.subjectName === 'Deutsch'));
        const mathe = required(results.find((result) => result.subjectName === 'Mathematik'));

        expect(deutsch.stats.scaleId).toBe(DEUTSCH_ID);
        expect(mathe.stats.scaleId).toBe(MATHE_ID);
        expect(deutsch.studentResults[0].competenceScaleId).toBe(DEUTSCH_ID);
        expect(mathe.studentResults[0].competenceScaleId).toBe(MATHE_ID);
    });

    it("settles a truncated value group through the Fach/Domäne's fullest value group", async () => {
        // A Deutsch group that reached only `KS 2 … KS 5` is a run of both ladders,
        // which the palette alone cannot decide. The level definition for Deutsch/le is
        // read off the fullest value group, so the group still resolves to the Deutsch ladder.
        const valueGroups = nrwValueGroups();
        valueGroups.push(
            competenceValueGroup({
                id: '8b-de',
                type: 'group',
                name: '8b',
                subject: 'Deutsch',
                domainId: 'le',
                levels: levelCounts(DEUTSCH.slice(2), [1, 1, 1, 1]),
                namesStandards: false,
            }),
        );
        const store = await storeFor(valueGroups, []);

        expect(
            getScaleIdForDomain(store.getDataset(SL_DATASETS.LEVEL_DEFINITIONS), 'Deutsch', 'le'),
        ).toBe(DEUTSCH_ID);
        const truncated = required(
            store
                .getDataset(SL_DATASETS.DOMAIN_RESULTS)
                .find((result) => result.groupName === '8b'),
        );
        expect(truncated.stats.scaleId).toBe(DEUTSCH_ID);
    });

    it('parseCompetenceLevels reads the vocabulary off the fullest value group and names its scale', () => {
        palette.registerCompetenceLevelScales(nrwValueGroups());
        const full = competenceValueGroup({
            id: 'a',
            type: 'group',
            name: '8a',
            subject: 'Deutsch',
            domainId: 'le',
            levels: levelCounts(DEUTSCH, [1, 1, 1, 1, 1, 1]),
        });
        const truncated = competenceValueGroup({
            id: 'b',
            type: 'group',
            name: '8b',
            subject: 'Deutsch',
            domainId: 'le',
            levels: levelCounts(DEUTSCH.slice(2), [1, 1, 1, 1]),
        });

        const parsed = parseCompetenceLevels(palette, [truncated, full]);

        expect(parsed.levels).toEqual(DEUTSCH);
        expect(parsed.scaleId).toBe(DEUTSCH_ID);
    });
});

describe("the paint path resolves a level on the row's ladder", () => {
    it("gives KS 3 two colours, one per ladder, and the stacked segment takes its row's", () => {
        palette.registerCompetenceLevelScales(nrwValueGroups());
        const deutschColor = getCompetenceColor(palette, 'KS 3', DEUTSCH_ID);
        const matheColor = getCompetenceColor(palette, 'KS 3', MATHE_ID);
        expect(deutschColor).not.toBe(matheColor);

        /**
         * @param {Parameters<typeof buildStackedSegments>[1]} entry - A chart row.
         * @returns {string|undefined} The colour of its `KS 3` segment.
         */
        const colorOf = (entry) => buildStackedSegments(palette, entry, ['KS 3'])[0].color;
        expect(colorOf({ 'KS 3': 50, scaleId: DEUTSCH_ID })).toBe(deutschColor);
        expect(colorOf({ 'KS 3': 50, scaleId: MATHE_ID })).toBe(matheColor);
        // A row without a ladder resolves the bare name.
        expect(buildStackedSegments(palette, { 'KS 3': 50 }, ['KS 3'])[0].appearance).toEqual(
            getCompetenceAppearance(palette, 'KS 3'),
        );
    });

    it('lets a table row name its ladder for processSegments', () => {
        palette.registerCompetenceLevelScales(nrwValueGroups());
        const config = { fields: ['competenceLevel_KS 3'] };

        const deutsch = processSegments(
            palette,
            { 'competenceLevel_KS 3': 5, scaleId: DEUTSCH_ID },
            config,
        )[0];
        const mathe = processSegments(
            palette,
            { 'competenceLevel_KS 3': 5, scaleId: MATHE_ID },
            config,
        )[0];

        const deutschColor = required(deutsch.appearance).baseColor;
        const matheColor = required(mathe.appearance).baseColor;

        expect(deutschColor).toBe(getCompetenceColor(palette, 'KS 3', DEUTSCH_ID));
        expect(matheColor).toBe(getCompetenceColor(palette, 'KS 3', MATHE_ID));
        expect(deutschColor).not.toBe(matheColor);
    });

    it('places the Überblick union on the ladder of the first row carrying each name', () => {
        palette.registerCompetenceLevelScales(nrwValueGroups());
        const chartData = [
            { competenceLevelNames: DEUTSCH, scaleId: DEUTSCH_ID },
            { competenceLevelNames: MATHE, scaleId: MATHE_ID },
        ];

        const { competenceLevelNames, scaleIdForLevel } = prepareCompetenceLevelNames(
            palette,
            chartData,
        );

        expect(competenceLevelNames).toEqual(
            expect.arrayContaining([...DEUTSCH, 'KS 1a', 'KS 1b']),
        );
        expect(scaleIdForLevel('KS 3')).toBe(DEUTSCH_ID);
        expect(scaleIdForLevel('KS 1a')).toBe(MATHE_ID);
    });
});

describe("the Vergleich keys its rows on the group's ladder", () => {
    it('carries the ladder from the domain results into the level order and the segments', async () => {
        const store = await storeFor(nrwValueGroups(), [
            student8a('s1', 'Mathematik', 'KS 1b'),
            student8a('s2', 'Mathematik', 'KS 3'),
        ]);
        const mathe = buildSubjectDomainList(store.getDataset(SL_DATASETS.DOMAIN_RESULTS)).find(
            (entry) => entry.subjectName === 'Mathematik',
        );

        const levelOrder = required(extractLevelOrder(mathe));
        expect(levelOrder).toEqual({ order: MATHE, scaleId: MATHE_ID });

        const students = domainStudentRecords(mathe);
        expect(students.every((student) => student.competenceScaleId === MATHE_ID)).toBe(true);

        const prepared = prepareCompetenceGroupData(
            palette,
            students,
            'gender',
            'female',
            'male',
            buildCompetenceLevelRows(palette, [levelOrder]),
        );
        const segments = prepared.groups[0].rows.flatMap((row) => row.segments);
        expect(segments.length).toBeGreaterThan(0);
        expect(segments.every((segment) => segment.paint.scaleId === MATHE_ID)).toBe(true);
    });

    it('draws seven Mathematik rows with no ordinal tie once the ladder is named', () => {
        // `KS 1b` (3rd of 7) and `KS 2` (3rd of 6) tie on ordinal when resolved by
        // name; with the ladder named every row sorts on its own scale.
        palette.registerCompetenceLevelScales(nrwValueGroups());

        const rows = buildCompetenceLevelRows(palette, [{ order: MATHE, scaleId: MATHE_ID }]);

        expect(rows.map((row) => row.labels[0])).toEqual([...MATHE].reverse());
        const ordinals = MATHE.map((level) => palette.getCompetenceLevelOrdinal(level, MATHE_ID));
        expect(new Set(ordinals).size).toBe(MATHE.length);
    });

    it('aligns a group that omits a level of its ladder on the full ladder', () => {
        // Aligned by position in the *packed* list, a group nobody placed at `KS 1b`
        // would shift every row below the gap by one — two different levels drawn on one
        // row. The ladder is the scale's, not the row's.
        palette.registerCompetenceLevelScales(nrwValueGroups());
        const omitting = MATHE.filter((level) => level !== 'KS 1b');

        const rows = buildCompetenceLevelRows(palette, [
            { order: omitting, scaleId: MATHE_ID },
            { order: MATHE, scaleId: MATHE_ID },
        ]);

        expect(rows).toHaveLength(MATHE.length);
        expect(rows.every((row) => row.labels[0] === row.labels[1])).toBe(true);
        // Without a ladder the packed list is all there is.
        expect(buildCompetenceLevelRows(palette, [{ order: omitting }])).toHaveLength(
            omitting.length,
        );
    });
});

describe('the legend enumerates the ladder of the row it describes', () => {
    it('paints each swatch from the ladder scaleIdForLevel names, not the last-registered one', () => {
        // The swatch colour is the only thing on the legend that depends on the
        // ladder, and `KS 3` has one colour per ladder. Resolved by name every swatch would
        // take whichever ladder registered last, so half the page would disagree with its
        // legend.
        palette.registerCompetenceLevelScales(nrwValueGroups());
        /**
         * @param {string} level
         * @returns {string} The ladder it is read on.
         */
        const scaleIdForLevel = (level) => (level === 'KS 3' ? MATHE_ID : DEUTSCH_ID);

        const { items } = buildCompetenceLevelKeyBlock(palette, ['KS 1', 'KS 3'], {
            scaleIdForLevel,
        });

        /**
         * @param {string} level
         * @returns {string|undefined} Its swatch's colour.
         */
        const swatchColor = (level) =>
            required(
                required(required(items.find((item) => item.label === level)).swatch).appearance,
            ).baseColor;
        expect(items.map((item) => item.key)).toEqual(['ks-1', 'ks-3']);
        expect(swatchColor('KS 3')).toBe(getCompetenceColor(palette, 'KS 3', MATHE_ID));
        expect(swatchColor('KS 3')).not.toBe(getCompetenceColor(palette, 'KS 3', DEUTSCH_ID));
        expect(swatchColor('KS 1')).toBe(getCompetenceColor(palette, 'KS 1', DEUTSCH_ID));
    });
});

describe('a legend over two ladders keeps each ladder together', () => {
    it('lists one ladder after the other, each in its own order', () => {
        // Positions on two ladders do not compare. Sorted by position alone, the Roman
        // and GER levels interleave (Ia, A1, Ib, …), and the two-column grid then pairs a
        // Roman level with a GER one in every row.
        palette.registerCompetenceLevelScales([
            scaleValueGroup(['Ia', 'Ib', 'II', 'III'].map((nameShort) => ({ nameShort }))),
            scaleValueGroup(['A1', 'A2', 'B1'].map((nameShort) => ({ nameShort }))),
        ]);

        const { items } = buildCompetenceLevelKeyBlock(palette, [
            'Ia',
            'A1',
            'Ib',
            'A2',
            'II',
            'B1',
            'III',
        ]);

        expect(items.map((item) => item.label)).toEqual([
            'Ia',
            'Ib',
            'II',
            'III',
            'A1',
            'A2',
            'B1',
        ]);
    });
});

describe('the info-box counts read coverage off the scale, not the value group', () => {
    it('reports a level nobody reached as covered with a count of zero', async () => {
        // Decided by the levels *this value group* lists, `covered` would make a value group omitting
        // `OptStd` because nobody reached it report the question as unknown and vanish
        // from the view it belongs in. A genuine zero is a zero.
        const STD = ['MiStd--', 'MiStd-', 'MiStd', 'ReStd', 'ReStd+', 'OptStd'];
        const full = competenceValueGroup({
            id: 'schule',
            type: 'school',
            name: 'Schule',
            subject: 'Deutsch',
            domainId: 'le',
            levels: levelCounts(STD, [1, 1, 1, 1, 1, 1]),
            namesStandards: false,
        });
        const omitting = competenceValueGroup({
            id: '8a-de',
            type: 'group',
            name: '8a',
            subject: 'Deutsch',
            domainId: 'le',
            levels: levelCounts(STD.slice(0, 5), [2, 2, 2, 2, 2]),
            namesStandards: false,
        });
        // The scale tags no standard, so no band alias reaches its levels: the share is asked
        // of the function the queries count with, over 8a's value group.
        const context = await slContextFor({ competenceLevels: [full, omitting] });
        vi.spyOn(console, 'warn').mockImplementation(() => {});

        expect(competenceLevelShare(context.palette, [omitting], ['OptStd'])).toBe(0);
        expect(competenceLevelShare(context.palette, [omitting], ['nicht-da'])).toBeNull();
    });
});
