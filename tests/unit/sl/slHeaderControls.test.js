import { describe, expect, it, vi } from 'vitest';

import { CompetenceLevelPalette } from '@tba3/modules/context';
import { createState } from '@tba3/module-base';
import { SL_DATASETS } from '@tba3/modules/sl-domain';
import { buildSlViewHeaderControls } from '../../../src/sl/slHeaderControls.js';
import { required } from '../../../packages/modules/test/support/required.js';
import { findControl } from '../support/headerControls.js';
import { createSubjectContext } from '../../../packages/modules/test/support/subjectContext.js';

/** @typedef {import('../../../src/sl/slAppModule.js').SlState} SlState */
/** @typedef {import('../../../src/sl/slHeaderControls.js').SlHeaderControlContext} SlHeaderControlContext */
/** @typedef {import('../../../src/common/modules/header/headerOrchestrator.js').HeaderControlDeclaration} HeaderControlDeclaration */

// Every key the SL controls read, unset unless a test seeds it.
const SL_KEYS = [
    'summaryMetric',
    'detailsGrouping',
    'displayMode',
    'vizMode',
    'selectedDomainIndex',
    'longitudinalViewMode',
    'longitudinalChartType',
    'materialType',
    'materialSubject',
];

// Each header control is one declared unit: state in, event out, pinned against a
// stubbed context with no DOM or app instance.

/** A survey aggregate row: the "has rows" probe counts them. */
const SURVEY_ROW = { groupName: '8a', count: 1, values: [3], statistics: null };

/**
 * The datasets the SL controls read, as a store over a school with both survey scales
 * and two Verlauf Bereiche would derive them.
 * @type {Array<[import('@tba3/modules/documents').DatasetKey<any>, () => unknown]>}
 */
const DEFAULT_DATASETS = [
    [SL_DATASETS.TEACHING_QUALITY, () => [SURVEY_ROW]],
    [SL_DATASETS.SELF_EFFICACY_BY_GROUP, () => [SURVEY_ROW]],
    [
        SL_DATASETS.HISTORY_SURVEY_SCALES,
        () => ({ hasTeachingQuality: true, hasSelfEfficacy: true, offersBoxPlot: true }),
    ],
    // A school that sat Deutsch and Französisch.
    [SL_DATASETS.AVAILABLE_MATERIAL_SUBJECTS, () => ['Deutsch', 'Französisch']],
    [
        SL_DATASETS.LONGITUDINAL_SUBJECT_DOMAINS,
        () => [{ label: 'Deutsch: Lesen' }, { label: 'Mathematik' }],
    ],
];

/**
 * The SL control context, stubbed.
 * @param {Partial<SlState>} [state] - The state keys the test seeds.
 * @param {Array<[import('@tba3/modules/documents').DatasetKey<any>, () => unknown]>} [datasets] - Datasets the test replaces.
 * @returns {Promise<SlHeaderControlContext>}
 */
async function makeCtx(state = {}, datasets = []) {
    return {
        // Cast once: the controls read only the keys a test seeds; the rest stay unset
        // instead of taking the app's start values, so this is not a full SlState.
        state: /** @type {import('@tba3/module-base').State<SlState>} */ (
            /** @type {unknown} */ (
                createState({
                    ...Object.fromEntries(SL_KEYS.map((key) => [key, undefined])),
                    ...state,
                })
            )
        ),
        datasetOptions: [
            { id: 'sl', label: 'Beispielschule (Demo)', folder: 'sl' },
            { id: 'school_b', label: 'Schule B', scope: 'schools/1' },
        ],
        currentDataset: { id: 'sl', label: 'Beispielschule (Demo)', folder: 'sl' },
        navigate: vi.fn(),
        // No scales registered: the Kennzahl labels fall back to their generic wording.
        palette: new CompetenceLevelPalette(),
        documents: (
            await createSubjectContext('sl', {
                datasets: [...DEFAULT_DATASETS, ...datasets].map(([key, read]) => [key, read()]),
            })
        ).documents,
    };
}

/**
 * One view's declared control, as the SL builder declares it against `ctx`.
 * @param {SlHeaderControlContext} ctx
 * @param {string} viewType
 * @param {string} controlId
 * @returns {HeaderControlDeclaration}
 */
const slControl = (ctx, viewType, controlId) =>
    findControl(buildSlViewHeaderControls(ctx), viewType, controlId);

/**
 * A copy of the control with its state injected, the way the orchestrator renders it.
 * @param {HeaderControlDeclaration} control
 * @returns {HeaderControlDeclaration}
 */
function inject(control) {
    const clone = { ...control, options: { ...control.options } };
    required(control.injectState, 'injectState')(clone);
    return clone;
}

/**
 * Report a change to the control, the way the header does.
 * @param {HeaderControlDeclaration} control
 * @param {string} value
 */
function change(control, value) {
    required(control.onChange, 'onChange')({ value });
}

