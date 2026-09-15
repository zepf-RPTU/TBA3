import { describe, expect, it, vi } from 'vitest';

import {
    buildItemArray,
    buildItemComparisonAverage,
    buildItemComparisonAverages,
    mapItemComparisonAverageData,
} from '../../../../src/ma/utils/maItemDataAdapter.js';

describe('buildItemArray', () => {
    // One class row of items.json: a Leitidee with two items whose means disagree with
    // their result counts, as real payloads' means and counts can.
    const itemsDocument = [
        {
            id: 'g1',
            type: 'group',
            domain: { id: 'zo', name: 'Zahlen und Operationen' },
            items: [
                { iqbId: 'A1', name: '1a', descriptiveStatistics: { mean: 0.9 }, parameters: {} },
                { iqbId: 'A2', name: '1b', descriptiveStatistics: { mean: 0.5 }, parameters: {} },
            ],
        },
    ];
    const bucket = (value, frequency, total) => ({
        type: 'Ergebnis',
        value,
        descriptiveStatistics: { frequency, total },
    });
    // items_aggregation.json covers A1 only.
    const itemAggregation = [
        {
            id: 'A1',
            aggregations: [
                bucket('Richtig', 1, 4),
                bucket('Falsch', 2, 4),
                bucket('Unbearbeitet', 1, 4),
            ],
        },
    ];

    const [covered, uncovered] = buildItemArray(itemsDocument, [], itemAggregation);

    it('draws all three bar shares from the result counts, never the correct share from the mean', () => {
        // WHY: the mean said 90 % where the counts said 1 of 4. A bar mixing the two
        // summed to 165 % and was normalised into a picture of neither.
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

    it('keeps the payload mean apart for the lollipop, which sets it beside other means', () => {
        expect(covered.meanPercentage).toBeCloseTo(90, 10);
    });

    it('leaves the shares missing for an item the per-item aggregation does not cover', () => {
        // WHY: without counts the record kept the mean as "Richtig" and 0 % for the rest,
        // which the bar normalised into a full green bar.
        expect(uncovered).toMatchObject({
            total: 0,
            percentageCorrect: null,
            percentageIncorrect: null,
            percentageNotAttempted: null,
        });
        expect(uncovered.meanPercentage).toBeCloseTo(50, 10);
    });
});

const group = ({ id = 'nw-g', type = 'state', name = 'Landesschnitt GY', items = [] } = {}) => ({
    id,
    type,
    name,
    items,
});

const item = (iqbId, mean) => ({
    iqbId,
    descriptiveStatistics: { mean },
});

describe('MA item comparison averages', () => {
    it('keeps comparison group identity while converting means to percentages', () => {
        // WHY: the lollipop legend names a reference population. Reducing the payload to
        // a bare map loses "Landesschnitt GY" and forces the chart back to a generic label.
        const average = buildItemComparisonAverage([
            group({ items: [item('A1', 0.375), item('A2', 0.8)] }),
        ]);

        expect(average).toMatchObject({ id: 'nw-g', type: 'state', name: 'Landesschnitt GY' });
        expect(average.means.get('A1')).toBeCloseTo(37.5, 10);
        expect(average.means.get('A2')).toBeCloseTo(80, 10);
    });

    it('keeps every delivered comparison group addressable by payload id', () => {
        // WHY: multi-state exports carry alternative Landesschnitte. The item lollipop
        // should render each group it has item means for, not pick the first state row.
        const averages = buildItemComparisonAverages([
            group({ id: 'school', type: 'school', name: 'Schulschnitt', items: [item('A1', 0.6)] }),
            group({ id: 'nw-g', name: 'Landesschnitt GY', items: [item('A1', 0.5)] }),
            group({ id: 'nw-m', name: 'Landesschnitt MSA', items: [item('A1', 0.4)] }),
        ]);

        expect(averages.map((average) => average.id)).toEqual(['school', 'nw-g', 'nw-m']);
        expect(averages.map((average) => average.name)).toEqual([
            'Schulschnitt',
            'Landesschnitt GY',
            'Landesschnitt MSA',
        ]);
        // The ordinal runs within a type, never across the list. This chart has no
        // legend and paints both state markers from one base colour, so the ordinal in
        // the dropdown/tooltip is what names the shade — numbering the lone
        // Schulschnitt as "S1" here, or the first Landesschnitt as "L2", would point
        // the reader at the wrong mark.
        expect(averages.map((average) => average.shortLabel)).toEqual([null, 'L1', 'L2']);
        expect(averages.map((average) => average.typeIndex)).toEqual([0, 0, 1]);
    });

    it('leaves the short label off when a type delivers a single group', () => {
        // WHY: the ordinal exists to disambiguate. A lone Landesschnitt gets none, so
        // every currently shipped single-state dataset renders exactly as before.
        const averages = buildItemComparisonAverages([
            group({ id: 'school', type: 'school', name: 'Schulschnitt', items: [item('A1', 0.6)] }),
            group({ id: 'nw-g', name: 'Landesschnitt GY', items: [item('A1', 0.5)] }),
        ]);

        expect(averages.map((average) => average.shortLabel)).toEqual([null, null]);
    });

    it('rejects comparison groups without a payload name', () => {
        expect(() =>
            buildItemComparisonAverage([group({ name: '', items: [item('A1', 0.5)] })]),
        ).toThrow(/comparison group.*name/i);
    });

    it('keeps an unrecognised comparison group type rather than rejecting it', () => {
        // WHY: the chart defines specific styling for school/state populations, but the
        // spec's `type` is an open string. Rejecting an unrecognised comparison
        // population took the whole item view down over a row that the catch-all marker
        // can draw perfectly well. The payload's own type is preserved — the role it
        // renders as is resolved at draw time, not baked in here.
        const average = buildItemComparisonAverage([
            group({
                id: 'district',
                type: 'district',
                name: 'Bezirksschnitt',
                items: [item('A1', 0.5)],
            }),
        ]);

        expect(average).toMatchObject({ id: 'district', type: 'district', name: 'Bezirksschnitt' });
        expect(average.means.get('A1')).toBeCloseTo(50, 10);
    });

    it('rejects a comparison group with no type at all', () => {
        // WHY: an unrecognised type extends the vocabulary; a missing one is a malformed
        // export. Drawing it as the catch-all would hide that behind a plausible mark.
        expect(() =>
            buildItemComparisonAverage([
                group({ id: 'mystery', type: '', name: 'Unbekannt', items: [item('A1', 0.5)] }),
            ]),
        ).toThrow(/missing required type/i);
    });

    it('numbers every unrecognised type through one ordinal sequence', () => {
        // WHY: they all draw the same catch-all mark from one base colour, so restarting
        // the ordinal per raw type would put `V1` on two different populations — the
        // chart has no legend, so that label is all the reader has.
        const averages = buildItemComparisonAverages([
            group({
                id: 'district',
                type: 'district',
                name: 'Bezirksschnitt',
                items: [item('A1', 0.5)],
            }),
            group({
                id: 'region',
                type: 'region',
                name: 'Regionsschnitt',
                items: [item('A1', 0.4)],
            }),
        ]);

        expect(averages.map((average) => average.shortLabel)).toEqual(['V1', 'V2']);
        expect(averages.map((average) => average.typeIndex)).toEqual([0, 1]);
    });

    it('omits item markers with missing comparison values instead of copying class percentages', () => {
        // WHY: a missing comparison value is absence, not "exactly equal to the class".
        // Copying `item.percentage` draws a plausible but fabricated average marker.
        const warn = vi.fn();
        const average = buildItemComparisonAverage([group({ items: [item('A1', 0.5)] })]);
        const rows = mapItemComparisonAverageData(
            average,
            [
                { iqbId: 'A1', percentage: 80, name: 'Task 1' },
                { iqbId: 'A2', percentage: 70, name: 'Task 2' },
            ],
            warn,
        );

        expect(rows).toEqual([{ iqbId: 'A1', percentage: 50, name: 'Task 1' }]);
        expect(warn).toHaveBeenCalledWith(average, 'A2');
    });
});
