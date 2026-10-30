import { describe, expect, it } from 'vitest';

import { layoutDomains } from '../../../../../src/ma/modules/charts/itemSuccessLollipop/itemSuccessLollipopLayout.js';
import { required } from '../../../../support/required.js';

/**
 * @param {string} domainLabel - The item's Leitidee.
 * @param {string} name - Also its exercise.
 * @returns {import('../../../../../src/ma/modules/charts/itemSuccessLollipop/itemSuccessLollipopChart.js').ItemSuccessItem}
 */
const item = (domainLabel, name) => ({
    iqbId: `${domainLabel}-${name}`,
    name,
    exerciseName: name,
    domainLabel,
    meanPercentage: 50,
    competenceLevel: 'II',
});

describe('MA item lollipop — item order and spacing', () => {
    it('keeps the order of the item records: Leitideen as the payload lists them, items in booklet order', () => {
        // The item table and the ring grid show the payload's Leitidee order and
        // the booklet's item order; an alphabetical chart beside them reads as a
        // different set, and a string sort puts item 10 before item 2.
        const records = [
            item('Zahlen und Operationen', '2'),
            item('Zahlen und Operationen', '10'),
            item('Größen und Messen', '1'),
            item('Daten, Häufigkeit und Wahrscheinlichkeit', '3'),
        ];

        const { x, spans } = layoutDomains(records, 100);
        const xs = records.map((record) => required(x.get(record.iqbId), record.iqbId));

        expect(xs).toEqual([...xs].sort((a, b) => a - b));
        expect(spans.map((span) => span.domain)).toEqual([
            'Zahlen und Operationen',
            'Größen und Messen',
            'Daten, Häufigkeit und Wahrscheinlichkeit',
        ]);
    });

    it('spaces items one pitch apart, Leitideen and edges two', () => {
        // 4 items in 3 Leitideen: 4 + 3 + 2 = 9 pitches across the plot.
        const records = [item('A', '1'), item('A', '2'), item('B', '3'), item('C', '4')];

        const { x, spans } = layoutDomains(records, 90);

        expect(records.map((record) => x.get(record.iqbId))).toEqual([20, 30, 50, 70]);
        expect(spans).toEqual([
            { domain: 'A', x0: 20, x1: 30 },
            { domain: 'B', x0: 50, x1: 50 },
            { domain: 'C', x0: 70, x1: 70 },
        ]);
    });
});
