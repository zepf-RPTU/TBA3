/**
 * The superlative verbs of the SL info boxes: which Lerngruppe is strongest, which Fach
 * spreads widest. Each ranks competence-level shares read through a
 * `CompetenceShareQueries` and names one selection, or `null` when nothing could be
 * measured. The Landesschnitt comparisons live beside this in
 * `infoBoxStateComparison.js`.
 *
 * `target` and `levelAlias` go to the share queries unchanged: the target as the resolver
 * resolved it from the template, the band alias as the template states it, which the
 * queries resolve themselves.
 */

import { mean } from 'd3-array';
import { finiteRange, pickSelection } from '../../utils/slSelectionRanking.js';
import { ALL_DOMAINS } from '../../utils/slQueryPrimitives.js';

/** @typedef {import('../../utils/slCompetenceShares.js').CompetenceShareQueries} CompetenceShareQueries */
/** @typedef {import('../../utils/slQueryPrimitives.js').QueryTarget} Target */
/** @typedef {import('../../utils/slSelectionRanking.js').InfoBoxSelection} InfoBoxSelection */
/** @typedef {import('../../utils/slSelectionRanking.js').FiniteRange} FiniteRange */
/** @typedef {'min'|'max'} RankMode */
/** @typedef {import('../../utils/slQueryPrimitives.js').DomainScope} DomainScope */

/**
 * One measured Fach×Domäne of a target.
 * @typedef {object} SubjectDomainShare
 * @property {string} subjectName
 * @property {string|null} domainId
 * @property {string|null} domainName
 * @property {number} share - The target's competence-level share there.
 */

const SCHOOL = /** @type {Target} */ ({ type: 'school', groupNames: [] });

/**
 * Every Fach×Domäne of a target that has a share, with that share.
 * @param {CompetenceShareQueries} queries
 * @param {Target|string} target
 * @param {string} levelAlias - The band alias the share counts (`ge_medium`).
 * @returns {SubjectDomainShare[]} In selection order.
 */
export function measureSubjectDomains(queries, target, levelAlias) {
    return queries.getAvailableSubjectDomainSelections(target).flatMap((selection) => {
        const share = queries.getCompetenceLevelShare({
            target,
            levelAlias,
            subjectName: selection.subjectName,
            domainId: selection.domainId,
        });
        return share === null
            ? []
            : [
                  {
                      subjectName: selection.subjectName,
                      domainId: selection.domainId,
                      domainName: selection.domainName,
                      share,
                  },
              ];
    });
}

/**
 * Lowest and highest share across every subject×domain of a target.
 * @param {CompetenceShareQueries} queries
 * @param {{target: Target, levelAlias: string}} params
 * @returns {FiniteRange|null}
 */
export function getCompetenceLevelShareRange(queries, { target, levelAlias }) {
    return finiteRange(measureSubjectDomains(queries, target, levelAlias).map((row) => row.share));
}

/**
 * Lowest and highest Fach share among the candidate groups.
 * @param {CompetenceShareQueries} queries
 * @param {{target: Target, levelAlias: string, subjectName: string, domainId: DomainScope}} params - `ALL_DOMAINS` pools the Fach's Domänen.
 * @returns {FiniteRange|null}
 */
export function getSubjectCompetenceShareGroupRange(
    queries,
    { target, levelAlias, subjectName, domainId },
) {
    return finiteRange(
        queries.getCandidateGroupNames(target).map((groupName) =>
            queries.getSubjectCompetenceShare({
                target: groupName,
                levelAlias,
                subjectName,
                domainId,
            }),
        ),
    );
}

/**
 * The group whose unweighted mean share over all its selections is highest (or lowest).
 * @param {CompetenceShareQueries} queries
 * @param {{target: Target, levelAlias: string, mode: RankMode}} params
 * @returns {InfoBoxSelection|null} The selected group and its mean, or `null`.
 */
export function selectGroupByMeanShare(queries, { target, levelAlias, mode }) {
    return pickSelection(
        queries.getCandidateGroupNames(target).map((groupName) => {
            const meanShare = mean(
                measureSubjectDomains(queries, groupName, levelAlias),
                (row) => row.share,
            );
            return meanShare === undefined ? null : { type: 'group', groupName, meanShare };
        }),
        (selection) => selection.meanShare,
        mode,
    );
}

/**
 * The best (or worst) single subject×domain measurement in a population.
 * @param {CompetenceShareQueries} queries
 * @param {{target: Target, levelAlias: string, mode: RankMode}} params
 * @returns {InfoBoxSelection|null} The selected subject×domain and its share, or `null`.
 */
export function selectSubjectDomainByShare(queries, { target, levelAlias, mode }) {
    return pickSelection(
        measureSubjectDomains(queries, target, levelAlias).map((row) => ({
            type: 'subjectDomain',
            target,
            ...row,
        })),
        (selection) => selection.share,
        mode,
    );
}

