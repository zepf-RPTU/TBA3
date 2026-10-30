/**
 * Dataset acquisition — the loader a dashboard's `DocumentStore` sends its requests with,
 * for the dataset the URL selected.
 *
 * A dataset descriptor carries exactly one source:
 *
 *   { id: 'groups/8a_mid', label: 'Lerngruppe 8a', folder: '8a_mid' }   // static fixture
 *   { id: 'groups/1', label: 'groups/1', scope: 'groups/1' }            // live API scope
 *
 * A request names the fixture file that stands for its answer, which is what lets one
 * loader serve both sources; a request with a `site` path is a file the site serves for
 * every dataset. No error handling here: a rejection travels untouched, so its class
 * (`ApiUnreachableError`, `DocumentShapeError`) still names the cause the reader sees
 * (`loadCauseKey`).
 */

import { fetchApiJson, getApiBaseUrl, siteUrl } from './apiClient.js';
import { apiRequestLoader, fetchJson } from '@tba3/modules/documents';

/** @typedef {import('@tba3/modules/documents').DatasetRequest} DatasetRequest */

/**
 * Build the loader a dashboard sends its requests with.
 *
 * A request's answer is the same array from either source, so nothing downstream of the
 * fetch has to know which one answered.
 * @param {{id?: string, scope?: string, folder?: string}} dataset
 * @param {string} appId - The dashboard (`en`, `ma`, `sl`); its fixtures live under `data/<appId>/`.
 * @returns {(request: DatasetRequest) => Promise<unknown>}
 */
export function createDatasetLoader(dataset, appId) {
    const datasetRequest = dataset.scope
        ? apiRequestLoader({
              baseUrl: getApiBaseUrl(),
              scope: dataset.scope,
              fetchJson: fetchApiJson,
          })
        : createFixtureLoader(dataset, `data/${appId}/`);
    return (request) =>
        request.site ? fetchJson(request.file, siteUrl(request.site)) : datasetRequest(request);
}

/**
 * @param {{id?: string, folder?: string}} dataset - A fixture dataset descriptor.
 * @param {string} folderBase - The app's fixture directory as a site path.
 * @returns {(request: DatasetRequest) => Promise<unknown>} Loads a request's fixture file.
 */
function createFixtureLoader(dataset, folderBase) {
    if (!dataset.folder) {
        // Without this a descriptor carrying neither source resolves to `.../undefined/`
        // and every document 404s, which reads as a broken server rather than as the
        // malformed dataset entry it is.
        throw new Error(`Dataset '${dataset.id}' declares neither a scope nor a folder`);
    }
    const base = siteUrl(`${folderBase}${dataset.folder}/`);
    return (request) => fetchJson(request.file, base);
}
