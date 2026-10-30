// @vitest-browser

/**
 * SL competence detail — what a pill toggle does to the bars.
 *
 * Every draw reads the pills through `buildBarVisibility`, which decides from the
 * row a bar stands for whether it stays, and lays the visible bars out through
 * `computeBarLayout`. These tests pin which rows a hidden Domäne, comparison track or
 * group removes, and that the layout keeps its subgroup gaps for the bars that stay.
 */

import { describe, expect, it } from 'vitest';

import { buildBarVisibility as buildFromPills } from '../../../../../../src/sl/modules/charts/competence/detail/competenceDetailVisibility.js';
import { computeBarLayout } from '../../../../../../src/sl/modules/charts/competence/detail/competenceDetailBarLayout.js';
import {
    getGroupingConfig,
    rowsInDrawOrder,
} from '../../../../../../src/sl/modules/charts/competence/detail/competenceDetailGrouping.js';
import { calculateDetailedBoxPlotStats } from '../../../../../../src/sl/utils/slBoxPlotStats.js';
import { calculateRatingDistribution } from '../../../../../../src/sl/utils/slRatingDistribution.js';
import { required } from '../../../../../support/required.js';
import { BAR_MAX_THICKNESS_PX } from '../../../../../../src/common/charts/chartDefaults.js';
import {
    PILLS,
    trackPill,
} from '../../../../../../src/sl/modules/charts/competence/shared/competencePills.js';

/** @typedef {import('../../../../../../src/sl/modules/charts/competence/detail/competenceDetailData.js').CompetenceChartRow} CompetenceChartRow */
/** @typedef {import('../../../../../../src/sl/modules/charts/competence/detail/competenceDetailBarLayout.js').BarLayoutInput} BarLayoutInput */
/** @typedef {import('../../../../../../src/sl/modules/charts/competence/detail/competenceDetailBarLayout.js').BarLayout} BarLayout */
/** @typedef {import('../../../../../../src/sl/modules/charts/competence/detail/competenceDetailBarLayout.js').BarVisibility} BarVisibility */

/**
 * Which pills are off, per group: `{domain: {'de|Lesen': false}}`.
 * @typedef {{[group: string]: {[key: string]: boolean}}} LegendState
 */

/**
 * The bar visibility for the pills a case switches off.
 * @param {LegendState} state
 * @param {Parameters<typeof buildFromPills>[1]} groupingConfig
 * @returns {BarVisibility}
 */
function buildBarVisibility(state, groupingConfig) {
    return buildFromPills((key, group) => state[group]?.[key] !== false, groupingConfig);
}

/**
 * A prepared row carrying only the fields a case sets, plus the `renderKey` a group's or
 * the school's row is built with (its type): the visibility, grouping and layout read
 * nothing else.
 * @param {Partial<CompetenceChartRow> & Pick<CompetenceChartRow, 'type' | 'name'>} fields
 * @returns {CompetenceChartRow}
 */
const chartRow = (fields) => /** @type {CompetenceChartRow} */ ({
    renderKey: fields.type,
    ...fields,
});

/** Unterrichtsqualität of one rating, enough for a row to claim a Q slot. */
const TEACHING_QUALITY = {
    ...required(calculateDetailedBoxPlotStats([3])),
    count: 1,
    distribution: calculateRatingDistribution([3]),
};

// The pills each grouping answers to (`CompetenceGroupingConfig.pills`): the area owns
// the x-axis group and the track the slot, or, grouped by group, the other way round.
const BY_DOMAIN = {
    groupBySubject: false,
    groupByDomain: true,
    pills: { group: () => PILLS.area, slot: trackPill, quality: PILLS.comparison },
};
const BY_SUBJECT = {
    groupBySubject: true,
    groupByDomain: false,
    pills: { group: () => PILLS.subject, slot: trackPill, quality: PILLS.comparison },
};
const BY_GROUP = {
    groupBySubject: false,
    groupByDomain: false,
    pills: { group: trackPill, slot: () => PILLS.area, quality: PILLS.area },
};

/**
 * The layout of a render with every bar at a 12 px label size on a 1000 px plot.
 * @param {Pick<BarLayoutInput, 'groups' | 'groupingConfig' | 'xDomain'> & Partial<BarLayoutInput>} input
 * @param {BarVisibility} visibility
 * @returns {BarLayout}
 */
