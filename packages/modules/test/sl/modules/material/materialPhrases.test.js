import { describe, it, expect } from 'vitest';
import {
    groupSpreadWords,
    previousYearWord,
    selfEfficacyWord,
    stateDeltaWord,
    surveySpreadWord,
    teachingQualityWord,
} from '../../../../src/sl/modules/material/materialPhrases.js';

/**
 * The judging words of the Material prose are claims about the school, so each
 * threshold is pinned at its boundary: one step either way changes what a Schulleitung
 * reads.
 */
describe('material phrases', () => {
    it('calls a Δ to the Landesmittel of 5 pp or more "deutlich", either way', () => {
        expect(stateDeltaWord(0.049)).toBe('etwas');
        expect(stateDeltaWord(0.05)).toBe('deutlich');
        expect(stateDeltaWord(-0.05)).toBe('deutlich');
    });

    it('words the group spread of the Lösungsquote at 10 and 20 pp', () => {
        expect(groupSpreadWords(0.099)).toEqual({ spread: 'kaum', homogeneity: 'eher homogen' });
        expect(groupSpreadWords(0.1)).toEqual({
            spread: 'moderat',
            homogeneity: 'eher heterogen',
        });
        expect(groupSpreadWords(0.2)).toEqual({ spread: 'deutlich', homogeneity: 'heterogen' });
    });

    it('words a survey spread at 0.3 and 0.6 scale points', () => {
        expect(surveySpreadWord(0.29)).toBe('kaum');
        expect(surveySpreadWord(0.3)).toBe('moderat');
        expect(surveySpreadWord(0.6)).toBe('deutlich');
    });

    it('splits the 1–5 rating scale into thirds', () => {
        expect(teachingQualityWord(2.3)).toBe('schlecht');
        expect(teachingQualityWord(2.4)).toBe('mittelmäßig');
        expect(teachingQualityWord(3.7)).toBe('gut');
        expect(selfEfficacyWord(1)).toBe('gering');
        expect(selfEfficacyWord(3)).toBe('moderat');
        expect(selfEfficacyWord(5)).toBe('hoch');
    });

    it('calls a change within ±2 pp to the year before "gleich"', () => {
        expect(previousYearWord(0.02)).toBe('gleich');
        expect(previousYearWord(-0.02)).toBe('gleich');
        expect(previousYearWord(0.021)).toBe('besser');
        expect(previousYearWord(-0.021)).toBe('schlechter');
    });
});
