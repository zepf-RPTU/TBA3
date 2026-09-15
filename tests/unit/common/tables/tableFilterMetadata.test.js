/**
 * Locks the contract between the `headerFilter*` column options the tables
 * declare and the header-action filter menu that now renders them: which columns
 * become filters, which options a list filter offers, and which rows a value
 * keeps. Matching must stay behaviour-identical to the Tabulator header filters
 * it replaced — that equivalence is the whole point of the migration, and these
 * cases are the ones the shipped tables actually rely on.
 */

import { describe, it, expect } from 'vitest';
import {
    extractTableFilterDescriptors,
    resolveTableFilterOptions,
    isTableFilterValueSet,
    matchesTableFilters,
} from '@tba3/modules/common/tables/tableFilterMetadata.js';
import {
    createStudentIdLinkColumn,
    createTraitsColumn,
    createKsColumn,
} from '@tba3/modules/common/tables/columnFactories.js';
import { createStylesColumn } from '@tba3/modules/en/modules/tables/enStyleTableUtils.js';

const traitFilterParams = { values: { '': 'Alle', MIGRANT: 'MIGRANT', Keine: 'Keine' } };

describe('extractTableFilterDescriptors', () => {
    it('keeps the implicit ID search of createStudentIdLinkColumn', () => {
        // WHY: EN/MA class tables never pass headerFilter for the ID column — the
        // builder's default is the only thing that makes IDs searchable.
        const [descriptor] = extractTableFilterDescriptors([
            createStudentIdLinkColumn('ID', 'studentId'),
        ]);

        expect(descriptor).toMatchObject({ field: 'studentId', title: 'ID', type: 'input' });
    });

    it('carries the custom matcher of a list column', () => {
        const [descriptor] = extractTableFilterDescriptors([
            createTraitsColumn('Merkmale', { headerFilterParams: traitFilterParams }),
        ]);

        expect(descriptor.type).toBe('list');
        expect(descriptor.params).toBe(traitFilterParams);
        // The "Keine" option only works through the column's own matcher.
        expect(descriptor.matcher('Keine', null, { traits: new Set() })).toBe(true);
    });

    it('skips columns without a filter, without a field, and hidden ones', () => {
        // WHY: EN's hidden iqbId column declares headerFilter: 'input'. It had no
        // visible control before, so it must not gain one in the menu.
        const descriptors = extractTableFilterDescriptors([
            { title: 'Nr.', field: 'name', headerFilter: 'input' },
            { title: 'Richtig', field: 'summedResult' },
            { title: 'ID', field: 'iqbId', headerFilter: 'input', visible: false },
            { title: 'Ohne Feld', headerFilter: 'input' },
        ]);

        expect(descriptors.map((descriptor) => descriptor.field)).toEqual(['name']);
    });

    it('recurses into column groups', () => {
        // WHY: SL-style grouped summary columns must not silently lose their
        // filters if such a table ever declares one.
        const descriptors = extractTableFilterDescriptors([
            {
                title: 'Gruppe',
                columns: [
                    { title: 'Klasse', field: 'className', headerFilter: 'list' },
                    { title: 'Wert', field: 'value' },
                ],
            },
        ]);

        expect(descriptors.map((descriptor) => descriptor.field)).toEqual(['className']);
    });

    it('normalizes headerFilter: true to a text filter', () => {
        const [descriptor] = extractTableFilterDescriptors([
            { title: 'Suche', field: 'name', headerFilter: true },
        ]);

        expect(descriptor.type).toBe('input');
    });
});

