// @vitest-browser
// (transitive: stackedBarUtils.js -> themeService.js reads getComputedStyle at import time;
//  the legend section writes into a panel element)

import { describe, it, expect, beforeEach, vi } from 'vitest';

import { DataStore } from '../../../src/common/services/dataStore.js';
import {
    getCompetencyBand,
    getCompetencyLevelOrdinal,
    getStandardRank,
    registerCompetenceLevelScales,
    resetCompetenceLevelPalette,
    resolveScaleId,
} from '@tba3/modules/common/services/competenceLevelPalette.js';
import { getCompetencyColor } from '@tba3/modules/common/services/themeService.js';
import {
    buildStackedSegments,
    processSegments,
} from '@tba3/modules/common/charts/stackedBarUtils.js';
import { parseCompetenceLevels } from '@tba3/modules/common/charts/competenceLevelAdapter.js';
import { defineSlDatasets } from '../../../src/sl/slDataService.js';
import { SL_DATA_KEYS } from '../../../src/sl/slDataKeys.js';
import { getScaleIdForDomain } from '@tba3/modules/sl/utils/slLevelDefinitions.js';
import { buildCompetencyLevelRows } from '@tba3/modules/sl/modules/charts/groupComparison/competencyLevelRows.js';
import {
    extractLevelOrder,
    filterSelectedDomainData,
    prepareCompetencyGroupData,
} from '@tba3/modules/sl/modules/charts/groupComparison/groupComparisonDataUtils.js';
import { prepareCompetencyLevels } from '@tba3/modules/sl/modules/charts/competency/shared/competencyChartData.js';
import { renderCompetencyLevelLegendSection } from '@tba3/modules/sl/modules/charts/competency/shared/competencyLegendRender.js';
import { helperFor, competenceRow } from '../support/slInfoBoxFixture.js';

/**
 * WHY, for every assertion here: Nordrhein-Westfalen ships two ladders in one export —
 * Deutsch/Englisch on `k.h.N., KS 1 … KS 5` and Mathematik on `k.h.N., KS 1a, KS 1b,
 * KS 2 … KS 5` — so five level names mean two different things on one page. The palette
 * registry has been able to tell them apart since it became scale-aware, but no SL
 * caller said which ladder it meant, so a bare `KS 3` resolved to whichever ladder
 * registered it last: the wrong ramp for one Fach, ordinal ties in the Vergleich, and a
 * legend enumerating the other ladder. These pin that every SL path now names its ladder.
 * The scale id is the palette's own (the level sequence joined by `|`).
 */

const DEUTSCH = ['k.h.N.', 'KS 1', 'KS 2', 'KS 3', 'KS 4', 'KS 5'];
const MATHE = ['k.h.N.', 'KS 1a', 'KS 1b', 'KS 2', 'KS 3', 'KS 4', 'KS 5'];
const DEUTSCH_ID = DEUTSCH.join('|');
const MATHE_ID = MATHE.join('|');

function levelCounts(levelNames, counts) {
    return Object.fromEntries(levelNames.map((level, index) => [level, counts[index] ?? 0]));
}

/** The two-ladder school: one Deutsch and one Mathematik class, both listing every level. */
function nrwRows() {
    return [
        competenceRow({
            id: 'schule',
            type: 'school',
            name: 'Schule',
            subject: 'Deutsch',
            domainId: 'le',
            levels: levelCounts(DEUTSCH, [1, 1, 1, 1, 1, 1]),
            namesStandards: false,
        }),
        competenceRow({
            id: '8a-de',
            type: 'group',
            name: '8a',
            subject: 'Deutsch',
            domainId: 'le',
            levels: levelCounts(DEUTSCH, [1, 2, 3, 4, 5, 6]),
            namesStandards: false,
        }),
        competenceRow({
            id: 'schule',
            type: 'school',
            name: 'Schule',
            subject: 'Mathematik',
            levels: levelCounts(MATHE, [1, 1, 1, 1, 1, 1, 1]),
            namesStandards: false,
        }),
        competenceRow({
            id: '8a-ma',
            type: 'group',
            name: '8a',
            subject: 'Mathematik',
            levels: levelCounts(MATHE, [1, 2, 3, 4, 5, 6, 7]),
            namesStandards: false,
        }),
    ];
}

function studentRow(id, subject, level, domainId = null) {
    return {
        id,
        type: 'student',
        subject: { name: subject },
        domain: { id: domainId },
        covariates: [
            { type: 'group', label: 'Klasse', value: '8a' },
            { type: 'gender', value: 'female' },
        ],
        competenceLevels: [{ nameShort: level }],
    };
}

