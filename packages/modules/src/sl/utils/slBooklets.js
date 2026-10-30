/**
 * The Testhefte a Fach was tested with, read off the `booklet` property of the
 * current-year competence-level value groups.
 *
 * A raw Lösungsquote counts `Richtig` over whichever items a booklet held, so two
 * booklets of one Fach give rates that cannot be compared or pooled. Competence-level
 * counts are equated per booklet before they reach the client and stay comparable.
 *
 * A Testheft covers some of a Fach's Domänen, not always all of them (Deutsch: Lesen
 * with Orthografie in one, with Sprachgebrauch in another), and the booklet ids sit on
 * each Domäne's value group. So a Domäne's rate is mixed only when that Domäne was sat in
 * several booklets, and a rate over the whole Fach when the Fach was.
 */

import { getPropertyText } from '../../common/domain/studentIdentity.js';
import { PROPERTY_KEY } from '../../common/domain/apiValueMaps.js';
import { subjectDomainKey } from './slLevelDefinitions.js';
import { domainIdOf } from './slQueryPrimitives.js';

/** @typedef {import('../slCompetenceLevelIndex.js').CompetenceLevelIndex} CompetenceLevelIndex */

/**
 * The booklet ids one value group names. A value group pooled over several booklets
 * joins their ids with commas.
 * @param {import('../../common/data/schemas/competenceLevels.js').CurrentCompetenceLevelsValueGroup} valueGroup
 * @returns {string[]}
 */
export function readBooklets(valueGroup) {
    return /** @type {string} */ (getPropertyText(valueGroup.properties, PROPERTY_KEY.BOOKLET))
        .split(',')
        .map((bookletId) => bookletId.trim())
        .filter(Boolean);
}

/**
 * Whether the Lösungsquoten of a Domäne, or of a whole Fach, mix booklets and so cannot be
 * compared: the index counts every booklet in play, the comparison populations' too.
 * @param {CompetenceLevelIndex} index
 * @param {string} subjectName - The canonical Fach name.
 * @param {string|null} domainId - The Domäne; `null` for the whole Fach, as for a Fach with no Domäne split.
 * @returns {boolean} `true` when two or more distinct booklets are in play.
 */
export function hasMixedBooklets(index, subjectName, domainId) {
    const booklets =
        domainId === null
            ? index.bookletsBySubject.get(subjectName)
            : index.bookletsBySubjectDomain.get(subjectDomainKey(subjectName, domainId));
    return (booklets?.size ?? 0) > 1;
}

/**
 * The booklets one group was tested with in a Domäne or a whole Fach.
 * @param {CompetenceLevelIndex} index
 * @param {string|null|undefined} groupName
 * @param {string|null|undefined} subjectName - The canonical Fach name.
 * @param {string|null} domainId - The Domäne; `null` for the whole Fach.
 * @returns {string[]} The distinct ids, empty when the group names none.
 */
export function groupBooklets(index, groupName, subjectName, domainId) {
    const entries = (groupName ? index.groupsByName.get(groupName) : undefined) ?? [];
    return [
        ...new Set(
            entries
                .filter(
                    (entry) =>
                        entry.subject?.name === subjectName &&
                        (domainId === null || domainIdOf(entry) === domainId),
                )
                .flatMap(readBooklets),
        ),
    ];
}
