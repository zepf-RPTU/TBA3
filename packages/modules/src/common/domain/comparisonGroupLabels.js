/**
 * Short labels for comparison-average groups (Schulschnitt, Landesschnitt(e)).
 *
 * A payload can carry several groups of the same `type` (a state may split its
 * Landesschnitt by Abschlusstrack), and they share one marker shape and one base
 * colour. These helpers derive the ordered short label (`L`, `L1`, `L2`, …) that lets
 * a chart put an index on the mark itself.
 *
 * Two label variants, for the single-group case:
 * - SL competence bars always carry an in-bar tag, so a lone Landesschnitt still
 *   needs a bare `L` to be decodable against its legend pill.
 * - EN/MA marks carry no tag when there is nothing to disambiguate, so a lone
 *   group yields `null` and renders untagged.
 */

/**
 * The role a comparison average is drawn as. `school` and `state` are the two the
 * client has a specific shape, colour and glossary term for; `other` is the
 * catch-all every unrecognised type collapses into.
 * @typedef {'school'|'state'|'other'} AverageRole
 */

import { GLOSSARY_KEYS } from '../glossary/glossaryKeys.js';
import { VALUE_GROUP_TYPE } from './apiValueMaps.js';

/** @type {AverageRole} */
const OTHER_AVERAGE_ROLE = 'other';

/** @type {Set<string>} */
const KNOWN_AVERAGE_ROLES = new Set([VALUE_GROUP_TYPE.SCHOOL, VALUE_GROUP_TYPE.STATE]);

/**
 * Whether a value group is a comparison population, not the group itself.
 *
 * Stated as "everything that is not the group itself", not as a list of accepted
 * comparison types: enumerating `school`/`state` and treating the remainder as the
 * group would file an unrecognised comparison population under the group, where it
 * can overwrite the group's own numbers.
 * @param {{type?: unknown}} valueGroup
 * @returns {boolean}
 */
export function isComparisonValueGroup(valueGroup) {
    return valueGroup?.type !== VALUE_GROUP_TYPE.GROUP;
}

/**
 * Whether a value group is a population outside the school (a Landesschnitt, a district
 * average), not the school, its groups or its students.
 *
 * Stated as "not the school's own", not as a list of known comparison types: the
 * spec's `type` is an open string, and listing `state` here would drop every other
 * population. A value group without a `type` counts as external, as
 * it does for `isComparisonValueGroup`.
 *
 * Not by `id === 'state'` or `name === 'Landesschnitt'`: a state export that splits its
 * Landesschnitt by track ships one value group per track, each with its own id and
 * name ("Landesschnitt GY", …).
 * @param {{type?: unknown}} valueGroup
 * @returns {boolean}
 */
export function isExternalPopulation(valueGroup) {
    return (
        isComparisonValueGroup(valueGroup) &&
        valueGroup?.type !== VALUE_GROUP_TYPE.SCHOOL &&
        valueGroup?.type !== VALUE_GROUP_TYPE.STUDENT
    );
}

/**
 * The group's own value group, wherever it sits: the spec fixes no order, so
 * position says nothing about which value group is the group's own.
 * @template {{type?: unknown}} T
 * @param {T[]|null|undefined} valueGroups - Value groups, raw or parsed.
 * @returns {T|null} The first that is not a comparison population; null when there is none.
 */
export function findOwnValueGroup(valueGroups) {
    return (valueGroups ?? []).find((valueGroup) => !isComparisonValueGroup(valueGroup)) ?? null;
}

/**
 * Map a payload value-group `type` onto the role it is rendered as.
 *
 * The spec's `type` is an open string, so an exporter may ship a comparison population
 * this client has no name for; it renders with the catch-all mark. A missing type
 * never gets here (the DocumentStore rejects a value group without one), and neither
 * does the group's own value group, split off by its type before the role is resolved.
 * @param {string} type
 * @returns {AverageRole} `other` for an unrecognised type.
 */
export function resolveAverageRole(type) {
    return KNOWN_AVERAGE_ROLES.has(type) ? /** @type {AverageRole} */ (type) : OTHER_AVERAGE_ROLE;
}

