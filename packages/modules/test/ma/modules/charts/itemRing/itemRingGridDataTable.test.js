// @vitest-browser

/**
 * The item-ring grid's data table: one row per item, ring by ring in the grouping the
 * grid was built in (Gesamt left out, every item is in it). Each item has the group's
 * Lösungsquote, counted from its responses as the ring counts it, the selection's while
 * one is active, and its pilot value where the booklet has any. An empty ring has no
 * rows; an item nobody answered has an empty rate, never 0.
 */
import { describe, expect, it } from 'vitest';
import { signal } from '@preact/signals-core';
import { mountRingGrid } from '../../../../support/itemRingGrid.js';
import { required } from '../../../../support/required.js';

/**
 * @param {string} iqbId - Also its name.
 * @param {string} domain - Its Leitidee.
 * @param {string} competence - Its Anforderungsbereich.
 * @param {[number, number]} solvedOf - Solved responses, of how many.
 * @param {Array<[string, number]>} results - Each student's result code; `1` is solved.
 */
const item = (iqbId, domain, competence, [solvedCount, responseCount], results) => ({
    iqbId,
    name: iqbId,
    exerciseName: `Aufgabe ${iqbId}`,
    domain,
    competenceLevel: 'II',
    solvedCount,
    responseCount,
    pilotSolutionFrequency: iqbId === 'i1' ? 0.6 : null,
    results: new Map(results),
    competenceGroup0: [competence],
});

const ITEMS = [
    item(
        'i1',
        'zo',
        'I',
        [3, 4],
        [
            ['s1', 1],
            ['s2', 0],
        ],
    ),
    item('i2', 'zo', 'II', [0, 0], []),
    item(
        'i3',
        'rf',
        'I',
        [1, 4],
        [
            ['s1', 0],
            ['s2', 1],
        ],
    ),
];
const STUDENTS = [{ studentId: 's1' }, { studentId: 's2' }, { studentId: 's3' }];
const DOMAINS = [
    { domain: 'zo', domainLabel: 'Zahlen und Operationen' },
    { domain: 'rf', domainLabel: 'Raum und Form' },
    { domain: 'gm', domainLabel: 'Größen und Messen' },
];
/** @type {import('../../../../../src/ma/utils/maCompetenceGroupings.js').MaCompetenceGrouping[]} */
const GROUPINGS = [{ type: 'Anforderungsbereich', field: 'competenceGroup0', values: ['I', 'II'] }];

/**
 * A host whose grid is built in the given grouping.
 * @param {string} grouping
 */
const buildGrid = (grouping) =>
    mountRingGrid(
        { items: ITEMS, students: STUDENTS, domains: DOMAINS, groupings: GROUPINGS },
        { ringGrouping: signal(grouping) },
    );

/** @typedef {import('../../../../../src/common/charts/host/chartDataTable.js').ChartDataTable} ChartDataTable */

/**
 * @param {Awaited<ReturnType<typeof buildGrid>>} host
 * @returns {ChartDataTable[]} The tables the host offers: ring totals, then items.
 */
const tablesOf = (host) => /** @type {ChartDataTable[]} */ (required(host.controller.dataTable()));

/**
 * @param {Awaited<ReturnType<typeof buildGrid>>} host
 * @returns {ChartDataTable} The per-item table.
 */
const tableOf = (host) => tablesOf(host)[1];

describe('ItemRingGridController data table', () => {
    it('lists each Leitidee ring’s items with the group rate, an empty ring none', async () => {
        const table = tableOf(await buildGrid('leitidee'));

        expect(table.columns.map((column) => column.label)).toEqual([
            'Teilaufgabe',
            'Aufgabe',
            'Leitidee',
            'Aufgabenniveau',
            'Lösungsquote Lerngruppe',
            'Pilotierung',
        ]);
        expect(table.rows.map((row) => [row[0].text, row[2].text, row[4].values])).toEqual([
            ['i1', 'Zahlen und Operationen', [75]],
            ['i2', 'Zahlen und Operationen', [null]],
            ['i3', 'Raum und Form', [25]],
        ]);
        expect(table.rows.map((row) => row[5].values)).toEqual([[60], [null], [null]]);
    });

    it('follows the grouping the grid was built in', async () => {
        const table = tableOf(await buildGrid('competenceGroup0'));
        expect(table.columns[2].label).toBe('Anforderungsbereich');
        expect(table.rows.map((row) => [row[0].text, row[2].text])).toEqual([
            ['i1', 'I'],
            ['i3', 'I'],
            ['i2', 'II'],
        ]);
    });

    it('adds the selection’s rate while some students are selected', async () => {
        const host = await buildGrid('leitidee');
        host.state.selectedStudents.value = ['s1', 's2'];
        const table = tableOf(host);

        expect(table.columns[5].label).toBe('Lösungsquote Ausgewählte Schüler:innen');
        expect(table.rows.map((row) => row[5].values)).toEqual([[50], [null], [50]]);
    });

    it('leads with each ring’s totals, as its centre prints them, Gesamt first', async () => {
        const host = await buildGrid('leitidee');
        const [totals] = tablesOf(host);
        expect(totals.columns.map((column) => column.label)).toEqual([
            'Leitidee',
            'Teilaufgaben',
            'Lösungsquote Lerngruppe',
        ]);
        // An empty ring has no rate, not 0 %.
        expect(totals.rows.map((row) => [row[1].values, row[2].values]).slice(1)).toEqual([
            [[2], [75]],
            [[1], [25]],
            [[0], [null]],
        ]);

        host.state.selectedStudents.value = ['s1', 's2'];
        expect(tablesOf(host)[0].columns.at(-1)?.label).toBe(
            'Lösungsquote Ausgewählte Schüler:innen',
        );
    });
});
