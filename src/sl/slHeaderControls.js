/**
 * SL header controls — each control is one declared unit: what it shows
 * (type/id/options), the app state it reads (`injectState`), and the state it
 * writes (`onChange`). Factories close over the app's control context, so
 * the logic is assertable with a stubbed context and no DOM; the
 * HeaderOrchestrator invokes the callbacks and strips them before rendering.
 */

import { datasetSelectorControl } from '../common/modules/header/datasetSelectorControl.js';
import { modeSwitchControl } from '../common/modules/header/modeSwitchControl.js';
import { REPORT_HEADER_CONFIG } from '../common/views/report/reportViewConfig.js';
import {
    DEFAULT_SUMMARY_METRIC_ID,
    MATERIAL_SUBJECT_OPTIONS,
    MATERIAL_TYPE_OPTIONS,
    SUMMARY_METRICS,
} from '@tba3/modules/sl-domain';

/**
 * @typedef {object} SlHeaderControlContext
 * @property {(key: string) => *} getStateValue - Read one key of app state.
 * @property {(patch: object) => void} updateState - Merge a patch into app state.
 * @property {Array<{id: string, label: string}>} datasetOptions - Selectable school datasets
 * @property {{id: string, label: string}} currentDataset - The dataset the URL selected
 * @property {(datasetId: string) => void} navigate - Switch to another dataset
 * @property {() => {hasTeachingQuality: boolean, hasSelfEfficacy: boolean}} getHistorySurveyScales -
 *   which survey timelines history.json carries (the Verlauf cards and the boxplot toggle
 *   draw from it)
 * @property {() => {hasTeachingQuality: boolean, hasSelfEfficacy: boolean}} getSurveyRows -
 *   "has rows" (the Balken/Boxplot switch, which redraws only the table columns that
 *   exist iff rows do — see slDataService.js getSurveyScales for the two levels)
 * @property {() => Array<{index: number, label: string}>} getLongitudinalDomainOptions - The Domänen the Verlauf view can plot.
 * @property {() => Array<{value: string, label: string}>} getMaterialSubjectOptions - The Fächer this dataset has material for.
 */

/**
 * Build the school (dataset) selector shown on every SL view.
 * @param {SlHeaderControlContext} ctx - The app's control context.
 * @returns {object} The declared control.
 */
function schoolSelector(ctx) {
    return datasetSelectorControl(ctx, { id: 'school-selector', label: 'Schule' });
}

/**
 * Build the Kennzahl selector for the Überblick view.
 * @param {SlHeaderControlContext} ctx - The app's control context.
 * @returns {object} The declared control.
 */
function metricSelect(ctx) {
    return {
        type: 'select',
        id: 'metric-select',
        options: {
            defaultValue: DEFAULT_SUMMARY_METRIC_ID,
            glossarySubKey: 'metric-select',
            containerClass: 'header-module-select',
            selectClass: 'control-select--card',
        },
        injectState(control) {
            // The labels name the Kompetenzstufe each metric's rank alias resolves to, so
            // they can only be built once the payload's scales are registered — this factory
            // runs in the SL app constructor, `injectState` runs per render.
            control.options.items = SUMMARY_METRICS.map((metric) => ({
                value: metric.id,
                label: metric.label(),
            }));
            control.options.defaultValue =
                ctx.getStateValue('summaryMetric') || DEFAULT_SUMMARY_METRIC_ID;
        },
        onChange(data) {
            ctx.updateState({ summaryMetric: data.selectedValue });
        },
    };
}

/**
 * Build the Ansicht switch between the overview and the detail charts.
 * @param {SlHeaderControlContext} ctx - The app's control context.
 * @returns {object} The declared control.
 */
function viewMode(ctx) {
    return modeSwitchControl(ctx, {
        id: 'view-mode',
        modes: [
            { id: 'by_subjects', label: 'Nach Fächern', glossarySubKey: 'display-subjects' },
            { id: 'by_classes', label: 'Nach Klassen', glossarySubKey: 'display-classes' },
        ],
        stateKey: 'viewMode',
        defaultMode: 'by_subjects',
    });
}

