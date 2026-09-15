/**
 * competenceLevelPalette — the competence-level (Kompetenzstufe) scale registry.
 *
 * Holds everything the loaded scales say about themselves: band order and band count
 * (which decide every level's color), and the KMK standard each level names (which
 * decides what "Regelstandard oder höher" means). Both are read from the payload —
 * nothing here enumerates a scale.
 *
 * The scale is **not** fixed. German states publish different scales for the same
 * subject — `A1…C1` (5 bands), `A1.1, A1.2, A2.1, …` (5 bands × 2 sub-bands),
 * `k.h.N., KS 1 … KS 5` (6 bands), `Ia, Ib, II…V` (5 bands, first one split). The
 * scale that is actually in play is read from `competence-levels.json` at load time
 * (`registerCompetenceLevelScales`), and every palette is generated for that band
 * count. This replaced a fixed `--ks-level-1…5` CSS variable set, which could not
 * represent anything but a five-band scale.
 *
 * Reading the payload into scales and entries is `competenceScalePayload.js`; painting
 * the registered entries is `competenceLevelColors.js`. This module owns the state
 * between the two and every lookup over it.
 *
 * State is module-level rather than per-DataStore (the `enConfig.js` pattern) because
 * `getCompetencyColor(level)` is called from chart helpers deep in the render path that
 * hold no DataStore handle. Same rationale as `themeService`'s module-level cache: this
 * is resolved presentation state for the one app on the page.
 * @module competenceLevelPalette
 */

import { satisfiesEveryPossibleRank } from '../domain/competenceStandardRanks.js';
import {
    buildScaleEntries,
    collectItemScaleLevels,
    collectMaximalScales,
    deriveBandKey,
    isContiguousRun,
    normalizeLevelKey,
    scopeLevelKey,
} from './competenceScalePayload.js';

/** @typedef {import('./competenceScalePayload.js').CompetenceLevelEntry} CompetenceLevelEntry */

// ============================================================================
// REGISTRY STATE
// ============================================================================

/**
 * @type {Map<string, CompetenceLevelEntry>} `scopedKey` (scale + level) → entry
 *
 * Keyed by scale *and* level, because one page can hold two ladders that share a level
 * name: NRW reports Deutsch on `k.h.N., KS 1 … KS 5` and Mathematik on `k.h.N., KS 1a,
 * KS 1b, KS 2 … KS 5`, so five names mean two different things at once. A name-keyed map
 * could only hold one of each, and the later registration silently repainted the earlier
 * scale.
 */
let _levels = new Map();
/**
 * @type {Map<string, string>} lowercased level name → the `scopedKey` a bare name resolves to
 *
 * The fallback index for callers that do not know their scale — which is most of them, and
 * correctly so: EN and MA carry one scale per dataset, so a name is unambiguous there.
 * **Last registration wins**, which is byte-for-byte what the old overwrite produced, so
 * making the registry scale-aware moved no existing answer.
 */
let _levelsByName = new Map();
/** @type {Set<string>} scaleId of every scale already registered */
let _scales = new Set();
/** @type {Set<string>} scaleId of every *item* scale, a subset of `_scales` */
let _itemScaleIds = new Set();
/** @type {Map<string, Set<string>>} scaleId → the scale's own prose, when the payload sent any */
let _scaleDescriptions = new Map();
/** @type {number} Bumped whenever the registry changes, so caches downstream can tell. */
let _version = 0;
/** @type {Set<string>} Runs already reported as ambiguous, so the warning fires once each. */
const warnedAmbiguousRuns = new Set();

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Register the competence-level scales found in a `competence-levels.json` payload.
 * Idempotent per scale — the same scale repeated across rows is registered once.
 * Call once per app, after the fetch and before any view renders.
 *
 * Truncated scales are folded into the full one first (see `collectMaximalScales`),
 * so a domain that only reached `KS 2 … KS 5` does not get a four-band ramp of its
 * own and repaint `KS 3` for every other domain on the page.
 * @param {Array<{
 *   properties?: Array<{key?: string, value?: string}>|null,
 *   competenceLevels?: Array<{id?: string|number|null, nameShort?: string, name?: string,
 *                             description?: string|null}>
 * }>} rows - Value-group rows from `competence-levels.json`, each carrying the scale its domain reached.
 */
