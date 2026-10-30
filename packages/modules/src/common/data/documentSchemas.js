/**
 * The shape every document must have when it lands: one schema per document name (see
 * schemas/), checked by the DocumentStore before anything reads the document. A document
 * that fails is not stored; the load rejects with a `DocumentShapeError` naming the
 * request, the document, the value group and the field, in development and in
 * production alike.
 *
 * The schemas are TBA3's consumer contract, not the API spec: they require what TBA3
 * reads and every app's value groups carry, and check the type of everything else it reads
 * wherever it is present.
 */

import * as v from 'valibot';
import { AggregationsValueGroup, StudentAggregationsValueGroup } from './schemas/aggregations.js';
import {
    CompetenceLevelsDocument,
    CurrentCompetenceLevelsDocument,
    StudentCompetenceLevelsDocument,
} from './schemas/competenceLevels.js';
import { InfoBoxes } from './schemas/infoBoxes.js';
import { ItemsValueGroup } from './schemas/items.js';

/** @typedef {import('./datasetEndpoints.js').DatasetRequest} DatasetRequest */

/**
 * Which document a value group of a bundled answer belongs to (see `valueGroupBucketsFor`); `whole` takes
 * the answer as it is, for a document that is not an array of value groups.
 * @typedef {'own' | 'students' | 'items' | 'priorYears' | 'whole'} ValueGroupBucket
 */

/** The issues a message lists before it summarises the rest. */
const MAX_LISTED_ISSUES = 5;

/**
 * Every document TBA3 reads, by file name: the bucket of a bundled answer's value groups
 * that forms it, and its schema: an array of value groups, or, for a document taken whole, the
 * document.
 */
const DOCUMENTS = {
    'competence-levels.json': { bucket: 'own', schema: CurrentCompetenceLevelsDocument },
    'students-competence-levels.json': {
        bucket: 'students',
        schema: StudentCompetenceLevelsDocument,
    },
    'prior-years.json': { bucket: 'priorYears', schema: CompetenceLevelsDocument },
    'items.json': { bucket: 'own', schema: v.array(ItemsValueGroup) },
    'aggregations.json': { bucket: 'own', schema: v.array(AggregationsValueGroup) },
    'students-aggregations.json': {
        bucket: 'students',
        schema: v.array(StudentAggregationsValueGroup),
    },
    'items-aggregations.json': { bucket: 'items', schema: v.array(AggregationsValueGroup) },
    'info-boxes.json': { bucket: 'whole', schema: InfoBoxes },
};

/** @typedef {keyof typeof DOCUMENTS} DocumentName */

/**
 * Every document as it lands, by file name: the schema's output.
 * @typedef {{[N in DocumentName]: v.InferOutput<typeof DOCUMENTS[N]['schema']>}} Documents
 */

/**
 * @param {string} name
 * @returns {{bucket: ValueGroupBucket, schema: v.GenericSchema}}
 * @throws {Error} for a name DOCUMENTS does not declare
 */
export function documentOf(name) {
    const declared =
        /** @type {{[name: string]: {bucket: ValueGroupBucket, schema: v.GenericSchema}|undefined}} */ (
            DOCUMENTS
        )[name];
    if (!declared) throw new Error(`DocumentStore: '${name}' is not a document TBA3 reads`);
    return declared;
}

/** A document that does not have the shape TBA3 reads. */
export class DocumentShapeError extends Error {
    /**
     * @param {string} document - The file name.
     * @param {DatasetRequest} request
     * @param {v.BaseIssue<unknown>[]} issues - Every issue Valibot found, at least one.
     * @param {boolean} valueGroups - Whether the document is an array of value groups.
     */
    constructor(document, request, issues, valueGroups) {
        const source = ` (answer to '${request.template ?? request.file}')`;
        const listed = issues
            .slice(0, MAX_LISTED_ISSUES)
            .map((issue) => describeIssue(issue, valueGroups));
        const more =
            issues.length > MAX_LISTED_ISSUES
                ? ` (+${issues.length - MAX_LISTED_ISSUES} more)`
                : '';
        super(`Document '${document}'${source} is malformed: ${listed.join('; ')}${more}`);
        this.name = 'DocumentShapeError';
    }
}

/**
 * Check a batch of documents and return them as validated copies.
 * @param {Record<string, unknown>} documents - By file name.
 * @param {DatasetRequest} request
 * @returns {Partial<Documents>}
 * @throws {DocumentShapeError} for the first document that does not have its shape
 * @throws {Error} for a name DOCUMENTS does not declare
 */
export function validateDocuments(documents, request) {
    return Object.fromEntries(
        Object.entries(documents).map(([name, value]) => {
            const { schema } = documentOf(name);
            const result = v.safeParse(schema, value, { abortPipeEarly: true });
            if (!result.success) {
                throw new DocumentShapeError(name, request, result.issues, schema.type === 'array');
            }
            return [name, result.output];
        }),
    );
}

/**
 * @param {v.BaseIssue<unknown>} issue
 * @param {boolean} valueGroups - Whether the document is an array of value groups, so the path starts at one.
 * @returns {string} The issue as one clause of the error message, e.g.
 *   `value group 0 (group '8b') competenceLevels.2.nameShort: Invalid type: …`.
 */
function describeIssue(issue, valueGroups) {
    const [head, ...rest] = issue.path ?? [];
    if (!valueGroups || !head) {
        return `${v.getDotPath(issue) || '(the document)'}: ${issue.message}`;
    }
    const label = valueGroupLabelOf(head.value);
    const field = rest.map((item) => String(item.key)).join('.') || '(the value group)';
    return `value group ${String(head.key)}${label ? ` (${label})` : ''} ${field}: ${issue.message}`;
}

/**
 * @param {unknown} valueGroup - Unvalidated, as the answer carries it.
 * @returns {string|null} Its `type` and `id`, where it has them.
 */
function valueGroupLabelOf(valueGroup) {
    if (!valueGroup || typeof valueGroup !== 'object') return null;
    const { type, id } = /** @type {{type?: unknown, id?: unknown}} */ (valueGroup);
    const parts = [typeof type === 'string' ? type : '', id == null ? '' : `'${String(id)}'`];
    return parts.filter(Boolean).join(' ') || null;
}
