// @vitest-browser

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SlWelcomeViewModule } from '../../../../src/sl/views/slWelcomeViewModule.js';
import { SL_DATA_KEYS } from '../../../../src/sl/slDataKeys.js';
import { createSlDataStore } from '../../support/slDataStoreFixture.js';

const infoBoxOptions = vi.hoisted(() => []);

vi.mock('@tba3/modules/common/charts/host/chartHostModule.js', () => ({
    ChartHostModule: class {
        mount() {}
        async hydrate() {}
        whenSettled() {
            return Promise.resolve();
        }
        get childModules() {
            return new Set();
        }
        destroy() {}
    },
}));

vi.mock('@tba3/modules/sl/modules/infoBox/infoBoxModule.js', () => ({
    InfoBoxModule: class {
        constructor(_id, _container, options) {
            infoBoxOptions.push(options);
        }
        mount() {}
        async hydrate() {}
        whenSettled() {
            return Promise.resolve();
        }
        get childModules() {
            return new Set();
        }
        destroy() {}
    },
}));

describe('SL welcome view', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
        infoBoxOptions.length = 0;
    });

    it('hands the info box a data port over its store', async () => {
        // WHY: the box reads its templates and figures only through `slData`. Without one
        // the package falls back to an empty port, and the welcome box showed nothing but
        // its empty-state sentence after the SL cards moved into the package.
        const infoBoxes = { boxes: { welcome: {} } };
        const raw = {
            [SL_DATA_KEYS.COMPETENCE_LEVELS]: [{ type: 'school', name: 'Schule' }],
            [SL_DATA_KEYS.INFO_BOXES]: infoBoxes,
        };
        const container = document.createElement('section');
        document.body.appendChild(container);
        const view = new SlWelcomeViewModule('welcome', container, {
            dataStore: createSlDataStore(raw),
        });

        await view._doRender();

        expect(infoBoxOptions).toHaveLength(1);
        expect(infoBoxOptions[0].slData?.infoBoxes()).toBe(infoBoxes);
    });
});
