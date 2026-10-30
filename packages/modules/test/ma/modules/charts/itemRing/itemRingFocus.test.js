// @vitest-browser

import { describe, it, expect, beforeEach } from 'vitest';
import { ItemRingFocusChart } from '../../../../../src/ma/modules/charts/itemRing/itemRingFocus.js';
import {
    RING_REACH,
    RING_SIZE_MIN_PX,
} from '../../../../../src/ma/modules/charts/itemRing/itemRingGeometry.js';
import { getItemRingFontSizeForRing } from '../../../../../src/ma/modules/charts/itemRing/itemRingTitleMetrics.js';
import { itemRingFocusConfig } from '../../../../../src/ma/modules/charts/itemRing/itemRingFocusConfig.js';
import { itemRingGridConfig } from '../../../../../src/ma/modules/charts/itemRing/itemRingGridConfig.js';
import { MA_DATASETS } from '../../../../../src/ma/index.js';
import { signal } from '@preact/signals-core';
import { createSubjectContext } from '../../../../support/subjectContext.js';
import { itemValueGroups } from '../../../../support/competenceScaleFixture.js';
import { makeVisibleChartContainer, mountChart } from '../../../../support/chartHarness.js';
import { createTestContext } from '../../../../support/glossaryFixture.js';
import { formatPercent } from '../../../../../src/common/utils/numberFormat.js';

/**
 * The focus chart, drawn: the ring and the text blocks under it. Items are shaped as
 * `buildItemArray` builds them, with cases the fixtures lack: unpiloted items, items the
 * per-item aggregation does not cover, an Aufgabenniveau ladder that does not sort
 * alphabetically.
 */

const students = [
    { studentId: 's1', firstName: 'Ada', lastName: 'Berg' },
    { studentId: 's2', firstName: 'Bo', lastName: 'Kern' },
];

/** @typedef {import('../../../../../src/ma/modules/charts/itemRing/itemRingFocus.js').ItemRingFocusEntry} ItemRingFocusEntry */

/**
 * An item of Leitidee `zo`, one of its two responses solved.
 * @param {string} iqbId - Also its name.
 * @param {string} competenceLevel - Its Aufgabenniveau.
 * @param {Partial<ItemRingFocusEntry>} [fields]
 * @returns {ItemRingFocusEntry & {iqbId: string}}
 */
const item = (iqbId, competenceLevel, fields = {}) => ({
    iqbId,
    name: iqbId,
    exerciseName: `Übung ${iqbId}`,
    competenceLevel,
    responseCount: 2,
    solvedCount: 1,
    total: 2,
    correctCount: 1,
    incorrectCount: 1,
    notAttemptedCount: 0,
    pilotSolutionFrequency: null,
    results: new Map(),
    ...fields,
});

const zo = {
    id: 'zo',
    title: 'Zahlen und Operationen',
    iqbIds: new Set(['a1', 'a2']),
    isEmpty: false,
};

/**
 * Draw the focus chart into a fresh container.
 * @param {ItemRingFocusEntry[]} items
 * @param {import('../../../../../src/common/domain/studentIdentity.js').StudentName[]} [studentArray]
 * @param {import('../../../../../src/ma/utils/maItemRings.js').ItemRingChartDefinition|null} [ring]
 * @param {string[]|null} [selectedStudents]
 * @returns {HTMLDivElement}
 */
function renderFocus(items, studentArray = students, ring = zo, selectedStudents = null) {
    const container = makeVisibleChartContainer(`focus-${Math.random().toString(36).slice(2)}`, {
        widthPx: 600,
    });
    const chart = new ItemRingFocusChart(container, {
        context,
        items,
        students: studentArray,
        ring,
        selectedStudents,
    });
    chart.create();
    return container;
}

/**
 * @param {HTMLElement} container
 * @returns {Element[]}
 */
