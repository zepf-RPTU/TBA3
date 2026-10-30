/**
 * The group-comparison chart's registry: per chart type (competenceLevel | points |
 * selfEfficacy | teachingQuality) its measure family, what its Fach/Domäne selector
 * picks, where its data comes from, which rows a selection draws and how they are
 * prepared. A type's traits are defined here and nowhere else.
 */

import { buildCompetenceLevelRows } from './competenceLevelRows.js';
import {
    buildSubjectDomainList,
    domainStudentRecords,
    extractLevelOrder,
    prepareCompetenceGroupData,
} from './groupComparisonCompetenceData.js';
import { filterPointData, preparePointGroupData } from './groupComparisonPointData.js';
import { rollup } from 'd3-array';
import {
    CATEGORY_FIELDS,
    CHART_TYPE_LABELS,
    prepareRatingGroupData,
} from './groupComparisonDataUtils.js';
import { dataset } from '../../../../common/data/documentStore.js';
import { SL_DATASETS } from '../../../slDatasets.js';
import { groupBooklets } from '../../../utils/slBooklets.js';
import { formatChartSubjectDomainLabel } from '../../../../common/charts/domainLabelFormatter.js';

/** @typedef {import('./groupComparisonDataUtils.js').SubjectDomainEntry} SubjectDomainEntry */
/** @typedef {import('./groupComparisonDataUtils.js').GroupComparisonChartData} GroupComparisonChartData */
/** @typedef {import('./groupComparisonDataUtils.js').CompetenceStudentRecord} CompetenceStudentRecord */
/** @typedef {import('./groupComparisonDataUtils.js').RatingRecord} RatingRecord */
/** @typedef {import('./groupComparisonDataUtils.js').PointRecord} PointRecord */

/**
 * What a chart type reads its rows out of: the Fach/Domäne list (`competenceLevel`) or per-student records.
 * @typedef {SubjectDomainEntry|RatingRecord|PointRecord} ComparisonSource
 */

/**
 * One row a selection draws: a student's level, points or rating, per chart type.
 * @typedef {CompetenceStudentRecord|RatingRecord|PointRecord} ComparisonRecord
 */

/**
 * The payloads the chart types read, plus the Fach/Domäne list `subjectIndex` indexes.
 * @typedef {object} GroupComparisonSources
 * @property {SubjectDomainEntry[]} subjectDomainList - `buildSubjectDomainList(domainResults)`, each entry with its domain results.
 * @property {import('./groupComparisonDataUtils.js').RatingRecord[]|null} comparisonSP - Per-student Selbstwirksamkeit means.
 * @property {import('./groupComparisonDataUtils.js').RatingRecord[]|null} comparisonTQ - Per-student Unterrichtsqualität means.
 * @property {import('./groupComparisonDataUtils.js').PointRecord[]|null} comparisonPoints
 */

/**
 * What the chart's controls have selected.
 * @typedef {object} GroupComparisonSelection
 * @property {'competenceLevel'|'points'|'selfEfficacy'|'teachingQuality'} chartType
 * @property {number} subjectIndex - Index into the Fach/Domäne list.
 * @property {'gender'|'group'|'subject'} category - What the two groups are split by.
 * @property {string|null} scopeFilter - A group to narrow to, or none.
 * @property {string|null} group1
 * @property {string|null} group2
 */

