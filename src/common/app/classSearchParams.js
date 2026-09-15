/**
 * Which dataset a dashboard page shows, read off the URL.
 *
 * `?class=<id>` picks one of the app's curated datasets — the demo fixtures.
 * `?scope=<level>/<id>` (e.g. `?scope=schools/<school id>`) bypasses the list entirely and
 * asks the API for any scope it can resolve: a school or class from a running API server,
 * or a fixture folder served by the fixture API (`?scope=schools/sl`).
 */

/**
 * The selected dataset descriptor.
 * @param {Array<{id: string, label: string}>} datasetOptions - The curated dataset list, in selector order.
 * @param {string} defaultId - Dataset shown when the URL names none.
 * @param {string} [search=window.location.search] - Query string to read; injectable for tests.
 * @returns {{id: string, label: string, scope?: string, folder?: string}} The descriptor to load — an ad-hoc `?scope=` wins over `?class=`, which wins over the default.
 */
export function resolveSelectedDataset(datasetOptions, defaultId, search = window.location.search) {
    const params = new URLSearchParams(search);

    const scope = params.get('scope');
    if (scope) {
        return { id: scope, label: scope, scope };
    }

    const selectedId = params.get('class');
    const selected =
        datasetOptions.find(({ id }) => id === selectedId) ??
        datasetOptions.find(({ id }) => id === defaultId);
    if (!selected) {
        throw new Error(`Default dataset '${defaultId}' is not one of the app's datasets`);
    }
    return selected;
}

/**
 * The dataset selector's entries. An ad-hoc `?scope=` dataset is not in the curated
 * list, so it is appended — otherwise the selector would show some other dataset's
 * label while the page displays this one's data.
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

/**
 * Navigate to another curated dataset. Drops `scope`, which would otherwise keep
 * winning over the `class` just chosen.
 * @param {string} classId - Curated dataset id to switch to.
 * @param {Location} [location=window.location] - Location to navigate; injectable for tests.
 */
export function navigateToClass(classId, location = window.location) {
    const params = new URLSearchParams(location.search);
    params.set('class', classId);
    params.delete('scope');
    location.search = params.toString();
}