const blocks = (container) => [...container.querySelectorAll('.item-ring-focus-text-block')];
/** Where each text block stands, in the card's order. */
const BLOCK = { results: 0, notable: 1, levels: 2, students: 3 };
/**
 * @param {Element} block - The Leistung block.
 * @returns {Record<string, string>} Each row's value by its label.
 */
const resultRows = (block) =>
    Object.fromEntries(
        [...block.querySelectorAll('.detail-row')].map((row) => [
            (row.querySelector('.detail-label')?.textContent ?? '').replace(/:$/, ''),
            (row.querySelector('.detail-value')?.textContent ?? '').trim(),
        ]),
    );
/**
 * @param {Element} block
 * @returns {string[]}
 */
const listTexts = (block) =>
    [...block.querySelectorAll('.item-ring-focus-text-block-list-item')].map((li) =>
        (li.textContent ?? '').trim(),
    );

/**
 * @param {Element} block - The Niveau table's block.
 * @returns {string[][]} Each body row's cells.
 */
const levelRows = (block) =>
    [...block.querySelectorAll('tbody tr')].map((row) =>
        [...row.children].map((cell) => (cell.textContent ?? '').trim()),
    );

/** @type {import('../../../../../src/common/context/index.js').ModuleContext} A fresh context per test: no item scale unless one registers it. */
let context;
beforeEach(() => {
    context = createTestContext('ma');
});

