/**
 * The API requests behind each dataset document, as templates.
 *
 * A dashboard names its documents by file name (`competence-levels.json`, …) whether
 * they come from a fixture folder or from the API; these templates are what turns a
 * file name into the request for one scope (`datasetAcquisition.js`). They are kept
 * in a leaf module with no imports because the fixture API (`config/fixtureApiPlugin.js`)
 * reads the same templates from Node to answer those requests off `public/data/` —
 * one source of truth for the contract on both sides.
 *
 * Each key is a document's file name; each value is the request that produces it.
 */

/**
 * EN and MA: one class. `{scope}` is `groups/<id>`, `{sub}` the Fachkürzel
 * (`en` / `ma`) that filters the response down to the dashboard's subject.
 */
export const GROUP_ENDPOINTS = {
    'competence-levels.json':
        '{scope}/competence-levels?domain={sub}&comparison=school-average,state-average',
    'items.json': '{scope}/items?domain={sub}&comparison=school-average,state-average',
    'aggregation.json': '{scope}/aggregations?domain={sub}&comparison=school-average,state-average',
    'students_competence-levels.json': '{scope}/competence-levels?type=students&domain={sub}',
    'students_aggregation.json': '{scope}/aggregations?type=students&domain={sub}',
    // Per-item Richtig/Falsch/Unbearbeitet. No `comparison`: only the scope's own items
    // have a three-way split (a state scope stores solve shares only).
    'items_aggregation.json': '{scope}/aggregations?type=items&aggregation=result&domain={sub}',
};

/**
 * SL: one school. `type=school,group` nests the school's own row and every one of its
 * classes in a single document, and there is no `domain` filter because a school
 * document bundles every subject.
 */
export const SCHOOL_ENDPOINTS = {
    'competence-levels.json':
        '{scope}/competence-levels?type=school,group&comparison=state-average',
    'items.json': '{scope}/items?type=school,group&comparison=state-average',
    'students_competence-levels.json': '{scope}/competence-levels?type=students',
    // Per-student Richtig/Falsch/Unbearbeitet, the source of the Vergleich view's
    // point records. `aggregation=result` is spelled out rather than left to the
    // default `competence,result`, which is considerably larger and carries competence
    // buckets SL reads from students_competence-levels.json instead.
    'students_aggregation.json': '{scope}/aggregations?type=students&aggregation=result',
    // The Entwicklung view's timeline. `comparison=year` is the prior-year convention
    // of the API; an API with one test cycle may answer it with generated value-groups
    // flagged `properties[simulated]`. `school` carries
    // the Kompetenzstufen series, one per (Fach, Domäne); `students` carries the
    // per-student `tq_mean` / `sp_mean` the survey timelines read. Not `group`: no card
    // plots a class series.
    'history.json': '{scope}/competence-levels?type=school,students&comparison=year',
};

/**
 * Fill one template for a scope.
 * @param {string} template - An entry of GROUP_ENDPOINTS or SCHOOL_ENDPOINTS.
 * @param {string} scope - `groups/<id>` or `schools/<id>`.
 * @param {string} [subject=''] - Fachkürzel for `{sub}`; irrelevant for school templates.
 * @returns {string} The request path with query, relative to the API base.
 */
export function fillEndpoint(template, scope, subject = '') {
    // Replacer functions, not replacement strings: `scope` comes off the URL, and a
    // literal `$&` in it would otherwise be expanded as a substitution pattern.
    return template.replace('{scope}', () => scope).replace('{sub}', () => subject);
}
