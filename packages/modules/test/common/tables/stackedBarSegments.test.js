import { describe, it, expect } from 'vitest';
import {
    processSegments,
    competenceLevelDistributionPreset,
} from '../../../src/common/tables/stackedBarCell.js';
import { CompetenceLevelPalette } from '../../../src/common/context/index.js';

/**
 * The SL domain table leaves the competence-level fields off a Landesschnitt row
 * that has no distribution, rather than zero-filling them, since a zero reads upstream
 * as a measured value. That is safe only while absent, `null` and `0` render alike,
 * which no pixel test can tell apart.
 */

const LEVELS = ['I', 'II', 'III'];
const PRESET = competenceLevelDistributionPreset(LEVELS);

/** @param {{[key: string]: any}} row */
function segmentsFor(row) {
    return processSegments(new CompetenceLevelPalette(), row, PRESET);
}

describe('processSegments — missing distribution fields', () => {
    it('treats absent, null and zero competence-level fields identically: no segments at all', () => {
        const absent = { type: 'state' };
        const nulled = {
            type: 'state',
            competenceLevel_I: null,
            competenceLevel_II: null,
            competenceLevel_III: null,
        };
        const zeroed = {
            type: 'state',
            competenceLevel_I: 0,
            competenceLevel_II: 0,
            competenceLevel_III: 0,
        };

        expect(segmentsFor(absent)).toEqual([]);
        expect(segmentsFor(nulled)).toEqual([]);
        expect(segmentsFor(zeroed)).toEqual([]);
    });

    it('keeps only the levels the payload actually resolved', () => {
        // The payload delivered two of three bands.
        const segments = segmentsFor({
            type: 'state',
            competenceLevel_I: 40,
            competenceLevel_III: 60,
        });

        expect(segments.map((s) => s.field)).toEqual(['competenceLevel_I', 'competenceLevel_III']);
        expect(segments.map((s) => s.value)).toEqual([40, 60]);
        // Percentages are taken over the delivered total: an undelivered band must
        // not shrink the delivered ones.
        expect(segments.map((s) => s.percentage)).toEqual([40, 60]);
    });
});
