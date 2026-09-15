import { describe, it, expect } from 'vitest';

import { calculateDetailedBoxPlotStats } from '@tba3/modules/sl/utils/slBoxPlotStats.js';

/**
 * Every SL box plot — Selbstwirksamkeit, Unterrichtsqualität, the longitudinal pair —
 * gets its shape from this module, and until now none of it was tested.
 *
 * It also used to ship a second `calculateBoxPlotStats` with `Math.floor` quartiles
 * beside the interpolated ones here, and each of the three drawers invented its own
 * whisker rule: Tukey fences in one, mean ± 0.675·SD boxes with mean ± 1.5·SD whiskers
 * in another, mean ± 1.5·SD labelled "Min / Max" in the third. Identical class tokens,
 * three different meanings. These tests pin the one definition that replaced them.
 */

describe('calculateDetailedBoxPlotStats', () => {
    it('interpolates quartiles between values instead of picking an index', () => {
        // WHY: the deleted second implementation used sorted[Math.floor(n * 0.25)], which
        // for this set gives q1 = 2 and q3 = 4 — both real observations, but not the
        // quartiles. A box drawn from them is the wrong height, silently.
        const stats = calculateDetailedBoxPlotStats([1, 2, 3, 4, 5]);

        expect(stats.q1).toBe(2);
        expect(stats.median).toBe(3);
        expect(stats.q3).toBe(4);

        // Six values is where the two definitions visibly part company.
        const six = calculateDetailedBoxPlotStats([1, 2, 3, 4, 5, 6]);
        expect(six.q1).toBeCloseTo(2.25, 10);
        expect(six.median).toBeCloseTo(3.5, 10);
        expect(six.q3).toBeCloseTo(4.75, 10);
    });

    it('reports the population standard deviation, which is what the tooltips print', () => {
        // n, not n-1: these are whole measured groups, not samples drawn from one.
        const stats = calculateDetailedBoxPlotStats([2, 4, 4, 4, 5, 5, 7, 9]);

        expect(stats.mean).toBe(5);
        expect(stats.standardDeviation).toBeCloseTo(2, 10);
    });

    it('flags values beyond the Tukey fences as outliers', () => {
        const stats = calculateDetailedBoxPlotStats([10, 11, 12, 13, 14, 15, 16, 40]);

        expect(stats.outliers).toEqual([40]);
        expect(stats.outlierCount).toBe(1);
        expect(stats.upperFence).toBeLessThan(40);
    });

    it('has no shape for an empty set', () => {
        expect(calculateDetailedBoxPlotStats([])).toBeNull();
        expect(calculateDetailedBoxPlotStats(null)).toBeNull();
    });
});

describe('the whisker ends', () => {
    it('are the furthest values inside the fences, not the fences themselves', () => {
        // WHY: this is what lets a tooltip call the whisker ends "Min / Max" honestly.
        // Drawing the fences themselves would put the whisker at a position no student
        // actually scored, and the longitudinal chart's tooltip made exactly that claim
        // about mean ± 1.5·SD before this rule was shared.
        const stats = calculateDetailedBoxPlotStats([10, 11, 12, 13, 14, 15, 16, 40]);

        expect(stats.whiskerMin).toBe(10);
        expect(stats.whiskerMax).toBe(16);
        // 20.5 is where the upper fence falls, and nobody scored it. A whisker drawn to
        // the fence would put the cap on a value that was never measured, and leave the
        // outlier at 40 looking like a second, detached whisker end.
        expect(stats.upperFence).toBeCloseTo(20.5, 10);
        expect(stats.whiskerMax).toBeLessThan(stats.upperFence);
        expect(stats.whiskerMax).toBeLessThan(stats.max);
    });

    it('reach the true extremes when nothing lies outside the fences', () => {
        const stats = calculateDetailedBoxPlotStats([3, 4, 5, 6, 7]);

        expect(stats.whiskerMin).toBe(3);
        expect(stats.whiskerMax).toBe(7);
        expect(stats.outliers).toEqual([]);
    });

    it('collapse to the value itself for a single observation', () => {
        // One rater is a degenerate box, not an error: q1 = q3 = median = the value, so
        // the whiskers have nowhere to reach and the mark draws as a flat line.
        const stats = calculateDetailedBoxPlotStats([3.5]);

        expect(stats.whiskerMin).toBe(3.5);
        expect(stats.whiskerMax).toBe(3.5);
    });
});
