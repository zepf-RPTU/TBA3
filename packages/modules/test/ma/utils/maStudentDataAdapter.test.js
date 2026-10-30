import { describe, expect, it } from 'vitest';

import { buildStudentItemRowsByStudent } from '../../../src/ma/utils/maStudentDataAdapter.js';

describe('buildStudentItemRowsByStudent', () => {
    /**
     * An item of Leitidee `zo`.
     * @param {{iqbId?: string, name?: string, competenceLevel?: string, results?: Array<[string, number]>}} overrides
     */
    const item = ({ results = [], ...overrides }) => ({
        iqbId: 'A1',
        name: '1a',
        exerciseName: 'Brüche',
        competenceLevel: 'III',
        domain: 'zo',
        domainLabel: 'Zahlen und Operationen',
        results: new Map(results),
        ...overrides,
    });

    it('files one row per item under each student who sat it, carrying the item metadata', () => {
        const rows = buildStudentItemRowsByStudent(
            [
                item({
                    results: [
                        ['s1', 1],
                        ['s2', -1],
                    ],
                }),
                item({ iqbId: 'A2', name: '1b', competenceLevel: 'IV', results: [['s1', 0]] }),
            ],
            [],
        );

        /**
         * @param {string} name
         * @param {string} competenceLevel - Its Aufgabenniveau.
         * @param {number} resultCode - The student's result.
         */
        const row = (name, competenceLevel, resultCode) => ({
            domainLabel: 'Zahlen und Operationen',
            exerciseName: 'Brüche',
            name,
            competenceLevel,
            resultCode,
        });
        expect(rows).toEqual(
            new Map([
                ['s1', [row('1a', 'III', 1), row('1b', 'IV', 0)]],
                ['s2', [row('1a', 'III', -1)]],
            ]),
        );
    });

    it('gives an item nobody answered no rows', () => {
        expect(buildStudentItemRowsByStudent([item({ results: [] })], [])).toEqual(new Map());
    });
});
