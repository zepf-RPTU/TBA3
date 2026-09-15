/**
 * Data utilities for Group Comparison Chart
 *
 * Filtering and preparation for the GroupComparisonChart: narrow the payload to the
 * selected Fach/Domäne, split it into the two compared groups, and shape each side
 * into the rows the pyramid draws.
 *
 * The German prose the info box reads is `groupComparisonSummary.js`. It imports
 * `filterByCategory` and `getPointMetric` from here rather than repeating them, so the
 * group split has one definition and the narrative describes the drawn chart.
 * @module groupComparisonDataUtils
 */

import { buildCompetencyLevelRows } from './competencyLevelRows.js';
import {
    RATING_CATEGORIES,
    buildRatingBuckets,
    getRatingCategoryDescription,
} from '../../../utils/slRatingDistribution.js';
import { glossaryAnnotator } from '../../../../common/glossary/glossaryAnnotator.js';

/**
 * Subject + domain selector used throughout the group-comparison feature.
 * @typedef {object} SubjectDomainSelector
 * @property {string} subjectName - Subject (fach) name
 * @property {string|null} domainId - Domain id (domaene), or null for the whole subject
 * @property {string|null} [domainName] - The domain's display name, carried alongside the id by the selectors the chart builds; label helpers read it, filters do not.
 */

// ============================================================================
// GENDER UTILITIES
// ============================================================================

/**
 * Every spelling of a gender the SL payloads use, mapped to its German label.
 *
 * `covariates[].value` is `male`/`female`/`diverse` in the SL demo fixture and in
 * the API payloads. A code with no entry falls through unchanged, which is how
 * the Vergleich came to label its groups "male"/"female"/"diverse" everywhere.
 */
const GENDER_LABELS = Object.freeze({
    male: 'Männlich',
    female: 'Weiblich',
    diverse: 'Divers',
});

/**
 * German display name per chart type — the header dropdown and the info-box sentence
 * name the measure from the same table.
 * @type {Readonly<Record<string, string>>}
 */
export const CHART_TYPE_LABELS = Object.freeze({
    ks: 'Kompetenzstufen',
    points: 'Lösungsquote',
    selfEfficacy: 'Selbstwirksamkeit',
    teachingQuality: 'Unterrichtsqualität',
});

/**
 * Maps a gender code to its German display label.
 * @param {string} code - Gender code ('male'/'female'/'diverse')
 * @returns {string} German label (Männlich, Weiblich, Divers) or the original value
 */
export function getGenderLabel(code) {
    return GENDER_LABELS[code] ?? code;
}

// ============================================================================
// COMPETENCY LEVEL DATA
// ============================================================================

/**
 * Filters domain data for selected subject+domain and extracts competency level data.
 * @param {Array} domainResults - Flat array of domain result objects
 * @param {SubjectDomainSelector} selector - Subject+domain selector
 * @returns {Array|null} Student data with competency levels, or null if invalid
 */
export function filterSelectedDomainData(domainResults, selector) {
    const entries = domainResults.filter(
        (r) => r.fach === selector.subjectName && r.domaene === selector.domainId,
    );

    if (!entries || entries.length === 0) {
        return null;
    }

    const allStudents = [];
    entries.forEach((domain) => {
        if (domain.summedResults) {
            domain.summedResults.forEach((student) => {
                allStudents.push({
                    studentId: student.studentId,
                    gender: student.gender,
                    class: student.stammklasse,
                    competencyLevel: extractCompetencyLevel(student),
                    competencyScaleId: domain.stats?.scaleId,
                    domain: domain.domaene || 'alle',
                    subject: domain.fach,
                });
            });
        }
    });

    return allStudents;
}

/**
 * Filters domain data for TWO subjects and merges students into one array,
 * tagging each with their subject name. Used for category='fach' comparisons.
 * @param {Array} domainResults - Flat array of domain result objects
 * @param {SubjectDomainSelector} selector1 - First subject
 * @param {SubjectDomainSelector} selector2 - Second subject
 * @returns {Array|null} Merged student data with subject tags
 */
