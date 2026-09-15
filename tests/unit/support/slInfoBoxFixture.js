/**
 * Payload fixtures for the SL competence-share query layer (`CompetenceShareQueries`).
 *
 * The helper's whole demand on the store is two raw payloads —
 * `SL_DATA_KEYS.COMPETENCE_LEVELS` and `SL_DATA_KEYS.ITEMS` — so a fixture is one call to
 * `createSlDataStore`. That seam is the point: the query verbs decide what every SL info
 * box *says* about a school, and until these fixtures existed the only way to reach
 * them was a browser.
 *
 * Three builders, deliberately not one. The Landesschnitt verbs and the ranking
 * selectors want the same rows tuned to different contrasts, and a single fixture
 * satisfying both ends up a set of magic numbers nobody can edit safely. Each
 * builder documents the contrast its numbers exist to produce.
 *
 * The row factories are shared with schoolSummaryMetrics.test.js, which is where
 * they were first written.
 */

import { slDataFromStore } from '../../../src/sl/slDataPort.js';
import { createSlDataStore } from './slDataStoreFixture.js';
import { SL_DATA_KEYS } from '../../../src/sl/slDataKeys.js';
import { CompetenceShareQueries } from '@tba3/modules/sl/utils/slCompetenceShares.js';
import { SolutionRateQueries } from '@tba3/modules/sl/utils/slSolutionRates.js';
import * as shareSelections from '@tba3/modules/sl/modules/infoBox/infoBoxShareSelections.js';
import * as stateComparison from '@tba3/modules/sl/modules/infoBox/infoBoxStateComparison.js';
import { normalizeTarget } from '@tba3/modules/sl/utils/slQueryPrimitives.js';
import { registerCompetenceLevelScales } from '@tba3/modules/common/services/competenceLevelPalette.js';

/** The school row's id — what `detectSchoolId` resolves the school to. */
export const SCHOOL_ID = 'schule';
/** The Landesschnitt row's id. */
export const STATE_ID = 'state';

export const ROMAN_LEVELS = ['Ia', 'Ib', 'II', 'III', 'IV', 'V'];
export const GER_LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1'];

/** Roman levels at or above Regelstandard. */
export const ROMAN_AT_OR_ABOVE_REGULAR = ['III', 'IV', 'V'];
/** GER levels at or above Regelstandard. */
const GER_AT_OR_ABOVE_REGULAR = ['B1', 'B2', 'C1'];

/**
 * Both ladders at once.
 *
 * A share query names *bands*, and the two ladders share no band name, so a query
 * naming only Roman levels cannot express the GER rows at all — that is what
 * `#extractCompetenceLevelCounts` reports through its `covered` flag. Suites that
 * want every selection to resolve ask for the union; suites testing the gate ask
 * for one ladder on purpose.
 */
export const AT_OR_ABOVE_REGULAR = [...ROMAN_AT_OR_ABOVE_REGULAR, ...GER_AT_OR_ABOVE_REGULAR];

/**
 * The KMK standard each level names. Prose only: since 2026-08-31 the client reads the
 * rank from the `standardRank:<id>` row property and never from `name`, so this table
 * only keeps the fixture's `name` field looking like a real payload's.
 * Mirrors what `data/sl/sl/competence-levels.json` ships.
 */
const STANDARD_NAME_BY_LEVEL = {
    Ia: 'Unter Mindeststandard',
    Ib: 'Unter Mindeststandard',
    II: 'Mindeststandard',
    III: 'Regelstandard',
    IV: 'Regelstandard plus',
    V: 'Optimalstandard',
    A1: 'Unter Mindeststandard',
    A2: 'Mindeststandard',
    B1: 'Regelstandard',
    B2: 'Regelstandard plus',
    C1: 'Optimalstandard',
};

/**
 * The KMK standard rank each level reports — the *only* thing that says what "ab
 * Kompetenzstufe III bzw. B1" means, because band position cannot: `B1` is the third of
 * five GER bands and is rank 3, while `A2.2` is the fourth of six and is rank 2.
 *
 * The payload is the sole authority on this, so the fixture has to ship it the way the
 * server does — as `standardRank:<level id>` row properties, not as a wording the client
 * is expected to recognise.
 */
