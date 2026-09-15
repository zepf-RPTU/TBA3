/**
 * getEnGerThresholds tests — the step between the payload's raw-score cut scores and the
 * percentage positions the scatterplot draws its bands, guide lines and labels at.
 *
 * Getting this wrong is invisible: the chart still renders a plausible set of bands, just
 * not the ones the student's own booklet defines.
 */

import { describe, it, expect } from 'vitest';
import { getEnGerThresholds } from '@tba3/modules/en/modules/charts/scatterplot/scatterPointAdapter.js';

/** Minimal stand-in for EnConfig — the chart reads exactly these two members. */
function enConfig(equivalenceTables) {
    return { domainIds: ['ho', 'le'], equivalenceTables };
}

/** An NRW-style table, domain `le`: six NRW bands over 39 items. */
const NW_LE = {
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
        // WHY: the labels were a fixed A1…C1 ladder. On an NRW payload every one of them
        // missed the palette registry and rendered in the neutral "unknown value" gray,
        // over bands that were not the ones being described.
        const thresholds = getEnGerThresholds(enConfig({ ho: NW_LE, le: NW_LE }));

        expect(thresholds.ho.ks).toEqual(['k.h.N.', 'KS 1', 'KS 2', 'KS 3', 'KS 4', 'KS 5']);
    });

    it('places a boundary between the last score of a band and the first of the next', () => {
        // 5|6 → 5.5/39, 13|14 → 13.5/39, … A boundary drawn on a band's own last score
        // would classify that score into the band above it.
        const { le } = getEnGerThresholds(enConfig({ ho: NW_LE, le: NW_LE }));

        expect(le.ksPercentageThresholds).toEqual(['14.1', '34.6', '57.7', '78.2', '93.6']);
    });

    it("measures against the booklet's item count, not the top of the band scale", () => {
        // WHY: a point's position is its share of the items it answered. Where a state's
        // band scale stops short of the booklet, dividing
        // by `maxScore` shifts every band relative to the points it classifies.
        const shortScale = {
            maxScore: 85,
            itemCount: 93,
            bands: [
                { nameShort: 'A1', minScore: 0, maxScore: 45 },
                { nameShort: 'A2', minScore: 46, maxScore: 85 },
            ],
        };

        const { ho } = getEnGerThresholds(enConfig({ ho: shortScale, le: NW_LE }));

        expect(ho.ksPercentageThresholds).toEqual([((45.5 / 93) * 100).toFixed(1)]);
    });

    it('falls back to maxScore when a table omits the item count', () => {
        const noItemCount = {
            maxScore: 40,
            bands: [
                { nameShort: 'A1', minScore: 0, maxScore: 19 },
                { nameShort: 'A2', minScore: 20, maxScore: 40 },
            ],
        };

        const { ho } = getEnGerThresholds(enConfig({ ho: noItemCount, le: NW_LE }));

        expect(ho.ksPercentageThresholds).toEqual(['48.8']);
    });

    it('reports no bands for a domain whose payload ships no table', () => {
        // WHY: null is what makes the renderer draw nothing. Substituting another
        // domain's table, or a default ladder, is how the old code put 8a's GER bands
        // behind every state export.
        const thresholds = getEnGerThresholds(enConfig({ ho: null, le: NW_LE }));

        expect(thresholds.ho).toBeNull();
        expect(thresholds.le).not.toBeNull();
    });
});
