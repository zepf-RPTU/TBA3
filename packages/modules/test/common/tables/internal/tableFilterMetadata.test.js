/**
 * The contract between the `headerFilter*` column options the tables declare and the
 * filter menu that renders them: which columns become filters, which options a list
 * filter offers, and which rows a value keeps. Matching follows Tabulator's
 * header-filter semantics.
 */

import { describe, it, expect } from 'vitest';
import {
    extractTableFilterDescriptors,
    resolveTableFilterOptions,
    isTableFilterValueSet,
    matchesTableFilters,
} from '../../../../src/common/tables/internal/tableFilterMetadata.js';
import {
    createStudentIdLinkColumn,
    createTraitsColumn,
    createCompetenceLevelColumn,
} from '../../../../src/common/tables/columnFactories.js';
import { createStylesColumn } from '../../../../src/en/modules/tables/enStyleTableUtils.js';
import { createTestContext } from '../../../support/glossaryFixture.js';

const context = createTestContext();

describe('extractTableFilterDescriptors', () => {
    it('keeps the implicit ID search of createStudentIdLinkColumn', () => {
        // EN/MA group tables pass no headerFilter for the ID column; the
        // builder's default alone makes IDs searchable.
        const [descriptor] = extractTableFilterDescriptors([createStudentIdLinkColumn()]);

        expect(descriptor).toMatchObject({ field: 'studentId', title: 'ID', type: 'input' });
    });

    it('matches a list column with `expand` by the values a row expands to', () => {
        const descriptors = extractTableFilterDescriptors([
            createTraitsColumn(context.glossary, new Map(), { filterable: true }),
        ]);

        const row = { traits: new Set() };
        const [none] = resolveTableFilterOptions(descriptors[0], [row]);

        expect(descriptors[0].type).toBe('list');
        // "Keine" is the option a row without traits expands to.
        expect(matchesTableFilters(descriptors, { traits: [none.value] }, row)).toBe(true);
    });

    it('skips columns without a filter, without a field, and ones that can never show', () => {
        // A column that only starts hidden (MA's competence columns beside the ring
        // grid) can be shown later and keeps its filter; one excluded from the
        // column-visibility menu never shows and gains no control.
        const descriptors = extractTableFilterDescriptors([
            { title: 'Nr.', field: 'name', headerFilter: 'input' },
            { title: 'Richtig', field: 'correctCount' },
            { title: 'Kompetenz', field: 'competenceGroup0', headerFilter: 'list', visible: false },
            {
                title: 'ID',
                field: 'iqbId',
                headerFilter: 'input',
                visible: false,
                tableMeta: { excludeFromColumnVisibilityMenu: true },
            },
            { title: 'Ohne Feld', headerFilter: 'input' },
        ]);

        expect(descriptors.map((descriptor) => descriptor.field)).toEqual([
            'name',
            'competenceGroup0',
        ]);
    });

    it('recurses into column groups', () => {
        const descriptors = extractTableFilterDescriptors([
            {
                title: 'Gruppe',
                columns: [
                    { title: 'Lerngruppe', field: 'className', headerFilter: 'list' },
                    { title: 'Wert', field: 'value' },
                ],
            },
        ]);

        expect(descriptors.map((descriptor) => descriptor.field)).toEqual(['className']);
    });

    it('names the group in a grouped column’s label', () => {
        const descriptors = extractTableFilterDescriptors([
            { title: 'Hören', columns: [{ title: 'GER', field: 'd0Ger', headerFilter: 'list' }] },
            { title: 'Lesen', columns: [{ title: 'GER', field: 'd1Ger', headerFilter: 'list' }] },
            { title: 'Geschlecht', field: 'gender', headerFilter: 'list' },
        ]);

        expect(descriptors.map((descriptor) => descriptor.title)).toEqual([
            'Hören – GER',
            'Lesen – GER',
            'Geschlecht',
        ]);
    });

    it('normalizes headerFilter: true to a text filter', () => {
        const [descriptor] = extractTableFilterDescriptors([
            { title: 'Suche', field: 'name', headerFilter: true },
        ]);

        expect(descriptor.type).toBe('input');
    });
});

