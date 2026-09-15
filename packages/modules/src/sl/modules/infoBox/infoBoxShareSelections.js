/**
 * The superlative verbs of the SL info boxes: which Klasse is strongest, which Fach
 * spreads widest, which Domäne comes first. Each ranks competence-level shares read
 * through a `CompetenceShareQueries` and names one selection, or `null` when nothing
 * could be measured.
 *
 * Every verb answers a superlative question ("die stärkste Klasse", "der größte
 * Unterschied"), so a wrong answer is a wrong *name* in German prose, not a wrong pixel.
 * The Landesschnitt comparisons live beside this in `infoBoxStateComparison.js`.
 *
 * `target` is a descriptor `normalizeTarget` produced and `levelNames` the level names a
 * rank alias resolved to; the text resolver does both once, at its boundary.
 */

import { getBestNumericSelection, getSelectionValueRange } from './infoBoxSelectionRanking.js';
import { getSubjectNamesFromRows } from '../../utils/slQueryPrimitives.js';

/** @typedef {import('../../utils/slCompetenceShares.js').CompetenceShareQueries} CompetenceShareQueries */
/** @typedef {NonNullable<ReturnType<import('../../utils/slQueryPrimitives.js').normalizeTarget>>} Target */

/**
 * Lowest and highest share across every subject×domain of a target.
 * @param {CompetenceShareQueries} queries - Answers the shares.
 * @param {{target: Target, levelNames: string[]}} params - What is compared.
 * @returns {object|null} Both ends of the range with their selections, or `null`.
 */
export function getCompetenceLevelShareRange(queries, { target, levelNames }) {
    return getSelectionValueRange(
        queries.getAvailableSubjectDomainSelections(target),
        (selection) =>
            queries.getCompetenceLevelShare({
                target,
                levelNames,
                subjectName: selection.subjectName,
                domainId: selection.domainId,
            }),
    );
}

/**
 * Lowest and highest Fach share among the candidate classes.
 * @param {CompetenceShareQueries} queries - Answers the shares.
 * @param {{target: Target, levelNames: string[], subjectName: string, domainId?: string|null}} params - What is compared; omit `domainId` to pool the Fach's Domänen.
 * @returns {object|null} Both ends of the range with their classes, or `null`.
 */
export function getSubjectCompetenceShareClassRange(
    queries,
    { target, levelNames, subjectName, domainId = undefined },
) {
    const domainParam = domainId !== undefined ? { domainId } : {};

    return getSelectionValueRange(
        queries.getCandidateClassNames(target),
        (className) =>
            queries.getSubjectCompetenceShare({
                target: className,
                levelNames,
                subjectName,
                ...domainParam,
            }),
        (className) => ({ type: 'class', className, subjectName, ...domainParam }),
    );
}

/**
 * The class whose unweighted mean share over all its selections is highest (or lowest).
 * @param {CompetenceShareQueries} queries - Answers the shares.
 * @param {{target: Target, levelNames: string[], mode?: string}} params - What is compared, over which population, `max` or `min`.
 * @returns {object|null} The selected class and its mean, or `null`.
 */
export function selectClassByMeanShare(queries, { target, levelNames, mode = 'max' }) {
    return getBestNumericSelection(
        queries.getCandidateClassNames(target),
        (className) => {
            const meanShare = getMeanCompetenceShareForClass(queries, className, levelNames);
            return meanShare === null ? null : { type: 'class', className, meanShare };
        },
        (_className, selection) => selection.meanShare,
        (className) => className,
        mode,
    );
}

/**
 * The best (or worst) single subject×domain measurement in a population.
 * @param {CompetenceShareQueries} queries - Answers the shares.
 * @param {{target: Target, levelNames: string[], mode?: string}} params - What is compared, over which population, `max` or `min`.
 * @returns {object|null} The selected subject×domain and its share, or `null`.
 */
export function selectSubjectDomainByShare(queries, { target, levelNames, mode = 'max' }) {
    return getBestNumericSelection(
        queries.getAvailableSubjectDomainSelections(target),
        (selection) => {
            const share = queries.getCompetenceLevelShare({
                target,
                levelNames,
                subjectName: selection.subjectName,
                domainId: selection.domainId,
            });

            return share === null
                ? null
                : {
                      type: 'subjectDomain',
                      target,
                      subjectName: selection.subjectName,
                      domainId: selection.domainId,
                      domainName: selection.domainName,
                      share,
                  };
        },
        (_selection, bestSelection) => bestSelection.share,
        (selection) =>
            `${selection.subjectName}|${selection.domainName ?? ''}|${selection.domainId ?? ''}`,
        mode,
    );
}

/**
 * The n-th Domäne of a Fach, in payload order.
 * @param {CompetenceShareQueries} queries - Answers the shares.
 * @param {{subjectName: string, order: number, multiDomainOnly?: boolean}} params - Which Domäne is meant; `multiDomainOnly` answers only for a Fach with several.
 * @returns {object|null} The selection, or `null`.
 */
export function selectSubjectDomainByOrder(
    queries,
    { subjectName, order, multiDomainOnly = false },
) {
    const domains = queries.getOrderedDomainsForSubject(subjectName);
    if (multiDomainOnly && domains.length <= 1) {
        return null;
    }

    return domains[order - 1] ?? null;
}

/**
 * The class with the largest (or smallest) competence-level share in one subject.
 * @param {CompetenceShareQueries} queries - Answers the shares.
 * @param {{target: Target, levelNames: string[], subjectName: string, domainId?: string|null, mode?: string}} params - What is compared; omit `domainId` to compare across all of the subject's domains.
 * @returns {object|null} The selected class and its figures, or `null` when no class resolved.
 */
