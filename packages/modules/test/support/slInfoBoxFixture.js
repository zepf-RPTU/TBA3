/**
 * Payload fixtures for the SL info-box query layer (`CompetenceShareQueries`): the
 * helpers that wire value groups into a store, and the dashboard school every query
 * suite reads. Each builder documents the contrast its numbers produce.
 */

import {
    SCHOOL_ID,
    STATE_ID,
    competenceValueGroup,
    gerLevels,
    resultValueGroup,
    romanLevels,
} from './slValueGroupFactories.js';
import { COMPETENCE_SHARES } from '../../src/sl/utils/slCompetenceShares.js';
import { SOLUTION_RATES } from '../../src/sl/utils/slSolutionRates.js';
import { createSubjectContext } from './subjectContext.js';

/** @typedef {import('../../src/sl/utils/slCompetenceShares.js').CompetenceShareQueries} CompetenceShareQueries */
/** @typedef {import('../../src/sl/utils/slSolutionRates.js').SolutionRateQueries} SolutionRateQueries */

/** @typedef {import('./competenceLevelGroups.js').CurrentLevelsValueGroup} CurrentLevelsValueGroup */
/** @typedef {import('../../src/common/data/schemas/aggregations.js').AggregationsValueGroup} AggregationsValueGroup */
/** @typedef {import('../../src/common/context/index.js').ModuleContext} ModuleContext */

/**
 * The answers behind every Lerngruppe's and the Landesschnitt's result value group, so
 * their right answers read as a percentage.
 */
const RESPONSES_PER_GROUP = 100;

/**
 * An SL school's payload: its `competence-levels.json` value groups and its `aggregations.json` value groups.
 * @typedef {object} SlPayload
 * @property {CurrentLevelsValueGroup[]} competenceLevels
 * @property {AggregationsValueGroup[]} [aggregation] - The result value groups; none by default.
 */

/**
 * The params a bound verb takes: the verb's own, with `target` as a template writes it
 * and `levelNames` optional.
 * @template P
 * @typedef {Omit<P, 'target' | 'levelNames'> & {target?: import('../../src/sl/utils/slQueryPrimitives.js').QueryTarget, levelNames?: string[]}} BoundParams
 */

/**
 * A module's verbs bound to a share helper: each takes its params alone.
 * @template TVerbs
 * @typedef {{[K in keyof TVerbs]: TVerbs[K] extends (queries: CompetenceShareQueries, params: infer P) => infer R ? (params?: BoundParams<P>) => R : never}} BoundVerbs
 */

/**
 * A fresh SL context whose store holds a school's value groups, their scales registered on its
 * palette.
 *
 * One store per call: the store builds `COMPETENCE_LEVEL_INDEX` once and caches it, so a
 * suite that swapped value groups in one store between calls would read a stale index.
 * A suite that resolves a band alias against the same scales reads this context's palette.
 * @param {SlPayload} payload
 * @returns {Promise<ModuleContext>} Its documents landed.
 */
export async function slContextFor({ competenceLevels, aggregation = [] }) {
    return createSubjectContext('sl', {
        documents: {
            'competence-levels.json': competenceLevels,
            'aggregations.json': aggregation,
        },
    });
}

/**
 * @param {ModuleContext} context - From `slContextFor`.
 * @returns {CompetenceShareQueries}
 */
export function sharesOf(context) {
    return context.documents.getDataset(COMPETENCE_SHARES);
}

/**
 * @param {ModuleContext} context - From `slContextFor`.
 * @returns {SolutionRateQueries}
 */
export function ratesOf(context) {
    return context.documents.getDataset(SOLUTION_RATES);
}

/**
 * Wire value groups into a helper.
 * @param {SlPayload} payload
 * @returns {Promise<CompetenceShareQueries>}
 */
export async function helperFor(payload) {
    return sharesOf(await slContextFor(payload));
}

/**
 * The Lösungsquote queries over the same payload shape as `helperFor`.
 * @param {SlPayload} payload
 * @returns {Promise<SolutionRateQueries>}
 */
export async function solutionRatesFor(payload) {
    return ratesOf(await slContextFor(payload));
}

