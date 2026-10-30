/**
 * `readResultTypes` — the result values a payload delivers. EN's student tables read
 * it over the student aggregation, the item lollipop over the item aggregation.
 */

import { describe, expect, it } from 'vitest';

import { readResultTypes } from '../../../src/common/domain/resultAggregations.js';

/**
 * An aggregation as the schema delivers it; `readResultTypes` reads only its type and value.
 * @param {string} type
 * @param {string} value
 */
const aggregation = (type, value) => ({ type, value, descriptiveStatistics: { mean: 0 } });

const entry = (/** @type {string[]} */ ...values) => ({
    aggregations: values.map((value) => aggregation('result', value)),
});

describe('readResultTypes', () => {
    it('lists the delivered values in the fixed Richtig, Falsch, Unbearbeitet order', () => {
        // The spec fixes no order of `aggregations[]`, and one entry may omit a
        // bucket another carries; the union over all entries decides, never the first.
        const types = readResultTypes([entry('Unbearbeitet', 'Falsch'), entry('Richtig')]);

        expect(types).toEqual([
            { value: 'Richtig', glossaryKey: 'richtig', numericCode: 1 },
            { value: 'Falsch', glossaryKey: 'falsch', numericCode: 0 },
            {
                value: 'Unbearbeitet',
                glossaryKey: 'unbearbeitet',
                numericCode: -1,
            },
        ]);
    });

    it('leaves out a value no entry carries and ignores other aggregation types', () => {
        const types = readResultTypes([
            { aggregations: [aggregation('Stil', 'global')] },
            entry('Richtig'),
        ]);

        expect(types.map((type) => type.value)).toEqual(['Richtig']);
    });
});
