import { describe, it, expect } from 'vitest';
import {
    calculateZoomDomain,
    dataCoversAllCompetenceLevels,
    selectDrawnAverages,
} from '../../../../../src/en/modules/charts/scatterplot/scatterZoomDomain.js';

/** @typedef {import('../../../../../src/en/utils/enStyleAggregationAdapter.js').StyleComparisonGroup} StyleComparisonGroup */

const DOMAIN_IDS = ['ho', 'le'];

/**
 * @param {Array<[number, number]>} pairs - x and y percentage per point.
 * @returns {Array<{xPercentage: number, yPercentage: number}>}
 */
const pts = (pairs) => pairs.map(([x, y]) => ({ xPercentage: x, yPercentage: y }));

/**
 * A comparison group; the zoom reads only its id and domain averages.
 * @param {Pick<StyleComparisonGroup, 'id' | 'domainAverages'> & Partial<StyleComparisonGroup>} fields
 * @returns {StyleComparisonGroup}
 */
const comparison = (fields) => ({
    type: 'state',
    name: fields.id,
    roleIndex: 0,
    shortLabel: null,
    averages: {},
    ...fields,
});

/**
 * @param {{groupAverages?: {[domainId: string]: number}, comparisons?: StyleComparisonGroup[]}} [averages]
 * @returns {import('../../../../../src/en/modules/charts/scatterplot/scatterZoomDomain.js').DrawnAverages}
 */
const drawn = ({ groupAverages = {}, comparisons = [] } = {}) =>
    selectDrawnAverages(DOMAIN_IDS, groupAverages, comparisons);

describe('selectDrawnAverages', () => {
    it('drops a group average that is zero on either axis (missing data sentinel)', () => {
        // A group average of 0 means "no data", not "0%": it draws no marker, and
        // must neither drag the zoom extent down nor fill a band.
        expect(drawn({ groupAverages: { ho: 45, le: 0 } }).groupAverages).toBeNull();
        expect(drawn({ groupAverages: { ho: 45, le: 10 } }).groupAverages).toEqual({
            ho: 45,
            le: 10,
        });
    });

    it('keeps a comparison group only with a finite value on both axes', () => {
        // A half-present group would otherwise widen one axis for a marker that
        // is never drawn. A 0 % group is a real value and stays.
        const groups = drawn({
            comparisons: [
                comparison({ id: 'a', domainAverages: { ho: 0, le: 50 } }),
                comparison({ id: 'b', domainAverages: { ho: 60 } }),
            ],
        }).comparisons;
        expect(groups.map((group) => group.id)).toEqual(['a']);
    });
});

describe('calculateZoomDomain', () => {
    it('pads the data extent and clamps to [0, 100]', () => {
        // x extent 30..40, y extent 50..70, padding 5 → clamp keeps everything in range
        expect(
            calculateZoomDomain(
                pts([
                    [30, 50],
                    [40, 70],
                ]),
                { domainIds: DOMAIN_IDS, paddingPP: 5 },
            ),
        ).toEqual({ xMin: 25, xMax: 45, yMin: 45, yMax: 75 });
    });

    it('never returns bounds outside 0..100 even with large padding', () => {
        // Percentages are bounded [0,100]; padding must not produce an axis
        // domain that extends past the plot area.
        expect(
            calculateZoomDomain(pts([[2, 96]]), { domainIds: DOMAIN_IDS, paddingPP: 10 }),
        ).toEqual({ xMin: 0, xMax: 12, yMin: 86, yMax: 100 });
    });

    it('includes comparison-group and positive group averages in the extent', () => {
        // state avg pushes x max to 90; group avg pushes y min to 10
        const domain = calculateZoomDomain(pts([[40, 50]]), {
            domainIds: DOMAIN_IDS,
            averages: drawn({
                comparisons: [
                    comparison({ id: 'hb', type: 'state', domainAverages: { ho: 90, le: 55 } }),
                ],
                groupAverages: { ho: 45, le: 10 },
            }),
            paddingPP: 0,
        });
        expect(domain).toEqual({ xMin: 40, xMax: 90, yMin: 10, yMax: 55 });
    });
});

describe('dataCoversAllCompetenceLevels', () => {
    // Two thresholds → three bands: [0,40], [40,70], [70,100] on each axis.
    const thresholds = { x: [40, 70], y: [40, 70] };

    it('is false when there are no thresholds (nothing to cover)', () => {
        expect(
            dataCoversAllCompetenceLevels(pts([[50, 50]]), {
                thresholds: { x: [], y: [] },
                domainIds: DOMAIN_IDS,
            }),
        ).toBe(false);
    });

    it('is true when at least one point falls in every band on both axes', () => {
        // One per band on each axis.
        const data = pts([
            [10, 20],
            [50, 55],
            [80, 90],
        ]);
        expect(dataCoversAllCompetenceLevels(data, { thresholds, domainIds: DOMAIN_IDS })).toBe(
            true,
        );
    });

    it('is false when a band is empty on an axis (zoom would then help)', () => {
        // Zoom stays available while the data misses a band; it is suppressed only
        // when every band is already covered. The middle band [40,70] is empty on both axes.
        const data = pts([
            [10, 20],
            [80, 90],
        ]);
        expect(dataCoversAllCompetenceLevels(data, { thresholds, domainIds: DOMAIN_IDS })).toBe(
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
            dataCoversAllCompetenceLevels(data, {
                thresholds,
                domainIds: DOMAIN_IDS,
                averages: drawn({
                    comparisons: [
                        comparison({ id: 'hb', type: 'state', domainAverages: { ho: 55, le: 50 } }),
                    ],
                }),
            }),
        ).toBe(true);
    });

    it('counts every comparison group, not just the first', () => {
        // A payload can carry several Landesschnitte, one per track. The
        // coverage check decides whether the zoom button is offered at all, so
        // considering only one group would suppress zoom on a partial view of the data.
        // The middle band is empty on both axes.
        const data = pts([
            [10, 20],
            [80, 90],
        ]);
        expect(
            dataCoversAllCompetenceLevels(data, {
                thresholds,
                domainIds: DOMAIN_IDS,
                averages: drawn({
                    comparisons: [
                        comparison({
                            id: 'nw-gy',
                            type: 'state',
                            domainAverages: { ho: 80, le: 90 },
                        }),
                        comparison({
                            id: 'nw-msa',
                            type: 'state',
                            domainAverages: { ho: 55, le: 50 },
                        }),
                    ],
                }),
            }),
        ).toBe(true);
    });
});