/**
 * The school every info-box query suite reads: three Lerngruppen, four Fach/Domäne
 * selections, two different competence ladders.
 *
 *   Deutsch     le (Lesen), zh (Zuhören)   Roman ladder   8a, 8b
 *   Englisch    ho (Hören)                 GER ladder     8a, 8b
 *   Mathematik  no domain at all           Roman ladder   8a, 8b, 8c
 *
 * Three properties the suites rely on:
 *
 *   - 8c sits only Mathematik. A verb that reads "no value groups" as "zero" rather
 *     than "unknown" names 8c the worst Lerngruppe in a Fach it never sat.
 *   - Englisch is measured on the GER ladder, which shares no band name with the
 *     Roman one. A share query naming only Roman levels cannot express those value groups
 *     and must drop them, not score them 0 %.
 *   - A Landesschnitt value group is present. The `type` discriminator
 *     (`isExternalPopulation`) keeps it out of the Lerngruppen; an id/name test counts
 *     it as one.
 *
 * Shares at or above Regelstandard:
 *
 *   |          | Deutsch le | Deutsch zh | Englisch ho | Mathematik |
 *   |----------|-----------:|-----------:|------------:|-----------:|
 *   | 8a       |       0.60 |       0.40 |        0.80 |       0.50 |
 *   | 8b       |       0.40 |       0.40 |        0.40 |       0.40 |
 *   | 8c       |          — |          — |           — |       0.70 |
 *   | Schule   |       0.50 |       0.40 |        0.60 |       0.50 |
 *   | **Land** | **0.5333** |   **0.30** |    **0.30** |   **0.60** |
 *
 * The Landesschnitt numbers produce one contrast: Deutsch is below the Landesschnitt in
 * Lesen, above it in Zuhören, and level with it once the two are pooled (Lesen 64/120,
 * so (64 + 24) / 200 = 0.44 against the school's 22/50). So `aggregation: 'anyDomain'`
 * lists Deutsch as both a strength and a weakness, while `aggregation: 'subject'` lists
 * it as neither. Englisch is uniformly above and Mathematik uniformly below, so neither
 * list is empty; 8c is above in the only Fach it sits, which keeps the two Lerngruppen
 * lists from being each other's complement.
 *
 * 8b is flat at 0.40 across everything while 8a spans 0.40–0.80, so "the Lerngruppe
 * whose results vary most" has one answer. 8b and 8c both span nothing, which exercises
 * the tie-break.
 *
 * The Deutsch cohorts are unequal: 8a sits 20 students in Zuhören against 10 everywhere
 * else, and the school's own Zuhören value group carries 50 against 100 in Lesen. The
 * shares in the table are unchanged by that, but three answers to "wie steht Deutsch
 * da?" become distinguishable that equal cohorts collapse into 0.45:
 *
 *   - 22/50 = 0.44: frequencies summed over the *Lerngruppen* value groups, which is what
 *     `getSubjectCompetenceShare({target: 'school'})` does
 *     (a school target pools its Lerngruppen)
 *   - 70/150 ≈ 0.4667: frequencies summed over the *school's own* value groups
 *   - 0.45: the mean of the two Domänen's ratios
 */
