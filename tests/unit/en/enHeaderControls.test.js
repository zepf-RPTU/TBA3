import { describe, expect, it, vi } from 'vitest';

import { createState } from '@tba3/module-base';
import { CompetenceLevelPalette } from '@tba3/modules/context';
import { EN_DATASETS } from '@tba3/modules/en-domain';
import { buildEnViewHeaderControls } from '../../../src/en/enHeaderControls.js';
import { required } from '../../../packages/modules/test/support/required.js';
import { findControl } from '../support/headerControls.js';

/** @typedef {import('../../../src/en/enAppModule.js').EnState} EnState */
/** @typedef {import('../../../src/common/app/appModule.js').HeaderControlContext<EnState>} HeaderControlContext */

/**
 * The EN control context, stubbed.
 * @param {(key: unknown) => unknown} getDataset - The store's dataset read.
 * @param {Partial<EnState>} [state] - The state keys the test seeds.
 * @returns {HeaderControlContext}
 */
function makeCtx(getDataset, state = {}) {
    return {
        // Cast once: the controls read only `currentMode` and what a test seeds; the
        // shell's keys stay unset, so this is not a full EnState.
        state: /** @type {import('@tba3/module-base').State<EnState>} */ (
            /** @type {unknown} */ (createState({ currentMode: 'all', ...state }))
        ),
        datasetOptions: [
            { id: '8a_mid', label: 'Lerngruppe 8a', folder: '8a_mid' },
            { id: 'class_b', label: 'Lerngruppe B', scope: 'groups/1' },
        ],
        currentDataset: { id: '8a_mid', label: 'Lerngruppe 8a', folder: '8a_mid' },
        navigate: vi.fn(),
        // Cast once: the controls read only the store's datasets.
        documents: /** @type {HeaderControlContext['documents']} */ (
            /** @type {unknown} */ ({ getDataset })
        ),
        palette: new CompetenceLevelPalette(),
    };
}

// Cast once: the domain switch reads only the ids and labels, not the rest of the config.
const EN_CONFIG_STUB = /** @type {import('@tba3/modules/en-domain').EnConfig} */ (
    /** @type {unknown} */ ({
        domainIds: ['ho', 'le'],
        domainLabels: ['Hörverstehen', 'Leseverstehen'],
    })
);

describe('EN header controls', () => {
    it('domain-switch labels its items from the data-derived EN config when it renders', () => {
        // The header configs are built before the documents land, so the switch
        // may only read the EN config when a view that waited for the data renders it.
        const getDataset = vi.fn((key) => (key === EN_DATASETS.CONFIG ? EN_CONFIG_STUB : null));
        const ctx = makeCtx(getDataset);
        const control = findControl(buildEnViewHeaderControls(ctx), 'item', 'domain-switch');
        expect(getDataset).not.toHaveBeenCalled();

        required(control.injectState, 'injectState')(control);

        // `Alle` is the view glossary's (`domain-all`); the orchestrator labels it.
        expect(
            required(control.options.items).map((item) => item.label ?? item.glossarySubKey),
        ).toEqual(['domain-all', 'Hörverstehen', 'Leseverstehen']);
    });
});
