/**
 * The documents a dataset's requests answer, fetched on demand and at most once per
 * request (a failed one is sent again, a malformed one is not), plus the datasets derived
 * from them.
 *
 * A card names what it reads (`ensure([...])`) and the store sends only the requests still
 * missing; N cards asking for overlapping documents share one request each. After
 * `ensure` resolves, `get` and `getDataset` answer synchronously.
 *
 * Every derivation is a dataset, built once per store and arguments: a value keyed by a
 * selection is a dataset with `params`, read with the selection as arguments. A build
 * reads only its declared inputs, so `ensure` of a key sees everything it needs.
 */

import { valueGroupBucketsFor } from './datasetEndpoints.js';
import { documentOf, validateDocuments } from './documentSchemas.js';

/** @typedef {import('./datasetEndpoints.js').DatasetRequest} DatasetRequest */
/** @typedef {import('./documentSchemas.js').Documents} Documents */

/**
 * A derived dataset: its name, the documents or datasets it reads, and the builder that
 * produces it, typed with what the builder returns and the arguments it is read with.
 * `dataset()` makes one; the key is the whole definition, so `getDataset` needs nothing
 * registered.
 * @template T
 * @template {unknown[]} [A=[]]
 * @typedef {object} DatasetKey
 * @property {string} name - Unique across the app, for messages.
 * @property {ReadonlyArray<DocumentName | DatasetKey<any, any>>} inputs - Resolved before
 *           `build` runs, in declared order. A parameterised input arrives as its reader,
 *           `(...args) => value`, memoised like any `getDataset`.
 * @property {((...args: A) => unknown[])|undefined} params - Only a parameterised dataset
 *           has one: what of its arguments the value depends on, the memo key.
 * @property {(...inputs: any[]) => T} build - Produces the dataset from the resolved inputs,
 *           then the store's dataset context, then the arguments it was read with.
 */

/** @typedef {import('./documentSchemas.js').DocumentName} DocumentName */

/**
 * What one input hands `build`: a document as validated, a dataset's value, or a
 * parameterised dataset's reader.
 * @template X
 * @typedef {X extends DocumentName ? Documents[X]
 *   : X extends DatasetKey<infer T, infer A> ? (A extends [] ? T : (...args: A) => T)
 *   : never} InputValue
 */

// The JSDoc type parser lacks variadic tuples; tsc checks this type.
/* oxlint-disable jsdoc-eslint/valid-types */
/**
 * What `build` is called with: each input's value in declared order, the store's dataset
 * context, then the arguments the dataset was read with.
 * @template {ReadonlyArray<unknown>} I
 * @template {unknown[]} A
 * @typedef {[...{[K in keyof I]: InputValue<I[K]>}, import('../context/moduleContext.js').DatasetContext, ...A]} BuildArgs
 */
/* oxlint-enable jsdoc-eslint/valid-types */

/**
 * What a card or chart declares it reads: document file names and dataset keys.
 * @typedef {ReadonlyArray<DocumentName | DatasetKey<any, any>>} DocumentList
 */

/** @typedef {(request: DatasetRequest) => Promise<unknown>} RequestLoader */

/**
 * @typedef {object} DocumentStoreOptions
 * @property {DatasetRequest[]} [requests] - Every request the store may send.
 * @property {RequestLoader} [loadRequest] - Sends one of them; required once a request is ensured.
 * @property {(documents: Partial<Documents>) => void} [onLand] - Called with each batch of
 *           documents as it lands, before any `ensure` resolves (`createModuleContext`
 *           registers the competence-level scales here).
 * @property {unknown} [datasetContext] - What every dataset builder gets after its inputs:
 *           the app context's glossary and palette.
 */

/**
 * Declare a derived dataset. Nothing is computed here: the dataset is built on its first
 * `getDataset` call, once per store and arguments. A key can only name keys declared
 * before it and is frozen, so the definitions cannot form a cycle.
 * @template {ReadonlyArray<DocumentName | DatasetKey<any, any>>} const I
 * @template T
 * @template {unknown[]} [A=[]]
 * @param {string} name - Unique across the app (`<app>.<name>`).
 * @param {object} definition
 * @param {I} definition.inputs
 * @param {(...args: A) => unknown[]} [definition.params] - Makes the dataset parameterised:
 *        read with arguments, built once per distinct `params(...args)`. `undefined` and
 *        `null` parts stay distinct.
 * @param {(...args: BuildArgs<I, A>) => T} definition.build - Its parameters are typed
 *        from `inputs`, in order: no cast needed.
 * @returns {DatasetKey<T, A>}
 */
export function dataset(name, { inputs, params, build }) {
    return Object.freeze({ name, inputs: Object.freeze([...inputs]), params, build });
}

