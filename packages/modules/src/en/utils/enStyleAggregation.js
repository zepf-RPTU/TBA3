import { mean } from 'd3-array';

import { finiteOrNull } from '../../common/utils/numberFormat.js';
import { styleCategoryKey } from './enStyleOrder.js';

/** @typedef {import('./enStudentDataAdapter.js').EnStudentRecord} EnStudentRecord */

/**
 * The slice of a host's EN configuration the style calculation reads.
 * @typedef {object} EnStyleConfig
 * @property {Array<{value: string}>} styleCategories - The style categories, in priority order.
 * @property {string[]} domainIds - The two domain ids, in display order.
 */

/**
 * One value per configured domain × style category.
 * @param {EnStyleConfig} enConfig
 * @param {(domainId: string, style: string) => number|null} valueOf
 * @returns {{[categoryKey: string]: number|null}} The values, by `styleCategoryKey`.
 */
function byStyleCategory(enConfig, valueOf) {
    return Object.fromEntries(
        enConfig.domainIds.flatMap((domainId) =>
            enConfig.styleCategories.map((cat) => [
                styleCategoryKey(domainId, cat.value),
                valueOf(domainId, cat.value),
            ]),
        ),
    );
}

/**
 * The group averages over a selection of students, for both domains, so the result
 * holds whichever domain is drawn. Only the group average depends on the selection; the
 * comparison groups are whole populations the caller keeps from the group-level parse.
 * Each category averages over the students who have a value for it: a missing value is
 * skipped, never read as 0 %.
 * @param {Array<Pick<EnStudentRecord, 'domains'>>} students
 * @param {EnStyleConfig} enConfig
 * @returns {{groupAverages: {[categoryKey: string]: number|null}}|null} Averages keyed by `${domain}_${style}`, `null` for a category no selected student has a value for; `null` as a whole when no selected student has any value — the selection has no style profile, and the card says so rather than showing the group's.
 */
export function calculateStyleAveragesForStudents(students, enConfig) {
    const groupAverages = byStyleCategory(
        enConfig,
        (domainId, style) =>
            mean(students, (student) => finiteOrNull(student.domains[domainId]?.styles?.[style])) ??
            null,
    );
    return Object.values(groupAverages).every((value) => value === null) ? null : { groupAverages };
}

/**
 * Per-category style percentages for one student, as both style charts draw them.
 * Without a student it returns the all-`null` map.
 * @param {Pick<EnStudentRecord, 'domains'>|null|undefined} student
 * @param {EnStyleConfig} enConfig
 * @returns {{[categoryKey: string]: number|null}} Percentage per `${domain}_${style}` key; `null` where the student has no value, which the charts draw as no mark rather than 0 %.
 */
export function buildStyleCategoryPerformance(student, enConfig) {
    return byStyleCategory(
        enConfig,
        (domainId, style) => student?.domains[domainId]?.styles?.[style] ?? null,
    );
}
