/**
 * A student's identity as the payload's student entries carry it: the id, the name
 * properties, the gender covariate and the trait covariates. Traits arrive as repeated
 * `{ type: 'trait', label, value }` covariates, one per trait a student has; the label is
 * the payload's own name for a code, read once per store into a catalog's `TRAIT_LABELS`
 * dataset (`readTraitLabels`), since column headers need it without a student.
 */

import { compareText } from '../utils/compare.js';
import { COVARIATE_TYPE, PROPERTY_KEY } from './apiValueMaps.js';

const TRAIT_COVARIATE_TYPE = 'trait';

/**
 * A value group of a student document, which names the student and its Lerngruppe.
 * @typedef {{id: string, properties: Array<{key: string, value: string}>, covariates: import('../data/schemas/valueGroup.js').Covariate[]}} StudentEntry
 * @typedef {{studentId: string, firstName: string, lastName: string}} StudentName
 * @typedef {StudentName & {gender: string, traits: Set<string>}} StudentIdentity
 */

/**
 * One covariate's value off a student entry's `covariates[]`, by its `type`.
 * @param {Array<{type?: string, value?: string}>|null|undefined} covariates
 * @param {string} type - The covariate: `gender`, `group`, …
 * @returns {string|null} Its value, or `null` when the entry carries none.
 */
export function readCovariate(covariates, type) {
    return covariates?.find((covariate) => covariate.type === type)?.value ?? null;
}

/**
 * Read a text property off a value group's `properties[]`, as the payload spells it.
 * @param {ReadonlyArray<{key: string, value?: unknown}>|null|undefined} properties
 * @param {string} key - e.g. 'testPeriod', 'booklet'
 * @returns {string|null} The value, or `null` when the value group does not carry that property.
 */
export function getPropertyText(properties, key) {
    const value = properties?.find((p) => p.key === key)?.value;
    return value === undefined || value === null ? null : String(value);
}

/**
 * Read a numeric property off a value group's `properties[]`, such as `sp_mean`.
 * @param {ReadonlyArray<{key: string, value?: unknown}>|null|undefined} properties
 * @param {string} key
 * @returns {number|null} `null` when the value group does not carry that property or it is not numeric.
 */
export function getPropertyValue(properties, key) {
    const value = parseFloat(getPropertyText(properties, key) ?? '');
    return isNaN(value) ? null : value;
}

/**
 * Read a student's id and name off a payload entry.
 * @param {StudentEntry} entry - A student entry of a student document, which requires both name parts.
 * @returns {StudentName}
 */
export function readStudentName(entry) {
    return {
        studentId: entry.id,
        firstName: /** @type {string} */ (
            getPropertyText(entry.properties, PROPERTY_KEY.FIRST_NAME)
        ),
        lastName: /** @type {string} */ (getPropertyText(entry.properties, PROPERTY_KEY.LAST_NAME)),
    };
}

/**
 * The Lerngruppe a student entry sits in: the `name` of that group's value group.
 * @param {StudentEntry} entry - A student entry of a student document, which requires the covariate.
 * @returns {string}
 */
export function readStudentGroup(entry) {
    return /** @type {string} */ (readCovariate(entry.covariates, COVARIATE_TYPE.GROUP));
}

/**
 * A student's trait codes: every covariate tagged `trait`, the other dimensions left out.
 * @param {import('../data/schemas/valueGroup.js').Covariate[]|null} [covariates]
 * @returns {Set<string>}
 */
export function readTraitCodes(covariates) {
    const codes = new Set();
    for (const covariate of covariates ?? []) {
        if (covariate.type === TRAIT_COVARIATE_TYPE) codes.add(covariate.value);
    }
    return codes;
}

/**
 * The payload's own label per trait code, over student entries; a later label for a code
 * wins, and a code delivered without one is absent, so callers fall back to the glossary.
 * @param {Iterable<StudentEntry>} entries - The student entries of the person documents.
 * @returns {Map<string, string>} Trait code → label.
 */
export function readTraitLabels(entries) {
    /** @type {Map<string, string>} */
    const labels = new Map();
    for (const entry of entries) {
        for (const covariate of entry.covariates) {
            if (covariate.type === TRAIT_COVARIATE_TYPE && covariate.label) {
                labels.set(covariate.value, covariate.label);
            }
        }
    }
    return labels;
}

/**
 * Read a student's full identity off a payload entry.
 * @param {StudentEntry} entry - A student entry of any student document.
 * @returns {StudentIdentity} Id, name, the gender as the API spells it ('' when not shipped) and trait codes.
 */
export function readStudentIdentity(entry) {
    return {
        ...readStudentName(entry),
        gender: readCovariate(entry.covariates, COVARIATE_TYPE.GENDER) ?? '',
        traits: readTraitCodes(entry.covariates),
    };
}

/**
 * The "Nachname, Vorname" label a student is listed and selected under.
 * @param {{firstName: string, lastName: string}} student
 * @returns {string}
 */
export function formatStudentName(student) {
    return `${student.lastName}, ${student.firstName}`;
}

/**
 * The "Vorname Nachname" label a student is named by in running text, such as a tooltip.
 * @param {{firstName: string, lastName: string}} student
 * @returns {string}
 */
export function formatStudentFullName(student) {
    return `${student.firstName} ${student.lastName}`;
}

/**
 * Sort students by last name, then first name, using German collation.
 * @template {{firstName: string, lastName: string}} T
 * @param {ReadonlyArray<T>} students
 * @returns {T[]} New sorted array (input untouched)
 */
export function sortStudentsByName(students) {
    return [...students].sort(
        (a, b) => compareText(a.lastName, b.lastName) || compareText(a.firstName, b.firstName),
    );
}

/**
 * The options of a student select, in the order the dropdown lists them.
 * @param {ReadonlyArray<{studentId: string, firstName: string, lastName: string}>} students - One record per student
 * @returns {{value: string, label: string}[]} Id and "Nachname, Vorname", sorted by name.
 */
export function toStudentSelectItems(students) {
    return sortStudentsByName(students).map((student) => ({
        value: student.studentId,
        label: formatStudentName(student),
    }));
}
