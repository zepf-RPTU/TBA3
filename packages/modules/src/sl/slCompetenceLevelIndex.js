/**
 * The competence-levels payload, discriminated once into named collections.
 *
 * A SL dataset ships one flat `competence-levels.json` array holding the school's own
 * value groups, one value group per group, and the comparison populations the export appends: the
 * Landesschnitt, which a state may split by track, or any other population the spec's
 * open `type` names. This is the only place that decides which value group is the school,
 * which are groups, which are comparisons, and which Fach × Domäne each belongs to.
 *
 * Pure and store-free: a consumer without a store can index a payload it fetched itself.
 * A `DocumentStore` caches it as `SL_DATASETS.COMPETENCE_LEVEL_INDEX`.
 */

import { group, rollup } from 'd3-array';
import { compareText } from '../common/utils/compare.js';
import { subjectDomainKey } from './utils/slLevelDefinitions.js';
import {
    isComparisonValueGroup,
    isExternalPopulation,
} from '../common/domain/comparisonGroupLabels.js';
import { VALUE_GROUP_TYPE } from '../common/domain/apiValueMaps.js';
import { domainIdOf } from './utils/slQueryPrimitives.js';
import { readBooklets } from './utils/slBooklets.js';

/** @typedef {import('../common/data/schemas/competenceLevels.js').CurrentCompetenceLevelsValueGroup} CompetenceLevelsValueGroup */

/**
 * The id of the value group whose `type` says school.
 * @param {CompetenceLevelsValueGroup[]} data
 * @returns {string|null} `null` when no value group is the school.
 */
function detectSchoolId(data) {
    return data?.find((entry) => entry?.type === VALUE_GROUP_TYPE.SCHOOL)?.id ?? null;
}

/**
 * @param {CompetenceLevelsValueGroup[]} data
 * @param {string|null} schoolId
 * @returns {CompetenceLevelsValueGroup[]} The school's own value groups.
 */
function filterSchoolEntries(data, schoolId) {
    return data.filter((e) => e.id === schoolId && !isExternalPopulation(e));
}

/**
 * @param {CompetenceLevelsValueGroup[]} data
 * @returns {CompetenceLevelsValueGroup[]} Every comparison value group, each Landesschnitt track included.
 */
function filterComparisonEntries(data) {
    return data.filter(isExternalPopulation);
}

/**
 * The value groups of type `group`. The school, a Landesschnitt and a district average
 * are no group, and neither is a value group without a type.
 * @param {CompetenceLevelsValueGroup[]} data
 * @returns {CompetenceLevelsValueGroup[]}
 */
function filterGroupEntries(data) {
    return data.filter((e) => !isComparisonValueGroup(e));
}

/**
 * Value groups by Fach × Domäne, grouped once: a lookup that returns every value group of
 * one combination, in payload order.
 * @param {CompetenceLevelsValueGroup[]} valueGroups
 * @returns {(subjectName: string, domainId?: string|null) => CompetenceLevelsValueGroup[]} The value groups of one Fach and Domäne (`null` for a Fach with no domain split); empty when the payload delivers none.
 */
function bySubjectDomain(valueGroups) {
    const groups = group(valueGroups, (valueGroup) =>
        subjectDomainKey(valueGroup.subject?.name, valueGroup.domain?.id),
    );
    return (subjectName, domainId = null) =>
        groups.get(subjectDomainKey(subjectName, domainId)) ?? [];
}

/**
 * One comparison population the payload delivers: every value group sharing a payload `id` is
 * the same population, measured in another Fach or Domäne.
 * @typedef {{id: string, name: string, type: string}} ComparisonTrack
 */

/**
 * The distinct comparison populations, in first-seen order.
 * @param {CompetenceLevelsValueGroup[]} comparisons
 * @returns {ComparisonTrack[]} One entry per payload id.
 */
function collectComparisonTracks(comparisons) {
    /** @type {Map<string, ComparisonTrack>} */
    const byId = new Map();
    for (const comparison of comparisons) {
        if (!byId.has(comparison.id)) {
            byId.set(comparison.id, {
                id: comparison.id,
                name: comparison.name,
                type: comparison.type,
            });
        }
    }
    return [...byId.values()];
}

