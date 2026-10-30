import { isExternalPopulation } from '../../common/domain/comparisonGroupLabels.js';
import { subjectNamesOf } from './slQueryPrimitives.js';

/** @type {Readonly<Record<string, string>>} */
const SUBJECT_SHORT_DISPLAY_NAMES = Object.freeze({
    Mathematik: 'Mathe',
});

/**
 * The material page types, in display order. A `disabled` type has no page yet — it
 * shows what is planned and cannot be chosen, and a material link naming it cannot open.
 * @type {ReadonlyArray<Readonly<{value: string, glossarySubKey: string, disabled?: boolean}>>}
 */
const MATERIAL_TYPE_OPTIONS = Object.freeze([
    Object.freeze({ value: 'Übersicht', glossarySubKey: 'overview' }),
    Object.freeze({
        value: 'Ergebniszusammenfassung',
        glossarySubKey: 'summary',
    }),
    Object.freeze({ value: 'Datensicht', glossarySubKey: 'data-view', disabled: true }),
    Object.freeze({ value: 'Leitfragen', glossarySubKey: 'questions', disabled: true }),
]);

const CURRENT_MATERIAL_SUBJECT_TOKEN = 'Fach';

/**
 * The Fach name a payload value names, or `null` when it names none.
 * @param {unknown} subjectName
 * @returns {string|null} The trimmed name, or `null` for a non-string or an empty one.
 */
function normalizeDataSubjectName(subjectName) {
    if (typeof subjectName !== 'string') {
        return null;
    }

    return subjectName.trim() || null;
}

/**
 * The short display name a Fach is shown under where space is tight.
 * @param {unknown} subjectName
 * @returns {string} The short name, the full name when there is no short form, or empty for an unknown value.
 */
function getSubjectShortDisplayName(subjectName) {
    const normalizedSubjectName = normalizeDataSubjectName(subjectName);
    return normalizedSubjectName
        ? (SUBJECT_SHORT_DISPLAY_NAMES[normalizedSubjectName] ?? normalizedSubjectName)
        : '';
}

/**
 * Whether a material type has a page.
 * @param {string} type - The type, as a template writes it.
 * @returns {boolean} True for a type that can be chosen.
 */
function hasMaterialPage(type) {
    return MATERIAL_TYPE_OPTIONS.some((option) => option.value === type && !option.disabled);
}

/**
 * Whether a material token asks for the current Fach rather than naming one.
 * @param {unknown} subject
 * @returns {boolean} True for the `Fach` placeholder token.
 */
function isCurrentMaterialSubjectToken(subject) {
    return subject === CURRENT_MATERIAL_SUBJECT_TOKEN;
}

/**
 * The Fächer with material pages: every Fach the school's own value groups carry, in
 * payload order. The pages are computed from the dataset, so each of them has one.
 *
 * Landesschnitt value groups do not count: a state average is appended to the export,
 * not sat by the school, and may come with no school value group behind it.
 * @param {import('../../common/data/schemas/competenceLevels.js').CompetenceLevelsValueGroup[]} competenceLevels
 * @returns {string[]} The Fach names, as the payload writes them.
 */
function deriveMaterialSubjects(competenceLevels) {
    return subjectNamesOf(competenceLevels.filter((entry) => !isExternalPopulation(entry)));
}

export {
    deriveMaterialSubjects,
    getSubjectShortDisplayName,
    hasMaterialPage,
    isCurrentMaterialSubjectToken,
    MATERIAL_TYPE_OPTIONS,
    normalizeDataSubjectName,
};