const STANDARD_RANK_BY_LEVEL = {
    Ia: 1,
    Ib: 1,
    II: 2,
    III: 3,
    IV: 4,
    V: 5,
    A1: 1,
    A2: 2,
    B1: 3,
    B2: 4,
    C1: 5,
};

/**
 * @param {Object} params
 * @param {Object<string, number>} params.levels - nameShort → frequency
 * @param {boolean} [params.namesStandards=true] - false mirrors an export that ships no
 *        `standardRank:` properties and repeats `nameShort` in `name`, so the scale
 *        identifies no standard at all
 */
export function competenceRow({
    id,
    type,
    name,
    subject,
    domainId = null,
    domainName = null,
    levels,
    namesStandards = true,
}) {
    const total = Object.values(levels).reduce((sum, frequency) => sum + frequency, 0);
    const entries = Object.entries(levels);

    return {
        id,
        type,
        name,
        subject: { id: null, name: subject },
        domain: domainId
            ? { id: domainId, name: domainName ?? domainId }
            : { id: null, name: null },
        properties: namesStandards
            ? entries.flatMap(([nameShort], index) =>
                  STANDARD_RANK_BY_LEVEL[nameShort] === undefined
                      ? []
                      : [
                            {
                                key: `standardRank:${index + 1}`,
                                value: String(STANDARD_RANK_BY_LEVEL[nameShort]),
                            },
                        ],
              )
            : [],
        competenceLevels: entries.map(([nameShort, frequency], index) => ({
            id: index + 1,
            nameShort,
            name: namesStandards ? (STANDARD_NAME_BY_LEVEL[nameShort] ?? nameShort) : nameShort,
            descriptiveStatistics: { total, mean: frequency / total, frequency },
        })),
    };
}

export function romanLevels(counts) {
    return Object.fromEntries(ROMAN_LEVELS.map((level, index) => [level, counts[index] ?? 0]));
}

function gerLevels(counts) {
    return Object.fromEntries(GER_LEVELS.map((level, index) => [level, counts[index] ?? 0]));
}

/** Item scope row for the Lösungsquote metric (items.json shape). */
export function itemRow({ id, type, name, subject, domain = null, solved, total }) {
    return {
        id,
        type,
        name,
        subject: { id: null, name: subject },
        domain: domain ? { id: domain, name: domain } : null,
        items: [{ descriptiveStatistics: { total, frequency: solved } }],
    };
}

/**
 * Wire rows into a helper.
 *
 * One store per call: `getCompetenceLevelIndex` reads the cached `COMPETENCE_LEVEL_INDEX`
 * dataset and `setRawData` does not cascade into that cache, so a suite that swaps rows
 * between calls would otherwise read a stale index.
 *
 * `registerCompetenceLevelScales` mirrors `fetchSlData`: the scale registry is how a
 * level name resolves to a KMK standard, and no view renders before it is populated.
 *
 * @param {{competenceLevels: any[], items?: any[]}} payload
 * @returns {CompetenceShareQueries}
 */
export function helperFor({ competenceLevels, items = [] }) {
    return new CompetenceShareQueries({
        moduleId: 'test',
        slData: slDataFor({ competenceLevels, items }),
    });
}

/**
 * The Lösungsquote queries over the same payload shape as `helperFor`.
 * @param {{competenceLevels: any[], items?: any[]}} payload
 * @returns {SolutionRateQueries}
 */
export function solutionRatesFor({ competenceLevels, items = [] }) {
    return new SolutionRateQueries({
        moduleId: 'test',
        slData: slDataFor({ competenceLevels, items }),
    });
}

/**
 * The verbs of one module bound to a share helper, with `target` and `levelNames`
 * normalised the way the text resolver does before it calls them — so a suite may
 * write `target: '8a'` and `levelNames: AT_OR_ABOVE_REGULAR` as the templates do.
 * @param {Record<string, Function>} verbs - The module's exported functions `(queries, params)`.
 * @param {CompetenceShareQueries} queries - From `helperFor` or `buildDashboardHelper`.
 * @returns {Record<string, (params: object) => any>} The bound verbs.
 */