function layoutOf(input, visibility) {
    return computeBarLayout(
        {
            width: 1000,
            hasTeachingQuality: false,
            barLabelFontSize: 12,
            labelSpace: null,
            ...input,
        },
        visibility,
    );
}

/**
 * The rows per group, as the renderer's model holds them: each group in draw order.
 * @param {CompetenceChartRow[]} rows
 * @param {(row: CompetenceChartRow) => string} keyOf - A row's group.
 * @param {import('../../../../../../src/sl/modules/charts/competence/detail/competenceDetailGrouping.js').CompetenceGroupingConfig} groupingConfig
 * @returns {{[key: string]: CompetenceChartRow[]}}
 */
function groupRows(rows, keyOf, groupingConfig) {
    /** @type {{[key: string]: CompetenceChartRow[]}} */
    const groups = {};
    rows.forEach((row) => (groups[keyOf(row)] ??= []).push(row));
    return Object.fromEntries(
        Object.entries(groups).map(([key, group]) => [key, rowsInDrawOrder(group, groupingConfig)]),
    );
}

describe('buildBarVisibility — Domänen pills', () => {
    const lesen = chartRow({
        type: 'group',
        name: '8a',
        subject: 'en',
        domainLabel: 'Lesen',
    });
    const hoeren = chartRow({
        type: 'group',
        name: '8a',
        subject: 'en',
        domainLabel: 'Hören',
    });

    it('hides the rows of a hidden Fach/Domäne pair and keeps the rest', () => {
        const visibility = buildBarVisibility({ domain: { 'en|Lesen': false } }, BY_DOMAIN);

        expect(visibility.row(lesen)).toBe(false);
        expect(visibility.row(hoeren)).toBe(true);
    });

    it('does not let a same-named Domäne of another Fach hide the row', () => {
        const visibility = buildBarVisibility({ domain: { 'de|Lesen': false } }, BY_DOMAIN);

        expect(visibility.row(lesen)).toBe(true);
    });
});

describe('buildBarVisibility — Vergleich and Lerngruppen pills', () => {
    const state = chartRow({
        type: 'comparison',
        renderKey: 'comparison:nw',
        name: 'Landesschnitt',
    });
    const school = chartRow({ type: 'school', name: 'Schule' });
    const groupName = chartRow({ type: 'group', name: '8a' });

    it('hides only the track whose pill is off', () => {
        const visibility = buildBarVisibility({ comparison: { school: false } }, BY_SUBJECT);

        expect([state, school, groupName].map(visibility.row)).toEqual([true, false, true]);
    });

    it('hides a Landesschnitt by its own render key', () => {
        const visibility = buildBarVisibility(
            { comparison: { 'comparison:nw': false } },
            BY_SUBJECT,
        );

        expect([state, school, groupName].map(visibility.row)).toEqual([false, true, true]);
    });

    it('combines the Lerngruppen and Vergleich pills with the Domänen pills when grouped by group', () => {
        const lesen8a = { ...groupName, subject: 'de', domainLabel: 'Lesen' };
        const lesen8b = { ...lesen8a, name: '8b' };
        const hoeren8b = { ...lesen8b, domainLabel: 'Hören' };
        const schoolLesen = { ...school, subject: 'de', domainLabel: 'Lesen' };
        const visibility = buildBarVisibility(
            {
                domain: { 'de|Hören': false },
                comparison: { school: false },
                'individual-group': { '8a': false },
            },
            BY_GROUP,
        );

        expect([lesen8a, lesen8b, hoeren8b, schoolLesen].map(visibility.row)).toEqual([
            false,
            true,
            false,
            false,
        ]);
    });

    it('reads the Unterrichtsqualität pill from where the key puts it', () => {
        const offInComparison = { comparison: { teachingQuality: false } };
        const offInDomain = { domain: { teachingQuality: false } };

        expect(buildBarVisibility(offInComparison, BY_SUBJECT).teachingQuality).toBe(false);
        expect(buildBarVisibility(offInComparison, BY_DOMAIN).teachingQuality).toBe(false);
        expect(buildBarVisibility(offInDomain, BY_GROUP).teachingQuality).toBe(false);
        expect(buildBarVisibility(offInComparison, BY_GROUP).teachingQuality).toBe(true);
        expect(buildBarVisibility({}, BY_DOMAIN).teachingQuality).toBe(true);
    });
});

