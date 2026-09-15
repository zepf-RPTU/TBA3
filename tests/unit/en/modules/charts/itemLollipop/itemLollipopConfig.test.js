// @vitest-browser
// (createRenderer constructs a real ItemLollipopChart against a live container)

import { afterEach, describe, expect, it } from 'vitest';
import { itemLollipopConfig } from '@tba3/modules/en/modules/charts/itemLollipop/itemLollipopConfig.js';
import { makeVisibleChartContainer } from '../../../../support/chartHarness.js';

/**
 * WHY: the card draws nothing on its first pass — the item table's first `applySync`
 * owns creation. Keying that deferral on `synced` deferred a *second* time whenever
 * a theme switch landed before that first sync, and the host, having just destroyed
 * the live renderer, was left with none: a blank card until the table happened to
 * fire again. Only the first pass may defer.
 */

const ITEMS = [
    { iqbId: 'a', name: '1', competenceLevel: '1', percentageCorrect: 40 },
    { iqbId: 'b', name: '2', competenceLevel: '2', percentageCorrect: 60 },
];

function makeHost() {
    makeVisibleChartContainer('item-itemLollipop');
    const options = {
        enConfig: { comparisonModeIds: [], comparisonGroups: [] },
        itemStore: { getByIds: () => [] },
    };
    return {
        id: 'item-itemLollipop',
        configState: {},
        chart: null,
        getOption: (key) => options[key],
        syncExportControls: () => {},
    };
}

afterEach(() => {
    document.body.innerHTML = '';
});

describe('itemLollipopConfig.createRenderer', () => {
    it('defers the first pass and rebuilds on every later one, synced or not', () => {
        const host = makeHost();
        const data = { itemsData: ITEMS, appState: null, itemComparisonGroups: null };

        expect(itemLollipopConfig.createRenderer(host, data)).toBeNull();

        // A theme switch before the table's first sync: the host has just destroyed
        // the live renderer, so this pass must hand one back rather than defer again.
        const rebuilt = itemLollipopConfig.createRenderer(host, data);
        expect(rebuilt).not.toBeNull();
        expect(rebuilt.chartState.data).toBe(ITEMS);
    });
});
