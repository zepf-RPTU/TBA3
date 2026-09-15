import { describe, it, expect } from 'vitest';
import {
    selectPilotierungswert,
    computePilotierung,
} from '@tba3/modules/common/domain/pilotierung.js';

describe('selectPilotierungswert', () => {
    it('returns the first non-null field in Gymnasium → NonGymnasium → PrimarySchool order', () => {
        // EN-shaped item: Gymnasium populated, PrimarySchool null → Gymnasium wins.
        expect(
            selectPilotierungswert({
                solutionFrequencyGymnasium: 0.98,
                solutionFrequencyNonGymnasium: 0.95,
                solutionFrequencyPrimarySchool: null,
            }),
        ).toBe(0.98);
    });

    it('falls through to PrimarySchool when the first two are null (MA shape)', () => {
        // MA-shaped item: only PrimarySchool populated → reproduces legacy MA behaviour.
        expect(
            selectPilotierungswert({
                solutionFrequencyGymnasium: null,
                solutionFrequencyNonGymnasium: null,
                solutionFrequencyPrimarySchool: 0.77,
            }),
        ).toBe(0.77);
    });

    it('falls through to NonGymnasium when only it is populated', () => {
        expect(
            selectPilotierungswert({
                solutionFrequencyGymnasium: null,
                solutionFrequencyNonGymnasium: 0.42,
                solutionFrequencyPrimarySchool: null,
            }),
        ).toBe(0.42);
    });

    it('returns null when all three benchmark fields are null', () => {
        expect(
            selectPilotierungswert({
                solutionFrequencyGymnasium: null,
                solutionFrequencyNonGymnasium: null,
                solutionFrequencyPrimarySchool: null,
            }),
        ).toBeNull();
    });

    it('returns null for missing parameters', () => {
        expect(selectPilotierungswert(undefined)).toBeNull();
    });
});

describe('computePilotierung', () => {
    it('reports a positive difference (in pp) when the class beats the benchmark', () => {
        // mean 0.85 vs benchmark 0.77 → +8pp; sign matters for the green/red colouring.
        const { pilotierungswert, pilotierungsDiff } = computePilotierung(
            { solutionFrequencyPrimarySchool: 0.77 },
            0.85,
        );
        expect(pilotierungswert).toBe(0.77);
        expect(pilotierungsDiff).toBe(8);
    });

    it('reports a negative difference when the class underperforms', () => {
        const { pilotierungsDiff } = computePilotierung({ solutionFrequencyGymnasium: 0.9 }, 0.6);
        expect(pilotierungsDiff).toBe(-30);
    });

    it('leaves the difference null when no benchmark is available', () => {
        const { pilotierungswert, pilotierungsDiff } = computePilotierung(
            {
                solutionFrequencyGymnasium: null,
                solutionFrequencyNonGymnasium: null,
                solutionFrequencyPrimarySchool: null,
            },
            0.5,
        );
        expect(pilotierungswert).toBeNull();
        expect(pilotierungsDiff).toBeNull();
    });
});
