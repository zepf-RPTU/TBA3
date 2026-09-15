/**
 * Everything the SL derives from the questionnaire scales on the student rows:
 * Selbstwirksamkeit (`sp_mean`) and Unterrichtsqualität (`tq_mean`) as per-class
 * box-plot aggregates, as per-student rows for the group comparison, and the probe
 * that says whether a dataset ships either scale at all. Pure builders over
 * `students_competence-levels.json`; `slDataService` declares them as datasets.
 */

import { calculateDetailedBoxPlotStats } from '@tba3/modules/sl-domain';
import { getClassName, getGender, getPropertyValue } from './utils/slStudentCovariates.js';

// ============================================================================
// SELF-EFFICACY BUILDERS
// ============================================================================

/**
 * Build self-efficacy data aggregated by class from student-level JSON data.
 *
 * Each student may have multiple entries (one per subject/domain). We deduplicate
 * by student id so each student's sp_mean is counted once.
 * @param {Array} studentsData - students_competence-levels.json array
 * @returns {Array<{className: string, count: number, values: number[], statistics: object | null}>} One entry per class; empty for a dataset without the scale.
 */
export function buildSelfEfficacyByClass(studentsData) {
    if (!studentsData?.length) return [];

    // Deduplicate: collect one sp_mean per student, grouped by class
    const studentsByClass = new Map();

    for (const entry of studentsData) {
        const className = getClassName(entry.covariates);
        if (!className) continue;

        const spMean = getPropertyValue(entry.properties, 'sp_mean');
        if (spMean === null) continue;

        if (!studentsByClass.has(className)) {
            studentsByClass.set(className, new Map());
        }
        // Map keyed by student id → sp_mean (deduplicates across domains)
        studentsByClass.get(className).set(entry.id, spMean);
    }

    const results = [];
    for (const [className, studentMap] of studentsByClass) {
        const values = Array.from(studentMap.values()).sort((a, b) => a - b);
        const n = values.length;

        results.push({
            className,
            count: n,
            values,
            statistics: n > 0 ? calculateDetailedBoxPlotStats(values) : null,
        });
    }

    return results.sort((a, b) => a.className.localeCompare(b.className));
}

/**
 * Build self-efficacy data aggregated for the whole school from student-level JSON data.
 * @param {Array} studentsData - students_competence-levels.json array
 * @returns {{className: string, count: number, values: number[], statistics: object} | null} The school aggregate, or `null` for a dataset without the scale.
 */
export function buildSelfEfficacySchool(studentsData) {
    if (!studentsData?.length) return null;

    // Deduplicate: one sp_mean per student
    const studentMeans = new Map();

    for (const entry of studentsData) {
        const spMean = getPropertyValue(entry.properties, 'sp_mean');
        if (spMean === null) continue;
        studentMeans.set(entry.id, spMean);
    }

    const values = Array.from(studentMeans.values()).sort((a, b) => a - b);
    if (values.length === 0) return null;

    return {
        className: 'Schule',
        count: values.length,
        values,
        statistics: calculateDetailedBoxPlotStats(values),
    };
}

// ============================================================================
// TEACHING QUALITY BUILDERS
// ============================================================================

/**
 * Build teaching quality boxplot statistics per class+subject (and school aggregate)
 * from student-level JSON data.
 *
 * Each student may have multiple entries (one per domain within a subject).
 * We deduplicate by student id + subject so each student's tq_mean is counted once
 * per subject.
 * @param {Array} studentsData - students_competence-levels.json array
 * @returns {Array<{className: string, subjectName: string, count: number, values: number[], statistics: object | null}>}
 *          Includes both per-class and school-aggregate entries (className = 'Schule').
 */
export function buildTeachingQualityByClassSubject(studentsData) {
    if (!studentsData?.length) return [];

    // Collect one tq_mean per student per subject, grouped by class+subject
    // Key: "className|subjectName" → Map<studentId, tqMean>
    const byClassSubject = new Map();
    // Also accumulate school-level aggregates per subject
    // Key: subjectName → Map<studentId, tqMean>
    const bySchoolSubject = new Map();

    for (const entry of studentsData) {
        const className = getClassName(entry.covariates);
        const subjectName = entry.subject?.name;
        if (!className || !subjectName) continue;

        const tqMean = getPropertyValue(entry.properties, 'tq_mean');
        if (tqMean === null) continue;

        // Per-class grouping (deduplicate by student+subject)
        const classKey = `${className}|${subjectName}`;
        if (!byClassSubject.has(classKey)) {
            byClassSubject.set(classKey, { className, subjectName, students: new Map() });
        }
        byClassSubject.get(classKey).students.set(entry.id, tqMean);

        // School aggregate (deduplicate by student+subject)
        if (!bySchoolSubject.has(subjectName)) {
            bySchoolSubject.set(subjectName, new Map());
        }
        bySchoolSubject.get(subjectName).set(entry.id, tqMean);
    }

    const results = [];

    // Per-class entries
    for (const { className, subjectName, students } of byClassSubject.values()) {
        const values = Array.from(students.values()).sort((a, b) => a - b);
        results.push({
            className,
            subjectName,
            count: values.length,
            values,
            statistics: values.length > 0 ? calculateDetailedBoxPlotStats(values) : null,
        });
    }

    // School aggregate entries
    for (const [subjectName, studentMap] of bySchoolSubject) {
        const values = Array.from(studentMap.values()).sort((a, b) => a - b);
        results.push({
            className: 'Schule',
            subjectName,
            count: values.length,
            values,
            statistics: values.length > 0 ? calculateDetailedBoxPlotStats(values) : null,
        });
    }

    return results;
}

