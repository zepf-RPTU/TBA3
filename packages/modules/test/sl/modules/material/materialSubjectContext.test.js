import { describe, it, expect } from 'vitest';
import { SL_DATASETS } from '../../../../src/sl/index.js';
import { scaleValueGroup } from '../../../support/competenceScaleFixture.js';
import { createTestContext } from '../../../support/glossaryFixture.js';
import {
    buildSelfEfficacyIndex,
    buildTeachingQualityIndex,
} from '../../../../src/sl/utils/slSurveyDerivation.js';
import { buildCompetenceLevelIndex } from '../../../../src/sl/slCompetenceLevelIndex.js';
import {
    buildDomainResultsFromJson,
    buildGroupResultsFromJson,
    buildSchoolResults,
} from '../../../../src/sl/utils/slResultsDerivation.js';
import { MATERIAL_SUBJECT_CONTEXT } from '../../../../src/sl/modules/material/materialSubjectContext.js';
import { calculateDetailedBoxPlotStats } from '../../../../src/sl/utils/slBoxPlotStats.js';
import { calculateRatingDistribution } from '../../../../src/sl/utils/slRatingDistribution.js';
import { required } from '../../../support/required.js';
import {
    SCHOOL_ID,
    domainBookletSubject,
    resultValueGroup,
    studentValueGroup,
    withBooklet,
} from '../../../support/slValueGroupFactories.js';
import { createSubjectContext } from '../../../support/subjectContext.js';
import { BOOKLET_PROPERTY } from '../../../support/competenceLevelGroups.js';

/** @typedef {Array<[import('../../../../src/common/data/documentStore.js').DatasetKey<any>, unknown]>} DatasetEntries `SL_DATASETS` key → its value. */

/** @typedef {import('../../../../src/common/data/schemas/competenceLevels.js').CompetenceLevelsValueGroup} CompetenceLevelsValueGroup */
/** @typedef {import('../../../support/competenceLevelGroups.js').CurrentLevelsValueGroup} CurrentLevelsValueGroup */
/** @typedef {import('../../../../src/common/data/schemas/competenceLevels.js').LevelWithStatistics} LevelWithStatistics */
/** @typedef {import('../../../../src/sl/utils/slSurveyDerivation.js').TeachingQualityAggregate} TeachingQualityAggregate */
/** @typedef {import('../../../../src/sl/utils/slSurveyDerivation.js').SurveyAggregate} SurveyAggregate */
/** @typedef {import('../../../../src/sl/modules/material/materialSubjectContext.js').MaterialSubjectContextData} MaterialSubjectContextData */
/** @typedef {import('../../../../src/sl/modules/material/materialSubjectContext.js').MaterialDistributionLevel} MaterialDistributionLevel */

/**
 * The material data for Mathematik over the documents in hand, read through a fresh SL
 * context of its own (its store and its palette), so the scales one case's documents
 * register reach no other.
 * @param {import('../../../support/documentsInHand.js').DocumentsInHand} documents - Documents by file name.
 * @returns {Promise<MaterialSubjectContextData>}
 */
async function mathematikContext(documents) {
    const context = await createSubjectContext('sl', { documents: documents });
    return context.documents.getDataset(MATERIAL_SUBJECT_CONTEXT, 'Mathematik');
}

/**
 * A survey aggregate of one student rating at `mean`: the context reads only the mean.
 * @param {string} groupName - The group, or `Schule`.
 * @param {number} mean
 * @returns {SurveyAggregate}
 */
function surveyAggregate(groupName, mean) {
    return {
        groupName,
        count: 1,
        values: [mean],
        statistics: calculateDetailedBoxPlotStats([mean]),
        distribution: calculateRatingDistribution([mean]),
    };
}

/**
 * The Unterrichtsqualität aggregate of a group in Mathematik.
 * @param {string} groupName
 * @param {number} mean
 * @returns {TeachingQualityAggregate}
 */
function teachingQualityAggregate(groupName, mean) {
    return { ...surveyAggregate(groupName, mean), subjectName: 'Mathematik' };
}

/**
 * One `competence-levels.json` value group with a two-band ladder; each share is counted out of 100.
 * @param {object} params
 * @param {string} params.type - `school`, `group` or `state`.
 * @param {string} params.id
 * @param {string} params.name - The display name.
 * @param {Record<string, number>} params.shares - Level → share.
 * @returns {CurrentLevelsValueGroup}
 */
