// @vitest-browser

import { describe, it, expect, vi } from 'vitest';
import { MaGroupTableModule } from '../../../../src/ma/modules/tables/maGroupTableModule.js';
import { MA_DATASETS } from '../../../../src/ma/index.js';
import { createSubjectContext } from '../../../support/subjectContext.js';
import { columnFunction, createFakeCell } from '../../../support/tabulatorFakes.js';
import { mountTable, stubCanvasTextMeasurement } from '../../../support/tableHarness.js';
import { required } from '../../../support/required.js';

vi.mock('../../../../src/common/tables/tabulatorBuild.js', async () => ({
    Tabulator: (await import('../../../support/tableHarness.js')).FakeTabulator,
}));

/** The whole-booklet pool, the one every booklet has. */
const ALL_POOL = { id: 'all', label: 'Gesamt', type: 'all' };

/**
 * The group table over its datasets, placed and built.
 * @param {{groupCompetenceLevelThresholds: number[]|null, itemPools?: unknown[], studentRecords?: unknown[]}} data - The group's cut scores, its item pools and its whole-booklet student records.
 * @param {Partial<import('../../../../src/ma/modules/tables/maGroupTableModule.js').MaGroupTableOptions>} [options]
 */
async function mountGroupTable(data, options = {}) {
    const context = await createSubjectContext('ma', {
        datasets: [
            [MA_DATASETS.GROUP_COMPETENCE_LEVEL_THRESHOLDS, data.groupCompetenceLevelThresholds],
            [MA_DATASETS.ITEM_POOLS, data.itemPools ?? [ALL_POOL]],
            [MA_DATASETS.STUDENT_RECORDS, data.studentRecords ?? []],
        ],
    });
    // With its title bar, where the presets and the toolbar sit, as the group view shows it.
    const module = MaGroupTableModule.create('ma-group-table', {
        context,
        glossaryKey: 'ma.group.group-table',
        showModuleTitle: true,
        ...options,
    });
    const table = await mountTable(module);
    /** @returns {HTMLButtonElement[]} The preset buttons the toolbar shows. */
    const presetButtons = () => [
        ...module.querySelectorAll(/** @type {'button'} */ ('button[data-preset-index]')),
    ];
    return { module, table, presetButtons };
}

stubCanvasTextMeasurement();

describe('MaGroupTableModule Stufengrenze preset', () => {
    it('are left out without group thresholds', async () => {
        // `resolveGroupCompetenceLevelThresholds` withholds a group table whose cut scores are
        // points rather than solved items; presets on those would compare `correctCount`
        // with a number on another scale.
        const { presetButtons } = await mountGroupTable({ groupCompetenceLevelThresholds: null });

        expect(presetButtons().map((button) => button.textContent?.trim())).toEqual([
            'Stärkste 5',
            'Schwächste 5',
        ]);
    });

    it('are offered when the group value group supplies thresholds counted in items', async () => {
        const { presetButtons } = await mountGroupTable({
            groupCompetenceLevelThresholds: [27, 35, 42, 48],
        });

        expect(presetButtons().map((button) => button.textContent?.trim())).toEqual([
            'Stärkste 5',
            'Schwächste 5',
            'Knapp an der Stufengrenze',
        ]);
    });

    it('keeps the students one point either way would move to another level', async () => {
        // At a floor one point less drops a level; one below it, one point more climbs.
        const { table, presetButtons } = await mountGroupTable({
            groupCompetenceLevelThresholds: [27, 35],
        });

        required(presetButtons().at(-1)).click();

        const keeps = (/** @type {number} */ correctCount) =>
            table.filters.every((entry) =>
                typeof entry.field === 'function' ? entry.field({ correctCount }) : true,
            );
        expect([25, 26, 27, 28, 34, 35, 36].filter(keeps)).toEqual([26, 27, 34, 35]);
    });
});

describe('MaGroupTableModule identity columns', () => {
    it('opens with the student, gender and Merkmale columns of every group table', async () => {
        const { table } = await mountGroupTable({ groupCompetenceLevelThresholds: null });

        expect(table.config.columns?.slice(0, 5).map((column) => column.field)).toEqual([
            'studentId',
            'lastName',
            'firstName',
            'gender',
            'traits',
        ]);
    });
});

describe('MaGroupTableModule student-id link', () => {
    /**
     * The student-id link's tooltip for one row, from the columns the table was built with.
     * @param {{studentId: string, firstName: string, lastName: string}} rowData
     * @returns {Promise<string|null>}
     */
    const tooltipFor = async (rowData) => {
        const { table } = await mountGroupTable({ groupCompetenceLevelThresholds: null });
        // The column as the module built it: its formatter returns an element.
        const idColumn =
            /** @type {import('../../../../src/common/tables/columnFactories.js').TableColumnDefinition} */ (
                required(table.config.columns?.find((column) => column.field === 'studentId'))
            );
        return columnFunction(
            idColumn,
            'formatter',
        )(createFakeCell(rowData.studentId, rowData)).getAttribute('data-tooltip-text');
    };

    it('names the student whose results it opens', async () => {
        expect(await tooltipFor({ studentId: 's1', firstName: 'Ada', lastName: 'Berg' })).toBe(
            'Einzelergebnisse von Ada Berg',
        );
    });
});

describe('MaGroupTableModule Kompetenzstufe filter', () => {
    it('toggles a level in and out of the filter and reports every change as a list', async () => {
        // The competence-level bar highlights exactly what this callback reports, so a toggle
        // that replaced the selection instead of adding to it would show one level.
        /** @type {string[][]} */
        const reported = [];
        const { module } = await mountGroupTable(
            { groupCompetenceLevelThresholds: null },
            { onCompetenceLevelFilterChanged: (levels) => reported.push(levels) },
        );
        reported.length = 0;

        module.toggleCompetenceLevelFilter('II');
        module.toggleCompetenceLevelFilter('III');
        module.toggleCompetenceLevelFilter('II');

        expect(reported).toEqual([['II'], ['II', 'III'], ['III']]);
    });
});

describe('MaGroupTableModule Aufgabenpool menu', () => {
    it('is left out of the toolbar for a booklet without a Leitidee split', async () => {
        const { module } = await mountGroupTable({ groupCompetenceLevelThresholds: null });

        expect(module.querySelector('[data-header-action-button="item-pool"]')).toBeNull();
    });

    it("states the rows' N in the subtitle, not the item list's IQB ids", async () => {
        // The results also count items without an IQB id, which the item list cannot name.
        const { module } = await mountGroupTable({
            groupCompetenceLevelThresholds: null,
            itemPools: [
                { id: 'all', label: 'Gesamt', type: 'all' },
                { id: 'zo', label: 'Zahlen', type: 'leitidee' },
            ],
            // A student without results has N = 0; the subtitle takes the largest N.
            studentRecords: [
                { studentId: 's1', totalCount: 0 },
                { studentId: 's2', totalCount: 7 },
            ],
        });

        expect(module.querySelector('[data-header-action-button="item-pool"]')).not.toBeNull();
        expect(module.querySelector('.content-module-subtitle')?.textContent?.trim()).toBe(
            'Ganzes Testheft: Lösungsquoten basieren auf 7 Teilaufgaben.',
        );
    });
});
