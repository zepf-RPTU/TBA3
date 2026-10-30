/**
 * The competence-level (Kompetenzstufe) scale registry.
 *
 * Holds what the loaded scales say about themselves: level order and the `medium` level
 * (which decide every level's color), the KMK standard band each level names (which decides
 * what "Regelstandard oder höher" means), and the item slots each reporting level covers
 * (which place an Aufgabenniveau on it). All are read from the payload: states
 * publish different scales for the same subject (`A1…C1`, `A1.1, A1.2, A2.1, …`,
 * `k.h.N., KS 1 … KS 5`, `Ia, Ib, II…V`), and every palette is generated for the ladder
 * in play.
 *
 * Reading the payload into scales and entries is `competenceScalePayload.js`; painting
 * the registered entries is `competenceLevelColors.js`. This class owns the state
 * between the two and every lookup over it.
 *
 * One palette per app, created with the app's context (`createModuleContext`) and
 * filled as its documents land. State
 * derived from the registry lives in `memo`, which every registration clears; surfaces
 * drawn before the data lands follow `revision`.
 */

import { computed, signal } from '@preact/signals-core';
import { group } from 'd3-array';

import {
    buildScaleEntries,
    collectItemScaleLevels,
    collectMaximalScales,
    isContiguousRun,
    normalizeLevelKey,
    scopeLevelKey,
} from './competenceScalePayload.js';

/** @typedef {import('./competenceScalePayload.js').CompetenceLevelEntry} CompetenceLevelEntry */
/** @typedef {import('./competenceScalePayload.js').StandardBand} StandardBand */

/**
 * One scale's answer to a standard-band question: the levels it counts.
 * @typedef {object} StandardBandSelection
 * @property {string} scaleId - The reporting scale.
 * @property {CompetenceLevelEntry[]} levels - The qualifying levels, in scale order.
 */

export class CompetenceLevelPalette {
    /**
     * `scopedKey` (scale + level) → entry. Keyed by scale and level, because one page
     * can hold two ladders that share level names (`k.h.N., KS 1 … KS 5` for one subject,
     * `k.h.N., KS 1a, KS 1b, KS 2 … KS 5` for another): in a name-keyed map the later
     * registration would repaint the earlier scale.
     * @type {Map<string, CompetenceLevelEntry>}
     */
    #levels = new Map();
    /**
     * Lowercased level name → the `scopedKey` a bare name resolves to: the fallback index
     * for lookups that do not know their scale, unambiguous for a dataset of one
     * reporting scale. Last registration wins.
     * @type {Map<string, string>}
     */
    #levelsByName = new Map();
    /** @type {Set<string>} scaleId of every scale already registered. */
    #scales = new Set();
    /** @type {Set<string>} scaleId of every item scale, a subset of `#scales`. */
    #itemScaleIds = new Set();
    /** @type {Map<string, Set<string>>} scaleId → the scale's own prose, when the payload sent any. */
    #scaleDescriptions = new Map();
    /** @type {Set<string>} Runs already reported as ambiguous, so the warning fires once each. */
    #warnedAmbiguous = new Set();
    #revision = signal(0);
    /** @type {Map<string, unknown>} `memo` results, dropped on every registration. */
    #memo = new Map();

