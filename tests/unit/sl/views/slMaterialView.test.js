// @vitest-browser

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { viewOptions } from '../../support/viewOptions.js';
import { SlMaterialViewModule } from '../../../../src/sl/views/slMaterialViewModule.js';
import { required } from '../../../../packages/modules/test/support/required.js';

/** @typedef {import('@tba3/modules/material-selection').MaterialSelectionOptions} MaterialSelectionOptions */

const materialInstances = vi.hoisted(
    () => /** @type {Array<{options: MaterialSelectionOptions}>} */ ([]),
);

vi.mock('@tba3/modules/material-selection', async () => {
    const { BaseModule } = await import('@tba3/module-base');
    /** Records what the view hands the module. */
    class FakeMaterialSelection extends BaseModule {
        constructor() {
            super();
            materialInstances.push(
                /** @type {{options: MaterialSelectionOptions}} */ (/** @type {unknown} */ (this)),
            );
        }
    }
    customElements.define('test-fake-material-selection', FakeMaterialSelection);
    return { MaterialSelectionModule: FakeMaterialSelection };
});

/**
 * The material page follows the header's Fach/Typ through the app's own signals, so a
 * change reaches it with no view code in between. The keys are also written by an
 * info-box link before it navigates, so a freshly built view starts on them.
 */
describe('SL material view hands the module the header state', () => {
    beforeEach(() => {
        materialInstances.length = 0;
    });

    it('passes the app signals, holding a selection written before the view existed', async () => {
        const { appState } = viewOptions({
            materialSubject: 'Deutsch',
            materialType: 'Ergebniszusammenfassung',
        });
        const view = SlMaterialViewModule.create(
            'material',
            /** @type {SlMaterialViewModule['options']} */ ({ appState }),
        );

        document.body.append(view);
        await view.contentComplete;

        const { subject, type } = required(materialInstances[0]).options;
        expect(subject).toBe(appState.materialSubject);
        expect(type).toBe(appState.materialType);
        expect([appState.materialSubject.value, appState.materialType.value]).toEqual([
            'Deutsch',
            'Ergebniszusammenfassung',
        ]);
    });
});
