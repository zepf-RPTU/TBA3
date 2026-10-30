/**
 * Reads competence-level scales out of the payload: stateless functions from
 * `competence-levels.json` / `items.json` value groups to scales and their level
 * entries. The registry in `competenceLevelPalette.js` decides what to keep, and the
 * colours are resolved in `competenceLevelColors.js`.
 *
 * Every level is its own step on its scale, whatever its name: `Ia` and `Ib`, `A1.1` and
 * `A1.2`, `KS 1a` and `KS 1b` are two levels each, in the order the scale lists them.
 *
 * Standard bands: the value-group property `standardBand:<level id>` is the only thing
 * that says which KMK standard a level represents (`low`, `medium`, `high`); the band
 * position cannot, because the same position means different things across scales (`B1`
 * is the third of five GER bands and is Regelstandard, `A2.2` is the fourth of six and is
 * not). Levels between two standards carry no tag and are placed by scale order.
 *
 * Item-level spans: `itemLevelSpan:<level id>` names the item-scale slots a reporting
 * level covers (`"5-6"`), the numbers items carry as `competenceLevel.id`. It is the one
 * link between an Aufgabenniveau and a reported Kompetenzstufe.
 */

import { getPropertyText } from '../domain/studentIdentity.js';
import { sanitizeHtml } from './sanitizeHtml.js';

/** @typedef {import('../data/schemas/valueGroup.js').Property} Property */
/** @typedef {import('../data/schemas/competenceLevels.js').CompetenceLevel} CompetenceLevel */
/** @typedef {import('../data/schemas/competenceLevels.js').CompetenceLevelsValueGroup} CompetenceLevelsValueGroup */
/** @typedef {import('../data/schemas/items.js').ItemCompetenceLevel} ItemCompetenceLevel */
/** @typedef {import('../data/schemas/items.js').ItemsValueGroup} ItemsValueGroup */

/**
 * One of the KMK standards a level can represent: unter Mindeststandard, Regelstandard,
 * Optimalstandard.
 * @typedef {'low'|'medium'|'high'} StandardBand
 */

/**
 * The item-scale slots one reporting level covers, both ends included.
 * @typedef {{from: number, to: number}} ItemLevelSpan
 */

/**
 * A payload level with the value group's `levelColor:`, `standardBand:` and
 * `itemLevelSpan:` properties resolved onto it.
 * @typedef {CompetenceLevel & {shippedColor?: string|null, shippedBand?: StandardBand|null,
 *           shippedSpan?: ItemLevelSpan|null, itemSlot?: number|null}} ScaleLevel
 */

/**
 * A scale read off the payload, before its entries are built.
 * @typedef {object} CollectedScale
 * @property {string} scaleId - The `|`-joined level names identifying this ladder.
 * @property {ScaleLevel[]} levels - The levels, in scale order.
 * @property {Set<string>} scaleDescriptions - Every distinct scale prose the value groups carried.
 */

/**
 * A color value counts only if it is exactly a hex literal, so a malformed
 * `levelColor:<id>` degrades to the generated ramp instead of painting nothing.
 */
const HEX_COLOR_PATTERN = /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

/**
 * Property key prefix carrying a state's prescribed color for one band; the value
 * group's properties are the only colour carrier (item levels carry none).
 *
 * Keyed on `competenceLevels[].id` (the export's band number), not on the level's
 * position in the array and not on `nameShort`: interface keys must be ASCII and
 * space-free, and short labels can contain spaces (`KS 1`). Bands the state leaves
 * uncolored contribute no key.
 */
const LEVEL_COLOR_KEY_PREFIX = 'levelColor:';

/**
 * Property key prefix carrying the KMK standard band of one level, keyed on
 * `competenceLevels[].id` exactly like `levelColor:`.
 *
 * The only carrier: the band is never read off the wording of
 * `competenceLevels[].name`. Levels naming no standard ship no key.
 */
const STANDARD_BAND_KEY_PREFIX = 'standardBand:';

