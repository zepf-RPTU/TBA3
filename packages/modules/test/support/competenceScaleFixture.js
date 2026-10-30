/**
 * Payload value groups for `CompetenceLevelPalette#registerCompetenceLevelScales`, shaped the way the server ships them.
 *
 * The client reads a level's KMK standard only from the `standardBand:<level id>`
 * value-group property, and the item slots it covers only from `itemLevelSpan:<level id>`,
 * so every suite that registers a scale ships both as data; this module holds that
 * fake-server rule.
 *
 * `name` lets a caller spell a standard the way an export does; the client does not read
 * it. A level with neither a `band` nor a recognised `name` ships no band key, as an
 * export does for the levels between two standards.
 */

import { getBandPaint } from '../../src/common/services/competenceLevelColors.js';
import { BOOKLET_PROPERTY } from './competenceLevelGroups.js';

/** The GER ladder a reporting scale ships, lowest first. */
export const GER_LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1'];
/** The VERA 8 Roman ladder with its first band split in two — also the de/ma Aufgabenniveau ladder. */
export const ROMAN_LEVELS = ['Ia', 'Ib', 'II', 'III', 'IV', 'V'];
/** The VERA 3 Roman ladder: five levels, five item slots. */
export const VERA3_ROMAN_LEVELS = ['I', 'II', 'III', 'IV', 'V'];
/** The CEFR Aufgabenniveau ladder of en/fr items: ten slots. */
const CEFR_ITEM_LEVELS = [
    'A1.1',
    'A1.2',
    'A2.1',
    'A2.2',
    'B1.1',
    'B1.2',
    'B2.1',
    'B2.2',
    'C1.1',
    'C1.2',
];
/** A `KS` ladder; `k.h.N.` names no standard. */
export const KS_LEVELS = ['k.h.N.', 'KS 1', 'KS 2', 'KS 3', 'KS 4', 'KS 5'];
/** The same `KS` ladder with `KS 1` split in two. */
export const KS_SPLIT_LEVELS = ['k.h.N.', 'KS 1a', 'KS 1b', 'KS 2', 'KS 3', 'KS 4', 'KS 5'];
/** The five KMK standards as an export words them, lowest first. */
export const KMK_NAMES = [
    'unter Mindeststandard',
    'Mindeststandard',
    'Regelstandard',
    'Regelstandard plus',
    'Optimalstandard',
];

/**
 * The item-slot spans the server ships per reporting level, one table per item
 * vocabulary. Fake-server knowledge: the server reads the slots off the short label and
 * closes the gaps between bands; the client reads only the numbers.
 */
/** de/ma VERA 8: six Roman slots `Ia…V`. Covers the Roman and `KS` spellings. */
export const ROMAN_SPANS = Object.freeze({
    Ia: '1',
    Ib: '2',
    II: '3',
    III: '4',
    IV: '5',
    V: '6',
    'KS 1': '1-2',
    'KS 1a': '1',
    'KS 1b': '2',
    'KS 2': '3',
    'KS 3': '4',
    'KS 4': '5',
    'KS 5': '6',
});
/** de/ma VERA 3: five Roman slots `I…V`. */
export const VERA3_SPANS = Object.freeze({ I: '1', II: '2', III: '3', IV: '4', V: '5' });
/** en/fr: ten CEFR slots `A1.1…C1.2`. */
export const GER_SPANS = Object.freeze({
    A1: '1-2',
    A2: '3-4',
    B1: '5-6',
    B2: '7-8',
    C1: '9-10',
});

/**
 * The `standardBand:<id>` a fake payload ships, looked up by the standard's wording, which
 * is what a suite writes down. Fake-server knowledge: the client reads the band, never
 * the German. Mindeststandard and Regelstandard plus lie between two standards and
 * ship no band.
 * @type {Readonly<Partial<Record<string, StandardBand>>>}
 */
const SERVER_BAND_BY_STANDARD = Object.freeze({
    'weit unter mindeststandard': 'low',
    'weit u. mindeststandard': 'low',
    'unter mindeststandard': 'low',
    regelstandard: 'medium',
    optimalstandard: 'high',
});

