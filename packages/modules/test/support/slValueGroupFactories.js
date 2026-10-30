/**
 * Value-group factories for SL payload fixtures: `competence-levels.json` value groups (with the KMK
 * standard bands the server ships), student value groups and `aggregations.json` result value groups, plus
 * the ids of the school and Landesschnitt value groups and the box-plot statistics of a value
 * set.
 */

import { calculateDetailedBoxPlotStats } from '../../src/sl/utils/slBoxPlotStats.js';
import { BOOKLET_PROPERTY, bookletProperty, studentFields } from './competenceLevelGroups.js';
import { GER_LEVELS, ROMAN_LEVELS, serverBandFor } from './competenceScaleFixture.js';
import { required } from './required.js';

/** @typedef {import('../../src/common/data/schemas/competenceLevels.js').CompetenceLevelsValueGroup} CompetenceLevelsValueGroup */
/** @typedef {import('./competenceLevelGroups.js').CurrentLevelsValueGroup} CurrentLevelsValueGroup */
/** @typedef {import('./competenceLevelGroups.js').StudentLevelsValueGroup} StudentLevelsValueGroup */
/** @typedef {import('../../src/common/data/schemas/aggregations.js').AggregationsValueGroup} AggregationsValueGroup */

/** The school value group's id — what `detectSchoolId` resolves the school to. */
export const SCHOOL_ID = 'schule';
/** The Landesschnitt value group's id. */
export const STATE_ID = 'state';

/**
 * The KMK standard each level names. `serverBandFor` derives the `standardBand:<id>`
 * property from this wording, so a level missing here, or naming a standard between two
 * bands, ships none.
 * @type {Partial<Record<string, string>>}
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
 * One `competence-levels.json` value group with its headcount per level.
 *
 * Only the KMK standard band says what "ab Kompetenzstufe III bzw. B1" means; band
 * position cannot: `B1` is the third of five GER bands and is Regelstandard, while `A2.2`
 * is the fourth of six and is not. The value group ships it as the server does, as
 * `standardBand:<level id>` value-group properties.
 * @param {object} params
 * @param {string} params.id
 * @param {string} params.type - `school`, `state`, `group`, ….
 * @param {string} params.name - Display name; the group name for a group.
 * @param {string} params.subject - Fach name.
 * @param {string|null} [params.domainId] - Domäne id; absent for a Fach with no split.
 * @param {string|null} [params.domainName] - Domäne display name; defaults to the id.
 * @param {{[nameShort: string]: number}} params.levels - nameShort → frequency
 * @param {boolean} [params.namesStandards=true] - false mirrors an export that ships no
 *        `standardBand:` properties and repeats `nameShort` in `name`, so the scale
 *        identifies no standard at all
 * @returns {CurrentLevelsValueGroup & {subject: {name: string}}}
 */
export function competenceValueGroup({
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
        subject: { name: subject },
        domain: domainId ? { id: domainId, name: domainName ?? domainId } : undefined,
        properties: [
            BOOKLET_PROPERTY,
            ...(namesStandards
                ? entries.flatMap(([nameShort], index) => {
                      const band = serverBandFor(STANDARD_NAME_BY_LEVEL[nameShort]);
                      return band === null
                          ? []
                          : [{ key: `standardBand:${index + 1}`, value: band }];
                  })
                : []),
        ],
        competenceLevels: entries.map(([nameShort, frequency], index) => ({
            id: String(index + 1),
            nameShort,
            name: namesStandards ? (STANDARD_NAME_BY_LEVEL[nameShort] ?? nameShort) : nameShort,
            // A value group nobody was counted in states a share of 0, as the server does;
            // 0 / 0 would be NaN, which the schema rejects.
            descriptiveStatistics: { total, mean: total > 0 ? frequency / total : 0, frequency },
        })),
    };
}

/**
 * A Deutsch: Lesen value group with the given level counts.
 * @param {Omit<Parameters<typeof competenceValueGroup>[0], 'subject' | 'levels'> & {subject?: string, counts: {[nameShort: string]: number}}} params - `counts` maps each level to its headcount.
 * @returns {ReturnType<typeof competenceValueGroup>}
 */
export function readingValueGroup({ counts, ...valueGroup }) {
    return competenceValueGroup({
        subject: 'Deutsch',
        domainId: 'le',
        domainName: 'Lesen',
        ...valueGroup,
        levels: counts,
    });
}