/**
 * Property key prefix carrying the item-scale slots one reporting level covers, keyed on
 * `competenceLevels[].id`. The server closes the gaps, so every item slot falls in
 * exactly one level of a value group; `k.h.N.` covers none.
 */
const ITEM_LEVEL_SPAN_KEY_PREFIX = 'itemLevelSpan:';

/** @type {ReadonlySet<string>} */
const STANDARD_BANDS = new Set(['low', 'medium', 'high']);

/** `"a"` or `"a-b"`; anything else reads as no span. */
const ITEM_LEVEL_SPAN_PATTERN = /^(\d+)(?:-(\d+))?$/;

/**
 * Property key carrying the prose that describes a whole scale: how the Kompetenzstufen
 * model works, then this scale's own bands, which the server enumerates.
 */
const COMPETENCE_SCALE_DESCRIPTION_KEY = 'competenceScaleDescription';

/** Prefix that keeps an item scale's id out of the reporting scales' namespace. */
const ITEM_SCALE_ID_PREFIX = 'item:';

/**
 * What level and scale prose may keep: the payload's own `p`, `b`, `ul`, `li`, `br` plus
 * their semantic twins, and no attributes. The text reaches glossary popups as HTML, so
 * it is cleaned once, here.
 * @type {import('dompurify').Config}
 */
const DESCRIPTION_PROFILE = {
    ALLOWED_TAGS: ['p', 'b', 'strong', 'em', 'i', 'ul', 'li', 'br'],
    ALLOWED_ATTR: [],
};

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Reduce a payload's scales to the maximal ones, dropping any whose level sequence is
 * a contiguous run inside a longer scale.
 *
 * States report a domain's scale as only the part of the ladder that domain reached,
 * so one payload can carry `KS 2…KS 5` and `KS 1…KS 5` alongside the full
 * `k.h.N., KS 1…KS 5`. Registered separately, the same `KS 3` would get a different
 * position and ramp colour in each.
 *
 * Only contiguous runs merge. Two scales that differ (a six-level ladder against a
 * seven-level one with `KS 1a`/`KS 1b`) stay two scales and still collide by name.
 *
 * A folded value group's metadata is merged into the surviving scale: a color, band or
 * span it ships for a level the full value group left empty is the only source for it.
 * Where both ship one, the container's wins: a truncated run's spans are clamped to the
 * run (nw French TH-2 starts at `KS 2`, which then covers slots 1-4).
 *
 * The value group's own `levelColor:<id>`, `standardBand:<id>` and `itemLevelSpan:<id>`
 * properties are attached to their levels here, before folding, because they live on the value group
 * while the scale outlives it.
 * @param {CompetenceLevelsValueGroup[]} valueGroups - The payload value groups, each reporting one domain scale.
 * @returns {CollectedScale[]} Deepest scale first
 */
