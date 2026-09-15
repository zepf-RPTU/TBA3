/**
 * Payload rows for `registerCompetenceLevelScales`, shaped the way the server ships them.
 *
 * Since 2026-08-31 the client reads a level's KMK standard rank from the
 * `standardRank:<level id>` row property and from nowhere else — the name→rank table it
 * used to keep is gone, so a scale is defined by the payload alone. Every suite that registers a scale therefore
 * has to ship the rank as data, and this module is where that one fake-server rule lives
 * instead of being re-derived in each test file.
 *
 * `name` is set only so a caller can spell a rank the way an export does; nothing in the
 * client reads it. A level with neither a `rank` nor a recognised `name` ships no key at
 * all, which is exactly how an export produces a rankless scale.
 */

import { registerItemCompetenceScales } from '@tba3/modules/common/services/competenceLevelPalette.js';

/**
 * What the *server* computes from each standard's wording and ships as `standardRank:<id>`.
 * It belongs in a fake payload
 * builder and nowhere else: the client reads the number, never the German.
 */
const SERVER_RANK_BY_STANDARD = Object.freeze({
    'weit unter mindeststandard': 1,
    'weit u. mindeststandard': 1,
    'unter mindeststandard': 1,
    mindeststandard: 2,
    regelstandard: 3,
    'regelstandard plus': 4,
    optimalstandard: 5,
});

/**
 * The rank the server would compute for one standard wording.
 * @param {string|null|undefined} name - `competenceLevels[].name` as the export spells it.
 * @returns {number|null} 1…5, or null when the wording names no standard.
 */
function serverRankFor(name) {
    if (typeof name !== 'string') return null;
    const normalized = name
        .replace(/\s*\([^)]*\)\s*$/, '')
        .trim()
        .replace(/\s+/g, ' ')
        .toLowerCase();
    return SERVER_RANK_BY_STANDARD[normalized] ?? null;
}

/**
 * One `competence-levels.json` row carrying a whole ladder.
 *
 * Levels are numbered 1..N in the order given — the ids the `standardRank:<id>` keys
 * address, exactly as the export does.
 * @param {Array<{nameShort: string, name?: string|null, rank?: number|null, description?: string|null}>} levels
 *        The ladder, lowest first. `rank` wins over `name` — including an explicit
 *        `rank: null`, which is how a caller says "this rung is unranked" while still
 *        giving it a standard's wording. Omit both for an unranked level.
 * @param {Array<{key: string, value: string}>} [extraProperties] - Row properties to add, e.g. `levelColor:<id>`.
 * @returns {{properties: Array<object>, competenceLevels: Array<object>}} The row.
 */
export function scalePayloadRow(levels, extraProperties = []) {
    const entries = levels.map((level, index) => ({
        id: String(index + 1),
        nameShort: level.nameShort,
        name: level.name ?? null,
        description: level.description ?? null,
        // `Object.hasOwn`, not `??`: `rank: null` states "unranked" and must not fall
        // through to the wording, or a fixture built to exercise a rankless rung would
        // silently ship the rank its `name` implies.
        rank: Object.hasOwn(level, 'rank') ? level.rank : serverRankFor(level.name),
    }));

    return {
        properties: [
            ...entries.flatMap((entry) =>
                entry.rank === null || entry.rank === undefined
                    ? []
                    : [{ key: `standardRank:${entry.id}`, value: String(entry.rank) }],
            ),
            ...extraProperties,
        ],
        competenceLevels: entries.map(({ id, nameShort, name, description }) => ({
            id,
            nameShort,
            name,
            description,
        })),
    };
}

/**
 * What the *server* computes for an item-scale slot and ships as `standardRank:<level id>`.
 *
 * Keyed on the item *band* rather than the slot, which is the same mapping folded: `Ia`/`Ib`
 * are one rank, and a CEFR sub-level shares its major's. Lives in this fake payload builder
 * for the same reason `SERVER_RANK_BY_STANDARD` does — the client reads the number and states
 * none of this itself.
 */
const SERVER_RANK_BY_ITEM_BAND = Object.freeze({
    I: 1,
    II: 2,
    III: 3,
    IV: 4,
    V: 5,
    A1: 1,
    A2: 2,
    B1: 3,
    B2: 4,
    C1: 5,
});

/** The band an item level sits on: `A1.1` → `A1`, `Ia` → `I`. Mirrors `deriveBandKey`. */
function itemBandOf(nameShort) {
    const name = String(nameShort).trim();
    const dotted = /^(.+)\.\d+$/.exec(name);
    if (dotted) return dotted[1];
    const romanSub = /^([IVXLC]+)[a-z]$/.exec(name);
    return romanSub ? romanSub[1] : name;
}

/**
 * One `items.json`-shaped document carrying an Aufgabenniveau scale.
 *
 * The item scale is registered from the payload like the reporting one
 * (`registerItemCompetenceScales`), so a suite that exercises item levels has to ship it —
 * `id` gives the order, `description` the colour, and the row's `standardRank:<id>` the KMK
 * rank that relates an Aufgabenniveau to a reported Kompetenzstufe.
 * @param {Array<string|{nameShort: string, color?: string, rank?: number|null}>} levels - The item ladder, lowest first.
 * @returns {Array<object>} Rows shaped like `items.json`.
 */
export function itemPayloadRows(levels) {
    const rankOf = (level, nameShort) =>
        typeof level === 'string' || level.rank === undefined
            ? (SERVER_RANK_BY_ITEM_BAND[itemBandOf(nameShort)] ?? null)
            : level.rank;

    return [
        {
            id: 'group-1',
            type: 'group',
            properties: levels.flatMap((level, index) => {
                const nameShort = typeof level === 'string' ? level : level.nameShort;
                const rank = rankOf(level, nameShort);
                return rank === null || rank === undefined
                    ? []
                    : [{ key: `standardRank:${index + 1}`, value: String(rank) }];
            }),
            items: levels.map((level, index) => {
                const nameShort = typeof level === 'string' ? level : level.nameShort;
                const color = typeof level === 'string' ? null : (level.color ?? null);
                return {
                    id: `item-${index + 1}`,
                    parameters: {
                        competenceLevel: {
                            id: String(index + 1),
                            name: nameShort,
                            nameShort,
                            description: color,
                        },
                    },
                };
            }),
        },
    ];
}

/**
 * Register both Aufgabenniveau ladders the server contract defines.
 *
 * Call after every `resetCompetenceLevelPalette()`, including mid-test ones: the reset drops
 * item scales along with reporting scales, and an unregistered item level correctly resolves
 * to nothing — which silently turns a bridge assertion into a null.
 * @returns {void}
 */
export function registerStandardItemScales() {
    registerItemCompetenceScales(itemPayloadRows(['Ia', 'Ib', 'II', 'III', 'IV', 'V']));
    registerItemCompetenceScales(
        itemPayloadRows(['A1.1', 'A1.2', 'A2.1', 'A2.2', 'B1.1', 'B1.2', 'B2.1', 'B2.2', 'C1.1']),
    );
}
