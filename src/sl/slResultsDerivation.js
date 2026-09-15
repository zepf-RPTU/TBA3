/**
 * Everything the SL derives from the scored results: the per-class domain results with
 * their per-student rows, and the per-student point scores for the group comparison.
 * Pure builders over the SL documents; `slDataService` declares them as datasets. The
 * competence-level ladder they read is `@tba3/modules/sl/utils/slLevelDefinitions.js`.
 */

import { extractTraits, RESULT_VALUES } from '@tba3/modules/domain';
import { getScaleIdForDomain } from '@tba3/modules/sl-domain';
import { resolveScaleId } from '@tba3/modules/theme';
import { getClassName, getGender } from './utils/slStudentCovariates.js';

// ============================================================================
// DOMAIN / CLASS RESULTS BUILDERS
// ============================================================================

/**
 * Build domain results from JSON data.
 *
 * Produces a flat array of result objects (one per class+subject+domain),
 * enriched with per-student data for cross-domain aggregation.
 * Every result names its scale (`stats.scaleId`, and `competencyScaleId` on each student)
 * next to its level order, so consumers can resolve `ksOrder`'s names on the right ladder.
 * The Fach/Domäne definition decides it — its fullest row settles a run that the row
 * alone could not (see `resolveScaleId`) — with the row's own levels as the fallback.
 * @param {import('@tba3/modules/sl/slCompetenceLevelIndex.js').CompetenceLevelIndex} index - The indexed competence-levels payload
 * @param {Array} studentsData - students_competence-levels.json array
 * @param {import('@tba3/modules/sl/utils/slLevelDefinitions.js').LevelDefinitions} [levelDefinitions] - From buildLevelDefinitions()
 * @returns {Array<object>} Flat array of domain result objects
 */
export function buildDomainResultsFromJson(index, studentsData, levelDefinitions) {
    const classEntries = index.classRows;
    if (!classEntries.length) return [];

    // Index students by class+subject+domain for efficient lookup
    const studentIndex = _indexStudentsByClassSubjectDomain(studentsData);

    // Build one result per class-level entry from competence-levels.json
    const results = [];

    for (const entry of classEntries) {
        const subjectName = entry.subject?.name;
        const subjectCode = entry.subject?.id ?? null;
        const domainId = entry.domain?.id ?? null;
        const domainName = entry.domain?.name ?? null;
        const className = entry.name;
        if (!subjectName || !className) continue;

        // KS counts directly from JSON level frequencies
        const ksCounts = {};
        const ksOrder = []; // preserves JSON insertion order (Object.keys re-sorts integer-like keys)
        let nrStudents = 0;
        for (const cl of entry.competenceLevels ?? []) {
            ksCounts[cl.nameShort] = cl.descriptiveStatistics?.frequency ?? 0;
            ksOrder.push(cl.nameShort);
            nrStudents = cl.descriptiveStatistics?.total ?? nrStudents;
        }
        const scaleId =
            getScaleIdForDomain(levelDefinitions ?? null, subjectName, domainId) ??
            resolveScaleId(ksOrder);

        // Get per-student data for gender/trait counts and summedResults
        const studentKey = `${className}|${subjectName}|${domainId}`;
        const students = studentIndex.get(studentKey) ?? [];

        const traitCounts = {};
        const genderCounts = { male: 0, female: 0, diverse: 0 };
        const summedResults = [];

        for (const student of students) {
            const covariates = student.covariates ?? [];
            const gender = covariates.find((c) => c.type === 'gender')?.value ?? null;
            const traits = extractTraits(covariates);

            if (gender) {
                genderCounts[gender] = (genderCounts[gender] || 0) + 1;
            }
            for (const trait of traits) {
                traitCounts[trait] = (traitCounts[trait] || 0) + 1;
            }

            // Determine this student's competency level for this domain
            const studentLevel = student.competenceLevels?.[0]?.nameShort ?? null;

            summedResults.push({
                studentId: student.id,
                gender: gender,
                stammklasse: className,
                traits,
                [`${domainId ?? subjectName}Ks`]: studentLevel,
                competencyScaleId: scaleId,
            });
        }

        results.push({
            fach: subjectName,
            fachbezeichnung: subjectName,
            domaene: domainId,
            domaenenbezeichnung: domainName,
            stammklasse_id: className,
            stammklasse: className,
            subjectCode,
            stats: {
                nrStudents,
                traitCounts,
                genderCounts,
                ksCounts,
                ksOrder,
                scaleId,
            },
            summedResults,
        });
    }

    return results;
}

