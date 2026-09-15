// @vitest-browser
import { describe, expect, it, vi } from 'vitest';

import {
    HeaderOrchestrator,
    applyGlossaryInterfaceToControl,
    normalizeHeaderRenderValue,
    resolveHeaderGlossaryConfig,
} from '../../../../../src/common/modules/header/headerOrchestrator.js';
import { MISSING_GLOSSARY_TITLE } from '@tba3/module-base/glossary/glossaryText.js';

// Pins the control-change dispatch introduced when per-control onChange
// declarations replaced the app-wide _onControlChanged switches: a change must
// reach exactly the declaring control, and an unknown id must stay harmless.
// The second half pins the pure resolvers the orchestrator renders through.

function makeOrchestrator() {
    return new HeaderOrchestrator({
        ownerName: 'TestApp',
        headerContainerId: null,
        viewConfig: {},
        getGlossaryData: () => null,
        onNotesToggled: () => {},
        onInfoToggled: () => {},
        registerChildModule: () => {},
    });
}

describe('HeaderOrchestrator.dispatchControlChange', () => {
    it('routes a change to the onChange of the control that declared it', () => {
        const orchestrator = makeOrchestrator();
        const onMetricChange = vi.fn();
        const onOtherChange = vi.fn();
        orchestrator.setViewHeaderConfigs({
            summary: {
                controls: [
                    { type: 'select', id: 'metric-select', options: {}, onChange: onMetricChange },
                    { type: 'modeSwitch', id: 'view-mode', options: {}, onChange: onOtherChange },
                ],
            },
        });

        orchestrator.dispatchControlChange('metric-select', { selectedValue: 'x' });

        expect(onMetricChange).toHaveBeenCalledWith({ selectedValue: 'x' });
        expect(onOtherChange).not.toHaveBeenCalled();
    });

    it('finds a control declared on a view other than the current one', () => {
        // WHY: ids are unique per app, and a change may fire before the first
        // header render has noted a current view.
        const orchestrator = makeOrchestrator();
        const onChange = vi.fn();
        orchestrator.setViewHeaderConfigs({
            welcome: { controls: [] },
            material: {
                controls: [{ type: 'buttonGroup', id: 'type-select', options: {}, onChange }],
            },
        });

        orchestrator.dispatchControlChange('type-select', { selectedValue: 'Leitfragen' });

        expect(onChange).toHaveBeenCalledWith({ selectedValue: 'Leitfragen' });
    });

    it('tolerates an unknown control id without throwing', () => {
        const orchestrator = makeOrchestrator();
        orchestrator.setViewHeaderConfigs({ welcome: { controls: [] } });

        expect(() => orchestrator.dispatchControlChange('no-such-control', {})).not.toThrow();
    });

    it("prefers the current view's declaration when two views declare the same control id", async () => {
        // WHY: EN builds its domain switch once per view, so three units share one
        // id. A flat first-match scan would run the class view's handler for a
        // change made on the item view; the view last asked for must win.
        const orchestrator = makeOrchestrator();
        const onClassChange = vi.fn();
        const onItemChange = vi.fn();
        orchestrator.setViewHeaderConfigs({
            class: {
                controls: [
                    {
                        type: 'modeSwitch',
                        id: 'domain-switch',
                        options: {},
                        onChange: onClassChange,
                    },
                ],
            },
            item: {
                controls: [
                    {
                        type: 'modeSwitch',
                        id: 'domain-switch',
                        options: {},
                        onChange: onItemChange,
                    },
                ],
            },
        });

        await orchestrator.updateForView('item');
        orchestrator.dispatchControlChange('domain-switch', { mode: 'ho' });

        expect(onItemChange).toHaveBeenCalledWith({ mode: 'ho' });
        expect(onClassChange).not.toHaveBeenCalled();
    });
});