export function registerCompetenceLevelScales(rows) {
    for (const { scaleId, levels, scaleDescriptions } of collectMaximalScales(rows)) {
        if (_scales.has(scaleId)) continue;
        _scales.add(scaleId);
        if (scaleDescriptions.size > 0) _scaleDescriptions.set(scaleId, scaleDescriptions);

        registerScale(scaleId, levels);
    }
    _version++;
}

/**
 * Register the Aufgabenniveau scale carried by an `items.json` payload.
 *
 * The item scale is a *second* vocabulary, unrelated to the reporting one: NRW grades items
 * `Ia … V` while reporting students on `k.h.N., KS 1a … KS 5`. The client recognises neither —
 * every item's `parameters.competenceLevel` carries `id`, a stable position on the scale (so
 * an NRW-style Mathe export starts at `2` where `Ia` has no items), and the row states each level's KMK rank as
 * `standardRank:<id>`. Order, band and rank all come from there (`collectItemScaleLevels`).
 *
 * Registered in its own namespace and **out of the bare-name index**, because the two
 * vocabularies overlap: a Niedersachsen-style export reports on `A1.1 … B1.2` and grades items `A1.1 … B2.2`, so
 * the reporting scale is a contiguous prefix of the item scale. Sharing a namespace would let
 * `collectMaximalScales` fold them together and re-band every student level out of an
 * eight-rung ladder; sharing the bare-name index would let an item level answer a student
 * level's colour lookup. Callers reach these entries through `getItemScaleIds()`, and every
 * cross-scale query keyed by name or rank skips them (`isReportingEntry`).
 * @param {Array<{properties?: Array<{key?: string, value?: string}>|null, items?: Array<{parameters?: {competenceLevel?: object}}>}>} rows - Value-group rows from `items.json`.
 * @returns {void}
 */
export function registerItemCompetenceScales(rows) {
    const scale = collectItemScaleLevels(rows);
    if (!scale || _scales.has(scale.scaleId)) return;
    _scales.add(scale.scaleId);
    _itemScaleIds.add(scale.scaleId);
    registerScale(scale.scaleId, scale.levels, { bareNameIndex: false });
    _version++;
}

/**
 * The item scales registered for this dataset, in registration order.
 *
 * `levels.js` resolves a bare item level by trying each in turn — the item equivalent of the
 * `_levelsByName` fallback the reporting scales get, kept explicit because item levels must
 * not enter that index. The order is the order the payloads registered in, so a level two
 * item ladders both spell answers from whichever was registered first; no dataset ships
 * overlapping item vocabularies today.
 * @returns {string[]} Registered item scale ids.
 */
export function getItemScaleIds() {
    return [..._itemScaleIds];
}

/**
 * Every registered entry, reporting and item scales alike, in registration order.
 *
 * The iteration surface for whoever paints or scans the registry (`competenceLevelColors`)
 * — insertion order is registration order because no registration ever overwrites an
 * entry. Reporting-only callers filter with `isReportingEntry`.
 * @returns {CompetenceLevelEntry[]} A fresh array; the registry is not exposed.
 */
export function getRegisteredLevels() {
    return [..._levels.values()];
}