export function filterCrossSubjectData(domainResults, selector1, selector2) {
    const students1 = filterSelectedDomainData(domainResults, selector1);
    const students2 = filterSelectedDomainData(domainResults, selector2);
    if (!students1?.length && !students2?.length) return null;
    return [...(students1 || []), ...(students2 || [])];
}

/**
 * Builds the list of unique subject+domain tuples from flat domain results, in
 * first-seen order. Backs the Fach/Domäne control and the `subjectIndex` selection.
 * @param {Array} domainResults - Flat array of domain result objects
 * @returns {Array<{subjectName: string, domainId: string|null, domainName: string|null, subjectCode: string}>} One entry per Fach/Domäne, deduped by `fach|domaene`.
 */
export function buildSubjectDomainList(domainResults) {
    const seen = new Set();
    const list = [];

    for (const r of domainResults) {
        const key = `${r.fach}|${r.domaene}`;
        if (seen.has(key)) continue;
        seen.add(key);
        list.push({
            subjectName: r.fach,
            domainId: r.domaene,
            domainName: r.domaenenbezeichnung,
            subjectCode: r.subjectCode,
        });
    }

    return list;
}

/**
 * Extracts competency level from student data
 * @param {object} student - Student data object
 * @returns {string} Competency level or 'N/A' if not found
 */
function extractCompetencyLevel(student) {
    const ksField = Object.keys(student).find((key) => key.toLowerCase().endsWith('ks'));
    return ksField ? student[ksField] : 'N/A';
}

/**
 * Groups students by competency level and counts them
 * @param {Array} students - Array of student data
 * @returns {object} Object mapping competency levels to counts
 */
function groupByCompetencyLevel(students) {
    const counts = {};
    students.forEach((student) => {
        const level = student.competencyLevel;
        counts[level] = (counts[level] || 0) + 1;
    });
    return counts;
}

/**
 * Headcount for one comparison row, which may span several source levels — a row that
 * merges `1a` and `1b` counts both.
 * @param {{[level: string]: number}} levelCounts - Headcount per competency level.
 * @param {string[]} levels - The levels this row stands for.
 * @returns {number} The row's total.
 */
function countLevelsForRow(levelCounts, levels) {
    return levels.reduce((sum, level) => sum + (levelCounts[level] || 0), 0);
}

/**
 * Segments for one comparison row, one per level that actually has students — an empty
 * level is dropped rather than drawn as a zero-width segment.
 * @param {string[]} levels - The levels this row stands for, in scale order.
 * @param {{[level: string]: number}} levelCounts - Headcount per competency level.
 * @param {string|undefined} scaleId - The group's ladder, so the renderer paints each level on it.
 * @returns {Array<{level: string, label: string, count: number, scaleId: string|undefined}>} The non-empty segments, in scale order.
 */
function buildCompetencySegments(levels, levelCounts, scaleId) {
    return levels
        .map((level) => ({
            level,
            label: level,
            count: levelCounts[level] || 0,
            scaleId,
        }))
        .filter((segment) => segment.count > 0);
}

/**
 * Extracts the competency level order for a given subject+domain from domain results.
 * Uses stats.ksOrder, which preserves the intended level order for mixed keys
 * such as 1a/1b without relying on object-key enumeration, together with the ladder
 * those names sit on (`stats.scaleId`).
 * @param {Array} domainResults - Flat domain results array
 * @param {object} selector - {subjectName, domainId}
 * @returns {{order: string[], scaleId: string|undefined}|null} Ordered level names and their scale, or null if not found
 */
export function extractLevelOrder(domainResults, selector) {
    const entries = domainResults.filter(
        (r) => r.fach === selector.subjectName && r.domaene === selector.domainId,
    );
    for (const entry of entries) {
        // Use ksOrder (insertion-ordered array) — Object.keys() re-sorts integer-like keys (e.g. '2','3' before '1a','1b')
        const order = entry?.stats?.ksOrder;
        if (order?.length) return { order, scaleId: entry.stats.scaleId };
    }
    return null;
}

