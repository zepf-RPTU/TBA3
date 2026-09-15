// @vitest-browser

import { describe, it, expect, beforeEach } from 'vitest';
import {
    createTraitsColumn,
    createColumnDef,
} from '@tba3/modules/common/tables/columnFactories.js';
import { createItemTablePresets } from '@tba3/modules/common/tables/baseItemTableModule.js';
import { createStylesColumn } from '@tba3/modules/en/modules/tables/enStyleTableUtils.js';
import { createItemNumberColumn } from '@tba3/modules/en/modules/tables/enTableColumns.js';
import { createFakeCell, createFakeRow as rowFor } from '../../support/tabulatorFakes.js';
import { initGlossaryForTests } from '../../support/glossaryFixture.js';

/** These columns key off the row's `name`, so the cell value is derived from it. */
const cellFor = (rowData) => createFakeCell(rowData.name, rowData);

describe('createTraitsColumn', () => {
    const filterParams = { values: { '': 'Alle', MIGRANT: 'MIGRANT' } };

    it('enables list filter + sort only when filter params are supplied', () => {
        const filtered = createTraitsColumn('Merkmale', { headerFilterParams: filterParams });
        expect(filtered.headerFilter).toBe('list');
        expect(typeof filtered.headerFilterFunc).toBe('function');
        expect(typeof filtered.sorter).toBe('function');

        const displayOnly = createTraitsColumn('Merkmale');
        expect(displayOnly.headerFilter).toBeUndefined();
        expect(displayOnly.headerSort).toBe(false);
        expect(displayOnly.sorter).toBeUndefined();
    });

    it('filters on the comma-joined trait text', () => {
        // WHY: filtering must hit the actual trait, and the synthetic "Keine" option
        // must select students with no traits — the two cases drive the UI control.
        const { headerFilterFunc } = createTraitsColumn('Merkmale', {
            headerFilterParams: filterParams,
        });
        const withTrait = { traits: new Set(['migrant']) };
        const withoutTrait = { traits: new Set() };

        expect(headerFilterFunc('', null, withTrait)).toBe(true); // "Alle"
        expect(headerFilterFunc('MIGRANT', null, withTrait)).toBe(true);
        expect(headerFilterFunc('LEGASTHENIE', null, withTrait)).toBe(false);
        expect(headerFilterFunc('Keine', null, withoutTrait)).toBe(true);
        expect(headerFilterFunc('Keine', null, withTrait)).toBe(false);
    });

    it('sorts trait-less rows to the bottom', () => {
        const { sorter } = createTraitsColumn('Merkmale', { headerFilterParams: filterParams });
        const full = rowFor({ traits: new Set(['migrant']) });
        const empty = rowFor({ traits: new Set() });

        expect(sorter(null, null, empty, full)).toBe(1);
        expect(sorter(null, null, full, empty)).toBe(-1);
    });

    it('renders the trait names as HTML', () => {
        const { formatter } = createTraitsColumn('Merkmale', { headerFilterParams: filterParams });
        expect(formatter(cellFor({ traits: new Set(['migrant']) }))).toContain('MIGRANT');
        expect(formatter(cellFor({ traits: new Set() }))).toContain('—');
    });
});

describe('createColumnDef', () => {
    it('passes accessorDownload through to the column definition', () => {
        // WHY: createColumnDef copies an allowlist of options rather than
        // spreading them, so an option it does not name is dropped in silence.
        // That is exactly how a column ends up exporting an empty cell while
        // looking correctly configured at the call site.
        const accessor = () => 'x';
        expect(createColumnDef('t', 'f', { accessorDownload: accessor }).accessorDownload).toBe(
            accessor,
        );
        expect(createColumnDef('t', 'f').accessorDownload).toBeUndefined();
    });
});

describe('export values of the visual columns', () => {
    it('exports traits as the same text the cell shows', () => {
        // WHY: the field holds a Set. Tabulator's CSV writer JSON.stringifies
        // objects, so without this the cell exports as "{}". The accessor sees a
        // live Set because Tabulator's row clone copies one by reference.
        const { accessorDownload } = createTraitsColumn('Merkmale');
        expect(accessorDownload(undefined, { traits: new Set(['migrant']) })).toBe('MIGRANT');
        expect(accessorDownload(undefined, { traits: new Set(['migrant', 'legasthenie']) })).toBe(
            'LEGASTHENIE, MIGRANT',
        );
        expect(accessorDownload(undefined, { traits: new Set() })).toBe('—');
    });

    it('exports styles as priority-ordered text, not a JSON array', () => {
        const styleCategories = [
            { value: 'A', fieldName: 'a', label: 'A' },
            { value: 'B', fieldName: 'b', label: 'B' },
        ];
        const { accessorDownload } = createStylesColumn([], { styleCategories });
        // WHY: sorted like the cell, so the CSV and the screen list them alike.
        expect(accessorDownload(['B', 'A'])).toBe('A, B');
        expect(accessorDownload(undefined)).toBe('');
    });
});

