/**
 * A GroupComparisonChart over a store double, wired as its descriptor wires it: the
 * sources, the rows each selection draws and the booklet verdict, all memoised on the store.
 */

import { GroupComparisonChart } from '../../src/sl/modules/charts/groupComparison/groupComparisonChart.js';
import {
    COMPARISON_ROWS,
    COMPARISON_SOURCES,
    POINTS_MIXED_BOOKLETS,
} from '../../src/sl/modules/charts/groupComparison/groupComparisonChartTypes.js';
import { SL_DATASETS } from '../../src/sl/index.js';
import { buildCompetenceLevelIndex } from '../../src/sl/slCompetenceLevelIndex.js';
import { createTestContext } from './glossaryFixture.js';
import { createSubjectContext } from './subjectContext.js';

/** @typedef {Array<[import('../../src/common/data/documentStore.js').DatasetKey<any>, unknown]>} DatasetEntries `SL_DATASETS` key → its value. */

/**
 * @param {HTMLElement} container
 * @param {object} datasets - The comparison datasets; each defaults to none.
 * @param {unknown[]} [datasets.domainResults] - `sl.domainResults`.
 * @param {unknown[]} [datasets.selfEfficacy] - `sl.comparisonSelfEfficacy`.
 * @param {unknown[]} [datasets.teachingQuality] - `sl.comparisonTeachingQuality`.
 * @param {unknown[]} [datasets.points] - `sl.comparisonPoints`.
 * @param {import('../../src/common/data/schemas/competenceLevels.js').CurrentCompetenceLevelsValueGroup[]} [datasets.competenceLevels] - `competence-levels.json`, which names the groups' booklets.
 * @returns {Promise<GroupComparisonChart>} Not yet drawn.
 */
export async function groupComparisonChartOn(
    container,
    {
        domainResults = [],
        selfEfficacy = [],
        teachingQuality = [],
        points = [],
        competenceLevels = [],
    },
) {
    const { documents } = await createSubjectContext('sl', {
        datasets: /** @type {DatasetEntries} */ ([
            [SL_DATASETS.DOMAIN_RESULTS, domainResults],
            [SL_DATASETS.COMPARISON_SELF_EFFICACY, selfEfficacy],
            [SL_DATASETS.COMPARISON_TEACHING_QUALITY, teachingQuality],
            [SL_DATASETS.COMPARISON_POINTS, points],
            [SL_DATASETS.COMPETENCE_LEVEL_INDEX, buildCompetenceLevelIndex(competenceLevels)],
        ]),
    });
    return new GroupComparisonChart(
        container,
        {
            sources: documents.getDataset(COMPARISON_SOURCES),
            rowsOf: (/** @type {any} */ selection) =>
                documents.getDataset(COMPARISON_ROWS, selection),
            pointsMixedBooklets: (/** @type {any} */ selection) =>
                documents.getDataset(POINTS_MIXED_BOOKLETS, selection),
        },
        { context: createTestContext('sl'), autoResize: false },
    );
}