function bindVerbs(verbs, queries) {
    return Object.fromEntries(
        Object.entries(verbs).map(([name, verb]) => [
            name,
            (params = {}) =>
                verb(queries, {
                    ...params,
                    target: normalizeTarget(params.target),
                    levelNames: params.levelNames ?? [],
                }),
        ]),
    );
}

/**
 * The superlative verbs over a share helper.
 * @param {CompetenceShareQueries} queries - From `helperFor` or `buildDashboardHelper`.
 * @returns {Record<string, (params: object) => any>} `infoBoxShareSelections.js`, bound.
 */
export function selectionsFor(queries) {
    return bindVerbs(shareSelections, queries);
}

/**
 * The Landesschnitt verbs over a share helper.
 * @param {CompetenceShareQueries} queries - From `helperFor` or `buildDashboardHelper`.
 * @returns {Record<string, (params: object) => any>} `infoBoxStateComparison.js`, bound.
 */
export function stateComparisonFor(queries) {
    return bindVerbs(stateComparison, queries);
}

/**
 * @param {{competenceLevels: any[], items?: any[]}} payload
 * @returns {import('@tba3/modules/sl/slData.js').SlData}
 */
function slDataFor({ competenceLevels, items }) {
    registerCompetenceLevelScales(competenceLevels);

    return slDataFromStore(
        createSlDataStore({
            [SL_DATA_KEYS.COMPETENCE_LEVELS]: competenceLevels,
            [SL_DATA_KEYS.ITEMS]: items,
        }),
    );
}

/**
 * The school every info-box query suite reads: three Klassen, four Fach/Domäne
 * selections, two different competence ladders.
 *
 *   Deutsch     le (Lesen), zh (Zuhören)   Roman ladder   8a, 8b
 *   Englisch    ho (Hörverstehen)          GER ladder     8a, 8b
 *   Mathematik  no domain at all           Roman ladder   8a, 8b, 8c
 *
 * Three properties are load-bearing, and each has bitten this code before:
 *
 *   - **8c sits only Mathematik.** Klassen are ragged in reality, and a verb that
 *     reads "no rows" as "zero" rather than "unknown" names 8c the worst Klasse in
 *     a Fach it never sat.
 *   - **Englisch is measured on the GER ladder**, which shares no band name with the
 *     Roman one. A share query naming only Roman levels cannot express those rows
 *     and must drop them, not score them 0 %.
 *   - **A Landesschnitt row is present.** It is a reference, never one of us — the
 *     `type === 'state'` discriminator is the whole reason an id/name test once
 *     counted 13 Klassen for a five-Klasse school.
 *
 * Shares at or above Regelstandard, by design:
 *
 *   |          | Deutsch le | Deutsch zh | Englisch ho | Mathematik |
 *   |----------|-----------:|-----------:|------------:|-----------:|
 *   | 8a       |       0.60 |       0.40 |        0.80 |       0.50 |
 *   | 8b       |       0.40 |       0.40 |        0.40 |       0.40 |
 *   | 8c       |          — |          — |           — |       0.70 |
 *   | Schule   |       0.50 |       0.40 |        0.60 |       0.50 |
 *   | **Land** | **0.5333** |   **0.30** |    **0.30** |   **0.60** |
 *
 * The Landesschnitt row is what the praise/alarm sentences of six boxes are decided
 * against, and its numbers exist to force one contrast into the open: **Deutsch is below
 * the Landesschnitt in Lesen, above it in Zuhören, and exactly level with it once the two
 * are pooled** (0.44 either side). So `aggregation: 'anyDomain'` must list Deutsch as both
 * a strength and a weakness, while `aggregation: 'subject'` lists it as neither — two
 * different claims about the same Fach. Englisch is uniformly above and Mathematik
 * uniformly below, so neither list is ever trivially empty; 8c is above in the only Fach
 * it sits, which keeps the two Klassen lists from being each other's complement.
 *
 * Deutsch: Lesen reads 0.5333 rather than the Gesamt row's 0.45 because the second
 * Landesschnitt track below is pooled into it — see that row's comment.
 *
 * 8b is flat at 0.40 across everything while 8a spans 0.40–0.80, so "the Klasse
 * whose results vary most" has one unambiguous answer. 8b and 8c both span nothing,
 * which forces the tie-break into the open instead of leaving it incidental.
 *
 * **The Deutsch cohorts are deliberately unequal**: 8a sits 20 students in Zuhören
 * against 10 everywhere else, and the school's own Zuhören row carries 50 against
 * 100 in Lesen. Shares are unchanged by that — every number in the table above still
 * holds — but it makes three answers to "wie steht Deutsch da?" distinguishable that
 * equal cohorts collapse into one:
 *
 *   - 22/50 = **0.44** — frequencies summed over the *Klassen* rows, which is what
 *     `getSubjectCompetenceShare({target: 'school'})` does
 *     (`#getRowsForSubjectAggregateCompetenceTarget` resolves a school to `classRows`)
 *   - 70/150 ≈ 0.4667 — frequencies summed over the *school's own* rows
 *   - 0.45 — the mean of the two Domänen's ratios
 *
 * With equal cohorts all three are 0.45 and no assertion can tell a weighted sum from
 * an average, or the Klassen rows from the school's own.
 */
