import { describe, it, expect } from 'vitest';

import {
    calculateDetailedBoxPlotStats,
    ratingBandTooltip,
} from '../../../src/sl/utils/slBoxPlotStats.js';
import { statsOf } from '../../support/slValueGroupFactories.js';

/**
 * Every SL box plot — Selbstwirksamkeit, Unterrichtsqualität, the longitudinal pair —
 * gets its shape from this module. These tests pin that one definition — interpolated
 * quartiles and whiskers ending inside the Tukey fences — so identical class tokens mean
 * the same thing in every drawer.
 */

describe('calculateDetailedBoxPlotStats', () => {
    it('interpolates quartiles between values instead of picking an index', () => {
        // Index picking — sorted[Math.floor(n * 0.25)] — returns a real observation,
        // not the quartile. A box drawn from it is the wrong height, silently.
        const stats = statsOf([1, 2, 3, 4, 5]);

        expect(stats.q1).toBe(2);
        expect(stats.median).toBe(3);
        expect(stats.q3).toBe(4);

        // Six values is where the two definitions visibly part company.
        const six = statsOf([1, 2, 3, 4, 5, 6]);
        expect(six.q1).toBeCloseTo(2.25, 10);
        expect(six.median).toBeCloseTo(3.5, 10);
        expect(six.q3).toBeCloseTo(4.75, 10);
    });

    it('reports the population standard deviation, which is what the tooltips print', () => {
        // n, not n-1: these are whole measured groups, not samples drawn from one.
        const stats = statsOf([2, 4, 4, 4, 5, 5, 7, 9]);

        expect(stats.mean).toBe(5);
        expect(stats.standardDeviation).toBeCloseTo(2, 10);
    });

    it('flags values beyond the Tukey fences as outliers', () => {
        const stats = statsOf([10, 11, 12, 13, 14, 15, 16, 40]);

        expect(stats.outliers).toEqual([40]);
        expect(stats.outlierCount).toBe(1);
    });

    it('has no shape for an empty set', () => {
        expect(calculateDetailedBoxPlotStats([])).toBeNull();
    });
});

describe('the whisker ends', () => {
    it('are the furthest values inside the fences, not the fences themselves', () => {
        // The tooltips call the whisker ends "Min / Max".
        const stats = statsOf([10, 11, 12, 13, 14, 15, 16, 40]);

        expect(stats.whiskerMin).toBe(10);
        expect(stats.whiskerMax).toBe(16);
        // The upper fence falls at 20.5, and nobody scored it. A whisker drawn to the
        // fence would put the cap on a value that was never measured, and leave the
        // outlier at 40 looking like a second, detached whisker end.
        expect(stats.whiskerMax).toBeLessThan(stats.max);
    });

    it('reach the true extremes when nothing lies outside the fences', () => {
        const stats = statsOf([3, 4, 5, 6, 7]);

        expect(stats.whiskerMin).toBe(3);
        expect(stats.whiskerMax).toBe(7);
        expect(stats.outliers).toEqual([]);
    });

    it('collapse to the value itself for a single observation', () => {
        // One rater is a degenerate box, not an error: q1 = q3 = median = the value, so
        // the whiskers have nowhere to reach and the mark draws as a flat line.
        const stats = statsOf([3.5]);

        expect(stats.whiskerMin).toBe(3.5);
        expect(stats.whiskerMax).toBe(3.5);
    });
});

describe('ratingBandTooltip', () => {
    it('names the answer, its share and headcount, under the title, subtitle and mean given', () => {
        const band = { label: 'trifft eher zu', count: 3, total: 12, percentage: 25 };

        const tooltip = ratingBandTooltip(band, {
            title: '8a',
            subtitle: 'Unterrichtsqualität',
            mean: 2.5,
        });

        expect(tooltip.title).toBe('8a');
        expect(tooltip.subtitle).toBe('Unterrichtsqualität');
        expect((tooltip.rows ?? []).filter(Boolean).map((row) => row && row.value)).toContain(
            'trifft eher zu',
        );
        expect(tooltip.footer).toEqual([{ label: 'Mittelwert', value: '2,50' }]);
        // A table cell's band has neither a subtitle nor a mean.
        expect(ratingBandTooltip(band, { title: 'Schule' })).not.toHaveProperty('footer');
    });
});