// ============================================================================
// SURVEY SCALE AVAILABILITY
// ============================================================================

/**
 * Which per-student survey scales the loaded dataset actually ships.
 *
 * Only the demo fixture carries `tq_mean` / `sp_mean`; a state export has no
 * questionnaire source for them. Everything that exists only to show or
 * manipulate those two measures — the Balken/Boxplot switch, the Verlauf boxplot
 * switch, table columns, Materialien columns — asks this first, so an absent measure
 * reads as absent rather than as a dead control or a column of em-dashes.
 *
 * Presence is the question, not value: the aggregate builders above return an empty
 * *array* for a dataset without the scale, which is truthy, so `if (buildX(...))` is
 * the wrong guard (pinned by tests/unit/sl/modules/tables/slSurveyColumnGating.test.js).
 * @param {Array} studentsData - students_competence-levels.json array
 * @returns {{hasTeachingQuality: boolean, hasSelfEfficacy: boolean}} Which survey scales this dataset carries at all.
 */
export function detectSurveyScales(studentsData) {
    let hasTeachingQuality = false;
    let hasSelfEfficacy = false;

    for (const entry of studentsData ?? []) {
        for (const property of entry?.properties ?? []) {
            if (property.key === 'tq_mean') hasTeachingQuality = true;
            else if (property.key === 'sp_mean') hasSelfEfficacy = true;
        }
        if (hasTeachingQuality && hasSelfEfficacy) break;
    }

    return { hasTeachingQuality, hasSelfEfficacy };
}

// ============================================================================
// COMPARISON BUILDERS (Group Comparison View)
// ============================================================================

/**
 * Build per-student self-efficacy data for the group comparison view.
 *
 * Returns one entry per student and class with sp_mean, gender, and class. SP is
 * cross-subject, so a student's domain and subject entries collapse into one.
 * @param {Array} studentsData - students_competence-levels.json array
 * @returns {Array<{studentId: string, subject: null, mean: number, gender: string|null, class: string}>} One row per student and class; `gender` is `null` for a student without a gender covariate.
 */
export function buildComparisonSelfEfficacy(studentsData) {
    if (!studentsData?.length) return [];

    // Deduplicate: one sp_mean per student per class (SP is not subject-specific)
    // Uses studentId+className to avoid collisions when IDs are reused across classes
    const seen = new Map();

    for (const entry of studentsData) {
        const className = getClassName(entry.covariates);
        if (!className) continue;

        const dedupeKey = `${entry.id}|${className}`;
        if (seen.has(dedupeKey)) continue;

        const spMean = getPropertyValue(entry.properties, 'sp_mean');
        if (spMean === null) continue;

        // Kept without a gender: only the Geschlecht category needs one, and it
        // filters by value.
        const gender = getGender(entry.covariates);

        seen.set(dedupeKey, {
            studentId: entry.id,
            subject: null, // SP is cross-subject
            mean: spMean,
            gender,
            class: className,
        });
    }

    return Array.from(seen.values());
}

/**
 * Build per-student teaching quality data for the group comparison view.
 *
 * Returns one entry per student per subject with tq_mean, gender, and class.
 * Deduplicates across domains within the same subject.
 * @param {Array} studentsData - students_competence-levels.json array
 * @returns {Array<{studentId: string, subject: string, mean: number, gender: string|null, class: string}>} One row per student and Fach; `gender` is `null` for a student without a gender covariate.
 */
export function buildComparisonTeachingQuality(studentsData) {
    if (!studentsData?.length) return [];

    // Deduplicate: one tq_mean per student per subject per class
    // Uses studentId+className+subject to avoid collisions when IDs are reused across classes
    const seen = new Map();

    for (const entry of studentsData) {
        const subjectName = entry.subject?.name;
        if (!subjectName) continue;

        const className = getClassName(entry.covariates);
        if (!className) continue;

        const dedupeKey = `${entry.id}|${className}|${subjectName}`;
        if (seen.has(dedupeKey)) continue;

        const tqMean = getPropertyValue(entry.properties, 'tq_mean');
        if (tqMean === null) continue;

        // Kept without a gender: only the Geschlecht category needs one, and it
        // filters by value.
        const gender = getGender(entry.covariates);

        seen.set(dedupeKey, {
            studentId: entry.id,
            subject: subjectName,
            mean: tqMean,
            gender,
            class: className,
        });
    }

    return Array.from(seen.values());
}
