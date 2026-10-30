// @vitest-browser
// (themeService reads getComputedStyle at import)

import { describe, it, expect } from 'vitest';
import {
    formatSegmentShare,
    levelShareLabelFormatter,
} from '../../../src/common/utils/stackedBarUtils.js';
import { createDOMStackedBar } from '../../../src/common/tables/stackedBarCell.js';

/**
 * Every stacked competence bar labels its segments through one formatter with
 * two tiers — `A2 · 32 %` where the renderer measured room for it, the level alone
 * otherwise — so the share never appears in one chart's spelling and not another's.
 */
describe('levelShareLabelFormatter', () => {
    it('rounds the share to whole percent with a non-breaking space', () => {
        expect(formatSegmentShare({ percentage: 31.6 })).toBe('32 %');
        expect(formatSegmentShare({ percentage: 4.4 })).toBe('4 %');
    });

    it('joins level and share with a middle dot in the long form only', () => {
        const segment = { label: 'A2', percentage: 31.6 };
        expect(levelShareLabelFormatter(segment, { withShare: true })).toBe('A2 · 32 %');
        expect(levelShareLabelFormatter(segment, { withShare: false })).toBe('A2');
        expect(levelShareLabelFormatter(segment)).toBe('A2');
    });

    it('splits level and share into two lines on request', () => {
        expect(
            levelShareLabelFormatter(
                { label: 'A2', percentage: 31.6 },
                { withShare: true, lines: true },
            ),
        ).toEqual(['A2', '32\u00a0%']);
    });

    it('falls back to the field when a segment has no label', () => {
        expect(levelShareLabelFormatter({ field: 'III', percentage: 10 })).toBe('III');
    });
});

/**
 * A DOM bar prints the labels its formatter names and leaves their fit to the
 * layout (stacked-bar.css); the bar owns its benchmark line, and the labelled segment
 * the line crosses gives up the room past it, so the label never runs under the line.
 */
describe('createDOMStackedBar labels and marker', () => {
    const segments = [
        { field: 'competenceLevel_I', label: 'I', value: 3, percentage: 81 },
        { field: 'competenceLevel_II', label: 'II', value: 1, percentage: 19 },
    ];
    const labels = (/** @type {HTMLElement} */ bar) =>
        [...bar.querySelectorAll('.stacked-bar-label')].map((el) => el.textContent);
    /** @type {(segment: import('../../../src/common/utils/stackedBarUtils.js').StackedSegment) => string} */
    const labelFormatter = (segment) => String(segment.label);

    it('labels every segment its labelFormatter names', () => {
        expect(labels(createDOMStackedBar(segments, { labelFormatter }))).toEqual(['I', 'II']);
    });

    it('draws no labels without a labelFormatter', () => {
        expect(labels(createDOMStackedBar(segments))).toEqual([]);
    });

    it('draws the benchmark line and keeps the crossed label clear of it', () => {
        const bar = createDOMStackedBar(segments, {
            labelFormatter,
            marker: { at: 60, tooltip: { rows: [{ label: 'Pilotierung', value: '60 %' }] } },
        });
        const marker = /** @type {HTMLElement} */ (bar.querySelector('.bar-benchmark-marker'));
        expect(marker.style.left).toBe('60%');
        const [first, second] = /** @type {HTMLElement[]} */ ([
            ...bar.querySelectorAll('.stacked-bar-segment'),
        ]);
        expect(first.classList.contains('stacked-bar-segment--marked')).toBe(true);
        expect(first.style.getPropertyValue('--label-room')).toBe('21%');
        expect(second.classList.contains('stacked-bar-segment--marked')).toBe(false);
    });
});