    /**
     * Registry generation, bumped on every registration. An effect that reads it redraws
     * once the scales land.
     * @type {import('@preact/signals-core').ReadonlySignal<number>}
     */
    revision = computed(() => this.#revision.value);

    /**
     * Register the competence-level scales found in a `competence-levels.json` payload.
     * Idempotent per scale: the same scale repeated across value groups is registered once.
     * Truncated scales are folded into the full one first (see `collectMaximalScales`).
     * @param {import('../data/schemas/competenceLevels.js').CompetenceLevelsValueGroup[]} valueGroups - Value groups from `competence-levels.json`, each carrying the scale its domain reached.
     */
    registerCompetenceLevelScales(valueGroups) {
        for (const { scaleId, levels, scaleDescriptions } of collectMaximalScales(valueGroups)) {
            if (this.#scales.has(scaleId)) continue;
            this.#scales.add(scaleId);
            if (scaleDescriptions.size > 0) this.#scaleDescriptions.set(scaleId, scaleDescriptions);

            this.#registerScale(scaleId, levels);
        }
        this.#changed();
    }

    /**
     * Register the Aufgabenniveau scale carried by an `items.json` payload.
     *
     * The item scale is a second vocabulary, unrelated to the reporting one (items graded
     * `Ia … V`, students reported on `k.h.N., KS 1a … KS 5`). Every item's
     * `parameters.competenceLevel` carries `id`, its slot on the scale; order comes
     * from there (`collectItemScaleLevels`), and the reporting levels' `itemLevelSpan`
     * names the slots each one covers (`getItemLevel`).
     *
     * Registered in its own namespace and out of the bare-name index, because the two
     * vocabularies can overlap: where students are reported on `A1.1 … B1.2` and items
     * graded `A1.1 … B2.2`, the reporting scale is a contiguous prefix of the item scale.
     * Sharing a namespace would let `collectMaximalScales` fold them together and re-place
     * every student level; sharing the bare-name index would let an item level answer a
     * student level's colour lookup. Callers reach these entries through
     * `getItemLevel`, and every cross-scale query keyed by name skips them
     * (`isReportingEntry`).
     * @param {import('../data/schemas/items.js').ItemsValueGroup[]} valueGroups
     * @returns {void}
     */
    registerItemCompetenceScales(valueGroups) {
        const scale = collectItemScaleLevels(valueGroups);
        if (!scale || this.#scales.has(scale.scaleId)) return;
        this.#scales.add(scale.scaleId);
        this.#itemScaleIds.add(scale.scaleId);
        this.#registerScale(scale.scaleId, scale.levels, { bareNameIndex: false });
        this.#changed();
    }

    /**
     * Every registered entry, reporting and item scales alike, in registration order.
     * Reporting-only callers filter with `isReportingEntry`.
     * @returns {CompetenceLevelEntry[]} A fresh array; the registry is not exposed.
     */
    getRegisteredLevels() {
        return [...this.#levels.values()];
    }

    /**
     * Whether a registered entry belongs to a reporting scale, not an item scale.
     *
     * Keeps item levels out of every query that reaches across scales and is keyed by
     * name or band, not by an explicit `scaleId` (see `registerItemCompetenceScales`).
     * Scale-scoped lookups do not need it: the caller has named the ladder.
     * @param {CompetenceLevelEntry} entry
     * @returns {boolean}
     */
    isReportingEntry(entry) {
        return !this.#itemScaleIds.has(entry.scaleId);
    }

    /**
     * Look up the registered entry for a level name (`A1`, `III`, …). `null` is how callers
     * tell a competence-level field apart from a gender / richtig-falsch field, so it
     * must stay strict.
     *
     * Pass `scaleId` where a page can hold two ladders sharing a level name. Without it the answer is the scale that registered the name
     * last.
     * @param {string|number|null|undefined} level - Level token in any input vocabulary.
     * @param {string} [scaleId] - Which ladder `level` belongs to
     * @returns {CompetenceLevelEntry|null}
     */
    getCompetenceLevelEntry(level, scaleId) {
        if (level === null || level === undefined) return null;
        const key = normalizeLevelKey(level);
        const scopedKey =
            scaleId === undefined ? this.#levelsByName.get(key) : scopeLevelKey(scaleId, key);
        return scopedKey ? (this.#levels.get(scopedKey) ?? null) : null;
    }

    /**
     * The registered reporting scale a value group is measured on.
     *
     * A value group lists the levels its domain reached, and the registry folded truncated
     * runs into their full ladder at registration (`collectMaximalScales`), so its own level
     * list is not always a registered scale. A run that sits inside exactly one ladder
     * resolves to it; one that sits inside several (`KS 2|KS 3|KS 4|KS 5` is a run of both
     * `KS 1 … KS 5` and `KS 1a, KS 1b, KS 2 … KS 5`) resolves to nothing with a warning, and
     * the caller falls back to the bare-name answer or to the scale of the value group's
     * Fach/Domäne.
     * @param {{competenceLevels: ReadonlyArray<{nameShort: string|number}>}} valueGroup
     * @returns {string|undefined} `undefined` when the run is unregistered or ambiguous.
     */
    scaleIdOf(valueGroup) {
        return this.#resolveRun(valueGroup.competenceLevels.map((level) => level.nameShort));
    }

    /**
     * The registered scale one level run belongs to (`scaleIdOf`).
     *
     * Reporting scales only: an item ladder that contains the run would count as a second
     * container and make every truncated run ambiguous (a reporting `I|II|III|IV|V` and
     * an item scale `item:I|II|III|IV|V` both contain the domain run `II|III|IV|V`).
     * @param {Array<string|number|null|undefined>} levelNames - A value group's `nameShort` values, in payload order.
     * @returns {string|undefined} `undefined` when the run is unregistered or ambiguous.
     */
    #resolveRun(levelNames) {
        const names = (levelNames ?? []).filter(
            (name) => name !== null && name !== undefined && name !== '',
        );
        if (names.length === 0) return undefined;

        const runId = names.map(String).join('|');
        if (this.#scales.has(runId) && !this.#itemScaleIds.has(runId)) return runId;

        const containers = [...this.#scales].filter(
            (scaleId) => !this.#itemScaleIds.has(scaleId) && isContiguousRun(runId, scaleId),
        );
        if (containers.length === 1) return containers[0];

        if (containers.length > 1 && !this.#warnedAmbiguous.has(runId)) {
            this.#warnedAmbiguous.add(runId);
            console.warn(
                `[competenceLevelPalette] The level run "${runId}" sits inside ${containers.length} ` +
                    `registered scales (${containers.join(' / ')}); resolving it by name instead. ` +
                    "Pass the scale of the value group's Fach/Domäne where one is known.",
            );
        }
        return undefined;
    }

    /**
     * Every level of the scale that `level` belongs to, in scale order: the levels that
     * could occur, not the ones a given group has.
     * @param {string|number} level - Any level of the scale to enumerate.
     * @param {string} [scaleId] - Which ladder `level` belongs to; see `getCompetenceLevelEntry`
     * @returns {string[]} Empty when `level` is not a registered level
     */
    getScaleLevelNames(level, scaleId) {
        const entry = this.getCompetenceLevelEntry(level, scaleId);
        if (!entry) return [];
        return [...this.#levels.values()]
            .filter((candidate) => candidate.scaleId === entry.scaleId)
            .map((candidate) => candidate.name);
    }

    /**
     * The glossary key to stamp on a rendered level value, or null when the payload sent no
     * text for it, so the level renders as plain text, not with a popup that comes up
     * empty.
     *
     * Falls back to the reporting level that covers an item level's slot when the exact
     * level is not registered, because item levels and aggregate levels need not share a
     * vocabulary: aggregates may ship `A1 … C1` while the same group's `items.json` grades
     * every item `A1.1 … C1.1`. Where the payload describes the level itself (an
     * `A1.1 … B1.2` ladder), the exact match wins.
     * @param {string|number} level
     * @returns {string|null}
     */
    getLevelGlossaryKey(level) {
        const entry =
            this.getCompetenceLevelEntry(level) ?? this.getItemLevel(level)?.reportingLevel;
        return entry?.descriptionText ? entry.key : null;
    }

    /**
     * Every registered level that carries payload prose, keyed the way `getLevelGlossaryKey`
     * stamps it.
     * @returns {Map<string, {name: string, description: string}>}
     */
    getLevelDescriptions() {
        const out = new Map();
        for (const entry of this.#levels.values()) {
            if (entry.descriptionText) {
                out.set(entry.key, { name: entry.name, description: entry.descriptionText });
            }
        }
        return out;
    }

    /**
     * The prose describing each registered scale as a whole, deduplicated, in registration
     * order. Several are expected: a page can show several subjects' scales, and each
     * ladder describes itself.
     *
     * More than one per scale is also expected: a scale is identified by its level
     * sequence, and two subjects can share one while describing it differently, so every
     * distinct text is kept (see `collectMaximalScales`).
     * @returns {string[]} Empty when no payload carried `competenceScaleDescription`
     */
    getScaleDescriptions() {
        const out = new Set();
        for (const texts of this.#scaleDescriptions.values()) {
            for (const text of texts) out.add(text);
        }
        return [...out];
    }

    /**
     * Position of a level within its scale, so `Ia` precedes `Ib` and `k.h.N.` precedes
     * `KS 1`.
     *
     * Unregistered levels return `Number.MAX_SAFE_INTEGER`, so they sort last.
     *
     * Only comparable within one scale: positions on two ladders can tie (`KS 1b` is the
     * 3rd of 7 levels on one, `KS 2` the 3rd of 6 on another): a sort over levels from more
     * than one scale (`sortCompetenceLevels`) interleaves them by position.
     * @param {string|number|null|undefined} level
     * @param {string} [scaleId] - Which ladder `level` belongs to; see `getCompetenceLevelEntry`
     * @returns {number}
     */
    getCompetenceLevelOrdinal(level, scaleId) {
        const entry = this.getCompetenceLevelEntry(level, scaleId);
        return entry ? entry.levelIndex : Number.MAX_SAFE_INTEGER;
    }

    /**
     * Each reporting scale's answer to `<operator>_<band>`, the alias vocabulary of the info-box
     * texts ("Regelstandard oder höher" is `ge_medium`), in registration order.
     *
     * Per scale, `tagged` are the levels the payload tags `band`. `e` counts those; `ge`
     * every level from the lowest tagged one up; `le` every level up to the highest tagged
     * one. So untagged levels count by position: `ReStd+` is inside `ge_medium`, `k.h.N.`
     * inside `le_low`. A scale tagging no level `band` (no `high` on a ladder that tops out
     * at `B1.2`) is left out, not counted as empty.
     * @param {'e'|'ge'|'le'} operator - Exactly, at or above, at or below.
     * @param {StandardBand} band
     * @returns {StandardBandSelection[]} One per scale that tags `band`; empty when none does.
     */
    getStandardBandSelection(operator, band) {
        return this.memo(`standardBandSelection:${operator}_${band}`, () => {
            const byScale = group(
                [...this.#levels.values()].filter((entry) => this.isReportingEntry(entry)),
                (entry) => entry.scaleId,
            );

            /** @type {StandardBandSelection[]} */
            const selections = [];
            // Registration inserts each scale's levels in scale order.
            for (const [scaleId, ordered] of byScale) {
                const tagged = ordered.filter((entry) => entry.standardBand === band);
                if (tagged.length === 0) continue;
                const first = tagged[0];
                const last = tagged[tagged.length - 1];
                const levels =
                    operator === 'e'
                        ? tagged
                        : operator === 'ge'
                          ? ordered.slice(ordered.indexOf(first))
                          : ordered.slice(0, ordered.indexOf(last) + 1);
                selections.push({ scaleId, levels });
            }
            return selections;
        });
    }

    /**
     * Whether the scale `level` belongs to tags any standard band: a share computed over
     * a scale that names no standard is unknown, not 0 %.
     * @param {string|number|null|undefined} level - Any level of the scale being questioned.
     * @param {string} [scaleId] - Which ladder `level` belongs to; see `getCompetenceLevelEntry`
     * @returns {boolean}
     */
    scaleHasStandardBand(level, scaleId) {
        const entry = this.getCompetenceLevelEntry(level, scaleId);
        if (!entry) return false;
        for (const candidate of this.#levels.values()) {
            if (candidate.scaleId === entry.scaleId && candidate.standardBand !== null) return true;
        }
        return false;
    }

    /**
     * An Aufgabenniveau as the registered item scales define it: its entry (whose `scaleId`
     * is the item scale), the item slot it sits on, the number a reporting level's
     * `itemLevelSpan` counts in, and the reporting level whose span covers that slot —
     * the level an item mark paints as, and whose prose describes it. Memoised per
     * registration: a table resolves it per cell.
     *
     * The item scales stay out of the bare-name index (see `registerItemCompetenceScales`),
     * so a token is tried on each registered item scale in turn; a dataset registers one
     * per items document.
     * @param {string|number|null|undefined} token - An Aufgabenniveau, as `items.json` spells it.
     * @returns {{entry: CompetenceLevelEntry, slot: number|null, reportingLevel: CompetenceLevelEntry|null}|null} Null when no registered item scale defines the token.
     */
    getItemLevel(token) {
        if (token === null || token === undefined) return null;
        return this.memo(`itemLevel:${token}`, () => {
            for (const scaleId of this.#itemScaleIds) {
                const entry = this.getCompetenceLevelEntry(token, scaleId);
                if (!entry) continue;
                const slot = entry.itemSlot ?? null;
                return { entry, slot, reportingLevel: this.#reportingLevelForSlot(slot) };
            }
            return null;
        });
    }

    /**
     * The reporting level whose `itemLevelSpan` covers an item slot, or null when none
     * does. The first registered reporting scale covering the slot answers, the same
     * convention as `getLeadingScaleLevels`; it matters only where several ladders
     * register together (rp/sl English, TH-1/2/3).
     * @param {number|null} slot - An item's `competenceLevel.id`, as a number.
     * @returns {CompetenceLevelEntry|null}
     */
    #reportingLevelForSlot(slot) {
        if (typeof slot !== 'number' || !Number.isInteger(slot)) return null;
        for (const entry of this.#levels.values()) {
            if (!this.isReportingEntry(entry)) continue;
            const span = entry.itemLevelSpan;
            if (span && span.from <= slot && slot <= span.to) return entry;
        }
        return null;
    }

    /**
     * The leading reporting scale's levels, low to high.
     *
     * For decorative thumbnails only, which
     * have no datum to resolve a scale from. Charts and tables resolve the level of the
     * value group they paint, because a page can hold more than one scale. An item scale
     * never leads, even when `items.json` lands first: item marks paint as reporting levels.
     *
     * Each level comes with its `scaleId`, so the color lookup stays scale-aware (see
     * `getCompetenceLevelEntry`).
     * @returns {Array<{name: string, scaleId: string}>} Empty before any reporting scale is registered
     */
    getLeadingScaleLevels() {
        const first = this.getRegisteredLevels().find((entry) => this.isReportingEntry(entry));
        if (!first) return [];
        return this.getScaleLevelNames(first.name, first.scaleId).map((name) => ({
            name,
            scaleId: first.scaleId,
        }));
    }

    /**
     * A value derived from the registry, computed once per registration: the next
     * registration drops it, so nothing read before the data arrived is served afterwards.
     * @template T
     * @param {string} key - Names the value; callers prefix their own module.
     * @param {() => T} compute
     * @returns {T}
     */
    memo(key, compute) {
        if (this.#memo.has(key)) return /** @type {T} */ (this.#memo.get(key));
        const value = compute();
        this.#memo.set(key, value);
        return value;
    }

    #changed() {
        this.#memo.clear();
        this.#revision.value++;
    }

    /**
     * Write one scale's entries into the registry.
     * @param {string} scaleId
     * @param {import('./competenceScalePayload.js').ScaleLevel[]} levels - In scale order, with `shippedColor`,
     *        `shippedBand` and `shippedSpan` resolved off the value group (see `collectMaximalScales` / `collectItemScaleLevels`).
     * @param {{bareNameIndex?: boolean}} [options] - `bareNameIndex: false` keeps the scale out
     *        of the bare-name fallback index, so its levels are reachable only through an
     *        explicit `scaleId` (the item scale; see `registerItemCompetenceScales`).
     */
    #registerScale(scaleId, levels, { bareNameIndex = true } = {}) {
        for (const entry of buildScaleEntries(scaleId, levels)) {
            if (bareNameIndex) this.#levelsByName.set(entry.key, entry.scopedKey);
            this.#levels.set(entry.scopedKey, entry);
        }
    }
}

/**
 * CSS-class / group token for a competence level or any other field value: lowercased,
 * non-alphanumeric runs collapsed to a single dash.
 * @param {string|number} value
 * @returns {string}
 */
export function slugifyCompetenceToken(value) {
    return String(value)
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
}
