/**
 * MA Student Data Adapter — Transforms JSON API data into student record
 * shapes consumed by MA views.
 *
 * Input:  students_competence-levels.json + students_aggregation.json
 * Output: studentArray (per-student aggregated) + rawStudentArray (per-student-per-item)
 */

import { extractTraits, GENDER_MAP, getKsThresholds, RESULT_VALUES } from '@tba3/modules/domain';

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Build the aggregated studentArray from competence-level + aggregation JSON data.
 *
 * Each output record shape:
 * { studentId, firstName, lastName, gender, ks, ksThresholds, summedResult, percentage,
 *   percentageCorrect, percentageIncorrect, percentageNotAttempted,
 *   correctCount, incorrectCount, notAttemptedCount, traits }
 * @param {Array} competenceLevelsData - students_competence-levels.json
 * @param {Array} aggregationData - students_aggregation.json
 * @param {number} nrItems - Total number of items (for percentage calculation)
 * @returns {Array<object>} Student records
 */
export function buildStudentRecords(competenceLevelsData, aggregationData, nrItems) {
    // Build a lookup: studentId → { richtig, falsch, unbearbeitet }
    const resultMap = _buildStudentResultMap(aggregationData);

    return competenceLevelsData.map((entry) => {
        const covariates = entry.covariates ?? [];
        const props = entry.properties ?? [];
        const gender = covariates.find((c) => c.type === 'gender');
        const traits = extractTraits(covariates);

        const counts = resultMap.get(entry.id) ?? { richtig: 0, falsch: 0, unbearbeitet: 0 };
        const summedResult = counts.richtig;
        const total = counts.richtig + counts.falsch + counts.unbearbeitet;
        const pct = nrItems > 0 ? ((summedResult / nrItems) * 100).toFixed(1) : '0.0';

        return {
            studentId: entry.id,
            firstName: props.find((p) => p.key === 'firstName')?.value ?? '',
            lastName: props.find((p) => p.key === 'lastName')?.value ?? '',
            gender: GENDER_MAP[gender?.value] ?? '',
            ks: entry.competenceLevels?.[0]?.nameShort ?? '',
            // The band's full name, where the state publishes one — four states leave it
            // unset for maths, and the API omits the key rather than sending null.
            // Cut scores off the student's *own* booklet. A/B/C variants inside one class
            // have different thresholds, so a class-wide threshold list would place the
            // boundary wrongly for whoever sat the other booklet.
            ksThresholds: getKsThresholds(entry),
            summedResult,
            percentage: `${pct}%`,
            percentageCorrect: total > 0 ? (counts.richtig / total) * 100 : 0,
            percentageIncorrect: total > 0 ? (counts.falsch / total) * 100 : 0,
            percentageNotAttempted: total > 0 ? (counts.unbearbeitet / total) * 100 : 0,
            correctCount: counts.richtig,
            incorrectCount: counts.falsch,
            notAttemptedCount: counts.unbearbeitet,
            traits,
        };
    });
}

/**
 * Re-scope aggregated student records to a subset of items (one Leitidee /
 * task pool). Recomputes correct / incorrect / not-attempted counts and the
 * derived percentages over just the pool's items, while reusing each student's
 * identity, gender, traits and Kompetenzstufe from the whole-booklet records.
 *
 * The per-item results already carried on `itemArray` (built from the same
 * aggregation data that produced `baseStudentArray`) are the single source of
 * truth here, so a pool covering every item reproduces the whole-booklet counts.
 * @param {Array<object>} baseStudentArray - Whole-booklet records (buildStudentRecords output)
 * @param {Array<{iqbId: string, results: Array<[string, number]>}>} itemArray - Enriched item records
 * @param {Set<string>} iqbIds - iqbIds of the items in the target pool
 * @returns {Array<object>} Student records scoped to the pool (same shape as buildStudentRecords)
 */
export function buildScopedStudentRecords(baseStudentArray, itemArray, iqbIds) {
    const nrItems = iqbIds.size;

    // Tally per-student results across only the pool's items.
    const tally = new Map();
    for (const item of itemArray) {
        if (!iqbIds.has(item.iqbId)) continue;
        for (const [studentId, ergebnis] of item.results ?? []) {
            let counts = tally.get(studentId);
            if (!counts) {
                counts = { richtig: 0, falsch: 0, unbearbeitet: 0 };
                tally.set(studentId, counts);
            }
            if (ergebnis === RESULT_VALUES.Richtig) counts.richtig += 1;
            else if (ergebnis === RESULT_VALUES.Falsch) counts.falsch += 1;
            else if (ergebnis === RESULT_VALUES.Unbearbeitet) counts.unbearbeitet += 1;
        }
    }

    return baseStudentArray.map((student) => {
        const counts = tally.get(student.studentId) ?? { richtig: 0, falsch: 0, unbearbeitet: 0 };
        const summedResult = counts.richtig;
        const total = counts.richtig + counts.falsch + counts.unbearbeitet;
        const pct = nrItems > 0 ? ((summedResult / nrItems) * 100).toFixed(1) : '0.0';

        return {
            ...student,
            summedResult,
            percentage: `${pct}%`,
            percentageCorrect: total > 0 ? (counts.richtig / total) * 100 : 0,
            percentageIncorrect: total > 0 ? (counts.falsch / total) * 100 : 0,
            percentageNotAttempted: total > 0 ? (counts.unbearbeitet / total) * 100 : 0,
            correctCount: counts.richtig,
            incorrectCount: counts.falsch,
            notAttemptedCount: counts.unbearbeitet,
        };
    });
}