/**
 * Whether a registered entry belongs to a *reporting* scale rather than an item scale.
 *
 * The general form of the `bareNameIndex: false` opt-out. That flag keeps item levels out
 * of the bare-name index; this keeps them out of every other query that reaches across
 * scales and is keyed by name or rank rather than by an explicit `scaleId`. Both exist for
 * one reason: on several states the two vocabularies overlap (Niedersachsen reports students on
 * `A1.1 … B1.2` and grades items `A1.1 … B2.2`), so a cross-scale answer keyed by name
 * would hand an item level's entry to a caller asking about the student one.
 *
 * Scale-scoped lookups (`getCompetencyBand(level, scaleId)`, `getScaleLevelNames`,
 * `scaleHasStandardRanks`) do not need it — the caller has already named the ladder.
 * @param {CompetenceLevelEntry} entry - A registered entry.
 * @returns {boolean} False for a level of a registered item scale.
 */
export function isReportingEntry(entry) {
    return !_itemScaleIds.has(entry.scaleId);
}

/**
 * Drop all registered scales. Test-only — production registers once per page load.
 */
export function resetCompetenceLevelPalette() {
    _levels = new Map();
    _levelsByName = new Map();
    _scales = new Set();
    _itemScaleIds = new Set();
    _scaleDescriptions = new Map();
    warnedAmbiguousRuns.clear();
    _version++;
}

/**
 * Registry generation. `themeService` folds this into its cache key so colors read
 * before the data arrived cannot be served stale afterwards.
 * @returns {number} Bumped on every registration, so a cache keyed on it cannot serve pre-data colors.
 */
export function getPaletteVersion() {
    return _version;
}

/**
 * Look up the band metadata for a level in any input vocabulary (`A1`, `ks_A1`,
 * …). Returning `null` is how callers tell a competence-level field
 * apart from a gender / richtig-falsch field, so it must stay strict.
 *
 * Pass `scaleId` where a page can hold two ladders sharing a level name — SL's
 * multi-subject views. Without it the answer is the scale that registered the name last,
 * which is unambiguous for any dataset carrying a single scale (every EN and MA one).
 * @param {string|number|null|undefined} level - Level token in any input vocabulary.
 * @param {string} [scaleId] - Which ladder `level` belongs to
 * @returns {CompetenceLevelEntry|null} Band metadata, or null when `level` is not a registered competence level.
 */
export function getCompetencyBand(level, scaleId) {
    if (level === null || level === undefined) return null;
    const key = normalizeLevelKey(level);
    // `null` means "no scale known" exactly like `undefined` does — `resolveScaleId` can
    // answer nothing, and data fields default to null — so it must not scope to 'null'.
    const scopedKey =
        scaleId === undefined || scaleId === null
            ? _levelsByName.get(key)
            : scopeLevelKey(scaleId, key);
    return scopedKey ? (_levels.get(scopedKey) ?? null) : null;
}

/**
 * The registered scale a row's level list belongs to.
 *
 * This is how a caller obtains the `scaleId` the lookups above accept: a row lists the
 * levels its domain reached, and the registry folded truncated runs into their full
 * ladder at registration (`collectMaximalScales`), so the row's own `|`-joined list is
 * not always a registered id. A run that sits inside exactly one ladder resolves to it;
 * one that sits inside several — NRW's `KS 2|KS 3|KS 4|KS 5` is a run of both its
 * Deutsch and its Mathematik ladder — cannot be decided here and resolves to nothing,
 * so the caller falls back to the bare-name answer and the console says why.
 *
 * Reporting scales only — the general form of `isReportingEntry`, applied to a scale id
 * rather than an entry. Callers hand this a *reporting* row's level list, and an item
 * ladder that contains the run would be counted as a second container and make every
 * truncated run ambiguous: `ma`'s reporting `I|II|III|IV|V` and its item scale
 * `item:I|II|III|IV|V` both contain the domain run `II|III|IV|V`.
 * @param {Array<string|number|null|undefined>} levelNames - The row's `nameShort` values, in payload order.
 * @returns {string|undefined} The registered scale id, or `undefined` when the run is unregistered or ambiguous.
 */
