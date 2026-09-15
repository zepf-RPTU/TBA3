import { AGG_TYPE_STYLE } from '../enTerms.js';
import { toPercent } from '../../common/domain/itemMeans.js';

/**
 * The slice of a host's EN configuration the style calculation reads.
 * @typedef {object} EnStyleConfig
 * @property {Array<{value: string, fieldName: string}>} styleCategories - The style categories and the record field each is stored under.
 * @property {string[]} domainIds - The two domain ids, in display order.
 */

/**
 * @param {unknown} value - A style percentage as a table row holds it.
 * @returns {number|null} The number, or `null` when the student has none.
 */
function finiteOrNull(value) {
    const numeric = typeof value === 'string' ? parseFloat(value) : value;
    return typeof numeric === 'number' && Number.isFinite(numeric) ? numeric : null;
}

/**
 * @param {Array<number|null>} values - One value per student, `null` where a student has none.
 * @returns {number|null} The mean of the values present, or `null` when none is.
 */
function meanOfPresent(values) {
    const present = values.filter((v) => v !== null);
    if (present.length === 0) return null;
    return present.reduce((acc, value) => acc + value, 0) / present.length;
}

/**
 * Calculate style averages from an array of students.
 *
 * Only the class average depends on the selection; the comparison groups are whole
 * populations and pass through from the cached parse unchanged. Each category averages
 * over the students who have a value for it: a missing value is skipped, never read
 * as 0 %.
 * @param {Array} students - Array of student objects with style percentages
 * @param {string} mode - Current mode: 'all' or a domain id
 * @param {object} context - What the calculation needs, resolved by the caller.
 * @param {EnStyleConfig} context.enConfig - Domain and style-category config.
 * @param {{classAverages: object, comparisonGroups: Array<object>}} context.styleAverages - The class-level parse; comparison groups pass through it unchanged.
 * @returns {{classAverages: {[categoryKey: string]: number|null}, comparisonGroups: Array<object>}} Averages keyed by `${domain}_${style}`, `null` for a category no selected student has a value for; a selection without any value falls back to the cached class averages.
 */
export function calculateStyleAveragesForStudents(students, mode, { enConfig, styleAverages }) {
    // Comparison groups are whole populations and do not depend on the selection.
    const cachedAverages = styleAverages;

    // If no students provided, return cached averages
    if (!students || students.length === 0) {
        return cachedAverages;
    }

    const cats = enConfig.styleCategories;
    /** @type {{[categoryKey: string]: number|null}} */
    const classAverages = {};

    if (mode === 'all') {
        // Both domains, read from each student's nested per-domain style object.
        for (const domainId of enConfig.domainIds) {
            for (const cat of cats) {
                classAverages[`${domainId}_${cat.value}`] = meanOfPresent(
                    students.map((student) => finiteOrNull(student[domainId]?.[cat.fieldName])),
                );
            }
        }
    } else {
        // Single domain: the visible style fields already point at this domain's values.
        for (const cat of cats) {
            classAverages[`${mode}_${cat.value}`] = meanOfPresent(
                students.map((student) => finiteOrNull(student[cat.fieldName])),
            );
        }
    }

    if (Object.values(classAverages).every((value) => value === null)) {
        return cachedAverages;
    }

    return { classAverages, comparisonGroups: cachedAverages.comparisonGroups };
}

/**
 * Per-category style percentages for one student, as both style charts draw them.
 *
 * Reads the raw `students_aggregation` entries (one per domain per student), not the
 * flat table records: only the student view has a `studentId`, and that is the view
 * that holds the raw entries. Called with a nullish `studentId` — the class view — it
 * returns the all-`null` map, which is why the null guard stays rather than moving to
 * the callers.
 * @param {Array} styleAggregationEntries - students_aggregation entries with `id`, `domain.id` and `aggregations[]`.
 * @param {string|null} studentId - The student to read, or null for none.
 * @param {EnStyleConfig} enConfig - Domain and style-category config.
 * @returns {{[categoryKey: string]: number|null}} Percentage per `${domain}_${style}` key; `null` where the student has no value, which the charts draw as no mark rather than 0 %.
 */
export function buildStyleCategoryPerformance(styleAggregationEntries, studentId, enConfig) {
    /** @type {{[categoryKey: string]: number|null}} */
    const result = {};
    const cats = enConfig.styleCategories;
    for (const dk of enConfig.domainIds) {
        for (const cat of cats) {
            result[`${dk}_${cat.value}`] = null;
        }
    }

    if (!styleAggregationEntries || !studentId) return result;

    // One entry per domain for this student.
    const studentEntries = styleAggregationEntries.filter((e) => e.id === studentId);

    for (const entry of studentEntries) {
        const domainKey = entry.domain?.id;
        if (!domainKey) continue;

        for (const agg of entry.aggregations ?? []) {
            if (agg.type !== AGG_TYPE_STYLE) continue;
            const key = `${domainKey}_${agg.value}`;
            const mean = agg.descriptiveStatistics?.mean;
            if (key in result && Number.isFinite(mean)) {
                result[key] = toPercent(mean);
            }
        }
    }

    return result;
}