export class DocumentStore {
    /** @type {Map<DocumentName, DatasetRequest>} document name → the request that answers it */
    #requestByDocument = new Map();

    /** @type {Map<DatasetRequest, Promise<void>>} one load per request; a failed one is dropped unless it failed on its answer */
    #loads = new Map();

    /** @type {Map<string, unknown>} landed documents by file name */
    #documents = new Map();

    /** @type {RequestLoader|undefined} */
    #loadRequest;

    /** @type {((documents: Partial<Documents>) => void)|undefined} */
    #onLand;

    /** @type {Map<DatasetKey<unknown, any>, Map<string, unknown>>} built datasets, by key and encoded arguments */
    #datasets = new Map();

    /** @type {unknown} */
    #datasetContext;

    /** @param {DocumentStoreOptions} [options] */
    constructor({ requests = [], loadRequest, onLand, datasetContext } = {}) {
        for (const request of requests) {
            for (const name of request.documents) {
                if (this.#requestByDocument.has(name)) {
                    throw new Error(`Document '${name}' is declared by more than one request`);
                }
                this.#requestByDocument.set(name, request);
            }
        }
        this.#loadRequest = loadRequest;
        this.#onLand = onLand;
        this.#datasetContext = datasetContext;
    }

    // ====================================================================
    // DOCUMENTS
    // ====================================================================

