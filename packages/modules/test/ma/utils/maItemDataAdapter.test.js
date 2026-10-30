import {
    comparisonItemGroups,
    mapItemComparisonAverageData,
} from '../../../src/common/domain/itemComparisonGroups.js';
import { describe, expect, it } from 'vitest';

import { buildItemArray } from '../../../src/ma/utils/maItemDataAdapter.js';
import { itemRecord } from '../../support/groupDocumentStoreFixture.js';

/** @typedef {import('../../../src/common/data/schemas/items.js').ItemsValueGroup} ItemsValueGroup */
/** @typedef {import('../../../src/common/data/schemas/aggregations.js').AggregationsValueGroup} AggregationsValueGroup */

describe('buildItemArray', () => {
    // One group value group of items.json: a Leitidee with two items whose means disagree with
    // their result counts, as a payload's means and counts can.
    /** @type {ItemsValueGroup[]} */
    const itemsDocument = [
        {
            id: 'g1',
            type: 'group',
            name: '3a',
            domain: { id: 'zo', name: 'Zahlen und Operationen' },
            items: [
                {
                    iqbId: 'A1',
                    name: '1a',
                    position: 1,
                    exercise: { name: 'Aufgabe 1' },
                    descriptiveStatistics: { mean: 0.9, total: 10, frequency: 9 },
                    parameters: { competenceLevel: { id: '1', nameShort: 'I' } },
                },
                {
                    iqbId: 'A2',
                    name: '1b',
                    position: 2,
                    exercise: { name: 'Aufgabe 1' },
                    descriptiveStatistics: { mean: 0.5 },
                    parameters: { competenceLevel: { id: '1', nameShort: 'I' } },
                },
            ],
        },
    ];
    /**
     * @param {string} value - The result bucket.
     * @param {number} frequency - Its responses.
     * @param {number} total - All responses to the item.
     * @returns {AggregationsValueGroup['aggregations'][number]}
     */
    const bucket = (value, frequency, total) => ({
        type: 'result',
        value,
        descriptiveStatistics: { frequency, total, mean: frequency / total },
    });
    // items-aggregations.json covers A1 only.
    /** @type {AggregationsValueGroup[]} */
    const itemAggregation = [
        {
            id: 'A1',
            type: 'item',
            name: 'A1',
            aggregations: [
                bucket('Richtig', 1, 4),
                bucket('Falsch', 2, 4),
                bucket('Unbearbeitet', 1, 4),
            ],
        },
    ];

    const [covered, uncovered] = buildItemArray(itemsDocument, [], itemAggregation, []);

    it('draws all three bar shares from the result counts, never the correct share from the mean', () => {
        // The mean says 90 % where the counts say 1 of 4. A bar mixing the two
        // would sum to 165 % and be normalised into a picture of neither.
        expect(covered).toMatchObject({
            total: 4,
            correctCount: 1,
            incorrectCount: 2,
            notAttemptedCount: 1,
            percentageCorrect: 25,
            percentageIncorrect: 50,
            percentageNotAttempted: 25,
        });
    });

    it("takes the ring's group counts from items.json, apart from the per-item aggregation", () => {
        // The item rings read only items.json. Its own total and frequency are the
        // group figures; a missing pair reads 0 so the ring keeps the item out of its rate.
        expect(covered).toMatchObject({ responseCount: 10, solvedCount: 9 });
        expect(uncovered).toMatchObject({ responseCount: 0, solvedCount: 0 });
    });

    it('keeps the payload mean apart for the lollipop, which sets it beside other means', () => {
        expect(covered.meanPercentage).toBeCloseTo(90, 10);
    });

    it('leaves the shares missing for an item the per-item aggregation does not cover', () => {
        // Without counts, keeping the mean as "Richtig" and 0 % for the rest would
        // let the bar normalise them into a full green bar.
        expect(uncovered).toMatchObject({
            total: 0,
            percentageCorrect: null,
            percentageIncorrect: null,
            percentageNotAttempted: null,
        });
        expect(uncovered.meanPercentage).toBeCloseTo(50, 10);
    });
});

/**
 * One comparison value group of items.json.
 * @param {Partial<ItemsValueGroup>} [valueGroup]
 * @returns {ItemsValueGroup}
 */
const group = ({ id = 'nw-g', type = 'state', name = 'Landesschnitt GY', items = [] } = {}) => ({
    id,
    type,
    name,
    domain: { id: 'zo', name: 'Zahlen und Operationen' },
    items,
});

describe('mapItemComparisonAverageData', () => {
    it('omits item markers with missing comparison values instead of copying group percentages', () => {
        // A missing comparison value is absence, not "exactly equal to the group".
        // Copying `item.percentage` draws a plausible but fabricated average marker.
        const [average] = comparisonItemGroups([group({ items: [itemRecord('A1', 0.5)] })]);
        const rows = mapItemComparisonAverageData(average, [
            { iqbId: 'A1', percentage: 80, name: 'Item 1' },
            { iqbId: 'A2', percentage: 70, name: 'Item 2' },
        ]);

        expect(rows).toEqual([{ iqbId: 'A1', percentage: 50, name: 'Item 1' }]);
    });
});
