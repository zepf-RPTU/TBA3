// Wrong thresholds are invisible on screen: the chart still renders a plausible set of
// bands, just not the ones the student's own booklet defines.

import { describe, it, expect } from 'vitest';
import { getEnGerThresholds } from '../../../../../src/en/modules/charts/scatterplot/scatterPointAdapter.js';
import { required } from '../../../../support/required.js';

/** @typedef {import('../../../../../src/common/domain/competenceScale.js').EquivalenceTable} EquivalenceTable */

/**
 * Minimal stand-in for EnConfig — the chart reads exactly these two members.
 * @param {{[domainId: string]: EquivalenceTable|null}} equivalenceTables
 * @returns {import('../../../../../src/en/modules/charts/scatterplot/scatterPointAdapter.js').EnPointConfig}
 */
function enConfig(equivalenceTables) {
    return { domainIds: ['ho', 'le'], equivalenceTables };
}

/**
 * A `le` table on a ladder other than A1…C1: six bands over 39 items.
 * @type {EquivalenceTable}
 */
const KS_LE = {
    maxScore: 39,
    itemCount: 39,
    bands: [
        { nameShort: 'k.h.N.', minScore: 0, maxScore: 5 },
        { nameShort: 'KS 1', minScore: 6, maxScore: 13 },
        { nameShort: 'KS 2', minScore: 14, maxScore: 22 },
        { nameShort: 'KS 3', minScore: 23, maxScore: 30 },
        { nameShort: 'KS 4', minScore: 31, maxScore: 36 },
        { nameShort: 'KS 5', minScore: 37, maxScore: 39 },
    ],
};

describe('getEnGerThresholds', () => {
    it('labels the bands with the scale the state actually publishes', () => {
        // With a fixed A1…C1 ladder, every label on such a payload would miss the
        // palette registry and render in the neutral "unknown value" gray, over bands
        // that are not the ones being described.
        const thresholds = getEnGerThresholds(enConfig({ ho: KS_LE, le: KS_LE }));

        expect(required(thresholds.ho).competenceLevelNames).toEqual([
            'k.h.N.',
            'KS 1',
            'KS 2',
            'KS 3',
            'KS 4',
            'KS 5',
        ]);
    });

    it('places a boundary between the last score of a band and the first of the next', () => {
        // 5|6 → 5.5/39, 13|14 → 13.5/39, … A boundary drawn on a band's own last score
        // would classify that score into the band above it.
        const { le } = getEnGerThresholds(enConfig({ ho: KS_LE, le: KS_LE }));

        expect(required(le).competenceLevelPercentageThresholds).toEqual([
            14.1, 34.6, 57.7, 78.2, 93.6,
        ]);
    });

    it("measures against the booklet's item count, not the top of the band scale", () => {
        // A point's position is its share of the items it answered. Where a state's
        // band scale stops short of the booklet, dividing by `maxScore` shifts every band
        // relative to the points it classifies.
        const shortScale = {
            maxScore: 85,
            itemCount: 93,
            bands: [
                { nameShort: 'A1', minScore: 0, maxScore: 45 },
                { nameShort: 'A2', minScore: 46, maxScore: 85 },
            ],
        };

        const { ho } = getEnGerThresholds(enConfig({ ho: shortScale, le: KS_LE }));

        expect(required(ho).competenceLevelPercentageThresholds).toEqual([
            Number(((45.5 / 93) * 100).toFixed(1)),
        ]);
    });

    it('reports no bands for a domain whose payload ships no table', () => {
        // Null is what makes the renderer draw nothing. Substituting another
        // domain's table, or a default ladder, would put 8a's GER bands behind every
        // state export.
        const thresholds = getEnGerThresholds(enConfig({ ho: null, le: KS_LE }));

        expect(thresholds.ho).toBeNull();
        expect(thresholds.le).not.toBeNull();
    });
});