/** @typedef {import('../../src/common/data/schemas/competenceLevels.js').CompetenceLevelsValueGroup} CompetenceLevelsValueGroup */
/** @typedef {import('./competenceLevelGroups.js').CurrentLevelsValueGroup} CurrentLevelsValueGroup */
/** @typedef {import('../../src/common/data/schemas/items.js').ItemsValueGroup} ItemsValueGroup */
/** @typedef {import('../../src/common/services/competenceScalePayload.js').StandardBand} StandardBand */

/**
 * The band a fake payload ships for one standard wording.
 * @param {string|null|undefined} name - `competenceLevels[].name` as the export spells it.
 * @returns {StandardBand|null} Null when the wording names none.
 */
export function serverBandFor(name) {
    if (typeof name !== 'string') return null;
    const normalized = name
        .replace(/\s*\([^)]*\)\s*$/, '')
        .trim()
        .replace(/\s+/g, ' ')
        .toLowerCase();
    return SERVER_BAND_BY_STANDARD[normalized] ?? null;
}

/**
 * One `competence-levels.json` value group carrying a whole ladder.
 *
 * Levels are numbered 1..N in the order given: the ids the `standardBand:<id>` and
 * `itemLevelSpan:<id>` keys address, as in an export.
 * @param {Array<{nameShort: string, name?: string|null, band?: string|null, span?: string|null,
 *                description?: string|null}>} levels
 *        The ladder, lowest first. `band` wins over `name`; an explicit `band: null`
 *        leaves a rung untagged while it keeps a standard's wording. `span` ships verbatim,
 *        so a suite can ship a malformed one; omitted, the level ships none.
 * @param {Array<{key: string, value: string}>} [extraProperties] - Value-group properties to add, e.g. `levelColor:<id>`.
 * @returns {CurrentLevelsValueGroup} Without the value group's identity or the levels'
 *     statistics, which no scale reader reads.
 */