export function resolveScaleId(levelNames) {
    const names = (levelNames ?? []).filter(
        (name) => name !== null && name !== undefined && name !== '',
    );
    if (names.length === 0) return undefined;

    const runId = names.map(String).join('|');
    if (_scales.has(runId) && !_itemScaleIds.has(runId)) return runId;

    const containers = [..._scales].filter(
        (scaleId) => !_itemScaleIds.has(scaleId) && isContiguousRun(runId, scaleId),
    );
    if (containers.length === 1) return containers[0];

    if (containers.length > 1 && !warnedAmbiguousRuns.has(runId)) {
        warnedAmbiguousRuns.add(runId);
        console.warn(
            `[competenceLevelPalette] The level run "${runId}" sits inside ${containers.length} ` +
                `registered scales (${containers.join(' / ')}); resolving it by name instead. ` +
                "Pass the scale of the row's Fach/Domäne where one is known.",
        );
    }
    return undefined;
}

/**
 * Every level of the scale that `level` belongs to, in scale order — i.e. the levels
 * that *could* occur, as opposed to the ones a given class happens to have. Lets
 * legends name the full scale without hardcoding one.
 * @param {string|number} level - Any level of the scale to enumerate.
 * @param {string} [scaleId] - Which ladder `level` belongs to; see `getCompetencyBand`
 * @returns {string[]} Empty when `level` is not a registered level
 */
export function getScaleLevelNames(level, scaleId) {
    const entry = getCompetencyBand(level, scaleId);
    if (!entry) return [];
    return [..._levels.values()]
        .filter((candidate) => candidate.scaleId === entry.scaleId)
        .map((candidate) => candidate.name);
}

/**
 * The glossary key to stamp on a rendered level value, or null when the payload sent no
 * text for it — in which case nothing should be stamped, so the level renders as plain
 * text instead of offering a popup that would come up empty.
 *
 * Falls back to the level's **band** when the exact level is not a registered one, because
 * item levels and aggregate levels do not have to share a vocabulary: EN's aggregates ship
 * `A1 … C1` while the same class's `items.json` grades every item `A1.1 … C1.1`. Without
 * the fallback every item level on those datasets would silently lose its popup. Where the
 * payload does describe the sub-level — Niedersachsen's `A1.1 … B1.2` ladder — the exact
 * match wins and the sub-level keeps its own text.
 * @param {string|number} level - The level about to be rendered.
 * @returns {string|null} Key to stamp on the value, or null when the payload sent no text for it.
 */
export function getLevelGlossaryKey(level) {
    const entry = getCompetencyBand(level) ?? getCompetencyBand(deriveBandKey(String(level ?? '')));
    return entry?.descriptionText ? entry.key : null;
}

/**
 * Every registered level that carries payload prose, keyed the way `getLevelGlossaryKey`
 * stamps it.
 *
 * This is what replaced `src/common/glossary/glossary.json`'s per-level entries: those were keyed by
 * label and so only ever described `a1`…`c1` and `KSI`…`KSV`, leaving every other
 * vocabulary a state ships — `k.h.N.`, `KS 1`…`KS 5`, `KS 1a`/`KS 1b`, `MiStd--`…`OptStd`,
 * `A1.1`…`B1.2` — with no text at all. The server now sends one per level, so a scale the
 * client has never heard of still explains itself.
 * @returns {Map<string, {name: string, description: string}>} One entry per level carrying payload prose, keyed as `getLevelGlossaryKey` stamps it.
 */
export function getLevelDescriptions() {
    const out = new Map();
    for (const entry of _levels.values()) {
        if (entry.descriptionText) {
            out.set(entry.key, { name: entry.name, description: entry.descriptionText });
        }
    }
    return out;
}

/**
 * The prose describing each registered scale as a whole, deduplicated, in registration
 * order. Several are expected: SL shows Deutsch, Englisch and Französisch on one page,
 * and each ladder describes itself.
 *
 * More than one per scale is also expected. A scale is identified by its level sequence,
 * and two subjects can share one while describing it differently — NRW's Deutsch and its
 * Englisch both run `k.h.N., KS 1 … KS 5`, but only the language ladder's prose adds the
 * sentence tying the stufen to the GER. Keeping one per scale would silently drop the
 * other, so every distinct text survives (see `collectMaximalScales`).
 * @returns {string[]} Empty when no payload carried `competenceScaleDescription`
 */
