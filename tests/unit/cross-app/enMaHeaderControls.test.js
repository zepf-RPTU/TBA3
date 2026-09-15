import { describe, expect, it, vi } from 'vitest';

import { buildEnViewHeaderConfigs } from '../../../src/en/enHeaderControls.js';
import { buildMaViewHeaderConfigs } from '../../../src/ma/maHeaderControls.js';

// First unit coverage for the EN/MA header controls — each control is one
// declared unit (see *HeaderControls.js); these tests pin the guards that used
// to hide inside app-module switch arms and private handlers.

function makeCtx(state = {}) {
    return {
        getStateValue: (key) => state[key],
        updateState: vi.fn(),
        datasetOptions: [
            { id: '8a_mid', label: 'Klasse 8a', folder: '8a_mid' },
            { id: 'class_b', label: 'Klasse B', scope: 'groups/1' },
        ],
        currentDataset: { id: '8a_mid', label: 'Klasse 8a', folder: '8a_mid' },
        navigate: vi.fn(),
    };
}

const EN_CONFIG_STUB = /** @type {any} */ ({
    domainIds: ['ho', 'le'],
    domainLabels: ['Hörverstehen', 'Leseverstehen'],
});

function findControl(configs, viewType, controlId) {
    return configs[viewType].controls.find((control) => control.id === controlId);
}

describe('EN header controls', () => {
    it('domain-switch writes app state only, skipping no-op re-fires', () => {
        // WHY: the views observe `currentMode`; a control re-firing with the same
        // mode must not touch the state, or every table and chart re-applies it.
        const ctx = makeCtx({ currentMode: 'ho' });
        const control = findControl(
            buildEnViewHeaderConfigs(ctx, EN_CONFIG_STUB),
            'class',
            'domain-switch',
        );

        control.onChange({ mode: 'ho' });
        expect(ctx.updateState).not.toHaveBeenCalled();

        control.onChange({ mode: 'le' });
        expect(ctx.updateState).toHaveBeenCalledWith({ currentMode: 'le' });
    });

    it('domain-switch labels its modes from the data-derived EN config', () => {
        const ctx = makeCtx();
        const control = findControl(
            buildEnViewHeaderConfigs(ctx, EN_CONFIG_STUB),
            'item',
            'domain-switch',
        );

        expect(control.options.modes.map((mode) => mode.label)).toEqual([
            'Alle',
            'Hörverstehen',
            'Leseverstehen',
        ]);
    });

    it('class-selector navigates only on an actual class change', () => {
        const ctx = makeCtx();
        const control = findControl(
            buildEnViewHeaderConfigs(ctx, EN_CONFIG_STUB),
            'welcome',
            'class-selector',
        );

        control.onChange({ selectedValue: '8a_mid' });
        expect(ctx.navigate).not.toHaveBeenCalled();

        control.onChange({ selectedValue: 'class_b' });
        expect(ctx.navigate).toHaveBeenCalledWith('class_b');
    });
});

describe('MA header controls', () => {
    it('layout-mode writes app state only, ignoring empty payloads and no-op re-fires', () => {
        const ctx = makeCtx({ layoutMode: 'both' });
        const control = findControl(buildMaViewHeaderConfigs(ctx), 'item', 'layout-mode');

        control.onChange({});
        expect(ctx.updateState).not.toHaveBeenCalled();

        // WHY the no-op guard here too: it used to be EN-only, so a re-fire with
        // the current layout re-ran the MA layout transition (hide, redraw, reveal)
        // for no visible change. The shared modeSwitchControl guards every app.
        control.onChange({ mode: 'both' });
        expect(ctx.updateState).not.toHaveBeenCalled();

        control.onChange({ mode: 'table-only' });
        expect(ctx.updateState).toHaveBeenCalledWith({ layoutMode: 'table-only' });
    });

    it('class-selector navigates only on an actual class change', () => {
        const ctx = makeCtx();
        const control = findControl(buildMaViewHeaderConfigs(ctx), 'welcome', 'class-selector');

        control.onChange({ selectedValue: '8a_mid' });
        expect(ctx.navigate).not.toHaveBeenCalled();

        control.onChange({ selectedValue: 'class_b' });
        expect(ctx.navigate).toHaveBeenCalledWith('class_b');
    });
});
