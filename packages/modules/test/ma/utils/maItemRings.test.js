// The item-ring grid's rings per grouping: one ring per Leitidee the booklet declares (a
// Leitidee without items as an empty placeholder), and one per value of each competence
// type the items carry, an item in every ring whose value it carries.

import { describe, expect, it } from 'vitest';
import {
    getItemRingSets,
    resolveGrouping,
    resolveShownRing,
    ringItems,
} from '../../../src/ma/utils/maItemRings.js';

// 3 items across 2 populated domains (zo: 2, gm: 1); 'rf' is declared but empty.
const itemArray = [
    { iqbId: 'i1', domain: 'zo', competenceGroup0: ['K1', 'K3'] },
    { iqbId: 'i2', domain: 'zo', competenceGroup0: ['K3'] },
    { iqbId: 'i3', domain: 'gm', competenceGroup0: ['K1'] },
];

const domains = [
    { domain: 'zo', domainLabel: 'Zahlen und Operationen' },
    { domain: 'gm', domainLabel: 'Größen und Messen' },
    { domain: 'rf', domainLabel: 'Raum und Form' },
];

/** @type {import('../../../src/ma/utils/maCompetenceGroupings.js').MaCompetenceGrouping[]} */
const groupings = [
    { type: 'Allgemeine Kompetenz', field: 'competenceGroup0', values: ['K1', 'K3', 'K6'] },
];

describe('getItemRingSets', () => {
    const sets = getItemRingSets(domains, groupings, itemArray);

    it('offers the Leitidee first, then each competence type', () => {
        expect(sets.groupings.map(({ id, label }) => ({ id, label }))).toEqual([
            { id: 'leitidee', label: 'Leitidee' },
            { id: 'competenceGroup0', label: 'Allgemeine Kompetenz' },
        ]);
    });

    it('holds the whole-booklet "Gesamt" ring once, apart from the groupings', () => {
        expect(sets.total).toMatchObject({ id: 'all', title: 'Gesamt', isEmpty: false });
        expect([...sets.total.iqbIds]).toEqual(['i1', 'i2', 'i3']);
    });

    it('keeps a ring for a Leitidee without items, flagged empty', () => {
        // A Leitidee the booklet declares but does not test is information: dropping it
        // would hide that it was considered.
        const { rings } = sets.groupings[0];
        expect(rings.map((def) => def.id)).toEqual(['zo', 'gm', 'rf']);
        expect(rings.find((def) => def.id === 'rf')).toMatchObject({
            title: 'Raum und Form',
            isEmpty: true,
        });
    });

    it('puts an item into every ring whose value it carries', () => {
        const { rings } = sets.groupings[1];
        expect(rings.map(({ title, iqbIds }) => [title, [...iqbIds]])).toEqual([
            ['K1', ['i1', 'i3']],
            ['K3', ['i1', 'i2']],
            ['K6', []],
        ]);
        expect(rings[2].isEmpty).toBe(true);
        // Ids are unique within the grid and safe in a selector.
        expect(rings.map((ring) => ring.id)).toEqual([
            'competenceGroup0-0',
            'competenceGroup0-1',
            'competenceGroup0-2',
        ]);
    });

    it('offers only the Leitidee when the items carry no competences', () => {
        expect(getItemRingSets(domains, [], itemArray).groupings.map(({ id }) => id)).toEqual([
            'leitidee',
        ]);
    });
});

describe('resolveGrouping and ringItems', () => {
    const sets = getItemRingSets(domains, groupings, itemArray);

    it('falls back to the Leitidee for a grouping the payload does not carry', () => {
        expect(resolveGrouping(sets, 'competenceGroup0')).toBe(sets.groupings[1]);
        expect(resolveGrouping(sets, 'competenceGroup7')).toBe(sets.groupings[0]);
        expect(resolveGrouping(sets, null)).toBe(sets.groupings[0]);
    });

    it("selects a ring's items in input order", () => {
        const [k1] = sets.groupings[1].rings;
        expect(ringItems(itemArray, k1).map((item) => item.iqbId)).toEqual(['i1', 'i3']);
    });
});

// The grid's selection and the focus card resolve the ring they show here, so both show
// the same one: the requested ring while it carries items, else the first that does.
describe('resolveShownRing', () => {
    const sets = getItemRingSets(domains, groupings, itemArray);

    it('shows the first Leitidee that carries items when none is requested', () => {
        expect(resolveShownRing(sets, null, null)).toMatchObject({
            grouping: { id: 'leitidee' },
            ringId: 'zo',
        });
    });

    it('never shows an empty Leitidee, even when it is requested', () => {
        // Showing it would drive the focus chart and the item table to zero items.
        expect(resolveShownRing(sets, 'leitidee', 'rf').ringId).toBe('zo');
    });

    it('keeps a requested ring that carries items, as the dataset object', () => {
        const shown = resolveShownRing(sets, 'leitidee', 'gm');
        expect(shown.ringId).toBe('gm');
        expect(shown.ring).toBe(sets.groupings[0].rings[1]);
    });

    it('falls back for a ring of another grouping, and to the Leitidee for an unknown grouping', () => {
        expect(resolveShownRing(sets, 'competenceGroup0', 'gm').ringId).toBe('competenceGroup0-0');
        expect(resolveShownRing(sets, 'unknown', 'gm').ringId).toBe('gm');
    });

    it('shows nothing when no ring carries items', () => {
        const empty = getItemRingSets(domains, [], []);
        expect(resolveShownRing(empty, null, null)).toMatchObject({ ring: null, ringId: null });
    });
});