/**
 * Prepares competency level data grouped by the specified category.
 *
 * The 5th argument is an ordered row-definition array built from the selected
 * subject level orders. Each row keeps a canonical internal key plus per-group
 * display labels and per-group segment arrays so split levels like 1a/1b or Ia/Ib
 * remain distinguishable inside one aligned comparison row.
 * @param {Array} subjectData - Filtered subject data with competency levels
 * @param {string} category - Comparison category ('gender', 'class', or 'fach')
 * @param {string|null} group1Value - Value for group 1 (null for auto-select)
 * @param {string|null} group2Value - Value for group 2 (null for auto-select)
 * @param {Array<{key: string, labels: Array<string|null>, sourceLevels: string[][], sharedLabel: string|null}>|null} [levelRows] - Ordered row definitions built from the selected subjects' level orders; without them the rows are derived from the data alone.
 * @returns {object} Data grouped by category and competency level; `levelScaleIds` names each group's ladder for the renderer's level lookups.
 */
export function prepareCompetencyGroupData(
    subjectData,
    category = 'gender',
    group1Value = null,
    group2Value = null,
    levelRows = null,
) {
    if (!subjectData || subjectData.length === 0) {
        return createEmptyResult('competency');
    }

    const { group1Data, group2Data, group1Label, group2Label } = filterByCategory(
        subjectData,
        category,
        group1Value,
        group2Value,
        'competency',
    );

    if (!group1Data || !group2Data) {
        return createEmptyResult('competency');
    }

    // Group by competency level and count occurrences
    const group1CompetencyCount = groupByCompetencyLevel(group1Data);
    const group2CompetencyCount = groupByCompetencyLevel(group2Data);

    // Each group's ladder, read off its students — the Kategorie "Fach" puts two
    // ladders side by side, and a level name can belong to both.
    const group1ScaleId = group1Data.find(
        (student) => student.competencyScaleId,
    )?.competencyScaleId;
    const group2ScaleId =
        group2Data.find((student) => student.competencyScaleId)?.competencyScaleId ?? group1ScaleId;

    const fallbackOrder = [
        ...new Set(subjectData.map((student) => student.competencyLevel).filter(Boolean)),
    ];
    const resolvedLevelRows =
        Array.isArray(levelRows) && levelRows.length > 0
            ? levelRows
            : buildCompetencyLevelRows([{ order: fallbackOrder, scaleId: group1ScaleId }]);

    const activeRows = resolvedLevelRows
        .map((row) => {
            const group1Levels = row.sourceLevels[0] || [];
            const group2Levels = row.sourceLevels[1] || group1Levels;
            const group1RowLabel = row.labels[0] || row.sharedLabel || row.key;
            const group2RowLabel = row.labels[1] || row.labels[0] || row.sharedLabel || row.key;
            const group1ValueCount = countLevelsForRow(group1CompetencyCount, group1Levels);
            const group2ValueCount = countLevelsForRow(group2CompetencyCount, group2Levels);

            return {
                key: row.key,
                group1Levels,
                group2Levels,
                group1Segments: buildCompetencySegments(
                    group1Levels,
                    group1CompetencyCount,
                    group1ScaleId,
                ),
                group2Segments: buildCompetencySegments(
                    group2Levels,
                    group2CompetencyCount,
                    group2ScaleId,
                ),
                group1Label: group1RowLabel,
                group2Label: group2RowLabel,
                singleLabel: row.sharedLabel || group1RowLabel || group2RowLabel || row.key,
                group1Value: group1ValueCount,
                group2Value: group2ValueCount,
            };
        })
        .filter((row) => row.group1Value > 0 || row.group2Value > 0);

    const usePairLabels = activeRows.some((row) => row.group1Label !== row.group2Label);

    return {
        levels: activeRows.map((row) => row.key),
        levelScaleIds: [group1ScaleId, group2ScaleId],
        levelLabels: usePairLabels ? undefined : activeRows.map((row) => row.singleLabel),
        levelPairLabels: usePairLabels
            ? activeRows.map((row) => ({
                  group1Label: row.group1Label,
                  group2Label: row.group2Label,
              }))
            : undefined,
        group1Segments: activeRows.map((row) => row.group1Segments),
        group2Segments: activeRows.map((row) => row.group2Segments),
        group1: activeRows.map((row) => row.group1Value),
        group2: activeRows.map((row) => row.group2Value),
        group1Count: group1Data.length,
        group2Count: group2Data.length,
        group1Label,
        group2Label,
    };
}

