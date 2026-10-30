/**
 * Store options that answer a dataset's requests from documents in hand, by file name, the
 * way the API would: a request's answer is its documents' value groups in declared order (a
 * whole document as it is), which the store splits back into the documents and checks. A
 * document a test does not name answers empty, as for a scope without those value groups.
 */

import { documentOf } from '../../src/common/data/documentSchemas.js';

/** @typedef {import('../../src/common/data/documentSchemas.js').Documents} Documents */
/** @typedef {import('../../src/common/data/index.js').DatasetRequest} DatasetRequest */
/**
 * Documents in hand, by file name: the store only reads and freezes them, so a shared frozen
 * fixture passes as it is.
 * @typedef {{[N in keyof Documents]?: Readonly<Documents[N]>}} DocumentsInHand
 */

/**
 * @param {ReadonlyArray<DatasetRequest>} requests - Every request the store may send.
 * @param {DocumentsInHand} documents - The documents its answers carry.
 * @returns {{requests: DatasetRequest[], loadRequest: (request: DatasetRequest) => Promise<unknown>}}
 * @throws {Error} for a document none of the requests declares
 */
export function documentsInHand(requests, documents) {
    const declared = new Set(requests.flatMap((request) => request.documents));
    for (const name of Object.keys(documents)) {
        if (!declared.has(/** @type {keyof Documents} */ (name))) {
            throw new Error(`No request declares the document in hand '${name}'`);
        }
    }
    /** @type {Record<string, unknown>} */
    const byName = documents;
    return {
        requests: [...requests],
        loadRequest: async (request) => {
            const [first] = request.documents;
            if (documentOf(first).bucket === 'whole') {
                if (!(first in byName)) throw new Error(`No document '${first}' in hand`);
                return byName[first];
            }
            return request.documents.flatMap(
                (name) => /** @type {unknown[]} */ (byName[name] ?? []),
            );
        },
    };
}