export function buildCompetenceRows() {
    return [
        // ── Deutsch: Lesen — school 50 %, 8a 60 %, 8b 40 % ──
        competenceRow({
            id: SCHOOL_ID,
            type: 'school',
            name: 'Testschule',
            subject: 'Deutsch',
            domainId: 'le',
            domainName: 'Lesen',
            levels: romanLevels([10, 10, 30, 30, 10, 10]),
        }),
        competenceRow({
            id: '8a-deutsch-le',
            type: 'group',
            name: '8a',
            subject: 'Deutsch',
            domainId: 'le',
            domainName: 'Lesen',
            levels: romanLevels([1, 1, 2, 3, 2, 1]),
        }),
        competenceRow({
            id: '8b-deutsch-le',
            type: 'group',
            name: '8b',
            subject: 'Deutsch',
            domainId: 'le',
            domainName: 'Lesen',
            levels: romanLevels([2, 2, 2, 2, 1, 1]),
        }),

        // ── Deutsch: Zuhören — both Klassen at 40 %, so Deutsch separates its two
        //    Klassen through Lesen alone. The cohorts here are deliberately not the
        //    Lesen ones — 8a sits 20 students and the school row 50 — so a weighted
        //    Fach share differs both from a mean of the Domänen and from the same sum
        //    taken over the school's own rows ──
        competenceRow({
            id: SCHOOL_ID,
            type: 'school',
            name: 'Testschule',
            subject: 'Deutsch',
            domainId: 'zh',
            domainName: 'Zuhören',
            levels: romanLevels([10, 10, 10, 10, 5, 5]),
        }),
        competenceRow({
            id: '8a-deutsch-zh',
            type: 'group',
            name: '8a',
            subject: 'Deutsch',
            domainId: 'zh',
            domainName: 'Zuhören',
            levels: romanLevels([4, 4, 4, 4, 2, 2]),
        }),
        competenceRow({
            id: '8b-deutsch-zh',
            type: 'group',
            name: '8b',
            subject: 'Deutsch',
            domainId: 'zh',
            domainName: 'Zuhören',
            levels: romanLevels([2, 2, 2, 2, 1, 1]),
        }),

        // ── Englisch: Hörverstehen — GER ladder. 8a's 80 % is the school's best
        //    single result, and a Roman-only query must not be able to see it ──
        competenceRow({
            id: SCHOOL_ID,
            type: 'school',
            name: 'Testschule',
            subject: 'Englisch',
            domainId: 'ho',
            domainName: 'Hörverstehen',
            levels: gerLevels([4, 4, 4, 4, 4]),
        }),
        competenceRow({
            id: '8a-englisch',
            type: 'group',
            name: '8a',
            subject: 'Englisch',
            domainId: 'ho',
            domainName: 'Hörverstehen',
            levels: gerLevels([1, 1, 2, 3, 3]),
        }),
        competenceRow({
            id: '8b-englisch',
            type: 'group',
            name: '8b',
            subject: 'Englisch',
            domainId: 'ho',
            domainName: 'Hörverstehen',
            levels: gerLevels([3, 3, 2, 1, 1]),
        }),

        // ── Mathematik — no domain, and the only Fach 8c sits ──
        competenceRow({
            id: SCHOOL_ID,
            type: 'school',
            name: 'Testschule',
            subject: 'Mathematik',
            levels: romanLevels([5, 5, 5, 5, 5, 5]),
        }),
        competenceRow({
            id: '8a-mathe',
            type: 'group',
            name: '8a',
            subject: 'Mathematik',
            levels: romanLevels([1, 1, 1, 1, 1, 1]),
        }),
        competenceRow({
            id: '8b-mathe',
            type: 'group',
            name: '8b',
            subject: 'Mathematik',
            levels: romanLevels([2, 2, 2, 2, 1, 1]),
        }),
        competenceRow({
            id: '8c-mathe',
            type: 'group',
            name: '8c',
            subject: 'Mathematik',
            levels: romanLevels([1, 1, 1, 3, 2, 2]),
        }),

        // ── Landesschnitt — a reference, never a Klasse. One row per Fach/Domäne, so
        //    every state comparison the boxes make has something to compare against ──
        competenceRow({
            id: STATE_ID,
            type: 'state',
            name: 'Landesschnitt',
            subject: 'Deutsch',
            domainId: 'le',
            domainName: 'Lesen',
            levels: romanLevels([15, 15, 25, 25, 10, 10]),
        }),
        competenceRow({
            id: STATE_ID,
            type: 'state',
            name: 'Landesschnitt',
            subject: 'Deutsch',
            domainId: 'zh',
            domainName: 'Zuhören',
            levels: romanLevels([30, 20, 6, 14, 6, 4]),
        }),
        competenceRow({
            id: STATE_ID,
            type: 'state',
            name: 'Landesschnitt',
            subject: 'Englisch',
            domainId: 'ho',
            domainName: 'Hörverstehen',
            levels: gerLevels([7, 7, 3, 2, 1]),
        }),
        competenceRow({
            id: STATE_ID,
            type: 'state',
            name: 'Landesschnitt',
            subject: 'Mathematik',
            levels: romanLevels([5, 5, 10, 15, 10, 5]),
        }),

        // A second Landesschnitt track, spelled the way a multi-track export spells
        // it: an id naming the Schulform (`nw-gy`) rather than the word "state", and
        // a name that is not the bare "Landesschnitt". Only `type` marks it. NRW really
        // does send two Abschlusstracks to a school whose sittings match both.
        //
        // This row is the fixture's guard on `isStateEntry`. Every id- or name-shaped
        // test for "is this the Landesschnitt" passes the four rows above and misses
        // this one, which then lands among the Klassen — the failure that once had a
        // five-Klasse school reporting 13.
        //
        // Its 95 % is deliberately far outside the range any real Klasse reaches, so a
        // leak does not blend in: it immediately wins every "beste Klasse" superlative
        // over Deutsch and the failure names itself. Its **cohort** is small on purpose:
        // `#filterStateRows` returns every state row and the share queries sum them, so
        // this track is pooled into the Deutsch: Lesen benchmark rather than sitting
        // beside it — 20 students against the Gesamt row's 100 keeps that pooling from
        // swamping the number. Whether pooling two Abschlusstracks into one
        // "Landesschnitt" is right at all is a separate question; it is what the code
        // has always done, on the rate side as well, and this fixture pins it rather
        // than changing it.
        competenceRow({
            id: 'nw-gy',
            type: 'state',
            name: 'Landesschnitt Gymnasium',
            subject: 'Deutsch',
            domainId: 'le',
            domainName: 'Lesen',
            levels: romanLevels([0, 0, 1, 9, 6, 4]),
        }),
    ];
}