/**
 * Creates empty result for any chart type
 * @param {string} type - Chart type: 'competency', 'points', or 'rating'
 * @param {object} additionalFields - Type-specific fields to add
 * @returns {object} Empty result object
 */
function createEmptyResult(type, additionalFields = {}) {
    const itemsKey = type === 'competency' ? 'levels' : type === 'points' ? 'points' : 'buckets';
    return {
        [itemsKey]: [],
        group1: [],
        group2: [],
        group1Count: 0,
        group2Count: 0,
        group1Label: glossaryAnnotator.getRequiredEntryText('general.messages.no-data-short'),
        group2Label: '',
        ...additionalFields,
    };
}

// ============================================================================
// RATING DATA (Self-Efficacy & Teaching Quality)
// ============================================================================

/**
 * Filters rating data for the group comparison chart.
 *
 * Accepts the JSON-derived comparison data (flat array of
 * `{ studentId, subject, mean, gender, class }`).
 * @param {Array} dataArray - Rating data from DataStore comparison builders
 * @param {string|null} [subjectFilter=null] - Optional subject name to filter by
 * @returns {Array} Array of {studentId, gender, class, mean, subject}
 */
export function filterRatingData(dataArray, subjectFilter = null) {
    if (!dataArray || dataArray.length === 0) {
        return [];
    }

    let filtered = dataArray;
    if (subjectFilter) {
        filtered = filtered.filter((e) => e.subject === subjectFilter);
    }
    return filtered.map((e) => ({
        studentId: e.studentId,
        gender: e.gender,
        class: e.class,
        mean: e.mean,
        subject: e.subject,
    }));
}

/**
 * Generic function to prepare rating-based data for comparison
 * @param {Array} data - Filtered data with student means
 * @param {string} category - 'gender', 'class', or 'fach'
 * @param {string} group1Value - Value for group 1
 * @param {string} group2Value - Value for group 2
 * @param {string} dataType - Type label for the data
 * @returns {object} Chart data with rating buckets and counts per group
 */
export function prepareRatingGroupData(data, category, group1Value, group2Value, dataType) {
    if (!data || data.length === 0) {
        return createEmptyResult('rating', {
            colors: RATING_CATEGORIES.map((c) => c.color),
            dataType,
            categoryDescriptions: [],
        });
    }

    const { group1Data, group2Data, group1Label, group2Label } = filterByCategory(
        data,
        category,
        group1Value,
        group2Value,
        'rating',
    );

    if (!group1Data || !group2Data) {
        return createEmptyResult('rating', {
            colors: RATING_CATEGORIES.map((c) => c.color),
            dataType,
            categoryDescriptions: [],
        });
    }

    // Calculate distribution across rating categories for each group
    const group1Means = group1Data.map((s) => s.mean);
    const group2Means = group2Data.map((s) => s.mean);

    const reversedCategories = buildRatingBuckets(group1Means, { reverse: true });
    const reversedGroup1Dist = reversedCategories;
    const reversedGroup2Dist = buildRatingBuckets(group2Means, { reverse: true });

    return {
        buckets: reversedCategories.map((c) => c.label),
        group1: reversedGroup1Dist.map((d) => d.count),
        group2: reversedGroup2Dist.map((d) => d.count),
        group1Count: group1Data.length,
        group2Count: group2Data.length,
        group1Label,
        group2Label,
        colors: reversedCategories.map((c) => c.color),
        dataType,
        categoryDescriptions: reversedCategories.map((c) => getRatingCategoryDescription(c.key)),
    };
}