function storeFor(competenceLevels, students) {
    registerCompetenceLevelScales(competenceLevels);
    const dataStore = new DataStore();
    defineSlDatasets(dataStore);
    dataStore.setRawData(SL_DATA_KEYS.COMPETENCE_LEVELS, competenceLevels);
    dataStore.setRawData(SL_DATA_KEYS.STUDENTS_COMPETENCE_LEVELS, students);
    return dataStore;
}

beforeEach(() => {
    resetCompetenceLevelPalette();
});

describe('resolveScaleId — the id a row hands to the scoped lookups', () => {
    // WHY: the registry keys a scale by its level sequence, and a row lists only the
    // levels its population reached. SL had no way to turn a row into the `scaleId` the
    // scoped lookups accept, which is why every one of its callers resolved by bare name.
    it('returns the registered id for a full ladder and the container for a truncated run', () => {
        registerCompetenceLevelScales(nrwRows().slice(0, 2));

        expect(resolveScaleId(DEUTSCH)).toBe(DEUTSCH_ID);
        // NRW's bottom-truncated rows: the domain reached `KS 1 … KS 5` but not `k.h.N.`.
        expect(resolveScaleId(DEUTSCH.slice(1))).toBe(DEUTSCH_ID);
    });

    it('refuses to guess when a run sits inside two ladders, and says so once', () => {
        // WHY: `KS 2 … KS 5` is a run of both NRW ladders. Picking either silently
        // paints a Deutsch row with the Mathematik ramp; the caller has the Fach and can
        // decide, so this returns nothing and the console names the ambiguity.
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        registerCompetenceLevelScales(nrwRows());

        expect(resolveScaleId(DEUTSCH.slice(2))).toBeUndefined();
        expect(resolveScaleId(DEUTSCH.slice(2))).toBeUndefined();
        expect(warn).toHaveBeenCalledTimes(1);
        expect(resolveScaleId(MATHE.slice(1, 4))).toBe(MATHE_ID);
        expect(resolveScaleId(['zzz'])).toBeUndefined();
        expect(resolveScaleId([])).toBeUndefined();
    });

    it('treats a null scaleId as "no scale named", like undefined', () => {
        // WHY: data fields default to null, and a `null` scope used to build the key
        // `'null\x00ks 3'`, which matches nothing — every lookup fed a row without a
        // resolvable scale would have painted grey instead of falling back by name.
        registerCompetenceLevelScales(nrwRows().slice(0, 2));

        expect(getCompetencyBand('KS 3', null)).toEqual(getCompetencyBand('KS 3'));
        expect(getStandardRank('KS 3', null)).toBe(getStandardRank('KS 3'));
    });
});

describe("the data services name every row's ladder", () => {
    it("stamps stats.scaleId and each student's competencyScaleId in buildDomainResultsFromJson", () => {
        const store = storeFor(nrwRows(), [
            studentRow('s1', 'Deutsch', 'KS 3', 'le'),
            studentRow('s2', 'Mathematik', 'KS 3'),
        ]);

        const results = store.getDataset(SL_DATA_KEYS.DOMAIN_RESULTS);
        const deutsch = results.find((result) => result.fach === 'Deutsch');
        const mathe = results.find((result) => result.fach === 'Mathematik');

        expect(deutsch.stats.scaleId).toBe(DEUTSCH_ID);
        expect(mathe.stats.scaleId).toBe(MATHE_ID);
        expect(deutsch.summedResults[0].competencyScaleId).toBe(DEUTSCH_ID);
        expect(mathe.summedResults[0].competencyScaleId).toBe(MATHE_ID);
    });

    it("settles a truncated row through the Fach/Domäne's fullest row", () => {
        // WHY: a Deutsch class that reached only `KS 2 … KS 5` is a run of both ladders,
        // which the palette alone cannot decide. The level definition for Deutsch/le is
        // read off the fullest row, so the class still resolves to the Deutsch ladder.
        const rows = nrwRows();
        rows.push(
            competenceRow({
                id: '8b-de',
                type: 'group',
                name: '8b',
                subject: 'Deutsch',
                domainId: 'le',
                levels: levelCounts(DEUTSCH.slice(2), [1, 1, 1, 1]),
                namesStandards: false,
            }),
        );
        const store = storeFor(rows, []);

        expect(
            getScaleIdForDomain(store.getDataset(SL_DATA_KEYS.LEVEL_DEFINITIONS), 'Deutsch', 'le'),
        ).toBe(DEUTSCH_ID);
        const truncated = store
            .getDataset(SL_DATA_KEYS.DOMAIN_RESULTS)
            .find((result) => result.stammklasse === '8b');
        expect(truncated.stats.scaleId).toBe(DEUTSCH_ID);
    });

    it('parseCompetenceLevels reads the vocabulary off the fullest row and names its scale', () => {
        registerCompetenceLevelScales(nrwRows());
        const full = competenceRow({
            id: 'a',
            type: 'group',
            name: '8a',
            subject: 'Deutsch',
            domainId: 'le',
            levels: levelCounts(DEUTSCH, [1, 1, 1, 1, 1, 1]),
        });
        const truncated = competenceRow({
            id: 'b',
            type: 'group',
            name: '8b',
            subject: 'Deutsch',
            domainId: 'le',
            levels: levelCounts(DEUTSCH.slice(2), [1, 1, 1, 1]),
        });

        const parsed = parseCompetenceLevels([truncated, full]);

        expect(parsed.levels).toEqual(DEUTSCH);
        expect(parsed.scaleId).toBe(DEUTSCH_ID);
    });
});