export function buildCompetenceValueGroups() {
    return [
        // ── Deutsch: Lesen — school 50 %, 8a 60 %, 8b 40 % ──
        competenceValueGroup({
            id: SCHOOL_ID,
            type: 'school',
            name: 'Testschule',
            subject: 'Deutsch',
            domainId: 'le',
            domainName: 'Lesen',
            levels: romanLevels([10, 10, 30, 30, 10, 10]),
        }),
        competenceValueGroup({
            id: '8a-deutsch-le',
            type: 'group',
            name: '8a',
            subject: 'Deutsch',
            domainId: 'le',
            domainName: 'Lesen',
            levels: romanLevels([1, 1, 2, 3, 2, 1]),
        }),
        competenceValueGroup({
            id: '8b-deutsch-le',
            type: 'group',
            name: '8b',
            subject: 'Deutsch',
            domainId: 'le',
            domainName: 'Lesen',
            levels: romanLevels([2, 2, 2, 2, 1, 1]),
        }),

        // ── Deutsch: Zuhören — both Lerngruppen at 40 %, so Deutsch separates its two
        //    Lerngruppen through Lesen alone; the cohorts differ from the Lesen ones
        //    (8a sits 20 students, the school 50) ──
        competenceValueGroup({
            id: SCHOOL_ID,
            type: 'school',
            name: 'Testschule',
            subject: 'Deutsch',
            domainId: 'zh',
            domainName: 'Zuhören',
            levels: romanLevels([10, 10, 10, 10, 5, 5]),
        }),
        competenceValueGroup({
            id: '8a-deutsch-zh',
            type: 'group',
            name: '8a',
            subject: 'Deutsch',
            domainId: 'zh',
            domainName: 'Zuhören',
            levels: romanLevels([4, 4, 4, 4, 2, 2]),
        }),
        competenceValueGroup({
            id: '8b-deutsch-zh',
            type: 'group',
            name: '8b',
            subject: 'Deutsch',
            domainId: 'zh',
            domainName: 'Zuhören',
            levels: romanLevels([2, 2, 2, 2, 1, 1]),
        }),

        // ── Englisch: Hören — GER ladder. 8a's 80 % is the school's best
        //    single result, and a Roman-only query must not be able to see it ──
        competenceValueGroup({
            id: SCHOOL_ID,
            type: 'school',
            name: 'Testschule',
            subject: 'Englisch',
            domainId: 'ho',
            domainName: 'Hören',
            levels: gerLevels([4, 4, 4, 4, 4]),
        }),
        competenceValueGroup({
            id: '8a-englisch',
            type: 'group',
            name: '8a',
            subject: 'Englisch',
            domainId: 'ho',
            domainName: 'Hören',
            levels: gerLevels([1, 1, 2, 3, 3]),
        }),
        competenceValueGroup({
            id: '8b-englisch',
            type: 'group',
            name: '8b',
            subject: 'Englisch',
            domainId: 'ho',
            domainName: 'Hören',
            levels: gerLevels([3, 3, 2, 1, 1]),
        }),

        // ── Mathematik — no domain, and the only Fach 8c sits ──
        competenceValueGroup({
            id: SCHOOL_ID,
            type: 'school',
            name: 'Testschule',
            subject: 'Mathematik',
            levels: romanLevels([5, 5, 5, 5, 5, 5]),
        }),
        competenceValueGroup({
            id: '8a-mathe',
            type: 'group',
            name: '8a',
            subject: 'Mathematik',
            levels: romanLevels([1, 1, 1, 1, 1, 1]),
        }),
        competenceValueGroup({
            id: '8b-mathe',
            type: 'group',
            name: '8b',
            subject: 'Mathematik',
            levels: romanLevels([2, 2, 2, 2, 1, 1]),
        }),
        competenceValueGroup({
            id: '8c-mathe',
            type: 'group',
            name: '8c',
            subject: 'Mathematik',
            levels: romanLevels([1, 1, 1, 3, 2, 2]),
        }),

        // ── Landesschnitt — a reference, never a Lerngruppe. One value group per Fach/Domäne, so
        //    every state comparison the boxes make has something to compare against ──
        competenceValueGroup({
            id: STATE_ID,
            type: 'state',
            name: 'Landesschnitt',
            subject: 'Deutsch',
            domainId: 'le',
            domainName: 'Lesen',
            levels: romanLevels([15, 15, 26, 34, 16, 14]),
        }),
        competenceValueGroup({
            id: STATE_ID,
            type: 'state',
            name: 'Landesschnitt',
            subject: 'Deutsch',
            domainId: 'zh',
            domainName: 'Zuhören',
            levels: romanLevels([30, 20, 6, 14, 6, 4]),
        }),
        competenceValueGroup({
            id: STATE_ID,
            type: 'state',
            name: 'Landesschnitt',
            subject: 'Englisch',
            domainId: 'ho',
            domainName: 'Hören',
            levels: gerLevels([7, 7, 3, 2, 1]),
        }),
        competenceValueGroup({
            id: STATE_ID,
            type: 'state',
            name: 'Landesschnitt',
            subject: 'Mathematik',
            levels: romanLevels([5, 5, 10, 15, 10, 5]),
        }),

        // A second comparison population, of a type the client has no name for: an id
        // that is not the word "state" and a name that is not the bare "Landesschnitt".
        // Only `type` marks it as a comparison rather than a Lerngruppe, so it guards
        // `isExternalPopulation`: an id-, name- or `type === 'state'`-shaped test lets it
        // land among the Lerngruppen.
        //
        // Its 95 % lies outside the range of every Lerngruppe, so a leak wins every
        // "beste Lerngruppe" superlative over Deutsch. It must also never move the
        // Landesschnitt the boxes compare with.
        competenceValueGroup({
            id: 'bezirk',
            type: 'district',
            name: 'Bezirksschnitt',
            subject: 'Deutsch',
            domainId: 'le',
            domainName: 'Lesen',
            levels: romanLevels([0, 0, 1, 9, 6, 4]),
        }),
    ];
}

