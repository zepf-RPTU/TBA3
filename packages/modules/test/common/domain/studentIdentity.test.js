import { describe, it, expect } from 'vitest';
import {
    sortStudentsByName,
    toStudentSelectItems,
} from '../../../src/common/domain/studentIdentity.js';

/**
 * sortStudentsByName drives a name list teachers scan visually, so German
 * collation and a stable tiebreak are what is pinned.
 */
describe('sortStudentsByName', () => {
    const student = (/** @type {string} */ lastName, /** @type {string} */ firstName) => ({
        lastName,
        firstName,
    });

    it('sorts umlauts as their base letter, not after Z', () => {
        // Default (non-locale) comparison puts 'Ä' after 'Z', which reads as
        // a bug in a German name list.
        const sorted = sortStudentsByName([student('Bauer', 'Ann'), student('Ärger', 'Ben')]);
        expect(sorted.map((s) => s.lastName)).toEqual(['Ärger', 'Bauer']);
    });

    it('falls back to the first name for identical last names', () => {
        // Siblings/namesakes must keep a deterministic order across renders.
        const sorted = sortStudentsByName([student('Müller', 'Zoe'), student('Müller', 'Ada')]);
        expect(sorted.map((s) => s.firstName)).toEqual(['Ada', 'Zoe']);
    });

    it('does not mutate the input array', () => {
        // The group arrays are shared across item records (built once per
        // aggregation payload), so sorting must not reorder them for others.
        const input = [student('Bauer', 'Ann'), student('Abel', 'Ida')];
        sortStudentsByName(input);
        expect(input.map((s) => s.lastName)).toEqual(['Bauer', 'Abel']);
    });
});

describe('toStudentSelectItems', () => {
    it('lists the students in name order, valued by id and labelled Nachname, Vorname', () => {
        // The MA app opens on the first item, so the dropdown order is also the
        // start student.
        expect(
            toStudentSelectItems([
                { studentId: 's2', lastName: 'Özdemir', firstName: 'Ada' },
                { studentId: 's1', lastName: 'Abel', firstName: 'Ida' },
            ]),
        ).toEqual([
            { value: 's1', label: 'Abel, Ida' },
            { value: 's2', label: 'Özdemir, Ada' },
        ]);
    });
});
