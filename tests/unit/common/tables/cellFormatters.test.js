// @vitest-browser

import { describe, it, expect } from 'vitest';
import {
    createResultFormatter,
    createCountPercentageFormatter,
    createStackedCellFormatter,
    createBoxPlotFormatter,
} from '@tba3/modules/common/tables/cellFormatters.js';
import { createFakeCell as cellFor } from '../../support/tabulatorFakes.js';

describe('createResultFormatter', () => {
    // WHY: exactly three sentinel result codes map to distinct status icons; any
    // other value (headers, aggregate/empty cells) must pass straight through so
    // the formatter never masks non-result content behind an icon.
    it('maps the three result codes to their own icons', () => {
        expect(createResultFormatter(cellFor(1))).toContain('data-icon="check_circle"');
        expect(createResultFormatter(cellFor(0))).toContain('data-icon="cancel"');
        expect(createResultFormatter(cellFor(-1))).toContain('data-icon="block"');
    });

    it('passes non-sentinel values through unchanged', () => {
        expect(createResultFormatter(cellFor('n/a'))).toBe('n/a');
        expect(createResultFormatter(cellFor(null))).toBeNull();
    });
});

describe('createCountPercentageFormatter', () => {
    it('renders count plus its percentage of the total field', () => {
        const format = createCountPercentageFormatter('anzahlSus');
        expect(format(cellFor(3, { anzahlSus: 12 }))).toBe('3 (25.0%)');
    });

    it('does not divide by zero when the total is 0', () => {
        // WHY: empty groups have total 0; the cell must read "0.0%", never "NaN%".
        const format = createCountPercentageFormatter('anzahlSus');
        expect(format(cellFor(0, { anzahlSus: 0 }))).toBe('0 (0.0%)');
    });
});

describe('createStackedCellFormatter', () => {
    const getItems = (rowData) => rowData.items;
    const createItemElement = (item) => {
        const el = document.createElement('span');
        el.textContent = item;
        return el;
    };

    it('collapses to the single-item value instead of a container', () => {
        // WHY: one item is visual noise as a stack — callers get a plain '-' marker.
        const format = createStackedCellFormatter({ getItems, createItemElement });
        expect(format(cellFor(null, { items: ['only'] }))).toBe('-');
    });

    it('renders one child element per item when there are several', () => {
        const format = createStackedCellFormatter({ getItems, createItemElement });
        const node = format(cellFor(null, { items: ['a', 'b', 'c'] }));
        expect(node.children).toHaveLength(3);
        expect(node.textContent).toBe('abc');
    });

    it('returns the empty value for no items or when skipCondition matches', () => {
        const empty = createStackedCellFormatter({ getItems, createItemElement, emptyValue: 'X' });
        expect(empty(cellFor(null, { items: [] }))).toBe('X');

        const skipped = createStackedCellFormatter({
            getItems,
            createItemElement,
            emptyValue: 'X',
            skipCondition: (rowData) => rowData.hide === true,
        });
        expect(skipped(cellFor(null, { items: ['a', 'b'], hide: true }))).toBe('X');
    });
});

describe('createBoxPlotFormatter', () => {
    const options = {
        boxColor: '#336699',
        dataField: 'teachingQuality',
        tooltipTitle: 'Unterrichtsqualität',
    };

    it('degrades to a dash when the box-plot stats are missing or invalid', () => {
        // WHY: incomplete stats (count 0, or a missing quartile) must render a
        // neutral '-' rather than a broken/empty SVG.
        const format = createBoxPlotFormatter(options);
        const dash = format(cellFor(null, { teachingQuality: { count: 0 } }));
        expect(dash.tagName.toLowerCase()).toBe('span');
        expect(dash.textContent).toBe('-');
    });

    it('renders an SVG box plot with a stats tooltip for valid data', () => {
        const format = createBoxPlotFormatter(options);
        const node = format(
            cellFor(null, {
                teachingQuality: {
                    count: 20,
                    mean: 3,
                    standardDeviation: 0.5,
                    median: 3,
                    q1: 2.5,
                    q3: 3.5,
                },
            }),
        );
        expect(node.querySelector('svg')).not.toBeNull();
        // Box + median + 2 whiskers + 2 caps = 6 drawn shapes.
        expect(node.querySelectorAll('svg line, svg rect')).toHaveLength(6);
        expect(node.getAttribute('data-tooltip-html')).toContain('Median: 3.00');
    });
});
