/**
 * EN Student Data Adapter — Merges competence-level and style-aggregation
 * JSON data into flat student records for the EN class table.
 *
 * Produces records consumed by classTableModule's #transformStudentData()
 * and the scatterplot filter module.
 */

import { AGG_TYPE_RESULT } from '../enConstants.js';
import { AGG_TYPE_STYLE } from '@tba3/modules/en-domain';
import {
    extractTraits,
    GENDER_MAP,
    RESULT_CORRECT,
    RESULT_VALUES,
    toPercent,
} from '@tba3/modules/domain';

/**
 * One domain's Ergebnis frequencies, keyed by what they count. A bucket the payload
 * omits is absent; `total` is `null` when no bucket carries one.
 * @typedef {object} DomainResultCounts
 * @property {number|null} total - The payload's own denominator, shared by every bucket
 * @property {number} [correct] - Items scored `Richtig`
 * @property {number} [incorrect] - Items scored `Falsch`
 * @property {number} [notAttempted] - Items left `Unbearbeitet`
 */

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Build flat student records from 2 JSON API sources for the class table.
 *
 * Each output record contains:
 * - Identity: studentId (student id), firstName, lastName
 * - Gender: gender ('m'/'w'/'d')
 * - Trait flags: traits (Set of identifiers, e.g. 'kw', 'f', 's')
 * - Domain-keyed fields via enConfig.fieldName: {dataKey}CompLevel, {dataKey}SummedResult,
 *   {dataKey}Percentage (dataKey derived from subject.id + domain.id at runtime)
 * - Result counts: {prefix}ResultCounts, a {@link DomainResultCounts} read by value
 *   (prefix = domain.id at runtime)
 * - Style data: ho { globalPercent, detailliertPercent, selektivPercent },
 *   le { ... } — a category without a finite mean stays absent, never 0
 *
 * Pure transform: reads domain config from the injected {@link EnConfig} (via
 * enConfig.fieldName / enConfig.domainFieldPrefix) but does not mutate it.
 * @param {Array} competenceLevelsData - students_competence-levels.json
 * @param {Array} styleAggregationData - students_aggregation.json
 * @param {import('../enConfig.js').EnConfig} enConfig - Domain/field config
 * @returns {Array<object>} Flat student records (one per student, both domains merged)
 */
export function buildClassStudentRecords(competenceLevelsData, styleAggregationData, enConfig) {
    const studentMap = new Map();

    // Pass 1: Extract GER competence levels per student + domain
    for (const entry of competenceLevelsData) {
        const domainId = entry.domain?.id;
        if (!domainId) continue;

        if (!studentMap.has(entry.id)) {
            studentMap.set(entry.id, createBaseRecord(entry));
        }
        const student = studentMap.get(entry.id);

        const dataKey = enConfig.fieldName(domainId, '');
        if (!dataKey) continue;
        student[`${dataKey}CompLevel`] = entry.competenceLevels?.[0]?.nameShort ?? 'N/A';
    }

    // Pass 2: Extract style percentages + Ergebnis counts per student + domain
    for (const entry of styleAggregationData) {
        const domainId = entry.domain?.id;
        if (!domainId) continue;

        if (!studentMap.has(entry.id)) {
            studentMap.set(entry.id, createBaseRecord(entry));
        }
        const student = studentMap.get(entry.id);

        const dataKey = enConfig.fieldName(domainId, ''); // e.g. 'en-ho' or 'en-le' (from registered config)
        if (!dataKey) continue;
        const prefix = enConfig.domainFieldPrefix(domainId); // e.g. 'ho' or 'le' (from domain.id)

        // Style aggregations → domain sub-object keyed by domain.id (e.g. student.ho, student.le).
        // A category whose mean the payload does not carry stays absent rather than reading 0.
        const styleDomain = {};
        for (const agg of entry.aggregations ?? []) {
            if (agg.type !== AGG_TYPE_STYLE) continue;
            const mean = agg.descriptiveStatistics?.mean;
            if (Number.isFinite(mean)) styleDomain[`${agg.value}Percent`] = toPercent(mean);
        }
        student[domainId] = styleDomain;

        // Result aggregations → counts keyed by what they count + domain-keyed summed results
        const resultAggs = entry.aggregations?.filter((a) => a.type === AGG_TYPE_RESULT) ?? [];
        student[`${prefix}ResultCounts`] = readResultCounts(resultAggs);

        // The solved share → SummedResult + Percentage. Without a `Richtig` aggregation
        // carrying a mean both stay absent, and the scatterplot leaves the student out —
        // a share the payload did not state must never read as a measured 0 %.
        const correctStats = resultAggs.find(
            (agg) => agg.value === RESULT_CORRECT,
        )?.descriptiveStatistics;
        if (Number.isFinite(correctStats?.mean)) {
            student[`${dataKey}SummedResult`] = correctStats.frequency ?? 0;
            student[`${dataKey}Percentage`] = `${toPercent(correctStats.mean).toFixed(1)}%`;
        }
    }

    return Array.from(studentMap.values());
}

/**
 * Read one domain's Ergebnis frequencies by value: the spec fixes no order of
 * `aggregations[]`, so a bucket the payload omits must neither shift the others nor
 * read 0. The buckets share one `total` (the domain's items), so any of them carries it.
 * @param {Array<object>} resultAggs - The entry's `Ergebnis` aggregations.
 * @returns {DomainResultCounts} The counts the payload delivered.
 */
function readResultCounts(resultAggs) {
    /** @type {DomainResultCounts} */
    const counts = { total: null };
    for (const agg of resultAggs) {
        const { frequency, total } = agg.descriptiveStatistics ?? {};
        if (Number.isFinite(total)) counts.total = Math.max(counts.total ?? 0, total);
        if (!Number.isFinite(frequency)) continue;

        switch (RESULT_VALUES[agg.value]) {
            case 1:
                counts.correct = frequency;
                break;
            case 0:
                counts.incorrect = frequency;
                break;
            case -1:
                counts.notAttempted = frequency;
                break;
            default:
                break;
        }
    }
    return counts;
}

/**
 * Create a base student record from any API entry (competence-level or style-aggregation).
 * Extracts identity, gender, and trait covariates.
 * @param {object} entry - API entry with id, properties, covariates
 * @returns {object} Base student record
 */
function createBaseRecord(entry) {
    const covariates = entry.covariates ?? [];
    const props = entry.properties ?? [];
    const gender = covariates.find((c) => c.type === 'gender');

    return {
        studentId: entry.id,
        firstName: props.find((p) => p.key === 'firstName')?.value ?? '',
        lastName: props.find((p) => p.key === 'lastName')?.value ?? '',
        gender: GENDER_MAP[gender?.value] ?? '',
        traits: extractTraits(covariates),
    };
}
