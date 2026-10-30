// @vitest-browser
// (transitive: slBaseTableModule.js -> tableModule.js touches the DOM on construction)

import { describe, it, expect } from 'vitest';
import { SL_DATASETS } from '../../../../src/sl/index.js';
import { bookletProperty } from '../../../support/competenceLevelGroups.js';
import { studentValueGroup } from '../../../support/slValueGroupFactories.js';
import { createSubjectContext } from '../../../support/subjectContext.js';

/** @typedef {import('../../../support/competenceLevelGroups.js').StudentLevelsValueGroup} StudentLevelsValueGroup */

/**
 * Student s1 of Lerngruppe 8a in Deutsch: Lesen.
 * @param {Array<{key: string, value: string}>} properties - Beside its name.
 * @returns {StudentLevelsValueGroup}
 */
const student = (properties) =>
    studentValueGroup({
        id: 's1',
        subject: 'Deutsch',
        groupName: '8a',
        domain: { id: 'le', name: 'Lesen' },
        properties,
    });

/**
 * Whether the Unterrichtsqualität / Selbstwirksamkeit columns get built at all.
 *
 * Both are per-student survey scales (`tq_mean`, `sp_mean`) that only the demo fixture
 * ships; a state export has no source for them. Added unconditionally, they would leave
 * every dataset without the survey with two permanently blank columns in two tables —
 * the cell formatter returns `''` per cell — which reads as a table that failed to render.
 *
 * "No data" is an empty *array*, which is truthy, so a gate on the rows themselves passes
 * for a dataset that has nothing; `getSurveyRows` asks for their length.
 */

/**
 * Student value groups in the export shape: no `sp_mean`, no `tq_mean` in `properties[]`.
 * @type {StudentLevelsValueGroup[]}
 */
const EXPORT_STUDENTS = [student([bookletProperty('TH01')])];

/**
 * The demo fixture's shape: both scales present on every student.
 * @type {StudentLevelsValueGroup[]}
 */
const FIXTURE_STUDENTS = [
    student([
        { key: 'sp_mean', value: '3.4' },
        { key: 'tq_mean', value: '2.8' },
    ]),
];

/**
 * @param {StudentLevelsValueGroup[]} studentsData - `students-competence-levels.json`.
 * @returns {Promise<{hasTeachingQuality: boolean, hasSelfEfficacy: boolean}>} The survey gate over a store holding them.
 */
const surveyRowsOf = async (studentsData) =>
    (
        await createSubjectContext('sl', {
            documents: { 'students-competence-levels.json': studentsData },
        })
    ).documents.getDataset(SL_DATASETS.SURVEY_ROWS);

/**
 * The one survey gate: the header asks it before any view has rendered, the tables and the
 * Materialien pages build their columns from it. Balken/Boxplot switches nothing but
 * Unterrichtsqualität and Selbstwirksamkeit geometry, so on a dataset with neither it would
 * depress, redraw, and change nothing visible.
 */
describe('SL_DATASETS.SURVEY_ROWS', () => {
    it('reports neither scale for an export that ships no questionnaire', async () => {
        expect(await surveyRowsOf(EXPORT_STUDENTS)).toEqual({
            hasTeachingQuality: false,
            hasSelfEfficacy: false,
        });
    });

    it('reports both scales for the demo fixture', async () => {
        expect(await surveyRowsOf(FIXTURE_STUDENTS)).toEqual({
            hasTeachingQuality: true,
            hasSelfEfficacy: true,
        });
    });

    it('reports the two scales independently', async () => {
        // One "has survey data" boolean would not do. Balken/Boxplot stays if either
        // scale is there — it still has a column to redraw. The Verlauf boxplot needs
        // both: it is one combined chart that hides the Selbstwirksamkeit card while
        // active, and with one scale missing it would draw half a chart and hide the
        // card that still has data.
        const teachingQualityOnly = [student([{ key: 'tq_mean', value: '2.8' }])];
        const selfEfficacyOnly = [student([{ key: 'sp_mean', value: '3.4' }])];

        expect(await surveyRowsOf(teachingQualityOnly)).toEqual({
            hasTeachingQuality: true,
            hasSelfEfficacy: false,
        });
        expect(await surveyRowsOf(selfEfficacyOnly)).toEqual({
            hasTeachingQuality: false,
            hasSelfEfficacy: true,
        });
    });

    it('reports neither scale for a payload without students', async () => {
        expect(await surveyRowsOf([])).toEqual({
            hasTeachingQuality: false,
            hasSelfEfficacy: false,
        });
    });

    it('counts a key with no parseable value as no scale: no column is built for it', async () => {
        const keyWithoutValue = [
            student([
                { key: 'tq_mean', value: 'k. A.' },
                { key: 'sp_mean', value: 'n/a' },
            ]),
        ];
        expect(await surveyRowsOf(keyWithoutValue)).toEqual({
            hasTeachingQuality: false,
            hasSelfEfficacy: false,
        });
    });
});
