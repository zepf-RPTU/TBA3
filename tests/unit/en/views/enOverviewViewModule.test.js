// @vitest-browser

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EnOverviewViewModule } from '../../../../src/en/views/enOverviewViewModule.js';
import { DataStore } from '../../../../src/common/services/dataStore.js';
import { EN_DATA_KEYS } from '../../../../src/en/enConstants.js';
import { defineEnDatasets } from '../../../../src/en/enDatasets.js';

const hydrated = vi.hoisted(() => new Map());

vi.mock('@tba3/modules/common/charts/host/chartHostModule.js', () => ({
    ChartHostModule: class {
        constructor(id) {
            this.id = id;
        }
        mount() {}
        async hydrate(data) {
            hydrated.set(this.id, data);
        }
        whenSettled() {
            return Promise.resolve();
        }
        get childModules() {
            return new Set();
        }
        destroy() {}
    },
}));

/**
 * An EN class whose domains carry ids other than the demo fixtures' `ho`/`le`.
 * @returns {DataStore} A store holding the raw payloads the view reads.
 */
function makeStore() {
    const domain = (id) => ({ id, name: id === 'lv' ? 'Hörverstehen' : 'Leseverstehen' });
    const store = new DataStore();
    defineEnDatasets(store);
    store.setRawData(EN_DATA_KEYS.COMPETENCE_LEVELS, [
        { id: 's1', subject: { id: 'en' }, domain: domain('lv'), competenceLevels: [] },
        { id: 's1', subject: { id: 'en' }, domain: domain('sp'), competenceLevels: [] },
    ]);
    store.setRawData(EN_DATA_KEYS.STYLE_AGGREGATION, []);
    store.setRawData(EN_DATA_KEYS.AGGREGATION, []);
    store.setRawData(EN_DATA_KEYS.COMPETENCE_LEVELS_CLASS, [
        { id: '8a', type: 'group', name: '8a', domain: domain('lv'), competenceLevels: [] },
        { id: '8a', type: 'group', name: '8a', domain: domain('sp'), competenceLevels: [] },
    ]);
    return store;
}

describe('EN overview view', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
        hydrated.clear();
    });

    it("hands each distribution chart its own domain's rows, whatever the ids", async () => {
        // WHY: the view filtered the rows on the literals 'ho' and 'le'. A payload with
        // other domain ids left both distribution charts empty.
        const container = document.createElement('section');
        document.body.appendChild(container);
        const view = new EnOverviewViewModule('overview', container, { dataStore: makeStore() });

        await view._doRender();

        const domainsOf = (id) => hydrated.get(id).map((row) => row.domain.id);
        expect(domainsOf('en-overview-left-chart')).toEqual(['lv']);
        expect(domainsOf('en-overview-right-chart')).toEqual(['sp']);
    });
});
