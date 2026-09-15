/**
 * EN header controls — each control is one declared unit: what it shows
 * (type/id/options), the app state it reads (`injectState`), and the state it
 * writes (`onChange`). Factories close over the app's control context, so
 * the logic is assertable with a stubbed context and no DOM; the
 * HeaderOrchestrator invokes the callbacks and strips them before rendering.
 *
 * The config builder is deferred (called from initializeComponents) so the
 * data-derived EN config (domains, comparison groups) is available when the
 * domain-switch labels are resolved.
 */

import { datasetSelectorControl } from '../common/modules/header/datasetSelectorControl.js';
import { modeSwitchControl } from '../common/modules/header/modeSwitchControl.js';
import { REPORT_HEADER_CONFIG } from '../common/views/report/reportViewConfig.js';

/**
 * @typedef {object} EnHeaderControlContext
 * @property {(key: string) => *} getStateValue - Read one key of app state.
 * @property {(patch: object) => void} updateState - Merge a patch into app state.
 * @property {Array<{id: string, label: string}>} datasetOptions - Selectable class datasets
 * @property {{id: string, label: string}} currentDataset - The dataset the URL selected
 * @property {(datasetId: string) => void} navigate - Switch to another dataset
 */

/**
 * Build the class (dataset) selector, shown on the EN welcome view only: switching
 * classes reloads the page, so it is chosen where the user starts.
 * @param {EnHeaderControlContext} ctx - The app's control context.
 * @returns {object} The declared control.
 */
function classSelector(ctx) {
    return datasetSelectorControl(ctx, { id: 'class-selector', label: 'Klasse' });
}

/**
 * Build the Domäne switch: `Alle` plus one entry per registered domain.
 * @param {EnHeaderControlContext} ctx - The app's control context.
 * @param {Array<{id: string, label: string}>} domainModeOptions - The selectable modes, already labelled from the data-derived config.
 * @returns {object} The declared control.
 */
function domainSwitch(ctx, domainModeOptions) {
    return modeSwitchControl(ctx, {
        id: 'domain-switch',
        modes: domainModeOptions,
        stateKey: 'currentMode',
        defaultMode: 'all',
    });
}

/**
 * Build the EN per-view header configurations. Deferred so that the EN config
 * (domains, comparison groups) is available when the labels are resolved.
 * @param {EnHeaderControlContext} ctx - The app's control context, closed over by every control.
 * @param {import('./enConfig.js').EnConfig} enConfig - Supplies the domain ids and labels the switch offers.
 * @returns {{[viewKey: string]: object}} One header config per view key.
 */
export function buildEnViewHeaderConfigs(ctx, enConfig) {
    const [d0, d1] = enConfig.domainIds;
    const [label0, label1] = enConfig.domainLabels;
    const domainModeOptions = [
        { id: 'all', label: 'Alle' },
        { id: d0, label: label0 },
        { id: d1, label: label1 },
    ];

    return {
        welcome: {
            glossaryPath: 'en.welcome.header',
            showInfoButton: true,
            controls: [classSelector(ctx)],
        },
        overview: {
            glossaryPath: 'en.overview.header',
            showInfoButton: true,
            controls: [],
        },
        class: {
            glossaryPath: 'en.class.header',
            showInfoButton: true,
            controls: [domainSwitch(ctx, domainModeOptions)],
        },
        item: {
            glossaryPath: 'en.item.header',
            showInfoButton: true,
            controls: [domainSwitch(ctx, domainModeOptions)],
        },
        student: {
            glossaryPath: 'en.student.header',
            showInfoButton: true,
            controls: [domainSwitch(ctx, domainModeOptions)],
        },
        report: REPORT_HEADER_CONFIG,
    };
}