export function scaleValueGroup(levels, extraProperties = []) {
    const entries = levels.map((level, index) => ({
        id: String(index + 1),
        nameShort: level.nameShort,
        name: level.name,
        description: level.description,
        // `Object.hasOwn`, not `??`: `band: null` states "untagged" and must not fall
        // through to the band its `name` implies.
        band: Object.hasOwn(level, 'band') ? level.band : serverBandFor(level.name),
        span: level.span ?? null,
    }));

    const valueGroup = {
        properties: [
            BOOKLET_PROPERTY,
            ...entries.flatMap((entry) =>
                entry.band === null || entry.band === undefined
                    ? []
                    : [{ key: `standardBand:${entry.id}`, value: entry.band }],
            ),
            ...entries.flatMap((entry) =>
                entry.span === null
                    ? []
                    : [{ key: `itemLevelSpan:${entry.id}`, value: entry.span }],
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
    // Not completed to a full value group: the scale readers spread each level into the scale
    // they collect, so statistics added here would surface in every level a test compares.
    return /** @type {CurrentLevelsValueGroup} */ (/** @type {unknown} */ (valueGroup));
}

/**
 * A scale value group over a ladder of short names. `names` supplies the KMK standard each level
 * carries, from which `scaleValueGroup` derives the `standardBand:<id>` properties; a
 * level without one is named by its short name, which is what a state export sends for a
 * scale that names no standard.
 * @param {string[]} levelNames - The ladder, lowest first.
 * @param {string[]} [names] - Per-level KMK standard wording.
 * @param {object} [extras] - What the value group ships beyond its names.
 * @param {Array<string|null>} [extras.descriptions] - Per-level `description`; given, a
 *        level without one ships `null`, omitted, no level carries the field.
 * @param {Array<string|null>} [extras.colors] - Per-level `levelColor:<id>` value-group property,
 *        the only carrier a state's ramp arrives on. A `null` ships no key for that band.
 * @param {Readonly<Record<string, string>>} [extras.spans] - The item-slot span per level name
 *        (`ROMAN_SPANS`, `VERA3_SPANS`, `GER_SPANS`); a level it does not name ships none.
 * @param {Array<StandardBand|null>} [extras.bands] - Per-level `standardBand:<id>`, in place
 *        of the band `names` imply; `null` leaves the level untagged, the way an export
 *        ships `k.h.N.` and the levels between two standards.
 * @returns {CurrentLevelsValueGroup}
 */
export function ladderValueGroup(
    levelNames,
    names = [],
    { descriptions, colors = [], spans, bands } = {},
) {
    return scaleValueGroup(
        levelNames.map((nameShort, index) => ({
            nameShort,
            name: names[index] ?? nameShort,
            ...(descriptions ? { description: descriptions[index] ?? null } : {}),
            ...(spans?.[nameShort] ? { span: spans[nameShort] } : {}),
            ...(bands ? { band: bands[index] ?? null } : {}),
        })),
        colors.flatMap((color, index) =>
            color ? [{ key: `levelColor:${index + 1}`, value: color }] : [],
        ),
    );
}

/**
 * A level's fill under a theme, as the charts paint it: the theme is stamped on `<html>`
 * the way `competenceLevelThemeService` stamps it, and the previous one put back after.
 * @param {import('../../src/common/services/competenceLevelPalette.js').CompetenceLevelPalette} palette
 * @param {string} level
 * @param {string|undefined} scaleId - Which ladder `level` belongs to.
 * @param {string} themeId
 * @param {'light'|'dark'} [scheme]
 * @returns {string|null} Null when `level` is not a registered level.
 */
export function bandColor(palette, level, scaleId, themeId, scheme = 'light') {
    const { dataset } = document.documentElement;
    const previous = dataset.competenceLevelTheme;
    dataset.competenceLevelTheme = themeId;
    try {
        return getBandPaint(palette, level, scaleId, scheme)?.color ?? null;
    } finally {
        if (previous === undefined) delete dataset.competenceLevelTheme;
        else dataset.competenceLevelTheme = previous;
    }
}

/**
 * The value-group property a booklet's `Äquivalenztabelle` arrives on.
 * @param {string} bookletId
 * @param {string} value - The encoded table.
 * @returns {{key: string, value: string}}
 */
export const equivalenceTable = (bookletId, value) => ({
    key: `equivalenceTable:${bookletId}`,
    value,
});

/**
 * A `competence-levels.json` value group spelled out by hand, for a suite that needs the payload
 * exactly as written (out-of-order ids, no `properties`, wording that disagrees with
 * the shipped rank) rather than as `scaleValueGroup` derives it.
 * @param {{properties?: Array<{key: string, value: string}>, competenceLevels: import('../../src/common/data/schemas/competenceLevels.js').CompetenceLevel[]}} fields
 * @returns {CompetenceLevelsValueGroup}
 */
export function handWrittenScaleValueGroup(fields) {
    // Trimmed like scaleValueGroup: no value-group identity or level statistics, which no
    // scale reader reads.
    return /** @type {CompetenceLevelsValueGroup} */ (/** @type {unknown} */ (fields));
}

/**
 * One `items.json`-shaped document carrying an Aufgabenniveau scale.
 *
 * The item scale is registered from the payload (`registerItemCompetenceScales`), so a
 * suite that exercises item levels ships it. The value group carries no properties; each
 * level's `id` is its item slot, 1 for the first level given (VERA 3 `I…V`: 1–5, VERA 8
 * `Ia…V`: 1–6, CEFR: 1–10), the number a reporting level's `itemLevelSpan` counts in.
 * @param {string[]} levels - The item ladder, lowest first.
 * @returns {ItemsValueGroup[]} One `items.json` value group, one item per level.
 */
export function itemValueGroups(levels) {
    return [
        {
            id: 'group-1',
            type: 'group',
            name: 'Lerngruppe',
            domain: { id: 'domain', name: 'Domäne' },
            items: levels.map((nameShort, index) => ({
                iqbId: `item-${index + 1}`,
                name: `item-${index + 1}`,
                position: index + 1,
                exercise: { name: 'Aufgabe' },
                descriptiveStatistics: { mean: 0 },
                parameters: {
                    competenceLevel: { id: String(index + 1), nameShort },
                },
            })),
        },
    ];
}

/**
 * Register both Aufgabenniveau ladders the server contract defines.
 *
 * Call on every fresh palette, including mid-test ones: a new palette has no item scales,
 * and an unregistered item level resolves to nothing, which turns a bridge assertion
 * into a null.
 * @param {import('../../src/common/services/competenceLevelPalette.js').CompetenceLevelPalette} palette
 * @returns {void}
 */
export function registerStandardItemScales(palette) {
    palette.registerItemCompetenceScales(itemValueGroups(ROMAN_LEVELS));
    palette.registerItemCompetenceScales(itemValueGroups(CEFR_ITEM_LEVELS));
}
