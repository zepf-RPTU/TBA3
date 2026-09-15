import { describe, it, expect } from 'vitest';
import { emptySlData } from '@tba3/modules/sl/slData.js';
import { buildCompetenceLevelIndex } from '@tba3/modules/sl/slCompetenceLevelIndex.js';
import {
    MaterialSubjectContext,
    buildBestClassSet,
    buildDistributionLevels,
    buildMaterialStudentStatsIndex,
    readMaterialStudentStats,
} from '@tba3/modules/sl/modules/material/materialSubjectContext.js';

/**
 * Build a single raw student row matching the shape the context consumes.
 */
function studentRow({ id, className, gender, subject = 'Mathematik' }) {
    return {
        id,
        subject: { name: subject },
        covariates: [
            { type: 'group', value: className },
            { type: 'gender', value: gender },
        ],
    };
}

/**
 * One `competence-levels.json` row with a two-band ladder.
 */
function competenceLevelRow({ type, id, name, shares }) {
    return {
        type,
        id,
        name,
        subject: { name: 'Mathematik' },
        competenceLevels: Object.entries(shares).map(([nameShort, mean]) => ({
            nameShort,
            descriptiveStatistics: { mean },
        })),
    };
}

describe('buildMaterialStudentStatsIndex / readMaterialStudentStats', () => {
    it('deduplicates repeated rows for the same student in a class', () => {
        const index = buildMaterialStudentStatsIndex([
            studentRow({ id: 's1', className: '3a', gender: 'female' }),
            // Duplicate id within the same class must not be counted twice.
            studentRow({ id: 's1', className: '3a', gender: 'female' }),
            studentRow({ id: 's2', className: '3a', gender: 'male' }),
        ]);

        const stats = readMaterialStudentStats(index, 'Mathematik', '3a');
        expect(stats.count).toBe(2);
    });

    it('computes the female share over the students whose gender is stated', () => {
        const index = buildMaterialStudentStatsIndex([
            studentRow({ id: 's1', className: '3a', gender: 'female' }),
            studentRow({ id: 's2', className: '3a', gender: 'FEMALE' }),
            studentRow({ id: 's3', className: '3a', gender: 'male' }),
            studentRow({ id: 's4', className: '3a', gender: 'diverse' }),
            studentRow({ id: 's5', className: '3a', gender: null }),
            {
                id: 's6',
                subject: { name: 'Mathematik' },
                covariates: [{ type: 'group', value: '3a' }],
            },
        ]);

        const stats = readMaterialStudentStats(index, 'Mathematik', '3a');
        // The headcount keeps every student; the share counts only the four with a gender.
        expect(stats.count).toBe(6);
        // female + FEMALE (normalized to female) = 2 of 4 students with a stated gender.
        expect(stats.femaleShare).toBeCloseTo(2 / 4, 10);
    });

    it('leaves the share unknown when no student carries a gender', () => {
        const index = buildMaterialStudentStatsIndex([
            {
                id: 's1',
                subject: { name: 'Mathematik' },
                covariates: [{ type: 'group', value: '3a' }],
            },
            {
                id: 's2',
                subject: { name: 'Mathematik' },
                covariates: [{ type: 'group', value: '3b' }],
            },
        ]);

        expect(readMaterialStudentStats(index, 'Mathematik', '3a')).toEqual({
            count: 1,
            femaleShare: null,
        });
        expect(readMaterialStudentStats(index, 'Mathematik', null)).toEqual({
            count: 2,
            femaleShare: null,
        });
    });

    it('class-level lookup returns only that class', () => {
        const index = buildMaterialStudentStatsIndex([
            studentRow({ id: 's1', className: '3a', gender: 'female' }),
            studentRow({ id: 's2', className: '3b', gender: 'male' }),
            studentRow({ id: 's3', className: '3b', gender: 'male' }),
        ]);

        expect(readMaterialStudentStats(index, 'Mathematik', '3a').count).toBe(1);
        expect(readMaterialStudentStats(index, 'Mathematik', '3b').count).toBe(2);
    });

    it('school-level lookup aggregates all classes for the subject', () => {
        const index = buildMaterialStudentStatsIndex([
            studentRow({ id: 's1', className: '3a', gender: 'female' }),
            studentRow({ id: 's2', className: '3b', gender: 'male' }),
            studentRow({ id: 's3', className: '3b', gender: 'female' }),
        ]);

        const school = readMaterialStudentStats(index, 'Mathematik', null);
        expect(school.count).toBe(3);
        expect(school.femaleShare).toBeCloseTo(2 / 3, 10);
    });

    it('returns a zero/null fallback for unknown subject or class pairs', () => {
        const index = buildMaterialStudentStatsIndex([
            studentRow({ id: 's1', className: '3a', gender: 'female' }),
        ]);

        expect(readMaterialStudentStats(index, 'Deutsch', '3a')).toEqual({
            count: 0,
            femaleShare: null,
        });
        expect(readMaterialStudentStats(index, 'Mathematik', '9z')).toEqual({
            count: 0,
            femaleShare: null,
        });
    });
});

