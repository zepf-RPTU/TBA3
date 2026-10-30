/**
 * `@tba3/modules/documents` — where the cards' data comes from. `GROUP_REQUESTS` and
 * `SCHOOL_REQUESTS` name the TBA3 API requests and the documents each answer splits into;
 * a `DocumentStore` over them, loaded through `apiRequestLoader`, is the `documents` of
 * the context a host hands every card.
 */

export {
    GROUP_REQUESTS,
    SCHOOL_REQUESTS,
    fillEndpoint,
    valueGroupBucketsFor,
} from './datasetEndpoints.js';
export { DocumentStore } from './documentStore.js';
export { DocumentShapeError } from './documentSchemas.js';
export { apiRequestLoader } from './apiRequestLoader.js';
export { FETCH_TIMEOUT_MS, fetchJson, HttpError } from './fetchJson.js';

/** @typedef {import('./datasetEndpoints.js').DatasetRequest} DatasetRequest */
/**
 * @template T
 * @typedef {import('./documentStore.js').DatasetKey<T>} DatasetKey
 */
/** @typedef {import('./documentStore.js').DocumentList} DocumentList */
