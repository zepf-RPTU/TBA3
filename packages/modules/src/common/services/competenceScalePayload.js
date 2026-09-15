/**
 * competenceScalePayload — reads competence-level scales out of the payload.
 *
 * Pure functions from `competence-levels.json` / `items.json` rows to scales and their
 * level entries. Nothing here holds state or touches the document; the registry in
 * `competenceLevelPalette.js` decides what to keep, and the colours are resolved in
 * `competenceLevelColors.js`.
 *
 * ## Bands vs. sub-bands
 * A scale has one band per level unless a sub-band notation collapses several: `Ia`/`Ib`
 * share band `I`, and `A1.1`/`A1.2` share band `A1` — matching the collapsing already done
 * by `createGerLevelHtml` in `common/domain/levels.js`. The ramp has one colour step per
 * **band**; within a split band the levels are told apart by lightness at resolve time.
 *
 * ## Colour carrier
 * A state's colors arrive on the **row**, as `properties[].key = "levelColor:<level id>"`.
 * That is the only carrier: the hex literal `items.json` puts in an item level's
 * `description` never reaches a scale, because `collectItemScaleLevels` drops item
 * colours on purpose. See `LEVEL_COLOR_KEY_PREFIX`.
 *
 * ## Standard ranks
 * The row property `standardRank:<level id>` is the only thing that says which KMK
 * standard a level represents; the band position cannot, because the same position means
 * different things across scales (`B1` is the third of five GER bands and *is*
 * Regelstandard, `A2.2` is the fourth of six and is not). Levels the payload does not rank
 * get `standardRank: null`, and callers must treat that as "unknown", never as "below".
 *
 * "Unknown" is narrowed by the ladder, though, not by the level alone: the ranked levels
 * above and below bound what an unranked one can be (`rankLowerBound`/`rankUpperBound`).
 * A level below the one ranked 1 can only be rank 1, while every level of a scale that
 * ranks nothing keeps the full `[1, 5]` and satisfies no metric.
 * @module competenceScalePayload
 */

import {
    MIN_STANDARD_RANK,
    MAX_STANDARD_RANK,
    parseStandardRank,
    deriveRankBounds,
} from '../domain/competenceStandardRanks.js';

/**
 * A color value counts only if it is exactly a hex literal, so a malformed
 * `levelColor:<id>` degrades to the generated ramp instead of painting nothing.
 */
const HEX_COLOR_PATTERN = /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

/**
 * Property key prefix carrying a state's prescribed color for one band.
 *
 * Keyed on `competenceLevels[].id` (the export's band number), **not** on the level's
 * position in the array and not on `nameShort`: the latter is impossible because
 * interface keys must be ASCII and space-free while NRW's short labels contain spaces
 * (`KS 1`). Bands the state leaves uncolored contribute no key, so these are a subset
 * of a row's levels.
 */
const LEVEL_COLOR_KEY_PREFIX = 'levelColor:';

/**
 * Property key prefix carrying the KMK standard rank of one band, keyed on
 * `competenceLevels[].id` exactly like `levelColor:`.
 *
 * **The only carrier.** The rank is also implicit in `competenceLevels[].name`, and this
 * module used to read it from there through a table of the seven German standard
 * wordings. That table is gone: a scale is defined by the payload alone, so a
 * state whose wording the client had not been taught silently lost every rank-based
 * metric, and the fixtures had to be spelled the way the table expected. The checked-in
 * fixtures now ship this key like every server-backed dataset does.
 *
 * Bands naming no standard ship no key, which is what keeps "unknown" distinct from a
 * rank.
 */
const STANDARD_RANK_KEY_PREFIX = 'standardRank:';

/**
 * Property key carrying the prose that describes a whole scale — how the Kompetenzstufen
 * model works, then this scale's own bands.
 *
 * Not keyed per level, because it describes the ladder rather than a rung. It exists at
 * all because the client cannot write it: the text this replaces lived in
 * `src/common/glossary/glossary.json` and enumerated roman numerals inline, so it was wrong on every
 * state that does not use them. The server generates the enumeration from the scale's
 * real bands.
 */
const COMPETENCE_SCALE_DESCRIPTION_KEY = 'competenceScaleDescription';

