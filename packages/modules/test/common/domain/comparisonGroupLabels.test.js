import { describe, it, expect } from 'vitest';
import {
    assignComparisonOrdinals,
    findOwnValueGroup,
    ordinalShortLabelsByRole,
    buildLegendLabelSegments,
    resolveAverageRole,
} from '../../../src/common/domain/comparisonGroupLabels.js';

/**
 * A payload can deliver several comparison groups of the same type (a
 * Landesschnitt split by Abschlusstrack), and they share one marker shape and one
 * base colour. The ordered short label is what the reader matches a mark against,
 * in two variants:
 *
 * - SL competence bars are tagged unconditionally, so a lone Landesschnitt still
 *   needs a bare `L` to be decodable against its legend pill. No SL e2e asserts
 *   that text, so it is pinned here.
 * - EN/MA marks gain a tag only when there is something to disambiguate. The
 *   `null` for a single group keeps a single-Landesschnitt dataset untagged.
 *
 * Unifying the two would either add noise to EN or strip SL's in-bar tags.
 */

describe('ordinalShortLabelsByRole (SL: every track tagged, numbered within its role)', () => {
    it('uses the bare prefix when a type delivers a single group', () => {
        expect(ordinalShortLabelsByRole(['state'])).toEqual(['L']);
        expect(ordinalShortLabelsByRole(['school'])).toEqual(['S']);
    });

    it('numbers from 1 once several groups share a type', () => {
        expect(ordinalShortLabelsByRole(['state', 'state'])).toEqual(['L1', 'L2']);
        expect(ordinalShortLabelsByRole(['state', 'state', 'state', 'state'])).toEqual([
            'L1',
            'L2',
            'L3',
            'L4',
        ]);
    });

    it('numbers each role on its own and folds every unknown type into one V sequence', () => {
        // The ordinal separates marks that share a role's label; two different
        // unknown types both read `V`, so they must number through one sequence.
        expect(ordinalShortLabelsByRole(['state', 'district', 'state', 'region'])).toEqual([
            'L1',
            'V1',
            'L2',
            'V2',
        ]);
        expect(ordinalShortLabelsByRole(['state', 'district'])).toEqual(['L', 'V']);
    });
});

describe('assignComparisonOrdinals (EN/MA: tagged only when it disambiguates)', () => {
    it('leaves a single group untagged so the mark renders unchanged', () => {
        const groups = [{ type: 'state' }];
        assignComparisonOrdinals(groups);

        expect(groups).toEqual([{ type: 'state', roleIndex: 0, shortLabel: null }]);
    });

    it('numbers from 1 once several groups share a type', () => {
        /** @type {Parameters<typeof assignComparisonOrdinals>[0]} */
        const groups = [{ type: 'state' }, { type: 'state' }];
        assignComparisonOrdinals(groups);

        expect(groups.map((group) => group.shortLabel)).toEqual(['L1', 'L2']);
        expect(groups.map((group) => group.roleIndex)).toEqual([0, 1]);
    });
});

describe('resolveAverageRole', () => {
    /**
     * This is the one place the client decides what a value-group `type` means.
     * The spec types it as an open string, so an exporter can ship a comparison
     * population nobody wrote a shape for. Collapsing the unknown onto one catch-all
     * role draws it, where enumerating school/state and throwing on the rest would
     * blank the dashboard.
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
});

describe('buildLegendLabelSegments', () => {
    it('keeps the glossary key off the index half', () => {
        // The glossary defines "Landesschnitt", not "L1 = Landesschnitt".
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

describe('findOwnValueGroup', () => {
    it('finds the group by its type wherever it sits, never by position', () => {
        const valueGroups = [
            { id: 'state', type: 'state' },
            { id: 'school', type: 'school' },
            { id: '8a-en', type: 'group' },
        ];

        expect(findOwnValueGroup(valueGroups)?.id).toBe('8a-en');
    });

    it("finds nothing without the group's own value group or without data", () => {
        expect(findOwnValueGroup([{ id: 'state', type: 'state' }])).toBeNull();
        expect(findOwnValueGroup([])).toBeNull();
        expect(findOwnValueGroup(undefined)).toBeNull();
    });
});