export function collectMaximalScales(valueGroups) {
    /** @type {Map<string, ScaleLevel[]>} scaleId → levels */
    const scales = new Map();
    /** @type {Map<string, Set<string>>} scaleId → every distinct scale prose seen for it */
    const descriptions = new Map();
    /** @type {Map<string, string>} raw scale prose → sanitized; most value groups repeat one text */
    const sanitized = new Map();

    for (const valueGroup of valueGroups) {
        const shippedColors = readLevelKeyedProperties(valueGroup, LEVEL_COLOR_KEY_PREFIX);
        const shippedBands = readLevelKeyedProperties(valueGroup, STANDARD_BAND_KEY_PREFIX);
        const shippedSpans = readLevelKeyedProperties(valueGroup, ITEM_LEVEL_SPAN_KEY_PREFIX);
        const levels = valueGroup.competenceLevels.map((level) => ({
            ...level,
            shippedColor: shippedColors.get(level.id ?? '') ?? null,
            shippedBand: parseStandardBand(shippedBands.get(level.id ?? '')),
            shippedSpan: parseItemLevelSpan(shippedSpans.get(level.id ?? '')),
        }));
        if (levels.length === 0) continue;

        // Merged, not first-wins: an export need not fill every level field on every
        // value group that carries the scale.
        const scaleId = levels.map((level) => level.nameShort).join('|');
        const seen = scales.get(scaleId);
        scales.set(scaleId, seen ? mergeLevelMetadata(seen, levels) : levels);

        // Collected, not first-wins: two subjects can share a level sequence while
        // describing it differently (only a language ladder's prose ties it to the GER).
        const raw = readScaleDescription(valueGroup);
        if (raw !== null && !sanitized.has(raw)) {
            sanitized.set(raw, sanitizeHtml(raw, DESCRIPTION_PROFILE).trim());
        }
        const text = raw === null ? '' : sanitized.get(raw);
        if (text) {
            const texts = descriptions.get(scaleId);
            if (texts) texts.add(text);
            else descriptions.set(scaleId, new Set([text]));
        }
    }

    // By level count, not id length: a contiguous run never holds more levels than its
    // container, so every container comes ahead of what it absorbs. Ties keep payload
    // order, which decides a name collision in the registry.
    const ordered = [...scales.entries()].sort(([, a], [, b]) => b.length - a.length);

    /** @type {CollectedScale[]} */
    const maximal = [];
    for (const [scaleId, levels] of ordered) {
        // Containment is transitive, so testing against the survivors is enough.
        const container = maximal.find((entry) => isContiguousRun(scaleId, entry.scaleId));
        if (container) {
            container.levels = mergeLevelMetadata(container.levels, levels);
            // The container's own prose wins: it enumerates the full ladder. Only a
            // container without any takes what it absorbed.
            if (container.scaleDescriptions.size === 0) {
                container.scaleDescriptions = descriptions.get(scaleId) ?? new Set();
            }
            continue;
        }
        maximal.push({
            scaleId,
            levels,
            scaleDescriptions: descriptions.get(scaleId) ?? new Set(),
        });
    }

    return maximal;
}

/**
 * The Aufgabenniveau ladder carried by an `items.json` payload, as one scale ordered by
 * level `id`.
 *
 * One ladder per document: unlike `collectMaximalScales`, this folds every value group
 * of the document into a single scale ordered by `id`, as EN and MA ship it. A document
 * carrying two subjects' ladders (roman levels for Deutsch/Mathematik, CEFR ones for
 * Englisch/Französisch) reuses the same ids for different levels and is refused.
 *
 * The `id` is the item slot a reporting level's `itemLevelSpan:` refers to.
 * @param {ItemsValueGroup[]} valueGroups
 * @returns {{scaleId: string, levels: ScaleLevel[]}|null} The ladder, or null when the
 *          document carries no item levels or leaves their order undefined.
 */
export function collectItemScaleLevels(valueGroups) {
    /** @type {Map<string, ItemCompetenceLevel>} */
    const byName = new Map();
    for (const valueGroup of valueGroups) {
        for (const item of valueGroup.items) {
            const level = item.parameters.competenceLevel;
            if (!byName.has(level.nameShort)) byName.set(level.nameShort, level);
        }
    }
    if (byName.size === 0) return null;

    // `id` is the scale position: a non-numeric one, or one id for two levels (a document
    // holding two subjects' ladders) leaves the order undefined, and the scale is not
    // registered.
    const levels = [...byName.values()];
    if (levels.some((level) => !Number.isFinite(Number(level.id)))) return null;
    if (new Set(levels.map((level) => level.id)).size !== levels.length) return null;
    levels.sort((a, b) => Number(a.id) - Number(b.id));

    return {
        scaleId: ITEM_SCALE_ID_PREFIX + levels.map((level) => level.nameShort).join('|'),
        levels: levels.map((level) => {
            const slot = Number(level.id);
            return { ...level, itemSlot: Number.isInteger(slot) ? slot : null };
        }),
    };
}

/**
 * The item-slot span a value group ships for one of its levels: what a student value
 * group's own booklet says the student's level covers.
 * @param {{properties?: Property[]}|null|undefined} valueGroup
 * @param {{id?: string}|null|undefined} level - One of its `competenceLevels`.
 * @returns {ItemLevelSpan|null} null when the level has no id, or the value group ships no well-formed span for it.
 */