/** Prefix that keeps an item scale's id out of the reporting scales' namespace. */
const ITEM_SCALE_ID_PREFIX = 'item:';

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Reduce a payload's scales to the maximal ones, dropping any whose level sequence is
 * a contiguous run inside a longer scale.
 *
 * States report a domain's scale as only the part of the ladder that domain actually
 * reached, so one payload can carry `KS 2…KS 5` and `KS 1…KS 5` alongside the full
 * `k.h.N., KS 1…KS 5`. Registering each separately would give the same `KS 3` a
 * different band index and a different ramp position in each, and — because the
 * registry is keyed by level name — the last one registered would repaint it for
 * every domain on the page.
 *
 * Only *contiguous* runs merge. Two scales that genuinely differ, such as NRW's
 * six-band Deutsch ladder against its seven-band Mathematik ladder with `KS 1a`/`KS
 * 1b`, are left as two scales and still collide by name.
 *
 * Folding must not lose what the truncated row said about its levels: a row that ships
 * a shipped color or a rank for a level the full row left null is the only source for it,
 * and dropping that silently turns the metric it feeds into "unknown". Metadata is merged
 * into the surviving scale, never discarded.
 *
 * This is also where the row's own `levelColor:<id>` properties are attached to their
 * levels, as `shippedColor`. It has to happen before folding, because the color lives on
 * the *row* while the scale outlives it: once two rows have merged into one scale there
 * is no way back to which properties belonged to which.
 * @param {Array<{properties?: Array<object> | null, competenceLevels?: Array<object>}>} rows - The payload rows, each reporting one domain scale.
 * @returns {Array<{scaleId: string, levels: Array<object>, scaleDescriptions: Set<string>}>}
 *          Deepest scale first
 */
