/**
 * SL header controls — the per-view control declarations the app hands to the
 * HeaderOrchestrator. Every SL view waits for the documents before its header
 * renders, so a control's data reads find them landed.
 */

import { datasetSelectorControl } from '../common/modules/header/datasetSelectorControl.js';
import { stateChoiceControl } from '../common/modules/header/stateChoiceControl.js';
import {
    MATERIAL_TYPE_OPTIONS,
    SL_DATASETS,
    SUMMARY_METRICS,
    VIZ_MODES,
} from '@tba3/modules/sl-domain';
import {
    DETAILS_GROUPINGS,
    DISPLAY_MODES,
    LONGITUDINAL_CHART_TYPES,
    LONGITUDINAL_VIEW_MODES,
} from './slConstants.js';

/** @typedef {import('../common/modules/header/headerOrchestrator.js').HeaderControlDeclaration} HeaderControlDeclaration */

/** @typedef {import('../common/app/appModule.js').HeaderControlContext<import('./slAppModule.js').SlState>} SlHeaderControlContext */

/**
 * Build the Kennzahl selector for the Überblick view.
 * @param {SlHeaderControlContext} ctx
 * @returns {HeaderControlDeclaration}
 */
function metricSelect(ctx) {
    return stateChoiceControl(ctx, {
        type: 'select',
        id: 'metric-select',
        stateKey: 'summaryMetric',
        options: {
            glossarySubKey: 'metric-select',
            containerClass: 'header-module-select',
        },
        // The labels name the Kompetenzstufe each metric's band alias resolves to, so
        // they can only be built once the payload's scales are registered: per render,
        // not when this factory runs.
        resolveItems: () =>
            SUMMARY_METRICS.map((metric) => ({
                value: metric.id,
                label: metric.label(ctx.palette),
            })),
    });
}

/**
 * Build the Ansicht switch: by Fach or by group.
 * @param {SlHeaderControlContext} ctx
 * @returns {HeaderControlDeclaration}
 */
function detailsGrouping(ctx) {
    return stateChoiceControl(ctx, {
        type: 'modeSwitch',
        id: 'details-grouping',
        options: { glossarySubKey: 'grouping-group' },
        items: [
            { value: DETAILS_GROUPINGS.BY_SUBJECTS, glossarySubKey: 'display-subjects' },
            { value: DETAILS_GROUPINGS.BY_GROUPS, glossarySubKey: 'display-groups' },
        ],
        stateKey: 'detailsGrouping',
    });
}

/**
 * Build the Darstellung switch: chart thumbnails or tables.
 * @param {SlHeaderControlContext} ctx
 * @returns {HeaderControlDeclaration}
 */
function displayMode(ctx) {
    return stateChoiceControl(ctx, {
        type: 'modeSwitch',
        id: 'display-mode',
        options: { glossarySubKey: 'display-group' },
        items: [
            { value: DISPLAY_MODES.CHARTS, glossarySubKey: 'display-graphs' },
            { value: DISPLAY_MODES.TABLE, glossarySubKey: 'display-tables' },
        ],
        stateKey: 'displayMode',
    });
}

/**
 * Build the Balken/Boxplot switch for the survey measures, in the tables and the charts.
 * @param {SlHeaderControlContext} ctx
 * @returns {HeaderControlDeclaration}
 */
function vizMode(ctx) {
    return stateChoiceControl(ctx, {
        type: 'modeSwitch',
        id: 'viz-mode',
        options: { glossarySubKey: 'viz-group' },
        items: [
            { value: VIZ_MODES.STACKED_BAR, glossarySubKey: 'display-bars' },
            { value: VIZ_MODES.BOXPLOT, glossarySubKey: 'display-boxplots' },
        ],
        stateKey: 'vizMode',
        resolveHidden() {
            // Balken/Boxplot reshapes only the Unterrichtsqualität and Selbstwirksamkeit
            // marks of the tables and charts, which exist only with an aggregate row
            // (`SL_DATASETS.SURVEY_ROWS`): without them it changes nothing.
            const { hasTeachingQuality, hasSelfEfficacy } = ctx.documents.getDataset(
                SL_DATASETS.SURVEY_ROWS,
            );
            return !hasTeachingQuality && !hasSelfEfficacy;
        },
    });
}

/**
 * Build the Domäne selector for the Entwicklung view: one item per Bereich its cards
 * index, so an item's value is the index of the Bereich a card draws.
 * @param {SlHeaderControlContext} ctx
 * @returns {HeaderControlDeclaration}
 */