export function readItemLevelSpan(valueGroup, level) {
    if (!valueGroup || !level?.id) return null;
    return parseItemLevelSpan(
        getPropertyText(valueGroup.properties, ITEM_LEVEL_SPAN_KEY_PREFIX + level.id) ?? undefined,
    );
}

/**
 * Build the entries for one scale: each level's position, the scale's `medium` level, and
 * the data-supplied color / description text of each level.
 * @param {string} scaleId - The `|`-joined level names identifying this ladder.
 * @param {Array<{id?: string, nameShort?: string, description?: string,
 *                shippedColor?: string|null, shippedBand?: StandardBand|null,
 *                shippedSpan?: ItemLevelSpan|null, itemSlot?: number|null}>} levels
 *        In scale order, each with the `nameShort` its schema requires, and with `shippedColor`, `shippedBand` and `shippedSpan` already resolved off
 *        the value group (see `collectMaximalScales`), or `itemSlot` parsed off an item
 *        level's id (see `collectItemScaleLevels`).
 * @returns {CompetenceLevelEntry[]} One entry per level, in scale order.
 */
export function buildScaleEntries(scaleId, levels) {
    // The lowest level tagged `medium`: the boundary `ge_medium` names.
    const firstMedium = levels.findIndex((level) => level.shippedBand === 'medium');
    const mediumIndex = firstMedium === -1 ? null : firstMedium;

    return levels.map((level, levelIndex) => {
        const name = String(level.nameShort);
        const key = normalizeLevelKey(name);
        const description =
            typeof level.description === 'string'
                ? sanitizeHtml(level.description, DESCRIPTION_PROFILE).trim()
                : '';
        const shipped = typeof level.shippedColor === 'string' ? level.shippedColor.trim() : '';
        const color = HEX_COLOR_PATTERN.test(shipped) ? shipped : '';

        // Whether the colour is visible depends on the colour scheme's surface, which
        // can change after registration: the colour resolver decides it.
        return {
            key,
            scopedKey: scopeLevelKey(scaleId, key),
            name,
            itemSlot: level.itemSlot ?? null,
            scaleId,
            levelIndex,
            levelCount: levels.length,
            mediumIndex,
            // The payload's own `standardBand:<id>` / `itemLevelSpan:<id>`, or null.
            // Never guessed from `name`.
            standardBand: level.shippedBand ?? null,
            itemLevelSpan: level.shippedSpan ?? null,
            dataColor: color || null,
            descriptionText: description || null,
        };
    });
}

/**
 * Whether `scaleId` is a contiguous run of levels inside `containerId`.
 *
 * Compared on the `|`-delimited ids with separators on both sides, so `KS 1|KS 2`
 * matches inside `k.h.N.|KS 1|KS 2|KS 3` but a partial level name never matches.
 * @param {string} scaleId
 * @param {string} containerId
 * @returns {boolean}
 */
export function isContiguousRun(scaleId, containerId) {
    return `|${containerId}|`.includes(`|${scaleId}|`);
}

/**
 * Registry lookup key for a level name.
 * @param {string|number} level
 * @returns {string}
 */
export function normalizeLevelKey(level) {
    return String(level).trim().toLowerCase();
}

/**
 * The registry key for one level of one scale, joined by `\x00`, which cannot occur in
 * a level name or in a `scaleId`.
 * @param {string} scaleId
 * @param {string} levelKey - already through `normalizeLevelKey`
 * @returns {string}
 */
export function scopeLevelKey(scaleId, levelKey) {
    return `${scaleId}\x00${levelKey}`;
}

// ============================================================================
// PRIVATE HELPERS
// ============================================================================

/**
 * A value group's `competenceScaleDescription` property, or null when it carries none.
 * @param {{properties?: Property[]}} valueGroup
 * @returns {string|null} As sent, unsanitized.
 */
function readScaleDescription(valueGroup) {
    const text = getPropertyText(valueGroup?.properties, COMPETENCE_SCALE_DESCRIPTION_KEY);
    return text?.trim() ? text : null;
}

