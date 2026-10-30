import { describe, it, expect } from 'vitest';
import { computePilotSolutionFrequency } from '../../../src/common/domain/pilotSolutionFrequency.js';

describe('computePilotSolutionFrequency benchmark selection', () => {
    // Order Gymnasium → NonGymnasium → PrimarySchool: EN items fill Gymnasium,
    // MA items only PrimarySchool.
    it.each([
        ['EN shape: Gymnasium wins', [0.98, 0.95, undefined], 0.98],
        ['MA shape: falls through to PrimarySchool', [undefined, undefined, 0.77], 0.77],
        ['only NonGymnasium populated', [undefined, 0.42, undefined], 0.42],
    ])('returns the first benchmark field present (%s)', (_, [gym, nonGym, primary], expected) => {
        expect(
            computePilotSolutionFrequency(
                {
                    solutionFrequencyGymnasium: gym,
                    solutionFrequencyNonGymnasium: nonGym,
                    solutionFrequencyPrimarySchool: primary,
                },
                0.5,
            ).pilotSolutionFrequency,
        ).toBe(expected);
    });

    it('returns null for missing parameters', () => {
        expect(computePilotSolutionFrequency(undefined, 0.5).pilotSolutionFrequency).toBeNull();
    });
});

describe('computePilotSolutionFrequency', () => {
    it('reports a positive difference (in pp) when the group beats the benchmark', () => {
        // mean 0.85 vs benchmark 0.77 → +8pp; sign matters for the green/red colouring.
        const { pilotSolutionFrequency, pilotSolutionFrequencyDiff } =
            computePilotSolutionFrequency({ solutionFrequencyPrimarySchool: 0.77 }, 0.85);
        expect(pilotSolutionFrequency).toBe(0.77);
        expect(pilotSolutionFrequencyDiff).toBe(8);
    });

    it('reports a negative difference when the group underperforms', () => {
        const { pilotSolutionFrequencyDiff } = computePilotSolutionFrequency(
            { solutionFrequencyGymnasium: 0.9 },
            0.6,
        );
        expect(pilotSolutionFrequencyDiff).toBe(-30);
    });

    it('leaves the difference null when no benchmark is available', () => {
        const { pilotSolutionFrequency, pilotSolutionFrequencyDiff } =
            computePilotSolutionFrequency({}, 0.5);
        expect(pilotSolutionFrequency).toBeNull();
        expect(pilotSolutionFrequencyDiff).toBeNull();
    });
});