/**
 * The group with the largest (or smallest) competence-level share in the box's Fach.
 * @param {CompetenceShareQueries} queries
 * @param {{target: Target, levelAlias: string, subjectName: string|null, domainId: DomainScope, mode: RankMode}} params - `ALL_DOMAINS` compares across all of the Fach's Domänen.
 * @returns {InfoBoxSelection|null} The selected group and its figures, or `null` without a Fach or when no group resolved.
 */
export function selectGroupBySubjectShare(
    queries,
    { target, levelAlias, subjectName, domainId, mode },
) {
    if (!subjectName) return null;
    // Only an explicit Domäne is recorded: a later `target=selection:<id>` reads the whole
    // Fach from a selection that carries no `domainId` key.
    const domainParam = domainId !== ALL_DOMAINS ? { domainId } : {};

    return pickSelection(
        queries.getCandidateGroupNames(target).map((groupName) => {
            const share = queries.getSubjectCompetenceShare({
                target: groupName,
                levelAlias,
                subjectName,
                domainId,
            });
            return share === null
                ? null
                : { type: 'group', groupName, subjectName, ...domainParam, share };
        }),
        (selection) => selection.share,
        mode,
    );
}

/**
 * The Fach whose groups differ most (or least) in their competence-level share,
 * school-wide.
 *
 * Ranks on the spread between a Fach's groups, not on how high the Fach sits: the
 * sentence it feeds claims an internal difference.
 * @param {CompetenceShareQueries} queries
 * @param {{levelAlias: string, mode: RankMode}} params
 * @returns {InfoBoxSelection|null} The selected Fach with both ends of its range, or `null` when none resolved.
 */
export function selectSubjectByShareGroupRange(queries, { levelAlias, mode }) {
    return selectByShareGroupRange(
        queries,
        queries.getSubjectNames(SCHOOL).map((subjectName) => ({ subjectName })),
        levelAlias,
        mode,
    );
}

/**
 * The same question one Domäne at a time.
 *
 * Its own scope rather than derived from the Fach-level one: pooling a Fach's Domänen
 * averages their group spreads away, which can hide the school's widest internal gap.
 * @param {CompetenceShareQueries} queries
 * @param {{levelAlias: string, mode: RankMode}} params
 * @returns {InfoBoxSelection|null} The selected Fach/Domäne with both ends of its range, or `null` when none resolved.
 */
export function selectSubjectDomainByShareGroupRange(queries, { levelAlias, mode }) {
    return selectByShareGroupRange(
        queries,
        queries.getAvailableSubjectDomainSelections(SCHOOL).map((selection) => ({
            subjectName: selection.subjectName,
            domainId: selection.domainId,
            domainName: selection.domainName ?? null,
        })),
        levelAlias,
        mode,
    );
}

/**
 * The candidate whose groups spread most (or least), school-wide.
 * @param {CompetenceShareQueries} queries
 * @param {Array<{subjectName: string, domainId?: string|null, domainName?: string|null}>} candidates - Fächer, their Domänen pooled, or Fach×Domänen. A Fach carries no `domainId` key: a later `target=selection:<id>` then pools its Domänen too, where `null` would read only a domain-less value group.
 * @param {string} levelAlias - The band alias the share counts (`ge_medium`).
 * @param {RankMode} mode
 * @returns {InfoBoxSelection|null} The selected candidate with both ends of its range, or `null`.
 */
function selectByShareGroupRange(queries, candidates, levelAlias, mode) {
    return pickSelection(
        candidates.map((identity) =>
            groupRangeSelection(
                getSubjectCompetenceShareGroupRange(queries, {
                    target: SCHOOL,
                    levelAlias,
                    subjectName: identity.subjectName,
                    domainId: 'domainId' in identity ? (identity.domainId ?? null) : ALL_DOMAINS,
                }),
                { type: 'subjectDomain', target: 'school', ...identity },
            ),
        ),
        (selection) => selection.shareRange,
        mode,
    );
}

/**
 * The group whose own subject×domain shares spread most (or least).
 * @param {CompetenceShareQueries} queries
 * @param {{target: Target, levelAlias: string, mode: RankMode}} params
 * @returns {InfoBoxSelection|null} The selected group with both ends of its range, or `null`.
 */
export function selectGroupBySubjectShareRange(queries, { target, levelAlias, mode }) {
    return pickSelection(
        queries.getCandidateGroupNames(target).map((groupName) =>
            groupRangeSelection(
                getCompetenceLevelShareRange(queries, {
                    target: /** @type {Target} */ ({ type: 'groups', groupNames: [groupName] }),
                    levelAlias,
                }),
                { type: 'group', groupName },
            ),
        ),
        (selection) => selection.shareRange,
        mode,
    );
}

/**
 * A range folded into the selection a spread verb reports, ranked by its width.
 * @template {InfoBoxSelection} I
 * @param {FiniteRange|null} range
 * @param {I} identity - What the range is of.
 * @returns {(I & {shareRange: number})|null} `null` without a range.
 */
function groupRangeSelection(range, identity) {
    return range ? { ...identity, shareRange: range.max - range.min } : null;
}
