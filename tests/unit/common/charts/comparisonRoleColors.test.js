// @vitest-browser
// (jsdom because getThemeColors reads getComputedStyle; the themeService
// fallbacks are what resolve here, which is exactly the invariant under test.)

/**
 * Role → theme-color contract.
 *
 * Comparison markers and legend rows resolve their paint as
 * `getThemeColors().chart[resolveAverageRole(type)]` (scatterplot, item
 * lollipop, style charts). If a role ever lacks a theme color the fill comes
 * out `undefined`, d3 treats `.style('fill', undefined)` as a no-op, and the
 * marker silently renders SVG-default black — which reads as a Schulschnitt.
 * The per-chart hand-copied color subsets that used to guard against this are
 * deleted; this invariant is the replacement guard.
 */
import { describe, expect, it } from 'vitest';
import {
    resolveAverageRole,
    OTHER_AVERAGE_ROLE,
} from '@tba3/modules/common/domain/comparisonGroupLabels.js';
import { getThemeColors } from '@tba3/modules/common/services/themeService.js';

describe('comparison role colors', () => {
    it('maps every resolvable role (and the class role) to a defined, non-empty theme color', () => {
        // The complete range of resolveAverageRole, plus the class marker's key.
        const roles = ['school', 'state', OTHER_AVERAGE_ROLE, 'classAverage'];
        const chart = getThemeColors(true).chart;

        for (const role of roles) {
            expect(chart[role], `theme.chart.${role}`).toBeTruthy();
            expect(chart[role]).toMatch(/\S/);
        }
    });

    it('collapses unknown payload types to a role that has a color', () => {
        const chart = getThemeColors(true).chart;

        expect(chart[resolveAverageRole('some-brand-new-population')]).toBeTruthy();
        expect(resolveAverageRole('some-brand-new-population')).toBe(OTHER_AVERAGE_ROLE);
    });
});
