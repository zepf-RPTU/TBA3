/**
 * The Landesschnitt verbs of the SL info boxes: which Fächer and Klassen sit above or
 * below the state share, and which Fach deviates most. They decide the praise and alarm
 * sentences, comparing competence-level shares read through a `CompetenceShareQueries`.
 *
 * The Landesschnitt is whatever the payload marks `type: 'state'`, summed. An export
 * carrying several tracks (a Gesamt row plus a Schulform row) therefore pools them into
 * one benchmark — the same reading the item-based comparison this replaced used.
 *
 * `target` is a descriptor `normalizeTarget` produced and `levelNames` the level names a
 * rank alias resolved to; the text resolver does both once, at its boundary.
 */

import { getBestNumericSelection, matchesComparison } from './infoBoxSelectionRanking.js';
import { getSubjectNamesFromRows } from '../../utils/slQueryPrimitives.js';

/** @typedef {import('../../utils/slCompetenceShares.js').CompetenceShareQueries} CompetenceShareQueries */
/** @typedef {NonNullable<ReturnType<import('../../utils/slQueryPrimitives.js').normalizeTarget>>} Target */

/**
 * The Fächer whose competence-level share is above (or below) the Landesschnitt.
 *
 * `aggregation` picks the question: `anyDomain` lists a Fach when at least one of its
 * Domänen clears the benchmark — so a Fach with disagreeing Domänen truthfully appears
 * in both the praise and the alarm list — while `subject` compares one pooled number
 * per Fach and can therefore list it in neither.
 * @param {CompetenceShareQueries} queries - Answers the shares.
 * @param {{target: Target, levelNames: string[], comparison?: string, aggregation?: string}} params - What is compared; `gt` for above, `lt` for below.
 * @returns {string[]} The matching Fach names, sorted by name.
 */
export function listSubjectsByStateComparison(
    queries,
    { target, levelNames, comparison = 'gt', aggregation = 'anyDomain' },
) {
    if (aggregation === 'subject') {
        return getSubjectNamesFromRows(queries.getRowsForSubjectAggregateTarget(target)).filter(
            (subjectName) =>
                matchesComparison(
                    compareShareToState(queries, { target, levelNames, subjectName, aggregation })
                        ?.difference,
                    comparison,
                ),
        );
    }

    const matchingSubjectNames = new Set();
    queries.getAvailableSubjectDomainSelections(target).forEach((selection) => {
        const result = compareShareToState(queries, {
            target,
            levelNames,
            subjectName: selection.subjectName,
            domainId: selection.domainId,
        });

        if (matchesComparison(result?.difference, comparison)) {
            matchingSubjectNames.add(selection.subjectName);
        }
    });

    return Array.from(matchingSubjectNames).sort((a, b) => a.localeCompare(b));
}

/**
 * The Klassen whose competence-level share is above (or below) the Landesschnitt in at
 * least one Fach — or, with `subjectName`, in at least one Domäne of that Fach.
 *
 * "At least one" is why the two lists are not each other's complement: a Klasse that
 * sat only one Fach appears in whichever list that Fach puts it in and is simply absent
 * from the other.
 * @param {CompetenceShareQueries} queries - Answers the shares.
 * @param {{target: Target, levelNames: string[], comparison?: string, subjectName?: string|null}} params - What is compared; `gt` for above, `lt` for below.
 * @returns {string[]} The matching Klassen, in candidate order.
 */
export function listClassesByStateComparison(
    queries,
    { target, levelNames, comparison = 'gt', subjectName = null },
) {
    return queries.getCandidateClassNames(target).filter((className) =>
        queries
            .getAvailableSubjectDomainSelections(className)
            .filter((selection) => !subjectName || selection.subjectName === subjectName)
            .some((selection) =>
                matchesComparison(
                    compareShareToState(queries, {
                        target: className,
                        levelNames,
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
 * Ranks on the *absolute* difference, because the sentence asks which Fach deviates
 * most — the answer may well be the Fach that is furthest above.
 * @param {CompetenceShareQueries} queries - Answers the shares.
 * @param {{target: Target, levelNames: string[], mode?: string}} params - What is compared, over which population, `max` or `min`.
 * @returns {object|null} The selected Fach with both shares and their difference, or `null` when none resolved.
 */
export function selectSubjectByStateShareDiff(queries, { target, levelNames, mode = 'max' }) {
    return getBestNumericSelection(
        getSubjectNamesFromRows(queries.getRowsForSubjectAggregateTarget(target)),
        (subjectName) => {
            const result = compareShareToState(queries, {
                target,
                levelNames,
                subjectName,
                aggregation: 'subject',
            });

            return !result
                ? null
                : {
                      type: 'subjectDomain',
                      target,
                      subjectName,
                      domainId: null,
                      domainName: null,
                      share: result.targetShare,
                      stateShare: result.stateShare,
                      difference: result.difference,
                      absoluteDifference: result.absoluteDifference,
                  };
        },
        (_subjectName, selection) => selection.absoluteDifference,
        (subjectName) => `${subjectName}|`,
        mode,
    );
}

/**
 * One target's competence-level share against the Landesschnitt's.
 * @param {CompetenceShareQueries} queries - Answers the shares.
 * @param {{target: Target|string, levelNames: string[], subjectName: string, domainId?: string|null, aggregation?: string}} params - `subject` pools the Fach's Domänen; `anyDomain` compares the one addressed.
 * @returns {object|null} Both shares and their difference, or `null` when either side cannot be measured.
 */
function compareShareToState(
    queries,
    { target, levelNames, subjectName, domainId = undefined, aggregation = 'anyDomain' },
) {
    if (typeof target === 'object' && target.type === 'state') {
        return null;
    }

    const read = (readTarget) => {
        const params = {
            target: readTarget,
            levelNames,
            subjectName,
            ...(domainId !== undefined ? { domainId } : {}),
        };
        return aggregation === 'subject'
            ? queries.getSubjectCompetenceShare(params)
            : queries.getCompetenceLevelShare(params);
    };
    const targetShare = read(target);
    const stateShare = read('state');

    if (targetShare === null || stateShare === null) {
        return null;
    }

    const difference = targetShare - stateShare;
    return { targetShare, stateShare, difference, absoluteDifference: Math.abs(difference) };
}
