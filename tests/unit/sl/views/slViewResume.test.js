// @vitest-browser

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AppState } from '../../../../src/common/app/appState.js';
import { SlMaterialViewModule } from '../../../../src/sl/views/slMaterialViewModule.js';

const materialInstances = vi.hoisted(() => []);

vi.mock('@tba3/modules/sl/modules/material/materialSelectionModule.js', () => ({
    MaterialSelectionModule: class {
        selections = [];

        constructor() {
            materialInstances.push(this);
        }

        // The view hands the module to _hydrateChildren(), which mounts then hydrates.
        mount() {}
        async hydrate() {}
        setSelection(selectorId, value) {
            this.selections.push({ selectorId, value });
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
 * The generic state catch-up is pinned in viewObserveState.test.js; this drives
 * it through a real SL view, so a view that stops observing from _renderView()
 * (and thereby drops out of the catch-up) is caught here. The material keys are
 * also written by an info-box link before it navigates, so the seeding of a
 * freshly built view is pinned alongside.
 */
describe('SL material view follows the header state', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
        materialInstances.length = 0;
    });

    function makeView(initialState = {}) {
        const container = document.createElement('section');
        document.body.appendChild(container);
        const appState = new AppState({ initialState });
        const view = new SlMaterialViewModule('material', container, { appState });
        return { view, appState };
    }

    it('re-applies material selections changed while the view was suspended', async () => {
        const { view, appState } = makeView();

        await view._doRender();
        view.suspend();
        appState.updateState({ materialSubject: 'Mathematik' });
        appState.updateState({ materialType: 'Fördermaterial' });
        expect(materialInstances[0].selections).toEqual([]); // hidden: nothing applied yet

        view.resume();

        expect(materialInstances).toHaveLength(1);
        expect(materialInstances[0].selections).toEqual([
            { selectorId: 'subject', value: 'Mathematik' },
            { selectorId: 'type', value: 'Fördermaterial' },
        ]);
    });

    it('seeds a freshly built view from a selection written before it existed', async () => {
        // An info-box material link writes both keys, then navigates here.
        const { view } = makeView({ materialSubject: 'Deutsch', materialType: 'Leitfragen' });

        await view._doRender();

        expect(materialInstances[0].selections).toEqual([
            { selectorId: 'subject', value: 'Deutsch' },
            { selectorId: 'type', value: 'Leitfragen' },
        ]);
    });
});
