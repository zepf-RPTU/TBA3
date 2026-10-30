// @vitest-browser
// The summary resolves its palette tokens through getComputedStyle.
import { describe, it, expect, beforeEach } from 'vitest';

import { SL_DATASETS } from '../../../../../src/sl/index.js';
import { GROUP_COMPARISON_SUMMARY } from '../../../../../src/sl/modules/charts/groupComparison/groupComparisonSummary.js';
import { scaleValueGroup } from '../../../../support/competenceScaleFixture.js';
import { createSubjectContext } from '../../../../support/subjectContext.js';

/** @typedef {import('../../../../../src/common/data/documentStore.js').DatasetKey<any>} AnyDatasetKey */

/** @typedef {import('../../../../../src/sl/modules/charts/groupComparison/groupComparisonChartTypes.js').GroupComparisonSelection} GroupComparisonSelection */

/**
 * The Vergleich's info box is the only consumer of this summary. It takes the rows the
 * chart drew (`COMPARISON_ROWS`), splits them into the two compared groups and formats
 * the figures. It does not filter: re-deriving the chart's filter pipeline from the raw
 * payloads would let the sentence under the chart describe a different population.
 */

/** A scale whose bands name their KMK standard, so a Regelstandard share is expressible. */
const STANDARD_SCALE = [
    { nameShort: 'I', name: 'weit unter Mindeststandard' },
    { nameShort: 'II', name: 'Mindeststandard' },
    { nameShort: 'III', name: 'Regelstandard' },
    { nameShort: 'IV', name: 'Regelstandard plus' },
    { nameShort: 'V', name: 'Optimalstandard' },
];

/** The same ladder as the server ships it — with the standard band as a value-group property. */
const STANDARD_SCALE_ROW = scaleValueGroup(STANDARD_SCALE);

/** Bands that name no standard — a share over them is unknown, not zero. */
const UNNAMED_SCALE = ['MiStd', 'ReStd', 'OptStd'].map((nameShort) => ({
    nameShort,
    name: nameShort,
}));

/**
 * One student row of a domain result, as the Kompetenzstufen chart reads it.
 * @param {string} competenceLevelName
 * @param {{gender?: string, groupName?: string}} [fields] - The split fields.
 * @returns {object} The `studentResults` row.
 */
const student = (competenceLevelName, { gender = 'female', groupName = '8a' } = {}) => ({
    studentId: `${groupName}-${gender}-${competenceLevelName}`,
    gender,
    groupName,
    competenceLevelName,
});

/**
 * One per-student survey row, as the rating charts read it.
 * @param {number|null|undefined} mean - The student's scale mean.
 * @param {{gender?: string, groupName?: string, subject?: string}} [fields] - The split fields.
 * @returns {object}
 */
const rater = (mean, { gender = 'female', groupName = '8a', subject = 'Deutsch' } = {}) => ({
    mean,
    gender,
    groupName,
    subject,
});

/**
 * The domain results of one Fach/Domäne holding the given students.
 * @param {object[]} students - The `studentResults` rows.
 * @returns {object[]} The `SL_DATASETS.DOMAIN_RESULTS` payload.
 */
const domainResults = (students) => [
    { subjectName: 'Deutsch', domainId: 'LV', studentResults: students },
];

/**
 * The summary the info box reads for a selection, from a store holding the datasets.
 * @param {Pick<GroupComparisonSelection, 'chartType' | 'category'> & Partial<GroupComparisonSelection>} selection - The chart type, Kategorie and groups; the rest defaults to the first Fach/Domäne and no scope.
 * @param {Array<[AnyDatasetKey, unknown]>} datasets - `SL_DATASETS` key → its rows.
 * @returns {Promise<import('../../../../../src/sl/modules/charts/groupComparison/groupComparisonSummary.js').GroupComparisonSummary>}
 */
async function summarize(selection, datasets) {
    const { documents: store, palette } = await createSubjectContext('sl', { datasets });
    palette.registerCompetenceLevelScales(scaleRows);
    return store.getDataset(GROUP_COMPARISON_SUMMARY, {
        subjectIndex: 0,
        scopeFilter: null,
        group1: null,
        group2: null,
        ...selection,
    });
}

/** @type {import('../../../../../src/common/data/schemas/competenceLevels.js').CompetenceLevelsValueGroup[]} The scales a test registers on its store's palette. */
let scaleRows;

beforeEach(() => {
    scaleRows = [];
});

describe('GROUP_COMPARISON_SUMMARY — the rows are taken as given', () => {
    it('counts every row the chart drew, without re-applying the scope or subject filter', async () => {
        // Selbstwirksamkeit draws every row, and these span two groups and two
        // subjects: a summary that filtered by the selected Fach would report fewer rows
        // than the chart drew.
        const summary = await summarize(
            { chartType: 'selfEfficacy', category: 'gender', group1: 'female', group2: 'male' },
            [
                [
                    SL_DATASETS.COMPARISON_SELF_EFFICACY,
                    [
                        rater(3, { gender: 'female', groupName: '8a', subject: 'Deutsch' }),
                        rater(4, { gender: 'female', groupName: '8b', subject: 'Englisch' }),
                        rater(2, { gender: 'male', groupName: '8a', subject: 'Deutsch' }),
                        rater(1, { gender: 'male', groupName: '8b', subject: 'Englisch' }),
                    ],
                ],
            ],
        );

        expect(summary.group1.n).toBe(2);
        expect(summary.group2.n).toBe(2);
    });

    it('reports nothing drawn when the chart drew nothing', async () => {
        // `COMPARISON_ROWS` is null for a selection with no rows, which must
        // read as "no data", not throw.
        const summary = await summarize({ chartType: 'competenceLevel', category: 'gender' }, [
            [SL_DATASETS.DOMAIN_RESULTS, []],
        ]);

        expect(summary.group1.n).toBe(0);
        expect(summary.group2.n).toBe(0);
    });
});

