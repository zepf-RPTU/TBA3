// @vitest-browser
// A function formatter may return a DOM node, which is half of what the wrapper decides.

import { beforeEach, describe, expect, it } from 'vitest';
import { createCellFormatter } from '../../../src/common/tables/glossaryFormatters.js';
import { processColumnDefinitions } from '../../../src/common/tables/internal/columnDefinitionProcessor.js';
import { columnFunction, createFakeCell as cellFor } from '../../support/tabulatorFakes.js';
import { createTestContext } from '../../support/glossaryFixture.js';
import { required } from '../../support/required.js';

// Every table cell goes through this path on every redraw. It decides whether a
// term in a cell is clickable, whether a plain number is left alone, and that the
// app-only tableMeta flags never reach Tabulator.

/** A term the shared VERA glossary defines. */
const TERM = 'Aufgabenniveau';

/** @type {import('../../../src/common/context/index.js').GlossaryAnnotator} */
let glossary;

beforeEach(() => {
    glossary = createTestContext('en').glossary;
});

/** @param {string | ParentNode} output - A formatter's string, or the node a processed column hands Tabulator. */
const annotated = (output) =>
    typeof output === 'string'
        ? output.includes('data-glossary-key')
        : output.querySelector('[data-glossary-key]') !== null;

/**
 * The wrapper for a formatter it wraps, asserted present.
 * @param {Parameters<typeof createCellFormatter>[1]} formatter
 * @returns {NonNullable<ReturnType<typeof createCellFormatter>>}
 */
const wrap = (formatter) => required(createCellFormatter(glossary, formatter));

describe('createCellFormatter', () => {
    it('annotates the string a function formatter returns, and leaves a node alone', () => {
        const node = document.createElement('span');
        expect(annotated(wrap(() => `<b>${TERM}</b>`)(cellFor(null), {}, () => {}))).toBe(true);
        expect(wrap(() => node)(cellFor(null), {}, () => {})).toBe(node);
    });

    it('annotates the raw value for a column with no formatter', () => {
        const format = wrap(undefined);
        expect(annotated(format(cellFor(TERM)))).toBe(true);
        expect(format(cellFor(null))).toBe('');
    });

    it('escapes before annotating a plaintext column', () => {
        const html = wrap('plaintext')(cellFor(`<i>${TERM}</i>`));
        expect(html).toContain('&lt;i&gt;');
        expect(annotated(html)).toBe(true);
    });

    it('declines to wrap a built-in formatter whose output is not text', () => {
        expect(createCellFormatter(glossary, 'progress')).toBeNull();
        expect(createCellFormatter(glossary, 'star')).toBeNull();
    });

    it('returns a value holding no term untouched', () => {
        // A count, a percentage or an icon cannot contain a glossary term, and
        // these are most cells.
        const format = wrap((cell) => String(cell.getValue()));
        expect(format(cellFor('42'))).toBe('42');
        expect(format(cellFor('12 (34.5%)'))).toBe('12 (34.5%)');
    });

    it('hands a plaintext value holding no term over as a text node of the raw value', () => {
        const node = wrap('plaintext')(cellFor(`<i>a & "b"</i>`));
        expect(node).toBeInstanceOf(Text);
        expect(/** @type {Text} */ (node).data).toBe(`<i>a & "b"</i>`);
    });
});

describe('the wrap decision', () => {
    const process = (
        /** @type {import('../../../src/common/tables/columnFactories.js').TableColumnDefinition[]} */ columns,
    ) =>
        processColumnDefinitions(columns, {
            excludedFields: new Set(),
            columnDefaults: {},
            glossary,
        });

    it('wraps an ordinary column and skips one that opts out', () => {
        const [plain, skipAll, skipCell] = process([
            { title: 'A', field: 'a' },
            { title: 'B', field: 'b', tableMeta: { skipGlossaryAnnotation: true } },
            { title: 'C', field: 'c', tableMeta: { skipCellGlossaryAnnotation: true } },
        ]).definitions;

        expect(annotated(columnFunction(plain, 'formatter')(cellFor(TERM), {}, () => {}))).toBe(
            true,
        );
        expect(skipAll.formatter).toBeUndefined();
        expect(skipCell.formatter).toBeUndefined();
    });

    it('leaves a column group alone — it has no cells of its own', () => {
        const [group] = process([
            { title: 'Merkmale', columns: [{ title: 'A', field: 'a' }] },
        ]).definitions;
        expect(group.formatter).toBeUndefined();
        expect(
            annotated(columnFunction(group.columns?.[0], 'formatter')(cellFor(TERM), {}, () => {})),
        ).toBe(true);
    });

    it('strips the app-only metadata before Tabulator sees the definition', () => {
        const [column] = process([
            {
                title: 'A',
                field: 'a',
                tableMeta: { skipGlossaryAnnotation: true },
                headerFilter: 'list',
            },
        ]).definitions;

        for (const key of ['tableMeta', 'headerFilter']) {
            expect(column).not.toHaveProperty(key);
        }
    });
});
