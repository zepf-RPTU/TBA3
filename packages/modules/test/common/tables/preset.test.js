import { describe, it, expect } from 'vitest';
import { resolvePreset } from '../../../src/common/tables/preset.js';
import { createTestContext } from '../../support/glossaryFixture.js';

/**
 * A table declares its presets by key; their copy is the entry of that key under the
 * table's interface texts, one convention for label, tooltip and unavailable reason.
 */

const SORT = /** @type {const} */ ({ column: 'name', dir: 'asc' });
const glossary = createTestContext('ma').glossary;

describe('resolvePreset', () => {
    it("reads the label, and the tooltip where the preset's entry has one", () => {
        expect(
            resolvePreset(glossary, 'ma.student.student-item-table.interface', {
                key: 'below-competence-level',
                sort: SORT,
            }),
        ).toEqual({
            sort: SORT,
            label: 'Unter KS',
            tooltipText:
                'Nicht gelöste Teilaufgaben unterhalb der erreichten Kompetenzstufe anzeigen.',
        });
        expect(
            resolvePreset(glossary, 'ma.group.group-table.interface', {
                key: 'best-five',
                sort: SORT,
            }),
        ).toEqual({ sort: SORT, label: 'Stärkste 5' });
    });

    it('names why an unavailable preset is ruled out', () => {
        expect(
            resolvePreset(glossary, 'ma.group.group-table.interface', {
                key: 'near-boundary',
                sort: SORT,
                unavailable: true,
            }).unavailableReason,
        ).toBe(
            'Wählen Sie den Aufgabenpool „Gesamt“: Für einzelne Leitideen gibt es keine Kompetenzstufen.',
        );
    });
});
