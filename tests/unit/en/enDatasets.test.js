import { describe, expect, it } from 'vitest';

import { DataStore } from '../../../src/common/services/dataStore.js';
import { EN_DATA_KEYS } from '../../../src/en/enConstants.js';
import { defineEnDatasets } from '../../../src/en/enDatasets.js';
import { getEnConfig } from '../../../src/en/enConfig.js';

// WHY this file exists: the en.studentRecords compute closure used to be
// restated in four modules and the copies drifted. These tests pin the single
// authoritative wiring in enDatasets.js — inputs, transitive config
// resolution, and loud failure — at the same seam the app uses.

function makeStoreWithRawData(aggregation = []) {
    const store = new DataStore();
    defineEnDatasets(store);
    store.setRawData(EN_DATA_KEYS.COMPETENCE_LEVELS, []);
    store.setRawData(EN_DATA_KEYS.STYLE_AGGREGATION, []);
    store.setRawData(EN_DATA_KEYS.AGGREGATION, aggregation);
    store.setRawData(EN_DATA_KEYS.COMPETENCE_LEVELS_CLASS, []);
    store.setRawData(EN_DATA_KEYS.ITEMS, []);
    store.setRawData(EN_DATA_KEYS.ITEM_AGGREGATION, []);
    return store;
}

describe('defineEnDatasets', () => {
    it('builds studentRecords and itemRecords through the catalog, resolving en.config transitively', () => {
        const store = makeStoreWithRawData();

        const studentRecords = store.getDataset(EN_DATA_KEYS.STUDENT_RECORDS);
        const itemRecords = store.getDataset(EN_DATA_KEYS.ITEM_RECORDS);

        expect(Array.isArray(studentRecords)).toBe(true);
        expect(Array.isArray(itemRecords)).toBe(true);
        // The config the record datasets resolved as their input is itself a
        // catalog entry.
        expect(store.getDataset(EN_DATA_KEYS.CONFIG)).toBeDefined();
    });

    it('getEnConfig serves the same instance as the catalog', () => {
        // WHY: getEnConfig is the public read path; if it ever bypassed the
        // catalog there would again be two definitions of the same dataset.
        const store = makeStoreWithRawData();

        expect(getEnConfig(store)).toBe(store.getDataset(EN_DATA_KEYS.CONFIG));
    });

    it('fails loudly when asked before acquisition stored the raw payloads', () => {
        const store = new DataStore();
        defineEnDatasets(store);

        expect(() => store.getDataset(EN_DATA_KEYS.STUDENT_RECORDS)).toThrow(
            /en\.competenceLevels/,
        );
    });

    it('fails loudly at init on an aggregation comparison row without an id', () => {
        // WHY: the id is the comparison toggle key. A row without one would seed
        // `undefined` into the comparison state and draw a series no toggle reaches;
        // the app reads the config while it starts, so this is where it stops.
        const store = makeStoreWithRawData([
            { type: 'state', name: 'Landesschnitt', domain: { id: 'ho' }, aggregations: [] },
        ]);

        expect(() => getEnConfig(store)).toThrow(/comparison group is missing required id/);
    });

    it('rejects a second registration — one authoritative definition per dataset', () => {
        const store = new DataStore();
        defineEnDatasets(store);

        expect(() => defineEnDatasets(store)).toThrow(/already defined/);
    });
});