/**
 * Item rows — the Lösungsquote side of the same school.
 *
 * **No info box reads these any more.** Every box sentence is a competence-level share;
 * what still reaches these rows is the Überblick's
 * `Lösungsquote` metric and the Material pages, through `getSolutionRate` /
 * `getSubjectSolutionRate`. They are kept as a *contrast* as much as a fixture: the widest
 * rate spread and the widest share spread deliberately name different Fächer, which is the
 * swap doing its job rather than a regression.
 *
 * Lösungsquoten, by design — each Klasse row is 100 items so the arithmetic stays
 * readable:
 *
 *   |          | Deutsch le | Deutsch zh | Englisch ho | Mathematik |
 *   |----------|-----------:|-----------:|------------:|-----------:|
 *   | 8a       |       0.90 |       0.45 |        0.62 |       0.30 |
 *   | 8b       |       0.30 |       0.35 |        0.58 |       0.30 |
 *   | 8c       |          — |          — |           — |       0.70 |
 *   | Schule   |     0.55 † |       0.40 |        0.60 |     0.4333 |
 *   | **Land** |   **0.50** |   **0.50** |    **0.40** |   **0.60** |
 *
 * † The `schule` rows carry the school's own item aggregate, and for Deutsch: Lesen
 * that is deliberately **not** the sum of 8a and 8b (which would be 0.60). Real
 * exports carry no true school aggregate — the school's rows are summed over
 * whichever items the school's own booklets held — and the two verbs disagree about
 * which rows "school" means: `getSolutionRate` reads the rows carrying the school's
 * id, while `getSubjectSolutionRate` sums the Klassen. Making the two coincide would
 * hide that difference and let either verb be rewritten as the other.
 *
 * The numbers mirror the competence rows' contrast in the opposite direction: on the rate
 * side Deutsch is **above** the Landesschnitt in Lesen and below it in Zuhören, where the
 * share side has it the other way round. Same school, same claim-shape, opposite answer —
 * which is exactly why the boxes could not keep stating both.
 *
 * The Klassen spreads are 0.60 (Deutsch: Lesen), 0.10 (Deutsch: Zuhören), 0.04
 * (Englisch) and 0.40 (Mathematik) — every one of them distinct, because the
 * "engste Fach/Domäne" superlative is decided by comparing those differences. Two
 * selections spanning the same nominal 0.10 would be separated by floating-point
 * noise rather than by the name tie-break, and the winner would flip on any change
 * to how the difference is computed.
 *
 * 8c is above the Landesschnitt in the only Fach it sits and sits no other — the same
 * raggedness the competence rows carry, so a verb that reads "no rows" as "zero" fails on
 * either side.
 */
