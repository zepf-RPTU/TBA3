// @vitest-browser

/**
 * Group comparison — a change of measure, Fach/Domäne or scope keeps each selection only
 * while it still has rows there: the scope group falls back to the Schule, and the pair
 * to the Kategorie's defaults, so no select is left on a value it does not offer. Under
 * the Kategorie Fach, Kompetenzstufen compare Fach/Domänen, the Lösungsquote whole Fächer.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { writeState } from '@tba3/module-base';

import { makeVisibleChartContainer } from '../../../../support/chartHarness.js';
import { groupComparisonChartOn } from '../../../../support/slGroupComparisonChart.js';
import { required } from '../../../../support/required.js';
import { ROMAN_LEVELS, ladderValueGroup } from '../../../../support/competenceScaleFixture.js';

/** @typedef {import('../../../../../src/sl/modules/charts/groupComparison/groupComparisonChart.js').GroupComparisonChart} GroupComparisonChart */

/** 8a's students are female, the others' male, so the Schule has two genders. */
const GENDER_BY_GROUP = /** @type {Record<string, string>} */ ({ '8a': 'female' });

/**
 * One Fach/Domäne with its groups' students, on the Roman ladder.
 * @param {string} subjectName
 * @param {string|null} domainId - Null for a Fach without Domänen.
 * @param {string|null} domainName
 * @param {string[]} groupNames - One student each.
 * @returns {{subjectName: string, domainId: string|null, domainName: string|null, stats: object, studentResults: Array<{studentId: string, gender: string, groupName: string, competenceLevelName: string}>}}
 */
function domainResult(subjectName, domainId, domainName, groupNames) {
    return {
        subjectName,
        domainId,
        domainName,
        stats: { competenceLevelNames: ROMAN_LEVELS, scaleId: ROMAN_LEVELS.join('|') },
        studentResults: groupNames.map((groupName) => ({
            studentId: `${subjectName}-${domainId}-${groupName}`,
            gender: GENDER_BY_GROUP[groupName] ?? 'male',
            groupName,
            competenceLevelName: 'II',
        })),
    };
}

/**
 * A chart over the domain results, its palette knowing their ladder.
 * @param {string} containerId
 * @param {Parameters<typeof groupComparisonChartOn>[1]} datasets
 * @returns {Promise<GroupComparisonChart>}
 */
async function chartOn(containerId, datasets) {
    const container = makeVisibleChartContainer(containerId, { widthPx: 700, heightPx: 400 });
    const chart = await groupComparisonChartOn(container, datasets);
    chart.context.palette.registerCompetenceLevelScales([ladderValueGroup(ROMAN_LEVELS)]);
    return chart;
}

/**
 * One control of the strip.
 * @param {GroupComparisonChart} chart
 * @param {string} id
 * @returns {import('../../../../../src/sl/modules/charts/groupComparison/groupComparisonChart.js').GroupComparisonControl}
 */
const control = (chart, id) =>
    required(chart.getControlModel().find((candidate) => candidate.id === id));

/**
 * @param {GroupComparisonChart} chart
 * @param {string} id
 * @returns {string[]} The option texts the control offers.
 */
const optionTexts = (chart, id) => control(chart, id).options.map((option) => option.text);

/**
 * The group names the chart drew over its wings, left first.
 * @param {GroupComparisonChart} chart
 * @returns {string[]}
 */
const wingNames = (chart) =>
    [...chart.container.querySelectorAll('.wing-header-name')].map(
        (node) => node.textContent ?? '',
    );

