// @vitest-browser

/**
 * SL Kompetenzstufen charts — a redraw runs against the SVG already drawn.
 *
 * Both charts join their groups and bars by key, so a second pass with the same data
 * changes nothing, and a legend toggle redraws in place: a bar that stays keeps its node
 * (and with it keyboard focus), and a hidden Kompetenzstufe leaves every bar.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { select } from 'd3';

import { CompetenceOverviewRenderer } from '../../../../../src/sl/modules/charts/competence/overview/competenceOverviewRenderer.js';
import { CompetenceDetailRenderer } from '../../../../../src/sl/modules/charts/competence/detail/competenceDetailRenderer.js';
import { buildCompetenceLevelIndex } from '../../../../../src/sl/slCompetenceLevelIndex.js';
import { calculateDetailedBoxPlotStats } from '../../../../../src/sl/utils/slBoxPlotStats.js';
import { calculateRatingDistribution } from '../../../../../src/sl/utils/slRatingDistribution.js';
import { teachingQualityKey } from '../../../../../src/sl/utils/slSurveyDerivation.js';
import { readingValueGroup as competenceValueGroup } from '../../../../support/slValueGroupFactories.js';
import { required } from '../../../../support/required.js';
import { toDataTableList } from '../../../../../src/common/charts/host/chartDataTable.js';
import { legendPill } from '../../../../support/dom.js';
import { createTestContext } from '../../../../support/glossaryFixture.js';
import { expectStableRedraw, makeVisibleChartContainer } from '../../../../support/chartHarness.js';

const CONTAINER_ID = 'sl-competence-redraw-test';

const STATE = competenceValueGroup({
    id: 'nw',
    type: 'state',
    name: 'Landesschnitt',
    counts: { I: 300, II: 700 },
});
const SCHOOL = competenceValueGroup({
    id: 'schule',
    type: 'school',
    name: 'Schule',
    counts: { I: 40, II: 60 },
});
const GROUPS = [
    competenceValueGroup({ id: '8a', type: 'group', name: '8a', counts: { I: 3, II: 9 } }),
    competenceValueGroup({ id: '8b', type: 'group', name: '8b', counts: { I: 5, II: 5 } }),
];

/** @type {HTMLDivElement} The container `beforeEach` mounts. */
let container;

describe('SL Kompetenzstufen charts — redraw in place', () => {
    beforeEach(() => {
        container = makeVisibleChartContainer(CONTAINER_ID, { widthPx: 800, heightPx: 400 });
    });

    it('the overview changes nothing when it draws the same data again', () => {
        const chart = new CompetenceOverviewRenderer(
            container,
            buildCompetenceLevelIndex([STATE, SCHOOL, ...GROUPS]),
            { context: createTestContext('sl'), autoResize: false },
        );
        chart.create();
        expectStableRedraw(chart, '.bar-slot-group rect.bar-segment');
    });

    it('the detail chart changes nothing when it draws the same data again', () => {
        const chart = new CompetenceDetailRenderer(container, [GROUPS], {
            context: createTestContext('sl'),
            autoResize: false,
            vizMode: 'stacked_bar',
            index: buildCompetenceLevelIndex([STATE, SCHOOL, ...GROUPS]),
        });
        chart.create();
        expectStableRedraw(chart, '.sub-bar-group rect.bar-segment');
    });

    it('takes a hidden Kompetenzstufe out of the bars drawn, and keeps the rest', () => {
        // The redraw joins the shown levels, so the hidden one leaves its bar; a full
        // rebuild would replace the bars that stay.
        const chart = new CompetenceDetailRenderer(container, [GROUPS], {
            context: createTestContext('sl'),
            autoResize: false,
            vizMode: 'stacked_bar',
            legend: 'side',
            index: buildCompetenceLevelIndex(GROUPS),
        });
        chart.create();
        const pill = legendPill(required(chart.legendPanel), 'I', 'Kompetenzstufen');
        // The fixture's levels are unregistered, so each is its own swatch, named by its level.
        /** @type {(rect: Element) => boolean} */
        const isHidden = (rect) =>
            /** @type {{field: string}} */ (select(rect).datum()).field === 'I';
        /** The segments drawn and not on their way out. */
        const shown = () =>
            [...container.querySelectorAll('rect.bar-segment')].filter(
                (rect) => required(rect.parentElement).style.pointerEvents !== 'none',
            );
        const kept = shown().find((rect) => !isHidden(rect));
        expect(shown().some(isHidden)).toBe(true);

        pill.click();

        expect(shown().some(isHidden)).toBe(false);
        expect(shown()).toContain(kept);
    });
});