/**
 * Result value groups — the Lösungsquote side of the same school.
 *
 * No info box reads these: every box sentence is a competence-level share. The
 * Überblick's `Lösungsquote` metric and the Material pages reach them through
 * `getSolutionRate`. The widest rate spread and the widest
 * share spread name different Fächer.
 *
 * Lösungsquoten; each Lerngruppe is `RESPONSES_PER_GROUP` responses:
 *
 *   |          | Deutsch le | Deutsch zh | Englisch ho | Mathematik |
 *   |----------|-----------:|-----------:|------------:|-----------:|
 *   | 8a       |       0.90 |       0.45 |        0.62 |       0.30 |
 *   | 8b       |       0.30 |       0.35 |        0.58 |       0.30 |
 *   | 8c       |          — |          — |           — |       0.70 |
 *   | Schule   |     0.55 † |       0.40 |        0.60 |     0.4333 |
 *   | **Land** |   **0.50** |   **0.50** |    **0.40** |   **0.60** |
 *
 * † The `schule` value groups carry the school's own aggregate, and for Deutsch: Lesen that
 * is not the sum of 8a and 8b (0.60). The API's school value group counts every student
 * of the school, including those in no listed Testgruppe, and "school" reads the value
 * group carrying the school's id, never the sum of the Lerngruppen.
 *
 * The contrast runs opposite to the competence value groups': on the rate side Deutsch
 * is above the Landesschnitt in Lesen and below it in Zuhören.
 *
 * The Lerngruppen spreads are 0.60 (Deutsch: Lesen), 0.10 (Deutsch: Zuhören), 0.04
 * (Englisch) and 0.40 (Mathematik), all distinct: the "engste Fach/Domäne" superlative
 * compares those differences, and two equal spreads would be separated by
 * floating-point noise rather than by the name tie-break.
 *
 * 8c is above the Landesschnitt in the only Fach it sits, as in the competence value
 * groups, so a verb that reads "no value groups" as "zero" fails on either side.
 */
export function buildStateComparisonResults() {
    return [
        lerngruppeResult('8a-deutsch-le', '8a', 'Deutsch', 'le', 90),
        lerngruppeResult('8b-deutsch-le', '8b', 'Deutsch', 'le', 30),
        schoolResult('Deutsch', 'le', 110, 200),
        stateResult('Deutsch', 'le', 50),

        lerngruppeResult('8a-deutsch-zh', '8a', 'Deutsch', 'zh', 45),
        lerngruppeResult('8b-deutsch-zh', '8b', 'Deutsch', 'zh', 35),
        schoolResult('Deutsch', 'zh', 80, 200),
        stateResult('Deutsch', 'zh', 50),

        lerngruppeResult('8a-englisch', '8a', 'Englisch', 'ho', 62),
        lerngruppeResult('8b-englisch', '8b', 'Englisch', 'ho', 58),
        schoolResult('Englisch', 'ho', 120, 200),
        stateResult('Englisch', 'ho', 40),

        lerngruppeResult('8a-mathe', '8a', 'Mathematik', null, 30),
        lerngruppeResult('8b-mathe', '8b', 'Mathematik', null, 30),
        lerngruppeResult('8c-mathe', '8c', 'Mathematik', null, 70),
        schoolResult('Mathematik', null, 130, 300),
        stateResult('Mathematik', null, 60),
    ];
}

/**
 * A Lerngruppe's result value group, identified by the same `groupId` its
 * competence-levels value group carries, as in an API payload: `groupNameOfValueGroup`
 * joins the two documents on it. The id is passed in rather than derived, since one
 * synthesised from the group and the Fach (`8a-englisch-ho`, `8a-mathematik`) would
 * name no competence value group.
 * @param {string} groupId - The id its competence-levels value group carries.
 * @param {string} groupName - The Lerngruppe, e.g. `8a`.
 * @param {string} subject - Fach name.
 * @param {string|null} domain - Domäne id; null for a Fach with no split.
 * @param {number} solved - Right answers out of `RESPONSES_PER_GROUP`.
 * @returns {AggregationsValueGroup}
 */
