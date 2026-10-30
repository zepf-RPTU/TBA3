/**
 * Which bars the key's pills leave on in the detail chart: a Fach, Domäne, comparison or
 * group pill decides from the row a bar stands for, and the draw lays the rest out
 * (`computeBarLayout`). Pure.
 */

import { pillShown, TEACHING_QUALITY_KEY } from '../shared/competencePills.js';

/** @typedef {import('./competenceDetailBarLayout.js').BarVisibility} BarVisibility */

/**
 * Which bars the pills leave on. Every bar has two pills (`groupingConfig.pills`): the
 * one that owns its x-axis group (its Fach, its Fach/Domäne, or its track — comparison,
 * school, group — when grouped by group) and the one that owns its slot (the other of
 * area and track). A bar shows while both are on; the Unterrichtsqualität slot is a slot
 * like any other, so it shows while its own pill and its group's pill are on.
 * A pill the key does not draw is on.
 * @param {import('../shared/competenceLegend.js').SeriesShown} isShown
 * @param {Pick<import('./competenceDetailGrouping.js').CompetenceGroupingConfig, 'pills'>} groupingConfig
 * @returns {BarVisibility}
 */
export function buildBarVisibility(isShown, { pills }) {
    /**
     * @param {import('../shared/competencePills.js').CompetencePill} pill
     * @param {import('./competenceDetailData.js').CompetenceChartRow} row
     * @returns {boolean}
     */
    const shown = (pill, row) => pillShown(isShown, pill, pill.keyOf(row));
    /** @type {BarVisibility['group']} */
    const group = (row) => shown(pills.group(row), row);
    return {
        teachingQuality: pillShown(isShown, pills.quality, TEACHING_QUALITY_KEY),
        group,
        row: (row) => group(row) && shown(pills.slot(row), row),
    };
}