/**
 * Group flat domain results by class.
 * Each inner array contains all domain results for one class, sorted alphabetically.
 * @param {Array} domainResults - Flat array from buildDomainResultsFromJson()
 * @returns {Array<Array>} Array of arrays grouped by stammklasse_id
 */
export function buildClassResultsFromJson(domainResults) {
    if (!domainResults?.length) return [];

    const byClass = new Map();
    for (const result of domainResults) {
        const key = result.stammklasse_id;
        if (!byClass.has(key)) {
            byClass.set(key, []);
        }
        byClass.get(key).push(result);
    }

    return Array.from(byClass.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([, results]) => results);
}

// ============================================================================
// COMPARISON POINTS (Group Comparison View)
// ============================================================================

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
 * Build per-student point data for the group comparison view.
 *
 * Reads students_aggregation.json — the API's `type=students&aggregation=result`
 * document: one row per (student, subject, domain) carrying the three `Ergebnis`
 * buckets. `Richtig` is the student's raw score, and the three frequencies
 * partition the responses that student actually gave, so `maxPoints` is their own
 * answered count rather than a class-wide item count. That distinction is what
 * booklet rotation makes matter.
 *
 * Records are grouped by student, class, subject and domain — the class is part of
 * the key because student ids repeat across classes.
 * @param {Array} studentsAggregationData - students_aggregation.json array
 * @returns {Array<{studentId: string, subject: string, domainId: string|null, domainName: string|null, rawPoints: number, maxPoints: number, solutionRatePercent: number|null, gender: string|null, class: string}>} One row per student, Fach and Domäne; `gender` is `null` for a student without a gender covariate.
 */
export function buildComparisonPoints(studentsAggregationData) {
    if (!studentsAggregationData?.length) return [];

    const grouped = new Map();

    for (const entry of studentsAggregationData) {
        const subjectName = entry.subject?.name;
        const className = getClassName(entry.covariates);
        // A student without a gender covariate still counts for Klasse and Fach; the
        // Geschlecht category filters by value and so leaves them out on its own.
        const gender = getGender(entry.covariates);
        if (!subjectName || !className) continue;

        const domainId = entry.domain?.id ?? null;
        const domainName = entry.domain?.name ?? null;
        let rawPoints = 0;
        let maxPoints = 0;

        for (const aggregation of entry.aggregations ?? []) {
            if (aggregation.type !== 'Ergebnis') continue;
            const code = RESULT_VALUES[aggregation.value];
            // An unrecognised bucket is not a response: counting it would inflate
            // the denominator with something this client has no meaning for.
            if (code === undefined) continue;
            const frequency = aggregation.descriptiveStatistics?.frequency ?? 0;
            maxPoints += frequency;
            if (code === 1) rawPoints += frequency;
        }

        if (maxPoints === 0) continue;

        const key = `${entry.id}|${className}|${subjectName}|${domainId ?? 'null'}`;
        const current = grouped.get(key) ?? {
            studentId: entry.id,
            subject: subjectName,
            domainId,
            domainName,
            rawPoints: 0,
            maxPoints: 0,
            solutionRatePercent: null,
            gender,
            class: className,
        };

        current.rawPoints += rawPoints;
        current.maxPoints += maxPoints;
        current.solutionRatePercent = calculateSolutionRatePercent(
            current.rawPoints,
            current.maxPoints,
        );
        grouped.set(key, current);
    }

    return Array.from(grouped.values());
}

// ============================================================================
// INTERNAL HELPERS
// ============================================================================

/**
 * Index student entries by class+subject+domain for efficient lookup.
 * @param {Array} studentsData - students_competence-levels.json array
 * @returns {Map<string, Array>} Map of "className|subjectName|domainId" → [studentEntry, ...]
 */
function _indexStudentsByClassSubjectDomain(studentsData) {
    const index = new Map();
    if (!studentsData?.length) return index;

    for (const entry of studentsData) {
        const className = getClassName(entry.covariates);
        const subjectName = entry.subject?.name;
        const domainId = entry.domain?.id ?? null;
        if (!className || !subjectName) continue;

        const key = `${className}|${subjectName}|${domainId}`;
        if (!index.has(key)) {
            index.set(key, []);
        }
        index.get(key).push(entry);
    }

    return index;
}