export function selectClassBySubjectShare(
    queries,
    { target, levelNames, subjectName, domainId = undefined, mode = 'max' },
) {
    const domainParam = domainId !== undefined ? { domainId } : {};

    return getBestNumericSelection(
        queries.getCandidateClassNames(target),
        (className) => {
            const share = queries.getSubjectCompetenceShare({
                target: className,
                levelNames,
                subjectName,
                ...domainParam,
            });

            return share === null
                ? null
                : { type: 'class', className, subjectName, ...domainParam, share };
        },
        (_className, selection) => selection.share,
        (className) => className,
        mode,
    );
}

/**
 * The Fach whose classes differ most (or least) in their competence-level share,
 * school-wide.
 *
 * Ranks on the *spread* between a Fach's classes, not on how high the Fach sits: the
 * sentence it feeds claims an internal difference, so the Fach with the best results
 * and the Fach whose classes disagree most need not be the same one.
 * @param {CompetenceShareQueries} queries - Answers the shares.
 * @param {{levelNames: string[], mode?: string}} params - What is compared, `max` or `min`.
 * @returns {object|null} The selected Fach with both ends of its range, or `null` when none resolved.
 */
export function selectSubjectByShareClassRange(queries, { levelNames, mode = 'max' }) {
    const school = /** @type {Target} */ ({ type: 'school', classNames: [] });
    const subjectNames = getSubjectNamesFromRows(queries.getRowsForSubjectAggregateTarget(school));

    return getBestNumericSelection(
        subjectNames,
        (subjectName) =>
            classRangeSelection(
                getSubjectCompetenceShareClassRange(queries, {
                    target: school,
                    levelNames,
                    subjectName,
                }),
                {
                    type: 'subjectDomain',
                    target: 'school',
                    subjectName,
                    domainId: null,
                    domainName: null,
                },
            ),
        (_subjectName, selection) => selection.shareRange,
        (subjectName) => `${subjectName}|`,
        mode,
    );
}

/**
 * The same question one Domäne at a time.
 *
 * Kept separate from the Fach-level verb rather than derived from it: pooling a Fach's
 * Domänen averages their class spreads away, so a Domäne can hide the school's widest
 * internal gap behind a calm Fach aggregate.
 * @param {CompetenceShareQueries} queries - Answers the shares.
 * @param {{levelNames: string[], mode?: string}} params - What is compared, `max` or `min`.
 * @returns {object|null} The selected Fach/Domäne with both ends of its range, or `null` when none resolved.
 */
export function selectSubjectDomainByShareClassRange(queries, { levelNames, mode = 'max' }) {
    const school = /** @type {Target} */ ({ type: 'school', classNames: [] });

    return getBestNumericSelection(
        queries.getAvailableSubjectDomainSelections(school),
        (selection) =>
            classRangeSelection(
                getSubjectCompetenceShareClassRange(queries, {
                    target: school,
                    levelNames,
                    subjectName: selection.subjectName,
                    domainId: selection.domainId,
                }),
                {
                    type: 'subjectDomain',
                    target: 'school',
                    subjectName: selection.subjectName,
                    domainId: selection.domainId,
                    domainName: selection.domainName ?? null,
                },
            ),
        (_selection, bestSelection) => bestSelection.shareRange,
        (selection) =>
            `${selection.subjectName}|${selection.domainId ?? ''}|${selection.domainName ?? ''}`,
        mode,
    );
}

/**
 * The class whose own subject×domain shares spread most (or least).
 * @param {CompetenceShareQueries} queries - Answers the shares.
 * @param {{target: Target, levelNames: string[], mode?: string}} params - What is compared, over which population, `max` or `min`.
 * @returns {object|null} The selected class with both ends of its range, or `null`.
 */
export function selectClassBySubjectShareRange(queries, { target, levelNames, mode = 'max' }) {
    return getBestNumericSelection(
        queries.getCandidateClassNames(target),
        (className) =>
            classRangeSelection(
                getCompetenceLevelShareRange(queries, {
                    target: /** @type {Target} */ ({ type: 'classes', classNames: [className] }),
                    levelNames,
                }),
                { type: 'class', className },
            ),
        (_className, selection) => selection.shareRange,
        (className) => className,
        mode,
    );
}

/**
 * A range folded into the selection a spread verb reports.
 * @param {object|null} range - From `getSelectionValueRange`.
 * @param {object} identity - What the range is of.
 * @returns {object|null} The selection, or `null` without a range.
 */
function classRangeSelection(range, identity) {
    return !range
        ? null
        : {
              ...identity,
              shareRange: range.maxShare - range.minShare,
              minShare: range.minShare,
              maxShare: range.maxShare,
              minSelection: range.minSelection,
              maxSelection: range.maxSelection,
          };
}

/**
 * @param {CompetenceShareQueries} queries - Answers the shares.
 * @param {string} className - The class.
 * @param {string[]} levelNames - The levels the share counts.
 * @returns {number|null} The unweighted mean over the class's measurable selections, or `null`.
 */
function getMeanCompetenceShareForClass(queries, className, levelNames) {
    const shares = queries
        .getAvailableSubjectDomainSelections(className)
        .map((selection) =>
            queries.getCompetenceLevelShare({
                target: className,
                levelNames,
                subjectName: selection.subjectName,
                domainId: selection.domainId,
            }),
        )
        .filter(
            /** @type {(share: number|null) => share is number} */ (
                (share) => typeof share === 'number' && Number.isFinite(share)
            ),
        );

    return shares.length === 0
        ? null
        : shares.reduce((sum, share) => sum + share, 0) / shares.length;
}
