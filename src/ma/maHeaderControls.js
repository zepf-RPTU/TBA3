/**
 * MA header controls — each control is one declared unit: what it shows
 * (type/id/options), the app state it reads (`injectState`), and the state it
 * writes (`onChange`). Factories close over the app's control context, so
 * the logic is assertable with a stubbed context and no DOM; the
 * HeaderOrchestrator invokes the callbacks and strips them before rendering.
 */

import { datasetSelectorControl } from '../common/modules/header/datasetSelectorControl.js';
import { modeSwitchControl } from '../common/modules/header/modeSwitchControl.js';
import { REPORT_HEADER_CONFIG } from '../common/views/report/reportViewConfig.js';

/**
 * @typedef {object} MaHeaderControlContext
 * @property {(key: string) => *} getStateValue - Read one key of app state.
 * @property {(patch: object) => void} updateState - Merge a patch into app state.
 * @property {Array<{id: string, label: string}>} datasetOptions - Selectable class datasets
 * @property {{id: string, label: string}} currentDataset - The dataset the URL selected
 * @property {(datasetId: string) => void} navigate - Switch to another dataset
 */

/**
 * Build the class (dataset) selector, shown on the MA welcome view only: switching
 * classes reloads the page, so it is chosen where the user starts.
 * @param {MaHeaderControlContext} ctx - The app's control context.
 * @returns {object} The declared control.
 */
function classSelector(ctx) {
    return datasetSelectorControl(ctx, { id: 'class-selector', label: 'Klasse' });
}

/**
 * Build the layout switch, which decides how much of the view the task rings get.
 * @param {MaHeaderControlContext} ctx - The app's control context.
 * @returns {object} The declared control.
 */
function layoutMode(ctx) {
    return modeSwitchControl(ctx, {
        id: 'layout-mode',
        modes: [
            { id: 'both', label: 'Beide anzeigen' },
            { id: 'table-only', label: 'Nur Tabelle' },
            { id: 'chart-only', label: 'Nur Diagramme' },
        ],
        stateKey: 'layoutMode',
        defaultMode: 'both',
    });
}

/**
 * Build the MA per-view header configurations.
 * @param {MaHeaderControlContext} ctx - The app's control context, closed over by every control.
 * @returns {{[viewKey: string]: object}} One header config per view key.
 */
export function buildMaViewHeaderConfigs(ctx) {
    return {
        welcome: {
            glossaryPath: 'ma.welcome.header',
            controls: [classSelector(ctx)],
        },
        overview: {
            glossaryPath: 'ma.overview.header',
            controls: [],
        },
        class: {
            glossaryPath: 'ma.class.header',
            showInfoButton: true,
            controls: [],
        },
        item: {
            glossaryPath: 'ma.items.header',
            showInfoButton: true,
            controls: [layoutMode(ctx)],
        },
        student: {
            glossaryPath: 'ma.student.header',
            showInfoButton: true,
            controls: [layoutMode(ctx)],
        },
        report: REPORT_HEADER_CONFIG,
        help: {
            glossaryPath: 'ma.help.header',
            controls: [],
        },
    };
}
