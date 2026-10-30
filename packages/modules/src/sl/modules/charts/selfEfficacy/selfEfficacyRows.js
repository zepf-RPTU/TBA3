/**
 * What both self-efficacy renderers share about their rows, so a switch between stacked
 * bar and box plot keeps the groups where they were: the band padding, and the name a
 * row key shows. The frame itself is `common/charts/bandChartFrame.js`.
 */

import { surveyRowKey } from '../../../utils/slSurveyDerivation.js';

/** @typedef {import('../../../utils/slSurveyDerivation.js').SurveyAggregate} SurveyAggregate */

/** The gap between lying rows, as a share of each step, inside and at both ends. */
export const GROUP_ROW_PADDING_RATIO = 0.3;

/**
 * @param {SurveyAggregate[]} rows
 * @returns {(key: string) => string} The group name a row key shows.
 */
export function groupNameOf(rows) {
    const nameOf = new Map(rows.map((row) => [surveyRowKey(row), row.groupName]));
    return (key) => nameOf.get(key) ?? key;
}
