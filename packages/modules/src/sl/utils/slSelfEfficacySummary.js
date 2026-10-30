import { summarizeRatingValues } from './slRatingSummary.js';
import { pickSelection } from './slSelectionRanking.js';

/** @typedef {import('./slSurveyDerivation.js').SurveyAggregate} SurveyAggregate */

/**
 * One entry reduced to the figures an info-box template reads.
 * @typedef {import('./slRatingSummary.js').RatingSummary & {groupName: string|null}} SurveyAggregateSummary
 */

/**
 * The Selbstwirksamkeit summary an info box reads.
 * @typedef {object} SelfEfficacyInfoBoxSummary
 * @property {SurveyAggregateSummary|null} school
 * @property {SurveyAggregateSummary|null} bestGroup - The group with the highest mean.
 * @property {SurveyAggregateSummary|null} worstGroup - The group with the lowest mean.
 * @property {number|null} groupMeanDifference - Best minus worst group mean.
 */

/**
 * @param {SurveyAggregate|null} entry
 * @returns {SurveyAggregateSummary|null} `null` when it carries no usable value.
 */
function summarizeEntry(entry) {
    if (!entry) return null;
    const ratingSummary = summarizeRatingValues(entry.values, { stats: entry.statistics });
    if (!ratingSummary) return null;

    return { ...ratingSummary, groupName: entry.groupName, count: entry.count };
}

/**
 * The group with the highest (or lowest) mean. Groups without a mean are not ranked;
 * ties break as in `pickSelection`.
 * @param {SurveyAggregateSummary[]} groups
 * @param {'max'|'min'} mode
 * @returns {SurveyAggregateSummary|null} `null` when none has a mean.
 */
function pickGroupByMean(groups, mode) {
    return pickSelection(groups, (entry) => entry.mean ?? NaN, mode);
}

/**
 * The Selbstwirksamkeit summary an info box reads: the school's figures plus the groups
 * ranked against them.
 * @param {object} input
 * @param {SurveyAggregate[]} [input.selfEfficacyByGroup]
 * @param {SurveyAggregate|null} [input.selfEfficacySchool]
 * @returns {SelfEfficacyInfoBoxSummary|null} `null` when neither the school nor a group carries a value.
 */
export function buildSelfEfficacyInfoBoxSummary({
    selfEfficacyByGroup = [],
    selfEfficacySchool = null,
} = {}) {
    const school = summarizeEntry(selfEfficacySchool);
    const groups = selfEfficacyByGroup
        .map((entry) => summarizeEntry(entry))
        .filter((entry) => entry !== null);

    if (!school && groups.length === 0) {
        return null;
    }

    const bestGroup = pickGroupByMean(groups, 'max');
    const worstGroup = pickGroupByMean(groups, 'min');
    // Both ends only ever hold a group with a finite mean.
    const groupMeanDifference =
        bestGroup && worstGroup ? Number(bestGroup.mean) - Number(worstGroup.mean) : null;

    return {
        school,
        bestGroup,
        worstGroup,
        groupMeanDifference,
    };
}
