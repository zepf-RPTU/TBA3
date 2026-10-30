/**
 * Lösungsquote data for the GroupComparisonChart: filter the per-student point records
 * (`SL_DATASETS.COMPARISON_POINTS`) and count each group's students per
 * 10-point bucket.
 */

import { bin as binGenerator, range } from 'd3-array';
import { sumPointsByKey } from '../../../utils/slResultsDerivation.js';
import { formatDecimal, formatPercent } from '../../../../common/utils/numberFormat.js';
import {
    EMPTY_COMPARISON,
    buildComparisonData,
    filterByCategory,
} from './groupComparisonDataUtils.js';
import { TERM_CONSTANTS } from '../../../../common/domain/terms.js';

/** @typedef {import('./groupComparisonDataUtils.js').SubjectDomainSelector} SubjectDomainSelector */
/** @typedef {import('./groupComparisonDataUtils.js').PointRecord} PointRecord */
/** @typedef {import('./groupComparisonDataUtils.js').GroupComparisonChartData} GroupComparisonChartData */
/** @typedef {import('./groupComparisonChartTypes.js').GroupComparisonSelection} GroupComparisonSelection */

/**
 * The ten 10-point Lösungsquote bins. Only the top bin is closed, so 100 % lands in
 * 90–100 % rather than in a bin of its own.
 */
const binPoints = binGenerator()
    .domain([0, 100])
    .thresholds(range(10, 100, 10));

/**
 * Whether a record belongs to the selected Fach and Domäne. A selection without a Domäne
 * is a Fach whose competence levels have none (Mathematik); its results still come per
 * Leitidee, so every record of the Fach belongs to it.
 * @param {PointRecord} entry
 * @param {SubjectDomainSelector|null} [selector] - Without a subject everything matches.
 * @returns {boolean}
 */
function matchesSubjectDomain(entry, selector = null) {
    if (!selector?.subjectName) {
        return true;
    }

    return (
        entry?.subject === selector.subjectName &&
        (selector.domainId == null || entry?.domainId === selector.domainId)
    );
}

/**
 * Collapse a student's per-Domäne records into one record per Fach (`sumPointsByKey`).
 * @param {PointRecord[]} records - Point records, one per student and Domäne.
 * @returns {PointRecord[]} One record per student and Fach.
 */
function aggregatePointDataBySubject(records) {
    return sumPointsByKey(
        records,
        (record) => `${record.studentId}|${record.groupName}|${record.subject}`,
        (record) => ({
            studentId: record.studentId,
            gender: record.gender,
            groupName: record.groupName,
            subject: record.subject,
            domainId: null,
            domainName: null,
        }),
    );
}

/**
 * Filters raw point-score records for the selected subject/domain.
 * @param {PointRecord[]|null} dataArray
 * @param {SubjectDomainSelector|null} [selector=null]
 * @param {{aggregateBySubject?: boolean}} [options={}] - `aggregateBySubject` sums each student's Domänen per Fach, for a Fach comparison.
 * @returns {PointRecord[]}
 */
export function filterPointData(dataArray, selector = null, { aggregateBySubject = false } = {}) {
    if (!dataArray || dataArray.length === 0) {
        return [];
    }

    const filtered = dataArray.filter((entry) => matchesSubjectDomain(entry, selector));
    // A whole-Fach selection sums each student's Leitidee records into one, so a student
    // counts once.
    const wholeSubject = Boolean(selector?.subjectName) && selector?.domainId == null;

    return aggregateBySubject || wholeSubject ? aggregatePointDataBySubject(filtered) : filtered;
}

/**
 * Each group's students counted per 10-point Lösungsquote bucket, the highest on top.
 * @param {PointRecord[]} data
 * @param {GroupComparisonSelection['category']} category
 * @param {string|null} group1Value
 * @param {string|null} group2Value
 * @returns {GroupComparisonChartData}
 */
export function preparePointGroupData(data, category, group1Value, group2Value) {
    const split = filterByCategory(data, category, group1Value, group2Value);
    if (!split) return EMPTY_COMPARISON;
    /**
     * @param {PointRecord[]} records
     * @returns {import('d3-array').Bin<number, number>[]} Its Lösungsquoten binned, the highest bin first.
     */
    const binsOf = (records) =>
        binPoints(records.map((record) => record.solutionRatePercent)).reverse();
    const bins = split.map((side) => binsOf(side.records));
    // With nothing to bucket the chart draws no axis at all, rather than one of empty buckets.
    if (!bins.flat().some((bin) => bin.length > 0)) return EMPTY_COMPARISON;

    const keyOf = (/** @type {import('d3-array').Bin<number, number>} */ bin) =>
        `${bin.x0}-${bin.x1}`;
    return buildComparisonData(
        TERM_CONSTANTS.SOLUTION_RATE,
        split,
        // A range a reader can say: `90–100 %`.
        bins[0].map((bin) => ({
            key: keyOf(bin),
            labels: [`${formatDecimal(bin.x0 ?? 0, 0)}\u2013${formatPercent(bin.x1 ?? 0, 0)}`],
        })),
        (_records, groupIndex) =>
            bins[groupIndex].map((bin) => [{ key: keyOf(bin), count: bin.length, paint: {} }]),
    );
}