    /**
     * Make documents readable: send every request that answers one of `names` and has not
     * been sent yet, and wait for all of them. A dataset key stands for the documents it
     * reads, transitively.
     * @param {DocumentList} names
     * @returns {Promise<void>}
     * @throws {Error} for a name no request declares
     */
    async ensure(names) {
        /** @type {Set<DatasetRequest>} */
        const requests = new Set();
        /** @type {Set<DocumentName | DatasetKey<any>>} */
        const seen = new Set();
        for (const name of names) this.#collectRequests(name, requests, seen);
        await Promise.all([...requests].map((request) => this.#load(request)));
    }

    /**
     * `ensure` every document any request declares: the app's eager startup.
     * @returns {Promise<void>}
     */
    ensureAll() {
        return this.ensure([...this.#requestByDocument.keys()]);
    }

    /**
     * A landed document, typed by its schema.
     * @template {keyof Documents} N
     * @param {N} name
     * @returns {Documents[N]} The validated copy, frozen and shared by every reader.
     * @throws {Error} when the document has not landed; call `ensure` first
     */
    get(name) {
        if (!this.#documents.has(name)) {
            throw new Error(
                `DocumentStore: '${name}' was never ensured — call ensure([...]) first`,
            );
        }
        return /** @type {Documents[N]} */ (this.#documents.get(name));
    }

    // ====================================================================
    // DATASETS
    // ====================================================================

    /**
     * A dataset, built on first use from its landed inputs and cached; a parameterised
     * one per distinct `params(...args)`. Nothing is ever invalidated: documents only
     * land, so a value that follows anything else that changes does not belong here.
     * @template T
     * @template {unknown[]} A
     * @param {DatasetKey<T, A>} key
     * @param {A} args - The arguments of a parameterised dataset; none otherwise.
     * @returns {T}
     * @throws {Error} for an input that has not landed, or arguments to a dataset without `params`
     */
    getDataset(key, ...args) {
        if (!key.params && args.length > 0) {
            throw new Error(`DocumentStore: '${key.name}' takes no arguments`);
        }
        let built = this.#datasets.get(key);
        if (!built) this.#datasets.set(key, (built = new Map()));
        const memoKey = key.params ? JSON.stringify(key.params(...args), encodeUndefined) : '';
        if (built.has(memoKey)) return /** @type {T} */ (built.get(memoKey));
        const inputs = key.inputs.map((input) => {
            if (typeof input === 'string') return this.get(input);
            if (input.params)
                return (/** @type {unknown[]} */ ...inputArgs) =>
                    this.getDataset(input, ...inputArgs);
            return this.getDataset(input);
        });
        const result = key.build(...inputs, this.#datasetContext, ...args);
        built.set(memoKey, result);
        return result;
    }

    // ====================================================================
    // PRIVATE HELPERS
    // ====================================================================

    /**
     * @param {DocumentName | DatasetKey<any>} name
     * @param {Set<DatasetRequest>} into - Collects the requests still to send.
     * @param {Set<DocumentName | DatasetKey<any>>} seen - Names already walked, so a shared input is walked once.
     */
    #collectRequests(name, into, seen) {
        if (seen.has(name)) return;
        seen.add(name);
        if (typeof name !== 'string') {
            for (const input of name.inputs) this.#collectRequests(input, into, seen);
            return;
        }
        if (this.#documents.has(name)) return;
        const request = this.#requestByDocument.get(name);
        if (!request) {
            throw new Error(`DocumentStore: no request declares the document '${name}'`);
        }
        into.add(request);
    }

    /**
     * @param {DatasetRequest} request - Sent once; a pending or kept load is reused.
     * @returns {Promise<void>}
     */
    #load(request) {
        const pending = this.#loads.get(request);
        if (pending) return pending;
        const loadRequest = this.#loadRequest;
        if (!loadRequest) {
            throw new Error(`DocumentStore: no loader to send the request for '${request.file}'`);
        }
        let answered = false;
        // Async, so a loader that throws rejects like one whose fetch fails.
        const load = (async () => {
            const answer = await loadRequest(request);
            answered = true;
            this.#land(splitAnswer(request, answer), request);
        })();
        this.#loads.set(request, load);
        // A failed load is not kept, so the next ensure sends the request again; a load
        // that failed on its answer (its split or its shape) is: a retry cannot fix the
        // data, so later ensures reject at once.
        load.catch(() => {
            if (answered) return;
            if (this.#loads.get(request) === load) this.#loads.delete(request);
        });
        return load;
    }

    /**
     * Check, store and hand documents to `onLand`, before anything renders. The whole
     * batch is checked before any of it is stored: a request whose second document is
     * malformed leaves nothing readable, and `onLand` never sees it.
     * @param {Record<string, unknown>} documents - By file name.
     * @param {DatasetRequest} request
     * @throws {import('./documentSchemas.js').DocumentShapeError} for a document that does not have its shape
     */
    #land(documents, request) {
        const landed = validateDocuments(documents, request);
        for (const [name, value] of Object.entries(landed)) {
            this.#documents.set(name, deepFreeze(value));
        }
        this.#onLand?.(landed);
    }
}

/**
 * Split one request's answer into the documents it declares, by each value group's bucket.
 *
 * A value group whose bucket none of the request's documents takes fails the load: a
 * dropped one would vanish silently, and one filed under the wrong document would be
 * read as a comparison population by every reader of that document.
 * @param {DatasetRequest} request
 * @param {unknown} answer
 * @returns {Record<string, unknown>} The request's documents, by file name.
 */
function splitAnswer(request, answer) {
    const entries = request.documents.map((name) => /** @type {const} */ ([
        name,
        documentOf(name).bucket,
    ]));
    if (entries.some(([, bucket]) => bucket === 'whole')) {
        if (entries.length !== 1) {
            throw new Error(`'${request.file}' declares a whole document next to others`);
        }
        return { [entries[0][0]]: answer };
    }
    if (!Array.isArray(answer)) {
        throw new Error(`The answer to '${request.file}' is not an array of value groups`);
    }
    /** @type {Record<string, unknown[]>} */
    const documents = Object.fromEntries(entries.map(([name]) => [name, []]));
    const nameByBucket = new Map(entries.map(([name, bucket]) => [bucket, name]));
    const bucketOf = valueGroupBucketsFor(request, answer);
    for (const valueGroup of answer) {
        const bucket = bucketOf(valueGroup);
        const name = nameByBucket.get(bucket);
        if (!name) {
            throw new Error(
                `The answer to '${request.file}' carries a ${bucket} value group (type '${valueGroup?.type}') none of its documents takes`,
            );
        }
        documents[name].push(valueGroup);
    }
    return documents;
}

/**
 * Freeze a landed document and everything in it: every reader gets the same object, so
 * one that wrote into it would change what every other card shows.
 * @template T
 * @param {T} value - A validated document. Valibot copies what the schemas declare, but
 *   passes undeclared fields and `v.unknown()` values through by reference: those are
 *   the caller's own objects, and they are frozen too.
 * @returns {T} The same value, frozen.
 */
function deepFreeze(value) {
    const pending = [/** @type {Record<string, unknown>} */ (value)];
    while (pending.length > 0) {
        const current = Object.freeze(pending.pop());
        for (const key in current) {
            const child = current[key];
            if (child !== null && typeof child === 'object') {
                pending.push(/** @type {Record<string, unknown>} */ (child));
            }
        }
    }
    return value;
}

/**
 * `JSON.stringify` replacer for dataset arguments: an `undefined` or symbol part would
 * otherwise print as `null` (in an array) or vanish (in an object), so two selections would
 * share a key.
 * @param {string} _key
 * @param {unknown} value
 * @returns {unknown}
 */
function encodeUndefined(_key, value) {
    if (value === undefined) return { undefined: true };
    return typeof value === 'symbol' ? { symbol: value.description } : value;
}
