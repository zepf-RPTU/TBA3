// @vitest-browser
// (themeService reads getComputedStyle at import)

import { describe, it, expect } from 'vitest';
import {
    formatSegmentShare,
    levelShareLabelFormatter,
} from '@tba3/modules/common/charts/stackedBarUtils.js';

/**
 * WHY: every stacked competence bar labels its segments through one formatter with
 * two tiers — `A2 · 32 %` where the renderer measured room for it, the level alone
 * otherwise — so the share never appears in one chart's spelling and not another's.
 */
describe('levelShareLabelFormatter', () => {
    it('rounds the share to whole percent with a non-breaking space', () => {
        expect(formatSegmentShare({ percentage: 31.6 })).toBe('32 %');
        expect(formatSegmentShare({ normalizedValue: 4.4 })).toBe('4 %');
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