describe('resolveTableFilterOptions', () => {
    it('derives the options from the rows it is handed', () => {
        // The options follow every row swap (a student switch, a pool switch),
        // so they are read when the menu opens, never baked into the column.
        const [descriptor] = extractTableFilterDescriptors([
            {
                field: 'exercise.name',
                title: 'Aufgabe',
                headerFilter: 'list',
            },
        ]);
        const rows = [
            { exercise: { name: 'Zoo' } },
            { exercise: { name: 'Bahn' } },
            { exercise: { name: 'Zoo' } },
            { exercise: { name: '' } },
        ];

        expect(resolveTableFilterOptions(descriptor, rows)).toEqual([
            { value: 'Bahn', label: 'Bahn' },
            { value: 'Zoo', label: 'Zoo' },
        ]);
    });

    it('expands a cell into its values and sorts them as the column says', () => {
        // EN "Stile" holds several styles per row, listed in style-priority order.
        const [descriptor] = extractTableFilterDescriptors(
            createStylesColumn([
                { value: 'dialogisch', fieldName: 'dialogisch', label: 'dialogisch' },
                { value: 'monologisch', fieldName: 'monologisch', label: 'monologisch' },
            ]),
        );
        const rows = [{ style: ['monologisch'] }, { style: ['dialogisch', 'monologisch'] }];

        expect(resolveTableFilterOptions(descriptor, rows).map((o) => o.value)).toEqual([
            'dialogisch',
            'monologisch',
        ]);
    });

    it('lists fixed values in their own order unless a sort is given', () => {
        const fixed = (
            /** @type {import('../../../../src/common/tables/internal/tableFilterMetadata.js').ListFilterParams['sort']} */ sort,
        ) =>
            resolveTableFilterOptions(
                {
                    field: 'competenceLevelName',
                    title: 'Kompetenzstufe',
                    type: 'list',
                    params: { values: { II: 'II', I: 'I' }, sort },
                },
                [],
            ).map((option) => option.value);

        expect(fixed(undefined)).toEqual(['II', 'I']);
        expect(fixed((a, b) => a.localeCompare(b))).toEqual(['I', 'II']);
    });

    it('offers each trait once, then "Keine" for rows without one, under a value of its own', () => {
        const [descriptor] = extractTableFilterDescriptors([
            createTraitsColumn(context.glossary, new Map(), { filterable: true }),
        ]);
        const rows = [
            { traits: new Set(['td', 'f']) },
            { traits: new Set() },
            { traits: new Set(['f']) },
        ];

        const options = resolveTableFilterOptions(descriptor, rows);
        expect(options.map((o) => o.label)).toEqual(['F', 'TD', 'Keine']);
        // A trait worded "Keine" must stay its own option.
        expect(options[2].value).not.toBe('Keine');
    });
});

describe('isTableFilterValueSet', () => {
    it('treats a non-empty text or list as set, and an empty one as unset', () => {
        // An empty list is truthy; read as set, a cleared list filter would keep
        // the filter button's count and the clear-all row.
        expect(isTableFilterValueSet('I')).toBe(true);
        expect(isTableFilterValueSet(['0'])).toBe(true);
        expect(isTableFilterValueSet('')).toBe(false);
        expect(isTableFilterValueSet([])).toBe(false);
        expect(isTableFilterValueSet(undefined)).toBe(false);
    });
});

describe('matchesTableFilters', () => {
    const descriptors = extractTableFilterDescriptors([
        { title: 'Name', field: 'lastName', headerFilter: 'input' },
        { title: 'Aufgabe', field: 'exercise.name', headerFilter: 'list' },
        { title: 'Ergebnis', field: 'resultCode', headerFilter: 'list' },
        createCompetenceLevelColumn(context.palette, { headerFilter: true }),
    ]);

    const row = {
        lastName: 'Bauer',
        exercise: { name: 'Exercise A' },
        resultCode: 1,
        competenceLevelName: 'I',
    };

    it('matches text filters partially and case-insensitively', () => {
        expect(matchesTableFilters(descriptors, { lastName: 'au' }, row)).toBe(true);
        expect(matchesTableFilters(descriptors, { lastName: 'BAU' }, row)).toBe(true);
        expect(matchesTableFilters(descriptors, { lastName: 'zzz' }, row)).toBe(false);
    });

    it('matches list filters on nested fields and loosely on the value type', () => {
        // Select values are strings, but EN/MA "Ergebnis" rows carry numbers,
        // so the comparison is loose, as Tabulator's "=" filter is.
        expect(matchesTableFilters(descriptors, { 'exercise.name': ['Exercise A'] }, row)).toBe(
            true,
        );
        expect(matchesTableFilters(descriptors, { 'exercise.name': ['Exercise B'] }, row)).toBe(
            false,
        );
        expect(matchesTableFilters(descriptors, { resultCode: ['1'] }, row)).toBe(true);
        expect(matchesTableFilters(descriptors, { resultCode: ['0'] }, row)).toBe(false);
    });

    it('passes a row matching any selected value of a list filter', () => {
        expect(
            matchesTableFilters(
                descriptors,
                { 'exercise.name': ['Exercise B', 'Exercise A'] },
                row,
            ),
        ).toBe(true);
        expect(
            matchesTableFilters(
                descriptors,
                { 'exercise.name': ['Exercise B', 'Exercise C'] },
                row,
            ),
        ).toBe(false);
    });

    it('combines fields with AND', () => {
        expect(matchesTableFilters(descriptors, { competenceLevelName: ['I'] }, row)).toBe(true);
        expect(matchesTableFilters(descriptors, { competenceLevelName: ['II'] }, row)).toBe(false);
        expect(matchesTableFilters(descriptors, { competenceLevelName: ['II', 'I'] }, row)).toBe(
            true,
        );
        expect(
            matchesTableFilters(
                descriptors,
                { competenceLevelName: ['I'], lastName: 'Bauer' },
                row,
            ),
        ).toBe(true);
        expect(
            matchesTableFilters(
                descriptors,
                { competenceLevelName: ['I'], lastName: 'Meyer' },
                row,
            ),
        ).toBe(false);
    });

    it('ignores empty values and values for unknown fields', () => {
        expect(matchesTableFilters(descriptors, { lastName: '', unknown: 'x' }, row)).toBe(true);
    });
});
