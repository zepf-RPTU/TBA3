/**
 * The Landesschnitt verbs of the SL info boxes: which Fächer and Lerngruppen sit above or
 * below the state share, and which Fach deviates most. They decide the praise and alarm
 * sentences, comparing competence-level shares read through a `CompetenceShareQueries`.
 *
 * The Landesschnitt is the payload's sole `type: 'state'` track
 * (`CompetenceShareQueries.getSoleStateTarget`). An export carrying several tracks has no
 * single Landesschnitt, so every verb then answers `null` and the sentence is dropped;
 * an empty list would read "keinem Fach", a comparison that was never made.
 *
 * `target` and `levelAlias` go to the share queries unchanged: the target as the resolver
 * resolved it from the template, the band alias as the template states it, which the
 * queries resolve themselves.
 */

import { pickSelection } from '../../utils/slSelectionRanking.js';
import { ALL_DOMAINS } from '../../utils/slQueryPrimitives.js';
import { measureSubjectDomains } from './infoBoxShareSelections.js';
import { isFiniteNumber } from '../../../common/utils/numberFormat.js';

/** @typedef {import('../../utils/slCompetenceShares.js').CompetenceShareQueries} CompetenceShareQueries */
/** @typedef {import('../../utils/slQueryPrimitives.js').QueryTarget} Target */
/** @typedef {import('../../utils/slSelectionRanking.js').InfoBoxSelection} InfoBoxSelection */

/**
 * One target's competence-level share against the Landesschnitt's.
 * @typedef {object} StateShareComparison
 * @property {number} targetShare
 * @property {number} stateShare
 * @property {number} difference - `targetShare - stateShare`.
 * @property {number} absoluteDifference
 */

/**
 * The Fächer whose competence-level share is above (or below) the Landesschnitt.
 *
 * `aggregation` picks the question: `anyDomain` lists a Fach when at least one of its
 * Domänen clears the benchmark, so a Fach with disagreeing Domänen appears in both the
 * praise and the alarm list; `subject` compares one pooled number per Fach.
 * @param {CompetenceShareQueries} queries
 * @param {{target: Target, levelAlias: string, comparison: 'gt'|'lt', aggregation: 'anyDomain'|'subject'}} params - `gt` for above, `lt` for below.
 * @returns {string[]|null} The matching Fach names, in payload order; `null` without a single Landesschnitt.
 */
export function listSubjectsByStateComparison(
    queries,
    { target, levelAlias, comparison, aggregation },
) {
    const stateTarget = queries.getSoleStateTarget();
    if (!stateTarget) return null;

    if (aggregation === 'subject') {
        return queries.getSubjectNames(target).filter((subjectName) =>
            matchesComparison(
                compareShareToState(queries, {
                    target,
                    stateTarget,
                    levelAlias,
                    subjectName,
                    aggregation,
                })?.difference,
                comparison,
            ),
        );
    }

    const matchingSubjectNames = new Set(
        measureSubjectDomains(queries, target, levelAlias)
            .filter(({ subjectName, domainId, share }) => {
                const stateShare = queries.getCompetenceLevelShare({
                    target: stateTarget,
                    levelAlias,
                    subjectName,
                    domainId,
                });
                return stateShare !== null && matchesComparison(share - stateShare, comparison);
            })
            .map((row) => row.subjectName),
    );

    return [...matchingSubjectNames];
}

/**
 * The Lerngruppen whose competence-level share is above (or below) the Landesschnitt in at
 * least one Fach — or, with `subjectName`, in at least one Domäne of that Fach.
 *
 * With "at least one" the two lists are not each other's complement: a Lerngruppe can
 * appear in both, or in one only.
 * @param {CompetenceShareQueries} queries
 * @param {{target: Target, levelAlias: string, comparison: 'gt'|'lt', subjectName?: string|null}} params - `gt` for above, `lt` for below.
 * @returns {string[]|null} The matching Lerngruppen, in candidate order; `null` without a single Landesschnitt.
 */