describe('SL Kompetenzstufen charts — data table', () => {
    beforeEach(() => {
        container = makeVisibleChartContainer(CONTAINER_ID, { widthPx: 800, heightPx: 400 });
    });

    it('the overview lists the bars its pills leave on: the Schulschnitt to start with', () => {
        const chart = new CompetenceOverviewRenderer(
            container,
            buildCompetenceLevelIndex([STATE, SCHOOL, ...GROUPS]),
            { context: createTestContext('sl'), autoResize: false, legend: 'side' },
        );
        chart.create();
        const table = required(chart.dataTable());

        expect(table.columns.map((column) => column.label)).toEqual([
            'Bereich',
            'Gruppe',
            'Anzahl Schüler:innen',
            'I',
            'II',
        ]);
        expect(
            table.rows.map((row) => row.slice(1, 5).map((cell) => cell.values ?? cell.text)),
        ).toEqual([['Schule', [100], [40, 40], [60, 60]]]);

        legendPill(required(chart.legendPanel), '8a', 'Lerngruppen').click();
        expect(required(chart.dataTable()).rows.map((row) => row[1].text)).toEqual([
            'Schule',
            'Lerngruppe 8a',
        ]);
        legendPill(required(chart.legendPanel), 'II', 'Kompetenzstufen').click();
        expect(required(chart.dataTable()).columns.map((column) => column.label)).not.toContain(
            'II',
        );
    });

    it('the overview keys no Lerngruppen while no group has results', () => {
        // The groups sat the Fach but nobody in them was counted: no bar, no pill, and so
        // no master pill with nothing to switch.
        const unscored = GROUPS.map((group) =>
            competenceValueGroup({
                id: group.id,
                type: 'group',
                name: group.name,
                counts: { I: 0, II: 0 },
            }),
        );
        const chart = new CompetenceOverviewRenderer(
            container,
            buildCompetenceLevelIndex([STATE, SCHOOL, ...unscored]),
            { context: createTestContext('sl'), autoResize: false, legend: 'side' },
        );

        expect(chart.chartKey().map((block) => block.title)).not.toContain('Lerngruppen');
    });

    it('the overview created behind its table lists what its first draw will show', () => {
        // A rebuild while the card shows its table creates the chart hidden: it draws
        // only once shown, and its pills start as the key says before that.
        container.hidden = true;
        const chart = new CompetenceOverviewRenderer(
            container,
            buildCompetenceLevelIndex([STATE, SCHOOL, ...GROUPS]),
            { context: createTestContext('sl'), autoResize: false, legend: 'side' },
        );
        chart.create();

        expect(required(chart.dataTable()).rows.map((row) => row[1].text)).toEqual(['Schule']);
    });

    it('the detail chart lists every bar drawn, one row per group, an empty bar empty', () => {
        const chart = new CompetenceDetailRenderer(container, [GROUPS], {
            context: createTestContext('sl'),
            autoResize: false,
            vizMode: 'stacked_bar',
            legend: 'side',
            index: buildCompetenceLevelIndex(GROUPS),
        });
        chart.create();
        const [table, quality] = toDataTableList(chart.dataTable());

        expect(quality).toBeUndefined();
        expect(table.title).toBe('Kompetenzstufen');
        // The payload has no school value group: its bar says "keine Daten", its row is empty.
        expect(table.rows.map((row) => [row[1].text, row[2].values])).toEqual([
            ['Lerngruppe 8a', [12]],
            ['Lerngruppe 8b', [10]],
            ['Schule', [null]],
        ]);
        expect(table.rows[1][3].values).toEqual([50, 5]);
    });
});

describe('SL Kompetenzstufen detail — Unterrichtsqualität table', () => {
    beforeEach(() => {
        container = makeVisibleChartContainer(CONTAINER_ID, { widthPx: 800, heightPx: 400 });
    });

    const VALUES = [2, 2.5, 3, 3.5, 4];
    const TEACHING_QUALITY = new Map([
        [
            teachingQualityKey('8a', 'Deutsch'),
            {
                groupName: '8a',
                count: VALUES.length,
                values: VALUES,
                statistics: required(calculateDetailedBoxPlotStats(VALUES)),
                distribution: calculateRatingDistribution(VALUES),
            },
        ],
    ]);

    /**
     * @param {string} vizMode - How the Unterrichtsqualität draws.
     * @returns {CompetenceDetailRenderer} The chart, drawn.
     */
    const drawWithQuality = (vizMode) => {
        const chart = new CompetenceDetailRenderer(container, [GROUPS], {
            context: createTestContext('sl'),
            autoResize: false,
            vizMode,
            legend: 'side',
            index: buildCompetenceLevelIndex(GROUPS),
            teachingQuality: /** @type {any} */ (TEACHING_QUALITY),
        });
        chart.create();
        return chart;
    };

    it('lists the box figures in box mode, the rating shares in bar mode', () => {
        const [, boxes] = toDataTableList(drawWithQuality('boxplot').dataTable());
        expect(boxes.title).toBe('Unterrichtsqualität (kogn. Aktivierung)');
        expect(boxes.rows.map((row) => [row[1].text, row[2].values, row[3].values])).toEqual([
            ['Lerngruppe 8a', [5], [3]],
        ]);

        const [, bars] = toDataTableList(drawWithQuality('stacked_bar').dataTable());
        expect(bars.columns.map((column) => column.label).slice(3, 4)).toEqual(['1-2 (niedrig)']);
        expect(bars.rows[0].at(-1)?.values).toEqual([3]);
    });

    it('names the Fach as the Bereich of a mark rated per Fach, not its first Domäne', () => {
        const spelling = GROUPS.map((group) =>
            competenceValueGroup({
                id: `${group.id}-rs`,
                type: 'group',
                name: group.name,
                domainId: 'rs',
                domainName: 'Orthografie',
                counts: { I: 4, II: 6 },
            }),
        );
        const chart = new CompetenceDetailRenderer(container, [GROUPS, spelling], {
            context: createTestContext('sl'),
            autoResize: false,
            vizMode: 'boxplot',
            legend: 'side',
            index: buildCompetenceLevelIndex([...GROUPS, ...spelling]),
            teachingQuality: /** @type {any} */ (TEACHING_QUALITY),
        });
        chart.create();
        const [table, boxes] = toDataTableList(chart.dataTable());

        expect(table.rows[0][0].text).toBe('Deutsch: Lesen');
        expect(boxes.rows.map((row) => [row[0].text, row[1].text])).toEqual([
            ['Deutsch', 'Lerngruppe 8a'],
        ]);
    });
});
