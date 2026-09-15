/**
 * Competence Scale — the band scale and its cut scores, read from the payload.
 *
 * A VERA subject is not one scale. Six states publish four different band vocabularies
 * for mathematics alone (`MiStd--…OptStd` in hb, `MiStd-…OptStd` in ni, `KS1a…KS5` in
 * rp/sl/dg, `k.h.N.…KS 5` in nw); English splits `A1…C1` in hb against `A1.1…B1.2` in ni
 * and `k.h.N.…KS 5` in nw. The cut scores differ per Testheft, and booklets of one scale
 * disagree about how many bands they define. None of that can be a constant in the
 * frontend.
 *
 * **One scope, one booklet.** A group scope is a Testheft-Gruppe — the unit a booklet was
 * handed to — so its own value-groups carry exactly one `equivalenceTable:*` key. The
 * resolvers below rely on that and do not choose between tables. (School and
 * Landesschnitt rows still pool several booklets and carry several keys; nothing here
 * reads them.)
 *
 * All of it is in the response already:
 *   - the ordered band list as `competenceLevels[].nameShort`
 *   - the cut scores string-encoded per booklet under
 *     `properties['equivalenceTable:<bookletId>']`, e.g.
 *     `maxScore=31;itemCount=35;studentCount=10;k.h.N.=0-6;KS 1a=7-12;…`
 *
 * The head fields (`maxScore`, `itemCount`, `studentCount`) come first, then one
 * `<nameShort>=<min>-<max>` pair per band in ascending order. Splitting on the *first*
 * `=` matters: band labels contain `-` and `.` (`MiStd--`, `k.h.N.`), so the value —
 * never the label — is what gets split on `-`.
 *
 * Datasets that ship no equivalence table at all yield empty results here, and callers
 * render without threshold presets (typed absence). The EN and MA demo fixtures carry
 * synthesised tables — see ASSUMPTION-EN-DEMO-EQUIVALENCE-TABLES and
 * ASSUMPTION-MA-DEMO-EQUIVALENCE-TABLES.
 */

import { isComparisonValueGroup } from './comparisonGroupLabels.js';

const TABLE_KEY_PREFIX = 'equivalenceTable:';
const HEAD_FIELDS = new Set(['maxScore', 'itemCount', 'studentCount']);

/**
 * Parse every equivalence table carried by one value-group.
 * @param {object} valueGroup - A value-group from competence-levels.json
 * @returns {{[bookletId: string]: {maxScore: number, itemCount?: number, studentCount?: number, bands: Array<{nameShort: string, minScore: number, maxScore: number}>}}}
 *   Keyed by booklet id; empty when the value-group carries no table.
 */
export function parseEquivalenceTables(valueGroup) {
    /** @type {{[bookletId: string]: any}} */
    const tables = {};

    for (const prop of valueGroup?.properties ?? []) {
        if (!prop?.key?.startsWith(TABLE_KEY_PREFIX)) continue;

        const bookletId = prop.key.slice(TABLE_KEY_PREFIX.length);
        const head = {};
        const bands = [];

        for (const pair of (prop.value ?? '').split(';')) {
            const sep = pair.indexOf('=');
            if (sep < 0) continue;
            const name = pair.slice(0, sep);
            const value = pair.slice(sep + 1);

            if (HEAD_FIELDS.has(name)) {
                head[name] = Number(value);
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

        if (bands.length > 0) tables[bookletId] = { ...head, bands };
    }

    return tables;
}

/**
 * The one equivalence table this value-group's numbers are on.
 *
 * A group scope sits exactly one booklet, so there is nothing to choose: the row carries
 * one table or none. Carrying several is a contract violation rather than a case to
 * average — averaging cut scores would draw a band boundary in a place no booklet uses —
 * so it warns and reports absence, which callers already render as "no threshold
 * presets".
 * @param {object} valueGroup - A value-group from competence-levels.json
 * @returns {{maxScore: number, itemCount?: number, studentCount?: number,
 *   bands: Array<{nameShort: string, minScore: number, maxScore: number}>}|null}
 *   null when the value-group carries no table, or more than one.
 */
export function resolveEquivalenceTable(valueGroup) {
    const tables = parseEquivalenceTables(valueGroup);
    const ids = Object.keys(tables);

    if (ids.length === 1) return tables[ids[0]];
    if (ids.length > 1) {
        console.warn(
            `[competenceScale] Value-group "${valueGroup?.id}" carries ${ids.length} equivalence ` +
                `tables (${ids.join(', ')}); a group scope must carry exactly one. ` +
                'Reporting no table rather than picking one.',
        );
    }
    return null;
}

/**
 * The ordered band labels the data reports on.
 *
 * Read from the class's own value-group, found by its `type` wherever it sits in the
 * document — comparison rows can be on a different booklet's scale (a nw class on a
 * 6-band Testheft next to 7-band Landesschnitt rows), and the class's scale is the one
 * its students are placed on.
 * @param {Array} competenceLevelsData - competence-levels.json
 * @returns {string[]} Ordered `nameShort`s, empty when there is no data or no class row
 */
export function getScaleLevels(competenceLevelsData) {
    const classRow = (competenceLevelsData ?? []).find((row) => !isComparisonValueGroup(row));
    const levels = classRow?.competenceLevels ?? [];
    return levels.map((level) => level?.nameShort).filter(Boolean);
}

/**
 * The score at which each band above the lowest one starts — the "Schwellenwert"s a
 * student can sit one point above or below.
 *
 * The floor band's own minimum (always 0) is not a transition and is excluded.
 * @param {object} valueGroup - A value-group from competence-levels.json
 * @returns {number[]} Ascending threshold scores; empty when unavailable
 */
export function getKsThresholds(valueGroup) {
    return (resolveEquivalenceTable(valueGroup)?.bands ?? [])
        .slice(1)
        .map((band) => band.minScore)
        .filter((score) => Number.isFinite(score));
}