describe('GROUP_COMPARISON_SUMMARY — Kompetenzstufen', () => {
    it('reports the share at or above Regelstandard for each group', async () => {
        scaleRows = [STANDARD_SCALE_ROW];

        const summary = await summarize(
            {
                chartType: 'competenceLevel',
                category: 'gender',
                group1: 'female',
                group2: 'male',
            },
            [
                [
                    SL_DATASETS.DOMAIN_RESULTS,
                    domainResults([
                        student('III', { gender: 'female' }),
                        student('V', { gender: 'female' }),
                        student('I', { gender: 'female' }),
                        student('II', { gender: 'male' }),
                        student('IV', { gender: 'male' }),
                    ]),
                ],
            ],
        );

        expect(summary.group1.share).toBeCloseTo(2 / 3, 10);
        expect(summary.group2.share).toBe(0.5);
    });

    it('leaves the share null for a scale that names no standard, rather than reporting 0 %', async () => {
        // A share the scale cannot express is unknown, not zero — `null` is what
        // lets the template leave the sentence out. Reporting 0 % would read as a
        // measurement of failure.
        scaleRows = [scaleValueGroup(UNNAMED_SCALE)];

        const summary = await summarize(
            {
                chartType: 'competenceLevel',
                category: 'gender',
                group1: 'female',
                group2: 'male',
            },
            [
                [
                    SL_DATASETS.DOMAIN_RESULTS,
                    domainResults([
                        student('ReStd', { gender: 'female' }),
                        student('OptStd', { gender: 'male' }),
                    ]),
                ],
            ],
        );

        expect(summary.group1.share).toBeNull();
        expect(summary.group2.share).toBeNull();
    });

    it('returns the empty skeleton when the split cannot find two groups', async () => {
        // A Lerngruppen comparison needs two groups. One group is not "0 %" — there is no
        // comparison to report at all, so no figures are invented.
        scaleRows = [STANDARD_SCALE_ROW];

        const summary = await summarize({ chartType: 'competenceLevel', category: 'group' }, [
            [
                SL_DATASETS.DOMAIN_RESULTS,
                domainResults([
                    student('III', { groupName: '8a' }),
                    student('IV', { groupName: '8a' }),
                ]),
            ],
        ]);

        expect(summary.group1.n).toBe(0);
        expect(summary.group2.n).toBe(0);
    });
});

describe('GROUP_COMPARISON_SUMMARY — ratings and labels', () => {
    it('summarises rating values per group and names the measure family', async () => {
        const summary = await summarize(
            { chartType: 'teachingQuality', category: 'gender', group1: 'female', group2: 'male' },
            [
                [SL_DATASETS.DOMAIN_RESULTS, domainResults([])],
                [
                    SL_DATASETS.COMPARISON_TEACHING_QUALITY,
                    [
                        rater(4, { gender: 'female' }),
                        rater(2, { gender: 'female' }),
                        rater(3, { gender: 'male' }),
                    ],
                ],
            ],
        );

        expect(summary.group1.n).toBe(2);
        expect(summary.group1.mean).toBeCloseTo(3, 10);
        expect(summary.group2.mean).toBeCloseTo(3, 10);
    });

    it('keeps every figure null when no row carries a usable value', async () => {
        const summary = await summarize(
            { chartType: 'selfEfficacy', category: 'gender', group1: 'female', group2: 'male' },
            [
                [
                    SL_DATASETS.COMPARISON_SELF_EFFICACY,
                    [rater(null, { gender: 'female' }), rater(undefined, { gender: 'male' })],
                ],
            ],
        );

        expect(summary.group1.mean).toBeNull();
        expect(summary.group1.standardDeviation).toBeNull();
        expect(summary.group1.n).toBe(0);
    });

    it('labels the two sides of a Fach comparison with their subjects', async () => {
        // In a Fach comparison the subject is what the two sides differ in, so the
        // labels are the only place the compared Fächer are named.
        const summary = await summarize(
            {
                chartType: 'teachingQuality',
                category: 'subject',
                group1: 'Deutsch',
                group2: 'Englisch',
            },
            [
                [
                    SL_DATASETS.COMPARISON_TEACHING_QUALITY,
                    [rater(4, { subject: 'Deutsch' }), rater(3, { subject: 'Englisch' })],
                ],
            ],
        );

        expect(summary.group1.label).toBe('Deutsch');
        expect(summary.group2.label).toBe('Englisch');
    });
});
