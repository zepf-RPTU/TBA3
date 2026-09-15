import { describe, it, expect } from 'vitest';
import { DataStore } from '../../../../src/common/services/dataStore.js';

describe('DataStore', () => {
    it('stores and retrieves raw data by key', () => {
        const store = new DataStore();
        const payload = [{ id: 1 }, { id: 2 }];

        store.setRawData('en.competenceLevels', payload);

        expect(store.getRawData('en.competenceLevels')).toBe(payload);
        expect(store.getRawData('en.missing')).toBeUndefined();
    });

    it('computes a cache value once and reuses it on the second call', () => {
        const store = new DataStore();
        let computeCount = 0;
        const compute = () => {
            computeCount += 1;
            return { computed: true };
        };

        const first = store.getOrCompute('en.records', compute);
        const second = store.getOrCompute('en.records', compute);

        expect(computeCount).toBe(1);
        expect(second).toBe(first);
    });

    describe('dataset catalog', () => {
        it('computes a defined dataset from its raw inputs, in declared order', () => {
            const store = new DataStore();
            store.setRawData('t.a', [1, 2]);
            store.setRawData('t.b', [3]);
            store.defineDatasets({
                't.joined': { inputs: ['t.a', 't.b'], build: (a, b) => [...a, ...b] },
            });

            expect(store.getDataset('t.joined')).toEqual([1, 2, 3]);
        });

        it('resolves an input that is itself a defined dataset, recursively', () => {
            // WHY: chained datasets (e.g. sl.classResults <- sl.domainResults) must
            // work without any caller pre-computing the intermediate step.
            const store = new DataStore();
            store.setRawData('t.raw', 2);
            store.defineDatasets({
                't.double': { inputs: ['t.raw'], build: (n) => n * 2 },
                't.quad': { inputs: ['t.double'], build: (n) => n * 2 },
            });

            expect(store.getDataset('t.quad')).toBe(8);
        });

        it('builds once and serves the cache afterwards', () => {
            const store = new DataStore();
            let builds = 0;
            store.setRawData('t.raw', 1);
            store.defineDatasets({
                't.derived': {
                    inputs: ['t.raw'],
                    build: () => {
                        builds += 1;
                        return {};
                    },
                },
            });

            const first = store.getDataset('t.derived');
            const second = store.getDataset('t.derived');

            expect(builds).toBe(1);
            expect(second).toBe(first);
        });

        it('throws on an unknown dataset key instead of returning empty data', () => {
            // WHY: a typo'd key must fail at the call site, not render as a
            // silently empty table (the getOrCompute(key, () => []) hazard).
            const store = new DataStore();

            expect(() => store.getDataset('t.typo')).toThrow(/unknown dataset 't\.typo'/);
        });

        it('throws when a key is defined twice — one authoritative definition', () => {
            const store = new DataStore();
            store.defineDatasets({ 't.x': { inputs: [], build: () => 1 } });

            expect(() => store.defineDatasets({ 't.x': { inputs: [], build: () => 2 } })).toThrow(
                /already defined/,
            );
        });

        it('throws when an input is neither raw data nor a defined dataset', () => {
            const store = new DataStore();
            store.defineDatasets({
                't.derived': { inputs: ['t.neverStored'], build: (x) => x },
            });

            expect(() => store.getDataset('t.derived')).toThrow(/t\.neverStored/);
        });

        it('throws a named error on a circular dataset definition', () => {
            // WHY: the class promises loud, named failures for wiring mistakes;
            // a cycle must not die as an anonymous stack-overflow RangeError.
            const store = new DataStore();
            store.defineDatasets({
                't.a': { inputs: ['t.b'], build: (x) => x },
                't.b': { inputs: ['t.a'], build: (x) => x },
            });

            expect(() => store.getDataset('t.a')).toThrow(
                /circular dataset definition involving 't\.a'/,
            );
        });
    });
});
