/**
 * Dataset acquisition — the one path from "which dataset" to a populated DataStore.
 *
 * Each dashboard declares its acquisition once as a spec: which documents it needs,
 * where each lands in the DataStore, which document carries the competence-level
 * scales, and whether its items.json is split into value-group buckets. Everything
 * between the URL-selected dataset descriptor and a readable store happens here —
 * loader creation, the parallel fetch, scale registration, the comparison-group
 * split, the raw writes — so no app module knows endpoints, folders, `type`
 * discriminators, or raw-write key strings. App modules keep only their
 * app-specific derivations, working off the returned bundle.
 *
 * There is deliberately no error handling in this module: a rejection must reach
 * `bootstrapDashboardApp`'s inline error rendering untouched, including
 * `fetchApiJson`'s "server not reachable" message.
 *
 * A dataset descriptor carries exactly one source:
 *
 *   { id: '8a_mid', label: 'Klasse 8a',   folder: '8a_mid' }        // static fixture
 *   { id: 'groups/1', label: 'groups/1', scope: 'groups/1' }         // live API scope
 *
 * The endpoint templates (`datasetEndpoints.js`) are keyed by the file name each request
 * stands for, which is what lets one loader serve both sources.
 */

import { fetchJson, fetchApiJson, getApiBaseUrl, siteUrl } from './apiClient.js';
import { fillEndpoint } from './datasetEndpoints.js';
import { isComparisonValueGroup } from '@tba3/modules/domain';
import {
    notifyPaletteRepaint,
    registerCompetenceLevelScales,
    registerItemCompetenceScales,
} from '@tba3/modules/theme';

/**
 * A dataset's document loader, as returned by `createDatasetLoader`.
 * @typedef {(name: string) => Promise<any>} DatasetDocumentLoader
 */

/**
 * What one dashboard acquires, declared as a module-level const in the app module.
 * @typedef {object} DatasetAcquisitionSpec
 * @property {Record<string, string>} endpoints
 *           GROUP_ENDPOINTS or SCHOOL_ENDPOINTS (datasetEndpoints.js)
 * @property {string} [subject]
 *           Fachkürzel filter for API scopes ('en' / 'ma'); omitted for SL, whose
 *           school documents bundle every subject
 * @property {string} folderBase
 *           the app's fixture directory as a site path (`data/en/`), resolved via
 *           `siteUrl` at fetch time
 * @property {Record<string, string>} storeKeys
 *           document file name → DataStore raw key; each document is stored whole
 * @property {string} scaleDocument
 *           the document handed to `registerCompetenceLevelScales` — the aggregate
 *           competence-levels.json, whose rows carry the scale definitions
 * @property {string} [itemScaleDocument]
 *           the document whose items carry the Aufgabenniveau scale, handed to
 *           `registerItemCompetenceScales`; omit for an app that never reads item levels
 * @property {{document: string, classKey: string}} [itemsSplit]
 *           split this document into value-group buckets; only the class bucket is
 *           stored (under `classKey`), the others are returned for app-local use
 */

/**
 * The value-group buckets of one items.json document.
 * @typedef {object} ItemBuckets
 * @property {Array<any>} classItems      the class's own value group(s)
 * @property {Array<any>} comparisonItems every non-class group
 * @property {Array<any>} schoolItems     comparison groups of type 'school'
 * @property {Array<any>} stateItems      comparison groups of type 'state'
 * @property {Array<any>} otherItems      comparison groups of any other type
 */

/**
 * @typedef {object} AcquiredDataset
 * @property {Record<string, any>} documents      every fetched document, by file
 *           name; the split source is included unsplit
 * @property {ItemBuckets} [items]                present iff the spec asked for a split
 */

/**
 * The result shape when the spec declares an `itemsSplit` — lets the apps that
 * split (EN, MA) narrow `items` with a cast instead of a runtime guard.
 * @typedef {AcquiredDataset & {items: ItemBuckets}} AcquiredSplitDataset
 */

