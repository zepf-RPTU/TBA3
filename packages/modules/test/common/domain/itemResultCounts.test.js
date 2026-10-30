/**
 * `itemResultFields` — the result fields every EN and MA item record carries.
 */

import { describe, expect, it } from 'vitest';
import { itemResultFields } from '../../../src/common/domain/index.js';

const NO_COUNTS = new Map();

describe('itemResultFields', () => {
    it('reads the mean as a percentage and measures it against the Pilotierung', () => {
        const fields = itemResultFields(
            {
                iqbId: 'a',
                descriptiveStatistics: { mean: 0.62 },
                parameters: { solutionFrequencyGymnasium: 0.5 },
            },
            NO_COUNTS,
        );

        expect(fields.meanPercentage).toBeCloseTo(62, 10);
        expect(fields.pilotSolutionFrequencyDiff).toBe(12);
    });
});
