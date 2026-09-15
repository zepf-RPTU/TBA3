import { describe, it, expect, afterEach } from 'vitest';
import {
    createDownloadColumn,
    createDistributionDownloadColumns,
} from '@tba3/modules/common/tables/tableExport.js';
import {
    createPilotierungDownloadColumns,
    createProgressBarColumn,
    createPilotierungColumn,
} from '@tba3/modules/common/tables/progressBarColumn.js';
import { setDownloadFormat } from '@tba3/modules/common/tables/downloadNumberFormat.js';

afterEach(() => setDownloadFormat('csv'));

/**
 * Stand-in for the Tabulator table the `download` predicate is called on.
 * Real Tabulator returns `false` from getColumn() for an unknown field.
 * @param {{[field: string]: boolean}} visibility - Field to visibility.
 * @returns {{getColumn: Function}} The fake table.
 */
function fakeTable(visibility) {
    return {
        getColumn: (field) =>
            field in visibility ? { isVisible: () => visibility[field] } : false,
    };
}

describe('createDownloadColumn', () => {
    it('is hidden on screen and kept out of the column-visibility menu', () => {
        // WHY: these columns exist only for the download. Were they menu-listed,
        // a user could reveal a raw numeric duplicate of a column they already see.
        const column = createDownloadColumn('Richtig (Anzahl)', 'correctCount');
        expect(column.visible).toBe(false);
        expect(column.headerSort).toBe(false);
        expect(column.download).toBe(true);
        expect(column.tableMeta.excludeFromColumnVisibilityMenu).toBe(true);
    });

    it('ties its download to the visual column it belongs to', () => {
        // WHY: this is what makes the CSV mirror the view — hiding a bar must also
        // drop the numbers behind it. It only works because Tabulator invokes the
        // predicate with the table as `this`, so it must not be an arrow function.
        const { download } = createDownloadColumn('Richtig (Anzahl)', 'correctCount', {
            follows: 'percentageCombined',
        });
        expect(typeof download).toBe('function');

        expect(download.call(fakeTable({ percentageCombined: true }))).toBe(true);
        expect(download.call(fakeTable({ percentageCombined: false }))).toBe(false);
    });

    it('still exports when the column it follows is absent', () => {
        // WHY: a table that never built the visual column (e.g. a measure the
        // dataset lacks) should lose the bar, not the underlying numbers.
        const { download } = createDownloadColumn('Richtig (Anzahl)', 'correctCount', {
            follows: 'percentageCombined',
        });
        expect(download.call(fakeTable({}))).toBe(true);
    });
});

describe('createDistributionDownloadColumns', () => {
    it('splits one bar into three counts and three percentages', () => {
        const columns = createDistributionDownloadColumns({ follows: 'percentageCombined' });
        expect(columns.map((c) => c.title)).toEqual([
            'Richtig (Anzahl)',
            'Falsch (Anzahl)',
            'Unbearbeitet (Anzahl)',
            'Richtig (%)',
            'Falsch (%)',
            'Unbearbeitet (%)',
        ]);
        expect(columns.map((c) => c.field)).toEqual([
            'correctCount',
            'incorrectCount',
            'notAttemptedCount',
            'percentageCorrect',
            'percentageIncorrect',
            'percentageNotAttempted',
        ]);
    });

    it('reads the domain-prefixed fields the prefixed progress bar draws from', () => {
        // WHY: EN shows one bar per Domäne, each reading d0*/d1* fields. If the
        // export columns did not follow the same prefix convention they would
        // point at properties no row has, which is the bug being fixed.
        const columns = createDistributionDownloadColumns({
            follows: 'd0Percentages',
            fieldPrefix: 'd0',
            titlePrefix: 'Hören – ',
        });
        expect(columns[0].title).toBe('Hören – Richtig (Anzahl)');
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
        // WHY: the row keeps full precision (62.06896551724138); a spreadsheet cell
        // must not.
        const [, , , richtigPercent] = createDistributionDownloadColumns({
            follows: 'percentageCombined',
        });
        expect(richtigPercent.accessorDownload(62.06896551724138)).toBe('62,1');
        expect(richtigPercent.accessorDownload(null)).toBe('');
    });
});

describe('createPilotierungDownloadColumns', () => {
    it('exports the fraction as a whole percent, under its own field name', () => {
        // WHY: the field must differ from the visual column's, or getColumn() —
        // which the `follows` predicate relies on — becomes ambiguous.
        const [value, diff] = createPilotierungDownloadColumns();
        expect(value.field).toBe('pilotierungswertProzent');
        expect(value.field).not.toBe('pilotierungswert');
        expect(value.accessorDownload(undefined, { pilotierungswert: 0.624 })).toBe('62');
        expect(value.accessorDownload(undefined, {})).toBe('');

        expect(diff.field).toBe('pilotierungsDiff');
        expect(diff.accessorDownload(3)).toBe('3');
    });
});

describe('the visual columns opt out of the download', () => {
    it('keeps the bar and the Pilotierung cell out of the CSV', () => {
        // WHY: their own fields hold nothing usable — the bar is drawn from
        // sibling fields and the Pilotierung cell combines two of them — so
        // leaving them in would put an empty column next to the real numbers.
        expect(createProgressBarColumn().download).toBe(false);
        expect(createPilotierungColumn().download).toBe(false);
    });

    it('lets a call site override the opt-out', () => {
        expect(createProgressBarColumn({}, 't', 'f', { download: true }).download).toBe(true);
    });
});