/**
 * The Roman ladder's levels with their headcounts.
 * @param {number[]} counts - Headcount per level, lowest first; a missing one is 0.
 * @returns {{[nameShort: string]: number}} nameShort → frequency, for `competenceValueGroup`.
 */
export function romanLevels(counts) {
    return Object.fromEntries(ROMAN_LEVELS.map((level, index) => [level, counts[index] ?? 0]));
}

/**
 * The GER ladder's levels with their headcounts.
 * @param {number[]} counts - Headcount per level, lowest first; a missing one is 0.
 * @returns {{[nameShort: string]: number}} nameShort → frequency, for `competenceValueGroup`.
 */
export function gerLevels(counts) {
    return Object.fromEntries(GER_LEVELS.map((level, index) => [level, counts[index] ?? 0]));
}

/**
 * The box-plot statistics of a non-empty set, as every SL box plot derives them.
 * @param {number[]} values
 * @returns {import('../../src/sl/utils/slBoxPlotStats.js').BoxPlotStats}
 */
export const statsOf = (values) => required(calculateDetailedBoxPlotStats(values), 'statistics');

/**
 * One `students-competence-levels.json` value group: a student named by its id, in a group.
 * @param {object} params
 * @param {string} params.id - Also its name.
 * @param {string} params.subject
 * @param {string} params.groupName - The `group` covariate.
 * @param {string|null} [params.gender] - The `gender` covariate; a student without one when `null`.
 * @param {string} [params.level] - The level reached; a value group without levels when absent.
 * @param {{id: string, name: string}} [params.domain] - The Domäne; the value group carries the key only when the caller names it.
 * @param {Array<{key: string, value: string}>} [params.properties] - Added to the name properties.
 * @returns {StudentLevelsValueGroup}
 */
export function studentValueGroup({ id, subject, groupName, gender = null, level, ...fields }) {
    const student = studentFields(groupName, id);
    return {
        id,
        type: 'student',
        name: id,
        subject: { name: subject },
        ...fields,
        properties: [...student.properties, ...(fields.properties ?? [])],
        covariates: [
            ...student.covariates,
            ...(gender === null ? [] : [{ type: 'gender', value: gender }]),
        ],
        competenceLevels:
            level === undefined
                ? []
                : [
                      {
                          nameShort: level,
                          descriptiveStatistics: { total: 1, frequency: 1, mean: 1 },
                      },
                  ],
    };
}

/**
 * Result value group for the Lösungsquote metric (aggregations.json shape). A school or group
 * counts its responses in the three `result` buckets; a Landesschnitt states only the
 * `Richtig` share, as the API delivers it.
 * @param {object} params
 * @param {string} params.id
 * @param {string} params.type - `school`, `state`, `group`, ….
 * @param {string} params.name
 * @param {string} params.subject
 * @param {string|null} [params.domain] - Domäne id, also its name; absent for a Fach with no split.
 * @param {number} params.solved - Responses answered right.
 * @param {number} params.total - Responses in all.
 * @param {number} [params.notAttempted] - Responses left unanswered, of `total`.
 * @returns {AggregationsValueGroup}
 */
export function resultValueGroup({
    id,
    type,
    name,
    subject,
    domain,
    solved,
    total,
    notAttempted = 0,
}) {
    /**
     * @param {string} value - The `result` bucket.
     * @param {number} frequency - Its responses.
     * @returns {AggregationsValueGroup['aggregations'][number]}
     */
    const bucket = (value, frequency) => ({
        type: 'result',
        value,
        descriptiveStatistics: { mean: frequency / total, frequency },
    });
    return {
        id,
        type,
        name,
        subject: { name: subject },
        domain: domain ? { id: domain, name: domain } : undefined,
        aggregations:
            type === 'state'
                ? [
                      {
                          type: 'result',
                          value: 'Richtig',
                          descriptiveStatistics: { mean: solved / total },
                      },
                  ]
                : [
                      bucket('Richtig', solved),
                      bucket('Falsch', total - solved - notAttempted),
                      bucket('Unbearbeitet', notAttempted),
                  ],
    };
}

