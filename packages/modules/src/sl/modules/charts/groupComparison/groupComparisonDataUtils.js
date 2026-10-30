/**
 * Shared core of the GroupComparisonChart data: the record and chart-data typedefs, the
 * display labels, the rating preparation and `filterByCategory`, the one split into the
 * two compared groups, so a drawn chart and any prose about it count the same students.
 */

import {
    RATING_CATEGORIES,
    calculateRatingDistribution,
    formatRatingCategoryLabel,
} from '../../../utils/slRatingDistribution.js';
import { sum } from 'd3-array';
import { buildRatingBuckets } from '../../../utils/slRatingAppearance.js';
import { genderLabel } from '../../../../common/domain/apiValueMaps.js';
import { percentOf } from '../../../../common/domain/itemResultCounts.js';
import { TERM_CONSTANTS } from '../../../../common/domain/terms.js';

/**
 * Subject + domain selector used throughout the group-comparison feature.
 * @typedef {object} SubjectDomainSelector
 * @property {string} subjectName
 * @property {string|null} domainId - Null for the whole subject.
 */

/** @typedef {import('../../../utils/slStudentStats.js').SlDomainResult} SlDomainResult */
/** @typedef {import('./groupComparisonChartTypes.js').GroupComparisonSelection} GroupComparisonSelection */

/**
 * One Fach/Domäne the selector offers, with its own domain results. `key` is its
 * `subjectDomainKey`, the value a Kompetenzstufen group of the Kategorie Fach takes.
 * @typedef {{key: string, subjectName: string, domainId: string|null, domainName: string|null|undefined, results: SlDomainResult[]}} SubjectDomainEntry
 */

/**
 * One student in a competence comparison.
 * @typedef {object} CompetenceStudentRecord
 * @property {string} studentId
 * @property {string|null} gender
 * @property {string} groupName - The group's name (Lerngruppe), never the Stammklasse.
 * @property {string|null} competenceLevelName - The level reached; `null` without one.
 * @property {string|undefined} competenceScaleId - The ladder the level belongs to.
 * @property {string} subject - The Fach/Domäne the level was reached in, as its entry's `key`: what the Kategorie Fach splits Kompetenzstufen by, since each Domäne has its own ladder.
 */

/**
 * One student's survey mean in a rating comparison.
 * @typedef {object} RatingRecord
 * @property {string} studentId
 * @property {string|null} gender
 * @property {string} groupName
 * @property {number} mean - The student's mean on the 1–5 scale.
 * @property {string|null} subject - The Fach, `null` for a measure asked once per student.
 */

/**
 * One student's points in one Fach and Domäne.
 * @typedef {object} PointRecord
 * @property {string} studentId
 * @property {string|null} gender
 * @property {string} groupName
 * @property {string} subject - The Fach name.
 * @property {string|null} domainId - The Domäne id, `null` once aggregated per Fach.
 * @property {string|null} domainName - The Domäne's display name.
 * @property {number} rawPoints - Points scored.
 * @property {number} maxPoints - Points available.
 * @property {number} solutionRatePercent - The Lösungsquote in percent (0–100).
 */

/**
 * One of the two groups of a comparison.
 * @template TRecord
 * @typedef {object} GroupSide
 * @property {TRecord[]} records
 * @property {string} label
 */

/**
 * One segment of a group's row: a competence level, or the whole row for a point or
 * rating bucket. `paint` names what colours it — `{level, scaleId}` a competence level,
 * `{ratingKey}` a rating band, `{}` the Lösungsquote hue both wings share — resolved at draw time so a
 * theme switch repaints it.
 * @typedef {object} ComparisonSegment
 * @property {string} key - Unique within its row.
 * @property {number} count - Students in the segment.
 * @property {number} share - Their share of the group, in percent.
 * @property {{level?: string, scaleId?: string, ratingKey?: string}} paint
 */

/**
 * @typedef {Omit<ComparisonSegment, 'share'>} SegmentCount
 */

/**
 * One row of the pyramid: a Kompetenzstufe band, a Lösungsquote bucket or a rating band.
 * @typedef {object} ComparisonRow
 * @property {string} key - The row's key, stable across a group swap.
 * @property {string[]} labels - One label, or one per group when their ladders name the row differently.
 */

/**
 * One group's wing: its headcount and, per row, its segments.
 * @typedef {object} ComparisonGroup
 * @property {'group1'|'group2'} key - Its wing, group 1 left.
 * @property {string} label - Its display name.
 * @property {number} count - Students in the group.
 * @property {Array<{share: number|null, count: number, segments: ComparisonSegment[]}>} rows - Per row of `rows`: its share of the group (`null` for a group without members), its headcount and its segments.
 */

/**
 * What the pyramid draws, for every chart type. No rows means nothing to compare.
 * @typedef {object} GroupComparisonChartData
 * @property {string} measureLabel - What a row measures, as its tooltip names it.
 * @property {ComparisonRow[]} rows - The rows, top first.
 * @property {ComparisonGroup[]} groups - Group 1, then group 2; empty with the rows.
 */

export const EMPTY_COMPARISON = Object.freeze({ measureLabel: '', rows: [], groups: [] });