// ============================================================================
// POINT DATA
// ============================================================================

const POINT_BUCKET_WIDTH = 10;

/**
 * Fallback Lösungsquote for a record that ships points but no percentage.
 * @param {number} rawPoints - Points scored.
 * @param {number} maxPoints - Points available.
 * @returns {number|null} The share in percent, or `null` when either figure is missing or the denominator is zero.
 */
function calculateSolutionRatePercent(rawPoints, maxPoints) {
    return Number.isFinite(rawPoints) && Number.isFinite(maxPoints) && maxPoints > 0
        ? (rawPoints / maxPoints) * 100
        : null;
}

/**
 * Bring one payload point record into the shape the comparison works on, deriving the
 * Lösungsquote only when the payload did not deliver one.
 * @param {object} entry - One student's point record as the payload delivers it.
 * @returns {object} The normalised record; its `solutionRatePercent` is `null` when neither the payload nor the points allow one.
 */
function normalizePointRecord(entry) {
    const rawPoints = Number(entry.rawPoints);
    const maxPoints = Number(entry.maxPoints);
    const solutionRatePercent = Number(entry.solutionRatePercent);

    return {
        studentId: entry.studentId,
        gender: entry.gender,
        class: entry.class,
        subject: entry.subject,
        domainId: entry.domainId ?? null,
        domainName: entry.domainName ?? null,
        rawPoints,
        maxPoints,
        solutionRatePercent: Number.isFinite(solutionRatePercent)
            ? solutionRatePercent
            : calculateSolutionRatePercent(rawPoints, maxPoints),
    };
}

/**
 * The value a point record is plotted at, clamped to the 0–100 axis.
 * @param {object|null} record - A normalised point record.
 * @returns {number|null} The Lösungsquote in percent, or `null` for a record that carries none.
 */
export function getPointMetric(record) {
    const value = Number(record?.solutionRatePercent);
    return Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : null;
}

/**
 * Whether a record belongs to the selected Fach and Domäne.
 * @param {any} entry - A record carrying `subject` and `domainId`.
 * @param {SubjectDomainSelector|null} [selector] - The selection; without a subject everything matches.
 * @returns {boolean} True when the record is in scope.
 */
function matchesSubjectDomain(entry, selector = null) {
    if (!selector?.subjectName) {
        return true;
    }

    return (
        entry?.subject === selector.subjectName &&
        (entry?.domainId ?? null) === (selector.domainId ?? null)
    );
}

/**
 * Collapse a student's per-Domäne records into one record per Fach, summing the points
 * and re-deriving the Lösungsquote from the totals — averaging the per-domain shares
 * would weight a two-item domain like a twenty-item one.
 * @param {Array<object>} records - Normalised point records, one per student and Domäne.
 * @returns {Array<object>} One record per student and Fach.
 */
function aggregatePointDataBySubject(records) {
    const grouped = new Map();

    for (const record of records) {
        const key = `${record.studentId}|${record.class}|${record.subject}`;
        const current = grouped.get(key) ?? {
            studentId: record.studentId,
            gender: record.gender,
            class: record.class,
            subject: record.subject,
            domainId: null,
            domainName: null,
            rawPoints: 0,
            maxPoints: 0,
            solutionRatePercent: null,
        };

        current.rawPoints += record.rawPoints;
        current.maxPoints += record.maxPoints;
        current.solutionRatePercent = calculateSolutionRatePercent(
            current.rawPoints,
            current.maxPoints,
        );
        grouped.set(key, current);
    }

    return Array.from(grouped.values());
}