describe('SL header controls', () => {
    it('dataset-selector navigates only on an actual dataset change', async () => {
        const ctx = await makeCtx();
        const control = slControl(ctx, 'summary', 'dataset-selector');

        change(control, 'sl');
        expect(ctx.navigate).not.toHaveBeenCalled();

        change(control, 'school_b');
        expect(ctx.navigate).toHaveBeenCalledWith('school_b');
    });

    it('metric-select reads its default from summaryMetric state and writes the metric id back', async () => {
        const ctx = await makeCtx({ summaryMetric: 'solution_rate' });
        const control = slControl(ctx, 'summary', 'metric-select');

        expect(inject(control).options.value).toBe('solution_rate');

        change(control, 'le_low');
        expect(ctx.state.summaryMetric.value).toBe('le_low');
    });

    it('viz-mode hides itself when no survey aggregate row exists — the "has rows" level, not "ships the scale"', async () => {
        // Left standing, the button presses and changes nothing on screen: competence
        // levels stack the same in both modes, and the survey marks it redraws are
        // built iff an aggregate row exists. A payload can ship the `tq_mean` key on
        // every student and still parse to no row, so the switch asks the marks'
        // question (getSurveyRows), not the scale's. With rows it is offered in the
        // charts Darstellung too: the charts follow it as the tables do.
        const state = { displayMode: 'charts' };
        const noRows = await makeCtx(state, [
            [SL_DATASETS.TEACHING_QUALITY, () => []],
            [SL_DATASETS.SELF_EFFICACY_BY_GROUP, () => []],
        ]);
        expect(inject(slControl(noRows, 'details', 'viz-mode')).options.hidden).toBe(true);

        const withRows = await makeCtx(state);
        expect(inject(slControl(withRows, 'details', 'viz-mode')).options.hidden).toBe(false);
    });

    it('chart-type-toggle is offered only when BOTH survey scales are present', async () => {
        // Boxplot mode is one combined chart; with a single scale it would draw half
        // a chart and hide the card that still had data.
        const oneScale = await makeCtx({}, [
            [
                SL_DATASETS.HISTORY_SURVEY_SCALES,
                () => ({ hasTeachingQuality: true, hasSelfEfficacy: false, offersBoxPlot: false }),
            ],
        ]);
        const hiddenControl = slControl(oneScale, 'longitudinal', 'chart-type-toggle');
        expect(inject(hiddenControl).options.hidden).toBe(true);

        const bothScales = await makeCtx();
        const shownControl = slControl(bothScales, 'longitudinal', 'chart-type-toggle');
        expect(inject(shownControl).options.hidden).toBe(false);
    });

    it('domain-select lists the Verlauf Bereiche by index and writes a parsed index', async () => {
        const ctx = await makeCtx({ selectedDomainIndex: 1 });
        const control = slControl(ctx, 'longitudinal', 'domain-select');

        const injected = inject(control);
        expect(injected.options.items).toEqual([
            { value: '0', label: 'Deutsch: Lesen' },
            { value: '1', label: 'Mathematik' },
        ]);
        expect(injected.options.value).toBe('1');

        change(control, '0');
        expect(ctx.state.selectedDomainIndex.value).toBe(0);
    });

    it('subject-select leads with a disabled Gesamt and falls back to the first Fach', async () => {
        // `Gesamt` has no page yet, so it shows what is planned and is never the
        // choice; a stored value without a button would render with nothing active.
        const ctx = await makeCtx({ materialSubject: 'Englisch' });
        const control = slControl(ctx, 'material', 'subject-select');

        const injected = inject(control);
        expect(injected.options.items).toEqual([
            { value: 'Gesamt', glossarySubKey: 'general', disabled: true },
            { value: 'Deutsch', label: 'Deutsch' },
            { value: 'Französisch', label: 'Französisch' },
        ]);
        expect(injected.options.value).toBe('Deutsch');

        const validCtx = await makeCtx({ materialSubject: 'Französisch' });
        const validControl = slControl(validCtx, 'material', 'subject-select');
        expect(inject(validControl).options.value).toBe('Französisch');
    });

    it('type-select shows the Typen without a page, disabled, and never falls back to one', async () => {
        const ctx = await makeCtx({ materialType: 'Leitfragen' });
        const injected = inject(slControl(ctx, 'material', 'type-select'));

        expect(
            (injected.options.items ?? []).map((item) => [item.value, item.disabled ?? false]),
        ).toEqual([
            ['Übersicht', false],
            ['Ergebniszusammenfassung', false],
            ['Datensicht', true],
            ['Leitfragen', true],
        ]);
        expect(injected.options.value).toBe('Übersicht');
    });

    it('subject-select chooses nothing for a dataset without a Fach', async () => {
        const ctx = await makeCtx({}, [[SL_DATASETS.AVAILABLE_MATERIAL_SUBJECTS, () => []]]);
        const injected = inject(slControl(ctx, 'material', 'subject-select'));

        expect(injected.options.items).toEqual([
            { value: 'Gesamt', glossarySubKey: 'general', disabled: true },
        ]);
        expect(injected.options.value).toBeNull();
    });

    it('view-toggle hides in box-plot mode, where there is nothing to stack', async () => {
        // The stacked view reshapes the line charts only; offered beside the box plot
        // it would switch nothing on screen.
        const boxplot = await makeCtx({ longitudinalChartType: 'boxplot' });
        expect(inject(slControl(boxplot, 'longitudinal', 'view-toggle')).options.hidden).toBe(true);

        const lines = await makeCtx({ longitudinalChartType: 'lines' });
        expect(inject(slControl(lines, 'longitudinal', 'view-toggle')).options.hidden).toBe(false);
    });
});
