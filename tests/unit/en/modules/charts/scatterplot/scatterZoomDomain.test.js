import { describe, it, expect } from 'vitest';
import {
    calculateZoomDomain,
    dataCoversAllCompetencyLevels,
} from '@tba3/modules/en/modules/charts/scatterplot/scatterZoomDomain.js';

const DOMAIN_IDS = ['ho', 'le'];
const pts = (pairs) => pairs.map(([x, y]) => ({ d0Percentage: x, d1Percentage: y }));

describe('calculateZoomDomain', () => {
    it('pads the data extent and clamps to [0, 100]', () => {
        // x extent 30..40, y extent 50..70, padding 5 → clamp keeps everything in range
        expect(
            calculateZoomDomain(
                pts([
                    [30, 50],
                    [40, 70],
                ]),
                { domainIds: DOMAIN_IDS, padding: 5 },
            ),
        ).toEqual({ xMin: 25, xMax: 45, yMin: 45, yMax: 75 });
    });

    it('never returns bounds outside 0..100 even with large padding', () => {
        // WHY: percentages are bounded [0,100]; padding must not produce an axis
        // domain that extends past the plot area.
        expect(calculateZoomDomain(pts([[2, 96]]), { domainIds: DOMAIN_IDS, padding: 10 })).toEqual(
            { xMin: 0, xMax: 12, yMin: 86, yMax: 100 },
        );
    });

    it('includes comparison-group and positive class averages in the extent', () => {
        // state avg pushes x max to 90; class avg pushes y min to 10
        const domain = calculateZoomDomain(pts([[40, 50]]), {
            domainIds: DOMAIN_IDS,
            comparisons: [{ id: 'hb', type: 'state', domainAverages: { ho: 90, le: 55 } }],
            classAverages: { ho: 45, le: 10 },
            padding: 0,
        });
        expect(domain).toEqual({ xMin: 40, xMax: 90, yMin: 10, yMax: 55 });
    });

    it('ignores class averages that are zero (missing data sentinel)', () => {
        // WHY: a class average of 0 means "no data", not "0%"; it must not drag the
        // zoom extent down to zero.
        const domain = calculateZoomDomain(pts([[40, 50]]), {
            domainIds: DOMAIN_IDS,
            classAverages: { ho: 0, le: 0 },
            padding: 0,
        });
        expect(domain).toEqual({ xMin: 40, xMax: 40, yMin: 50, yMax: 50 });
    });
});

describe('dataCoversAllCompetencyLevels', () => {
    // Two thresholds → three bands: [0,40], [40,70], [70,100] on each axis.
    const thresholds = { x: [40, 70], y: [40, 70] };

    it('is false when there are no thresholds (nothing to cover)', () => {
        expect(
            dataCoversAllCompetencyLevels(pts([[50, 50]]), {
                thresholds: { x: [], y: [] },
                domainIds: DOMAIN_IDS,
            }),
        ).toBe(false);
    });

    it('is true when at least one point falls in every band on both axes', () => {
        const data = pts([
            [10, 20],
            [50, 55],
            [80, 90],
        ]); // one per band on each axis
        expect(dataCoversAllCompetencyLevels(data, { thresholds, domainIds: DOMAIN_IDS })).toBe(
            true,
        );
    });

    it('is false when a band is empty on an axis (zoom would then help)', () => {
        // WHY: this is the whole point of the check — if the data misses a band, zoom
        // should stay available; only suppress it when every band is already covered.
        const data = pts([
            [10, 20],
            [80, 90],
        ]); // middle band [40,70] empty on both axes
        expect(dataCoversAllCompetencyLevels(data, { thresholds, domainIds: DOMAIN_IDS })).toBe(
            false,
        );
    });

    it('lets averages fill an otherwise-empty band', () => {
        // points miss the middle x band, but the state average (55) fills it; y is
        // covered by points, so both axes end up fully covered.
        const data = pts([
            [10, 20],
            [80, 55],
            [80, 90],
        ]);
        expect(
            dataCoversAllCompetencyLevels(data, {
                thresholds,
                domainIds: DOMAIN_IDS,
                comparisons: [{ id: 'hb', type: 'state', domainAverages: { ho: 55, le: 50 } }],
            }),
        ).toBe(true);
    });

    it('counts every comparison group, not just the first', () => {
        // WHY: a payload can carry several Landesschnitte (nw splits by track). The
        // coverage check decides whether the zoom button is offered at all, so
        // considering only one group would suppress zoom on a partial view of the data.
        const data = pts([
            [10, 20],
            [80, 90],
        ]); // middle band empty on both axes
        expect(
            dataCoversAllCompetencyLevels(data, {
                thresholds,
                domainIds: DOMAIN_IDS,
                comparisons: [
                    { id: 'nw-gy', type: 'state', domainAverages: { ho: 80, le: 90 } },
                    { id: 'nw-msa', type: 'state', domainAverages: { ho: 55, le: 50 } },
                ],
            }),
        ).toBe(true);
    });
});
