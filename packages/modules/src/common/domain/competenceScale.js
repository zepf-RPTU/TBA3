/**
 * The band scale and its cut scores, read from the payload.
 *
 * A VERA subject is not one scale: state exports ship different band vocabularies
 * (`MiStd…OptStd`, `KS 1…KS 5`, `A1…C1`, `A1.1…B1.2`), the cut scores differ per
 * Testheft, and booklets of one scale disagree about how many bands they define.
 *
 * A group scope is a Testheft-Gruppe (the unit a booklet was handed to), so its own
 * value groups carry exactly one `equivalenceTable:*` key; the resolvers below rely on
 * that. School and Landesschnitt value groups pool several booklets and carry several
 * keys; nothing here reads them.
 *
 * The payload carries:
 *   - the ordered band list as `competenceLevels[].nameShort`
 *   - the cut scores string-encoded per booklet under
 *     `properties['equivalenceTable:<bookletId>']`, e.g.
 *     `maxScore=31;itemCount=35;k.h.N.=0-6;KS 1a=7-12;…`
 *
 * The head fields (`maxScore`, `itemCount`) come first, then one
 * `<nameShort>=<min>-<max>` pair per band in ascending order. A pair is split on its
 * first `=`, and only the value on `-`: band labels contain `-` and `.` (`MiStd--`,
 * `k.h.N.`).
 *
 * A dataset without an equivalence table yields empty results.
 */

import { findOwnValueGroup } from './comparisonGroupLabels.js';

const TABLE_KEY_PREFIX = 'equivalenceTable:';
const HEAD_FIELDS = new Set(['maxScore', 'itemCount']);

/**
 * The part of a `competence-levels.json` value-group the equivalence tables are read from.
 * @typedef {{id?: string, properties?: Array<{key?: string, value?: string}>|null}} EquivalenceTableSource
 */

/**
 * One booklet's cut scores, its Äquivalenztabelle.
 * @typedef {object} EquivalenceTable
 * @property {number} maxScore - Top of the band scale.
 * @property {number} itemCount - Items of this domain on the booklet.
 * @property {Array<{nameShort: string, minScore: number, maxScore: number}>} bands - Ascending, boundaries inclusive.
 */

/**
 * Parse one encoded table.
 * @param {string|undefined} encoded - A `properties['equivalenceTable:<bookletId>']` value
 * @returns {EquivalenceTable|null} null when the value lacks a positive head field, names no
 *   band or a band with a non-numeric bound
 */
function parseTable(encoded) {
    /** @type {Record<string, number>} */
    const head = {};
    const bands = [];

    for (const pair of (encoded ?? '').split(';')) {
        const sep = pair.indexOf('=');
        if (sep < 0) continue;
        const name = pair.slice(0, sep);
        const value = pair.slice(sep + 1);

        if (HEAD_FIELDS.has(name)) {
            // An empty, non-numeric or non-positive head is left out, which drops the
            // table: thresholds are divided by `itemCount`.
            const number = value.trim() === '' ? NaN : Number(value);
            if (Number.isFinite(number) && number > 0) head[name] = number;
            continue;
        }
        const dash = value.indexOf('-');
        if (dash < 0) continue;
        bands.push({
            nameShort: name,
            minScore: Number(value.slice(0, dash)),
            maxScore: Number(value.slice(dash + 1)),
        });
    }

    if (
        bands.length === 0 ||
        head.maxScore === undefined ||
        head.itemCount === undefined ||
        bands.some((band) => !Number.isFinite(band.minScore) || !Number.isFinite(band.maxScore))
    ) {
        return null;
    }
    return { maxScore: head.maxScore, itemCount: head.itemCount, bands };
}

/**
 * The one equivalence table this value-group's numbers are on.
 *
 * A group scope's value group carries one table or none. Several is a contract
 * violation, not a case to average (averaged cut scores would draw a band boundary no
 * booklet uses): it warns and reports absence.
 * @param {EquivalenceTableSource|null|undefined} valueGroup - A value-group from competence-levels.json
 * @returns {EquivalenceTable|null} null when the value-group carries no table, or more than one.
 */
function resolveEquivalenceTable(valueGroup) {
    const props = (valueGroup?.properties ?? []).filter((prop) =>
        prop?.key?.startsWith(TABLE_KEY_PREFIX),
    );

    if (props.length === 1) return parseTable(props[0]?.value);
    if (props.length > 1) {
        console.warn(
            `[competenceScale] Value-group "${valueGroup?.id}" carries ${props.length} equivalence ` +
                `tables (${props.map((prop) => prop?.key).join(', ')}); a group scope must carry ` +
                'exactly one. Reporting no table rather than picking one.',
        );
    }
    return null;
}

/**
 * The group's own cut scores: the table on its `group` value group. School and state
 * value groups pool several booklets, so neither may be read for the group's cut scores.
 * @param {Array<EquivalenceTableSource & {type?: string}>} valueGroups - Value groups of competence-levels.json (the group's own and the comparisons).
 * @returns {EquivalenceTable|null} `null` when it carries none.
 */
export function resolveGroupEquivalenceTable(valueGroups) {
    return resolveEquivalenceTable(findOwnValueGroup(valueGroups));
}

/**
 * The score at which each band above the lowest one starts: the Schwellenwerte a
 * student can sit one point above or below. The floor band's own minimum is not a
 * transition and is excluded.
 * @param {EquivalenceTable|null|undefined} table - A table from {@link resolveGroupEquivalenceTable}
 * @returns {number[]} Ascending threshold scores; empty when unavailable
 */
export function getCompetenceLevelThresholds(table) {
    return (table?.bands ?? [])
        .slice(1)
        .map((band) => band.minScore)
        .filter((score) => Number.isFinite(score));
}
