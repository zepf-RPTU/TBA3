/**
 * A fresh test context for one subject whose `DocumentStore` is real, built as the app
 * builds it: the subject's requests answered from the documents in hand, every document a
 * test does not name landing empty (as an API answer for a scope without those value
 * groups would), the scales registering with the context's palette as they land.
 */

import { GROUP_REQUESTS, SCHOOL_REQUESTS } from '../../src/common/data/index.js';
import { documentsInHand } from './documentsInHand.js';
import { createTestContext } from './glossaryFixture.js';

/** @typedef {import('../../src/common/data/documentSchemas.js').Documents} Documents */
/** @typedef {import('../../src/common/data/documentStore.js').DatasetKey<any, any>} AnyDatasetKey */
/** @typedef {import('./documentsInHand.js').DocumentsInHand} DocumentsInHand */

/** The site file SL's host serves beside the API answers. */
const INFO_BOXES_REQUEST = Object.freeze({
    file: 'info-boxes.json',
    site: 'data/sl/',
    documents: /** @type {Array<keyof Documents>} */ (['info-boxes.json']),
});

/**
 * Every request a subject's store may send: a group's for EN and MA, a school's and the
 * info-box site file for SL.
 * @param {'en'|'ma'|'sl'} subject
 * @param {DocumentsInHand} [documents]
 * @returns {ReturnType<typeof documentsInHand>}
 */
export function subjectDocumentsInHand(subject, documents = {}) {
    return documentsInHand(
        subject === 'sl' ? [...SCHOOL_REQUESTS, INFO_BOXES_REQUEST] : GROUP_REQUESTS[subject],
        documents,
    );
}

/**
 * The context, its documents landed. `datasets` pins derived datasets a suite supplies
 * directly: `getDataset` answers a pinned key with its value, and a dataset built from a
 * pinned one reads the pin too. The info boxes land only when the test hands them in.
 * @param {'en'|'ma'|'sl'} subject
 * @param {object} [given]
 * @param {DocumentsInHand} [given.documents] - Documents by file name.
 * @param {Iterable<[AnyDatasetKey, unknown]>} [given.datasets] - Dataset key → its value.
 * @returns {Promise<import('../../src/common/context/index.js').ModuleContext>}
 */
export async function createSubjectContext(subject, { documents = {}, datasets = [] } = {}) {
    const context = createTestContext(subject, subjectDocumentsInHand(subject, documents));
    const store = context.documents;
    await (subject === 'sl'
        ? store.ensure([
              ...SCHOOL_REQUESTS.flatMap((request) => request.documents),
              ...Object.keys(documents).map((name) => /** @type {keyof Documents} */ (name)),
          ])
        : store.ensureAll());

    /** @type {Map<AnyDatasetKey, unknown>} */
    const pinned = new Map(datasets);
    if (pinned.size > 0) {
        const build = store.getDataset.bind(store);
        // On the instance, so the store's own reads of a dataset's inputs see the pins.
        store.getDataset = /** @type {typeof store.getDataset} */ (
            (key, ...args) => (pinned.has(key) ? pinned.get(key) : build(key, ...args))
        );
    }
    return context;
}