function competenceLevelValueGroup({ type, id, name, shares }) {
    return {
        type,
        id,
        name,
        subject: { name: 'Mathematik' },
        properties: [BOOKLET_PROPERTY],
        competenceLevels: Object.entries(shares).map(([nameShort, mean]) => ({
            nameShort,
            descriptiveStatistics: { total: 100, frequency: Math.round(mean * 100), mean },
        })),
    };
}

describe('domains — the levels of one value group', () => {
    /**
     * The school distribution's levels for a school value group carrying the given levels.
     * @param {LevelWithStatistics[]} competenceLevels
     * @returns {Promise<MaterialDistributionLevel[]>} The levels the page draws.
     */
    const schoolLevels = async (competenceLevels) =>
        required(
            (
                await mathematikContext({
                    'competence-levels.json': [
                        {
                            type: 'school',
                            id: 'schule',
                            name: 'Schule',
                            subject: { name: 'Mathematik' },
                            properties: [BOOKLET_PROPERTY],
                            competenceLevels,
                        },
                    ],
                })
            ).domains[0].schoolDistribution,
            'school distribution',
        ).levels;

    it('reads the share from the mean and keeps the payload order', async () => {
        const levels = await schoolLevels([
            { nameShort: 'I', descriptiveStatistics: { mean: 0.25 } },
            { nameShort: 'II', descriptiveStatistics: { mean: 0.75 } },
        ]);

        expect(levels.map((level) => level.label)).toEqual(['I', 'II']);
        expect(levels.map((level) => level.share)).toEqual([0.25, 0.75]);
    });

    it('reads the headcount over the rounded mean where the value group counts', async () => {
        const [level] = await schoolLevels([
            { nameShort: 'I', descriptiveStatistics: { frequency: 1, total: 3, mean: 0.3333 } },
        ]);

        expect(level.share).toBeCloseTo(1 / 3, 10);
    });

    it('leaves the share unknown for a counted level of nobody', async () => {
        const [zeroTotal] = await schoolLevels([
            { nameShort: 'II', descriptiveStatistics: { frequency: 3, total: 0, mean: 0 } },
        ]);

        expect(zeroTotal.share).toBeNull();
    });

    it('answers empty for a value group that carries no levels', async () => {
        expect(await schoolLevels([])).toEqual([]);
    });
});