function domainSelect(ctx) {
    return stateChoiceControl(ctx, {
        type: 'select',
        id: 'domain-select',
        stateKey: 'selectedDomainIndex',
        options: {
            glossarySubKey: 'domain-select',
            containerClass: 'header-module-select header-module-select--wide',
        },
        resolveItems: () =>
            ctx.documents
                .getDataset(SL_DATASETS.LONGITUDINAL_SUBJECT_DOMAINS)
                .map(({ label }, index) => ({ value: String(index), label })),
        parseValue: (value) => parseInt(value, 10),
    });
}

/**
 * Build the toggle between the Entwicklung view's two line-chart shapes.
 * @param {SlHeaderControlContext} ctx
 * @returns {HeaderControlDeclaration}
 */
function viewToggle(ctx) {
    return stateChoiceControl(ctx, {
        type: 'modeSwitch',
        id: 'view-toggle',
        options: { glossarySubKey: 'view-group' },
        items: [
            { value: LONGITUDINAL_VIEW_MODES.NORMAL, glossarySubKey: 'normal-view' },
            { value: LONGITUDINAL_VIEW_MODES.STACKED, glossarySubKey: 'stacked-view' },
        ],
        stateKey: 'longitudinalViewMode',
        // Stacking applies to the line charts only.
        resolveHidden: () =>
            ctx.state.longitudinalChartType.value === LONGITUDINAL_CHART_TYPES.BOXPLOT,
    });
}

/**
 * Build the Diagrammtyp toggle for the Entwicklung view.
 * @param {SlHeaderControlContext} ctx
 * @returns {HeaderControlDeclaration}
 */
function chartTypeToggle(ctx) {
    return stateChoiceControl(ctx, {
        type: 'modeSwitch',
        id: 'chart-type-toggle',
        options: { glossarySubKey: 'chart-type-group' },
        items: [
            { value: LONGITUDINAL_CHART_TYPES.LINES, glossarySubKey: 'lines' },
            { value: LONGITUDINAL_CHART_TYPES.BOXPLOT, glossarySubKey: 'boxplot' },
        ],
        stateKey: 'longitudinalChartType',
        resolveHidden() {
            // The view builds its cards from the same probe.
            return !ctx.documents.getDataset(SL_DATASETS.HISTORY_SURVEY_SCALES).offersBoxPlot;
        },
    });
}

/**
 * Build the material-type switch.
 * @param {SlHeaderControlContext} ctx
 * @returns {HeaderControlDeclaration}
 */
function typeSelect(ctx) {
    return stateChoiceControl(ctx, {
        type: 'modeSwitch',
        id: 'type-select',
        options: { glossarySubKey: 'type-group' },
        stateKey: 'materialType',
        items: MATERIAL_TYPE_OPTIONS,
    });
}

/**
 * Build the material-subject switch: `Gesamt`, which has no page yet and cannot be
 * chosen, labelled by the glossary, then one button per Fach the dataset offers, named
 * as the payload names it.
 * @param {SlHeaderControlContext} ctx
 * @returns {HeaderControlDeclaration}
 */
function subjectSelect(ctx) {
    return stateChoiceControl(ctx, {
        type: 'modeSwitch',
        id: 'subject-select',
        options: { glossarySubKey: 'subject-group' },
        stateKey: 'materialSubject',
        resolveItems: () => [
            { value: 'Gesamt', glossarySubKey: 'general', disabled: true },
            ...ctx.documents
                .getDataset(SL_DATASETS.AVAILABLE_MATERIAL_SUBJECTS)
                .map((subjectName) => ({ value: subjectName, label: subjectName })),
        ],
    });
}

/**
 * Build the SL views' header controls.
 * @param {SlHeaderControlContext} ctx - Closed over by every control.
 * @returns {{[viewKey: string]: HeaderControlDeclaration[]}} The controls of each view that has any.
 */
export function buildSlViewHeaderControls(ctx) {
    return {
        summary: [datasetSelectorControl(ctx), metricSelect(ctx)],
        details: [detailsGrouping(ctx), displayMode(ctx), vizMode(ctx)],
        longitudinal: [domainSelect(ctx), viewToggle(ctx), chartTypeToggle(ctx)],
        material: [typeSelect(ctx), subjectSelect(ctx)],
    };
}