/**
 * A value group with its `booklet` property set, replacing the one it carries.
 * @template {{properties?: Array<{key: string, value: unknown}>|null}} TValueGroup
 * @param {TValueGroup} valueGroup - A competence-levels value group.
 * @param {string} booklet - The booklet id; comma-joined for a value group pooled over several.
 * @returns {TValueGroup}
 */
export function withBooklet(valueGroup, booklet) {
    return {
        ...valueGroup,
        properties: [
            ...(valueGroup.properties ?? []).filter((property) => property.key !== 'booklet'),
            bookletProperty(booklet),
        ],
    };
}

/** The two Deutsch booklets of `twoBookletSubject`. */
export const DEUTSCH_BOOKLETS = Object.freeze(['26-V8-DE-TH-1', '26-V8-DE-TH-2']);

/**
 * A Deutsch Fach tested with two booklets: group 8a on the first, 8b on the second, the
 * school and the Landesschnitt pooled over both. Each group's id is its name.
 * @param {string|null} [domainId] - The one Domäne the value groups are of; none by default.
 * @returns {Array<ReturnType<typeof competenceValueGroup>>} The `competence-levels.json` value groups.
 */
export function twoBookletSubject(domainId = null) {
    const [first, second] = DEUTSCH_BOOKLETS;
    /**
     * @param {string} id - The value group's id, its name too.
     * @param {string} type - `school`, `state` or `group`.
     * @param {string} booklet
     * @returns {ReturnType<typeof competenceValueGroup>}
     */
    const valueGroup = (id, type, booklet) =>
        withBooklet(
            competenceValueGroup({
                id,
                type,
                name: id,
                subject: 'Deutsch',
                domainId,
                levels: { III: 1 },
            }),
            booklet,
        );
    return [
        valueGroup(SCHOOL_ID, 'school', `${first},${second}`),
        valueGroup(STATE_ID, 'state', `${first},${second}`),
        valueGroup('8a', 'group', first),
        valueGroup('8b', 'group', second),
    ];
}

/**
 * A Deutsch whose booklets each cover two of its three Domänen, as in NW: group 8a sat
 * the first (Lesen and Rechtschreibung), 8b the second (Lesen and Sprachgebrauch); the
 * school and the Landesschnitt pool each Domäne over the booklets sat in it. So Lesen was
 * sat in both booklets, Rechtschreibung and Sprachgebrauch in one each. Every group
 * solved 60 of 100 responses in each Domäne it sat, the school 50 of 100, the
 * Landesschnitt 40 %; each group's id is its name.
 * @returns {{competenceLevels: Array<ReturnType<typeof competenceValueGroup>>, aggregation: AggregationsValueGroup[]}} The `competence-levels.json` and `aggregations.json` value groups.
 */
export function domainBookletSubject() {
    const [first, second] = DEUTSCH_BOOKLETS;
    /** @type {Array<[string, string[]]>} Each Domäne with the booklets that held it. */
    const domains = [
        ['le', [first, second]],
        ['rs', [first]],
        ['sp', [second]],
    ];
    /** @type {Array<[string, string]>} Each group with its booklet. */
    const groups = [
        ['8a', first],
        ['8b', second],
    ];
    return {
        competenceLevels: domains.flatMap(([domainId, booklets]) =>
            [
                { id: SCHOOL_ID, type: 'school', booklet: booklets.join(',') },
                { id: STATE_ID, type: 'state', booklet: booklets.join(',') },
                ...groups
                    .filter(([, booklet]) => booklets.includes(booklet))
                    .map(([id, booklet]) => ({ id, type: 'group', booklet })),
            ].map(({ id, type, booklet }) =>
                withBooklet(
                    competenceValueGroup({
                        id,
                        type,
                        name: id,
                        subject: 'Deutsch',
                        domainId,
                        levels: { III: 1 },
                    }),
                    booklet,
                ),
            ),
        ),
        aggregation: domains.flatMap(([domainId, booklets]) =>
            [
                { id: SCHOOL_ID, type: 'school', solved: 50 },
                { id: STATE_ID, type: 'state', solved: 40 },
                ...groups
                    .filter(([, booklet]) => booklets.includes(booklet))
                    .map(([id]) => ({ id, type: 'group', solved: 60 })),
            ].map(({ id, type, solved }) =>
                resultValueGroup({
                    id,
                    type,
                    name: id,
                    subject: 'Deutsch',
                    domain: domainId,
                    solved,
                    total: 100,
                }),
            ),
        ),
    };
}