/**
 * Filters raw point-score records for the selected subject/domain.
 * @param {Array} dataArray - Point data from DataStore comparison builder
 * @param {SubjectDomainSelector|null} [selector=null] - Optional subject+domain selector
 * @param {object} [options={}] - How the records should be grouped before they are returned.
 * @param {boolean} [options.aggregateBySubject=false] - Sum domains per student+subject for Fach comparisons
 * @returns {Array<{studentId: string, gender: string, class: string, subject: string, domainId: string|null, domainName: string|null, rawPoints: number, maxPoints: number, solutionRatePercent: number|null}>} The in-scope records; ones without a usable Lösungsquote are dropped rather than plotted at zero.
 */
export function filterPointData(dataArray, selector = null, { aggregateBySubject = false } = {}) {
    if (!dataArray || dataArray.length === 0) {
        return [];
    }

    const filtered = dataArray
        .filter((entry) => matchesSubjectDomain(entry, selector))
        .map(normalizePointRecord)
        .filter(
            (entry) =>
                Number.isFinite(entry.rawPoints) &&
                Number.isFinite(entry.maxPoints) &&
                entry.solutionRatePercent !== null,
        );

    return aggregateBySubject ? aggregatePointDataBySubject(filtered) : filtered;
}

/**
 * The 10-point Lösungsquote buckets a distribution is drawn in, highest first. Only the
 * top bucket includes its upper bound, so 100% lands in `[90%, 100%]` rather than in a
 * bucket of its own.
 * @param {Array<number|null>} values - Only read for emptiness: with nothing to bucket the chart draws no axis at all, rather than an axis of empty buckets.
 * @returns {Array<{key: string, lowerBound: number, upperBound: number, includesUpperBound: boolean, label: string}>} The buckets, descending.
 */
function createPointBuckets(values) {
    if (!values.length) {
        return [];
    }

    const buckets = [];

    for (
        let lowerBound = 100 - POINT_BUCKET_WIDTH;
        lowerBound >= 0;
        lowerBound -= POINT_BUCKET_WIDTH
    ) {
        const upperBound = lowerBound + POINT_BUCKET_WIDTH;
        const includesUpperBound = upperBound === 100;
        buckets.push({
            key: `${lowerBound}-${upperBound}`,
            lowerBound,
            upperBound,
            includesUpperBound,
            // A range a reader can say: `90–100 %`. The half-open convention (only the
            // top bucket includes its upper bound) lives in `includesUpperBound`, not
            // in the label.
            label: `${lowerBound}\u2013${upperBound}\u00a0%`,
        });
    }

    return buckets;
}

/**
 * Headcount per bucket.
 * @param {Array<object>} records - Normalised point records; ones without a Lösungsquote are skipped.
 * @param {Array<{key: string, lowerBound: number, upperBound: number, includesUpperBound: boolean}>} buckets - The buckets to count into.
 * @returns {number[]} Headcount per bucket, positionally aligned with `buckets`, zero-filled so every bucket keeps its slot.
 */
function countPointBuckets(records, buckets) {
    const counts = new Map(buckets.map((bucket) => [bucket.key, 0]));

    records.forEach((record) => {
        const solutionRatePercent = getPointMetric(record);
        if (solutionRatePercent === null) {
            return;
        }

        const bucket = buckets.find(
            (candidate) =>
                solutionRatePercent >= candidate.lowerBound &&
                (candidate.includesUpperBound
                    ? solutionRatePercent <= candidate.upperBound
                    : solutionRatePercent < candidate.upperBound),
        );

        if (bucket) {
            counts.set(bucket.key, (counts.get(bucket.key) ?? 0) + 1);
        }
    });

    return buckets.map((bucket) => counts.get(bucket.key) ?? 0);
}

/**
 * Prepares point data grouped by the specified category.
 * @param {Array} data - Filtered point records
 * @param {string} category - 'gender', 'class', or 'fach'
 * @param {string|null} group1Value - Value for group 1
 * @param {string|null} group2Value - Value for group 2
 * @returns {object} Chart data with solution-rate buckets and counts per group
 */