describe('resolveHeaderGlossaryConfig', () => {
    const glossary = {
        en: {
            class: {
                header: {
                    title: 'Klassenübersicht',
                    subtitle: '<p>Wie steht die <b>Klasse</b>?</p>',
                    interface: { 'domain-all': { label: 'Alle' } },
                },
            },
        },
    };

    it('folds the glossary title and the stripped subtitle into headerText and subtitle', () => {
        // WHY: the glossary is the single source of header subtitles
        // (standards-reference §3.4) — this fold is the only writer of `subtitle`.
        const resolved = resolveHeaderGlossaryConfig(
            { glossaryPath: 'en.class.header', headerText: 'fallback', controls: [] },
            glossary,
        );

        expect(resolved.headerText).toBe('Klassenübersicht');
        expect(resolved.subtitle).toBe('Wie steht die Klasse?');
        expect(resolved.glossaryInterface).toEqual({ 'domain-all': { label: 'Alle' } });
    });

    it('renders no subtitle for an entry without subtitle copy, and keeps the declared headerText', () => {
        const resolved = resolveHeaderGlossaryConfig(
            { glossaryPath: 'en.class.header', headerText: 'fallback' },
            { en: { class: { header: { title: 'Klasse' } } } },
        );

        expect(resolved.headerText).toBe('Klasse');
        expect(resolved).not.toHaveProperty('subtitle');
    });

    it('renders the missing-title marker, not the declared headerText, when the entry has no title', () => {
        // WHY: the glossary owns header copy. A literal headerText beside a
        // glossaryPath would hide a missing entry; the marker makes it visible.
        const resolved = resolveHeaderGlossaryConfig(
            { glossaryPath: 'en.class.header', headerText: 'Klassenübersicht' },
            { en: { class: { header: { subtitle: 'nur Text' } } } },
        );

        expect(resolved.headerText).toBe(MISSING_GLOSSARY_TITLE);
        expect(resolved.subtitle).toBe('nur Text');

        expect(
            resolveHeaderGlossaryConfig({ glossaryPath: 'en.nope', headerText: 'x' }, glossary)
                .headerText,
        ).toBe(MISSING_GLOSSARY_TITLE);
    });

    it('returns an untouched copy when there is no glossary or no path', () => {
        const config = { headerText: 'Willkommen', controls: [] };

        expect(resolveHeaderGlossaryConfig(config, null)).toEqual(config);
        expect(resolveHeaderGlossaryConfig(config, glossary)).toEqual(config);
        expect(resolveHeaderGlossaryConfig(config, glossary)).not.toBe(config);
    });
});

describe('applyGlossaryInterfaceToControl', () => {
    const glossaryInterface = {
        'domain-switch': { label: 'Domäne', tooltip: 'Hören oder Lesen' },
        'domain-ho': { label: '<i>Hören</i>' },
        'metric-lq': { label: 'Lösungsquote' },
    };

    it('labels the control, its modes and its items by glossarySubKey, leaving unmatched ones alone', () => {
        // WHY: one glossary entry per key, resolved per part — a mode without an
        // entry must keep its declared label rather than inherit the control's.
        const control = applyGlossaryInterfaceToControl(
            {
                id: 'domain-switch',
                options: {
                    glossarySubKey: 'domain-switch',
                    label: 'declared',
                    modes: [
                        { id: 'ho', label: 'HO', glossarySubKey: 'domain-ho' },
                        { id: 'le', label: 'LE', glossarySubKey: 'domain-le' },
                    ],
                    items: [{ value: 'lq', label: 'LQ', glossarySubKey: 'metric-lq' }],
                },
            },
            glossaryInterface,
        );

        expect(control.options.label).toBe('Domäne');
        expect(control.options.tooltipText).toBe('Hören oder Lesen');
        expect(control.options.modes.map((m) => m.label)).toEqual(['Hören', 'LE']);
        expect(control.options.items[0].label).toBe('Lösungsquote');
    });

    it('returns the control unchanged when the view has no interface entries', () => {
        const control = { id: 'x', options: { label: 'declared', glossarySubKey: 'x' } };

        expect(applyGlossaryInterfaceToControl(control, null)).toBe(control);
        expect(control.options.label).toBe('declared');
    });

    it('labels a control that declares no label of its own — the glossary is the only source', () => {
        // WHY: controls with a glossarySubKey carry no label: literal (SL Metrik/Bereich
        // selects), so a stale code caption cannot mask an edited glossary label.
        const control = applyGlossaryInterfaceToControl(
            { id: 'metric-select', options: { glossarySubKey: 'domain-switch' } },
            glossaryInterface,
        );

        expect(control.options.label).toBe('Domäne');
        expect(control.options.tooltipText).toBe('Hören oder Lesen');
    });

    it('keeps the declared mode label when the entry carries only a tooltip', () => {
        // WHY: a label-less entry means "no glossary caption" — the declared label passed
        // as the helper's fallback stands, and the tooltip still resolves.
        const control = applyGlossaryInterfaceToControl(
            {
                id: 'x',
                options: {
                    glossarySubKey: 'none',
                    modes: [{ id: 'm', label: 'declared', glossarySubKey: 'tooltip-only' }],
                },
            },
            { 'tooltip-only': { tooltip: 'nur Tooltip' } },
        );

        expect(control.options.modes[0].label).toBe('declared');
        expect(control.options.modes[0].tooltipText).toBe('nur Tooltip');
    });
});

describe('normalizeHeaderRenderValue', () => {
    it('serialises the same regardless of key order, and reduces functions and cycles to markers', () => {
        // WHY: the render-skip signature compares JSON of this projection. Key
        // order must not defeat the skip, and the render extras carry closures
        // (onChange handlers) and can carry cycles — neither may throw or churn.
        const cyclic = { name: 'x' };
        cyclic.self = cyclic;

        const a = normalizeHeaderRenderValue({ b: 1, a: { onChange: () => {}, ref: cyclic } });
        const b = normalizeHeaderRenderValue({ a: { ref: cyclic, onChange: () => {} }, b: 1 });

        expect(JSON.stringify(a)).toBe(JSON.stringify(b));
        expect(a.a.onChange).toBe('[Function]');
        expect(a.a.ref.self).toBe('[Circular]');
    });
});