/**
 * Build the Darstellung switch between the graphical and numerical tables.
 * @param {SlHeaderControlContext} ctx - The app's control context.
 * @returns {object} The declared control.
 */
function displayMode(ctx) {
    return modeSwitchControl(ctx, {
        id: 'display-mode',
        modes: [
            { id: 'charts', label: 'Diagramme', glossarySubKey: 'display-graphs' },
            { id: 'table', label: 'Tabelle', glossarySubKey: 'display-tables' },
        ],
        stateKey: 'displayMode',
        defaultMode: 'charts',
    });
}

/**
 * Build the Balken/Boxplot switch for the survey-measure cells.
 * @param {SlHeaderControlContext} ctx - The app's control context.
 * @returns {object} The declared control.
 */
function vizMode(ctx) {
    return modeSwitchControl(ctx, {
        id: 'viz-mode',
        modes: [
            { id: 'stacked_bar', label: 'Balken', glossarySubKey: 'display-bars' },
            { id: 'boxplot', label: 'Boxplot', glossarySubKey: 'display-boxplots' },
        ],
        stateKey: 'vizMode',
        defaultMode: 'stacked_bar',
        resolveHidden() {
            // Balken/Boxplot switches nothing but Unterrichtsqualität and
            // Selbstwirksamkeit geometry — competence levels stack the same way in
            // both modes, and their columns are omitted when no aggregate row exists
            // (SlBaseTableModule._hasTeachingQualityData). Left standing over tables
            // that never built those columns, it is a button that visibly depresses
            // and changes nothing on screen — so it asks the same "has rows" question
            // the columns do, not merely whether the scale is shipped.
            const { hasTeachingQuality, hasSelfEfficacy } = ctx.getSurveyRows();
            if (!hasTeachingQuality && !hasSelfEfficacy) return true;
            // Hide on overview when in charts mode (thumbnails don't need viz toggle)
            const currentView = ctx.getStateValue('currentView');
            const displayModeValue = ctx.getStateValue('displayMode') || 'charts';
            return currentView === 'overview' && displayModeValue === 'charts';
        },
    });
}

/**
 * Build the Domäne selector for the Verlauf view; its items are injected at render time.
 * @param {SlHeaderControlContext} ctx - The app's control context.
 * @returns {object} The declared control.
 */
function domainSelect(ctx) {
    return {
        type: 'select',
        id: 'domain-select',
        options: {
            items: [], // Injected at render time via injectState
            defaultValue: '0',
            glossarySubKey: 'domain-select',
            containerClass: 'header-module-select header-module-select--wide',
            selectClass: 'control-select--card',
        },
        injectState(control) {
            const domainOptions = ctx.getLongitudinalDomainOptions();
            control.options.items = (domainOptions || []).map((opt) => ({
                value: String(opt.index),
                label: opt.label,
            }));
            control.options.defaultValue = String(ctx.getStateValue('selectedDomainIndex') ?? 0);
        },
        onChange(data) {
            ctx.updateState({ selectedDomainIndex: parseInt(data.selectedValue) });
        },
    };
}

/**
 * Build the toggle between the Verlauf view's two chart shapes.
 * @param {SlHeaderControlContext} ctx - The app's control context.
 * @returns {object} The declared control.
 */
function viewToggle(ctx) {
    return modeSwitchControl(ctx, {
        id: 'view-toggle',
        modes: [
            { id: 'normal', label: 'Normale Ansicht', glossarySubKey: 'normal-view' },
            { id: 'stacked', label: 'Gestapelte Ansicht', glossarySubKey: 'stacked-view' },
        ],
        stateKey: 'longitudinalViewMode',
        defaultMode: 'normal',
    });
}

/**
 * Build the Diagrammtyp toggle for the Verlauf view.
 * @param {SlHeaderControlContext} ctx - The app's control context.
 * @returns {object} The declared control.
 */