describe('ItemRingFocusChart', () => {
    it('lists the Aufgabenniveaus in the order of the registered item scale', () => {
        // The ladder is the payload's. Sorted alphabetically, `hoch, mittel, niedrig`
        // put the hardest Niveau first.
        context.palette.registerItemCompetenceScales(
            itemValueGroups(['niedrig', 'mittel', 'hoch']),
        );
        const container = renderFocus([
            item('a1', 'hoch'),
            item('a2', 'niedrig'),
            item('a3', 'mittel'),
        ]);

        expect(levelRows(blocks(container)[BLOCK.levels]).map(([level]) => level)).toEqual([
            'niedrig',
            'mittel',
            'hoch',
        ]);
    });

    it('draws no pilot tick when no item of the Leitidee was piloted', () => {
        // Unpiloted items arrive as `pilotSolutionFrequency: null`. A tick at 0 % (null
        // read as zero) or 50 % (nothing piloted), labelled "based on pilot studies",
        // would show a benchmark no study measured.
        const unpiloted = renderFocus([item('a1', 'II'), item('a2', 'III')]);
        expect(unpiloted.querySelectorAll('.item-ring-pilot-tick-line')).toHaveLength(0);

        const piloted = renderFocus([
            item('a1', 'II', { pilotSolutionFrequency: 0.6 }),
            item('a2', 'III'),
        ]);
        expect(piloted.querySelectorAll('.item-ring-pilot-tick-line')).toHaveLength(1);
    });

    it('leaves an item without responses out of the notable items', () => {
        // An item nobody answered has no success rate. Read as 0 %, it would drag
        // the mean down and itself be listed as the weakest item.
        const container = renderFocus([
            item('a1', 'II', { responseCount: 10, solvedCount: 10 }),
            item('a2', 'II', { responseCount: 10, solvedCount: 9 }),
            item('a3', 'II', { responseCount: 0, solvedCount: 0 }),
        ]);

        expect(listTexts(blocks(container)[BLOCK.notable])).toEqual([]);
        expect(blocks(container)[BLOCK.notable].querySelector('.empty-message')?.textContent).toBe(
            'Keine auffälligen Teilaufgaben gefunden',
        );
    });

    it('measures notable items against the pooled rate the ring prints', () => {
        // The unweighted mean of item rates (62.5 % here) is a different number from
        // the ring's pooled rate (97 %). Measured against it, three items 47 points below
        // the printed rate would go unlisted.
        const container = renderFocus([
            item('a1', 'II', { responseCount: 100, solvedCount: 100 }),
            item('a2', 'II'),
            item('a3', 'II'),
            item('a4', 'II'),
        ]);

        expect(listTexts(blocks(container)[BLOCK.notable])).toHaveLength(3);
    });

    it('lists the items below the threshold its glossary note states', () => {
        // The note under "Auffällige Teilaufgaben" spells the threshold out in words; a
        // change to the code's threshold alone would leave the note stating a wrong one.
        const note = context.glossary.getRequiredEntryText(
            'ma.item.item-ring-focus.notable-items.body',
        );
        const gap = Number(/(\d+) Prozentpunkte/.exec(note)?.[1]);
        // The anchor's 10 000 responses hold the pooled rate just under 100 %.
        const container = renderFocus([
            item('anchor', 'II', { responseCount: 10000, solvedCount: 10000 }),
            item('below', 'II', { responseCount: 100, solvedCount: 100 - gap - 2 }),
            item('within', 'II', { responseCount: 100, solvedCount: 100 - gap + 2 }),
        ]);

        expect(
            listTexts(blocks(container)[BLOCK.notable]).map((text) => text.split(' ')[0]),
        ).toEqual(['below']);
    });

    it('lists every Aufgabenniveau with its items and rates, the selection beside the group', () => {
        // The table is the inner ring's twin: it lists every Niveau with its rate,
        // and a selection adds its own column.
        const items = ['I', 'II', 'III', 'IV', 'V', 'VI'].map((level, index) =>
            item(`a${index}`, level, {
                results: new Map([
                    ['s1', 1],
                    ['s2', 0],
                ]),
            }),
        );
        const group = renderFocus(items);
        const selected = renderFocus(items, students, zo, ['s1']);

        expect(levelRows(blocks(group)[BLOCK.levels])).toHaveLength(6);
        expect(levelRows(blocks(group)[BLOCK.levels])[0].slice(0, 2)).toEqual(['I', '1']);
        expect(blocks(selected)[BLOCK.levels].querySelectorAll('thead th')).toHaveLength(4);
        expect(levelRows(blocks(selected)[BLOCK.levels])[0][3]).toBe(formatPercent(100));
    });

    it('pools the Leistung rows over the Leitidee and agrees with the ring centre', () => {
        // The rows and the centre print one rate: a mismatch would show two Lösungsquoten
        // for the same Leitidee on one card.
        const container = renderFocus([
            item('a1', 'II', { pilotSolutionFrequency: 0.4 }),
            item('a2', 'III', { notAttemptedCount: 1, incorrectCount: 0 }),
        ]);
        const rows = resultRows(blocks(container)[BLOCK.results]);

        expect(rows['Lösungsquote']).toBe(formatPercent(50));
        expect(container.querySelector('.item-ring-center-text')?.textContent).toBe(
            formatPercent(50, 0),
        );
        expect(rows).toMatchObject({
            Richtig: '2',
            Falsch: '1',
            Unbearbeitet: '1',
            'Gesamt Antworten': '4',
        });
        // The mean over the piloted items only, and the group's distance to it.
        expect(rows['Pilotierung']).toMatch(/^40\s?%.*\(\+10\s?PP\)$/);
    });

    it("adds the selection's rate to the Leistung rows, as the centre shows it", () => {
        const items = [
            item('a1', 'II', {
                results: new Map([
                    ['s1', 1],
                    ['s2', 0],
                ]),
            }),
            item('a2', 'II', {
                results: new Map([
                    ['s1', 1],
                    ['s2', 0],
                ]),
            }),
        ];
        const rows = resultRows(blocks(renderFocus(items, students, zo, ['s1']))[BLOCK.results]);

        expect(rows['Lösungsquote Ada Berg']).toBe(formatPercent(100));
        expect(rows['Lösungsquote']).toBe(formatPercent(50));
    });

    it('splits the students at the group rate, each with the rate the ring gives them', async () => {
        // s1 solves both, s2 one of two (50 %, at the group rate), s3 neither; s4 has
        // no result and is left out rather than listed at 0 %.
        const group = [
            ...students,
            { studentId: 's3', firstName: 'Cem', lastName: 'Ott' },
            { studentId: 's4', firstName: 'Dia', lastName: 'Uhl' },
        ];
        const items = [
            item('a1', 'II', {
                responseCount: 3,
                solvedCount: 2,
                results: new Map([
                    ['s1', 1],
                    ['s2', 1],
                    ['s3', 0],
                ]),
            }),
            item('a2', 'II', {
                responseCount: 3,
                solvedCount: 1,
                results: new Map([
                    ['s1', 1],
                    ['s2', 0],
                    ['s3', 0],
                ]),
            }),
        ];
        const block = blocks(renderFocus(items, group))[BLOCK.students];
        const names = () =>
            [...block.querySelectorAll('.detail-student-name')].map((button) =>
                [...button.children].map((part) => part.textContent).join(' '),
            );
        const toggles = [...block.querySelectorAll('.student-group-button')];

        // The smaller group shows first: one student below, two at or above.
        expect(toggles.map((button) => button.getAttribute('aria-pressed'))).toEqual([
            'true',
            'false',
        ]);
        expect(names()).toEqual([`Ott, Cem ${formatPercent(0, 0)}`]);

        // Lowest rate first, not name order.
        /** @type {HTMLElement} */ (toggles[1]).click();
        await expect
            .poll(names)
            .toEqual([`Kern, Bo ${formatPercent(50, 0)}`, `Berg, Ada ${formatPercent(100, 0)}`]);
    });

    it('opens a listed student through its callback', () => {
        const container = makeVisibleChartContainer('focus-click', { widthPx: 600 });
        /** @type {string[]} */
        const opened = [];
        new ItemRingFocusChart(container, {
            context,
            items: [
                item('a1', 'II', {
                    results: new Map([
                        ['s1', 0],
                        ['s2', 1],
                    ]),
                }),
            ],
            students,
            ring: zo,
            selectedStudents: null,
            onStudentSelected: (studentId) => opened.push(studentId),
        }).create();

        /** @type {HTMLElement} */ (container.querySelector('.detail-student-name')).click();

        expect(opened).toHaveLength(1);
    });

    it('sizes its ring box to a third of the card height, within the grid minimum and the card width', async () => {
        // The text blocks scroll below the ring; a short card keeps a ring as large as
        // the grid's smallest, a tall narrow one never overflows sideways.
        const container = makeVisibleChartContainer('focus-size', { widthPx: 900, heightPx: 1500 });
        new ItemRingFocusChart(container, {
            context,
            items: [item('a1', 'II')],
            students,
            ring: zo,
            selectedStudents: null,
        }).create();
        const box = () =>
            /** @type {HTMLElement} */ (container.querySelector('.item-ring-focus-ring-container'));
        const svgWidth = () =>
            Number(container.querySelector('.item-ring-focus-svg')?.getAttribute('width'));

        expect(svgWidth()).toBeCloseTo(1500 / 3, 0);
        expect(box().style.getPropertyValue('--ring-fs')).toBe(
            `${getItemRingFontSizeForRing(1500 / 3 / RING_REACH)}px`,
        );

        container.style.height = '3000px';
        await expect.poll(svgWidth).toBeCloseTo(900, 0);

        container.style.height = '300px';
        await expect.poll(svgWidth).toBeCloseTo(RING_SIZE_MIN_PX * RING_REACH, 0);
    });

    it('draws the group ring without student records when nobody is selected', () => {
        // Without a selection the ring reads only the items. Demanding students
        // anyway would leave the card empty for a host that has the items and nothing else.
        const container = renderFocus([item('a1', 'II')], []);

        expect(container.querySelector('.item-ring-focus-svg')).not.toBeNull();
    });

    it('says inside its card that there is no ring to show', () => {
        // The chart owns the empty state, so the card and its title stay.
        const container = renderFocus([], students, null);

        expect(container.querySelector('.item-ring-focus-svg')).toBeNull();
        expect(container.textContent).toContain('Keine Aufgabenringe verfügbar');
    });

    it('says inside its card that a selection has no student records', () => {
        // A selection is judged against the student records; without them the card
        // names that reason rather than the generic no-data sentence.
        const container = renderFocus([item('a1', 'II')], [], zo, ['s1']);

        expect(container.querySelector('.item-ring-focus-svg')).toBeNull();
        expect(container.textContent).toContain(
            'Für die gewählten Schüler:innen liegen keine Ergebnisse vor.',
        );
    });
});

