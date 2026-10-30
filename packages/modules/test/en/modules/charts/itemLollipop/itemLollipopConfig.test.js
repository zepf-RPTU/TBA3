// @vitest-browser

import { signal } from '@preact/signals-core';
import { describe, expect, it, vi } from 'vitest';
import { itemLollipopConfig } from '../../../../../src/en/modules/charts/itemLollipop/itemLollipopConfig.js';
import { mountChart } from '../../../../support/chartHarness.js';
import { EN_GROUP_DOMAIN_VALUE_GROUPS } from '../../../../support/groupDocumentStoreFixture.js';
import { required } from '../../../../support/required.js';
import { createSubjectContext } from '../../../../support/subjectContext.js';

/** @typedef {import('../../../../../src/en/modules/charts/itemLollipop/itemLollipopChart.js').ItemLollipopChart} ItemLollipopChart */
/** @typedef {import('../../../../../src/common/data/schemas/items.js').ItemsValueGroup} ItemsValueGroup */

// The table owns what the card plots. The card draws nothing until the item table's
// first `applySync`, which renders the host through its own lifecycle; a theme switch
// re-renders it and must rebuild from the items last synced.

/** @type {ItemsValueGroup[]} */
const ITEMS_JSON = [
    {
        id: 'own-group',
        type: 'group',
        name: 'Lerngruppe',
        domain: { id: 'ho', name: 'Hören' },
        items: [
            {
                iqbId: 'a',
                name: '1',
                position: 1,
                exercise: { name: 'Eins' },
                parameters: { competenceLevel: { id: '1', nameShort: 'A1.1' } },
                descriptiveStatistics: { mean: 0.5 },
            },
            {
                iqbId: 'b',
                name: '2',
                position: 2,
                exercise: { name: 'Zwei' },
                parameters: { competenceLevel: { id: '1', nameShort: 'A1.1' } },
                descriptiveStatistics: { mean: 0.25 },
            },
        ],
    },
];

/**
 * The card over a store holding the items, drawn.
 * @param {import('@preact/signals-core').Signal<string>} [domainMode]
 * @returns {Promise<import('../../../../../src/en/modules/charts/itemLollipop/itemLollipopConfig.js').ItemLollipopHost>}
 */
async function mountCard(domainMode = signal('all')) {
    return /** @type {any} */ (
        await mountChart(
            itemLollipopConfig,
            {
                context: await createSubjectContext('en', {
                    documents: {
                        'items.json': ITEMS_JSON,
                        'competence-levels.json': EN_GROUP_DOMAIN_VALUE_GROUPS,
                    },
                }),
                domainMode,
            },
            { id: 'item-lollipop' },
        )
    );
}

/**
 * The item table's sync, and the render it starts.
 * @param {Awaited<ReturnType<typeof mountCard>>} host
 * @param {string[]} ids
 * @returns {Promise<ItemLollipopChart>} The chart drawing them.
 */
async function sync(host, ids) {
    host.applySync({ ids });
    await vi.waitFor(() => expect(host.chart).not.toBeNull());
    await host.updateComplete;
    return /** @type {ItemLollipopChart} */ (host.chart);
}

/**
 * @param {ItemLollipopChart} chart
 * @param {'iqbId'|'displayName'} field
 * @returns {Array<string|undefined>} What it draws, by that field.
 */
const drawn = (chart, field) => required(chart.state.items.value).map((item) => item[field]);

describe('itemLollipopConfig', () => {
    it('draws nothing before the first sync, which renders the host with the synced items', async () => {
        const host = await mountCard();
        expect(host.chart).toBeNull();

        const chart = await sync(host, ['b']);
        expect(drawn(chart, 'iqbId')).toEqual(['b']);

        // A theme switch re-renders the host: the synced items survive it.
        await host.rerender();
        expect(host.chart).not.toBe(chart);
        expect(drawn(/** @type {ItemLollipopChart} */ (host.chart), 'iqbId')).toEqual(['b']);
    });

    it('updates the drawn chart in place on a later sync', async () => {
        const host = await mountCard();
        const chart = await sync(host, ['a']);

        host.applySync({ ids: ['a', 'b'] });

        expect(host.chart).toBe(chart);
        expect(drawn(chart, 'displayName')).toEqual(['H-1', 'H-2']);
    });

    it('labels the items by the Domäne mode the app is in — the host shares its signal', async () => {
        const domainMode = signal('all');
        const host = await mountCard(domainMode);
        const chart = await sync(host, ['a']);
        expect(host.getExportIdentity()).toBe('all');

        domainMode.value = 'ho';
        host.applySync({ ids: ['a', 'b'] });

        expect(host.state.mode).toBe(domainMode);
        expect(host.getExportIdentity()).toBe('ho');
        expect(drawn(chart, 'displayName')).toEqual(['1', '2']);
    });
});