export function getScaleDescriptions() {
    const out = new Set();
    for (const texts of _scaleDescriptions.values()) {
        for (const text of texts) out.add(text);
    }
    return [...out];
}

/**
 * Position of a level within its scale, as a single sortable number: band first,
 * sub-band within it, so `Ia` precedes `Ib` and `k.h.N.` precedes `KS 1`.
 *
 * Unregistered levels return `Number.MAX_SAFE_INTEGER` so they sort last rather than
 * silently landing at the bottom of the scale.
 *
 * Only comparable **within one scale**: the number is a position in a ladder, so ordering
 * two ladders' levels against each other is meaningless and can tie (NRW's `KS 1b` is the
 * 3rd of 7 bands, its `KS 2` the 3rd of 6). Callers holding levels from more than one
 * scale must group by scale first — see `sortCompetencyLevels`.
 * @param {string|number|null|undefined} level - Level whose position in its scale is wanted.
 * @param {string} [scaleId] - Which ladder `level` belongs to; see `getCompetencyBand`
 * @returns {number} Sortable position within the level's own scale; `Number.MAX_SAFE_INTEGER` when unregistered.
 */
export function getCompetencyLevelOrdinal(level, scaleId) {
    const entry = getCompetencyBand(level, scaleId);
    return entry ? entryOrdinal(entry) : Number.MAX_SAFE_INTEGER;
}

/**
 * KMK standard rank of a level (1 = unter Mindeststandard … 5 = Optimalstandard),
 * or `null` when the scale did not name a standard for it.
 *
 * `null` means **unknown**, not "below" — a caller that treats it as a number has
 * reintroduced the bug this replaced.
 * @param {string|number|null|undefined} level - Level whose KMK standard is wanted.
 * @param {string} [scaleId] - Which ladder `level` belongs to; see `getCompetencyBand`
 * @returns {number|null} Rank 1…5, or null when the scale named no standard for it — unknown, not "below".
 */
export function getStandardRank(level, scaleId) {
    return getCompetencyBand(level, scaleId)?.standardRank ?? null;
}

/**
 * Every registered level whose standard rank satisfies `predicate`, across all scales.
 * This is how a metric like "Regelstandard oder höher" names its levels without
 * knowing any scale's vocabulary.
 *
 * A level whose `name` names no standard still qualifies when its **position in its own
 * scale** settles the question: `predicate` must hold for every rank in the level's
 * `[rankLowerBound, rankUpperBound]` interval. NRW's `k.h.N.` sits below the level named
 * "unter Mindeststandard", so it can only be rank 1 and belongs in `le_1` — while a level
 * of a scale that names nothing keeps the full `[1, 5]` interval and satisfies no metric.
 * See `deriveRankBounds`.
 * @param {(rank: number) => boolean} predicate - Holds for the ranks the metric counts.
 * @returns {string[]} `nameShort` values, in registration order
 */
export function getLevelNamesForStandardRank(predicate) {
    // Deduplicated by name: two ladders can carry the same level name and both qualify —
    // NRW's Deutsch and Mathematik both call rank 3 `KS 3` — and a caller matching payload
    // levels against this list wants it named once, not once per scale.
    const names = new Set();
    for (const entry of _levels.values()) {
        // Reporting levels only: the caller is naming the levels a *student* metric counts,
        // and an item ladder's names are a different vocabulary — see `isReportingEntry`.
        if (isReportingEntry(entry) && satisfiesEveryPossibleRank(entry, predicate)) {
            names.add(entry.name);
        }
    }
    return [...names];
}

