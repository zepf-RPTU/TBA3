/**
 * The trait label registry's lifecycle. `extractTraits` fills it as a side effect of
 * reading a student's covariates, so nothing in the app ever empties it — a host that
 * outlives its data needs `resetTraitRegistry()` to stop answering with labels the
 * current dataset never delivered.
 */

import { describe, expect, it } from 'vitest';

import {
    extractTraits,
    getTraitLabel,
    resetTraitRegistry,
} from '@tba3/modules/common/domain/traitRegistry.js';

const trait = (value, label) => ({ type: 'trait', value, label });

describe('resetTraitRegistry', () => {
    it('drops labels a previous dataset registered', () => {
        extractTraits([trait('zeit', 'Verlängerte Bearbeitungszeit')]);
        expect(getTraitLabel('zeit')).toBe('Verlängerte Bearbeitungszeit');

        resetTraitRegistry();

        expect(getTraitLabel('zeit')).toBeNull();
    });

    it('leaves the registry usable, not broken', () => {
        extractTraits([trait('vorlesen', 'Vorlesen')]);
        resetTraitRegistry();

        const codes = extractTraits([trait('vorlesen', 'Text wird vorgelesen')]);

        expect([...codes]).toEqual(['vorlesen']);
        expect(getTraitLabel('vorlesen')).toBe('Text wird vorgelesen');
    });
});
