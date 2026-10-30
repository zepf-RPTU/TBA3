// @vitest-browser
// The header floors measure text on a canvas.

import { beforeEach, describe, expect, it } from 'vitest';
import { processColumnDefinitions } from '../../../../src/common/tables/internal/columnDefinitionProcessor.js';
import { createTestContext } from '../../../support/glossaryFixture.js';

/** @typedef {import('../../../../src/common/tables/columnFactories.js').TableColumnDefinition} TableColumnDefinition */

/** @type {import('../../../../src/common/context/index.js').GlossaryAnnotator} */
let glossary;

beforeEach(() => {
    glossary = createTestContext('en').glossary;
});

/**
 * @param {TableColumnDefinition[]} columns
 * @returns {ReturnType<typeof processColumnDefinitions>} What Tabulator gets.
 */
const process = (columns) =>
    processColumnDefinitions(columns, { excludedFields: new Set(), columnDefaults: {}, glossary });

const STEPS = /** @type {const} */ ([
    { field: 'value', label: 'Wert', dir: 'asc' },
    { field: 'diff', label: 'Δ', dir: 'asc' },
]);

describe('sort-step labels in the title', () => {
    // The header highlights the active step's label inside the title; a title
    // reworded without it would lose the highlight.
    it('throws for a column whose title lacks a step label it says it carries', () => {
        expect(() =>
            process([
                {
                    title: 'Wert',
                    field: 'value',
                    tableMeta: { progressBarSortSteps: STEPS, progressBarSortLabelsInTitle: true },
                },
            ]),
        ).toThrow(/lacks the sort-step label 'Δ'/);
    });

    it('builds a column whose title carries every label', () => {
        expect(() =>
            process([
                {
                    title: 'Wert (Δ)',
                    field: 'value',
                    tableMeta: { progressBarSortSteps: STEPS, progressBarSortLabelsInTitle: true },
                },
            ]),
        ).not.toThrow();
    });
});

describe('download titles of grouped columns', () => {
    // Tabulator's download drops the group row, so "GER" alone would not say
    // which Domäne it is.
    it('prefixes each child with its group, over its own download title', () => {
        const [group] = process([
            {
                title: 'Hören',
                columns: [
                    { title: 'GER', field: 'ger' },
                    { title: 'Richtig', titleDownload: 'Richtig (%)', field: 'correct' },
                ],
            },
        ]).definitions;

        expect(group.columns?.map((column) => column.titleDownload)).toEqual([
            'Hören – GER',
            'Hören – Richtig (%)',
        ]);
    });
});

/** @param {ReadonlyArray<{[field: string]: any}>} rows */
const nameTexts = (rows) => rows.map((row) => row.name);

describe('cell-word floors from the rows', () => {
    // A group name wider than its column's header breaks mid-word unless the
    // floor follows the names the table is built with.
    it('floors a column at the widest word of its cell texts, not its title', () => {
        const build = (/** @type {Array<{name: string}>} */ data) =>
            processColumnDefinitions(
                [{ title: 'Gruppe', field: 'name', tableMeta: { cellWords: nameTexts } }],
                { excludedFields: new Set(), columnDefaults: {}, glossary, rows: () => data },
            ).definitions[0].minWidth ?? 0;

        const short = build([{ name: '8a' }]);
        const long = build([{ name: '8a' }, { name: 'Vergleichsgruppe Landesschnitt' }]);

        expect(long).toBeGreaterThan(short);
        // One word at a time: the floor fits "Vergleichsgruppe", not the whole name.
        expect(long).toBe(build([{ name: 'Vergleichsgruppe' }]));
    });

    it('keeps a word joined by a no-break space whole, as CSS does', () => {
        // `Intl` puts a no-break space before the percent sign; no line breaks there.
        const build = (/** @type {string} */ name) =>
            processColumnDefinitions(
                [{ title: 'N', field: 'name', tableMeta: { cellWords: nameTexts } }],
                {
                    excludedFields: new Set(),
                    columnDefaults: {},
                    glossary,
                    rows: () => [{ name }],
                },
            ).definitions[0].minWidth ?? 0;

        expect(build('39\u00a0(49,4\u00a0%)')).toBeGreaterThan(build('(49,4'));
    });
});

describe('content-width columns', () => {
    // A fitContent column never grows past its floor, so the floor must already fit
    // every text a later row swap can bring: the vocabulary, not only the built rows.
    it('fixes a fitContent column at a floor that fits its whole vocabulary, whatever rows it is built with', () => {
        const build = (
            /** @type {Array<{style: string}>} */ data,
            /** @type {string[]} */ vocabulary = [],
        ) =>
            processColumnDefinitions(
                [
                    {
                        title: 'S',
                        field: 'style',
                        tableMeta: {
                            fitContent: true,
                            cellWords: (rows) => [...vocabulary, ...rows.map((row) => row.style)],
                        },
                    },
                ],
                { excludedFields: new Set(), columnDefaults: {}, glossary, rows: () => data },
            ).definitions[0];

        const vocabulary = ['global', 'detailliert'];
        const builtShort = build([{ style: 'global' }], vocabulary);

        expect(builtShort.width).toBe(builtShort.minWidth);
        expect(builtShort.minWidth).toBe(build([{ style: 'detailliert' }]).minWidth);
        expect(builtShort.minWidth).toBeGreaterThan(build([{ style: 'global' }]).minWidth ?? 0);
    });
});

describe('one column per field', () => {
    // Tabulator finds a column by its field, so the second of two would follow the
    // first's visibility and export; the MA group table once exported Richtig twice.
    it('throws for two columns on one field, across groups', () => {
        expect(() =>
            process([
                { title: 'Richtig', field: 'correctCount' },
                { title: 'Verteilung', columns: [{ title: 'Anzahl', field: 'correctCount' }] },
            ]),
        ).toThrow(/Two columns share the field 'correctCount'/);
    });

    it('lets column groups, which have no field, repeat their titles', () => {
        expect(() =>
            process([
                { title: 'Lesen', columns: [{ title: 'Wert', field: 'd0' }] },
                { title: 'Hören', columns: [{ title: 'Wert', field: 'd1' }] },
            ]),
        ).not.toThrow();
    });
});