describe('buildDistributionLevels', () => {
    it('reads the share from the mean and keeps the payload order', () => {
        const levels = buildDistributionLevels({
            competenceLevels: [
                { nameShort: 'I', descriptiveStatistics: { mean: 0.25 } },
                { nameShort: 'II', descriptiveStatistics: { mean: 0.75 } },
            ],
        });

        expect(levels.map((level) => level.label)).toEqual(['I', 'II']);
        expect(levels.map((level) => level.share)).toEqual([0.25, 0.75]);
    });

    it('falls back to frequency over total when no mean is given', () => {
        const [level] = buildDistributionLevels({
            competenceLevels: [
                { nameShort: 'I', descriptiveStatistics: { frequency: 3, total: 12 } },
            ],
        });

        expect(level.share).toBeCloseTo(0.25, 10);
    });

    it('leaves the share unknown when neither a mean nor a usable total is given', () => {
        const [noStats, zeroTotal] = buildDistributionLevels({
            competenceLevels: [
                { nameShort: 'I' },
                { nameShort: 'II', descriptiveStatistics: { frequency: 3, total: 0 } },
            ],
        });

        expect(noStats.share).toBeNull();
        expect(zeroTotal.share).toBeNull();
    });

    it('answers empty for a row that carries no levels', () => {
        expect(buildDistributionLevels({})).toEqual([]);
        expect(buildDistributionLevels(null)).toEqual([]);
    });
});

describe('buildBestClassSet', () => {
    it('names every class holding the maximum, not just the first', () => {
        const rows = [
            { className: '3a', solutionRate: 0.7 },
            { className: '3b', solutionRate: 0.9 },
            { className: '3c', solutionRate: 0.9 },
        ];

        expect(buildBestClassSet(rows, 'solutionRate')).toEqual(new Set(['3b', '3c']));
    });

    it('skips rows that carry no value for the metric', () => {
        const rows = [
            { className: '3a', teachingQualityMean: null },
            { className: '3b', teachingQualityMean: 2.5 },
        ];

        expect(buildBestClassSet(rows, 'teachingQualityMean')).toEqual(new Set(['3b']));
    });

    it('answers empty when no row carries the metric', () => {
        const rows = [{ className: '3a', selfEfficacyMean: null }, { className: '3b' }];

        expect(buildBestClassSet(rows, 'selfEfficacyMean')).toEqual(new Set());
    });
});