describe('itemRingFocusConfig on its host', () => {
    // The ring the focus card shows and the ring the chart-only grid selects come from one
    // input, the shared ring, through one rule: an unknown or empty ring falls back to the
    // first ring with items, never to an empty one.
    const empty = { id: 'gm', title: 'Größen und Messen', iqbIds: new Set(), isEmpty: true };
    const rf = { id: 'rf', title: 'Raum und Form', iqbIds: new Set(['a2']), isEmpty: false };
    const ringSets = {
        total: { id: 'all', title: 'Gesamt', iqbIds: new Set(['a1', 'a2']), isEmpty: false },
        groupings: [{ id: 'leitidee', label: 'Leitidee', rings: [empty, zo, rf] }],
    };
    const items = [
        { ...item('a1', 'II'), domain: 'zo' },
        { ...item('a2', 'III'), domain: 'rf' },
    ];

    /**
     * The focus card and the chart-only grid over the same booklet and the same signals.
     * @returns {Promise<{focus: any, grid: any, ringId: import('@preact/signals-core').Signal<string|null>, student: import('@preact/signals-core').Signal<string|null>}>}
     */
    async function mountPair() {
        const pairContext = await createSubjectContext('ma', {
            datasets: [
                [MA_DATASETS.ITEM_RINGS, ringSets],
                [MA_DATASETS.ITEM_RECORDS, items],
                [MA_DATASETS.STUDENT_RECORDS, students],
            ],
        });
        const ringId = signal(/** @type {string|null} */ (null));
        const student = signal(/** @type {string|null} */ (null));
        const ringGrouping = signal('leitidee');
        const shared = { context: pairContext, ringId, ringGrouping, student };
        const focus = await mountChart(itemRingFocusConfig, shared, { id: 'focus' });
        const grid = await mountChart(
            itemRingGridConfig,
            { ...shared, onRingSelected: () => {} },
            { id: 'grid', widthPx: 900, heightPx: 500 },
        );
        return { focus, grid, ringId, student };
    }

    it.each([
        ['no ring', null, 'zo'],
        ['a ring with items', 'rf', 'rf'],
        ['an unknown ring', 'unknown', 'zo'],
        ['a ring without items', 'gm', 'zo'],
    ])('shows the ring the grid selects for %s', async (_case, requested, shown) => {
        const { focus, grid, ringId } = await mountPair();
        ringId.value = requested === 'rf' ? 'gm' : 'rf';

        ringId.value = requested;
        await focus.updateComplete;

        expect(focus.state.ring.value?.id).toBe(shown);
        expect(grid.state.selectedRing.value).toBe(shown);
        expect(focus.querySelector('.content-module-title')?.textContent).toBe(
            shown === 'rf' ? 'Raum und Form' : 'Zahlen und Operationen',
        );
    });

    it('marks the student it is handed, as the grid does', async () => {
        const { focus, grid, student } = await mountPair();

        student.value = 's1';

        expect(focus.state.selectedStudents.value).toEqual(['s1']);
        expect(grid.state.selectedStudents.value).toEqual(['s1']);
        expect(focus.getExportIdentity()).toEqual(['zo', 's1']);
    });
});