/**
 * A value group's `<prefix><level id>` properties (`levelColor:`, `standardBand:`,
 * `itemLevelSpan:`), keyed by `competenceLevels[].id`.
 * @param {{properties?: Property[]}} valueGroup
 * @param {string} prefix
 * @returns {Map<string, string>} Empty when the value group carries none
 */
function readLevelKeyedProperties(valueGroup, prefix) {
    /** @type {Map<string, string>} */
    const values = new Map();

    for (const prop of valueGroup?.properties ?? []) {
        if (!prop?.key?.startsWith(prefix)) continue;
        const levelId = prop.key.slice(prefix.length);
        if (levelId && typeof prop.value === 'string') values.set(levelId, prop.value);
    }

    return values;
}

/**
 * One `standardBand:<id>` value as a band, or null when absent or not exactly one.
 * @param {string|undefined} raw
 * @returns {StandardBand|null}
 */
export function parseStandardBand(raw) {
    const band = typeof raw === 'string' ? raw.trim() : '';
    return STANDARD_BANDS.has(band) ? /** @type {StandardBand} */ (band) : null;
}

/**
 * One `itemLevelSpan:<id>` value as a slot range, or null when absent or malformed. A
 * partly readable value (`"3-"`, `"5-2"`, `"0"`) is no span, never a guess.
 * @param {string|undefined} raw
 * @returns {ItemLevelSpan|null} Both ends included, `1 ≤ from ≤ to`.
 */
function parseItemLevelSpan(raw) {
    const match = typeof raw === 'string' ? ITEM_LEVEL_SPAN_PATTERN.exec(raw.trim()) : null;
    if (!match) return null;
    const from = Number(match[1]);
    const to = match[2] === undefined ? from : Number(match[2]);
    return from >= 1 && from <= to ? { from, to } : null;
}

/**
 * Fill gaps in a scale's level metadata from a scale being folded into it, without
 * mutating the payload objects the document store still holds.
 * @param {ScaleLevel[]} targetLevels - Levels of the surviving scale; never mutated.
 * @param {ScaleLevel[]} sourceLevels - Levels of the scale being folded in, read for gaps only.
 * @returns {ScaleLevel[]} Fresh level objects, with the target values kept wherever it had them.
 */
function mergeLevelMetadata(targetLevels, sourceLevels) {
    const sourceByName = new Map(sourceLevels.map((level) => [level.nameShort, level]));

    return targetLevels.map((level) => {
        const source = sourceByName.get(level.nameShort);
        if (!source) return level;

        return {
            ...level,
            description: level.description || source.description,
            shippedColor: level.shippedColor || source.shippedColor || null,
            shippedBand: level.shippedBand ?? source.shippedBand ?? null,
            shippedSpan: level.shippedSpan ?? source.shippedSpan ?? null,
        };
    });
}

/**
 * @typedef {object} CompetenceLevelEntry
 * @property {string} key - Normalized level key (lowercased `nameShort`). Not unique
 *           across scales; it is the glossary identity
 * @property {string} scopedKey - Registry key: this level of this scale. Unique
 * @property {string} name - `nameShort` as it appears in the data (e.g. 'Ia', 'A1.1')
 * @property {number|null} itemSlot - On an item scale, the level's integer `id`: the slot
 *           that `itemLevelSpan` counts in; null on a reporting scale
 * @property {string} scaleId - Identity of the scale this level belongs to
 * @property {number} levelIndex - 0-based position of the level within its scale
 * @property {number} levelCount
 * @property {number|null} mediumIndex - Position of the scale's lowest level tagged
 *           `standardBand` `medium`; null when the scale tags none (always on an item scale)
 * @property {StandardBand|null} standardBand - KMK standard from the value group's
 *           `standardBand:<id>`; null when the level names none, and always on an item scale
 * @property {ItemLevelSpan|null} itemLevelSpan - Item slots this reporting level covers, from
 *           `itemLevelSpan:<id>`; null when absent or malformed, and always on an item scale
 * @property {string|null} dataColor - Hex color shipped by the state in the value group's
 *           `levelColor:<id>` property; null when absent or not a hex literal.
 * @property {string|null} descriptionText - The level's `description` prose; null when empty
 */