describe('MATERIAL_SUBJECT_CONTEXT', () => {
    /**
     * A two-group school with a Landesschnitt value group, student value groups and both survey scales.
     * @param {object} [surveys] - Survey rows replacing the default ones.
     * @param {TeachingQualityAggregate[]} [surveys.teachingQualityByGroup] - The groups' Unterrichtsqualität rows.
     * @param {SurveyAggregate[]} [surveys.selfEfficacyByGroup] - The groups' Selbstwirksamkeit rows.
     * @returns {Promise<MaterialSubjectContextData>} The context for Mathematik.
     */
    async function buildContext({
        teachingQualityByGroup = [
            teachingQualityAggregate('3a', 3.2),
            teachingQualityAggregate('3b', 2.4),
        ],
        selfEfficacyByGroup = [surveyAggregate('3a', 2.1), surveyAggregate('3b', 2.9)],
    } = {}) {
        const competenceLevels = [
            competenceLevelValueGroup({
                type: 'school',
                id: 'schule',
                name: 'Schule',
                shares: { I: 0.4, II: 0.6 },
            }),
            competenceLevelValueGroup({
                type: 'group',
                id: '3a',
                name: '3a',
                shares: { I: 0.5, II: 0.5 },
            }),
            competenceLevelValueGroup({
                type: 'group',
                id: '3b',
                name: '3b',
                shares: { I: 0.3, II: 0.7 },
            }),
            competenceLevelValueGroup({
                type: 'state',
                id: 'land',
                name: 'Landesschnitt',
                shares: { I: 0.45, II: 0.55 },
            }),
        ];

        const teachingQuality = [
            { ...teachingQualityAggregate('Schule', 2.8), isSchool: true },
            ...teachingQualityByGroup,
        ];
        const selfEfficacySchool = { ...surveyAggregate('Schule', 2.5), isSchool: true };

        const students = [
            studentValueGroup({
                id: 's1',
                subject: 'Mathematik',
                groupName: '3a',
                gender: 'female',
            }),
            studentValueGroup({ id: 's2', subject: 'Mathematik', groupName: '3a', gender: 'male' }),
            studentValueGroup({
                id: 's3',
                subject: 'Mathematik',
                groupName: '3b',
                gender: 'female',
            }),
        ];
        const domainResults = buildDomainResultsFromJson(
            createTestContext('sl'),
            buildCompetenceLevelIndex(competenceLevels),
            students,
        );
        const context = await createSubjectContext('sl', {
            documents: {
                'competence-levels.json': competenceLevels,
                'students-competence-levels.json': students,
            },
            datasets: /** @type {DatasetEntries} */ ([
                [SL_DATASETS.GROUP_RESULTS, buildGroupResultsFromJson(domainResults)],
                [SL_DATASETS.SCHOOL_RESULTS, buildSchoolResults(domainResults)],
                [SL_DATASETS.TEACHING_QUALITY, teachingQuality],
                [SL_DATASETS.TEACHING_QUALITY_INDEX, buildTeachingQualityIndex(teachingQuality)],
                [SL_DATASETS.SELF_EFFICACY_BY_GROUP, selfEfficacyByGroup],
                [SL_DATASETS.SELF_EFFICACY_SCHOOL, selfEfficacySchool],
                [
                    SL_DATASETS.SELF_EFFICACY_INDEX,
                    buildSelfEfficacyIndex(selfEfficacyByGroup, selfEfficacySchool),
                ],
            ]),
        });
        return context.documents.getDataset(MATERIAL_SUBJECT_CONTEXT, 'Mathematik');
    }

    it('builds one metrics row per group, in group-name order', async () => {
        const context = await buildContext();

        expect(context.groupMetrics.map((metrics) => metrics.groupName)).toEqual(['3a', '3b']);
        // A Fach with one Domäne: the headcount is the value group's stated `total`, as the
        // Lerngruppen table counts it, not its student value groups.
        expect(context.groupMetrics.map((metrics) => metrics.studentCount)).toEqual([100, 100]);
        expect(context.groupMetrics.map((metrics) => metrics.femaleShare)).toEqual([0.5, 1]);
    });

    it('aggregates the school row over every group of the Fach', async () => {
        const context = await buildContext();

        expect(context.schoolMetrics.groupName).toBeNull();
        expect(context.schoolMetrics.studentCount).toBe(200);
        expect(context.schoolMetrics.femaleShare).toBeCloseTo(2 / 3, 10);
    });

    it('reads the survey means per group and for the school', async () => {
        const context = await buildContext();

        expect(context.hasTeachingQuality).toBe(true);
        expect(context.hasSelfEfficacy).toBe(true);
        expect(context.schoolMetrics.teachingQualityMean).toBe(2.8);
        expect(context.schoolMetrics.selfEfficacyMean).toBe(2.5);
        expect(context.groupMetrics[0].teachingQualityMean).toBe(3.2);
        expect(context.groupMetrics[1].selfEfficacyMean).toBe(2.9);
    });

    it('names the best group per Kennzahl', async () => {
        const context = await buildContext();

        expect(context.bestGroups.teachingQualityMean).toEqual(new Set(['3a']));
        expect(context.bestGroups.selfEfficacyMean).toEqual(new Set(['3b']));
    });

    it('names every group holding the maximum, not just the first', async () => {
        const context = await buildContext({
            teachingQualityByGroup: ['3a', '3b'].map((groupName) =>
                teachingQualityAggregate(groupName, 3.2),
            ),
        });

        expect(context.bestGroups.teachingQualityMean).toEqual(new Set(['3a', '3b']));
    });

    it('skips groups that carry no value for the Kennzahl, and names none when no group does', async () => {
        const context = await buildContext({
            teachingQualityByGroup: [teachingQualityAggregate('3b', 2.5)],
            selfEfficacyByGroup: [],
        });

        expect(context.bestGroups.teachingQualityMean).toEqual(new Set(['3b']));
        expect(context.bestGroups.selfEfficacyMean).toEqual(new Set());
    });

    it('spans the group range of every metric', async () => {
        const context = await buildContext();

        expect(context.ranges.teachingQualityMean).toEqual({ min: 2.4, max: 3.2 });
    });

    it('pairs the school and state distributions per Domäne', async () => {
        const groups = (await buildContext()).domains;

        expect(groups).toHaveLength(1);
        expect(groups[0].domainId).toBeNull();
        expect(required(groups[0].schoolDistribution).levels.map((level) => level.share)).toEqual([
            0.4, 0.6,
        ]);
        expect(required(groups[0].stateDistribution).levels.map((level) => level.share)).toEqual([
            0.45, 0.55,
        ]);
    });

    it('pairs school and state value groups by Domäne id, in first-seen order', async () => {
        /**
         * @param {CurrentLevelsValueGroup} valueGroup
         * @param {string} id - The Domäne id.
         * @returns {CurrentLevelsValueGroup}
         */
        const withDomain = (valueGroup, id) => ({
            ...valueGroup,
            domain: { id, name: `Domäne ${id}` },
        });
        const competenceLevels = [
            withDomain(
                competenceLevelValueGroup({
                    type: 'school',
                    id: 'schule',
                    name: 'Schule',
                    shares: { I: 1 },
                }),
                'lesen',
            ),
            withDomain(
                competenceLevelValueGroup({
                    type: 'state',
                    id: 'land',
                    name: 'Land',
                    shares: { I: 1 },
                }),
                'hoeren',
            ),
            withDomain(
                competenceLevelValueGroup({
                    type: 'state',
                    id: 'land',
                    name: 'Land',
                    shares: { I: 1 },
                }),
                'lesen',
            ),
        ];
        const groups = (
            await mathematikContext({
                'competence-levels.json': competenceLevels,
            })
        ).domains;

        expect(groups.map((group) => group.domainId)).toEqual(['lesen', 'hoeren']);
        expect(groups[0].schoolDistribution).not.toBeNull();
        expect(groups[0].stateDistribution).not.toBeNull();
        expect(groups[1].schoolDistribution).toBeNull();
        expect(groups[1].domainName).toBe('Domäne hoeren');
    });

    it('answers empty for a dataset with no data at all', async () => {
        const context = await mathematikContext({});

        expect(context.groupMetrics).toEqual([]);
        expect(context.domains).toEqual([]);
        expect(context.veraStage).toBeNull();
        expect(context.schoolMetrics.studentCount).toBe(0);
    });
});