/**
 * German display name per chart type: the Diagrammtyp option, and a rating row's
 * measure label.
 * @type {Readonly<Record<string, string>>}
 */
export const CHART_TYPE_LABELS = Object.freeze({
    competenceLevel: TERM_CONSTANTS.COMP_LEVELS,
    points: TERM_CONSTANTS.SOLUTION_RATE,
    selfEfficacy: TERM_CONSTANTS.SELF_EFFICACY,
    teachingQuality: TERM_CONSTANTS.TEACHING_QUALITY,
});

/**
 * The comparison of two groups over `rows`: each group's segments per row, as shares of
 * the group.
 * @template TRecord
 * @param {string} measureLabel - What a row measures.
 * @param {[GroupSide<TRecord>, GroupSide<TRecord>]} split
 * @param {ComparisonRow[]} rows - The rows, top first.
 * @param {(records: TRecord[], groupIndex: number) => SegmentCount[][]} countRows - One group's segments per row, aligned with `rows`.
 * @returns {GroupComparisonChartData}
 */
export function buildComparisonData(measureLabel, split, rows, countRows) {
    return {
        measureLabel,
        rows,
        groups: split.map(({ records, label }, index) => {
            const total = records.length;
            return {
                key: index === 0 ? 'group1' : 'group2',
                label,
                count: total,
                rows: countRows(records, index).map((segments) => {
                    const count = sum(segments, (segment) => segment.count);
                    return {
                        share: percentOf(count, total),
                        count,
                        segments: segments.map((segment) => ({
                            ...segment,
                            share: percentOf(segment.count, total) ?? 0,
                        })),
                    };
                }),
            };
        }),
    };
}

/**
 * Rating pyramid data (Selbstwirksamkeit, Unterrichtsqualität): each group's students
 * counted per rating band, the best band on top.
 * @param {RatingRecord[]} data
 * @param {GroupComparisonSelection['category']} category
 * @param {string|null} group1Value
 * @param {string|null} group2Value
 * @param {string} measureLabel
 * @returns {GroupComparisonChartData} One row per band.
 */
export function prepareRatingGroupData(data, category, group1Value, group2Value, measureLabel) {
    const split = filterByCategory(data, category, group1Value, group2Value);
    if (!split) return EMPTY_COMPARISON;

    const rows = [...RATING_CATEGORIES]
        .reverse()
        .map((band) => ({ key: band.key, labels: [formatRatingCategoryLabel(band)] }));
    return buildComparisonData(measureLabel, split, rows, (records) =>
        buildRatingBuckets(calculateRatingDistribution(records.map((record) => record.mean)), {
            reverse: true,
        }).map((bucket) => [
            { key: bucket.key, count: bucket.count, paint: { ratingKey: bucket.key } },
        ]),
    );
}

/**
 * The field each Kategorie splits the records by, and how a value of it reads.
 * @type {Readonly<Record<string, {field: 'gender'|'groupName'|'subject', label: (value: string) => string}>>}
 */
export const CATEGORY_FIELDS = Object.freeze({
    gender: { field: 'gender', label: genderLabel },
    group: { field: 'groupName', label: (value) => value },
    subject: { field: 'subject', label: (value) => value },
});

/**
 * The two groups of a comparison, split by the Kategorie's field (`CATEGORY_FIELDS`).
 *
 * With both values given the split is exact, and named even when the records are empty.
 * Otherwise the first two distinct values in the data stand in, and fewer than two means
 * there is nothing to compare. A side is named by `labelOf`, the Kategorie's own label
 * unless the selection names its values otherwise (`groupLabelOf`).
 * @template {{gender?: string|null, groupName?: string|null, subject?: string|null}} TRecord
 * @param {TRecord[]|null} data - The records to split; none reads as empty.
 * @param {GroupComparisonSelection['category']} category
 * @param {string|null} group1Value
 * @param {string|null} group2Value
 * @param {(value: string) => string} [labelOf] - How a value reads.
 * @returns {[GroupSide<TRecord>, GroupSide<TRecord>]|null} Both groups with their labels, or `null` when a value has to be picked and fewer than two are there to pick from.
 */
export function filterByCategory(
    data,
    category,
    group1Value,
    group2Value,
    labelOf = CATEGORY_FIELDS[category].label,
) {
    const records = data ?? [];
    const { field } = CATEGORY_FIELDS[category];
    let value1 = group1Value;
    let value2 = group2Value;
    if (!value1 || !value2) {
        // The filter drops every empty value, which it cannot say as a type.
        const values = /** @type {string[]} */ ([
            ...new Set(records.map((item) => item[field]).filter(Boolean)),
        ]);
        if (values.length < 2) {
            console.warn(`[groupComparisonDataUtils] Not enough ${field} values to compare`);
            return null;
        }
        [value1, value2] = values;
    }

    /**
     * @param {string} value - The group's value of the field.
     * @returns {GroupSide<TRecord>}
     */
    const side = (value) => ({
        records: records.filter((item) => item[field] === value),
        label: labelOf(value),
    });
    return [side(value1), side(value2)];
}