/**
 * Acquire a dashboard's dataset: fetch every declared document, register the
 * competence-level scales, split the items document when asked, and populate the
 * DataStore's raw keys.
 * @param {{id?: string, scope?: string, folder?: string}} dataset
 *        the selected dataset descriptor (see classSearchParams.js)
 * @param {DatasetAcquisitionSpec} spec - Which documents to fetch, which to split, and where the fixture folder sits.
 * @param {import('./dataStore.js').DataStore} dataStore - The store the fetched documents are written into.
 * @returns {Promise<AcquiredDataset>} The fetched documents, with the items split into class and comparison buckets when asked.
 */
export async function acquireDataset(dataset, spec, dataStore) {
    // The spec deliberately carries createDatasetLoader's exact option names.
    return acquireFromLoader(createDatasetLoader(dataset, spec), spec, dataStore);
}

/**
 * The orchestration behind `acquireDataset`, split off as the unit-test seam:
 * tests inject a stub `(name) => Promise<json>` instead of standing up fetch.
 * @param {DatasetDocumentLoader} loadDocument - Fetches one document by file name; the seam tests stub instead of standing up fetch.
 * @param {DatasetAcquisitionSpec} spec - Which documents to fetch, which to split, and where the fixture folder sits.
 * @param {import('./dataStore.js').DataStore} dataStore - The store the fetched documents are written into.
 * @returns {Promise<AcquiredDataset>} The fetched documents, with the items split into class and comparison buckets when asked.
 */
export async function acquireFromLoader(loadDocument, spec, dataStore) {
    // 1. Fan out: every stored document plus the split source, deduped, in
    //    parallel. One rejection rejects the whole acquisition before anything
    //    is registered or stored.
    const names = [
        ...new Set([
            ...Object.keys(spec.storeKeys),
            ...(spec.itemsSplit ? [spec.itemsSplit.document] : []),
        ]),
    ];
    const payloads = await Promise.all(names.map((name) => loadDocument(name)));
    const documents = Object.fromEntries(names.map((name, index) => [name, payloads[index]]));

    // 2. Register the competence-level scales before anything renders — they decide
    //    the band count, and with it every competence-level color, and
    //    `initializePageInteractions` reads them for the glossary entries.
    if (!(spec.scaleDocument in documents)) {
        throw new Error(
            `Scale document '${spec.scaleDocument}' is not among the acquired documents`,
        );
    }
    registerCompetenceLevelScales(documents[spec.scaleDocument]);
    // The Aufgabenniveau scale is a second vocabulary, registered in its own namespace so it
    // cannot answer a student level's lookup — see `registerItemCompetenceScales`. Guarded
    // like the scale document above: registration is silent about an empty payload (a
    // dataset may genuinely ship no items), so a document name that was never fetched would
    // disable every item colour, sort and preset without a word.
    if (spec.itemScaleDocument) {
        if (!(spec.itemScaleDocument in documents)) {
            throw new Error(
                `Item scale document '${spec.itemScaleDocument}' is not among the acquired documents`,
            );
        }
        registerItemCompetenceScales(documents[spec.itemScaleDocument]);
    }
    // The band count just changed, and whatever illustrates it sits outside any view.
    notifyPaletteRepaint();

    // 3. Optional value-group split, ahead of the writes so the class bucket can be
    //    stored alongside the whole documents.
    const items = spec.itemsSplit
        ? splitItemsByValueGroupType(documents[spec.itemsSplit.document])
        : undefined;

    // 4. Raw writes: whole documents per the spec's mapping, then the class bucket.
    //    The comparison buckets are not stored — their consumers derive from the
    //    returned bundle instead.
    for (const [name, key] of Object.entries(spec.storeKeys)) {
        dataStore.setRawData(key, documents[name]);
    }
    if (spec.itemsSplit && items) {
        dataStore.setRawData(spec.itemsSplit.classKey, items.classItems);
    }

    return { documents, items };
}

// ============================================================================
// PRIVATE HELPERS
// ============================================================================