export function collectMaximalScales(rows) {
    /** @type {Map<string, Array<object>>} scaleId → levels */
    const scales = new Map();
    /** @type {Map<string, Set<string>>} scaleId → every distinct scale prose seen for it */
    const descriptions = new Map();

    for (const row of rows ?? []) {
        const shippedColors = readLevelKeyedProperties(row, LEVEL_COLOR_KEY_PREFIX);
        const shippedRanks = readLevelKeyedProperties(row, STANDARD_RANK_KEY_PREFIX);
        const levels = (row?.competenceLevels ?? [])
            .filter((level) => level?.nameShort)
            .map((level) => ({
                ...level,
                shippedColor: shippedColors.get(String(level.id)) ?? null,
                shippedRank: parseStandardRank(shippedRanks.get(String(level.id))),
            }));
        if (levels.length === 0) continue;

        // Merge rather than first-wins: a state does not fill every level field on every
        // row that carries the scale. NRW can leave them empty on many rows of its
        // Deutsch ladder, so taking the first row alone would make the scale's prose and
        // ranks depend on which row the export happened to write first.
        const scaleId = levels.map((level) => level.nameShort).join('|');
        const seen = scales.get(scaleId);
        scales.set(scaleId, seen ? mergeLevelMetadata(seen, levels) : levels);

        // Collected, not first-wins: one scaleId is one level sequence, and two subjects
        // can share a sequence while describing it differently. NRW's Deutsch and its
        // Englisch both run `k.h.N., KS 1 … KS 5`, but only the language ladder's prose
        // says the stufen correspond to the GER — taking the first row's text would drop
        // whichever of the two the export happened to write second.
        const text = readScaleDescription(row);
        if (text) {
            const texts = descriptions.get(scaleId);
            if (texts) texts.add(text);
            else descriptions.set(scaleId, new Set([text]));
        }
    }

    // By level count, not id length: a contiguous run can never hold more levels than
    // its container, so this still puts every container ahead of what it absorbs — and
    // ties keep payload order, which is what decides a name collision in the registry.
    const ordered = [...scales.entries()].sort(([, a], [, b]) => b.length - a.length);

    /** @type {Array<{scaleId: string, levels: Array<object>, scaleDescriptions: Set<string>}>} */
    const maximal = [];
    for (const [scaleId, levels] of ordered) {
        // Containment is transitive, so testing against the survivors is enough — and it
        // is what lets a doubly-nested scale merge into the one still standing.
        const container = maximal.find((entry) => isContiguousRun(scaleId, entry.scaleId));
        if (container) {
            container.levels = mergeLevelMetadata(container.levels, levels);
            // The container's own prose wins: it enumerates the full ladder, where a
            // truncated run's would list only the bands that domain reached. Only a
            // container that described itself not at all falls back to what it absorbed.
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
 * **One ladder per document.** Unlike `collectMaximalScales`, which separates the ladders
 * it finds by their level sequence, this folds every row of the document into a single
 * scale ordered by `id`. That is what EN and MA ship. A document carrying two subjects'
 * ladders — SL's, which grades Deutsch/Mathematik on roman levels and Englisch/Französisch
 * on CEFR ones — reuses the same ids for different levels, and is refused rather than
 * returned as one interleaved ladder. Splitting such a document is unbuilt.
 *
 * Colour is dropped on the way out, deliberately. An item level's `description` is the
 * state's own hex, but `getItemLevelColor` paints item marks from the *reporting* ramp so
 * they match the student charts beside them under every theme — and letting item hexes
 * through would flip `hasDataColors()` and offer a "Landesvorgabe" theme for a dataset
 * whose reporting scale ships no colours.
 *
 * The rank is kept: `standardRank:<id>` is what relates an Aufgabenniveau to a reported
 * Kompetenzstufe when the two vocabularies share no labels, and it is the payload's to
 * state. The client does not carry its own copy of that mapping.
 * @param {Array<{properties?: Array<{key?: string, value?: string}>|null, items?: Array<{parameters?: {competenceLevel?: object}}>}>} rows - Value-group rows from `items.json`.
 * @returns {{scaleId: string, levels: Array<object>}|null} The ladder, or null when the
 *          document carries no item levels or leaves their order undefined.
 */
export function collectItemScaleLevels(rows) {
    const byName = new Map();
    /** @type {Map<string, number|null>} level id → the rank its row shipped */
    const shippedRanks = new Map();
    for (const row of rows ?? []) {
        // Keyed on `competenceLevel.id` exactly like the reporting side keys on the level
        // id, and read per row because the property lives on the row while the scale
        // outlives it.
        for (const [levelId, raw] of readLevelKeyedProperties(row, STANDARD_RANK_KEY_PREFIX)) {
            const rank = parseStandardRank(raw);
            if (rank !== null) shippedRanks.set(levelId, rank);
        }
        for (const item of row?.items ?? []) {
            const level = item?.parameters?.competenceLevel;
            if (!level?.nameShort || byName.has(level.nameShort)) continue;
            byName.set(level.nameShort, level);
        }
    }
    if (byName.size === 0) return null;

    // `id` is the scale position; a payload that ships none — or ships one that is not a
    // number, or gives one id to two levels — leaves the order undefined, so the scale is
    // not registered at all rather than registered wrong. Fixtures carry ids for exactly
    // this reason. Duplicate ids are the signature of a document holding two subjects'
    // ladders, which this cannot split (see the doc comment): they would otherwise
    // interleave into one nonsense ladder that still resolves and paints.
    const levels = [...byName.values()];
    if (
        levels.some(
            (level) => !Number.isFinite(Number(level.id)) || level.id === null || level.id === '',
        )
    )
        return null;
    if (new Set(levels.map((level) => String(level.id))).size !== levels.length) return null;
    levels.sort((a, b) => Number(a.id) - Number(b.id));

    return {
        scaleId: ITEM_SCALE_ID_PREFIX + levels.map((level) => level.nameShort).join('|'),
        levels: levels.map((level) => ({
            ...level,
            description: null,
            shippedColor: null,
            shippedRank: shippedRanks.get(String(level.id)) ?? null,
        })),
    };
}

/**
 * Build the entries for one scale: band order, per-band sub-band order, and the
 * data-supplied color / description text of each level.
 * @param {string} scaleId - The `|`-joined level names identifying this ladder.
 * @param {Array<{nameShort?: string, description?: string|null,
 *                shippedColor?: string|null, shippedRank?: number|null}>} levels
 *        Pre-filtered by the caller to entries that actually carry a `nameShort`, with
 *        `shippedColor` and `shippedRank` already resolved off the row
 *        (see `collectMaximalScales`).
 * @returns {CompetenceLevelEntry[]} One entry per level, in scale order.
 */
export function buildScaleEntries(scaleId, levels) {
    /** @type {string[]} band keys in first-appearance order */
    const bandOrder = [];
    /** @type {Map<string, string[]>} band key → level names in order */
    const bandMembers = new Map();

    for (const level of levels) {
        const name = String(level.nameShort);
        const bandKey = deriveBandKey(name);
        let members = bandMembers.get(bandKey);
        if (!members) {
            members = [];
            bandOrder.push(bandKey);
            bandMembers.set(bandKey, members);
        }
        members.push(name);
    }

    const rankBounds = deriveRankBounds(levels);

    return levels.map((level) => {
        const name = String(level.nameShort);
        const key = normalizeLevelKey(name);
        const bandKey = deriveBandKey(name);
        const members = bandMembers.get(bandKey) ?? [];
        const description = typeof level.description === 'string' ? level.description.trim() : '';
        const shipped = typeof level.shippedColor === 'string' ? level.shippedColor.trim() : '';
        const color = HEX_COLOR_PATTERN.test(shipped) ? shipped : '';

        // Whether the colour is *visible* is not decided here: that depends on the
        // surface, and the surface follows the colour scheme, which can change after
        // registration. The colour resolver applies its contrast floor against the active
        // scheme's surface.
        const { lower, upper } = rankBounds.get(name) ?? {
            lower: MIN_STANDARD_RANK,
            upper: MAX_STANDARD_RANK,
        };

        return {
            key,
            scopedKey: scopeLevelKey(scaleId, key),
            name,
            scaleId,
            bandKey,
            bandIndex: bandOrder.indexOf(bandKey),
            bandCount: bandOrder.length,
            subBandIndex: members.indexOf(name),
            subBandCount: members.length,
            // The payload's own `standardRank:<id>`, or null. Never guessed from `name`.
            standardRank: level.shippedRank ?? null,
            rankLowerBound: lower,
            rankUpperBound: upper,
            dataColor: color || null,
            descriptionText: description || null,
        };
    });
}

/**
 * Strip a trailing sub-band marker so sub-levels collapse onto one band:
 * `Ia`/`Ib` → `I`, `A1.1`/`A1.2` → `A1`. Anything else is its own band, so an
 * unrecognised sub-band notation degrades to one band per level rather than failing.
 *
 * ASSUMPTION-BAND-SUFFIX: the two forms above are the only sub-band notations in the
 * VERA scales seen so far; retire it when a scale ships a third. Extend here — this is
 * the single place band identity is decided.
 * @param {string} nameShort - A level short name, as the payload spells it.
 * @returns {string} The band it belongs to; the input unchanged when it carries no sub-band marker.
 */
export function deriveBandKey(nameShort) {
    const name = String(nameShort).trim();

    const dotted = /^(.+)\.\d+$/.exec(name); // A1.1 → A1
    if (dotted) return dotted[1];

    const romanSub = /^([IVXLC]+)[a-z]$/.exec(name); // Ia → I
    if (romanSub) return romanSub[1];

    return name;
}

/**
 * Whether `scaleId` is a contiguous run of levels inside `containerId`.
 *
 * Compared on the `|`-delimited ids with separators on both sides, so `KS 1|KS 2`
 * matches inside `k.h.N.|KS 1|KS 2|KS 3` but a partial level name never matches.
 * @param {string} scaleId - The candidate run.
 * @param {string} containerId - The scale it might sit inside.
 * @returns {boolean} True when the run appears whole, on level boundaries, inside the container.
 */
export function isContiguousRun(scaleId, containerId) {
    return `|${containerId}|`.includes(`|${scaleId}|`);
}

/**
 * Registry lookup key for a level name: strips the `ks_` prefix the stacked-bar field
 * names carry, so `A1` and `ks_A1` find the same entry.
 * @param {string|number} level - A level token in any input vocabulary.
 * @returns {string} The normalized key.
 */
export function normalizeLevelKey(level) {
    return String(level)
        .trim()
        .replace(/^ks[_-]/i, '')
        .toLowerCase();
}

/**
 * The registry key for one level of one scale.
 *
 * `\x00` because it cannot occur in a level name or in a `scaleId` (which is those names
 * joined by `|`), so the two halves can never be confused for one another.
 * @param {string} scaleId - The ladder the level belongs to.
 * @param {string} levelKey - already through `normalizeLevelKey`
 * @returns {string} The two halves joined by a separator that cannot occur in either.
 */
export function scopeLevelKey(scaleId, levelKey) {
    return `${scaleId}\x00${levelKey}`;
}

// ============================================================================
// PRIVATE HELPERS
// ============================================================================

/**
 * A row's `competenceScaleDescription` property, or null when it carries none.
 * @param {{properties?: Array<{key?: string, value?: string}>|null}} row - One value-group row from the payload.
 * @returns {string|null} The scale prose, or null when the row carries none.
 */
function readScaleDescription(row) {
    for (const prop of row?.properties ?? []) {
        if (prop?.key !== COMPETENCE_SCALE_DESCRIPTION_KEY) continue;
        const value = typeof prop.value === 'string' ? prop.value.trim() : '';
        if (value) return value;
    }
    return null;
}

/**
 * A row's `<prefix><level id>` properties, keyed by `competenceLevels[].id`.
 *
 * Both per-level property families the payload carries — `levelColor:` and
 * `standardRank:` — are keyed the same way and read the same way; the server emits them
 * side by side for the same reason (`competenceLevels[].id` is the only level identifier
 * that is ASCII and space-free, which `nameShort` is not in NRW's `KS 1`).
 * @param {{properties?: Array<{key?: string, value?: string}>|null}} row - One value-group row from the payload.
 * @param {string} prefix - Property-key prefix to collect, e.g. `levelColor:` or `standardRank:`.
 * @returns {Map<string, string>} Empty when the row carries none
 */
function readLevelKeyedProperties(row, prefix) {
    /** @type {Map<string, string>} */
    const values = new Map();

    for (const prop of row?.properties ?? []) {
        if (!prop?.key?.startsWith(prefix)) continue;
        const levelId = prop.key.slice(prefix.length);
        if (levelId && typeof prop.value === 'string') values.set(levelId, prop.value);
    }

    return values;
}

/**
 * Fill gaps in a scale's level metadata from a scale being folded into it, without
 * mutating the payload objects the DataStore still holds.
 * @param {Array<object>} targetLevels - Levels of the surviving scale; never mutated.
 * @param {Array<object>} sourceLevels - Levels of the scale being folded in, read for gaps only.
 * @returns {Array<object>} Fresh level objects, with the target values kept wherever it had them.
 */
function mergeLevelMetadata(targetLevels, sourceLevels) {
    const sourceByName = new Map(sourceLevels.map((level) => [level.nameShort, level]));

    return targetLevels.map((level) => {
        const source = sourceByName.get(level.nameShort);
        if (!source || (level.description && level.shippedColor && level.shippedRank !== null))
            return level;

        return {
            ...level,
            description: level.description || source.description || null,
            shippedColor: level.shippedColor || source.shippedColor || null,
            shippedRank: level.shippedRank ?? source.shippedRank ?? null,
        };
    });
}

/**
 * @typedef {object} CompetenceLevelEntry
 * @property {string} key - Normalized level key (lowercased `nameShort`). Not unique
 *           across scales; it is the **glossary** identity, which is why it stayed a bare
 *           name when the registry moved to `scopedKey`
 * @property {string} scopedKey - Registry key: this level *of this scale*. Unique
 * @property {string} name - `nameShort` as it appears in the data (e.g. 'Ia', 'A1.1')
 * @property {string} scaleId - Identity of the scale this level belongs to
 * @property {string} bandKey - Band this level paints with (e.g. 'I' for 'Ia')
 * @property {number} bandIndex - 0-based position of the band within its scale
 * @property {number} bandCount - Number of bands in this level's scale
 * @property {number} subBandIndex - 0-based position within the band (0 when unsplit)
 * @property {number} subBandCount - Number of levels sharing this band
 * @property {number|null} standardRank - KMK standard from the row's `standardRank:<id>`, 1…5; null when unranked
 * @property {number} rankLowerBound - Lowest rank this level could carry (see `deriveRankBounds`)
 * @property {number} rankUpperBound - Highest rank this level could carry
 * @property {string|null} dataColor - Hex color shipped by the state (in the row's
 *           `levelColor:<id>` property, or in `description`); null when absent or prose.
 *           Whether it is visible is decided per colour scheme at resolve time.
 * @property {string|null} descriptionText - `description` when it is prose, not a color
 */
