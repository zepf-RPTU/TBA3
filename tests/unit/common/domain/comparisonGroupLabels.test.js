import { describe, it, expect } from 'vitest';
import {
    ordinalShortLabel,
    disambiguatingShortLabel,
    buildLegendLabelSegments,
    resolveAverageRole,
    SHORT_LABEL_PREFIX_BY_TYPE,
} from '@tba3/modules/common/domain/comparisonGroupLabels.js';

/**
 * WHY: a payload can deliver several comparison groups of the same type — nw
 * splits its Landesschnitt by Abschlusstrack — and they share one marker shape
 * and one base colour. The ordered short label is what the reader matches a mark
 * against, so its two variants encode a real editorial difference:
 *
 * - SL competency bars are tagged unconditionally, so a lone Landesschnitt still
 *   needs a bare `L` to be decodable against its legend pill. No SL e2e asserts
 *   that text, which is why it is pinned here.
 * - EN/MA marks gain a tag only when there is something to disambiguate. The
 *   `null` for a single group is the guarantee that every currently shipped
 *   single-Landesschnitt dataset keeps rendering exactly as it did before.
 *
 * Collapsing three copy-pasted SL ternaries onto this helper is only safe while
 * both rules stay pinned; a "simplification" that unified them would silently
 * either add noise to EN or strip SL's in-bar tags.
 */

describe('ordinalShortLabel (SL: always tagged)', () => {
    it('uses the bare prefix when a type delivers a single group', () => {
        expect(ordinalShortLabel('L', 0, 1)).toBe('L');
        expect(ordinalShortLabel('S', 0, 1)).toBe('S');
    });

    it('numbers from 1 once several groups share a type', () => {
        expect(ordinalShortLabel('L', 0, 2)).toBe('L1');
        expect(ordinalShortLabel('L', 1, 2)).toBe('L2');
        expect(ordinalShortLabel('L', 3, 4)).toBe('L4');
    });
});

describe('disambiguatingShortLabel (EN/MA: tagged only when it disambiguates)', () => {
    it('returns null for a single group so the mark renders unchanged', () => {
        expect(disambiguatingShortLabel('L', 0, 1)).toBeNull();
    });

    it('numbers from 1 once several groups share a type', () => {
        expect(disambiguatingShortLabel('L', 0, 2)).toBe('L1');
        expect(disambiguatingShortLabel('L', 1, 2)).toBe('L2');
    });

    it('differs from the SL rule only in the single-group case', () => {
        for (const [index, count] of [
            [0, 2],
            [1, 2],
            [2, 4],
        ]) {
            expect(disambiguatingShortLabel('L', index, count)).toBe(
                ordinalShortLabel('L', index, count),
            );
        }
    });
});

describe('resolveAverageRole', () => {
    /**
     * WHY: this is the one place the client decides what a value-group `type` means.
     * The spec (`value-group.yml`) types it as an open string — "z.B. group, student,
     * school" — so an exporter can ship a comparison population nobody wrote a shape
     * for. Every EN and MA chart used to enumerate school/state and throw on the rest,
     * which turned a new reference population into a blank dashboard. Collapsing the
     * unknown onto one catch-all role is what makes that additive instead.
     */
    it('passes the two roles that own a specific shape, colour and glossary term', () => {
        expect(resolveAverageRole('school')).toBe('school');
        expect(resolveAverageRole('state')).toBe('state');
    });

    it('collapses any unrecognised type onto the catch-all role', () => {
        for (const type of ['district', 'region', 'Bundesland', 'group']) {
            expect(resolveAverageRole(type)).toBe('other');
        }
    });

    it('throws on a missing or malformed type rather than calling it the catch-all', () => {
        // WHY: an unrecognised type is an extension of the vocabulary; an absent one is
        // a broken export. Drawing it as a catch-all mark would present a value-group
        // the payload never identified as a legitimate reference population.
        for (const type of [undefined, null, '', '   ', 42, {}]) {
            expect(() => resolveAverageRole(type)).toThrow(/missing a value-group type/i);
        }
    });

    it('has a short-label prefix for every role it can return', () => {
        // WHY: the ordinal is keyed on the role. A role with no prefix would yield
        // `undefined1` on the mark rather than falling back to something readable.
        for (const role of ['school', 'state', 'other']) {
            expect(typeof SHORT_LABEL_PREFIX_BY_TYPE[role]).toBe('string');
        }
    });
});

describe('buildLegendLabelSegments', () => {
    it('keeps the glossary key off the index half', () => {
        // WHY: the glossary defines "Landesschnitt", not "L1 = Landesschnitt".
        // Stamping the key over the whole string would make the index part of
        // the term and open a glossary popover on a bare ordinal.
        const segments = buildLegendLabelSegments('L1', 'Landesschnitt GY', 'landesschnitt');

        expect(segments).toEqual([
            { text: 'L1 = ', glossaryKey: null },
            { text: 'Landesschnitt GY', glossaryKey: 'landesschnitt' },
        ]);
    });

    it('leaves the label unlinked when no glossary key applies', () => {
        expect(buildLegendLabelSegments('Ma', 'Mathematik')).toEqual([
            { text: 'Ma = ', glossaryKey: null },
            { text: 'Mathematik', glossaryKey: null },
        ]);
    });
});
