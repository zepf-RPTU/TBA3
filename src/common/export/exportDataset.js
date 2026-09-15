/**
 * Which dataset the page is showing, made available to the export layer.
 *
 * Switching dataset is a full page reload (`classSearchParams.js` assigns
 * `location.search`), while the batch-export cart survives in localStorage. The
 * export layer therefore has to know which dataset a capture came from, or a
 * tick made under one class silently restores itself under the next and the two
 * captures overwrite each other.
 *
 * The app sets this rather than the export layer reading the URL: without
 * `?class=` the URL says nothing about which dataset the default resolves to,
 * so first load and "picked the same dataset from the selector" would look like
 * two different datasets.
 */

/** @type {{id: string, label: string}} */
let current = { id: '', label: '' };

/**
 * Record the dataset this page is showing. Called once per app during init.
 * @param {{id?: string, label?: string}|null} dataset - The resolved dataset descriptor
 */
export function setExportDataset(dataset) {
    current = {
        id: String(dataset?.id ?? ''),
        label: String(dataset?.label ?? dataset?.id ?? ''),
    };
}

/**
 * @returns {{id: string, label: string}} Empty ids before the app sets one.
 */
export function getExportDataset() {
    return current;
}
