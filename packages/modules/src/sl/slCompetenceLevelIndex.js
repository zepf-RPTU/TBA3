/**
 * The competence-levels payload, discriminated once into named collections.
 *
 * A SL dataset ships one flat `competence-levels.json` array holding the school's own
 * rows, one row per class, and the Landesschnitt rows a state may split by track. Every
 * SL surface needs the same four questions answered — which row is the school, which are
 * classes, which are state, and which Fach × Domäne each belongs to — so they are
 * answered once, here, and nowhere else.
 *
 * Pure and store-free on purpose: a leaf that receives rows through a render payload
 * calls this directly, and a consumer with no DataStore at all can index a payload it
 * fetched itself. tba3's store-holding code goes through `getCompetenceLevelIndex` in
 * `slDataService.js`, which caches the result as a dataset.
 */

import { isComparisonValueGroup } from '../common/domain/comparisonGroupLabels.js';

// ============================================================================
// SCHOOL ID DETECTION
// ============================================================================

/**
 * The school ID from the competence-levels data — the row whose `type` says school.
 *
 * This used to guess: the first non-state row whose name did not start with a digit.
 * That worked only because the school row happens to precede the state rows, and only
 * while `isStateEntry` recognised them at all.
 * @param {Array} data - competence-levels.json array
 * @returns {string|null} The school id, e.g. "gym-beispielstadt"
 */
function detectSchoolId(data) {
    return data?.find((entry) => entry?.type === 'school')?.id ?? null;
}

// ============================================================================
// FILTERING HELPERS
// ============================================================================

/**
 * Get only school-level aggregation entries.
 * @param {Array} data - competence-levels.json array
 * @param {string|null} schoolId - The school id from detectSchoolId()
 * @returns {Array} The school's own aggregate rows.
 */
function filterSchoolEntries(data, schoolId) {
    return data.filter((e) => e.id === schoolId && !isStateEntry(e));
}

/**
 * Get only state-average aggregation entries.
 * @param {Array} data - competence-levels.json array
 * @returns {Array} Every Landesschnitt row, tracks included.
 */
function filterStateEntries(data) {
    return data.filter(isStateEntry);
}

/**
 * Get only class-level entries: every row that is not a comparison row. Every other type —
 * the school, a Landesschnitt, a district average — is a comparison row, never a class.
 * @param {Array} data - competence-levels.json array
 * @returns {Array} The class rows.
 */
function filterClassEntries(data) {
    return data.filter((e) => !isComparisonValueGroup(e));
}

/**
 * Every comparison-average entry for one subject/domain combination, in payload order.
 *
 * The comparison averages SL reports are the school's own aggregate plus every state
 * average. Deliberately not a `find()` — a state that
 * splits its Landesschnitt by track ships several `state` rows per subject/domain
 * (nw: "Landesschnitt HSA-GK" and "Landesschnitt MSA"), and taking the first one
 * silently drops the rest.
 * @param {Array} data - competence-levels.json array
 * @param {string} subjectName - Fach to match.
 * @param {string|null} [domainId] - Domäne to match; `null` matches a Fach with no domain split.
 * @returns {Array} Matching entries; empty when the payload delivers none
 */
export function findComparisonEntriesForSubjectDomain(data, subjectName, domainId = null) {
    const normalizedDomainId = domainId ?? null;
    const schoolId = detectSchoolId(data);

    return (data ?? []).filter(
        (entry) =>
            (isStateEntry(entry) || entry.id === schoolId) &&
            entry.subject?.name === subjectName &&
            (entry.domain?.id ?? null) === normalizedDomainId,
    );
}

// ============================================================================
// GROUPING / DERIVATION
// ============================================================================

/**
 * Derive the subject-domain structure from competence-levels data.
 *
 * Returns a map of unique subjects, each with their domains and
 * competency level names.
 * @param {Array} data - competence-levels.json array
 * @returns {Array<{subjectName: string, domains: Array<{domainId: string|null, domainName: string|null, levels: string[]}>}>} One entry per Fach, each listing its Domänen and their scale bands.
 */