function chartTypeToggle(ctx) {
    return modeSwitchControl(ctx, {
        id: 'chart-type-toggle',
        modes: [
            { id: 'parallel', label: 'Punkte & Linien', glossarySubKey: 'parallel' },
            { id: 'boxplot', label: 'Boxplot', glossarySubKey: 'boxplot' },
        ],
        stateKey: 'longitudinalChartType',
        defaultMode: 'parallel',
        resolveHidden() {
            // Boxplot mode is a single combined chart — Unterrichtsqualität on the
            // upper scale, Selbstwirksamkeit on the lower — and it hides the separate
            // Selbstwirksamkeit card while active. With only one of the two scales it
            // would draw half a chart and pocket the card that still had data, so it
            // takes both or it is not offered.
            const { hasTeachingQuality, hasSelfEfficacy } = ctx.getHistorySurveyScales();
            return !(hasTeachingQuality && hasSelfEfficacy);
        },
    });
}

/**
 * Build the material-type button group.
 * @param {SlHeaderControlContext} ctx - The app's control context.
 * @returns {object} The declared control.
 */
function typeSelect(ctx) {
    return {
        type: 'buttonGroup',
        id: 'type-select',
        options: {
            items: MATERIAL_TYPE_OPTIONS,
            defaultValue: 'Übersicht',
            containerClass: 'header-module-button-group',
        },
        injectState(control) {
            control.options.defaultValue = ctx.getStateValue('materialType') || 'Übersicht';
        },
        onChange(data) {
            ctx.updateState({ materialType: data.selectedValue });
        },
    };
}

/**
 * Build the material-subject button group, narrowed to the dataset's own subjects.
 * @param {SlHeaderControlContext} ctx - The app's control context.
 * @returns {object} The declared control.
 */
function subjectSelect(ctx) {
    return {
        type: 'buttonGroup',
        id: 'subject-select',
        options: {
            // Narrowed to the dataset's own subjects in injectState.
            items: MATERIAL_SUBJECT_OPTIONS,
            defaultValue: 'Gesamt',
            containerClass: 'header-module-button-group',
        },
        injectState(control) {
            const items = ctx.getMaterialSubjectOptions();
            const selected = ctx.getStateValue('materialSubject') || 'Gesamt';
            control.options.items = items;
            // A dataset switch can leave a subject selected that the new one has no
            // button for; without this the group would render with nothing active.
            control.options.defaultValue = items.some((item) => item.value === selected)
                ? selected
                : 'Gesamt';
        },
        onChange(data) {
            ctx.updateState({ materialSubject: data.selectedValue });
        },
    };
}

/**
 * Build the SL per-view header configurations.
 * @param {SlHeaderControlContext} ctx - The app's control context, closed over by every control.
 * @returns {{[viewKey: string]: object}} One header config per view key.
 */
export function buildSlViewHeaderConfigs(ctx) {
    return {
        summary: {
            glossaryPath: 'sl.summary.header',
            controls: [schoolSelector(ctx), metricSelect(ctx)],
        },
        welcome: {
            glossaryPath: 'sl.welcome.header',
            controls: [],
        },
        overview: {
            glossaryPath: 'sl.overview.header',
            controls: [viewMode(ctx), displayMode(ctx), vizMode(ctx)],
        },
        comparison: {
            glossaryPath: 'sl.comparison.header',
            // The one SL view with authored tour copy (`sl.comparison.results`); the
            // other views' entries carry no `tutorial` copy yet.
            showInfoButton: true,
            controls: [],
        },
        longitudinal: {
            glossaryPath: 'sl.longitudinal.header',
            controls: [domainSelect(ctx), viewToggle(ctx), chartTypeToggle(ctx)],
        },
        material: {
            glossaryPath: 'sl.material.header',
            controls: [typeSelect(ctx), subjectSelect(ctx)],
        },
        report: REPORT_HEADER_CONFIG,
    };
}