/**
 * The glossary term a comparison average's role is explained by. `other` has none: the
 * group's own payload name is then the whole label, and any fallback term would define
 * the population as something it is not.
 * @type {Readonly<Record<AverageRole, string|null>>}
 */
const GLOSSARY_KEY_BY_ROLE = Object.freeze({
    school: GLOSSARY_KEYS.SCHULSCHNITT,
    state: GLOSSARY_KEYS.LANDESSCHNITT,
    other: null,
});

/**
 * @param {string} type
 * @returns {string|null} The glossary key for the role the type resolves to.
 */
export function averageRoleGlossaryKey(type) {
    return GLOSSARY_KEY_BY_ROLE[resolveAverageRole(type)];
}

/**
 * Role letter each comparison average is tagged with when it needs disambiguating.
 * Keyed by role, not by raw payload type (see `assignComparisonOrdinals`).
 */
export const SHORT_LABEL_PREFIX_BY_ROLE = Object.freeze({
    school: 'S',
    state: 'L',
    other: 'V',
});

/**
 * Each type's role letter, its position among the entries sharing that role, and its
 * numbered short label (`L1`, `L2`, …), which only a role shared by several entries
 * has: a lone one's is `null`.
 * @param {string[]} types
 * @returns {Array<{prefix: string, index: number, numbered: string|null}>} One entry per type, in the same order.
 */
function ordinalsByRole(types) {
    const roles = types.map(resolveAverageRole);
    /** @type {Map<AverageRole, number>} */
    const countByRole = new Map();
    for (const role of roles) countByRole.set(role, (countByRole.get(role) ?? 0) + 1);
    /** @type {Map<AverageRole, number>} */
    const seenByRole = new Map();
    return roles.map((role) => {
        const index = seenByRole.get(role) ?? 0;
        seenByRole.set(role, index + 1);
        const prefix = SHORT_LABEL_PREFIX_BY_ROLE[role];
        const numbered = (countByRole.get(role) ?? 0) > 1 ? `${prefix}${index + 1}` : null;
        return { prefix, index, numbered };
    });
}

/**
 * The always-present short label of every comparison track (`L`, `L1`, `V`, …), numbered
 * within its role (see `assignComparisonOrdinals`): the variant for surfaces that tag
 * every mark, so a lone group is its role letter.
 * @param {string[]} types - Each track's payload `type`, in draw order.
 * @returns {string[]} One label per track, in the same order.
 */
export function ordinalShortLabelsByRole(types) {
    return ordinalsByRole(types).map(({ prefix, numbered }) => numbered ?? prefix);
}

/**
 * Stamp each comparison group with its position among the groups sharing its
 * role (`roleIndex`) and the short label derived from it (`shortLabel`), which exists
 * only where it disambiguates: `null` for a lone group, whose label is an addition to
 * the mark. Mutates the given objects; `id`/`name` stay untouched.
 *
 * Buckets by role, not raw type: the ordinal and the shade ramp separate marks that
 * share a shape and a base colour, and two different unrecognised types both draw the
 * catch-all cross, so they number through one `V` sequence.
 * @param {Array<{type: string, roleIndex?: number, shortLabel?: string|null}>} groups
 */
export function assignComparisonOrdinals(groups) {
    ordinalsByRole(groups.map((group) => group.type)).forEach(({ index, numbered }, i) => {
        groups[i].roleIndex = index;
        groups[i].shortLabel = numbered;
    });
}

/**
 * Build the two-part legend label `${prefix} = ${label}`, with only the label
 * half linked to a glossary key: the glossary defines `Landesschnitt`, not
 * `L1 = Landesschnitt`.
 * @param {string} prefix - The short label, e.g. `L1`.
 * @param {string} label - The term the prefix stands for, e.g. `Landesschnitt`.
 * @param {string|null} [glossaryKey] - Stamped on the label half only, never on the prefix.
 * @returns {Array<{text: string, glossaryKey: string|null}>} Two runs: the unlinked prefix, then the label carrying the glossary key.
 */
export function buildLegendLabelSegments(prefix, label, glossaryKey = null) {
    return [
        { text: `${prefix} = `, glossaryKey: null },
        { text: label, glossaryKey },
    ];
}