/**
 * One chart type's row in the registry:
 * - `family`: the measure family; the info box words its sentence per family.
 * - `subjectScope`: what the Fach/Domäne selector picks — a Fach/Domäne, a Fach, or nothing (a measure asked once per student has no Fach, so no Fach comparison either).
 * - `subjectGroup`: what one group of the Kategorie Fach is — a Fach/Domäne (`domain`: Kompetenzstufen sit on one ladder per Domäne, and a group may have sat only some of a Fach's Domänen), a whole Fach (`subject`), or nothing, as for `subjectScope`.
 * - `label`: its name in the Diagrammtyp selector.
 * - `source`: the payload it reads; empty or `null` when the dataset has none.
 * - `rows`: the rows a selection draws, before the scope group narrows them. Under the Kategorie Fach every Fach's (or Fach/Domäne's) rows, which the split then picks the two compared groups from.
 * - `prepare`: the rows split into the two groups and counted per pyramid row, against the app's palette.
 * - `noDataMessageKey`: the glossary key of the sentence shown when the payload is empty.
 *
 * `source`, `rows` and `prepare` are method signatures on purpose: each type reads and
 * returns its own record type, and only the registry key pairs a type's rows with its
 * `prepare` — a pairing the union of record types cannot state per key. A method
 * signature accepts an implementation typed for its own member of the union.
 * @typedef {{
 *     family: 'competence'|'points'|'rating',
 *     subjectScope: 'domain'|'subject'|'none',
 *     subjectGroup: 'domain'|'subject'|'none',
 *     label: string,
 *     source(sources: GroupComparisonSources): ComparisonSource[]|null,
 *     rows(source: ComparisonSource[], selection: GroupComparisonSelection, sources: GroupComparisonSources): ComparisonRecord[]|null,
 *     prepare(rows: ComparisonRecord[], selection: GroupComparisonSelection, sources: GroupComparisonSources, palette: import('../../../../common/services/competenceLevelPalette.js').CompetenceLevelPalette): GroupComparisonChartData,
 *     noDataMessageKey: string,
 * }} GroupComparisonChartType
 */

/**
 * The selected Fach/Domäne's `{subjectName, domainId}`, as the point filter reads it.
 * @param {GroupComparisonSelection} selection
 * @param {GroupComparisonSources} sources - The Fach/Domäne list.
 * @returns {import('./groupComparisonDataUtils.js').SubjectDomainSelector}
 */
function selectedSubjectDomain(selection, sources) {
    const entry = sources.subjectDomainList[selection.subjectIndex];
    return { subjectName: entry?.subjectName, domainId: entry?.domainId ?? null };
}

/**
 * One registry row per chart type, in the Diagrammtyp selector's order.
 * @type {Readonly<Record<GroupComparisonSelection['chartType'], GroupComparisonChartType>>}
 */
