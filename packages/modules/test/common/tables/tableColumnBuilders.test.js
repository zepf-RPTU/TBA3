// @vitest-browser

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createIcon } from '@tba3/module-base';
import {
    createTraitsColumn,
    createCompetenceLevelColumn,
    createResultColumn,
} from '../../../src/common/tables/columnFactories.js';
import {
    extractTableFilterDescriptors,
    matchesTableFilters,
    resolveTableFilterOptions,
} from '../../../src/common/tables/internal/tableFilterMetadata.js';
import { CompetenceLevelPalette } from '../../../src/common/context/index.js';
import { registerStandardItemScales } from '../../support/competenceScaleFixture.js';
import { createStylesColumn } from '../../../src/en/modules/tables/enStyleTableUtils.js';
import { createEnItemColumns } from '../../../src/en/modules/tables/enTableColumns.js';
import {
    columnFunction,
    createFakeCell,
    createFakeRow as rowFor,
} from '../../support/tabulatorFakes.js';
import { required } from '../../support/required.js';
import { MISSING_VALUE } from '../../../src/common/utils/numberFormat.js';
import { createTestContext } from '../../support/glossaryFixture.js';

/**
 * These columns key off the row's `name`, so the cell value is derived from it.
 * @param {{name: string, [field: string]: unknown}} rowData
 * @returns {import('tabulator-tables').CellComponent}
 */
const cellFor = (rowData) => createFakeCell(rowData.name, rowData);

/**
 * A sorter that reads the two values and their rows, never the column, direction or params.
 * @typedef {(a: unknown, b: unknown, aRow: import('tabulator-tables').RowComponent, bRow: import('tabulator-tables').RowComponent) => number} RowSorter
 */

describe('createTraitsColumn', () => {
    const context = createTestContext();
    const filterable = { filterable: true };

    it('filters on the trait names, "Keine" selecting the rows without one', () => {
        const withTrait = { traits: new Set(['migrant']) };
        const withoutTrait = { traits: new Set() };
        const descriptors = extractTableFilterDescriptors([
            createTraitsColumn(context.glossary, new Map(), filterable),
        ]);
        const none = required(
            resolveTableFilterOptions(descriptors[0], [withoutTrait]).find(
                (o) => o.label === 'Keine',
            ),
        ).value;
        const matches = (/** @type {string[]} */ selected, /** @type {object} */ row) =>
            matchesTableFilters(descriptors, { traits: selected }, row);

        // An empty selection is "Alle".
        expect(matches([], withTrait)).toBe(true);
        expect(matches(['MIGRANT'], withTrait)).toBe(true);
        expect(matches(['LEGASTHENIE'], withTrait)).toBe(false);
        expect(matches([none], withoutTrait)).toBe(true);
        expect(matches([none], withTrait)).toBe(false);
    });

    it('sorts trait-less rows to the bottom, the rest by their trait names', () => {
        const sorter = /** @type {RowSorter} */ (
            columnFunction(createTraitsColumn(context.glossary, new Map(), filterable), 'sorter')
        );
        const full = new Set(['migrant']);
        const more = new Set(['migrant', 'td']);
        const empty = new Set();

        expect(sorter(empty, full, rowFor({}), rowFor({}))).toBe(1);
        expect(sorter(full, empty, rowFor({}), rowFor({}))).toBe(-1);
        expect(sorter(full, more, rowFor({}), rowFor({}))).toBeLessThan(0);
    });

    it('keeps trait-less rows at the bottom in a descending sort', () => {
        const sorter = columnFunction(
            createTraitsColumn(context.glossary, new Map(), filterable),
            'sorter',
        );
        const column = /** @type {import('tabulator-tables').ColumnComponent} */ ({});
        const full = new Set(['migrant']);
        const empty = new Set();

        // Tabulator hands a descending sort the rows swapped and orders by the result as is:
        // (empty row, full row) arrives as (full, empty) and must still put the empty one last.
        expect(sorter(full, empty, rowFor({}), rowFor({}), column, 'desc', {})).toBe(1);
        expect(sorter(empty, full, rowFor({}), rowFor({}), column, 'desc', {})).toBe(-1);
    });
});

/**
 * A Material Symbols glyph's path, the one mark that tells two icons apart.
 * @param {string} name
 * @returns {string|null|undefined} The `d` of its path.
 */
const glyphPath = (name) => createIcon(name).querySelector('path')?.getAttribute('d');

describe('createResultColumn', () => {
    it('maps the three result codes to their own icons and passes anything else through', () => {
        const formatter = columnFunction(createResultColumn(), 'formatter');
        expect(formatter(createFakeCell(1))).toContain(`d="${glyphPath('check_circle')}"`);
        expect(formatter(createFakeCell(0))).toContain(`d="${glyphPath('cancel')}"`);
        expect(formatter(createFakeCell(-1))).toContain(`d="${glyphPath('block')}"`);
        expect(formatter(createFakeCell('n/a'))).toBe('n/a');
    });

    it('names each result for assistive tech, which does not see the icon', () => {
        // The icon is aria-hidden; without the name the gridcell is empty.
        const formatter = columnFunction(createResultColumn(), 'formatter');
        const cell = document.createElement('div');
        cell.innerHTML = formatter(createFakeCell(0));
        expect(cell.querySelector('.visually-hidden')?.textContent).toBe('Falsch');
    });

    it('offers all three results, whichever the rows hold', () => {
        const [descriptor] = extractTableFilterDescriptors([createResultColumn()]);
        expect(resolveTableFilterOptions(descriptor, []).map((option) => option.value)).toEqual([
            '1',
            '0',
            '-1',
        ]);
    });
});