describe('performance per Domäne', () => {
    /**
     * A competence-levels value group of the school or the Landesschnitt in one Domäne.
     * @param {'school'|'state'} type
     * @param {string} domainId - The Domäne id, also its name.
     * @returns {CurrentLevelsValueGroup}
     */
    const levelsIn = (type, domainId) => ({
        ...competenceLevelValueGroup({
            type,
            id: type === 'school' ? SCHOOL_ID : 'land',
            name: type,
            shares: { I: 0.5, II: 0.5 },
        }),
        domain: { id: domainId, name: domainId },
    });

    it('compares the same Lösungsquote with the Landesschnitt of its own Domäne', async () => {
        // 70 % is well above the Land in one Domäne and on par in the other: pooled over
        // the Fach, the two would read as one middling figure.
        const material = await mathematikContext({
            'competence-levels.json': ['le', 'rs'].flatMap((domainId) => [
                levelsIn('school', domainId),
                levelsIn('state', domainId),
            ]),
            'aggregations.json': [
                ...['le', 'rs'].map((domain) =>
                    resultValueGroup({
                        id: SCHOOL_ID,
                        type: 'school',
                        name: 'Schule',
                        subject: 'Mathematik',
                        domain,
                        solved: 70,
                        total: 100,
                    }),
                ),
                resultValueGroup({
                    id: 'land',
                    type: 'state',
                    name: 'Land',
                    subject: 'Mathematik',
                    domain: 'le',
                    solved: 50,
                    total: 100,
                }),
                resultValueGroup({
                    id: 'land',
                    type: 'state',
                    name: 'Land',
                    subject: 'Mathematik',
                    domain: 'rs',
                    solved: 70,
                    total: 100,
                }),
            ],
        });

        const [le, rs] = material.domains;
        expect(le.school.solutionRate).toBeCloseTo(0.7, 10);
        expect(rs.school.solutionRate).toBeCloseTo(0.7, 10);
        expect(le.solutionRateDelta).toBeCloseTo(0.2, 10);
        expect(rs.solutionRateDelta).toBeCloseTo(0, 10);
    });
});