export function buildStateComparisonItems() {
    return [
        klasseItem('8a-deutsch-le', '8a', 'Deutsch', 'le', 90),
        klasseItem('8b-deutsch-le', '8b', 'Deutsch', 'le', 30),
        schoolItem('Deutsch', 'le', 110, 200),
        stateItem('Deutsch', 'le', 50),

        klasseItem('8a-deutsch-zh', '8a', 'Deutsch', 'zh', 45),
        klasseItem('8b-deutsch-zh', '8b', 'Deutsch', 'zh', 35),
        schoolItem('Deutsch', 'zh', 80, 200),
        stateItem('Deutsch', 'zh', 50),

        klasseItem('8a-englisch', '8a', 'Englisch', 'ho', 62),
        klasseItem('8b-englisch', '8b', 'Englisch', 'ho', 58),
        schoolItem('Englisch', 'ho', 120, 200),
        stateItem('Englisch', 'ho', 40),

        klasseItem('8a-mathe', '8a', 'Mathematik', null, 30),
        klasseItem('8b-mathe', '8b', 'Mathematik', null, 30),
        klasseItem('8c-mathe', '8c', 'Mathematik', null, 70),
        schoolItem('Mathematik', null, 130, 300),
        stateItem('Mathematik', null, 60),
    ];
}

/**
 * A Klasse's item row, identified by the **same `groupId` its competence-levels row
 * carries** — which is how API payloads relate: both documents are built from
 * one scope, and `data/sl/sl/` ships the identical 13 group ids in each.
 *
 * That correspondence is the join `#getItemRowClassName` makes, and it is why the
 * `groupId` is passed in rather than derived. It used to be synthesised from the
 * class and the Fach, which produced ids (`8a-englisch-ho`, `8a-mathematik`) that no
 * competence row carried — harmless while the class was read out of the *prefix* of
 * the id by regex, and wrong the moment the id has to identify a group.
 */
function klasseItem(groupId, className, subject, domain, solved) {
    return itemRow({
        id: groupId,
        type: 'group',
        name: 'Lerngruppe ' + className,
        subject,
        domain,
        solved,
        total: 100,
    });
}