/**
 * Build the rawStudentArray (one row per student per item) from aggregation + items data.
 *
 * Each row shape consumed by MaStudentDataTableModule:
 * { studentId, domainLabel, exerciseName, name, competenceLevel, ergebnis }
 *
 * Reconstructed by cross-referencing per-student Ergebnis iqbIds against item metadata.
 * @param {Array} itemsData - items.json (array of domain groups with items[])
 * @param {Array} aggregationData - students_aggregation.json (per-student per-domain entries)
 * @returns {Array<object>} Raw student rows (one per student per item)
 */
export function buildRawStudentArray(itemsData, aggregationData) {
    // Build item metadata lookup: iqbId → { name, exercise.name, competenceLevel, domain }
    const itemMeta = _buildItemMetadataMap(itemsData);

    // Build per-student, per-item result lookup from aggregation Ergebnis entries
    const studentItemResults = _buildStudentItemResultMap(aggregationData);

    const rows = [];

    for (const [studentId, itemResults] of studentItemResults) {
        for (const [iqbId, ergebnis] of itemResults) {
            const meta = itemMeta.get(iqbId);
            if (!meta) continue;

            rows.push({
                studentId: studentId,
                domainLabel: meta.domainName,
                exerciseName: meta.exerciseName,
                name: meta.name,
                competenceLevel: meta.competenceLevel,
                ergebnis,
            });
        }
    }

    return rows;
}

// ============================================================================
// INTERNAL HELPERS
// ============================================================================

/**
 * Sum Richtig/Falsch/Unbearbeitet frequencies across all domains per student.
 * @param {Array} aggregationData - students_aggregation.json
 * @returns {Map<string, {richtig: number, falsch: number, unbearbeitet: number}>} Per student id, the totals across every Leitidee.
 */
function _buildStudentResultMap(aggregationData) {
    const map = new Map();

    for (const entry of aggregationData) {
        const studentId = entry.id;
        if (!map.has(studentId)) {
            map.set(studentId, { richtig: 0, falsch: 0, unbearbeitet: 0 });
        }
        const counts = map.get(studentId);

        for (const agg of entry.aggregations ?? []) {
            if (agg.type !== 'Ergebnis') continue;
            const freq = agg.descriptiveStatistics?.frequency ?? 0;
            if (agg.value === 'Richtig') counts.richtig += freq;
            else if (agg.value === 'Falsch') counts.falsch += freq;
            else if (agg.value === 'Unbearbeitet') counts.unbearbeitet += freq;
        }
    }

    return map;
}

/**
 * Build item metadata lookup from items.json domain groups.
 * @param {Array} itemsData - items.json
 * @returns {Map<string, object>} iqbId → { name, exerciseName, competenceLevel, domainName }
 */
function _buildItemMetadataMap(itemsData) {
    const map = new Map();

    for (const group of itemsData) {
        const domainName = group.domain?.name ?? '';
        for (const item of group.items ?? []) {
            map.set(item.iqbId, {
                name: item.name ?? '',
                exerciseName: item.exercise?.name ?? '',
                competenceLevel: item.parameters?.competenceLevel?.nameShort ?? '',
                domainName,
            });
        }
    }

    return map;
}

/**
 * Build per-student per-item result map from aggregation Ergebnis entries.
 *
 * For each student+domain, looks at the Ergebnis aggregations (Richtig, Falsch, Unbearbeitet)
 * and maps each included iqbId to its result code (1, 0, -1).
 * @param {Array} aggregationData - students_aggregation.json
 * @returns {Map<string, Map<string, number>>} studentId → Map<iqbId, ergebnis>
 */
function _buildStudentItemResultMap(aggregationData) {
    const studentMap = new Map();

    for (const entry of aggregationData) {
        const studentId = entry.id;
        if (!studentMap.has(studentId)) {
            studentMap.set(studentId, new Map());
        }
        const itemResults = studentMap.get(studentId);

        for (const agg of entry.aggregations ?? []) {
            if (agg.type !== 'Ergebnis') continue;
            const resultCode = RESULT_VALUES[agg.value];
            if (resultCode === undefined) continue;

            for (const iqbId of agg.includedIqbIds ?? []) {
                itemResults.set(iqbId, resultCode);
            }
        }
    }

    return studentMap;
}
