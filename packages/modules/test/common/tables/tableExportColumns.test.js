import { describe, it, expect, afterEach } from 'vitest';
import { createDownloadColumn } from '../../../src/common/tables/tableExport.js';
import {
    createItemResultColumns,
    createProgressBarColumns,
} from '../../../src/common/tables/progressBarColumn.js';
import { setDownloadFormat } from '../../../src/common/tables/downloadNumberFormat.js';
import { createTestContext } from '../../support/glossaryFixture.js';
import { columnFunction } from '../../support/tabulatorFakes.js';

/**
 * An accessor that reads the value alone, never the row.
 * @typedef {(value: unknown) => unknown} ValueAccessor
 */

afterEach(() => setDownloadFormat('csv'));

/**
 * Stand-in for the Tabulator table the `download` predicate is called on.
 * Real Tabulator returns `false` from getColumn() for an unknown field.
 * @param {{[field: string]: boolean}} visibility
 * @returns {{getColumn: Function}}
 */
function fakeTable(visibility) {
    return {
        getColumn: (/** @type {string} */ field) =>
            field in visibility ? { isVisible: () => visibility[field] } : false,
    };
}

describe('createDownloadColumn', () => {
    it('ties its download to the visual column it belongs to', () => {
        // Hiding a bar must also drop the numbers behind it from the CSV.
        // Tabulator invokes the predicate with the table as `this`, so it must not
        // be an arrow function.
        const { download } = createDownloadColumn('Richtig (Anzahl)', 'correctCount', {
            follows: 'percentageCombined',
        });
        expect(typeof download).toBe('function');

        expect(download.call(fakeTable({ percentageCombined: true }))).toBe(true);
        expect(download.call(fakeTable({ percentageCombined: false }))).toBe(false);
    });

    it('still exports when the column it follows is absent', () => {
        // A table that never built the visual column (e.g. a measure the
        // dataset lacks) should lose the bar, not the underlying numbers.
        const { download } = createDownloadColumn('Richtig (Anzahl)', 'correctCount', {
            follows: 'percentageCombined',
        });
        expect(download.call(fakeTable({}))).toBe(true);
    });
});

describe('the export columns of a progress bar', () => {
    it('reads the domain-prefixed fields the prefixed bar draws from, each following the bar', () => {
        // EN shows one bar per Domäne, each reading d0*/d1* fields; export
        // columns without the prefix would point at properties no row has.
        const [bar, ...columns] = createProgressBarColumns(createTestContext(), {
            fieldPrefix: 'd0',
        });
        expect(bar.field).toBe('d0Percentages');
        expect(
            columns.map((column) =>
                /** @type {() => boolean} */ (column.download).call(
                    fakeTable({ d0Percentages: false }),
                ),
            ),
        ).toEqual([false, false, false, false, false, false]);
        expect(columns.map((c) => c.field)).toEqual([
            'd0CorrectCount',
            'd0IncorrectCount',
            'd0NotAttemptedCount',
            'd0PercentageCorrect',
            'd0PercentageIncorrect',
            'd0PercentageNotAttempted',
        ]);
    });

    it('rounds the stored float to one decimal', () => {
        // The row keeps full precision (62.06896551724138); a spreadsheet cell
        // must not.
        const [, , , , richtigPercent] = createProgressBarColumns(createTestContext());
        const accessor = /** @type {ValueAccessor} */ (
            columnFunction(richtigPercent, 'accessorDownload')
        );
        expect(accessor(62.06896551724138)).toBe('62,1');
        expect(accessor(null)).toBe('');
    });

    it('leaves out an export column another column of the table carries', () => {
        // The MA group table's Richtig column already holds the correct count.
        const columns = createProgressBarColumns(createTestContext(), {
            skipFields: ['correctCount'],
        });
        expect(columns.map((column) => column.field)).toEqual([
            'percentageCombined',
            'incorrectCount',
            'notAttemptedCount',
            'percentageCorrect',
            'percentageIncorrect',
            'percentageNotAttempted',
        ]);
    });
});

describe('the Pilotierung export columns of the item result block', () => {
    it('exports the fraction as a whole percent, under its own field name', () => {
        // The field must differ from the visual column's, or getColumn() —
        // which the `follows` predicate relies on — becomes ambiguous.
        const columns = createItemResultColumns(createTestContext());
        expect(columns.filter((column) => column.field === 'pilotSolutionFrequency')).toHaveLength(
            1,
        );
        const value = columnFunction(
            columns.find((column) => column.field === 'pilotSolutionFrequencyPercent'),
            'accessorDownload',
        );
        const diff = /** @type {ValueAccessor} */ (
            columnFunction(
                columns.find((column) => column.field === 'pilotSolutionFrequencyDiff'),
                'accessorDownload',
            )
        );
        expect(value(undefined, { pilotSolutionFrequency: 0.624 })).toBe('62');
        expect(value(undefined, {})).toBe('');

        expect(diff(3)).toBe('3');
    });
});