export function preparePointGroupData(data, category, group1Value, group2Value) {
    if (!data || data.length === 0) {
        return createEmptyResult('points');
    }

    const { group1Data, group2Data, group1Label, group2Label } = filterByCategory(
        data,
        category,
        group1Value,
        group2Value,
        'points',
    );

    if (!group1Data || !group2Data) {
        return createEmptyResult('points');
    }

    const values = [...group1Data, ...group2Data].map(getPointMetric).filter(Number.isFinite);
    const pointBuckets = createPointBuckets(values);

    return {
        points: pointBuckets,
        group1: countPointBuckets(group1Data, pointBuckets),
        group2: countPointBuckets(group2Data, pointBuckets),
        group1Count: group1Data.length,
        group2Count: group2Data.length,
        group1Label,
        group2Label,
    };
}

/**
 * Filters data by category (gender or class) and returns grouped data with labels
 * @param {Array} data - Data array with gender/class properties
 * @param {string} category - 'gender', 'class', or 'fach'
 * @param {string|null} group1Value - Value for group 1
 * @param {string|null} group2Value - Value for group 2
 * @param {string} dataType - Type of data for logging ('competency', 'points', 'rating')
 * @returns {object} {group1Data, group2Data, group1Label, group2Label}
 */
export function filterByCategory(data, category, group1Value, group2Value, dataType) {
    let group1Data, group2Data, group1Label, group2Label;

    if (category === 'gender') {
        const g1 = group1Value || 'm';
        const g2 = group2Value || 'f';
        group1Data = data.filter((item) => item.gender === g1);
        group2Data = data.filter((item) => item.gender === g2);
        group1Label = getGenderLabel(g1);
        group2Label = getGenderLabel(g2);
    } else if (category === 'class') {
        if (group1Value && group2Value) {
            group1Data = data.filter((item) => item.class === group1Value);
            group2Data = data.filter((item) => item.class === group2Value);
            group1Label = group1Value;
            group2Label = group2Value;
        } else {
            const classes = [...new Set(data.map((item) => item.class).filter((c) => c))];
            if (classes.length < 2) {
                console.warn(
                    `[groupComparisonDataUtils] Not enough classes for ${dataType} comparison`,
                );
                return {
                    group1Data: null,
                    group2Data: null,
                    group1Label: 'Keine Klassen',
                    group2Label: 'verfügbar',
                };
            }
            group1Data = data.filter((item) => item.class === classes[0]);
            group2Data = data.filter((item) => item.class === classes[1]);
            group1Label = classes[0];
            group2Label = classes[1];
        }
    } else if (category === 'fach') {
        // Compare across subjects — group by subject name
        const s1 = group1Value;
        const s2 = group2Value;
        if (s1 && s2) {
            group1Data = data.filter((item) => item.subject === s1);
            group2Data = data.filter((item) => item.subject === s2);
            group1Label = s1;
            group2Label = s2;
        } else {
            const subjects = [...new Set(data.map((item) => item.subject).filter(Boolean))];
            if (subjects.length < 2) {
                console.warn(
                    `[groupComparisonDataUtils] Not enough subjects for ${dataType} comparison`,
                );
                return {
                    group1Data: null,
                    group2Data: null,
                    group1Label: 'Keine Fächer',
                    group2Label: 'verfügbar',
                };
            }
            group1Data = data.filter((item) => item.subject === subjects[0]);
            group2Data = data.filter((item) => item.subject === subjects[1]);
            group1Label = subjects[0];
            group2Label = subjects[1];
        }
    } else {
        console.warn(`[groupComparisonDataUtils] Unknown category: ${category}`);
        return {
            group1Data: null,
            group2Data: null,
            group1Label: 'Unbekannt',
            group2Label: 'Kategorie',
        };
    }

    return { group1Data, group2Data, group1Label, group2Label };
}