/**
 * The one Landesschnitt a sentence saying "der Landesschnitt" can mean: the payload's
 * `state` track when it delivers exactly one. A state that splits its Landesschnitt by
 * track has no single Landesschnitt, and pooling the tracks yields a number no chart
 * shows — so the answer is then `null`, and the sentence has nothing to compare with.
 * @param {CompetenceLevelIndex} index
 * @returns {ComparisonTrack|null} `null` for none or several.
 */
export function findSoleStateTrack(index) {
    const stateTracks = index.comparisonTracks.filter(
        (track) => track.type === VALUE_GROUP_TYPE.STATE,
    );
    return stateTracks.length === 1 ? stateTracks[0] : null;
}

/**
 * @param {CompetenceLevelIndex} index
 * @param {string|null} subjectName
 * @returns {Array<{domainId: string|null, domainName: string|null}>} The Fach's Domänen in payload order; empty for an unknown Fach.
 */
export function domainsOfSubject(index, subjectName) {
    return index.subjectDomains.find((entry) => entry.subjectName === subjectName)?.domains ?? [];
}

/**
 * @param {CompetenceLevelsValueGroup[]} data
 * @returns {Array<{subjectName: string, domains: Array<{domainId: string|null, domainName: string|null}>}>} One entry per Fach, each listing its Domänen.
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

        const domainId = domainIdOf(entry);
        if (!domainMap.has(domainId)) {
            domainMap.set(domainId, {
                domainId,
                domainName: entry.domain?.name ?? null,
            });
        }
    }

    return Array.from(subjectMap.entries()).map(([subjectName, domainMap]) => ({
        subjectName,
        domains: Array.from(domainMap.values()),
    }));
}

/**
 * @param {Array<{name: string}>} groupEntries
 * @returns {string[]} Sorted unique group names — on an API export the Testheft-Gruppen, e.g. ["E_E1_08_ABCD", "E_E2_08_WXYZ"]
 */
export function deriveGroupNames(groupEntries) {
    return [...new Set(groupEntries.map((e) => e.name))].sort(compareText);
}

/**
 * The school's groups by name, optionally those that sat one Fach; none for a payload
 * without a school.
 * @param {CompetenceLevelIndex} index
 * @param {string|null} [subjectName] - The Fach to narrow to; every group without one.
 * @returns {string[]} Sorted.
 */
export function groupNamesOf(index, subjectName = null) {
    if (!index.schoolId) return [];
    return deriveGroupNames(
        subjectName
            ? index.groups.filter((entry) => entry.subject?.name === subjectName)
            : index.groups,
    );
}

/**
 * Each list in payload order.
 * @param {CompetenceLevelsValueGroup[]} groupEntries
 * @returns {Map<string, CompetenceLevelsValueGroup[]>}
 */
function indexByGroupName(groupEntries) {
    return group(groupEntries, (entry) => entry.name);
}

/**
 * The booklet ids each Fach, or each Fach × Domäne, names over the school, its groups and
 * the comparison populations, so a single-booklet school whose Landesschnitt pooled
 * several counts too.
 * @param {CompetenceLevelsValueGroup[]} valueGroups - The school, group and comparison entries.
 * @param {(subjectName: string, domainId: string|null) => string} keyOf - The Fach, or its `subjectDomainKey`.
 * @returns {Map<string, Set<string>>}
 */
function collectBooklets(valueGroups, keyOf) {
    return rollup(
        valueGroups.filter((entry) => entry.subject?.name),
        (entries) => new Set(entries.flatMap(readBooklets)),
        (entry) => keyOf(/** @type {string} */ (entry.subject?.name), domainIdOf(entry)),
    );
}

/**
 * @param {CompetenceLevelsValueGroup[]} groupEntries
 * @returns {CompetenceLevelsValueGroup[][]} One bucket per Fach × Domäne, in payload order.
 */
function bucketGroupsBySubjectDomain(groupEntries) {
    return Array.from(
        group(groupEntries, (entry) =>
            subjectDomainKey(entry.subject?.name, entry.domain?.id),
        ).values(),
    );
}

// ============================================================================
// COMPETENCE LEVEL INDEX
// ============================================================================