function schoolItem(subject, domain, solved, total) {
    return itemRow({
        id: SCHOOL_ID,
        type: 'school',
        name: 'Testschule',
        subject,
        domain,
        solved,
        total,
    });
}

function stateItem(subject, domain, solved) {
    return itemRow({
        id: STATE_ID,
        type: 'state',
        name: 'Landesschnitt',
        subject,
        domain,
        solved,
        total: 100,
    });
}

/**
 * The school above, wired into a helper — the payload every info-box query suite
 * reads unless it is specifically testing export-shaped identifiers.
 *
 * Built fresh per call, because the rows are mutable and the scale registry is
 * module-level state that each suite resets between cases.
 * @returns {CompetenceShareQueries} A helper over `buildCompetenceRows` + `buildStateComparisonItems`.
 */
export function buildDashboardHelper() {
    return helperFor({
        competenceLevels: buildCompetenceRows(),
        items: buildStateComparisonItems(),
    });
}

/**
 * The same school, spelled the way an API export spells it.
 *
 * Every dashboard fixture under data/sl/ names its Lerngruppen `8a-deutsch` / `8a`.
 * An export names them with a Kürzel or a timetable code (`G-BM`, `E-DL`,
 * `E_E1_08_ABCD`) and puts an opaque numeric id (`33390`, `5725`) in `id`.
 *
 * Rows are otherwise identical to `buildCompetenceRows` / `buildStateComparisonItems`
 * — only the identifiers change — so any behaviour difference between the two is
 * attributable to naming alone.
 */
export function buildExportShapedRows() {
    // 8a → G-BM, 8b → E-DL, 8c → E_E1_08_ABCD.
    const CLASS_NAMES = { '8a': 'G-BM', '8b': 'E-DL', '8c': 'E_E1_08_ABCD' };

    // One opaque numeric id **per Testgruppe**, not per Klasse: a group id identifies
    // the group a Klasse sits for one Fach, so a Klasse that sits three Fächer has
    // three of them. Several ids therefore carry the same class name, which is the
    // relation the id→name join has to hold; a per-Klasse id would never exercise it.
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

    const rename = (row) => {
        const groupId = GROUP_IDS[row.id];
        if (!groupId) return row;
        return { ...row, id: groupId, name: CLASS_NAMES[row.id.slice(0, 2)] };
    };

    return {
        // The same map on both files, keyed by the id they share — an export renames
        // the group, it does not re-identify it.
        competenceLevels: buildCompetenceRows().map(rename),
        items: buildStateComparisonItems().map(rename),
    };
}

/**
 * The fixture schoolSummaryMetrics.test.js has always used, moved here verbatim.
 *
 * Mirrors the export shape and its two awkward properties:
 *   - classes are ragged (only Mathematik has 8d)
 *   - Französisch exists but must be excluded
 *
 * Deutsch: Leseverstehen is sized so a weighted school aggregate (35 %) differs
 * sharply from the mean of the class shares (55 %).
 *
 * Builds its own store rather than going through `helperFor`, because it hands the rows
 * back for the metric functions to index themselves.
 */
