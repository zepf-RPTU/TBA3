/**
 * Short labels for comparison-average groups (Schulschnitt, Landesschnitt(e)).
 *
 * A payload can carry several groups of the same `type` — nw splits its
 * Landesschnitt by Abschlusstrack — and they share one marker shape and one base
 * colour, so the group's own name is the only thing telling them apart. These
 * helpers derive the ordered short label (`L`, `L1`, `L2`, …) that lets a chart
 * put an index on the mark itself.
 *
 * Two label variants exist because SL and EN/MA answer the single-group case
 * differently, and both answers are correct for their surface:
 * - SL competency bars always carry an in-bar tag, so a lone Landesschnitt still
 *   needs a bare `L` to be decodable against its legend pill.
 * - EN/MA marks carry no tag when there is nothing to disambiguate, so a lone
 *   group must yield `null` and render exactly as it did before.
 */

/**
 * The role a comparison average is drawn as. `school` and `state` are the two the
 * client has a specific shape, colour and glossary term for; `other` is the
 * catch-all every unrecognised type collapses into.
 * @typedef {'school'|'state'|'other'} AverageRole
 */

/** @type {AverageRole} */
export const OTHER_AVERAGE_ROLE = 'other';

const KNOWN_AVERAGE_ROLES = new Set(['school', 'state']);

/**
 * The one value-group type that is the class itself. Everything else in a payload's
 * value groups is a comparison population.
 */
const CLASS_VALUE_GROUP_TYPE = 'group';

/**
 * Whether a value group is a comparison population rather than the class.
 *
 * The split must be stated this way round — "everything that is not the class" —
 * not as a list of accepted comparison types. Enumerating `school`/`state` and
 * treating the remainder as the class is what let a Landesschnitt overwrite the
 * class's own numbers when it carried its own payload id, and the same shape of
 * mistake files an unrecognised comparison population under the class today.
 * @param {{type?: unknown}} valueGroup - A value group from the payload.
 * @returns {boolean} True for anything that is not the class's own value group.
 */
export function isComparisonValueGroup(valueGroup) {
    return valueGroup?.type !== CLASS_VALUE_GROUP_TYPE;
}

/**
 * Map a payload value-group `type` onto the role it is rendered as.
 *
 * The spec's `type` is an open string (`value-group.yml`: "Art der Wertegruppe,
 * z.B. `group`, `student`, `school`"), so an exporter may legitimately ship a
 * comparison population this client has never heard of. Collapsing it to `other`
 * lets it render with the catch-all mark rather than taking the dashboard down.
 *
 * A *missing* or non-string type still throws: that is a malformed payload, not
 * an extension of the vocabulary, and folding it into `other` would hide it.
 *
 * Only comparison groups reach here — the class value-group is split off by its
 * own type before the role is resolved.
 * @param {unknown} type - The value group's `type`, an open string in the spec.
 * @returns {AverageRole} The role it renders as; an unrecognised type collapses to `other` rather than failing.
 */
export function resolveAverageRole(type) {
    if (typeof type !== 'string' || !type.trim()) {
        throw new Error(
            `Comparison average is missing a value-group type: '${type ?? '(missing)'}'`,
        );
    }
    return KNOWN_AVERAGE_ROLES.has(type) ? /** @type {AverageRole} */ (type) : OTHER_AVERAGE_ROLE;
}

/**
 * Role letter each comparison average is tagged with when it needs disambiguating.
 * Shared by the EN and MA adapters so both apps number the same populations the
 * same way — the ordinal is only readable if `L` means Landesschnitt everywhere.
 *
 * Keyed by **role**, not by raw payload type: every unrecognised type shares the
 * `other` mark, so they must also share one ordinal sequence. Keying on the raw
 * type would let two different unknown types each start at `V1`, putting the same
 * label on two differently-shaded marks of the same shape.
 */
export const SHORT_LABEL_PREFIX_BY_TYPE = Object.freeze({
    school: 'S',
    state: 'L',
    other: 'V',
});

/**
 * Ordered short label that is always present: `L` for a lone group, `L1`/`L2`/…
 * once there are several. Used where the mark is labelled unconditionally.
 * @param {string} prefix - Role letter (`L` for Landesschnitt, `S` for Schule)
 * @param {number} index - Position within the group's own type, 0-based
 * @param {number} count - How many groups share that type
 * @returns {string} The role letter alone for a lone group, or the letter with a 1-based ordinal.
 */
export function ordinalShortLabel(prefix, index, count) {
    return count <= 1 ? prefix : `${prefix}${index + 1}`;
}

/**
 * Ordered short label that exists only when it disambiguates something: `null`
 * for a lone group, `L1`/`L2`/… once there are several. Used where the label is
 * an addition to the mark, so a single-group dataset keeps rendering unchanged.
 * @param {string} prefix - Role letter (`L` for Landesschnitt, `S` for Schule)
 * @param {number} index - Position within the group's own type, 0-based
 * @param {number} count - How many groups share that type
 * @returns {string|null} Null for a lone group, so a single-group dataset renders unchanged; the ordinal label otherwise.
 */
export function disambiguatingShortLabel(prefix, index, count) {
    return count <= 1 ? null : `${prefix}${index + 1}`;
}

/**
 * Stamp each comparison group with its position among the groups sharing its
 * *role* (`typeIndex`) and the short label derived from it (`shortLabel`).
 * Mutates the given objects; `id`/`name` stay untouched — the short label sits
 * beside them as a render concern, never in place of identity. Shared by the
 * EN and MA adapters so both apps number the same populations the same way.
 *
 * Buckets by role rather than raw type because the ordinal and the shade ramp
 * exist to separate marks that share a shape and a base colour: two different
 * unrecognised types both draw the catch-all cross, so they must number through
 * one sequence — bucketing by raw type would start each at `V1` and label two
 * distinct marks alike.
 * @param {Array<{type: string, typeIndex?: number, shortLabel?: string|null}>} groups - The comparison groups, mutated in place with their position and short label.
 */
export function assignComparisonOrdinals(groups) {
    /** @type {Map<AverageRole, Array<{type: string, typeIndex?: number, shortLabel?: string|null}>>} */
    const byRole = new Map();
    for (const group of groups) {
        const role = resolveAverageRole(group.type);
        if (!byRole.has(role)) byRole.set(role, []);
        byRole.get(role)?.push(group);
    }

    for (const [role, roleGroups] of byRole) {
        const prefix = SHORT_LABEL_PREFIX_BY_TYPE[role];
        roleGroups.forEach((group, index) => {
            group.typeIndex = index;
            group.shortLabel = disambiguatingShortLabel(prefix, index, roleGroups.length);
        });
    }
}

/**
 * Build the two-part legend label `${prefix} = ${label}`, with only the label
 * half linked to a glossary key. Keeping the halves separate matters: the
 * glossary defines *Landesschnitt*, not *L1 = Landesschnitt*, so stamping the
 * key over the whole string would make the index part of the term.
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