export const CHART_TYPE_CONFIG = Object.freeze({
    competenceLevel: {
        family: 'competence',
        subjectScope: 'domain',
        subjectGroup: 'domain',
        label: CHART_TYPE_LABELS.competenceLevel,
        source: (sources) => sources.subjectDomainList,
        rows: (/** @type {SubjectDomainEntry[]} */ subjectDomainList, selection) =>
            selection.category === 'subject'
                ? subjectDomainList.flatMap(domainStudentRecords)
                : domainStudentRecords(subjectDomainList[selection.subjectIndex]),
        // The level rows: the selected Fach/Domäne's ladder, or under the Kategorie
        // "Fach" both compared Fach/Domänen's ladders aligned level by level.
        prepare(/** @type {CompetenceStudentRecord[]} */ rows, selection, sources, palette) {
            const { category, group1, group2, subjectIndex } = selection;
            const entries =
                category === 'subject'
                    ? [group1, group2].map((key) =>
                          sources.subjectDomainList.find((entry) => entry.key === key),
                      )
                    : [sources.subjectDomainList[subjectIndex]];
            const levelRows = buildCompetenceLevelRows(
                palette,
                entries.map((entry) => extractLevelOrder(entry) ?? { order: [] }),
            );
            return prepareCompetenceGroupData(
                palette,
                rows,
                category,
                group1,
                group2,
                levelRows,
                groupLabelOf(sources, selection),
            );
        },
        noDataMessageKey: 'general.messages.no-data',
    },
    points: {
        family: 'points',
        subjectScope: 'domain',
        subjectGroup: 'subject',
        label: CHART_TYPE_LABELS.points,
        source: (sources) => sources.comparisonPoints,
        // A Fach comparison sums each student's Domänen per Fach first.
        rows: (/** @type {PointRecord[]} */ points, selection, sources) =>
            selection.category === 'subject'
                ? filterPointData(points, null, { aggregateBySubject: true })
                : filterPointData(points, selectedSubjectDomain(selection, sources)),
        prepare: (/** @type {PointRecord[]} */ rows, { category, group1, group2 }) =>
            preparePointGroupData(rows, category, group1, group2),
        noDataMessageKey: 'sl.comparison.comparison-plot.messages.no-success-rates',
    },
    selfEfficacy: {
        family: 'rating',
        subjectScope: 'none',
        subjectGroup: 'none',
        label: CHART_TYPE_LABELS.selfEfficacy,
        source: (sources) => sources.comparisonSP,
        rows: (/** @type {RatingRecord[]} */ ratings) => ratings,
        prepare: (/** @type {RatingRecord[]} */ rows, { category, group1, group2 }) =>
            prepareRatingGroupData(rows, category, group1, group2, CHART_TYPE_LABELS.selfEfficacy),
        noDataMessageKey: 'sl.comparison.comparison-plot.messages.no-self-efficacy',
    },
    teachingQuality: {
        family: 'rating',
        subjectScope: 'subject',
        subjectGroup: 'subject',
        label: CHART_TYPE_LABELS.teachingQuality,
        source: (sources) => sources.comparisonTQ,
        rows: (/** @type {RatingRecord[]} */ ratings, selection, sources) => {
            if (selection.category === 'subject') return ratings;
            const { subjectName } = selectedSubjectDomain(selection, sources);
            return ratings.filter((rating) => rating.subject === subjectName);
        },
        prepare: (/** @type {RatingRecord[]} */ rows, { category, group1, group2 }) =>
            prepareRatingGroupData(
                rows,
                category,
                group1,
                group2,
                CHART_TYPE_LABELS.teachingQuality,
            ),
        noDataMessageKey: 'sl.comparison.comparison-plot.messages.no-teaching-quality',
    },
});

/**
 * How a selection's group values read: a Fach/Domäne group of the Kategorie Fach
 * (`subjectGroup: 'domain'`), keyed by its entry's `key`, as `Fach: Domäne` (the Fach
 * alone without a Domäne); any other value as its Kategorie says (`CATEGORY_FIELDS`).
 * @param {GroupComparisonSources} sources - The Fach/Domäne list.
 * @param {Pick<GroupComparisonSelection, 'chartType'|'category'>} selection
 * @returns {(value: string) => string}
 */
export function groupLabelOf(sources, { chartType, category }) {
    if (category !== 'subject' || CHART_TYPE_CONFIG[chartType].subjectGroup !== 'domain') {
        return CATEGORY_FIELDS[category].label;
    }
    const labels = new Map(
        sources.subjectDomainList.map((entry) => [
            entry.key,
            formatChartSubjectDomainLabel(entry.subjectName, entry.domainName, {
                abbreviate: false,
            }),
        ]),
    );
    return (key) => labels.get(key) ?? key;
}

/**
 * The value a Fach/Domäne entry has among the Kategorie Fach's groups: its own `key`
 * where a group is a Fach/Domäne, its Fach otherwise.
 * @param {SubjectDomainEntry} entry
 * @param {GroupComparisonSelection['chartType']} chartType
 * @returns {string}
 */
export function subjectGroupOf(entry, chartType) {
    return CHART_TYPE_CONFIG[chartType].subjectGroup === 'domain' ? entry.key : entry.subjectName;
}

/**
 * The rows a selection draws: the chart type's rows, narrowed to the scope group. The
 * chart draws these rows, the info box summarises them and the selectors offer the
 * values in them, so all three read this one function.
 * @param {GroupComparisonSources} sources
 * @param {GroupComparisonSelection} selection
 * @returns {ComparisonRecord[]|null} The rows, or `null` when the selection has nothing to draw.
 */
