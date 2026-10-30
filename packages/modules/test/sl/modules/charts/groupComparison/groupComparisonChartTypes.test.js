import { describe, expect, it } from 'vitest';
import { SL_DATASETS } from '../../../../../src/sl/index.js';
import { buildCompetenceLevelIndex } from '../../../../../src/sl/slCompetenceLevelIndex.js';
import {
    COMPARISON_ROWS,
    POINTS_MIXED_BOOKLETS,
} from '../../../../../src/sl/modules/charts/groupComparison/groupComparisonChartTypes.js';
import { required } from '../../../../support/required.js';
import {
    DEUTSCH_BOOKLETS,
    competenceValueGroup,
    domainBookletSubject,
    twoBookletSubject,
    withBooklet,
} from '../../../../support/slValueGroupFactories.js';
import { createSubjectContext } from '../../../../support/subjectContext.js';

/** @typedef {Array<[import('../../../../../src/common/data/documentStore.js').DatasetKey<any>, unknown]>} DatasetEntries `SL_DATASETS` key → its value. */

/** @typedef {import('../../../../../src/sl/utils/slStudentStats.js').SlDomainResult} SlDomainResult */
/** @typedef {import('../../../../../src/sl/modules/charts/groupComparison/groupComparisonDataUtils.js').RatingRecord} RatingRecord */
/** @typedef {import('../../../../../src/sl/modules/charts/groupComparison/groupComparisonDataUtils.js').PointRecord} PointRecord */
/** @typedef {import('../../../../../src/sl/modules/charts/groupComparison/groupComparisonChartTypes.js').GroupComparisonSelection} GroupComparisonSelection */
/** @typedef {import('../../../../../src/sl/modules/charts/groupComparison/groupComparisonChartTypes.js').ComparisonRecord} ComparisonRecord */

/**
 * The comparison datasets a store holds.
 * @typedef {object} ComparisonDatasets
 * @property {SlDomainResult[]} domainResults
 * @property {RatingRecord[]} comparisonSP - Per-student Selbstwirksamkeit means.
 * @property {RatingRecord[]} comparisonTQ - Per-student Unterrichtsqualität means.
 * @property {PointRecord[]} comparisonPoints - Per-student point records.
 */

/**
 * The chart draws these rows and the info box summarises them, so one function decides
 * them for both: the chart type's payload, the selected Fach/Domäne (or the two compared
 * Fächer or Fach/Domänen), then the scope group.
 */

/**
 * The school's results in one Fach × Domäne.
 * @param {string} subjectName
 * @param {string} domainId - The Domäne id, also its name.
 * @param {Array<[string, string, string]>} students - Per student: id, group and level.
 * @returns {SlDomainResult}
 */
const domain = (subjectName, domainId, students) => ({
    subjectName,
    domainId,
    domainName: domainId,
    groupName: 'Schule',
    stats: {
        nrStudents: students.length,
        traitCounts: {},
        genderCounts: {},
        competenceLevelCounts: {},
        scaleId: 'sl',
    },
    studentResults: students.map(([studentId, groupName, competenceLevelName]) => ({
        studentId,
        gender: 'female',
        groupName,
        traits: new Set(),
        competenceLevelName,
    })),
});

const DOMAIN_RESULTS = [
    domain('Deutsch', 'LV', [
        ['s1', '8a', 'III'],
        ['s2', '8b', 'II'],
    ]),
    domain('Mathe', 'Zahlen', [['s3', '8a', 'IV']]),
];

/** @type {ComparisonDatasets} */
const DATASETS = {
    domainResults: DOMAIN_RESULTS,
    comparisonSP: [
        { studentId: 's1', subject: 'Deutsch', mean: 3, gender: 'female', groupName: '8a' },
        { studentId: 's2', subject: 'Deutsch', mean: 2, gender: 'male', groupName: '8b' },
    ],
    comparisonTQ: [
        { studentId: 's1', subject: 'Deutsch', mean: 4, gender: 'female', groupName: '8a' },
        { studentId: 's3', subject: 'Mathe', mean: 1, gender: 'female', groupName: '8a' },
    ],
    comparisonPoints: [
        {
            studentId: 's1',
            gender: 'female',
            groupName: '8a',
            subject: 'Deutsch',
            domainId: 'LV',
            domainName: 'LV',
            rawPoints: 5,
            maxPoints: 10,
            solutionRatePercent: 50,
        },
        {
            studentId: 's1',
            gender: 'female',
            groupName: '8a',
            subject: 'Deutsch',
            domainId: 'HV',
            domainName: 'HV',
            rawPoints: 10,
            maxPoints: 10,
            solutionRatePercent: 100,
        },
    ],
};

