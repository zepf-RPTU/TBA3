// @vitest-browser

/**
 * StripBarChart — one plain 0–100 % bar from the segments it is handed; the click and
 * the highlight only where the caller passes them.
 */

import { signal } from '@preact/signals-core';
import { beforeEach, describe, expect, it } from 'vitest';

import { StripBarChart } from '../../../../src/common/charts/stripBar/stripBarChart.js';
import { createTestContext } from '../../../support/glossaryFixture.js';
import { makeVisibleChartContainer } from '../../../support/chartHarness.js';
import { required } from '../../../support/required.js';

const CONTAINER_ID = 'strip-bar-test';

/**
 * A segment of the given share.
 * @param {string} field
 * @param {number} percentage
 * @param {number} [count] - Its headcount.
 * @returns {import('../../../../src/common/charts/stripBar/stripBarChart.js').StripSegment}
 */
const segment = (field, percentage, count) => ({
    field,
    label: field,
    percentage,
    color: 'var(--test-segment-color)',
    ...(count === undefined ? {} : { count }),
    tooltip: { title: `tip ${field}` },
});

const SEGMENTS = [segment('low', 20, 2), segment('mid', 30, 3), segment('high', 50, 5)];

/** @type {HTMLDivElement} */
let container;

/**
 * Draw a strip.
 * @param {import('../../../../src/common/charts/stripBar/stripBarChart.js').StripSegment[]} segments
 * @param {object} [options]
 * @returns {StripBarChart}
 */
function draw(segments, options = {}) {
    const chart = new StripBarChart(container, segments, {
        context: createTestContext('sl'),
        autoResize: false,
        rowLabel: '8a',
        ...options,
    });
    chart.create();
    return chart;
}

/**
 * The rect of a segment.
 * @param {string} field
 * @returns {SVGRectElement}
 */
const rectOf = (field) => required(container.querySelector(`.segment-${field} rect`));

beforeEach(() => {
    container = makeVisibleChartContainer(CONTAINER_ID, { widthPx: 600, heightPx: 120 });
});

describe('StripBarChart', () => {
    it('stacks the segments from 0 % in order, with no axes', () => {
        draw(SEGMENTS);
        const low = Number(rectOf('low').getAttribute('x'));
        const mid = Number(rectOf('mid').getAttribute('x'));
        const high = Number(rectOf('high').getAttribute('x'));

        // Within the surface gap that parts two segments.
        expect(low).toBeLessThan(3);
        expect(low).toBeLessThan(mid);
        expect(mid).toBeLessThan(high);
        expect(container.querySelector('.chart-axis')).toBeNull();
    });

    it('labels a segment with its share and its headcount when it carries one', () => {
        draw([segment('a', 60, 6), segment('b', 40)]);
        const labels = [...container.querySelectorAll('text.value-label')].map(
            // The formatter spaces with no-break spaces.
            (label) => label.textContent?.replace(/\s/g, ' '),
        );

        expect(labels).toEqual(['a · 60 % (6)', 'b · 40 %']);
    });

    it('reports a clicked segment by its field, and leaves the segments inert without a handler', () => {
        /** @type {string[]} */
        const clicked = [];
        draw(SEGMENTS, { onSegmentClick: (/** @type {string} */ field) => clicked.push(field) });
        rectOf('mid').dispatchEvent(new MouseEvent('click', { bubbles: true }));

        expect(clicked).toEqual(['mid']);
        expect(container.querySelectorAll('[role="button"]')).toHaveLength(3);

        container = makeVisibleChartContainer(CONTAINER_ID, { widthPx: 600, heightPx: 120 });
        draw(SEGMENTS);
        expect(container.querySelectorAll('[role="button"]')).toHaveLength(0);
    });

    it('redraws the highlight when the shared signal changes', () => {
        const highlightedKeys = signal(/** @type {string[]} */ ([]));
        draw(SEGMENTS, { highlightedKeys });

        expect(rectOf('high').classList.contains('highlighted')).toBe(false);
        highlightedKeys.value = ['high'];

        expect(rectOf('high').classList.contains('highlighted')).toBe(true);
        expect(rectOf('low').classList.contains('highlighted')).toBe(false);
    });

    it('draws no labels as a thumbnail', () => {
        draw(SEGMENTS, { thumbnail: true });

        expect(container.querySelectorAll('rect.bar-segment')).toHaveLength(3);
        expect(container.querySelector('text.value-label')).toBeNull();
    });

    it('draws nothing from empty segments', () => {
        const chart = draw([segment('a', 0), segment('b', 0)]);

        expect(chart.validateData()).toBe(false);
    });
});

describe('StripBarChart data table', () => {
    it('is one row: per segment its share with its headcount', () => {
        const table = required(draw(SEGMENTS).dataTable());

        expect(table.columns.map((column) => column.label)).toEqual([
            'Gruppe',
            'low',
            'mid',
            'high',
        ]);
        expect(table.rows).toHaveLength(1);
        expect(table.rows[0][0].text).toBe('8a');
        expect(table.rows[0][1].values).toEqual([20, 2]);
    });

    it('shows the shares alone for segments without a headcount, and no table for an empty strip', () => {
        const table = required(draw([segment('low', 20), segment('high', 80)]).dataTable());
        expect(table.rows[0][1].values).toEqual([20, null]);

        expect(draw([segment('low', 0), segment('high', 0)]).dataTable()).toBeNull();
    });
});
