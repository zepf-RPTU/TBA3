/**
 * DataStore — shared raw-data storage and transformation cache.
 *
 * Holds payloads under named keys and caches derived datasets, so modules with
 * overlapping needs do not recompute the same structures. The sequence is
 * `setRawData` (datasetAcquisition does this once) → `defineDatasets` (key, inputs,
 * builder) → `getDataset`, where the first call computes and later calls hit the
 * cache. `getOrCompute(key, fn)` remains for ad-hoc memoization that is not a
 * declarable transformation.
 *
 * Injected through the standard `options` mechanism and never imported as a
 * singleton, so a test can supply a fresh instance.
 */

/**
 * @typedef {object} DatasetDefinition
 * @property {string[]} [inputs] Keys resolved before `build` runs: raw-data keys
 *                               first, otherwise other defined datasets.
 * @property {(...inputs: any[]) => *} build Produces the dataset from the
 *                                           resolved inputs, in declared order.
 */
export class DataStore {
    /** @type {Map<string, *>} Raw (untransformed) data keyed by logical name */
    #rawData = new Map();

    /** @type {Map<string, *>} Cached transformation results keyed by cache key */
    #cache = new Map();

    /**
     * @type {Map<string, DatasetDefinition>} Dataset wiring (key → inputs +
     * builder). Kept apart from `#cache`/`#rawData`: invalidation and `clear()`
     * drop data, never definitions — wiring is not data.
     */
    #definitions = new Map();

    /**
     * @type {Set<string>} Dataset keys currently being resolved by
     * `getDataset`, so a circular definition fails with a named error instead
     * of an anonymous stack overflow.
     */
    #resolving = new Set();

    // ====================================================================
    // RAW DATA
    // ====================================================================

    /**
     * Store a raw data payload under a named key.
     * @param {string} key  Logical name, e.g. 'en.competenceLevels'
     * @param {*}      data The raw data (typically a parsed JSON array/object)
     */
    setRawData(key, data) {
        this.#rawData.set(key, data);
    }

    /**
     * Retrieve a previously stored raw data payload.
     * @param {string} key - The raw payload key, as `setRawData` stored it.
     * @returns {*} The raw data, or `undefined` if not stored
     */
    getRawData(key) {
        return this.#rawData.get(key);
    }

    // ====================================================================
    // TRANSFORMATION CACHE
    // ====================================================================

    /**
     * Return a cached transformation result, or compute it via `computeFn`,
     * cache the result, and return it.
     * @param {string}   cacheKey  Unique key for this transformation
     * @param {Function} computeFn Zero-arg function that produces the result
     * @returns {*} The (possibly cached) transformation result
     */
    getOrCompute(cacheKey, computeFn) {
        if (this.#cache.has(cacheKey)) {
            return this.#cache.get(cacheKey);
        }
        const result = computeFn();
        this.#cache.set(cacheKey, result);
        return result;
    }

    // ====================================================================
    // DATASET CATALOG
    // ====================================================================

    /**
     * Declare derived datasets: for each key, which inputs it reads and the
     * function that builds it. Declaring is cheap — nothing is computed until
     * `getDataset` is first asked for the key.
     * @param {Record<string, DatasetDefinition>} definitions - Dataset key to its inputs and the function that builds it.
     * @throws {Error} if a key is already defined — each dataset has exactly
     *                 one authoritative definition
     */
    defineDatasets(definitions) {
        for (const [key, definition] of Object.entries(definitions)) {
            if (this.#definitions.has(key)) {
                throw new Error(`DataStore: dataset '${key}' is already defined`);
            }
            if (typeof definition?.build !== 'function') {
                throw new Error(`DataStore: dataset '${key}' has no build function`);
            }
            this.#definitions.set(key, definition);
        }
    }

    /**
     * Return a defined dataset by name, computing and caching it on first use.
     * Inputs resolve to raw data when a raw payload exists under the input key,
     * otherwise to another defined dataset (recursively).
     * @param {string} key - A key passed to `defineDatasets`.
     * @returns {*} The (possibly cached) dataset
     * @throws {Error} if the key was never defined — a typo fails here, loudly,
     *                 instead of rendering as silently empty data
     */
    getDataset(key) {
        if (this.#cache.has(key)) {
            return this.#cache.get(key);
        }
        const definition = this.#definitions.get(key);
        if (!definition) {
            throw new Error(
                `DataStore: unknown dataset '${key}' — not declared via defineDatasets()`,
            );
        }
        if (this.#resolving.has(key)) {
            throw new Error(`DataStore: circular dataset definition involving '${key}'`);
        }
        this.#resolving.add(key);
        try {
            const inputs = (definition.inputs ?? []).map((inputKey) =>
                this.#rawData.has(inputKey)
                    ? this.#rawData.get(inputKey)
                    : this.getDataset(inputKey),
            );
            const result = definition.build(...inputs);
            this.#cache.set(key, result);
            return result;
        } finally {
            this.#resolving.delete(key);
        }
    }
}