/**
 * A store holding the comparison datasets and the competence-levels index.
 * @param {ComparisonDatasets} datasets
 * @param {import('../../../../../src/common/data/schemas/competenceLevels.js').CurrentCompetenceLevelsValueGroup[]} [competenceLevels] - `competence-levels.json`, which names the groups' booklets.
 * @returns {Promise<any>}
 */
function storeFor(datasets, competenceLevels = []) {
    return createSubjectContext('sl', {
        datasets: /** @type {DatasetEntries} */ ([
            [SL_DATASETS.DOMAIN_RESULTS, datasets.domainResults],
            [SL_DATASETS.COMPARISON_SELF_EFFICACY, datasets.comparisonSP],
            [SL_DATASETS.COMPARISON_TEACHING_QUALITY, datasets.comparisonTQ],
            [SL_DATASETS.COMPARISON_POINTS, datasets.comparisonPoints],
            [SL_DATASETS.COMPETENCE_LEVEL_INDEX, buildCompetenceLevelIndex(competenceLevels)],
        ]),
    }).then((context) => context.documents);
}

/**
 * The rows the chart draws for a selection, read from a store holding the datasets.
 * @param {GroupComparisonSelection} selection
 * @param {ComparisonDatasets} [datasets]
 * @returns {Promise<ComparisonRecord[]|null>} `null` when the selection has nothing to draw.
 */
async function rowsFor(selection, datasets = DATASETS) {
    return (await storeFor(datasets)).getDataset(COMPARISON_ROWS, selection);
}

/**
 * The rows a selection draws, asserted present.
 * @param {GroupComparisonSelection} selected
 * @returns {Promise<ComparisonRecord[]>}
 */
const drawnRows = async (selected) => required(await rowsFor(selected), 'comparison rows');

/**
 * Kompetenzstufen by gender over the first Fach/Domäne, with the given changes.
 * @param {Partial<GroupComparisonSelection>} [overrides] - What differs.
 * @returns {GroupComparisonSelection}
 */
const selection = (overrides) => ({
    chartType: 'competenceLevel',
    subjectIndex: 0,
    category: 'gender',
    scopeFilter: null,
    group1: null,
    group2: null,
    ...overrides,
});

describe('COMPARISON_ROWS', () => {
    it('reads the selected Fach/Domäne for Kompetenzstufen and narrows to the scope group', async () => {
        expect((await drawnRows(selection())).map((r) => r.studentId)).toEqual(['s1', 's2']);
        expect((await drawnRows(selection({ scopeFilter: '8b' }))).map((r) => r.studentId)).toEqual(
            ['s2'],
        );
    });

    it('takes every Fach/Domäne for a Fach comparison of Kompetenzstufen, whichever pair is picked', async () => {
        // The split picks the two compared Fach/Domänen out of these rows, and the Fach
        // selectors offer every Fach/Domäne with data in them.
        const rows = await drawnRows(
            selection({ category: 'subject', group1: 'Deutsch|LV', group2: 'Mathe|Zahlen' }),
        );

        expect(rows.map((r) => `${r.subject}:${r.studentId}`)).toEqual([
            'Deutsch|LV:s1',
            'Deutsch|LV:s2',
            'Mathe|Zahlen:s3',
        ]);
        expect(await drawnRows(selection({ category: 'subject' }))).toEqual(rows);
    });

    it('takes every rating row for Selbstwirksamkeit, only the Fach for Unterrichtsqualität', async () => {
        expect(
            (await drawnRows(selection({ chartType: 'selfEfficacy' }))).map((r) => r.studentId),
        ).toEqual(['s1', 's2']);
        expect(
            (await drawnRows(selection({ chartType: 'teachingQuality' }))).map((r) => r.studentId),
        ).toEqual(['s1']);
        expect(
            (await drawnRows(selection({ chartType: 'teachingQuality', category: 'subject' }))).map(
                (r) => r.studentId,
            ),
        ).toEqual(['s1', 's3']);
    });

    it("sums a student's domains per Fach for a Fach comparison of points", async () => {
        const byDomain = /** @type {PointRecord[]} */ (
            await drawnRows(selection({ chartType: 'points' }))
        );
        const bySubject = /** @type {PointRecord[]} */ (
            await drawnRows(selection({ chartType: 'points', category: 'subject' }))
        );

        expect(byDomain.map((r) => r.solutionRatePercent)).toEqual([50]);
        expect(bySubject.map((r) => r.solutionRatePercent)).toEqual([75]);
    });

    it('sums the Leitidee points of a Fach whose competence levels have no Domäne', async () => {
        // Mathematik's levels are Fach-level, so the selector offers the whole Fach, while
        // its results come per Leitidee: each student is one row over all of them.
        /**
         * @param {string} domainId
         * @param {number} rawPoints - Points scored of 10.
         * @returns {PointRecord}
         */
        const leitidee = (domainId, rawPoints) => ({
            studentId: 's3',
            gender: 'female',
            groupName: '8a',
            subject: 'Mathe',
            domainId,
            domainName: domainId,
            rawPoints,
            maxPoints: 10,
            solutionRatePercent: rawPoints * 10,
        });
        const rows = required(
            await rowsFor(selection({ chartType: 'points' }), {
                ...DATASETS,
                domainResults: [
                    domain('Mathe', /** @type {string} */ (/** @type {unknown} */ (null)), [
                        ['s3', '8a', 'IV'],
                    ]),
                ],
                comparisonPoints: [leitidee('za', 8), leitidee('me', 4)],
            }),
            'comparison rows',
        );

        expect(/** @type {PointRecord[]} */ (rows).map((r) => r.solutionRatePercent)).toEqual([60]);
    });

    it('answers null for a payload the type has no rows in', async () => {
        expect(
            await rowsFor(selection({ chartType: 'points' }), {
                ...DATASETS,
                comparisonPoints: [],
            }),
        ).toBeNull();
    });
});