/**
 * The band each loaded scale answers `predicate` at — the *boundary* of a rank question,
 * rather than every level that answers it.
 *
 * `getLevelNamesForStandardRank` answers "which levels count", which is what a share needs.
 * Prose needs the other half: "Regelstandard oder höher (≥ III bzw. B1)" names the lowest
 * qualifying band of each scale, once, and stays readable however deep the ladder is.
 *
 * Which end of the qualifying set is named is the caller's to say, because it follows the
 * operator the prose supplies: "≥ III" wants the `floor`; "unterhalb des Mindeststandards
 * (I bzw. A1)" or "≤ …" wants the `ceiling`. One fixed end serves only one of them — with
 * the floor, NRW's `e_1` named `KS 1a` (Mathematik) and left `KS 1` (Deutsch, the band
 * literally called "unter Mindeststandard") unnamed. Nothing changes where the qualifying
 * set is one band per scale (`ge_3`, or `e_1` on every ladder but NRW's split one).
 *
 * Reports `bandKey`, not `name`: `Ia` and `Ib` are one band `I`, and the hand-written German
 * in `info_boxes.json` already says `I` — the band is the granularity a reader is looking at
 * on the chart. Bands are deduplicated across scales, so NRW — whose Deutsch and Mathematik
 * ladders both call rank 3 `KS 3` — yields it once rather than "KS 3 bzw. KS 3".
 *
 * Scales appear in registration order, and within a scale the boundary is chosen by
 * ordinal, so the result reads bottom-up exactly as the ladder does.
 * @param {(rank: number) => boolean} predicate - Holds for the ranks the metric counts.
 * @param {'floor'|'ceiling'} [boundary='floor'] which end of each scale's qualifying set
 *   to name
 * @returns {string[]} `bandKey` values; empty when no loaded scale has such a level
 */
export function getStandardBandNames(predicate, boundary = 'floor') {
    const wantCeiling = boundary === 'ceiling';
    /** @type {Map<string, {ordinal: number, bandKey: string}>} */
    const boundaryByScale = new Map();

    for (const entry of _levels.values()) {
        // Reporting scales only — the prose names the band a *student* is reported on.
        if (!isReportingEntry(entry) || !satisfiesEveryPossibleRank(entry, predicate)) continue;

        const ordinal = entryOrdinal(entry);
        const current = boundaryByScale.get(entry.scaleId);
        const replaces =
            !current || (wantCeiling ? ordinal > current.ordinal : ordinal < current.ordinal);
        if (replaces) {
            boundaryByScale.set(entry.scaleId, { ordinal, bandKey: entry.bandKey });
        }
    }

    return [...new Set([...boundaryByScale.values()].map((entry) => entry.bandKey))];
}

/**
 * Whether any loaded scale names a KMK standard at all.
 *
 * Separates the two reasons an alias can resolve to nothing — the export names no standard
 * anywhere, or the scales do but carry no level of the requested rank — which need
 * different remedies and so must not share one diagnostic. Note that
 * `getLevelNamesForStandardRank(() => true)` cannot answer this: a tautology is satisfied
 * by every rank in an unnamed level's bounds too.
 * @returns {boolean} True when at least one loaded scale names a KMK standard.
 */
export function hasAnyStandardRank() {
    for (const entry of _levels.values()) {
        // An item scale's ranks say nothing about the ladder students are reported on:
        // `data/en/*` ranks every Aufgabenniveau and no reporting level.
        if (isReportingEntry(entry) && entry.standardRank !== null) return true;
    }
    return false;
}

/**
 * Whether the scale `level` belongs to names its standards at all.
 *
 * The gate that keeps a vocabulary miss from reading as a real zero: a share computed
 * over a scale with no ranks is not 0 %, it is unknown.
 * @param {string|number|null|undefined} level - Any level of the scale being questioned.
 * @param {string} [scaleId] - Which ladder `level` belongs to; see `getCompetencyBand`
 * @returns {boolean} False when a share over this scale would be unknown rather than zero.
 */