describe('MaterialSubjectContext.buildSubjectContext', () => {
    /**
     * A two-class school with a Landesschnitt row, student rows and both survey scales.
     */
    function buildContext() {
        const competenceLevels = [
            competenceLevelRow({
                type: 'school',
                id: 'schule',
                name: 'Schule',
                shares: { I: 0.4, II: 0.6 },
            }),
            competenceLevelRow({
                type: 'group',
                id: '3a',
                name: '3a',
                shares: { I: 0.5, II: 0.5 },
            }),
            competenceLevelRow({
                type: 'group',
                id: '3b',
                name: '3b',
                shares: { I: 0.3, II: 0.7 },
            }),
            competenceLevelRow({
                type: 'state',
                id: 'land',
                name: 'Landesschnitt',
                shares: { I: 0.45, II: 0.55 },
            }),
        ];

        return new MaterialSubjectContext({
            slData: {
                ...emptySlData(),
                competenceLevels: () => competenceLevels,
                competenceLevelIndex: () => buildCompetenceLevelIndex(competenceLevels),
                studentsCompetenceLevels: () => [
                    studentRow({ id: 's1', className: '3a', gender: 'female' }),
                    studentRow({ id: 's2', className: '3a', gender: 'male' }),
                    studentRow({ id: 's3', className: '3b', gender: 'female' }),
                ],
                surveyScales: () => ({ hasTeachingQuality: true, hasSelfEfficacy: true }),
                teachingQuality: () => [
                    { className: 'Schule', subjectName: 'Mathematik', statistics: { mean: 2.8 } },
                    { className: '3a', subjectName: 'Mathematik', statistics: { mean: 3.2 } },
                    { className: '3b', subjectName: 'Mathematik', statistics: { mean: 2.4 } },
                ],
                selfEfficacyByClass: () => [
                    { className: '3a', statistics: { mean: 2.1 } },
                    { className: '3b', statistics: { mean: 2.9 } },
                ],
                selfEfficacySchool: () => ({ statistics: { mean: 2.5 } }),
            },
        }).buildSubjectContext('Mathematik');
    }

    it('builds one metrics row per class, in class-name order', () => {
        const context = buildContext();

        expect(context.classMetrics.map((metrics) => metrics.className)).toEqual(['3a', '3b']);
        expect(context.classMetrics.map((metrics) => metrics.studentCount)).toEqual([2, 1]);
    });

    it('aggregates the school row over every class of the Fach', () => {
        const context = buildContext();

        expect(context.schoolMetrics.className).toBeNull();
        expect(context.schoolMetrics.studentCount).toBe(3);
        expect(context.schoolMetrics.femaleShare).toBeCloseTo(2 / 3, 10);
    });

    it('reads the survey means per class and for the school', () => {
        const context = buildContext();

        expect(context.hasTeachingQuality).toBe(true);
        expect(context.hasSelfEfficacy).toBe(true);
        expect(context.schoolMetrics.teachingQualityMean).toBe(2.8);
        expect(context.schoolMetrics.selfEfficacyMean).toBe(2.5);
        expect(context.classMetrics[0].teachingQualityMean).toBe(3.2);
        expect(context.classMetrics[1].selfEfficacyMean).toBe(2.9);
    });

    it('names the best class per Kennzahl', () => {
        const context = buildContext();

        expect(context.bestClasses.teachingQualityMean).toEqual(new Set(['3a']));
        expect(context.bestClasses.selfEfficacyMean).toEqual(new Set(['3b']));
    });

    it('spans the class range of every metric', () => {
        const context = buildContext();

        expect(context.ranges.teachingQualityMean).toEqual({ min: 2.4, max: 3.2 });
    });

    it('derives the Klassenstufe from the class names', () => {
        expect(buildContext().classStage).toBe('3');
    });

    it('pairs the school and state distributions per Domäne', () => {
        const groups = buildContext().distributionGroups;

        expect(groups).toHaveLength(1);
        expect(groups[0].domainId).toBeNull();
        expect(groups[0].schoolDistribution.levels.map((level) => level.share)).toEqual([0.4, 0.6]);
        expect(groups[0].stateDistribution.levels.map((level) => level.share)).toEqual([
            0.45, 0.55,
        ]);
    });

    it('answers empty for a dataset with no data at all', () => {
        const context = new MaterialSubjectContext().buildSubjectContext('Mathematik');

        expect(context.classMetrics).toEqual([]);
        expect(context.distributionGroups).toEqual([]);
        expect(context.classStage).toBeNull();
        expect(context.schoolMetrics.studentCount).toBe(0);
    });
});
