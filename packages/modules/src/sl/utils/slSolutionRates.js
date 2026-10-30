/**
 * The Lösungsquote queries — solution rates for a school, its groups or a comparison
 * population, per Fach and Domäne, read off the `result` aggregation value groups.
 *
 * No info-box placeholder may state a Lösungsquote. A school or group rate is the share
 * of `Richtig` among all its responses over whichever items a value group's booklet held,
 * and the groups an SL box compares may sit different booklets within one subject
 * (Schwierigkeit A/B/C), which biases the pooled rate. A competence-level distribution is
 * equated per booklet by the Äquivalenztabelle before it reaches the client.
 *
 * So every rate of a Domäne sat in several booklets is `null`, for every target, and so is
 * every rate over a whole Fach tested with several (`slBooklets.js`): a reader must treat
 * a missing rate as unmeasured, and `hasMixedBooklets` says why.
 *
 * The queries are read through one `SOLUTION_RATES` dataset per store.
 */

/** @typedef {import('../../common/data/schemas/aggregations.js').AggregationsValueGroup} AggregationsValueGroup */
/** @typedef {import('./slQueryPrimitives.js').DomainScope} DomainScope */

import { dataset } from '../../common/data/documentStore.js';
import { readCorrectShare, readResultCounts } from '../../common/domain/resultAggregations.js';
import { SL_DATASETS } from '../slDatasets.js';
import { groupNameOfValueGroup } from './slGroupJoin.js';
import { hasMixedBooklets } from './slBooklets.js';
import {
    filterComparisons,
    ALL_DOMAINS,
    narrowToSubjectDomain,
    normalizeTarget,
    sumRatio,
} from './slQueryPrimitives.js';

/** Names the rate queries in the warnings of a target or selection they cannot read. */
const CALLER = 'SolutionRateQueries';

/** @typedef {NonNullable<ReturnType<typeof normalizeTarget>>} NormalizedTarget */
/** @typedef {import('../slCompetenceLevelIndex.js').CompetenceLevelIndex} CompetenceLevelIndex */

/**
 * The solution rate of a normalised target in one subject×domain, once per store and
 * question: the same rate is asked on every render.
 */
const SOLUTION_RATE = dataset('sl.solutionRate', {
    inputs: ['aggregations.json', SL_DATASETS.COMPETENCE_LEVEL_INDEX, SL_DATASETS.GROUP_NAME_BY_ID],
    params: (
        /** @type {NormalizedTarget} */ target,
        /** @type {string} */ subjectName,
        /** @type {DomainScope} */ domainId,
    ) => [target, subjectName, domainId],
    build: (aggregations, index, groupNameById, _context, target, subjectName, domainId) => {
        if (hasMixedBooklets(index, subjectName, domainId === ALL_DOMAINS ? null : domainId)) {
            return null;
        }
        const matching = narrowToSubjectDomain({
            valueGroups: valueGroupsOf(aggregations, index, groupNameById, target),
            subjectName,
            domainId,
            wholeSubjectWhenSplit: true,
            caller: CALLER,
        });
        return matching.length === 0 ? null : sumRatio(matching, extractResultCounts);
    },
});

/** The rate queries of the loaded dataset, one per store; each rate is memoised by the store */
export const SOLUTION_RATES = dataset('sl.solutionRates', {
    inputs: [SL_DATASETS.COMPETENCE_LEVEL_INDEX, SOLUTION_RATE],
    build: (index, rate) => new SolutionRateQueries({ index, rate }),
});

export class SolutionRateQueries {
    #index;
    #rate;

    /**
     * Built by `SOLUTION_RATES` over the store's memoised rates.
     * @param {object} sources
     * @param {CompetenceLevelIndex} sources.index
     * @param {(target: NormalizedTarget, subjectName: string, domainId: DomainScope) => number|null} sources.rate
     */
    constructor({ index, rate }) {
        this.#index = index;
        this.#rate = rate;
    }

    /**
     * Solution rate of one subject×domain for a target.
     * @param {object} params
     * @param {import('./slQueryPrimitives.js').QueryTarget} [params.target]
     * @param {string} params.subjectName
     * @param {DomainScope} params.domainId - The one Domäne (`narrowToSubjectDomain`); `null` reads a Fach split into Domänen whole.
     * @returns {number|null} 0–1; `null` when nothing matched or the rate mixes booklets.
     */
    getSolutionRate({ target = null, subjectName, domainId }) {
        const normalizedTarget = normalizeTarget(target, CALLER);
        if (!normalizedTarget || !subjectName) {
            return null;
        }
        return this.#rate(normalizedTarget, subjectName, domainId);
    }

    /**
     * Whether a Domäne, or a whole Fach, was tested with several booklets, so its
     * Lösungsquoten are not comparable.
     * @param {string} subjectName - The canonical Fach name.
     * @param {string|null} domainId - The Domäne; `null` for the whole Fach.
     * @returns {boolean} `true` when two or more distinct booklets are in play.
     */
    hasMixedBooklets(subjectName, domainId) {
        return hasMixedBooklets(this.#index, subjectName, domainId);
    }
}

/**
 * The aggregation value groups a target is measured on; empty when the payload names
 * no school.
 * @param {AggregationsValueGroup[]} valueGroups - `aggregations.json`.
 * @param {CompetenceLevelIndex} index
 * @param {Map<string, string>} groupNameById
 * @param {NormalizedTarget} target
 * @returns {import('../../common/data/schemas/aggregations.js').AggregationsValueGroup[]}
 */
function valueGroupsOf(valueGroups, index, groupNameById, target) {
    const { schoolId } = index;
    if (!valueGroups.length || !schoolId) {
        return [];
    }

    if (target.type === 'school') {
        return valueGroups.filter((entry) => entry?.id === schoolId);
    }

    if (target.type === 'comparison') {
        return filterComparisons(valueGroups, target.id);
    }

    /** @type {Set<string|null>} */
    const allowedGroups = new Set(target.groupNames);
    return valueGroups.filter((entry) =>
        allowedGroups.has(groupNameOfValueGroup(entry, groupNameById)),
    );
}

/**
 * One value group's contribution to a pooled rate.
 *
 * A school or group value group counts its responses: every response carries exactly one
 * `result`, so the three frequencies sum to all of them and `Richtig` is the share
 * solved. A Landesschnitt value group has only the `Richtig` share and reports that,
 * which answers for its own domain but cannot be pooled (`sumRatio`).
 * @param {import('../../common/data/schemas/aggregations.js').AggregationsValueGroup} valueGroup
 * @returns {import('./slQueryPrimitives.js').RatioCounts} The value group's `Richtig` count and response count, or its uncounted share.
 */
function extractResultCounts(valueGroup) {
    const { correct, incorrect, notAttempted } = readResultCounts(valueGroup.aggregations);
    if (correct !== undefined && incorrect !== undefined && notAttempted !== undefined) {
        return { matchedCount: correct, totalCount: correct + incorrect + notAttempted };
    }
    const share = readCorrectShare(valueGroup.aggregations);
    return share === null ? { matchedCount: 0, totalCount: 0 } : { share };
}
