import { rollup } from 'd3-array';

/**
 * One student's row within a domain result: the student, and the level reached in that
 * Fach/Domäne (`null` without one).
 * @typedef {{
 *   studentId: string,
 *   gender: string|null,
 *   groupName: string,
 *   traits: Set<string>,
 *   competenceLevelName: string|null,
 *   competenceScaleId?: string|undefined,
 * }} SlStudentResult
 */

/**
 * Distinct headcount with trait and gender tallies.
 * @typedef {object} SlStudentStats
 * @property {number} nrStudents - Students behind the row.
 * @property {{[trait: string]: number}} traitCounts - Students per trait code.
 * @property {{[gender: string]: number}} genderCounts - Students per gender.
 */

/**
 * One group's results in one Fach × Domäne.
 * @typedef {object} SlDomainResult
 * @property {string} subjectName
 * @property {string|null} domainId - `null` for a domainless Fach.
 * @property {string|null} domainName - `null` for a domainless Fach.
 * @property {string} groupName - The group's name (the key its survey rows are filed under), or `Schule` on an aggregated row.
 * @property {SlStudentStats & {competenceLevelCounts: {[level: string]: number}, competenceLevelNames?: string[], scaleId?: string}} stats - Headcounts and the per-level counts.
 * @property {SlStudentResult[]} studentResults
 */

/**
 * @template T
 * @param {T[]} dataArray - Grouped rows, each holding a set of students.
 * @param {(item: T) => Array<{traits?: Iterable<string>}>|null|undefined} getStudents
 * @returns {Array<string>} Every trait code that occurs, deduplicated, in first-seen order.
 */
export function collectTraitCodesFromData(dataArray, getStudents) {
    const traitCodes = new Set();
    dataArray.forEach((item) => {
        const students = getStudents(item);
        if (students) {
            for (const student of students) {
                if (student.traits) {
                    for (const trait of student.traits) {
                        traitCodes.add(trait);
                    }
                }
            }
        }
    });
    return Array.from(traitCodes);
}

/**
 * The school's tallies in one Fach × Domäne: the sum of its groups' own. The groups
 * are disjoint, so each student is counted once.
 * @param {Array<{stats?: SlDomainResult['stats']}>} groupResults - The group rows of one Fach × Domäne.
 * @returns {{nrStudents: number, traitCounts: {[trait: string]: number}, genderCounts: {[gender: string]: number}, competenceLevelCounts: {[level: string]: number}}}
 */
export function aggregateGroupResults(groupResults) {
    const total = { nrStudents: 0, traitCounts: {}, genderCounts: {}, competenceLevelCounts: {} };
    /**
     * @param {{[key: string]: number}} into - The tally to add to.
     * @param {{[key: string]: number}|undefined} counts - One group's tally.
     */
    const add = (into, counts) => {
        for (const [key, count] of Object.entries(counts ?? {})) {
            into[key] = (into[key] || 0) + (count || 0);
        }
    };
    for (const { stats } of groupResults) {
        total.nrStudents += stats?.nrStudents ?? 0;
        add(total.traitCounts, stats?.traitCounts);
        add(total.genderCounts, stats?.genderCounts);
        add(total.competenceLevelCounts, stats?.competenceLevelCounts);
    }
    return total;
}

/**
 * Aggregate trait and gender counts from student result rows, counting each student once.
 * A student is a group and an id: ids repeat across groups in the SL payloads.
 * @param {Array<{groupName: string, studentId: string, traits?: Iterable<string>, gender?: string|null}>|null|undefined} studentResults
 * @returns {SlStudentStats}
 */
export function aggregateStudentStats(studentResults) {
    if (!studentResults || studentResults.length === 0) {
        return { nrStudents: 0, traitCounts: {}, genderCounts: {} };
    }

    const uniqueStudents = new Map();
    studentResults.forEach((student) => {
        const key = `${student.groupName}|${student.studentId}`;
        if (!uniqueStudents.has(key)) {
            uniqueStudents.set(key, student);
        }
    });
    const students = Array.from(uniqueStudents.values());

    /**
     * @param {string[]} keys - One key per student and trait or gender.
     * @returns {{[key: string]: number}} The students per key.
     */
    const tally = (keys) =>
        Object.fromEntries(
            rollup(
                keys,
                (perKey) => perKey.length,
                (key) => key,
            ),
        );
    return {
        nrStudents: students.length,
        traitCounts: tally(students.flatMap((student) => [...(student.traits ?? [])])),
        genderCounts: tally(
            students.flatMap((student) => (student.gender ? [student.gender] : [])),
        ),
    };
}

/**
 * @param {SlDomainResult[]} results - Results of one section or one Fach.
 * @returns {NonNullable<SlDomainResult['studentResults']>} Not deduplicated.
 */
export function studentsOf(results) {
    return results.flatMap((result) => result.studentResults ?? []);
}

/**
 * The students one group (or the school) tested in one Fach: the trait and gender tallies
 * over its distinct students. The headcount is the value group's stated `total` where the
 * Fach has one Domäne; a Fach split into Domänen states none, so there it is the distinct
 * students.
 * @param {SlDomainResult[]} subjectResults - The group's (or the school's) results in the Fach, one per Domäne.
 * @returns {SlStudentStats}
 */
export function aggregateSubjectStats(subjectResults) {
    const stats = aggregateStudentStats(studentsOf(subjectResults));
    if (subjectResults.length === 1) stats.nrStudents = subjectResults[0].stats.nrStudents;
    return stats;
}