export function buildSummaryMetricsFixture() {
    const competenceLevels = [
        // ── Deutsch: Leseverstehen — school row only defines the school id ──
        competenceRow({
            id: 'schule',
            type: 'school',
            name: 'Testschule',
            subject: 'Deutsch',
            domainId: 'le',
            domainName: 'Leseverstehen',
            levels: romanLevels([10, 10, 45, 20, 10, 5]),
        }),
        // 8a: 10 students, 8 at ≥ III (80 %); 2 at ≤ I (20 %); 1 at V (10 %)
        competenceRow({
            id: '8a-deutsch',
            type: 'group',
            name: '8a',
            subject: 'Deutsch',
            domainId: 'le',
            domainName: 'Leseverstehen',
            levels: romanLevels([1, 1, 0, 4, 3, 1]),
        }),
        // 8b: 90 students, 27 at ≥ III (30 %); 18 at ≤ I (20 %); 4 at V (~4.4 %)
        competenceRow({
            id: '8b-deutsch',
            type: 'group',
            name: '8b',
            subject: 'Deutsch',
            domainId: 'le',
            domainName: 'Leseverstehen',
            levels: romanLevels([9, 9, 45, 15, 8, 4]),
        }),

        // ── Englisch: Hörverstehen — GER ladder, no 8d ──
        competenceRow({
            id: 'schule',
            type: 'school',
            name: 'Testschule',
            subject: 'Englisch',
            domainId: 'ho',
            domainName: 'Hörverstehen',
            levels: gerLevels([5, 5, 5, 3, 2]),
        }),
        competenceRow({
            id: '8a-englisch',
            type: 'group',
            name: '8a',
            subject: 'Englisch',
            domainId: 'ho',
            domainName: 'Hörverstehen',
            levels: gerLevels([1, 2, 3, 2, 2]),
        }),
        competenceRow({
            id: '8b-englisch',
            type: 'group',
            name: '8b',
            subject: 'Englisch',
            domainId: 'ho',
            domainName: 'Hörverstehen',
            levels: gerLevels([4, 3, 2, 1, 0]),
        }),

        // ── Mathematik — no domain, and the only subject with an 8d ──
        competenceRow({
            id: 'schule',
            type: 'school',
            name: 'Testschule',
            subject: 'Mathematik',
            levels: romanLevels([2, 2, 2, 2, 1, 1]),
        }),
        competenceRow({
            id: '8a-mathe',
            type: 'group',
            name: '8a',
            subject: 'Mathematik',
            levels: romanLevels([1, 0, 1, 1, 1, 1]),
        }),
        competenceRow({
            id: '8d-mathe',
            type: 'group',
            name: '8d',
            subject: 'Mathematik',
            levels: romanLevels([1, 2, 1, 1, 0, 0]),
        }),

        // ── Französisch — excluded subject, must never surface ──
        competenceRow({
            id: 'schule',
            type: 'school',
            name: 'Testschule',
            subject: 'Französisch',
            domainId: 'le',
            domainName: 'Leseverstehen',
            levels: gerLevels([1, 1, 1, 1, 1]),
        }),
        competenceRow({
            id: '8a-franzoesisch',
            type: 'group',
            name: '8a',
            subject: 'Französisch',
            domainId: 'le',
            domainName: 'Leseverstehen',
            levels: gerLevels([1, 1, 1, 1, 1]),
        }),

        // ── Landesschnitt — must not be treated as a class ──
        competenceRow({
            id: 'state',
            type: 'state',
            name: 'Landesschnitt',
            subject: 'Deutsch',
            domainId: 'le',
            domainName: 'Leseverstehen',
            levels: romanLevels([10, 10, 40, 20, 15, 5]),
        }),
    ];

    // items.json carries no true school aggregate: its `school` rows mirror each
    // learning group, so a school solution rate is the sum over those rows.
    const items = [
        itemRow({
            id: 'schule',
            type: 'school',
            name: 'Testschule',
            subject: 'Deutsch',
            domain: 'le',
            solved: 40,
            total: 100,
        }),
        itemRow({
            id: 'schule',
            type: 'school',
            name: 'Testschule',
            subject: 'Deutsch',
            domain: 'le',
            solved: 20,
            total: 100,
        }),
        itemRow({
            id: '8a-deutsch',
            type: 'group',
            name: 'Lerngruppe 8a-deutsch',
            subject: 'Deutsch',
            domain: 'le',
            solved: 40,
            total: 100,
        }),
        itemRow({
            id: '8b-deutsch',
            type: 'group',
            name: 'Lerngruppe 8b-deutsch',
            subject: 'Deutsch',
            domain: 'le',
            solved: 20,
            total: 100,
        }),
    ];

    const dataStore = createSlDataStore({
        [SL_DATA_KEYS.COMPETENCE_LEVELS]: competenceLevels,
        [SL_DATA_KEYS.ITEMS]: items,
    });

    // The metrics name their levels through the scale registry, exactly as
    // `fetchSlData` populates it before any view renders.
    registerCompetenceLevelScales(competenceLevels);

    const slData = slDataFromStore(dataStore);
    const queries = {
        shares: new CompetenceShareQueries({ moduleId: 'test', slData }),
        rates: new SolutionRateQueries({ moduleId: 'test', slData }),
    };

    return { competenceLevels, queries };
}