describe("the paint path resolves a level on the row's ladder", () => {
    it("gives KS 3 two colours, one per ladder, and the stacked segment takes its row's", () => {
        registerCompetenceLevelScales(nrwRows());
        const deutschColor = getCompetencyColor('KS 3', DEUTSCH_ID);
        const matheColor = getCompetencyColor('KS 3', MATHE_ID);
        expect(deutschColor).not.toBe(matheColor);

        const colorOf = (entry) =>
            buildStackedSegments(entry, ['KS 3'], () => '#000000', { valueKey: '_value' })[0]
                .appearance?.baseColor;
        expect(colorOf({ 'KS 3_value': 50, scaleId: DEUTSCH_ID })).toBe(deutschColor);
        expect(colorOf({ 'KS 3_value': 50, scaleId: MATHE_ID })).toBe(matheColor);
        // A row without a ladder leaves the renderer's bare-name fallback in charge.
        expect(
            buildStackedSegments({ 'KS 3_value': 50 }, ['KS 3'], () => '#000000', {
                valueKey: '_value',
            })[0].appearance,
        ).toBeUndefined();
    });

    it('lets a table row name its ladder for processSegments', () => {
        registerCompetenceLevelScales(nrwRows());
        const config = { fields: ['ks_KS 3'] };

        const deutsch = processSegments({ 'ks_KS 3': 5, scaleId: DEUTSCH_ID }, config)[0];
        const mathe = processSegments({ 'ks_KS 3': 5, scaleId: MATHE_ID }, config)[0];

        expect(deutsch.appearance.baseColor).toBe(getCompetencyColor('KS 3', DEUTSCH_ID));
        expect(mathe.appearance.baseColor).toBe(getCompetencyColor('KS 3', MATHE_ID));
        expect(deutsch.appearance.baseColor).not.toBe(mathe.appearance.baseColor);
    });

    it('colours the Überblick union by the first row carrying each name', () => {
        registerCompetenceLevelScales(nrwRows());
        const chartData = [
            { competencyLevels: DEUTSCH, scaleId: DEUTSCH_ID },
            { competencyLevels: MATHE, scaleId: MATHE_ID },
        ];

        const { competencyLevels, getColorForLevel, scaleIdForLevel } =
            prepareCompetencyLevels(chartData);

        expect(competencyLevels).toEqual(expect.arrayContaining([...DEUTSCH, 'KS 1a', 'KS 1b']));
        expect(scaleIdForLevel('KS 3')).toBe(DEUTSCH_ID);
        expect(scaleIdForLevel('KS 1a')).toBe(MATHE_ID);
        expect(getColorForLevel('KS 3')).toBe(getCompetencyColor('KS 3', DEUTSCH_ID));
        // The row wins over the union when it is known.
        expect(getColorForLevel('KS 3', chartData[1])).toBe(getCompetencyColor('KS 3', MATHE_ID));
    });
});