describe('veraStage', () => {
    // The badge names the VERA stage the booklets were made for. Group names say
    // nothing reliable about it (`M-G1`, `8aDeu`), the booklet id does (`26-V8-DE-TH-1`).
    /**
     * @param {...string} booklets - One booklet per value group, the school's first.
     * @returns {Promise<string|null>} The stage the context reads.
     */
    const stageOf = async (...booklets) => {
        const valueGroups = booklets.map((booklet, i) =>
            withBooklet(
                competenceLevelValueGroup({
                    type: i === 0 ? 'school' : 'group',
                    id: `value-group-${i}`,
                    name: `Gruppe ${i}`,
                    shares: { I: 1 },
                }),
                booklet,
            ),
        );
        return (await mathematikContext({ 'competence-levels.json': valueGroups })).veraStage;
    };

    it('reads the stage segment of the booklet id', async () => {
        expect(await stageOf('26-V8-MA-TH-1', '26-V8-MA-TH-2')).toBe('8');
    });

    it('reads every booklet of a value group tested with several', async () => {
        expect(await stageOf('26-V3-MA-TH-1,26-V3-MA-TH-2')).toBe('3');
        expect(await stageOf('26-V3-MA-TH-1,26-V8-MA-TH-2')).toBeNull();
    });

    it('names no stage when the booklets disagree or name none', async () => {
        expect(await stageOf('26-V3-MA-TH-1', '26-V8-MA-TH-1')).toBeNull();
        // The API's fallback id is the bare numeric Testheft id.
        expect(await stageOf('4711')).toBeNull();
    });
});

describe('mixedBooklets', () => {
    /**
     * @param {...string} booklets - One booklet per group value group, the school's pooled over them.
     * @returns {Promise<boolean>} Whether the context reads the Fach, which has no Domäne split, as mixed.
     */
    const mixedOf = async (...booklets) => {
        const valueGroups = booklets.map((booklet, i) =>
            withBooklet(
                competenceLevelValueGroup({
                    type: 'group',
                    id: `8${'abc'[i]}`,
                    name: `8${'abc'[i]}`,
                    shares: { I: 1 },
                }),
                booklet,
            ),
        );
        const school = withBooklet(
            competenceLevelValueGroup({
                type: 'school',
                id: SCHOOL_ID,
                name: 'Schule',
                shares: { I: 1 },
            }),
            [...new Set(booklets)].join(','),
        );
        const { domains } = await mathematikContext({
            'competence-levels.json': [school, ...valueGroups],
        });
        return required(domains[0]).mixedBooklets;
    };

    it('reads a Fach whose groups sat different booklets as mixed', async () => {
        expect(await mixedOf('26-V8-MA-TH-1', '26-V8-MA-TH-2')).toBe(true);
    });

    it('reads one booklet as not mixed', async () => {
        expect(await mixedOf('26-V8-MA-TH-1', '26-V8-MA-TH-1')).toBe(false);
    });

    it('reads a Domäne as mixed only when it was sat in several booklets', async () => {
        // Each Deutsch booklet covers two Domänen: Lesen was sat in two, the others in one.
        const { competenceLevels, aggregation } = domainBookletSubject();
        const context = await createSubjectContext('sl', {
            documents: {
                'competence-levels.json': competenceLevels,
                'aggregations.json': aggregation,
            },
        });
        const { domains } = context.documents.getDataset(MATERIAL_SUBJECT_CONTEXT, 'Deutsch');

        expect(domains.map((domain) => [domain.domainId, domain.mixedBooklets])).toEqual([
            ['le', true],
            ['rs', false],
            ['sp', false],
        ]);
        expect(domains.map((domain) => domain.school.solutionRate)).toEqual([null, 0.5, 0.5]);
    });
});

