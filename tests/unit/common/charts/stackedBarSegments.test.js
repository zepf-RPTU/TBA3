// @vitest-browser
// (transitive: stackedBarUtils.js -> themeService.js reads getComputedStyle at import time)

import { describe, it, expect, vi, afterEach } from 'vitest';
import {
    processSegments,
    ksDistributionPreset,
} from '@tba3/modules/common/charts/stackedBarUtils.js';

/**
 * WHY: the SL domain table used to seed every KS column on its Landesschnitt row
 * to `0` and then overwrite only the levels it could resolve from the payload. A
 * state entry with no persisted distribution therefore painted a stacked bar
 * summing to 0 %, which a reader decodes as "the Landesschnitt sits at zero", not
 * as "no state data was delivered" — the same silent-substitution class of defect
 * as copying the Schulschnitt into a bar labelled Landesschnitt.
 *
 * `slSchoolSummaryMetrics.js` already states the rule in prose ("rows and columns
 * without a resolvable value are omitted rather than zero-filled — a zero-height
 * bar would read as *no deviation* instead of *no data*"). These lock the reason
 * the domain table is now allowed to simply leave the field off: absent, `null`
 * and `0` are indistinguishable to the renderer, so omission is safe *and* is the
 * only one of the three that cannot be mistaken for a measured zero upstream.
 *
 * If someone reinstates the zero-fill, the render does not change — which is
 * exactly why the guarantee has to be pinned here rather than in a pixel test.
 */

const LEVELS = [{ stufe: 'I' }, { stufe: 'II' }, { stufe: 'III' }];
const PRESET = ksDistributionPreset(LEVELS, () => '#000000');

function segmentsFor(row) {
    return processSegments(row, PRESET);
}

afterEach(() => {
    vi.restoreAllMocks();
});

describe('processSegments — missing distribution fields', () => {
    it('treats absent, null and zero KS fields identically: no segments at all', () => {
        const absent = { type: 'state' };
        const nulled = { type: 'state', ks_I: null, ks_II: null, ks_III: null };
        const zeroed = { type: 'state', ks_I: 0, ks_II: 0, ks_III: 0 };

        // The domain table's state row may take any of these three shapes; none of
        // them may produce a drawable segment.
        expect(segmentsFor(absent)).toEqual([]);
        expect(segmentsFor(nulled)).toEqual([]);
        expect(segmentsFor(zeroed)).toEqual([]);
    });

    it('keeps only the levels the payload actually resolved', () => {
        // The realistic partial case: the exporter delivered two of three bands.
        const segments = segmentsFor({ type: 'state', ks_I: 40, ks_III: 60 });

        expect(segments.map((s) => s.field)).toEqual(['ks_I', 'ks_III']);
        expect(segments.map((s) => s.value)).toEqual([40, 60]);
        // Percentages are taken over the delivered total, not over the full level
        // set — an undelivered band must not shrink the bands that were delivered.
        expect(segments.map((s) => s.percentage)).toEqual([40, 60]);
    });

    it('warns when every field is filtered out, so an empty state row is never silent', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

        expect(segmentsFor({ type: 'state' })).toEqual([]);

        expect(warn).toHaveBeenCalledWith(
            expect.stringContaining('All segments filtered out'),
            expect.objectContaining({ preFilterCount: LEVELS.length }),
        );
    });
});
