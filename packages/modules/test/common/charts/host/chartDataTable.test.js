// @vitest-browser

/**
 * A chart's data table: a cell shows one text and exports its own values, so a share
 * reads `12,5 % (1)` on screen and lands in the file as two numbers German Excel and a
 * JSON reader each take as numbers.
 */

import { describe, expect, it } from 'vitest';
import { render } from 'lit';

import {
    dataTableTemplate,
    dataTableText,
} from '../../../../src/common/charts/host/chartDataTable.js';
import {
    figureCell,
    shareCountCell,
    shareCountColumn,
} from '../../../../src/common/charts/dataTableCells.js';
import { formatDecimal, formatPercent } from '../../../../src/common/utils/numberFormat.js';

/** @type {import('../../../../src/common/charts/host/chartDataTable.js').ChartDataTable} */
const TABLE = {
    columns: [{ label: 'Gruppe' }, { label: 'A1', fields: ['A1 Anteil (%)', 'A1 Anzahl'] }],
    rows: [
        [{ text: '8a; "neu"' }, { text: '12,5 % (1)', values: [12.5, 1] }],
        [{ text: 'Landesschnitt' }, { text: '40,0 %', values: [40, null] }],
    ],
};

describe('chart data table', () => {
    it('writes CSV with the field headers, comma decimals and quoted text', () => {
        expect(dataTableText(TABLE, 'csv')).toBe(
            ['Gruppe;A1 Anteil (%);A1 Anzahl', '"8a; ""neu""";12,5;1', 'Landesschnitt;40;'].join(
                '\n',
            ),
        );
    });

    it('writes JSON with typed numbers, a missing value as null', () => {
        expect(JSON.parse(dataTableText(TABLE, 'json'))).toEqual([
            { Gruppe: '8a; "neu"', 'A1 Anteil (%)': 12.5, 'A1 Anzahl': 1 },
            { Gruppe: 'Landesschnitt', 'A1 Anteil (%)': 40, 'A1 Anzahl': null },
        ]);
    });

    it("exports a column's numbers with its own decimals", () => {
        const table = {
            columns: [{ label: 'Jahr' }, { label: 'Median', digits: 2 }, { label: 'Anteil' }],
            rows: [[{ text: '2024' }, figureCell(2.345, formatDecimal), figureCell(12.345)]],
        };
        expect(dataTableText(table, 'csv')).toBe('Jahr;Median;Anteil\n2024;2,35;12,3');
    });

    it('heads each row with its first cell and shows the cell texts', () => {
        const root = document.createElement('div');
        render(dataTableTemplate([TABLE], 'Kompetenzstufen'), root);

        expect(root.querySelector('caption')?.textContent?.trim()).toBe('Kompetenzstufen');
        expect(
            [...root.querySelectorAll('thead th[scope="col"]')].map((th) => th.textContent),
        ).toEqual(['Gruppe', 'A1']);
        const firstRow = [...root.querySelectorAll('tbody tr')][0];
        expect(firstRow.querySelector('th[scope="row"]')?.textContent).toBe('8a; "neu"');
        expect(firstRow.querySelector('td')?.textContent?.trim()).toBe('12,5 % (1)');
        // One table needs no heading of its own: the card title is it.
        expect(root.querySelector('.chart-data-table-title')).toBeNull();
    });

    it('marks a column of text, not of figures, to read from the start', () => {
        const root = document.createElement('div');
        const table = {
            columns: [{ label: 'Teilaufgabe' }, { label: 'Leitidee' }, { label: 'Lösungsquote' }],
            rows: [[{ text: '1.0' }, { text: 'Raum und Form' }, figureCell(44)]],
        };
        render(dataTableTemplate([table], 'Ringe'), root);

        const textColumn = (/** @type {string} */ selector) =>
            [...root.querySelectorAll(selector)].map((cell) =>
                cell.classList.contains('chart-data-table-text'),
            );
        expect(textColumn('thead th')).toEqual([false, true, false]);
        expect(textColumn('tbody td')).toEqual([true, false]);
    });

    it('heads and captions each of several tables with its title', () => {
        const root = document.createElement('div');
        render(
            dataTableTemplate(
                [
                    { ...TABLE, title: 'Kompetenzstufen' },
                    { ...TABLE, title: 'Unterrichtsqualität' },
                ],
                'Deutsch',
            ),
            root,
        );

        expect(
            [...root.querySelectorAll('h3.chart-data-table-title')].map((h) => h.textContent),
        ).toEqual(['Kompetenzstufen', 'Unterrichtsqualität']);
        expect(
            [...root.querySelectorAll('caption')].map((caption) => caption.textContent?.trim()),
        ).toEqual(['Deutsch – Kompetenzstufen', 'Deutsch – Unterrichtsqualität']);
    });
});

describe('chart data table cells', () => {
    it('leaves a figure the data does not carry empty, and keeps a real zero', () => {
        expect(figureCell(null)).toEqual({ text: '', values: [null] });
        expect(figureCell(Number.NaN)).toEqual({ text: '', values: [null] });
        expect(figureCell(0).values).toEqual([0]);
    });

    it('shows a share with its count, the share alone without one, nothing without a share', () => {
        expect(shareCountCell(15.4, 4)).toEqual({
            text: `${formatPercent(15.4)} (4)`,
            values: [15.4, 4],
        });
        expect(shareCountCell(40)).toEqual({ text: formatPercent(40), values: [40, null] });
        expect(shareCountCell(null, 3)).toEqual({ text: '', values: [null, null] });
    });

    it('exports a share column as its share and its headcount', () => {
        expect(shareCountColumn('A1').fields).toEqual(['A1 Anteil (%)', 'A1 Anzahl Schüler:innen']);
    });
});