export function listGroupsByStateComparison(
    queries,
    { target, levelAlias, comparison, subjectName = null },
) {
    const stateTarget = queries.getSoleStateTarget();
    if (!stateTarget) return null;

    return queries.getCandidateGroupNames(target).filter((groupName) =>
        queries
            .getAvailableSubjectDomainSelections(groupName)
            .filter((selection) => !subjectName || selection.subjectName === subjectName)
            .some((selection) =>
                matchesComparison(
                    compareShareToState(queries, {
                        target: groupName,
                        stateTarget,
                        levelAlias,
                        subjectName: selection.subjectName,
                        domainId: selection.domainId,
                    })?.difference,
                    comparison,
                ),
            ),
    );
}

/**
 * The Fach whose competence-level share deviates most (or least) from the Landesschnitt.
 *
 * Ranks on the absolute difference: the sentence asks which Fach deviates most, in
 * either direction.
 * @param {CompetenceShareQueries} queries
 * @param {{target: Target, levelAlias: string, mode: 'min'|'max'}} params
 * @returns {InfoBoxSelection|null} The selected Fach with both shares and their difference, or `null` when none resolved.
 */
export function selectSubjectByStateShareDiff(queries, { target, levelAlias, mode }) {
    const stateTarget = queries.getSoleStateTarget();
    if (!stateTarget) return null;

    return pickSelection(
        queries.getSubjectNames(target).map((subjectName) => {
            const result = compareShareToState(queries, {
                target,
                stateTarget,
                levelAlias,
                subjectName,
                aggregation: 'subject',
            });

            // No `domainId` key: the shares pool the Fach's Domänen, and so does a
            // later `target=selection:<id>`; `null` would read a domain-less value group.
            return !result
                ? null
                : {
                      type: 'subjectDomain',
                      target,
                      subjectName,
                      share: result.targetShare,
                      stateShare: result.stateShare,
                      difference: result.difference,
                      absoluteDifference: result.absoluteDifference,
                  };
        }),
        (selection) => selection.absoluteDifference,
        mode,
    );
}

/**
 * One target's competence-level share against the Landesschnitt's.
 * @param {CompetenceShareQueries} queries
 * @param {{target: Target|string, stateTarget: {type: 'comparison', id: string}, levelAlias: string, subjectName: string, domainId?: import('../../utils/slQueryPrimitives.js').DomainScope, aggregation?: string}} params - `subject` pools the Fach's Domänen; `anyDomain` compares the one addressed.
 * @returns {StateShareComparison|null} `null` when either side cannot be measured.
 */
function compareShareToState(
    queries,
    {
        target,
        stateTarget,
        levelAlias,
        subjectName,
        domainId = ALL_DOMAINS,
        aggregation = 'anyDomain',
    },
) {
    /**
     * @param {Target|string|{type: 'comparison', id: string}} readTarget
     * @returns {number|null}
     */
    const read = (readTarget) => {
        /** @type {Parameters<CompetenceShareQueries['getCompetenceLevelShare']>[0]} */
        const params = { target: readTarget, levelAlias, subjectName, domainId };
        return aggregation === 'subject'
            ? queries.getSubjectCompetenceShare(params)
            : queries.getCompetenceLevelShare(params);
    };
    const targetShare = read(target);
    const stateShare = read(stateTarget);

    if (targetShare === null || stateShare === null) {
        return null;
    }

    const difference = targetShare - stateShare;
    return { targetShare, stateShare, difference, absoluteDifference: Math.abs(difference) };
}

/**
 * Whether a signed difference lies on the requested side of zero.
 * @param {number|null|undefined} value - The difference; absent when it could not be measured.
 * @param {'gt'|'lt'} comparison - Which side counts.
 * @returns {boolean} False for a non-finite value.
 */
function matchesComparison(value, comparison) {
    if (!isFiniteNumber(value)) {
        return false;
    }

    return comparison === 'lt' ? value < 0 : value > 0;
}
