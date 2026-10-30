/**
 * The API requests behind each dataset, as templates, and the documents each one yields.
 *
 * A dashboard names its documents by file name (`competence-levels.json`, …) whether
 * they come from a fixture folder or from the API. One request can carry several of
 * them: `type=group,students` answers the group's and the students' value groups in one array,
 * and the `DocumentStore` splits the answer back into the documents by each value group's bucket
 * (`valueGroupBucketsFor`; each document's bucket is declared once, in `DOCUMENTS`). A request's
 * `file` is the fixture file that stands for its answer.
 */

import { documentOf } from './documentSchemas.js';
import { PROPERTY_KEY, VALUE_GROUP_TYPE } from '../domain/apiValueMaps.js';
import { getPropertyText } from '../domain/studentIdentity.js';

/**
 * One request and what its answer holds. An API request carries a `template`; a request
 * for a file the host serves itself (`info-boxes.json`) carries its `site` path
 * instead, and only the host's loader can answer it.
 * @typedef {object} DatasetRequest
 * @property {string} file - The fixture file holding the whole answer.
 * @property {string} [template] - The API request, `{scope}` still to fill.
 * @property {string} [site] - The site path the host serves `file` under.
 * @property {Array<import('./documentSchemas.js').DocumentName>} documents - The documents
 *           the answer holds. A value group whose bucket none of them takes fails the load.
 */

/** @typedef {import('./documentSchemas.js').ValueGroupBucket} ValueGroupBucket */

/**
 * The competence-levels and items requests of one group, filtered to the dashboard's
 * subject. The comparison value groups (`school-average`, `state-average`) attach to the
 * group's own, so they land in the `own` documents.
 * @param {'en' | 'ma'} subject - The Fachkürzel the `domain` filter takes.
 * @returns {Array<DatasetRequest>}
 */
function groupRequests(subject) {
    return [
        {
            file: 'competence-levels.json',
            template: `{scope}/competence-levels?type=group,students&domain=${subject}&comparison=school-average,state-average`,
            documents: ['competence-levels.json', 'students-competence-levels.json'],
        },
        {
            file: 'items.json',
            template: `{scope}/items?domain=${subject}&comparison=school-average,state-average`,
            documents: ['items.json'],
        },
    ];
}

/**
 * EN and MA: one group, `{scope}` is `groups/<id>`. Only the aggregations request differs.
 * @type {Record<'en' | 'ma', Array<DatasetRequest>>}
 */
export const GROUP_REQUESTS = {
    en: [
        ...groupRequests('en'),
        {
            // `items` adds the per-item Richtig/Falsch/Unbearbeitet split. The API emits
            // item value groups for the `result` kind only, which the default `competence,result`
            // includes, and never for a comparison scope (a state stores solve shares only).
            file: 'aggregations.json',
            template:
                '{scope}/aggregations?type=group,students,items&domain=en&comparison=school-average,state-average',
            documents: [
                'aggregations.json',
                'students-aggregations.json',
                'items-aggregations.json',
            ],
        },
    ],
    ma: [
        ...groupRequests('ma'),
        {
            // No `group` and no `competence` kind: MA has no style dimension, so nothing reads
            // a group's aggregations value group or a competence bucket.
            file: 'aggregations.json',
            template: '{scope}/aggregations?type=students,items&domain=ma&aggregation=result',
            documents: ['students-aggregations.json', 'items-aggregations.json'],
        },
    ],
};

/**
 * SL: one school. `type=school,group` nests the school's own value group and every one of its
 * groups in a single answer, and there is no `domain` filter because a school
 * document bundles every subject.
 * @type {Array<DatasetRequest>}
 */
export const SCHOOL_REQUESTS = [
    {
        // `year` adds the earlier test periods: the API stamps every value group with
        // its `properties[testPeriod]` and answers the current year first, so a value group
        // stamped other than the first one belongs to the earlier-years document.
        file: 'competence-levels.json',
        template:
            '{scope}/competence-levels?type=school,group,students&comparison=state-average,year',
        documents: [
            'competence-levels.json',
            'students-competence-levels.json',
            'prior-years.json',
        ],
    },
    {
        // Richtig/Falsch/Unbearbeitet for the school, its groups and the Landesschnitte
        // (the Lösungsquote), and per student.
        // `aggregation=result`, not the default `competence,result`: that answer is
        // larger and carries competence buckets the competence-levels
        // answer already holds.
        file: 'aggregations.json',
        template:
            '{scope}/aggregations?type=school,group,students&aggregation=result&comparison=state-average',
        documents: ['aggregations.json', 'students-aggregations.json'],
    },
];

/**
 * The test period a value group is stamped with (`properties[testPeriod]`), or `null` for none.
 * @param {{properties?: Array<{key: string, value: string}> | null}} valueGroup
 * @returns {string|null}
 */
function testPeriodOf(valueGroup) {
    return getPropertyText(valueGroup?.properties, PROPERTY_KEY.TEST_PERIOD) || null;
}

/**
 * How the value groups of one bundled answer split into buckets. In a request that asks for
 * years (one that declares a `priorYears` document) an earlier year comes first,
 * whatever its `type`: the API answers the current year first, so the first value group's
 * `testPeriod` names it, and a value group stamped with any other one is an earlier year
 * (a value group without a `testPeriod` is current). Any other request ignores `testPeriod`.
 * Then only the student and item value groups are enumerated: every other one (the scope's own, a group at school scope, and any
 * comparison population, including a type the client has no shape for) is `own`,
 * because the readers of those documents already treat the open set of comparison types
 * by `type` themselves.
 * @param {DatasetRequest} request
 * @param {Array<{type?: unknown, properties?: Array<{key: string, value: string}> | null}>} answer
 * @returns {(valueGroup: {type?: unknown, properties?: Array<{key: string, value: string}> | null}) => ValueGroupBucket} A value group's bucket.
 */
export function valueGroupBucketsFor(request, answer) {
    // Without a current stamp nothing is earlier, so a request without earlier years files none.
    const current = request.documents.some((name) => documentOf(name).bucket === 'priorYears')
        ? testPeriodOf(answer[0])
        : null;
    return (valueGroup) => {
        const period = testPeriodOf(valueGroup);
        if (current !== null && period !== null && period !== current) return 'priorYears';
        // Trimmed as the schema trims it on landing, or ` student` would be filed as `own`
        // and land there as `student`, a comparison population to every reader.
        const type = typeof valueGroup?.type === 'string' ? valueGroup.type.trim() : null;
        if (type === VALUE_GROUP_TYPE.STUDENT) return 'students';
        if (type === VALUE_GROUP_TYPE.ITEM) return 'items';
        return 'own';
    };
}

/**
 * Fill one template for a scope.
 * @param {string} template
 * @param {string} scope - `groups/<id>` or `schools/<id>`.
 * @returns {string} The request path with query, relative to the API base.
 */
export function fillEndpoint(template, scope) {
    // A replacer function, not a replacement string: `scope` comes off the URL, and a
    // literal `$&` in it would otherwise be expanded as a substitution pattern.
    return template.replace('{scope}', () => scope);
}
