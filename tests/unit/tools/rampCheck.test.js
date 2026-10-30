import { describe, expect, it } from 'vitest';
import { GRAYSCALE_COUNTS, checkShippedRamps, measureRamp } from '../../../tools/ramp-check.mjs';

// The competence-level ramp's gates are numbers. The
// tool that prints them is the test, so a ramp edit that drops a band below 3:1 or lets
// two neighbours collapse under a colour vision deficiency fails the suite with the table.

describe('tools/ramp-check', () => {
    it('passes every gate for the shipped ramps', () => {
        const { rows, ok } = checkShippedRamps();
        const failed = rows.filter((row) => !row.pass);
        expect(failed, JSON.stringify(failed, null, 2)).toEqual([]);
        expect(ok).toBe(true);
        // Both schemes' default ramp and rating bands are gated, not only reported.
        const gated = ['default light', 'default dark', 'sl-rating light', 'sl-rating dark'];
        // Grayscale is gated at every level count a shipped ladder has, up to seven.
        for (const scheme of ['light', 'dark']) {
            for (const count of GRAYSCALE_COUNTS) gated.push(`grayscale ${scheme} ×${count}`);
        }
        for (const ramp of gated) {
            expect(
                rows.some((row) => row.ramp === ramp && row.gate !== null),
                ramp,
            ).toBe(true);
        }
    });

    it('fails a constant-lightness rainbow', () => {
        const rows = measureRamp(
            ['#d64550', '#c67f14', '#2f9e44', '#0c9ea3', '#3b5bd0'],
            'light',
            '#ffffff',
        );
        expect(rows.filter((row) => !row.pass).map((row) => row.check)).toEqual([
            'in-arm ΔL',
            'adjacent ΔE protan',
            'adjacent ΔE deutan',
            'adjacent ΔE tritan',
        ]);
    });
});