describe('Group comparison — selection', () => {
    /** Deutsch Lesen: 8a, 8b, 8c; Deutsch Sprechen: 8a, 8c only (8b sat the other booklet). */
    const DOMAIN_RESULTS = [
        domainResult('Deutsch', 'le', 'Lesen', ['8a', '8b', '8c']),
        domainResult('Deutsch', 'sp', 'Sprechen', ['8a', '8c']),
    ];

    /** @type {GroupComparisonChart} */
    let chart;

    beforeEach(async () => {
        chart = await chartOn('sl-group-comparison-selection-test', {
            domainResults: DOMAIN_RESULTS,
        });
        writeState(chart.state, { category: 'group', group1: '8a', group2: '8b' });
    });

    it('picks a new pair when a group has no rows in the new Domäne', () => {
        control(chart, 'subjectIndex').apply('1');

        expect(chart.selection).toMatchObject({ subjectIndex: 1, group1: '8a', group2: '8c' });
        const offered = control(chart, 'group2').options.map((option) => option.value);
        expect(offered).toContain(chart.selection.group2);
    });

    it('keeps a pair both of whose groups have rows in the new Domäne', () => {
        // Not the default order, which a reset would bring back.
        writeState(chart.state, { group1: '8c', group2: '8a' });
        control(chart, 'subjectIndex').apply('1');

        expect(chart.selection).toMatchObject({ subjectIndex: 1, group1: '8c', group2: '8a' });
    });

    it('falls back to the Schule when the scope group has no rows in the new Domäne', () => {
        writeState(chart.state, { scopeFilter: '8b', category: 'gender' });
        control(chart, 'subjectIndex').apply('1');

        expect(chart.selection).toMatchObject({
            subjectIndex: 1,
            scopeFilter: null,
            category: 'gender',
            group1: 'female',
            group2: 'male',
        });
        expect(control(chart, 'scopeFilter').selectedValue).toBe('__all__');

        chart.create();
        expect(chart.container.querySelectorAll('rect.pyramid-bar').length).toBeGreaterThan(0);
        expect(wingNames(chart)).toEqual(['Weiblich', 'Männlich']);
    });
});

describe('Group comparison — Kategorie Fach', () => {
    /**
     * 8a sat the Deutsch booklet on Lesen and Orthografie, 8b the one on Sprachgebrauch
     * and Hören; both sat Englisch and Mathematik, which has no Domänen.
     */
    const DOMAIN_RESULTS = [
        domainResult('Deutsch', 'le', 'Lesen', ['8a']),
        domainResult('Deutsch', 'rs', 'Orthografie', ['8a']),
        domainResult('Deutsch', 'sp', 'Sprachgebrauch', ['8b']),
        domainResult('Deutsch', 'ho', 'Hören', ['8b']),
        domainResult('Englisch', 'ho', 'Hören', ['8a', '8b']),
        domainResult('Englisch', 'le', 'Lesen', ['8a', '8b']),
        domainResult('Mathematik', null, null, ['8a', '8b']),
    ];

    /** 8b's Lösungsquoten in each Fach/Domäne it sat. */
    const POINTS = DOMAIN_RESULTS.filter(({ studentResults }) =>
        studentResults.some(({ groupName }) => groupName === '8b'),
    ).map(({ subjectName, domainId, domainName }) => ({
        studentId: 's-8b',
        gender: 'male',
        groupName: '8b',
        subject: subjectName,
        domainId,
        domainName,
        rawPoints: 1,
        maxPoints: 2,
        solutionRatePercent: 50,
    }));

    /** @type {GroupComparisonChart} */
    let chart;

    beforeEach(async () => {
        chart = await chartOn('sl-group-comparison-subject-test', {
            domainResults: DOMAIN_RESULTS,
            points: POINTS,
        });
        // 8b on Deutsch: Sprachgebrauch, then its Fächer compared.
        writeState(chart.state, { subjectIndex: 2, scopeFilter: '8b' });
        control(chart, 'category').apply('subject');
    });

    it('offers the Fach/Domänen the scope group sat, each wing named by its own', () => {
        expect(chart.selection).toMatchObject({ group1: 'Deutsch|sp', group2: 'Deutsch|ho' });
        expect(optionTexts(chart, 'group1')).toEqual([
            'Deutsch: Sprachgebrauch',
            'Englisch: Hören',
            'Englisch: Lesen',
            'Mathematik',
        ]);
        expect(optionTexts(chart, 'group2')).toEqual([
            'Deutsch: Hören',
            'Englisch: Hören',
            'Englisch: Lesen',
            'Mathematik',
        ]);

        control(chart, 'group2').apply('Englisch|ho');
        chart.create();

        expect(wingNames(chart)).toEqual(['Deutsch: Sprachgebrauch', 'Englisch: Hören']);
        expect(required(chart.dataTable()).columns.map((column) => column.label)).toEqual([
            'Kompetenzstufe',
            'Deutsch: Sprachgebrauch',
            'Englisch: Hören',
        ]);
    });

    it('compares whole Fächer by Lösungsquote', () => {
        control(chart, 'chartType').apply('points');

        expect(chart.selection).toMatchObject({
            scopeFilter: '8b',
            category: 'subject',
            group1: 'Deutsch',
            group2: 'Englisch',
        });
        expect(optionTexts(chart, 'group2')).toEqual(['Englisch', 'Mathematik']);
    });
});