export function scaleHasStandardRanks(level, scaleId) {
    const entry = getCompetencyBand(level, scaleId);
    if (!entry) return false;
    for (const candidate of _levels.values()) {
        if (candidate.scaleId === entry.scaleId && candidate.standardRank !== null) {
            return true;
        }
    }
    return false;
}

/**
 * The leading scale's bands, one representative level name each, low band to high.
 *
 * For **decorative** thumbnails only — the nav-card, sidebar and view-title icons that
 * illustrate "a competence-level distribution" without rendering real data, so they have
 * no datum of their own to resolve a scale from. Charts and tables resolve the level of
 * the row they are painting instead, because a page can hold more than one scale.
 *
 * Each band is returned with its `scaleId` so the color lookup stays scale-aware: a
 * bare level name resolves to whichever scale registered it last, which is the wrong
 * ladder on a page holding two that share a name.
 * @returns {Array<{name: string, scaleId: string}>} One entry per band; empty before
 *          any scale is registered
 */
export function getLeadingScaleBandLevels() {
    const firstScaleId = _levels.values().next().value?.scaleId;
    if (firstScaleId === undefined) return [];

    const bands = [];
    for (const entry of _levels.values()) {
        if (entry.scaleId !== firstScaleId) continue;
        // One name per band, not per sub-band — and specifically the *last* sub-band,
        // which is the one shadeSubBand leaves at the band's unmodified ramp color.
        if (entry.subBandIndex !== entry.subBandCount - 1) continue;
        bands.push(entry);
    }

    // Sorted by band, not left in payload order: the ramp reads low-to-high.
    return bands
        .sort((a, b) => a.bandIndex - b.bandIndex)
        .map(({ name, scaleId }) => ({ name, scaleId }));
}

/**
 * CSS-class / group token for a competence level or any other field value: lowercased,
 * non-alphanumeric runs collapsed to a single dash. Shared by `themeService` (per-level
 * class token) and `chartUtils` (legend/visibility group token) so the two token
 * vocabularies cannot drift apart.
 * @param {string|number} value - A level name or any other field value.
 * @returns {string} Lowercased, with non-alphanumeric runs collapsed to single dashes.
 */
export function slugifyCompetencyToken(value) {
    return String(value)
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
}

// ============================================================================
// PRIVATE HELPERS
// ============================================================================

/**
 * Write one scale's entries into the registry.
 * @param {string} scaleId - The `|`-joined level names identifying this ladder.
 * @param {Array<object>} levels - Pre-filtered levels with `shippedColor` and `shippedRank`
 *        resolved off the row (see `collectMaximalScales` / `collectItemScaleLevels`).
 * @param {{bareNameIndex?: boolean}} [options] - `bareNameIndex: false` keeps the scale out
 *        of the bare-name fallback index, so its levels are reachable only through an
 *        explicit `scaleId`. Used for the item scale — see `registerItemCompetenceScales`.
 */
function registerScale(scaleId, levels, { bareNameIndex = true } = {}) {
    for (const entry of buildScaleEntries(scaleId, levels)) {
        // A bare name resolves to whichever scale registered it last — see `_levelsByName`.
        // The item scale opts out: its vocabulary overlaps the reporting one on several
        // states (Niedersachsen grades items `A1.1 … B2.2` and reports on `A1.1 … B1.2`), and a
        // shared index would let an item level answer a student level's colour lookup.
        if (bareNameIndex) _levelsByName.set(entry.key, entry.scopedKey);
        _levels.set(entry.scopedKey, entry);
    }
}

/**
 * Position of a registered entry within its own scale. Split out so the exported lookup
 * and the in-registry scans cannot drift on how a band and its sub-band are folded into
 * one sortable number.
 * @param {CompetenceLevelEntry} entry - A registered entry.
 * @returns {number} Band and sub-band folded into one sortable position.
 */
function entryOrdinal(entry) {
    return entry.bandIndex * 100 + entry.subBandIndex;
}