function deriveSubjectDomainMap(data) {
    const subjectMap = new Map();

    for (const entry of data) {
        const subjectName = entry.subject?.name;
        if (!subjectName) continue;

        if (!subjectMap.has(subjectName)) {
            subjectMap.set(subjectName, new Map());
        }
        const domainMap = subjectMap.get(subjectName);

        const domainId = entry.domain?.id ?? null;
        if (!domainMap.has(domainId)) {
            domainMap.set(domainId, {
                domainId,
                domainName: entry.domain?.name ?? null,
                levels: (entry.competenceLevels ?? []).map((cl) => cl.nameShort),
            });
        }
    }

    return Array.from(subjectMap.entries()).map(([subjectName, domainMap]) => ({
        subjectName,
        domains: Array.from(domainMap.values()),
    }));
}

/**
 * Derive unique class names from class-level entries.
 * @param {Array} classEntries - Class-level entries, i.e. a `CompetenceLevelIndex.classRows`
 * @returns {string[]} Sorted unique class names — on an API export the Testheft-Gruppen, e.g. ["E_E1_08_ABCD", "E_E2_08_WXYZ"]
 */
export function deriveClassNames(classEntries) {
    return [...new Set(classEntries.map((e) => e.name))].sort();
}

/**
 * Group class-level entries by subject + domain combination.
 * Each group is an array of entries (one per class) sharing the same subject+domain.
 * @param {Array} classEntries - Class-level entries (from filterClassEntries)
 * @returns {Array<Array>} Array of groups, each group = entries for one subject+domain combo
 */
function groupClassEntriesBySubjectDomain(classEntries) {
    const groups = new Map();

    for (const entry of classEntries) {
        const key = `${entry.subject?.name}|${entry.domain?.id ?? 'null'}`;
        if (!groups.has(key)) {
            groups.set(key, []);
        }
        groups.get(key).push(entry);
    }

    return Array.from(groups.values());
}

// ============================================================================
// COMPETENCE LEVEL INDEX
// ============================================================================

/**
 * The competence-levels payload, discriminated once into named collections.
 * @typedef {object} CompetenceLevelIndex
 * @property {string|null} schoolId - Id of the `type === 'school'` row, or `null` when the payload has none.
 * @property {Array} schoolRows - The school's own aggregate rows.
 * @property {Array} classRows - Every row that is not a comparison row (the dataset's classes).
 * @property {Array} stateRows - Every Landesschnitt row, tracks included.
 * @property {Array<{subjectName: string, domains: Array<{domainId: string|null, domainName: string|null, levels: string[]}>}>} subjectDomains - One entry per Fach with its Domänen and scale bands.
 * @property {Array<Array>} classGroups - classRows grouped by Fach|Domäne, in payload order.
 */

/**
 * Index a competence-levels array into a {@link CompetenceLevelIndex}.
 *
 * The one place the flat payload is discriminated into school / Klassen /
 * Landesschnitt rows — the filter helpers above are its implementation. Pure on
 * purpose: leaf modules that receive rows through a render payload or function
 * parameter (no DataStore) call this directly; store-holding code goes through
 * `getCompetenceLevelIndex`. Three helpers stay exported on their own, because
 * each has a subset-shaped or per-row use the whole-payload index cannot serve:
 * `isStateEntry`, `deriveClassNames`, `findComparisonEntriesForSubjectDomain`.
 * @param {Array|null|undefined} rows - competence-levels.json array; a missing payload yields the empty index.
 * @returns {CompetenceLevelIndex} The indexed payload.
 */
export function buildCompetenceLevelIndex(rows) {
    const data = Array.isArray(rows) ? rows : [];
    const schoolId = detectSchoolId(data);
    const classRows = filterClassEntries(data);
    return {
        schoolId,
        schoolRows: filterSchoolEntries(data, schoolId),
        classRows,
        stateRows: filterStateEntries(data),
        subjectDomains: deriveSubjectDomainMap(data),
        classGroups: groupClassEntriesBySubjectDomain(classRows),
    };
}

/**
 * A Landesschnitt row, identified by `type` — the spec's discriminator.
 *
 * Not by `id === 'state'` or `name === 'Landesschnitt'`: only the demo fixture uses
 * those literals. A state that splits its Landesschnitt by track ships rows keyed
 * `nw-gy`, `nw-hsa`, … and named "Landesschnitt GY", "Landesschnitt HSA-HS", … — an
 * id/name test recognises none of them, so every one of those rows was counted as a
 * class (13 "classes" for a five-class school) while the state comparison the SL views
 * are built around came back empty. `type` is present on every row of every dataset.
 * @param {any} entry - A payload row.
 * @returns {boolean} True for a Landesschnitt row.
 */
export function isStateEntry(entry) {
    return entry?.type === 'state';
}