describe('previousYear', () => {
    // The delta counts the levels the Regelstandard alias picks out on the loaded scale:
    // every year's value group ships it, as an export does, so the store registers it on landing.
    const SCALE = scaleValueGroup([
        { nameShort: 'I', name: 'Mindeststandard' },
        { nameShort: 'III', name: 'Regelstandard' },
    ]);

    /**
     * A school value group of one year with its counts at the levels of its scale.
     * @param {string} year - The `testPeriod`.
     * @param {string} domainId - The Domäne id, also its name.
     * @param {Record<string, number>} counts - Level → headcount.
     * @param {object} [options]
     * @param {CompetenceLevelsValueGroup} [options.scale] - The ladder the value group ships.
     * @param {string} [options.subjectName]
     * @returns {CurrentLevelsValueGroup}
     */
    const yearValueGroup = (
        year,
        domainId,
        counts,
        { scale = SCALE, subjectName = 'Mathematik' } = {},
    ) => {
        const levelIds = new Map(
            scale.competenceLevels.map((level) => [level.nameShort, level.id]),
        );
        const total = Object.values(counts).reduce((sum, n) => sum + n, 0);
        return {
            type: 'school',
            id: 'schule',
            name: 'Schule',
            subject: { name: subjectName },
            domain: { id: domainId, name: domainId },
            properties: [...(scale.properties ?? []), { key: 'testPeriod', value: year }],
            competenceLevels: Object.entries(counts).map(([nameShort, frequency]) => ({
                id: levelIds.get(nameShort),
                nameShort,
                descriptiveStatistics: { frequency, total, mean: frequency / total },
            })),
        };
    };

    it('compares the latest year with the one before, per Domäne', async () => {
        // Pooled over the Domänen, Domäne a's rise would read as a small one for the Fach.
        const material = await mathematikContext({
            'competence-levels.json': [
                yearValueGroup('2025', 'a', { I: 5, III: 5 }),
                yearValueGroup('2025', 'b', { I: 30, III: 10 }),
                yearValueGroup('2024', 'a', { I: 8, III: 2 }),
                yearValueGroup('2024', 'b', { I: 30, III: 10 }),
                yearValueGroup('2023', 'a', { I: 0, III: 10 }),
            ],
        });

        // a: 5 of 10 reached III against 2 of 10; b: 10 of 40 both years.
        const [a, b] = material.domains;
        expect(a.domainId).toBe('a');
        expect(a.previousYear?.year).toBe('2024');
        expect(a.previousYear?.delta).toBeCloseTo(0.3, 10);
        expect(b.previousYear?.delta).toBeCloseTo(0, 10);
    });

    it('compares with the last earlier year that has data, and names that year', async () => {
        // Domäne a was not tested in 2024, which Domäne b was: "the year before" would
        // claim a 2024 result a never had, so the copy names 2023 instead.
        const material = await mathematikContext({
            'competence-levels.json': [
                yearValueGroup('2025', 'a', { I: 5, III: 5 }),
                yearValueGroup('2025', 'b', { I: 30, III: 10 }),
                yearValueGroup('2024', 'b', { I: 30, III: 10 }),
                yearValueGroup('2023', 'a', { I: 8, III: 2 }),
            ],
        });

        const [a, b] = material.domains;
        expect(a.previousYear?.year).toBe('2023');
        expect(a.previousYear?.delta).toBeCloseTo(0.3, 10);
        expect(b.previousYear?.year).toBe('2024');
    });

    it('states no delta for a Fach whose scale tags no Regelstandard, as its share cell does', async () => {
        // The alias picks out Mathematik's III. Englisch's ladder tags no band, so its share is
        // unknown ("–") in both years; counting III as 0 there would print "gleich (Δ 0,0 PP)"
        // beside the dash.
        const GER = scaleValueGroup([
            { nameShort: 'A1' },
            { nameShort: 'A2' },
            { nameShort: 'B1' },
        ]);
        const englisch = { scale: GER, subjectName: 'Englisch' };
        const context = await createSubjectContext('sl', {
            documents: {
                'competence-levels.json': [
                    yearValueGroup('2025', 'a', { I: 5, III: 5 }),
                    yearValueGroup('2024', 'a', { I: 8, III: 2 }),
                    yearValueGroup('2025', 'h', { A1: 2, A2: 4, B1: 4 }, englisch),
                    yearValueGroup('2024', 'h', { A1: 4, A2: 4, B1: 2 }, englisch),
                ],
            },
        });
        const read = (/** @type {string} */ subjectName) =>
            context.documents.getDataset(MATERIAL_SUBJECT_CONTEXT, subjectName).domains[0];

        const [mathematik, englischDomain] = [read('Mathematik'), read('Englisch')];
        expect(englischDomain.school.mediumOrAboveShare).toBeNull();
        expect(englischDomain.previousYear).toBeNull();
        expect(mathematik.previousYear?.delta).toBeCloseTo(0.3, 10);
    });

    it('answers null without a year before', async () => {
        const material = await mathematikContext({
            'competence-levels.json': [yearValueGroup('2025', 'a', { I: 5, III: 5 })],
        });

        expect(material.domains[0].previousYear).toBeNull();
    });
});