/**
 * @typedef {object} CompetenceLevelIndex
 * @property {string|null} schoolId - Id of the `type === 'school'` value group, or `null` when the payload has none.
 * @property {CompetenceLevelsValueGroup[]} schools - The school's own value groups, one per Fach × Domäne.
 * @property {(subjectName: string, domainId?: string|null) => CompetenceLevelsValueGroup|null} schoolFor - The school's value group of one Fach and Domäne, or `null`.
 * @property {CompetenceLevelsValueGroup[]} groups - Every value group that is no comparison (the dataset's groups), one per group and Fach × Domäne.
 * @property {Map<string, CompetenceLevelsValueGroup[]>} groupsByName - `groups` by group name, in payload order.
 * @property {CompetenceLevelsValueGroup[]} comparisons - Every comparison-population value group, each Landesschnitt track included.
 * @property {(subjectName: string, domainId?: string|null) => CompetenceLevelsValueGroup[]} comparisonsFor - `comparisons` of one Fach and Domäne (`null` for a Fach with no domain split). Every value group, not the first: a state that splits its Landesschnitt by track ships several `state` value groups per Fach/Domäne ("Landesschnitt HSA-GK", "Landesschnitt MSA").
 * @property {ComparisonTrack[]} comparisonTracks - The distinct comparison populations, in first-seen order.
 * @property {Array<{subjectName: string, domains: Array<{domainId: string|null, domainName: string|null}>}>} subjectDomains - One entry per Fach with its Domänen.
 * @property {CompetenceLevelsValueGroup[][]} groupsBySubjectDomain - `groups` grouped by Fach|Domäne, in payload order.
 * @property {Map<string, Set<string>>} bookletsBySubject - The booklet ids in play per Fach, over `schools`, `groups` and `comparisons`.
 * @property {Map<string, Set<string>>} bookletsBySubjectDomain - The same per Fach × Domäne, keyed by `subjectDomainKey`.
 */

/**
 * Report, once per index, each Fach/Domäne the groups sat that has no school value group:
 * its Schulschnitt stays empty rather than summing the groups, another population (a
 * student in no listed group is missing from it).
 * @param {CompetenceLevelsValueGroup[]} groups
 * @param {(subjectName: string, domainId?: string|null) => CompetenceLevelsValueGroup[]} schoolsOf
 */
function warnMissingSchools(groups, schoolsOf) {
    const missing = new Set(
        groups
            .filter((entry) => entry.subject?.name)
            .filter(
                (entry) =>
                    schoolsOf(/** @type {string} */ (entry.subject?.name), domainIdOf(entry))
                        .length === 0,
            )
            .map((entry) => `${entry.subject?.name}|${domainIdOf(entry) ?? '(no domain)'}`),
    );
    for (const key of missing) {
        console.warn(
            `[CompetenceLevelIndex] No school value group for ${key}; Schulschnitt left empty.`,
        );
    }
}

/**
 * @param {CompetenceLevelsValueGroup[]|null|undefined} valueGroups - A missing payload yields the empty index.
 * @returns {CompetenceLevelIndex}
 */
export function buildCompetenceLevelIndex(valueGroups) {
    const data = Array.isArray(valueGroups) ? valueGroups : [];
    const schoolId = detectSchoolId(data);
    const groups = filterGroupEntries(data);
    const comparisons = filterComparisonEntries(data);
    const schools = filterSchoolEntries(data, schoolId);
    const schoolsOf = bySubjectDomain(schools);
    const inPlay = [...schools, ...groups, ...comparisons];
    warnMissingSchools(groups, schoolsOf);
    return {
        schoolId,
        schools,
        schoolFor: (subjectName, domainId = null) => schoolsOf(subjectName, domainId)[0] ?? null,
        groups,
        groupsByName: indexByGroupName(groups),
        comparisons,
        comparisonsFor: bySubjectDomain(comparisons),
        comparisonTracks: collectComparisonTracks(comparisons),
        subjectDomains: deriveSubjectDomainMap(data),
        groupsBySubjectDomain: bucketGroupsBySubjectDomain(groups),
        bookletsBySubject: collectBooklets(inPlay, (subjectName) => subjectName),
        bookletsBySubjectDomain: collectBooklets(inPlay, subjectDomainKey),
    };
}
