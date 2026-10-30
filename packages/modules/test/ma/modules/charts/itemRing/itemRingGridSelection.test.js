// @vitest-browser

/**
 * What the grid selects follows what it is handed: the chart-only views share one
 * focused ring through app state (`ringId`), the student view one student (`student`),
 * and the overview selects a Kompetenzstufe's students through its verb. A ring the
 * grid moves to because it was handed one is not reported back: the view already knows.
 */
import { describe, expect, it, vi } from 'vitest';
import { signal } from '@preact/signals-core';
import { mountRingGrid } from '../../../../support/itemRingGrid.js';
import { queryHtml } from '../../../../support/dom.js';

const ITEMS = [
    {
        iqbId: 'i1',
        domain: 'zo',
        competenceLevel: 'II',
        solvedCount: 1,
        responseCount: 2,
        results: new Map([['s1', 1]]),
        competenceGroup0: ['II'],
    },
    {
        iqbId: 'i2',
        domain: 'rf',
        competenceLevel: 'III',
        solvedCount: 1,
        responseCount: 2,
        results: new Map([['s2', 1]]),
        competenceGroup0: ['III'],
    },
];
const STUDENTS = [
    { studentId: 's1', competenceLevelName: 'II' },
    { studentId: 's2', competenceLevelName: 'III' },
    { studentId: 's3', competenceLevelName: 'II' },
];
const BOOKLET = {
    items: ITEMS,
    students: STUDENTS,
    domains: [
        { domain: 'zo', domainLabel: 'Zahlen und Operationen' },
        { domain: 'rf', domainLabel: 'Raum und Form' },
        { domain: 'gm', domainLabel: 'Größen und Messen' },
    ],
    groupings: [
        /** @type {import('../../../../../src/ma/utils/maCompetenceGroupings.js').MaCompetenceGrouping} */ ({
            type: 'Anforderungsbereich',
            field: 'competenceGroup0',
            values: ['I', 'II', 'III'],
        }),
    ],
};

/**
 * A chart-only grid: its rings are selectable and it follows the shared ring.
 * @param {Partial<import('../../../../../src/ma/modules/charts/itemRing/itemRingGridConfig.js').ItemRingGridOptions>} [options]
 */
async function mountChartOnlyGrid(options = {}) {
    const ringId = signal(/** @type {string|null} */ (null));
    const onRingSelected = vi.fn();
    const host = await mountRingGrid(BOOKLET, { ringId, onRingSelected, ...options });
    return { host, ringId, onRingSelected };
}

/**
 * @param {HTMLElement} host
 * @returns {Array<string|undefined>} The rings shown selected.
 */
const selectedRings = (host) =>
    Array.from(
        /** @type {NodeListOf<HTMLElement>} */ (host.querySelectorAll('.item-ring-card.selected')),
    ).map((ring) => ring.dataset.ring);

/**
 * @param {HTMLElement} host
 * @param {string} ringId
 * @returns {string|null} Whether the ring's button says it is chosen.
 */
const pressed = (host, ringId) =>
    host.querySelector(`[data-ring="${ringId}"]`)?.getAttribute('aria-pressed') ?? null;

describe('the shared ring', () => {
    it('starts on the first ring with items while none is shared', async () => {
        const { host } = await mountChartOnlyGrid();

        expect(selectedRings(host)).toEqual(['zo']);
        expect(host.state.selectedRing.value).toBe('zo');
    });

    it('selects a clicked ring and reports it', async () => {
        const { host, onRingSelected } = await mountChartOnlyGrid();

        queryHtml(host, '[data-ring="rf"]').click();

        expect(selectedRings(host)).toEqual(['rf']);
        expect(onRingSelected).toHaveBeenCalledExactlyOnceWith('rf');
    });

    it('moves to the ring it is handed without reporting it', async () => {
        const { host, ringId, onRingSelected } = await mountChartOnlyGrid();

        ringId.value = 'rf';

        expect(selectedRings(host)).toEqual(['rf']);
        expect(host.state.selectedRing.value).toBe('rf');
        expect([pressed(host, 'zo'), pressed(host, 'rf')]).toEqual(['false', 'true']);
        expect(onRingSelected).not.toHaveBeenCalled();
    });

    it.each([
        ['an unknown ring', 'xx'],
        ['a ring without items', 'gm'],
        ['none', null],
    ])('shows the first ring with items for %s, as the focus card does', async (_case, id) => {
        const { host, ringId } = await mountChartOnlyGrid();
        ringId.value = 'rf';
        expect(selectedRings(host)).toEqual(['rf']);

        ringId.value = id;

        expect(selectedRings(host)).toEqual(['zo']);
    });

    it('is selected on build', async () => {
        const host = await mountRingGrid(BOOKLET, {
            ringId: signal('rf'),
            onRingSelected: () => {},
        });

        expect(selectedRings(host)).toEqual(['rf']);
    });
});

describe('the grouping', () => {
    it("builds the grouping's rings and lands on its first ring with items", async () => {
        const { host } = await mountChartOnlyGrid({
            ringGrouping: signal('competenceGroup0'),
            ringId: signal('zo'),
        });

        // 'zo' is no ring of this grouping; AB I has no item, so AB II is the first.
        expect(selectedRings(host)).toEqual(['competenceGroup0-1']);
        expect(host.querySelector('.content-module-subtitle')?.textContent).toContain(
            'Anforderungsbereich',
        );
    });

    it('rebuilds the grid when the shared grouping changes', async () => {
        const ringGrouping = signal('leitidee');
        const { host } = await mountChartOnlyGrid({ ringGrouping });
        const before = host.chart;

        ringGrouping.value = 'competenceGroup0';
        await host.updateComplete;

        expect(host.chart).not.toBe(before);
        expect(host.querySelector('[data-ring="competenceGroup0-1"]')).not.toBeNull();
    });
});

describe('the selected students', () => {
    it('follow the student the grid is handed, into the export identity', async () => {
        const student = signal(/** @type {string|null} */ ('s1'));
        const host = await mountRingGrid(BOOKLET, { student });
        expect(host.state.selectedStudents.value).toEqual(['s1']);
        expect(host.getExportIdentity()).toBe('s1');

        student.value = 's2';

        expect(host.state.selectedStudents.value).toEqual(['s2']);
        expect(host.getExportIdentity()).toBe('s2');
    });

    it("are a Kompetenzstufe's students on the overview's level click, and none again on clearing", async () => {
        const host = await mountRingGrid(BOOKLET);

        host.setCompetenceLevelFilter('II');
        expect(host.state.selectedStudents.value).toEqual(['s1', 's3']);

        host.setCompetenceLevelFilter(null);
        expect(host.state.selectedStudents.value).toBeNull();
    });

    it('re-applies a level after something else changed the selection', async () => {
        // A shadow of the last level clicked would swallow the click that re-applies it.
        const host = await mountRingGrid(BOOKLET);
        host.setCompetenceLevelFilter('II');
        host.state.selectedStudents.value = ['s2'];

        host.setCompetenceLevelFilter('II');

        expect(host.state.selectedStudents.value).toEqual(['s1', 's3']);
    });
});