describe('POINTS_MIXED_BOOKLETS', () => {
    // Deutsch: Lesen (LV) of 8a and 8c sat the first booklet, 8b the second; Englisch one booklet.
    /**
     * @param {string} studentId
     * @param {string} groupName
     * @param {string} gender
     * @param {string} [subject]
     * @returns {PointRecord}
     */
    const point = (studentId, groupName, gender, subject = 'Deutsch') => ({
        studentId,
        gender,
        groupName,
        subject,
        domainId: 'LV',
        domainName: 'LV',
        rawPoints: 1,
        maxPoints: 2,
        solutionRatePercent: 50,
    });
    const POINTS = [
        point('s1', '8a', 'female'),
        point('s2', '8a', 'male'),
        point('s3', '8b', 'female'),
        point('s4', '8c', 'female'),
        point('s1', '8a', 'female', 'Englisch'),
    ];
    /**
     * @param {string} id - The group, its name too.
     * @param {string} subject
     * @param {string} booklet - The group's booklet there.
     * @returns {ReturnType<typeof competenceValueGroup>}
     */
    const group = (id, subject, booklet) =>
        withBooklet(
            competenceValueGroup({ id, type: 'group', name: id, subject, levels: { III: 1 } }),
            booklet,
        );
    const COMPETENCE_LEVELS = [
        ...twoBookletSubject('LV'),
        { ...group('8c', 'Deutsch', DEUTSCH_BOOKLETS[0]), domain: { id: 'LV', name: 'LV' } },
        group('8a', 'Englisch', '26-V8-EN-TH-1'),
    ];
    /**
     * @param {Partial<GroupComparisonSelection>} overrides
     * @returns {Promise<boolean>} Whether the compared pair's Lösungsquoten mix booklets.
     */
    const mixedFor = async (overrides) =>
        (await storeFor({ ...DATASETS, comparisonPoints: POINTS }, COMPETENCE_LEVELS)).getDataset(
            POINTS_MIXED_BOOKLETS,
            selection(overrides),
        );

    it('flags two groups on different booklets of one Fach', async () => {
        expect(await mixedFor({ category: 'group', group1: '8a', group2: '8b' })).toBe(true);
        expect(await mixedFor({ category: 'group', group1: '8a', group2: '8c' })).toBe(false);
    });

    it('flags genders whose scope spans booklets, not those inside one group', async () => {
        /** @type {Partial<GroupComparisonSelection>} */
        const genders = { category: 'gender', group1: 'female', group2: 'male' };

        expect(await mixedFor(genders)).toBe(true);
        expect(await mixedFor({ ...genders, scopeFilter: '8a' })).toBe(false);
    });

    it('lets two Fächer stand side by side, each on its own booklet', async () => {
        expect(
            await mixedFor({
                category: 'subject',
                scopeFilter: '8a',
                group1: 'Deutsch',
                group2: 'Englisch',
            }),
        ).toBe(false);
    });
});

