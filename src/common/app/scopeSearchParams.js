/**
 * Which dataset a dashboard page shows, read off the URL.
 *
 * `?scope=<level>/<id>` names it the way the API does (`groups/<id>`, `schools/<id>`).
 * A scope the app lists is one of its curated demo datasets and loads from its fixture
 * folder; any other scope is asked of the API.
 */

import { FOCUSABLE } from '@tba3/module-base';
import { readJson, writeJson } from '../services/jsonStorage.js';

/**
 * The selected dataset descriptor.
 * @param {Array<{id: string, label: string}>} datasetOptions - The curated dataset list, in selector order; each id is a scope.
 * @param {string} defaultId - Dataset shown when the URL names none.
 * @returns {{id: string, label: string, scope?: string, folder?: string}} The descriptor to load: the curated entry the `?scope=` names, an ad-hoc API descriptor for any other scope, else the default.
 */
export function resolveSelectedDataset(datasetOptions, defaultId) {
    const scope = new URLSearchParams(window.location.search).get('scope');
    if (scope) {
        return datasetOptions.find(({ id }) => id === scope) ?? { id: scope, label: scope, scope };
    }

    const selected = datasetOptions.find(({ id }) => id === defaultId);
    if (!selected) {
        throw new Error(`Default dataset '${defaultId}' is not one of the app's datasets`);
    }
    return selected;
}

/**
 * The dataset selector's entries. An ad-hoc scope is not in the curated list, so it is
 * appended — otherwise the selector would show some other dataset's label while the
 * page displays this one's data.
 * @param {Array<{id: string, label: string}>} datasetOptions - The curated dataset list, in selector order.
 * @param {{id: string, label: string}} selected - The dataset actually loaded, appended when the curated list does not contain it.
 * @returns {Array<{value: string, label: string}>} The selector entries, always including the selected one.
 */
export function datasetSelectorItems(datasetOptions, selected) {
    const items = datasetOptions.map(({ id, label }) => ({ value: id, label }));
    return items.some(({ value }) => value === selected.id)
        ? items
        : [...items, { value: selected.id, label: selected.label }];
}

/** Session key for `{id}`, the control that asked for a dataset switch. */
const REFOCUS_KEY = 'tba3:scope-switch-focus';

/**
 * Navigate to another dataset: a full reload with its scope on the URL. The reload
 * drops the focus to the page, so the control that asked for it is remembered for
 * `restoreScopeSwitchFocus` (the closest ancestor with an id, the header control).
 * @param {string} scope - The dataset's scope id.
 */
export function navigateToScope(scope) {
    const holder = document.activeElement?.closest('[id]');
    if (holder) writeJson(REFOCUS_KEY, { id: holder.id }, 'sessionStorage');
    const params = new URLSearchParams(window.location.search);
    params.set('scope', scope);
    window.location.search = params.toString();
}

/**
 * After the reload a dataset switch caused: give the focus back to the control that
 * asked for it, once the shell shows it. A one-shot: the key is cleared on read.
 */
export function restoreScopeSwitchFocus() {
    const id = readJson(REFOCUS_KEY, 'sessionStorage')?.id;
    if (id === undefined) return;
    writeJson(REFOCUS_KEY, null, 'sessionStorage');
    const holder = document.getElementById(id);
    const target = holder?.matches(FOCUSABLE) ? holder : holder?.querySelector(FOCUSABLE);
    if (target instanceof HTMLElement) target.focus();
}
