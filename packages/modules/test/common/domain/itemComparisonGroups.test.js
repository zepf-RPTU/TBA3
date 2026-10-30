/**
 * The comparison groups of items.json, as both item lollipops receive them: one entry per
 * payload id with its per-item means, and an ordinal among the groups of its role.
 */

import { describe, it, expect } from 'vitest';
import { comparisonItemGroups } from '../../../src/common/domain/itemComparisonGroups.js';
import { itemRecord } from '../../support/groupDocumentStoreFixture.js';

/** @typedef {import('../../../src/common/data/schemas/items.js').ItemsValueGroup} ItemsValueGroup */

const ITEM_A = 'EL1';
const ITEM_B = 'EL2';

/**
 * An `items.json` value group of one domain, which the grouping does not read.
 * @param {{id: string, type: string, name: string, items: ItemsValueGroup['items']}} fields
 * @returns {ItemsValueGroup}
 */
const itemsValueGroup = (fields) => ({ domain: { id: 'le', name: 'Lesen' }, ...fields });

describe('comparisonItemGroups', () => {
    /**
     * A comparison value group with one item mean.
     * @param {{id: string, type?: string, name?: string, mean?: number, iqbId?: string}} fields
     * @returns {ItemsValueGroup}
     */
    const comparisonValueGroup = ({ id, type = 'state', name = id, mean = 0.5, iqbId = ITEM_A }) =>
        itemsValueGroup({ id, type, name, items: [itemRecord(iqbId, mean)] });

    it('keeps one item mean map per delivered comparison group id', () => {
        // The item lollipops may receive several Landesschnitt tracks. Their
        // item means must remain addressable by payload id so the chart can draw one
        // marker series per track instead of collapsing to the first state.
        const groups = comparisonItemGroups([
            comparisonValueGroup({ id: 'school', type: 'school', mean: 0.61 }),
            comparisonValueGroup({ id: 'nw-gy', mean: 0.58 }),
            comparisonValueGroup({ id: 'nw-msa', mean: 0.51 }),
        ]);

        expect(groups.map((g) => g.id)).toEqual(['school', 'nw-gy', 'nw-msa']);
        expect(groups[0].meanMap.get(ITEM_A)).toBeCloseTo(61, 10);
        expect(groups[1].meanMap.get(ITEM_A)).toBeCloseTo(58, 10);
        expect(groups[2].meanMap.get(ITEM_A)).toBeCloseTo(51, 10);
    });

    it('keeps name and type, and numbers the groups that share a role', () => {
        // The lollipop draws every group items.json carries, including one
        // aggregations.json does not list — its legend, tooltip and ⌀ entry need the
        // name and role from this document, and several Landesschnitte their L1/L2.
        const groups = comparisonItemGroups([
            comparisonValueGroup({ id: 'school', type: 'school', name: 'Schulschnitt' }),
            comparisonValueGroup({ id: 'nw-gy', name: 'Landesschnitt GY' }),
            comparisonValueGroup({ id: 'nw-msa', name: 'Landesschnitt MSA' }),
        ]);

        expect(
            groups.map(({ id, type, name, shortLabel }) => ({ id, type, name, shortLabel })),
        ).toEqual([
            { id: 'school', type: 'school', name: 'Schulschnitt', shortLabel: null },
            { id: 'nw-gy', type: 'state', name: 'Landesschnitt GY', shortLabel: 'L1' },
            { id: 'nw-msa', type: 'state', name: 'Landesschnitt MSA', shortLabel: 'L2' },
        ]);
    });

    it("merges a group's domain value groups into one group", () => {
        // Items.json ships every comparison group once per domain. Unmerged, the
        // chart would draw two series with one toggle id, each holding half the items.
        const groups = comparisonItemGroups([
            comparisonValueGroup({ id: 'school', type: 'school', iqbId: ITEM_A, mean: 0.4 }),
            comparisonValueGroup({ id: 'school', type: 'school', iqbId: ITEM_B, mean: 0.6 }),
        ]);

        expect(groups).toHaveLength(1);
        expect([...groups[0].meanMap.keys()]).toEqual([ITEM_A, ITEM_B]);
    });

    it('keeps an unrecognised comparison item group type rather than rejecting it', () => {
        // The spec's `type` is an open string, so an exporter may ship a comparison
        // population this client has no specific styling for. It draws with the catch-all
        // marker; refusing it would take the item view down over a value group the chart can
        // render.
        const groups = comparisonItemGroups([
            comparisonValueGroup({ id: 'district', type: 'district', mean: 0.44 }),
        ]);

        expect(groups.map((g) => g.id)).toEqual(['district']);
        expect(groups[0].meanMap.get(ITEM_A)).toBeCloseTo(44, 10);
    });

    it('leaves out a group without any item mean, before numbering the rest', () => {
        // A group with no values would get a legend row, a ⌀ toggle and an ordinal
        // for a series that draws nothing.
        const groups = comparisonItemGroups([
            itemsValueGroup({ id: 'empty', type: 'state', name: 'Landesschnitt GY', items: [] }),
            comparisonValueGroup({ id: 'nw-msa', name: 'Landesschnitt MSA' }),
            comparisonValueGroup({ id: 'nw-hs', name: 'Landesschnitt HS' }),
        ]);

        expect(groups.map(({ id, shortLabel }) => ({ id, shortLabel }))).toEqual([
            { id: 'nw-msa', shortLabel: 'L1' },
            { id: 'nw-hs', shortLabel: 'L2' },
        ]);
    });

    it('numbers every unrecognised type through one ordinal sequence', () => {
        // They all draw the same catch-all mark from one base colour, so restarting
        // the ordinal per raw type would put `V1` on two different populations — the
        // chart has no legend, so that label is all the reader has.
        const averages = comparisonItemGroups([
            comparisonValueGroup({
                id: 'district',
                type: 'district',
                name: 'Bezirksschnitt',
                mean: 0.5,
            }),
            comparisonValueGroup({
                id: 'region',
                type: 'region',
                name: 'Regionsschnitt',
                mean: 0.4,
            }),
        ]);

        expect(averages.map((average) => average.shortLabel)).toEqual(['V1', 'V2']);
        expect(averages.map((average) => average.roleIndex)).toEqual([0, 1]);
    });
});