describe('createItemTablePresets', () => {
    // Labels and tooltips both come from the glossary base path now, so the German
    // wording has one home; the assertion below is what a user actually reads.
    beforeEach(() => initGlossaryForTests('ma'));

    it('returns the three standard item presets', () => {
        const presets = createItemTablePresets('ma.items.item-table.interface');
        expect(presets.map((p) => p.label)).toEqual([
            'Stärkste 5',
            'Schwächste 5',
            'Hohe Nichtbearbeitung',
        ]);
        expect(presets[0].sort).toEqual([{ column: 'percentageCorrect', dir: 'desc' }]);
        expect(presets[0].limit).toBe(5);
    });

    it('only inspects child rows when the flag is set', () => {
        // WHY: EN task-grouping shows parent rows whose own percentage is 0 but whose
        // children breach the threshold; MA (flat) must NOT pull in such parents.
        const parentWithBreachingChild = {
            percentageNotAttempted: 0,
            _children: [{ percentageNotAttempted: 90 }],
        };

        const flat = createItemTablePresets('ma.items.item-table.interface')[2].filters[0].value;
        const grouped = createItemTablePresets('en.item.item-table.interface', {
            includeChildrenInIncompleteFilter: true,
        })[2].filters[0].value;

        expect(flat({ percentageNotAttempted: 30 })).toBe(true);
        expect(flat({ percentageNotAttempted: 10 })).toBe(false);
        expect(flat(parentWithBreachingChild)).toBe(false);
        expect(grouped(parentWithBreachingChild)).toBe(true);
    });
});

describe('createItemNumberColumn', () => {
    /** Read the displayed number text from the formatter's returned cell element. */
    function numberText(node) {
        return node.querySelector('.item-number-cell-value').textContent;
    }

    it('prefixes the domain abbreviation only in combined "all" mode', () => {
        let mode = 'all';
        const { formatter } = createItemNumberColumn(() => mode);
        const cell = cellFor({ name: '01', domainLabel: 'Hörverstehen' });

        expect(numberText(formatter(cell))).toBe('H-01');
        mode = 'ho';
        expect(numberText(formatter(cell))).toBe('01');
    });

    it('leaves task-grouping parent rows unprefixed when includeTaskRow is set', () => {
        const { formatter } = createItemNumberColumn(() => 'all', { includeTaskRow: true });
        const taskRow = cellFor({ name: 'BM 01', domainLabel: 'Hörverstehen', isTaskRow: true });
        expect(numberText(formatter(taskRow))).toBe('BM 01');
    });

    it('still clusters task-parent rows by domain in "all" mode, although they display unprefixed', () => {
        // WHY: the parent rows show "BM 01" without an H-/L- prefix, but a sort
        // that followed the display would interleave Hören and Lesen tasks by
        // number ("01", "01", "02", "02"). In the combined mode the column groups
        // by domain first — the reading the mode exists for.
        let mode = 'all';
        const { sorter } = createItemNumberColumn(() => mode, { includeTaskRow: true });
        const lesen01 = rowFor({ name: 'BM 01', domainLabel: 'Leseverstehen', isTaskRow: true });
        const hoeren02 = rowFor({ name: 'BM 02', domainLabel: 'Hörverstehen', isTaskRow: true });

        expect(sorter('BM 01', 'BM 02', lesen01, hoeren02)).toBeGreaterThan(0);

        // Once a single domain is selected the prefix is gone and numbers decide.
        mode = 'ho';
        expect(sorter('BM 01', 'BM 02', lesen01, hoeren02)).toBeLessThan(0);
    });

    it('renders a preview trigger when onItemPreview is given, but not on task-parent rows', () => {
        const { formatter } = createItemNumberColumn(() => 'all', {
            includeTaskRow: true,
            onItemPreview: () => {},
        });

        // WHY: the trigger leads the number so the buttons line up in one column
        // across rows, instead of shifting with each number's width.
        const itemCell = cellFor({ name: '01', domainLabel: 'Hörverstehen' });
        const rendered = formatter(itemCell);
        expect(rendered.querySelector('[data-item-action="show-task"]')).not.toBeNull();
        expect(rendered.firstElementChild.dataset.itemAction).toBe('show-task');

        const taskRow = cellFor({ name: 'BM 01', domainLabel: 'Hörverstehen', isTaskRow: true });
        expect(formatter(taskRow).querySelector('[data-item-action="show-task"]')).toBeNull();
    });
});