describe('computeBarLayout — a toggle keeps the first paint’s gaps', () => {
    /**
     * Two Fächer with two Domänen each, one group and the school: grouped by Fach, each
     * group holds `group_d0, school_d0 | group_d1, school_d1` with a subgroup gap at `|`.
     * @returns {Pick<BarLayoutInput, 'groups' | 'groupingConfig' | 'xDomain'>}
     */
    function subjectGroups() {
        const rows = ['de', 'en'].flatMap((subject) =>
            ['lesen', 'hoeren'].flatMap((domain) =>
                ['group', 'school'].map((type) =>
                    chartRow({
                        type,
                        name: type === 'group' ? '8a' : 'Schule',
                        subject,
                        domain,
                        domainLabel: domain,
                    }),
                ),
            ),
        );
        const groupingConfig = getGroupingConfig(rows, '8a');
        return {
            groups: groupRows(rows, (row) => row.subject, groupingConfig),
            groupingConfig,
            xDomain: ['de', 'en'],
        };
    }

    /**
     * The layout for a legend state.
     * @param {LegendState} state
     * @param {Parameters<typeof layoutOf>[0]} [fixture] - The inputs, when the caller needs their rows.
     * @returns {BarLayout}
     */
    function layoutFor(state, fixture = subjectGroups()) {
        return layoutOf(fixture, buildBarVisibility(state, fixture.groupingConfig));
    }

    /**
     * The distance from each bar to the next in one group, in pitches.
     * @param {BarLayout} layout
     * @param {string} groupKey
     * @returns {number[]} One step per neighbouring pair, rounded to two places.
     */
    function steps(layout, groupKey) {
        const xs = layout.groupBars[groupKey].map((bar) => bar.x);
        return xs
            .slice(1)
            .map((x, i) => Math.round(((x - xs[i]) / layout.barWidthWithPadding) * 100) / 100);
    }

    it('opens a subgroup gap between the two Domänen on first paint', () => {
        const layout = layoutFor({});

        expect(layout.groupBars.de.map((bar) => bar.key)).toEqual([
            'group_d0',
            'school_d0',
            'group_d1',
            'school_d1',
        ]);
        expect(steps(layout, 'de')).toEqual([1, 1.1, 1]);
    });

    it('keeps that gap when the school is hidden, and lets the remaining bars widen', () => {
        // A narrow plot, so neither layout runs into the bar thickness cap.
        const narrow = { ...subjectGroups(), width: 300 };
        const all = layoutOf(narrow, buildBarVisibility({}, narrow.groupingConfig));
        const withoutSchool = layoutOf(
            narrow,
            buildBarVisibility({ comparison: { school: false } }, narrow.groupingConfig),
        );

        expect(withoutSchool.groupBars.de.map((bar) => bar.key)).toEqual(['group_d0', 'group_d1']);
        expect(steps(withoutSchool, 'de')).toEqual([1.1]);
        expect(withoutSchool.uniformBarWidth).toBeGreaterThan(all.uniformBarWidth);
    });

    it('caps the bars on a wide plot and centres them in it', () => {
        // A pitch that grows with the plot draws slabs on a wide card with few bars.
        const layout = layoutFor({ comparison: { school: false } });
        const [first, last] = [layout.groupKeys[0], layout.groupKeys.at(-1) ?? ''];
        const left = layout.groupPositions[first].x;
        const right = 1000 - (layout.groupPositions[last].x + layout.groupPositions[last].width);

        expect(layout.uniformBarWidth).toBeLessThanOrEqual(BAR_MAX_THICKNESS_PX);
        expect(left).toBeCloseTo(right);
    });

    it('places every visible row and leaves a hidden one out', () => {
        const fixture = subjectGroups();
        const layout = layoutFor({ comparison: { school: false } }, fixture);
        const placed = Object.values(fixture.groups)
            .flat()
            .map((row) => layout.rowX.has(row));

        expect(placed).toEqual([true, false, true, false, true, false, true, false]);
    });

    /**
     * The layout inputs of rows that all carry Unterrichtsqualität, grouped the way the
     * data and the scoped group imply.
     * @param {CompetenceChartRow[]} rows
     * @param {string|null} groupName - The group the view is scoped to, if any.
     * @returns {Parameters<typeof layoutOf>[0]}
     */
    function qualityFixture(rows, groupName) {
        const groupingConfig = getGroupingConfig(rows, groupName, true);
        const groups = groupRows(rows, groupingConfig.getGroupKey, groupingConfig);
        return { groups, groupingConfig, xDomain: Object.keys(groups), hasTeachingQuality: true };
    }

    it('drops a hidden Fach, Unterrichtsqualität slot included, when grouped by Fach', () => {
        const rows = ['de', 'en'].flatMap((subject) =>
            ['group', 'school'].map((type) =>
                chartRow({
                    type,
                    name: type === 'group' ? '8a' : 'Schule',
                    subject,
                    domain: '',
                    domainLabel: '',
                    teachingQuality: TEACHING_QUALITY,
                }),
            ),
        );
        const fixture = qualityFixture(rows, '8a');

        expect(layoutFor({ subject: { de: false } }, fixture).groupKeys).toEqual(['en']);
        // Hiding every track still leaves each Fach its Q slot.
        const tracksOff = layoutFor(
            { comparison: { school: false }, 'individual-group': { '8a': false } },
            fixture,
        );
        expect(tracksOff.groupKeys).toEqual(['de', 'en']);
        expect(tracksOff.groupBars.de.map((bar) => bar.key)).toEqual(['teachingQuality']);
    });

    it('keeps a Domäne’s Q slot while its pill is on, and drops it with it, when grouped by Domäne', () => {
        // As the data prepares them: a Fach's Unterrichtsqualität rides on its first Domäne.
        const rows = ['lesen', 'hoeren'].flatMap((domain) =>
            ['8a', 'Schule'].map((name) =>
                chartRow({
                    type: name === 'Schule' ? 'school' : 'group',
                    name,
                    subject: 'de',
                    domain,
                    domainLabel: domain,
                    teachingQuality: domain === 'lesen' ? TEACHING_QUALITY : null,
                }),
            ),
        );
        const fixture = qualityFixture(rows, '8a');
        const [lesen, hoeren] = Object.keys(fixture.groups);

        // Hiding every track still leaves the Domäne that carries Q its slot.
        const tracksOff = layoutFor(
            { comparison: { school: false }, 'individual-group': { '8a': false } },
            fixture,
        );
        expect(tracksOff.groupKeys).toEqual([lesen]);
        expect(tracksOff.groupBars[lesen].map((bar) => bar.key)).toEqual(['teachingQuality']);
        expect(layoutFor({ domain: { 'de|lesen': false } }, fixture).groupKeys).toEqual([hoeren]);
    });

    it('drops a hidden group’s group, Unterrichtsqualität slot included, when grouped by group', () => {
        const rows = ['8a', '8b', 'Schule'].map((name) =>
            chartRow({
                type: name === 'Schule' ? 'school' : 'group',
                name,
                subject: 'de',
                domain: 'lesen',
                domainLabel: 'Lesen',
                teachingQuality: TEACHING_QUALITY,
            }),
        );
        const fixture = qualityFixture(rows, null);

        expect(layoutFor({}, fixture).groupKeys).toEqual(['8a', '8b', 'Schule']);
        expect(layoutFor({ 'individual-group': { '8a': false } }, fixture).groupKeys).toEqual([
            '8b',
            'Schule',
        ]);
        expect(layoutFor({ comparison: { school: false } }, fixture).groupKeys).toEqual([
            '8a',
            '8b',
        ]);
        // Every Domäne pill off still leaves each shown group its Q slot.
        const domainsOff = layoutFor({ domain: { 'de|Lesen': false } }, fixture);
        expect(domainsOff.groupKeys).toEqual(['8a', '8b', 'Schule']);
        expect(domainsOff.groupBars['8a'].map((bar) => bar.key)).toEqual(['teachingQuality']);
    });
});