function lerngruppeResult(groupId, groupName, subject, domain, solved) {
    return resultValueGroup({
        id: groupId,
        type: 'group',
        name: 'Lerngruppe ' + groupName,
        subject,
        domain,
        solved,
        total: RESPONSES_PER_GROUP,
    });
}

/**
 * The school's own result value group.
 * @param {string} subject
 * @param {string|null} domain - Null for a Fach with no split.
 * @param {number} solved - Right answers.
 * @param {number} total - Answers in all.
 * @returns {AggregationsValueGroup}
 */
function schoolResult(subject, domain, solved, total) {
    return resultValueGroup({
        id: SCHOOL_ID,
        type: 'school',
        name: 'Testschule',
        subject,
        domain,
        solved,
        total,
    });
}

/**
 * The Landesschnitt's result value group.
 * @param {string} subject
 * @param {string|null} domain - Null for a Fach with no split.
 * @param {number} solved - Right answers out of `RESPONSES_PER_GROUP`.
 * @returns {AggregationsValueGroup}
 */
function stateResult(subject, domain, solved) {
    return resultValueGroup({
        id: STATE_ID,
        type: 'state',
        name: 'Landesschnitt',
        subject,
        domain,
        solved,
        total: RESPONSES_PER_GROUP,
    });
}

/**
 * The school above, in a context of its own: the payload every info-box query suite
 * reads unless it tests export-shaped identifiers. Built fresh per call, because the
 * value groups are mutable.
 * @returns {Promise<ModuleContext>} A context over `buildCompetenceValueGroups` + `buildStateComparisonResults`.
 */
export async function buildDashboardContext() {
    return slContextFor({
        competenceLevels: buildCompetenceValueGroups(),
        aggregation: buildStateComparisonResults(),
    });
}

/**
 * The school above, wired into a helper.
 * @returns {Promise<CompetenceShareQueries>} A helper over `buildCompetenceValueGroups` + `buildStateComparisonResults`.
 */
export async function buildDashboardHelper() {
    return sharesOf(await buildDashboardContext());
}

/**
 * The same school, spelled the way an API export spells it.
 *
 * The demo fixtures name their Lerngruppen `8a-deutsch` / `8a`. An export names them
 * with a Kürzel or a timetable code (`G-BM`, `E-DL`, `E_E1_08_ABCD`) and puts an opaque
 * numeric id (`33390`, `5725`) in `id`.
 *
 * Only the identifiers differ from `buildCompetenceValueGroups` /
 * `buildStateComparisonResults`, so a behaviour difference between the two comes from
 * naming alone.
 * @returns {Required<SlPayload>}
 */
export function buildExportShapedValueGroups() {
    /** @type {Partial<Record<string, string>>} */
    const CLASS_NAMES = { '8a': 'G-BM', '8b': 'E-DL', '8c': 'E_E1_08_ABCD' };

    // One opaque numeric id per Testgruppe, not per Lerngruppe: a Lerngruppe that sits
    // three Fächer has three ids carrying the same group name, the relation the id→name
    // join has to hold.
    /** @type {Partial<Record<string, string>>} */
    const GROUP_IDS = {
        '8a-deutsch-le': '33390',
        '8a-deutsch-zh': '33391',
        '8a-englisch': '33392',
        '8a-mathe': '33393',
        '8b-deutsch-le': '33394',
        '8b-deutsch-zh': '33395',
        '8b-englisch': '33396',
        '8b-mathe': '33397',
        '8c-mathe': '5725',
    };

    /**
     * @template {CurrentLevelsValueGroup|AggregationsValueGroup} TValueGroup
     * @param {TValueGroup} valueGroup
     * @returns {TValueGroup} Under its export id and Kürzel, or as it was.
     */
    const rename = (valueGroup) => {
        const groupId = GROUP_IDS[valueGroup.id];
        const groupName = CLASS_NAMES[valueGroup.id.slice(0, 2)];
        if (!groupId || !groupName) return valueGroup;
        return { ...valueGroup, id: groupId, name: groupName };
    };

    return {
        // The same map on both documents, keyed by the id they share.
        competenceLevels: buildCompetenceValueGroups().map(rename),
        aggregation: buildStateComparisonResults().map(rename),
    };
}