/**
 * Separate an items.json document into the class group and its comparison
 * populations.
 *
 * Split on `type`, the spec's discriminator, not on `id`: only the sample fixtures
 * happen to use the literal ids 'school'/'state'. Real value-groups are identified
 * by their own key — a school number, `ni`, `nw-g` — so an id test files every
 * Landesschnitt under the class's own items and leaves the state comparison empty.
 *
 * The class side is the *only* enumerated one. Listing the accepted comparison
 * types instead and treating the remainder as the class is the same mistake in a
 * different place: a comparison population the client has no shape for would be
 * merged into the class's own item records and silently shift every class
 * percentage on the page.
 *
 * The partition never validates `type` — a missing type still fails loud, but
 * downstream in the adapters (`resolveAverageRole`), where the group is actually
 * consumed as a comparison population.
 * @param {Array<any>} valueGroups - The value groups from an items document.
 * @returns {ItemBuckets} The class's own items, and the comparison populations split out by type.
 */
function splitItemsByValueGroupType(valueGroups) {
    const classItems = valueGroups.filter((g) => !isComparisonValueGroup(g));
    const comparisonItems = valueGroups.filter(isComparisonValueGroup);
    const schoolItems = comparisonItems.filter((g) => g.type === 'school');

    // nw splits its Landesschnitt by track (HSA / HSA-GK / MSA / GY), so several
    // state groups can arrive. They are alternative comparison populations, not
    // parts of one: keep every group addressable by its payload id.
    const stateItems = comparisonItems.filter((g) => g.type === 'state');

    // Anything else the payload ships is still a comparison population; it draws
    // with the catch-all marker rather than being dropped or read as the class.
    const otherItems = comparisonItems.filter((g) => g.type !== 'school' && g.type !== 'state');

    return { classItems, comparisonItems, schoolItems, stateItems, otherItems };
}

/**
 * Resolve endpoint templates into absolute URLs for one scope.
 * @param {Record<string, string>} endpoints - GROUP_ENDPOINTS or SCHOOL_ENDPOINTS
 * @param {{scope: string, subject?: string, baseUrl?: URL}} options - The scope to fill in, an optional subject, and the API base to resolve against.
 * @returns {Record<string, URL>} One absolute URL per endpoint, keyed by document name.
 */
function apiUrls(endpoints, { scope, subject = '', baseUrl = getApiBaseUrl() }) {
    return Object.fromEntries(
        Object.entries(endpoints).map(([name, template]) => [
            name,
            new URL(fillEndpoint(template, scope, subject), baseUrl),
        ]),
    );
}

/**
 * Build the loader a dashboard uses to fetch its documents by file name.
 *
 * Callers name the same documents either way, so nothing downstream of the fetch has to
 * know which source answered.
 * @param {{id?: string, scope?: string, folder?: string}} dataset - the selected dataset descriptor
 * @param {{endpoints: Record<string, string>, subject?: string, folderBase: string}} options
 *        `folderBase` is the app's fixture directory as a site path (`data/<app>/`).
 * @returns {DatasetDocumentLoader} Fetches a named document — from the API when the descriptor carries a scope, from the fixture folder otherwise.
 */
function createDatasetLoader(dataset, { endpoints, subject = '', folderBase }) {
    if (dataset.scope) {
        const urls = apiUrls(endpoints, { scope: dataset.scope, subject });
        return (name) => {
            const url = urls[name];
            if (!url) {
                throw new Error(`No API endpoint declared for '${name}'`);
            }
            return fetchApiJson(url);
        };
    }

    if (!dataset.folder) {
        // Without this a descriptor carrying neither source resolves to `.../undefined/`
        // and every document 404s, which reads as a broken server rather than as the
        // malformed dataset entry it is.
        throw new Error(`Dataset '${dataset.id}' declares neither a scope nor a folder`);
    }

    const base = siteUrl(`${folderBase}${dataset.folder}/`);
    return (name) => fetchJson(name, base);
}