describe('resolveTableFilterOptions', () => {
    it('resolves function-valued params lazily and keeps their order', () => {
        // WHY: EN "Stile" builds its values from the live data via a thunk, in
        // style-priority order and without a sort comparator.
        const [descriptor] = extractTableFilterDescriptors([
            createStylesColumn(
                [{ combinedStyles: ['monologisch'] }, { combinedStyles: ['dialogisch'] }],
                { styleCategories: [{ value: 'dialogisch' }, { value: 'monologisch' }] },
            ),
        ]);

        expect(typeof descriptor.params).toBe('function');
        expect(resolveTableFilterOptions(descriptor)).toEqual([
            { value: '', label: 'Alle' },
            { value: 'dialogisch', label: 'dialogisch' },
            { value: 'monologisch', label: 'monologisch' },
        ]);
    });

    it('applies the params sort to the labels and keeps the clear option first', () => {
        const options = resolveTableFilterOptions({
            field: 'ks',
            title: 'Kompetenzstufe',
            type: 'list',
            params: {
                values: { '': 'Alle', II: 'II', I: 'I' },
                sort: (a, b) => a.localeCompare(b),
            },
            matcher: null,
        });

        expect(options.map((option) => option.value)).toEqual(['', 'I', 'II']);
    });
});

describe('isTableFilterValueSet', () => {
    it('treats 0 as set and every other falsy value as empty', () => {
        // WHY: mirrors Tabulator's headerFilterEmptyCheck — MA's "Ergebnis"
        // offers a 0 ("falsch") option that must not read as "no filter".
        expect(isTableFilterValueSet(0)).toBe(true);
        expect(isTableFilterValueSet('I')).toBe(true);
        expect(isTableFilterValueSet('')).toBe(false);
        expect(isTableFilterValueSet(undefined)).toBe(false);
    });
});

describe('matchesTableFilters', () => {
    const descriptors = extractTableFilterDescriptors([
        { title: 'Name', field: 'lastName', headerFilter: 'input' },
        { title: 'Aufgabe', field: 'exercise.name', headerFilter: 'list' },
        { title: 'Ergebnis', field: 'ergebnis', headerFilter: 'list' },
        createKsColumn({
            headerFilter: true,
            headerFilterParams: { values: { '': 'Alle', I: 'I' } },
        }),
    ]);

    const row = { lastName: 'Bauer', exercise: { name: 'Task A' }, ergebnis: 1, ks: 'I' };

    it('matches text filters partially and case-insensitively', () => {
        expect(matchesTableFilters(descriptors, { lastName: 'au' }, row)).toBe(true);
        expect(matchesTableFilters(descriptors, { lastName: 'BAU' }, row)).toBe(true);
        expect(matchesTableFilters(descriptors, { lastName: 'zzz' }, row)).toBe(false);
    });

    it('matches list filters on nested fields and loosely on the value type', () => {
        // WHY: select values are strings, but EN/MA "Ergebnis" rows carry numbers —
        // Tabulator's "=" filter compared them loosely, so this must too.
        expect(matchesTableFilters(descriptors, { 'exercise.name': 'Task A' }, row)).toBe(true);
        expect(matchesTableFilters(descriptors, { 'exercise.name': 'Task B' }, row)).toBe(false);
        expect(matchesTableFilters(descriptors, { ergebnis: '1' }, row)).toBe(true);
        expect(matchesTableFilters(descriptors, { ergebnis: '0' }, row)).toBe(false);
    });

    it('routes through a column matcher and combines values with AND', () => {
        // KS matches exactly via createKsColumn's own headerFilterFunc.
        expect(matchesTableFilters(descriptors, { ks: 'I' }, row)).toBe(true);
        expect(matchesTableFilters(descriptors, { ks: 'II' }, row)).toBe(false);
        expect(matchesTableFilters(descriptors, { ks: 'I', lastName: 'Bauer' }, row)).toBe(true);
        expect(matchesTableFilters(descriptors, { ks: 'I', lastName: 'Meyer' }, row)).toBe(false);
    });

    it('ignores empty values and values for unknown fields', () => {
        expect(matchesTableFilters(descriptors, { lastName: '', unknown: 'x' }, row)).toBe(true);
    });
});
