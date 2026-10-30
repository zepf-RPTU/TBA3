/**
 * MA dataset catalog — the one authoritative definition of every derived MA dataset: its
 * key, the documents or datasets it reads, and the builder that produces it. Cards name
 * these keys in their `documents` and read them with `getDataset`.
 */

import { dataset } from '../common/data/documentStore.js';
import {
    buildStudentRecords,
    buildStudentRecordsByDomain,
    buildStudentItemRowsByStudent,
} from './utils/maStudentDataAdapter.js';
import { buildItemArray } from './utils/maItemDataAdapter.js';
import { buildItemPools } from './utils/maItemPools.js';
import { getItemRingSets } from './utils/maItemRings.js';
import { deriveCompetenceGroupings } from './utils/maCompetenceGroupings.js';
import { resolveGroupCompetenceLevelThresholds } from './utils/maGroupCompetenceLevelThresholds.js';
import { ownItemGroups, comparisonItemGroups } from '../common/domain/itemComparisonGroups.js';
import { comparisonIds } from '../common/domain/comparisonIds.js';
import { readTraitLabels } from '../common/domain/studentIdentity.js';

/** The group's own value groups of items.json, one per Leitidee */
const GROUP_ITEMS = dataset('ma.groupItems', {
    inputs: ['items.json'],
    build: ownItemGroups,
});

/** Every comparison population items.json carries, with its per-item means, in payload order */
const ITEM_COMPARISON_GROUPS = dataset('ma.itemComparisonGroups', {
    inputs: ['items.json'],
    build: comparisonItemGroups,
});

/**
 * Every comparison population the dataset delivers, by id (`comparisonIds`): the
 * competence-level groups and the item averages.
 */
const COMPARISON_IDS = dataset('ma.comparisonIds', {
    inputs: ['competence-levels.json', ITEM_COMPARISON_GROUPS],
    build: (competenceLevels, itemGroups) => comparisonIds(competenceLevels, itemGroups),
});

/** The competence types the items carry, each with its values: the groupings besides the Leitidee */
const COMPETENCE_GROUPINGS = dataset('ma.competenceGroupings', {
    inputs: [GROUP_ITEMS],
    build: deriveCompetenceGroupings,
});

/** One enriched record per item */
const ITEM_RECORDS = dataset('ma.itemRecords', {
    inputs: [
        GROUP_ITEMS,
        'students-aggregations.json',
        'items-aggregations.json',
        COMPETENCE_GROUPINGS,
    ],
    build: buildItemArray,
});

/** One record per student, whole booklet */
const STUDENT_RECORDS = dataset('ma.studentRecords', {
    inputs: ['students-competence-levels.json', 'students-aggregations.json'],
    build: buildStudentRecords,
});

/** The payload's label per trait code, from the person document identity comes from */
const TRAIT_LABELS = dataset('ma.traitLabels', {
    inputs: ['students-competence-levels.json'],
    build: readTraitLabels,
});

/** Per student id, one row per item the student sat */
const STUDENT_ITEM_ROWS = dataset('ma.studentItemRows', {
    inputs: [ITEM_RECORDS, COMPETENCE_GROUPINGS],
    build: buildStudentItemRowsByStudent,
});

/** The Leitideen the booklet declares, in payload order: `{ domain, domainLabel }` per Leitidee */
const DOMAINS = dataset('ma.domains', {
    inputs: [GROUP_ITEMS],
    build: (groupItems) =>
        groupItems.map(({ domain }) => ({ domain: domain.id, domainLabel: domain.name })),
});

/** Per Leitidee id, the student records scoped to that Leitidee's item pool */
const STUDENT_RECORDS_BY_DOMAIN = dataset('ma.studentRecordsByDomain', {
    inputs: [STUDENT_RECORDS, 'students-aggregations.json', DOMAINS],
    build: buildStudentRecordsByDomain,
});

/**
 * The item-ring grid's rings: "Gesamt", and per grouping its own: by Leitidee one per
 * declared Leitidee, the empty ones flagged; by each competence type one per value
 */
const ITEM_RINGS = dataset('ma.itemRings', {
    inputs: [DOMAINS, COMPETENCE_GROUPINGS, ITEM_RECORDS],
    build: getItemRingSets,
});

/** Gesamt, then one item pool per Leitidee with items */
const ITEM_POOLS = dataset('ma.itemPools', {
    inputs: [ITEM_RINGS],
    build: buildItemPools,
});

/**
 * Group-level cut scores off the group's own value group, or null: a booklet-level fact,
 * resolved once so nothing pool-scoped ever feeds it.
 */
const GROUP_COMPETENCE_LEVEL_THRESHOLDS = dataset('ma.groupCompetenceLevelThresholds', {
    inputs: ['competence-levels.json'],
    build: resolveGroupCompetenceLevelThresholds,
});

/** The derived MA datasets, by name. The documents they read are named by file. */
export const MA_DATASETS = Object.freeze({
    GROUP_ITEMS,
    ITEM_COMPARISON_GROUPS,
    COMPARISON_IDS,
    COMPETENCE_GROUPINGS,
    ITEM_RECORDS,
    STUDENT_RECORDS,
    TRAIT_LABELS,
    STUDENT_RECORDS_BY_DOMAIN,
    STUDENT_ITEM_ROWS,
    DOMAINS,
    ITEM_POOLS,
    ITEM_RINGS,
    GROUP_COMPETENCE_LEVEL_THRESHOLDS,
});
