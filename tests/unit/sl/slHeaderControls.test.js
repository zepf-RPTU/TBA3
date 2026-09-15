import { describe, expect, it, vi } from 'vitest';

import { buildSlViewHeaderConfigs } from '../../../src/sl/slHeaderControls.js';

// WHY this file exists: header-control behavior used to be smeared across a
// declaration literal plus two app-wide switches in SlAppModule — the repo's
// top-churn file, with no unit tests. Each control is now one declared unit
// whose "state in, event out" contract these tests pin against a stubbed
// context, no DOM or app instance required.

function makeCtx(state = {}, overrides = {}) {
    return {
        getStateValue: (key) => state[key],
        updateState: vi.fn(),
        datasetOptions: [
            { id: 'sl', label: 'Beispielschule (Demo)', folder: 'sl' },
            { id: 'school_b', label: 'Schule B', scope: 'schools/1' },
        ],
        currentDataset: { id: 'sl', label: 'Beispielschule (Demo)', folder: 'sl' },
        navigate: vi.fn(),
        getHistorySurveyScales: () => ({ hasTeachingQuality: true, hasSelfEfficacy: true }),
        getSurveyRows: () => ({ hasTeachingQuality: true, hasSelfEfficacy: true }),
        getLongitudinalDomainOptions: () => [
            { index: 0, label: 'Deutsch: Lesen' },
            { index: 1, label: 'Mathematik' },
        ],
        getMaterialSubjectOptions: () => [
            { value: 'Gesamt', label: 'Gesamt' },
            { value: 'Deutsch', label: 'Deutsch' },
        ],
        ...overrides,
    };
}

function findControl(configs, viewType, controlId) {
    return configs[viewType].controls.find((control) => control.id === controlId);
}

function inject(control) {
    const clone = { ...control, options: { ...control.options } };
    control.injectState(clone);
    return clone;
}

describe('SL header controls', () => {
    it('school-selector navigates only on an actual dataset change', () => {
        const ctx = makeCtx();
        const control = findControl(buildSlViewHeaderConfigs(ctx), 'summary', 'school-selector');

        control.onChange({ selectedValue: 'sl' });
        expect(ctx.navigate).not.toHaveBeenCalled();

        control.onChange({ selectedValue: 'school_b' });
        expect(ctx.navigate).toHaveBeenCalledWith('school_b');
    });

    it('metric-select reads its default from summaryMetric state and writes the metric id back', () => {
        const ctx = makeCtx({ summaryMetric: 'regelstandard' });
        const control = findControl(buildSlViewHeaderConfigs(ctx), 'summary', 'metric-select');

        expect(inject(control).options.defaultValue).toBe('regelstandard');

        control.onChange({ selectedValue: 'mindeststandard' });
        expect(ctx.updateState).toHaveBeenCalledWith({ summaryMetric: 'mindeststandard' });
    });

    it('viz-mode writes state only — the overview view observes the key', () => {
        const ctx = makeCtx({ vizMode: 'stacked_bar' });
        const control = findControl(buildSlViewHeaderConfigs(ctx), 'overview', 'viz-mode');

        control.onChange({ mode: 'boxplot' });

        expect(ctx.updateState).toHaveBeenCalledWith({ vizMode: 'boxplot' });
    });

    it('viz-mode hides itself when no survey aggregate row exists — the "has rows" level, not "ships the scale"', () => {
        // WHY: left standing, it is a button that visibly depresses and changes
        // nothing on screen — competence levels stack the same in both modes, and
        // the columns it redraws are built iff an aggregate row exists. A payload can
        // ship the `tq_mean` key on every student and still parse to no row, so the
        // switch must ask the columns' question (getSurveyRows), not the scale's.
        const ctx = makeCtx(
            { currentView: 'overview', displayMode: 'table' },
            {
                getSurveyRows: () => ({ hasTeachingQuality: false, hasSelfEfficacy: false }),
            },
        );
        const control = findControl(buildSlViewHeaderConfigs(ctx), 'overview', 'viz-mode');

        expect(inject(control).options.hidden).toBe(true);
    });

    it('viz-mode hides on overview in charts mode, shows in table mode', () => {
        const chartsCtx = makeCtx({ currentView: 'overview', displayMode: 'charts' });
        const chartsControl = findControl(
            buildSlViewHeaderConfigs(chartsCtx),
            'overview',
            'viz-mode',
        );
        expect(inject(chartsControl).options.hidden).toBe(true);

        const tableCtx = makeCtx({ currentView: 'overview', displayMode: 'table' });
        const tableControl = findControl(
            buildSlViewHeaderConfigs(tableCtx),
            'overview',
            'viz-mode',
        );
        expect(inject(tableControl).options.hidden).toBe(false);
    });

    it('chart-type-toggle is offered only when BOTH survey scales are present', () => {
        // WHY: boxplot mode is one combined chart; with a single scale it would
        // draw half a chart and pocket the card that still had data.
        const oneScale = makeCtx(
            {},
            {
                getHistorySurveyScales: () => ({
                    hasTeachingQuality: true,
                    hasSelfEfficacy: false,
                }),
            },
        );
        const hiddenControl = findControl(
            buildSlViewHeaderConfigs(oneScale),
            'longitudinal',
            'chart-type-toggle',
        );
        expect(inject(hiddenControl).options.hidden).toBe(true);

        const bothScales = makeCtx();
        const shownControl = findControl(
            buildSlViewHeaderConfigs(bothScales),
            'longitudinal',
            'chart-type-toggle',
        );
        expect(inject(shownControl).options.hidden).toBe(false);
    });

    it('domain-select lists the app-provided domains and writes a parsed index', () => {
        const ctx = makeCtx({ selectedDomainIndex: 1 });
        const control = findControl(buildSlViewHeaderConfigs(ctx), 'longitudinal', 'domain-select');

        const injected = inject(control);
        expect(injected.options.items).toEqual([
            { value: '0', label: 'Deutsch: Lesen' },
            { value: '1', label: 'Mathematik' },
        ]);
        expect(injected.options.defaultValue).toBe('1');

        control.onChange({ selectedValue: '1' });
        expect(ctx.updateState).toHaveBeenCalledWith({ selectedDomainIndex: 1 });
    });

    it('view-toggle writes the mode the Verlauf view maps to isStacked', () => {
        const ctx = makeCtx({ longitudinalViewMode: 'normal' });
        const control = findControl(buildSlViewHeaderConfigs(ctx), 'longitudinal', 'view-toggle');

        control.onChange({ mode: 'stacked' });
        expect(ctx.updateState).toHaveBeenCalledWith({ longitudinalViewMode: 'stacked' });
    });

    it('subject-select falls back to Gesamt when the stored subject has no button', () => {
        // WHY: a dataset switch can leave a subject selected that the new
        // dataset has no button for; the group would render with nothing active.
        const ctx = makeCtx({ materialSubject: 'Englisch' });
        const control = findControl(buildSlViewHeaderConfigs(ctx), 'material', 'subject-select');

        expect(inject(control).options.defaultValue).toBe('Gesamt');

        const validCtx = makeCtx({ materialSubject: 'Deutsch' });
        const validControl = findControl(
            buildSlViewHeaderConfigs(validCtx),
            'material',
            'subject-select',
        );
        expect(inject(validControl).options.defaultValue).toBe('Deutsch');
    });
});
