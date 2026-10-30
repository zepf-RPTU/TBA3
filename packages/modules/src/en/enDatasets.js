/**
 * EN dataset catalog — the one authoritative definition of every derived EN dataset:
 * its key, the documents or datasets it reads, and the builder that produces it. Cards
 * name these keys in their `documents` and read them with `getDataset`; the store
 * fetches the documents behind a key when a card ensures it.
 */

import { dataset } from '../common/data/documentStore.js';
import { indexBy } from '../common/data/datasetIndex.js';
import { buildEnConfig } from './enConfig.js';
import { parseStyleAggregation } from './utils/enStyleAggregationAdapter.js';
import { buildGroupStudentRecords } from './utils/enStudentDataAdapter.js';
import { buildItemArray } from './utils/enItemDataAdapter.js';
import { ownItemGroups, comparisonItemGroups } from '../common/domain/itemComparisonGroups.js';
import { comparisonIds } from '../common/domain/comparisonIds.js';
import { readTraitLabels } from '../common/domain/studentIdentity.js';

/** The group's own value groups of items.json; the comparison groups stay out */
const GROUP_ITEMS = dataset('en.groupItems', {
    inputs: ['items.json'],
    build: ownItemGroups,
});

/** Every comparison population items.json carries, with its per-item means */
const ITEM_COMPARISON_GROUPS = dataset('en.itemComparisonGroups', {
    inputs: ['items.json'],
    build: comparisonItemGroups,
});

/** Group, school and state style averages, parsed from aggregations.json */
const STYLE_AVERAGES = dataset('en.styleAverages', {
    inputs: ['aggregations.json'],
    build: parseStyleAggregation,
});

/**
 * Every comparison population the dataset delivers, by id (`comparisonIds`): the
 * competence-level groups, the style groups and the item averages. A population only one
 * document carries still gets its toggle.
 */
const COMPARISON_IDS = dataset('en.comparisonIds', {
    inputs: ['competence-levels.json', STYLE_AVERAGES, ITEM_COMPARISON_GROUPS],
    build: (competenceLevels, styleAverages, itemGroups) =>
        comparisonIds(competenceLevels, styleAverages.comparisonGroups, itemGroups),
});

/** The data-derived vocabulary: domains, style categories, result types, cut scores */
const CONFIG = dataset('en.config', {
    inputs: [
        'students-competence-levels.json',
        'students-aggregations.json',
        'competence-levels.json',
    ],
    build: buildEnConfig,
});

/** One merged record per student */
const STUDENT_RECORDS = dataset('en.studentRecords', {
    inputs: ['students-competence-levels.json', 'students-aggregations.json', CONFIG],
    build: buildGroupStudentRecords,
});

/** The payload's label per trait code, over both person documents (identity comes from either) */
const TRAIT_LABELS = dataset('en.traitLabels', {
    inputs: ['students-competence-levels.json', 'students-aggregations.json'],
    build: (competenceLevels, aggregation) =>
        readTraitLabels([...competenceLevels, ...aggregation]),
});

/** The student records by `studentId`, which a sync payload names them by */
const STUDENT_RECORDS_BY_ID = dataset('en.studentRecordsById', {
    inputs: [STUDENT_RECORDS],
    build: (records) => indexBy(records, 'studentId'),
});

/** One enriched record per group item, its styles in priority order */
const ITEM_RECORDS = dataset('en.itemRecords', {
    inputs: [GROUP_ITEMS, 'students-aggregations.json', 'items-aggregations.json', CONFIG],
    build: (groupItems, studentAgg, itemAgg, config) =>
        buildItemArray(groupItems, studentAgg, itemAgg, config.styleCategories),
});

/** The item records by `iqbId`, which a sync payload names them by */
const ITEM_RECORDS_BY_ID = dataset('en.itemRecordsById', {
    inputs: [ITEM_RECORDS],
    build: (records) => indexBy(records, 'iqbId'),
});

/**
 * The derived EN datasets, by name, each key typed with what its builder returns. The
 * documents they read are named by file.
 */
export const EN_DATASETS = Object.freeze({
    GROUP_ITEMS,
    ITEM_COMPARISON_GROUPS,
    STYLE_AVERAGES,
    COMPARISON_IDS,
    CONFIG,
    STUDENT_RECORDS,
    STUDENT_RECORDS_BY_ID,
    TRAIT_LABELS,
    ITEM_RECORDS,
    ITEM_RECORDS_BY_ID,
});