describe('level columns', () => {
    /** @type {CompetenceLevelPalette} */
    let palette;

    beforeEach(() => {
        palette = new CompetenceLevelPalette();
        registerStandardItemScales(palette);
    });

    it('offers the levels a column holds, in scale order', () => {
        const rows = [{ level: 'B1.1' }, { level: 'A2.1' }, { level: 'A1.2' }, { level: null }];
        const [descriptor] = extractTableFilterDescriptors([
            createCompetenceLevelColumn(palette, { field: 'level', headerFilter: true }),
        ]);
        const levels = resolveTableFilterOptions(descriptor, rows).map((option) => option.value);
        expect(levels).toEqual(['A1.2', 'A2.1', 'B1.1']);
    });

    it('orders by the scale, and leaves header sorting to the table', () => {
        const column = createCompetenceLevelColumn(palette);
        expect(column.headerSort).toBeUndefined();
        // The competence-level sorter compares the two values alone, so it serves as a plain comparator.
        const compare = /** @type {(a: string, b: string) => number} */ (
            columnFunction(column, 'sorter')
        );
        expect(['B1.1', 'A2.1', 'A1.1'].sort(compare)).toEqual(['A1.1', 'A2.1', 'B1.1']);
    });
});

describe('export values of the visual columns', () => {
    it('exports traits as the same text the cell shows', () => {
        // The field holds a Set, which Tabulator's CSV writer would export as
        // "{}". The accessor sees a live Set because Tabulator's row clone copies it
        // by reference.
        const accessorDownload = columnFunction(
            createTraitsColumn(createTestContext().glossary, new Map()),
            'accessorDownload',
        );
        expect(accessorDownload(undefined, { traits: new Set(['migrant']) })).toBe('MIGRANT');
        expect(accessorDownload(undefined, { traits: new Set(['migrant', 'legasthenie']) })).toBe(
            'LEGASTHENIE, MIGRANT',
        );
        expect(accessorDownload(undefined, { traits: new Set() })).toBe(MISSING_VALUE);
    });

    it('builds no styles column for a dataset without style buckets', () => {
        // Styles exist for Hören and Lesen only; other domains deliver none.
        expect(createStylesColumn([])).toEqual([]);
    });

    it('exports styles as text in row order, not a JSON array', () => {
        // The styles accessor reads the value alone.
        const accessorDownload = /** @type {(value: unknown) => unknown} */ (
            columnFunction(
                createStylesColumn([
                    { value: 'global', fieldName: 'globalPercent', label: 'Global' },
                ])[0],
                'accessorDownload',
            )
        );
        // Rows carry their styles priority-sorted, and the cell renders them in
        // that order, so the CSV and the screen list them alike.
        expect(accessorDownload(['A', 'B'])).toBe('A, B');
        expect(accessorDownload(undefined)).toBe('');
    });
});

describe('the EN "Nr." column', () => {
    /**
     * The "Nr." column as the EN item and student-data tables build it.
     * @param {() => string} getMode - The live mode ('all' | domain id).
     * @param {((item: import('../../../src/common/overlays/itemPreviewOverlay.js').ItemPreview) => void)} [itemPreview] - The context's preview.
     * @returns {import('../../../src/common/tables/columnFactories.js').TableColumnDefinition}
     */
    function enItemNumberColumn(getMode, itemPreview) {
        return required(
            createEnItemColumns(
                { ...createTestContext(), ...(itemPreview && { itemPreview }) },
                {
                    get mode() {
                        return getMode();
                    },
                },
            ).find((column) => column.field === 'name'),
        );
    }

    /**
     * Read the displayed number text from the formatter's returned cell element.
     * @param {HTMLElement} node
     * @returns {string|null}
     */
    function numberText(node) {
        return required(node.querySelector('.item-number-cell-value')).textContent;
    }

    it('prefixes the domain abbreviation only in combined "all" mode', () => {
        let mode = 'all';
        const formatter = columnFunction(
            enItemNumberColumn(() => mode),
            'formatter',
        );
        const cell = cellFor({ name: '01', domainLabel: 'Hörverstehen' });

        expect(numberText(formatter(cell))).toBe('H-01');
        mode = 'ho';
        expect(numberText(formatter(cell))).toBe('01');
    });

    it('filters by the number as the cell shows it, prefix included', () => {
        // A reader types what the cell shows: "H-" must find H-01, not nothing.
        const descriptors = extractTableFilterDescriptors([enItemNumberColumn(() => 'all')]);
        const row = { name: '01', domainLabel: 'Hörverstehen' };

        expect(matchesTableFilters(descriptors, { name: 'h-0' }, row)).toBe(true);
        expect(matchesTableFilters(descriptors, { name: 'L-0' }, row)).toBe(false);
    });

    it('renders a preview trigger when the context previews items, handing it the prefixed number', () => {
        const itemPreview = vi.fn();
        const formatter = columnFunction(
            enItemNumberColumn(() => 'ho', itemPreview),
            'formatter',
        );

        // The trigger leads the number so the buttons line up in one column
        // across rows, instead of shifting with each number's width.
        const itemCell = cellFor({ name: '01', domainLabel: 'Hörverstehen' });
        const rendered = formatter(itemCell);
        const trigger = rendered.querySelector('button.item-preview-trigger');
        expect(rendered.firstElementChild.classList.contains('item-preview-trigger')).toBe(true);
        trigger.click();
        expect(itemPreview.mock.calls[0][0]).toMatchObject({ number: 'H-01' });

        const without = columnFunction(
            enItemNumberColumn(() => 'all'),
            'formatter',
        );
        expect(without(itemCell).querySelector('button.item-preview-trigger')).toBeNull();
    });
});
