/**
 * Which group entries one competence chart draws: the whole school, one Fach or one
 * group, selected from the competence-level index. Pure over the index.
 */

import { deriveGroupNames } from './slCompetenceLevelIndex.js';

/** @typedef {import('./modules/charts/competence/shared/competenceChartData.js').SubjectCompetenceLevelsValueGroup} SubjectCompetenceLevelsValueGroup */
/** @typedef {import('../common/data/schemas/competenceLevels.js').CurrentCompetenceLevelsValueGroup} CompetenceLevelsValueGroup */

/**
 * The chart's slice of the index: one group's Domänen, one Fach's, or — with neither —
 * every Domäne of the school. The school and comparison value groups each Domäne pairs with
 * are the index's own (`schoolFor`, `comparisonsFor`).
 * @param {import('./slCompetenceLevelIndex.js').CompetenceLevelIndex} index
 * @param {{subjectName?: string|null, groupName?: string|null}} [selection] - The group or Fach; neither selects the school.
 * @returns {SubjectCompetenceLevelsValueGroup[][]|null} One group-entry array per Domäne, or `null` when no Domäne matches.
 */
export function selectCompetenceSlice(index, { subjectName = null, groupName = null } = {}) {
    const withSubject = index.groupsBySubjectDomain.filter(
        /**
         * @param {CompetenceLevelsValueGroup[]} group - One Fach/Domäne bucket, its value groups sharing the Fach.
         * @returns {group is SubjectCompetenceLevelsValueGroup[]} Whether the bucket names a Fach.
         */
        (group) => Boolean(group[0]?.subject?.name),
    );

    const domainBuckets = groupName
        ? withSubject.filter((group) => group.some((e) => e.name === groupName))
        : subjectName
          ? withSubject.filter((group) => group[0].subject?.name === subjectName)
          : withSubject;

    return domainBuckets.length > 0 ? domainBuckets : null;
}

/**
 * @param {import('./slCompetenceLevelIndex.js').CompetenceLevelIndex} index
 * @returns {string[]} Every Fach with group entries, in payload order.
 */
export function listCompetenceSubjects(index) {
    return [
        ...new Set(
            index.groupsBySubjectDomain
                .map((group) => group[0]?.subject?.name ?? '')
                .filter((name) => name !== ''),
        ),
    ];
}

/**
 * @param {import('./slCompetenceLevelIndex.js').CompetenceLevelIndex} index
 * @returns {string[]} Every group with group entries in some Fach, sorted by name.
 */
export function listCompetenceGroups(index) {
    // The groups `selectCompetenceSlice` finds a Domäne for: those in a group with a Fach.
    const drawn = new Set(
        index.groupsBySubjectDomain
            .filter((group) => group[0]?.subject?.name)
            .flatMap((group) => group.map((entry) => entry.name)),
    );
    return deriveGroupNames(index.groups).filter((groupName) => drawn.has(groupName));
}