function selectComparisonRows(sources, selection) {
    const config = CHART_TYPE_CONFIG[selection.chartType];
    const source = config.source(sources);
    if (!source?.length) return null;
    const rows = (config.rows(source, selection, sources) ?? []).filter(
        (row) => !selection.scopeFilter || row.groupName === selection.scopeFilter,
    );
    return rows.length ? rows : null;
}

/** The payloads of one store, read once: the Fach/Domäne list is grouped a single time */
export const COMPARISON_SOURCES = dataset('sl.groupComparisonSources', {
    inputs: [
        SL_DATASETS.DOMAIN_RESULTS,
        SL_DATASETS.COMPARISON_SELF_EFFICACY,
        SL_DATASETS.COMPARISON_TEACHING_QUALITY,
        SL_DATASETS.COMPARISON_POINTS,
    ],
    build: (
        domainResults,
        comparisonSP,
        comparisonTQ,
        comparisonPoints,
    ) => /** @type {GroupComparisonSources} */ ({
        subjectDomainList: buildSubjectDomainList(domainResults ?? []),
        comparisonSP,
        comparisonTQ,
        comparisonPoints,
    }),
});

/**
 * The rows a selection draws (`selectComparisonRows`), once per store and selection, so
 * every reader of a selection gets the same rows. The groups do not enter the key: under the
 * Kategorie Fach the rows are every Fach's, and the split picks the pair.
 */
export const COMPARISON_ROWS = dataset('sl.groupComparisonRows', {
    inputs: [COMPARISON_SOURCES],
    params: (/** @type {GroupComparisonSelection} */ selection) => [
        selection.chartType,
        selection.subjectIndex,
        selection.category,
        selection.scopeFilter,
    ],
    build: (sources, _context, selection) => selectComparisonRows(sources, selection),
});

/**
 * Whether the selection's pair, drawn as Lösungsquoten, would set rates of different
 * booklets side by side, once per store and selection, so every reader of a selection
 * gets the same verdict. The rule works per rate, since two Fächer always
 * have two booklets: a rate is mixed when the groups its rows come from name two or
 * more booklets between them where it was sat, in the selected Fach/Domäne, or under the
 * Kategorie Fach, whose rows pool a student's Domänen, in the whole Fach. Unlike
 * `COMPARISON_ROWS`, the groups enter the key: the rows are the same for every pair, the
 * verdict is not. Read with the selection, whatever its measure.
 */
export const POINTS_MIXED_BOOKLETS = dataset('sl.groupComparisonMixedBooklets', {
    inputs: [COMPARISON_ROWS, COMPARISON_SOURCES, SL_DATASETS.COMPETENCE_LEVEL_INDEX],
    params: (/** @type {GroupComparisonSelection} */ selection) => [
        selection.subjectIndex,
        selection.category,
        selection.scopeFilter,
        selection.group1,
        selection.group2,
    ],
    build: (rowsOf, sources, index, _context, selection) => {
        const { category, group1, group2 } = selection;
        const rows = /** @type {PointRecord[]|null} */ (
            rowsOf({ ...selection, chartType: 'points' })
        );
        // Groups stay unset only when fewer than two are there: no pair, nothing mixed.
        if (!rows || !group1 || !group2) return false;
        const { field } = CATEGORY_FIELDS[category];
        const pair = rows.filter((row) => row[field] === group1 || row[field] === group2);
        const domainId =
            category === 'subject' ? null : selectedSubjectDomain(selection, sources).domainId;
        const groupsBySubject = rollup(
            pair,
            (records) => new Set(records.map((record) => record.groupName)),
            (record) => record.subject,
        );
        return [...groupsBySubject].some(
            ([subject, groupNames]) =>
                new Set(
                    [...groupNames].flatMap((groupName) =>
                        groupBooklets(index, groupName, subject, domainId),
                    ),
                ).size > 1,
        );
    },
});