describe("the Vergleich keys its rows on the group's ladder", () => {
    it('carries the ladder from the domain results into the level order and the segments', () => {
        const store = storeFor(nrwRows(), [
            studentRow('s1', 'Mathematik', 'KS 1b'),
            studentRow('s2', 'Mathematik', 'KS 3'),
        ]);
        const domainResults = store.getDataset(SL_DATA_KEYS.DOMAIN_RESULTS);
        const selector = { subjectName: 'Mathematik', domainId: null };

        const levelOrder = extractLevelOrder(domainResults, selector);
        expect(levelOrder).toEqual({ order: MATHE, scaleId: MATHE_ID });

        const students = filterSelectedDomainData(domainResults, selector);
        expect(students.every((student) => student.competencyScaleId === MATHE_ID)).toBe(true);

        const prepared = prepareCompetencyGroupData(
            students,
            'gender',
            'female',
            'male',
            buildCompetencyLevelRows([levelOrder]),
        );
        expect(prepared.levelScaleIds).toEqual([MATHE_ID, MATHE_ID]);
        expect(
            prepared.group1Segments.flat().every((segment) => segment.scaleId === MATHE_ID),
        ).toBe(true);
    });

    it('draws seven Mathematik rows with no ordinal tie once the ladder is named', () => {
        // WHY: `KS 1b` (3rd of 7) and `KS 2` (3rd of 6) tie on ordinal when resolved by
        // name; with the ladder named every row sorts on its own scale.
        registerCompetenceLevelScales(nrwRows());

        const rows = buildCompetencyLevelRows([{ order: MATHE, scaleId: MATHE_ID }]);

        expect(rows.map((row) => row.sharedLabel)).toEqual([...MATHE].reverse());
        const ordinals = MATHE.map((level) => getCompetencyLevelOrdinal(level, MATHE_ID));
        expect(new Set(ordinals).size).toBe(MATHE.length);
    });

    it('aligns a group that omits a level of its ladder on the full ladder', () => {
        // WHY: rows used to be aligned by position in the *packed* list, so a group nobody
        // placed at `KS 1b` shifted every row below the gap by one — two different levels
        // drawn on one row. The ladder is the scale's, not the row's.
        registerCompetenceLevelScales(nrwRows());
        const omitting = MATHE.filter((level) => level !== 'KS 1b');

        const rows = buildCompetencyLevelRows([
            { order: omitting, scaleId: MATHE_ID },
            { order: MATHE, scaleId: MATHE_ID },
        ]);

        expect(rows).toHaveLength(MATHE.length);
        expect(rows.every((row) => row.sharedLabel !== null)).toBe(true);
        // Without a ladder the packed list is all there is — the pre-existing behaviour.
        expect(buildCompetencyLevelRows([omitting])).toHaveLength(omitting.length);
    });
});

describe('the legend enumerates the ladder of the row it describes', () => {
    it('paints each swatch from the ladder scaleIdForLevel names, not the last-registered one', () => {
        // WHY: the swatch colour is the only thing on the legend that depends on the
        // ladder, and `KS 3` has one colour per ladder. Resolved by name every swatch took
        // whichever ladder registered last, so half the page disagreed with its legend.
        registerCompetenceLevelScales(nrwRows());
        const scaleIdForLevel = (level) => (level === 'KS 3' ? MATHE_ID : DEUTSCH_ID);
        const panel = document.createElement('div');

        const { ksGroupOrder, ksLevelToGroup } = renderCompetencyLevelLegendSection(
            panel,
            ['KS 1', 'KS 3'],
            () => '#000000',
            { scaleIdForLevel },
        );

        const swatchColor = (level) =>
            [...panel.querySelectorAll('*')]
                .map((node) => node.style?.getPropertyValue('--ks-band-color'))
                .filter(Boolean)[ksGroupOrder.indexOf(ksLevelToGroup.get(level))];
        expect(ksGroupOrder).toEqual(['ks-1', 'ks-3']);
        expect(swatchColor('KS 3')).toBe(getCompetencyColor('KS 3', MATHE_ID));
        expect(swatchColor('KS 3')).not.toBe(getCompetencyColor('KS 3', DEUTSCH_ID));
        expect(swatchColor('KS 1')).toBe(getCompetencyColor('KS 1', DEUTSCH_ID));
    });
});

describe('the info-box counts read coverage off the scale, not the row', () => {
    it('reports a level nobody reached as covered with a count of zero', () => {
        // WHY: `covered` used to be decided by the levels *this row* lists, so a row
        // omitting `OptStd` because nobody reached it reported the question as unknown
        // and vanished from the view it belongs in. A genuine zero is a zero.
        const HB = ['MiStd--', 'MiStd-', 'MiStd', 'ReStd', 'ReStd+', 'OptStd'];
        const full = competenceRow({
            id: 'schule',
            type: 'school',
            name: 'Schule',
            subject: 'Deutsch',
            domainId: 'le',
            levels: levelCounts(HB, [1, 1, 1, 1, 1, 1]),
            namesStandards: false,
        });
        const omitting = competenceRow({
            id: '8a-de',
            type: 'group',
            name: '8a',
            subject: 'Deutsch',
            domainId: 'le',
            levels: levelCounts(HB.slice(0, 5), [2, 2, 2, 2, 2]),
            namesStandards: false,
        });
        const helper = helperFor({ competenceLevels: [full, omitting] });
        vi.spyOn(console, 'warn').mockImplementation(() => {});

        expect(
            helper.getCompetenceLevelShare({
                target: '8a',
                levelNames: ['OptStd'],
                subjectName: 'Deutsch',
                domainId: 'le',
            }),
        ).toBe(0);
        expect(
            helper.getCompetenceLevelShare({
                target: '8a',
                levelNames: ['nicht-da'],
                subjectName: 'Deutsch',
                domainId: 'le',
            }),
        ).toBeNull();
    });
});
