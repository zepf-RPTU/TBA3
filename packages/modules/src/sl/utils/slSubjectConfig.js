import { isStateEntry } from '../slCompetenceLevelIndex.js';

const SUBJECT_SHORT_DISPLAY_NAMES = Object.freeze({
    Mathematik: 'Mathe',
});

const MATERIAL_SUBJECT_ALIASES = Object.freeze({
    Gesamt: 'Gesamt',
    Deutsch: 'Deutsch',
    Englisch: 'Englisch',
    Mathe: 'Mathe',
    Mathematik: 'Mathe',
});

/**
 * The material subject buttons, in display order. `Gesamt` always leads; the three
 * subjects after it are exactly the ones `materialContent.json` carries pages for,
 * which is why this list is not derived from the payload alone — a dataset can ship a
 * subject the material content says nothing about (`sl` ships Französisch).
 * `deriveMaterialSubjectOptions` intersects the two.
 */
const MATERIAL_SUBJECT_OPTIONS = Object.freeze([
    Object.freeze({ value: 'Gesamt', label: 'Gesamt', glossarySubKey: 'general' }),
    Object.freeze({ value: 'Deutsch', label: 'Deutsch', glossarySubKey: 'de' }),
    Object.freeze({ value: 'Englisch', label: 'Englisch', glossarySubKey: 'en' }),
    Object.freeze({ value: 'Mathe', label: 'Mathe', glossarySubKey: 'ma' }),
]);

/**
 * The material page types, in display order: the header's type buttons and the tokens
 * an info-box material link may name.
 */
const MATERIAL_TYPE_OPTIONS = Object.freeze([
    Object.freeze({ value: 'Übersicht', label: 'Übersicht', glossarySubKey: 'overview' }),
    Object.freeze({
        value: 'Ergebniszusammenfassung',
        label: 'Ergebniszusammenfassung',
        glossarySubKey: 'summary',
    }),
    Object.freeze({ value: 'Datensicht', label: 'Datensicht', glossarySubKey: 'data-view' }),
    Object.freeze({ value: 'Leitfragen', label: 'Leitfragen', glossarySubKey: 'questions' }),
]);

const CURRENT_MATERIAL_SUBJECT_TOKEN = 'Fach';

/**
 * The Fach name a payload value names, or `null` when it names none.
 * @param {any} subjectName - The name as the payload wrote it.
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
 * @param {any} subjectName - The Fach name.
 * @returns {string} The short name, the full name when there is no short form, or empty for an unknown value.
 */
function getSubjectShortDisplayName(subjectName) {
    const normalizedSubjectName = normalizeDataSubjectName(subjectName);
    return normalizedSubjectName
        ? (SUBJECT_SHORT_DISPLAY_NAMES[normalizedSubjectName] ?? normalizedSubjectName)
        : '';
}

/**
 * Canonical material-subject token for a value written in a template.
 * @param {any} subject - The token.
 * @returns {string|null} The canonical token, or `null` when it names no known subject.
 */
function normalizeMaterialSubject(subject) {
    if (typeof subject !== 'string') {
        return null;
    }

    const trimmedSubject = subject.trim();
    return MATERIAL_SUBJECT_ALIASES[trimmedSubject] ?? null;
}

/**
 * Canonical material-type token for a value written in a template.
 * @param {any} type - The token.
 * @returns {string|null} The canonical token, or `null` when it names no known type.
 */
function normalizeMaterialType(type) {
    if (typeof type !== 'string') {
        return null;
    }

    const trimmedType = type.trim();
    return MATERIAL_TYPE_OPTIONS.find((option) => option.value === trimmedType)?.value ?? null;
}

/**
 * Whether a material token asks for the view's current Fach rather than naming one.
 * @param {any} subject - The token.
 * @returns {boolean} True for the `Fach` placeholder token.
 */
function isCurrentMaterialSubjectToken(subject) {
    return subject === CURRENT_MATERIAL_SUBJECT_TOKEN;
}

/**
 * The material subject buttons a dataset can actually offer: `Gesamt` plus every
 * subject its payload carries that the material content covers.
 *
 * A fixed list would offer a school that sat only Englisch Deutsch and Mathe buttons
 * leading to pages with no school-side data behind them. Subjects the material content
 * says nothing about are dropped rather than given an empty page, which is what keeps
 * `sl`'s Französisch out.
 *
 * Landesschnitt rows are not evidence of a subject: a state average is appended to the
 * export, not sat by the school, and the pages behind these buttons are all school-side.
 * Counting them would re-open exactly the gap this function closes — an export may carry
 * a Deutsch and a Mathematik Landesschnitt with no school row behind either.
 * @param {Array<{type?: string, subject?: {name?: string}}>} competenceLevels
 *        competence-levels.json rows
 * @returns {Array<{value: string, label: string, glossarySubKey: string}>} One option per Fach the dataset actually has material for.
 */
function deriveMaterialSubjectOptions(competenceLevels) {
    const present = new Set(
        (competenceLevels ?? [])
            .filter((entry) => !isStateEntry(entry))
            .map((entry) => normalizeMaterialSubject(entry?.subject?.name))
            .filter(Boolean),
    );
    return MATERIAL_SUBJECT_OPTIONS.filter(
        (option) => option.value === 'Gesamt' || present.has(option.value),
    );
}

export {
    deriveMaterialSubjectOptions,
    getSubjectShortDisplayName,
    isCurrentMaterialSubjectToken,
    MATERIAL_SUBJECT_OPTIONS,
    MATERIAL_TYPE_OPTIONS,
    normalizeDataSubjectName,
    normalizeMaterialSubject,
    normalizeMaterialType,
};
