// @vitest-browser

/**
 * Group comparison — Lösungsquoten of different booklets are not set side by side.
 *
 * The Diagrammtyp control keeps the Lösungsquote listed but disabled for such a pair,
 * and a chart already on it says why instead of drawing the pyramid. Which pairs mix
 * booklets is `POINTS_MIXED_BOOKLETS`'s, tested in `groupComparisonChartTypes.test.js`.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { writeState } from '@tba3/module-base';

import { makeVisibleChartContainer } from '../../../../support/chartHarness.js';
import { groupComparisonChartOn } from '../../../../support/slGroupComparisonChart.js';
import { required } from '../../../../support/required.js';
import {
    DEUTSCH_BOOKLETS,
    competenceValueGroup,
    twoBookletSubject,
    withBooklet,
} from '../../../../support/slValueGroupFactories.js';

/** Deutsch points of 8a, 8b and 8c. */
const POINTS = [
    ['s1', '8a', 'female'],
    ['s2', '8a', 'male'],
    ['s3', '8b', 'female'],
    ['s4', '8b', 'male'],
    ['s5', '8c', 'female'],
].map(([studentId, groupName, gender]) => ({
    studentId,
    gender,
    groupName,
    subject: 'Deutsch',
    domainId: 'LV',
    domainName: 'LV',
    rawPoints: 1,
    maxPoints: 2,
    solutionRatePercent: 50,
}));

/** 8a and 8c sat the first Deutsch booklet, 8b the second. */
const COMPETENCE_LEVELS = [
    ...twoBookletSubject('LV'),
    withBooklet(
        competenceValueGroup({
            id: '8c',
            type: 'group',
            name: '8c',
            subject: 'Deutsch',
            domainId: 'LV',
            levels: { III: 1 },
        }),
        DEUTSCH_BOOKLETS[0],
    ),
];

/** The Fach/Domäne the points are selected under. */
const DOMAIN_RESULTS = [
    { subjectName: 'Deutsch', domainId: 'LV', domainName: 'LV', stats: {}, studentResults: [] },
];

describe('Group comparison — mixed booklets', () => {
    /** @type {import('../../../../../src/sl/modules/charts/groupComparison/groupComparisonChart.js').GroupComparisonChart} */
    let chart;
    /** @type {HTMLDivElement} */
    let container;

    beforeEach(async () => {
        container = makeVisibleChartContainer('sl-group-comparison-booklets-test', {
            widthPx: 700,
            heightPx: 400,
        });
        chart = await groupComparisonChartOn(container, {
            domainResults: DOMAIN_RESULTS,
            points: POINTS,
            competenceLevels: COMPETENCE_LEVELS,
        });
    });

    /** @returns {{value: string, text: string, disabled?: boolean}} The Lösungsquote option. */
    const pointsOption = () =>
        required(
            required(
                chart.getControlModel().find((control) => control.id === 'chartType'),
            ).options.find((option) => option.value === 'points'),
        );

    it('disables the Lösungsquote for two groups on different booklets', () => {
        writeState(chart.state, { category: 'group', group1: '8a', group2: '8b' });
        expect(pointsOption().disabled).toBe(true);

        writeState(chart.state, { group2: '8c' });
        expect(pointsOption().disabled).toBe(false);
    });

    it('judges the Lösungsquote under Kompetenzstufen and the Kategorie Fach by the Fächer it would compare', async () => {
        // Kompetenzstufen compare Fach/Domänen there (`Deutsch|LV`), the Lösungsquote
        // whole Fächer: a switch puts Deutsch beside Englisch, and the Deutsch groups
        // sat two booklets.
        const englischPoints = {
            ...POINTS[0],
            subject: 'Englisch',
            domainId: null,
            domainName: null,
        };
        chart = await groupComparisonChartOn(container, {
            domainResults: [
                ...DOMAIN_RESULTS,
                {
                    subjectName: 'Englisch',
                    domainId: null,
                    domainName: null,
                    stats: {},
                    studentResults: [],
                },
            ],
            points: [...POINTS, englischPoints],
            competenceLevels: [
                ...COMPETENCE_LEVELS,
                withBooklet(
                    competenceValueGroup({
                        id: '8a-en',
                        type: 'group',
                        name: '8a',
                        subject: 'Englisch',
                        levels: { III: 1 },
                    }),
                    '26-V8-EN-TH-1',
                ),
            ],
        });
        writeState(chart.state, {
            chartType: 'competenceLevel',
            category: 'subject',
            group1: 'Deutsch|LV',
            group2: 'Englisch|null',
        });

        expect(pointsOption().disabled).toBe(true);
    });

    it('says why, rather than drawing, when the chart is already on the Lösungsquote', () => {
        writeState(chart.state, {
            chartType: 'points',
            category: 'group',
            group1: '8a',
            group2: '8b',
        });
        chart.create();

        expect(container.textContent).toContain('unterschiedliche Testhefte');
        expect(container.querySelectorAll('rect.pyramid-bar')).toHaveLength(0);
    });
});