describe('POINTS_MIXED_BOOKLETS — booklets that cover some Domänen of a Fach', () => {
    // 8a sat Lesen and Rechtschreibung in one booklet, 8b Lesen and Sprachgebrauch in
    // another; 8c's students sat either, so its Lesen pools both booklets and its
    // Rechtschreibung and Sprachgebrauch one each. 8a sat Englisch in a booklet of its own.
    /** @type {Record<string, string[]>} The Deutsch Domänen each group sat. */
    const SAT = { '8a': ['le', 'rs'], '8b': ['le', 'sp'], '8c': ['le', 'rs', 'sp'] };
    /**
     * @param {string} domainId
     * @param {string} booklets - Comma-joined.
     * @returns {ReturnType<typeof competenceValueGroup>} 8c's value group in that Deutsch Domäne.
     */
    const groupOf8c = (domainId, booklets) =>
        withBooklet(
            competenceValueGroup({
                id: '8c',
                type: 'group',
                name: '8c',
                subject: 'Deutsch',
                domainId,
                levels: { III: 1 },
            }),
            booklets,
        );
    /**
     * @param {string} groupName
     * @param {string} subject
     * @param {string} domainId
     * @returns {PointRecord}
     */
    const point = (groupName, subject, domainId) => ({
        studentId: `${groupName}-s`,
        gender: 'female',
        groupName,
        subject,
        domainId,
        domainName: domainId,
        rawPoints: 1,
        maxPoints: 2,
        solutionRatePercent: 50,
    });
    /** @type {ComparisonDatasets} */
    const datasets = {
        ...DATASETS,
        domainResults: ['le', 'rs', 'sp'].map((domainId) =>
            domain(
                'Deutsch',
                domainId,
                Object.keys(SAT)
                    .filter((groupName) => SAT[groupName].includes(domainId))
                    .map((groupName) => [`${groupName}-s`, groupName, 'III']),
            ),
        ),
        comparisonPoints: [
            ...Object.entries(SAT).flatMap(([groupName, domainIds]) =>
                domainIds.map((domainId) => point(groupName, 'Deutsch', domainId)),
            ),
            point('8a', 'Englisch', 'LV'),
        ],
    };
    const competenceLevels = [
        ...domainBookletSubject().competenceLevels,
        groupOf8c('le', DEUTSCH_BOOKLETS.join(',')),
        groupOf8c('rs', DEUTSCH_BOOKLETS[0]),
        groupOf8c('sp', DEUTSCH_BOOKLETS[1]),
        withBooklet(
            competenceValueGroup({
                id: '8a',
                type: 'group',
                name: '8a',
                subject: 'Englisch',
                domainId: 'LV',
                levels: { III: 1 },
            }),
            '26-V8-EN-TH-1',
        ),
    ];
    /**
     * @param {Partial<GroupComparisonSelection>} overrides
     * @returns {Promise<boolean>} Whether the compared pair's Lösungsquoten mix booklets.
     */
    const mixedFor = async (overrides) =>
        (await storeFor(datasets, competenceLevels)).getDataset(
            POINTS_MIXED_BOOKLETS,
            selection({
                chartType: 'points',
                category: 'group',
                group1: '8a',
                group2: '8b',
                ...overrides,
            }),
        );

    it('flags a Domäne the pair sat in two booklets, not one sat in one', async () => {
        expect(await mixedFor({ subjectIndex: 0 })).toBe(true);
        expect(await mixedFor({ subjectIndex: 1 })).toBe(false);
        expect(await mixedFor({ subjectIndex: 2 })).toBe(false);
        // 8c sat the whole Fach in both booklets, Rechtschreibung in the one 8a sat.
        expect(await mixedFor({ subjectIndex: 1, group2: '8c' })).toBe(false);
        expect(await mixedFor({ subjectIndex: 0, group2: '8c' })).toBe(true);
    });

    it("flags a Fach's rate over all its Domänen, which pools both booklets", async () => {
        /** @type {Partial<GroupComparisonSelection>} */
        const subjects = { category: 'subject', group1: 'Deutsch', group2: 'Englisch' };

        expect(await mixedFor(subjects)).toBe(true);
        expect(await mixedFor({ ...subjects, scopeFilter: '8a' })).toBe(false);
    });
});
