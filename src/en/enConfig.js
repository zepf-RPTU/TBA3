/**
 * EN config — per-app-instance, data-derived configuration.
 *
 * Config is computed once by the pure `buildEnConfig()` builder and cached
 * per-DataStore
 * instance via `getEnConfig(dataStore)` — the standard app-instance config
 * mechanism, enforced by the constants-mutable-state rule in tools/check-structure.mjs.
 *
 * Modules read `getEnConfig(this.getOption('dataStore'))`; pure helpers and
 * chart renderers receive the resulting `EnConfig` as an explicit argument.
 */

import { AGG_TYPE_RESULT, EN_DATA_KEYS } from './enConstants.js';
import { comparisonSeriesVisual } from '@tba3/modules/charts';
import { AGG_TYPE_STYLE } from '@tba3/modules/en-domain';
import { resolveEquivalenceTable, RESULT_CORRECT, RESULT_VALUES } from '@tba3/modules/domain';
import { RESULT_ICON_CLASSES } from '@tba3/modules/tables';

/**
 * @typedef {ReturnType<typeof import('@tba3/modules/en/utils/enStyleAggregationAdapter.js').parseStyleAggregation>} ParsedStyleAggregation
 */

/**
 * Icon per Ergebnis value. Keyed by the value, never by position: the spec fixes no
 * order of `aggregations[]`, so the n-th Ergebnis entry of a row means nothing.
 */
const RESULT_ICON_BY_VALUE = {
    Richtig: { icon: 'check_circle', iconClass: RESULT_ICON_CLASSES.CORRECT },
    Falsch: { icon: 'cancel', iconClass: RESULT_ICON_CLASSES.INCORRECT },
    Unbearbeitet: { icon: 'block', iconClass: RESULT_ICON_CLASSES.NOT_ATTEMPTED },
};

/**
 * @typedef {object} ResultType
 * @property {string} value - The Ergebnis aggregation value (`Richtig`, `Falsch`, `Unbearbeitet`)
 * @property {string} label - Display label; the value itself
 * @property {string} glossaryKey - Glossary lookup key, the lower-cased value
 * @property {number} numericCode - `RESULT_VALUES[value]`, the code the item records carry
 * @property {string} icon - Material Symbols glyph of the result cell
 * @property {string} iconClass - Class the result cell's icon is painted with
 */

/**
 * @typedef {object} ComparisonGroup
 * @property {string} id - The value group's own key (`school`, `hb`, `nw-gy`, …); also the toggle id
 * @property {string} type - The payload's own value-group type; `resolveAverageRole`
 *   maps it to the role that decides marker shape and colour. `school` and `state`
 *   are the two roles with a glossary entry; anything else is the catch-all.
 * @property {string} name - Display name (`Schulschnitt`, `Landesschnitt GY`, …); the
 *   same field the parse result uses, so one comparison-group shape reaches every chart
 * @property {string|null} shortLabel - `L1`/`L2`/… when several groups share this
 *   role, `null` when it is the only one; derived in `parseStyleAggregation`
 * @property {number} typeIndex - Position among the groups sharing this role, 0-based
 * @property {string|null} glossaryKey - Glossary lookup key, derived from `type`;
 *   `null` for a type the glossary has no term for
 */

/**
 * @typedef {object} DomainEntry
 * @property {string} dataKey - Data key prefix (e.g. 'en-ho')
 * @property {string} fieldPrefix - Short field prefix, typically domain.id (e.g. 'ho')
 * @property {string|null} displayName - Human-readable domain name (e.g. 'Hörverstehen')
 */

/**
 * @typedef {object} EquivalenceTable
 * @property {number} maxScore - Top of the band scale (last band's max)
 * @property {number} [itemCount] - Items of this domain on the booklet
 * @property {number} [studentCount] - Scored students of the value-group on this booklet
 * @property {Array<{nameShort: string, minScore: number, maxScore: number}>} bands
 *           Ascending, boundaries inclusive
 */

/**
 * Immutable, per-instance EN configuration. Exposes the same query surface the
 * old free functions did, but reads instance state instead of module globals.
 */
export class EnConfig {
    /** @type {Map<string, DomainEntry>} domain.id → config, insertion order */
    #domains;
    /** @type {Array<{value: string, fieldName: string, label: string}>} */
    #styleCategories;
    /** @type {ResultType[]} */
    #resultTypes;
    /** @type {Array<ComparisonGroup>} */
    #comparisonGroups;
    /** @type {{[domainId: string]: EquivalenceTable|null}} domain.id → cut scores */
    #equivalenceTables;

    /**
     * @param {object} parts - The vocabulary derived from the loaded payload; every part is data-driven, none of it is hard-coded per state.
     * @param {Map<string, DomainEntry>} parts.domains - domain.id → field naming and display name, in the order the payload delivered them.
     * @param {Array<{value: string, fieldName: string, label: string}>} parts.styleCategories - Aufgabenniveau categories, as used by the style charts and tables.
     * @param {ResultType[]} parts.resultTypes - Result kinds the payload carries, in the fixed order of `RESULT_VALUES`.
     * @param {Array<ComparisonGroup>} parts.comparisonGroups - Comparison populations in payload order; several groups may share a type.
     * @param {{[domainId: string]: EquivalenceTable|null}} [parts.equivalenceTables] - Äquivalenztabelle per domain; `null` where the payload shipped none.
     */
    constructor({ domains, styleCategories, resultTypes, comparisonGroups, equivalenceTables }) {
        this.#domains = domains;
        this.#styleCategories = styleCategories ?? [];
        this.#resultTypes = resultTypes ?? [];
        this.#comparisonGroups = comparisonGroups ?? [];
        this.#equivalenceTables = equivalenceTables ?? {};
    }

    // ---- Domains ----------------------------------------------------------

    /**
     * All registered domain IDs in registration order.
     * @returns {string[]} e.g. ['ho', 'le']
     * @throws {Error} if no domains were discovered
     */
    get domainIds() {
        const ids = [...this.#domains.keys()];
        if (ids.length === 0) {
            throw new Error(
                'No domains registered. Domain config must be derived from loaded data before ' +
                    'charts or tables are initialized. Check that data has been loaded.',
            );
        }
        return ids;
    }

    /**
     * Full data field name for a domain (e.g. 'en-hoCompLevel'), or null.
     * @param {string} mode - domain.id (e.g. 'ho', 'le')
     * @param {string} suffix - Field suffix (e.g. 'CompLevel', 'Percentage')
     * @returns {string|null} The record key, or `null` when the domain is not registered.
     */
    fieldName(mode, suffix) {
        const entry = this.#domains.get(mode);
        return entry ? `${entry.dataKey}${suffix}` : null;
    }

    /**
     * Field prefix for a domain (e.g. 'ho'), or null.
     * @param {string} mode - domain.id
     * @returns {string|null} The prefix, or `null` when the domain is not registered.
     */
    domainFieldPrefix(mode) {
        return this.#domains.get(mode)?.fieldPrefix ?? null;
    }

    /**
     * Human-readable display name for a domain (falls back to the id).
     * @param {string} mode - domain.id
     * @returns {string} The display name, or the id itself when the domain is unknown.
     */
    domainLabel(mode) {
        return this.#domains.get(mode)?.displayName ?? mode;
    }

    /**
     * Display names for the registered domains, in order.
     * @returns {string[]} One label per domain, positionally aligned with `domainIds`.
     */
    get domainLabels() {
        return this.domainIds.map((id) => this.domainLabel(id));
    }

    /**
     * Assert exactly 2 domains are registered (dual-domain layout contract).
     * @throws {Error} if the registered domain count !== 2
     */
    assertExactlyTwoDomains() {
        const ids = this.domainIds;
        if (ids.length !== 2) {
            throw new Error(
                `Expected exactly 2 domains, but found ${ids.length}: ${ids.join(', ')}. ` +
                    'EN module is designed for dual-domain comparison (Hören/Lesen). ' +
                    'Check API response and domain discovery logic.',
            );
        }
    }

    // ---- Other config -----------------------------------------------------

    /**
     * Raw-score cut scores per domain (`Äquivalenztabelle`), from the class's own
     * booklet. A domain whose payload ships no table maps to `null` — callers draw no
     * bands rather than inventing boundaries.
     * @returns {{[domainId: string]: EquivalenceTable|null}} keyed by domain.id
     */
    get equivalenceTables() {
        return this.#equivalenceTables;
    }

    /** @returns {Array<{value: string, fieldName: string, label: string}>} Aufgabenniveau categories in payload order */
    get styleCategories() {
        return this.#styleCategories;
    }

    /** @returns {ResultType[]} Result types the payload carries, in the fixed order Richtig, Falsch, Unbearbeitet */
    get resultTypes() {
        return this.#resultTypes;
    }

    /** @returns {ResultType|undefined} The `Richtig` result type, found by value; absent when no row carries one */
    get correctResultType() {
        return this.#resultTypes.find((rt) => rt.value === RESULT_CORRECT);
    }

    /** @returns {Array<ComparisonGroup>} Comparison populations in payload order */
    get comparisonGroups() {
        return this.#comparisonGroups;
    }

    /** @returns {string[]} Comparison mode IDs (toggle keys), e.g. ['schulschnitt', 'landesschnitt'] */
    get comparisonModeIds() {
        return this.#comparisonGroups.map((g) => g.id);
    }
}

/**
 * Build an {@link EnConfig} from the raw EN JSON payloads. Pure — no globals.
 * @param {Array} competenceLevelsData - students_competence-levels.json
 * @param {Array} studentStyleAggregationData - students_aggregation.json
 * @param {ParsedStyleAggregation|null} [parsedAggregateStyle] - Parsed aggregate style data
 *        (from parseStyleAggregation of aggregation.json); supplies comparison groups.
 * @param {Array|null} [competenceLevelsClassData] - competence-levels.json (the aggregate
 *        file, not the per-student one); supplies the per-domain cut scores.
 * @returns {EnConfig} The vocabulary every EN view reads its domains, bands and comparison groups from.
 */
export function buildEnConfig(
    competenceLevelsData,
    studentStyleAggregationData,
    parsedAggregateStyle = null,
    competenceLevelsClassData = null,
) {
    const clData = competenceLevelsData ?? [];
    const styleData = studentStyleAggregationData ?? [];
    const allEntries = [...clData, ...styleData];

    // Domains — unique domain.id in order of first appearance, capped at 2.
    const domainIds = [];
    for (const entry of allEntries) {
        const id = entry.domain?.id;
        if (id && !domainIds.includes(id)) domainIds.push(id);
        if (domainIds.length === 2) break;
    }
    const subjectId = allEntries[0]?.subject?.id ?? 'en';
    const domainNames = new Map();
    for (const e of allEntries) {
        const id = e.domain?.id;
        if (id && e.domain?.name) domainNames.set(id, e.domain.name); // last non-empty name wins
    }
    /** @type {Map<string, DomainEntry>} */
    const domains = new Map();
    for (const domainId of domainIds) {
        domains.set(domainId, {
            dataKey: `${subjectId}-${domainId}`,
            fieldPrefix: domainId,
            displayName: domainNames.get(domainId) ?? null,
        });
    }

    // Style categories — from the first style-aggregation entry.
    const firstAggs = styleData[0]?.aggregations ?? [];
    const styleCategories = firstAggs
        .filter((a) => a.type === AGG_TYPE_STYLE)
        .map((a) => ({
            value: a.value,
            fieldName: `${a.value}Percent`,
            label: a.value.charAt(0).toUpperCase() + a.value.slice(1),
        }));

    // Result types — every Ergebnis value any student row carries, in the fixed order of
    // RESULT_VALUES (Richtig, Falsch, Unbearbeitet). Read by value across all rows, so one
    // row's missing bucket neither drops the type nor shifts the others.
    const deliveredResults = new Set(
        styleData.flatMap((entry) =>
            (entry.aggregations ?? [])
                .filter((a) => a.type === AGG_TYPE_RESULT)
                .map((a) => a.value),
        ),
    );
    /** @type {ResultType[]} */
    const resultTypes = Object.entries(RESULT_VALUES)
        .filter(([value]) => deliveredResults.has(value))
        .map(([value, numericCode]) => ({
            value,
            label: value,
            glossaryKey: value.toLowerCase(),
            numericCode,
            ...RESULT_ICON_BY_VALUE[value],
        }));

    // Comparison groups — one per delivered value group, in payload order, keyed by
    // the group's own id. A state that ships several Landesschnitte therefore yields
    // several toggles; which of them a class should be compared against is the
    // exporter's decision, not one the app makes on its own.
    // `shortLabel`/`typeIndex` are derived in `parseStyleAggregation`, the one place
    // both EN group sources pass through. The glossary key stays keyed on `type`: the
    // glossary defines "Landesschnitt", not "L1 = Landesschnitt".
    const comparisonGroups = (parsedAggregateStyle?.comparisonGroups ?? []).map((group) => ({
        id: group.id,
        type: group.type,
        name: group.name,
        shortLabel: group.shortLabel ?? null,
        typeIndex: group.typeIndex ?? 0,
        // `null` for a type the glossary has no entry for: the group's own payload
        // name is then the whole label. The old `klassenschnitt` fallback was
        // unreachable while only school/state got this far, and is wrong now that
        // an unrecognised comparison type does — it is not the class.
        glossaryKey: comparisonSeriesVisual(group).glossaryKey,
    }));

    // Cut scores — one table per domain, off the class's own row. Hören and Lesen are
    // scored separately and their tables genuinely differ (different maximum points and
    // different band boundaries), so this must not collapse to one table for both.
    // The `group` row is the class's own; school and state rows can sit on another
    // booklet entirely, so neither may be read for the class's cut scores.
    /** @type {{[domainId: string]: EquivalenceTable|null}} */
    const equivalenceTables = {};
    for (const domainId of domainIds) {
        const classRow = (competenceLevelsClassData ?? []).find(
            (entry) => entry?.type === 'group' && entry?.domain?.id === domainId,
        );
        equivalenceTables[domainId] = classRow ? resolveEquivalenceTable(classRow) : null;
    }

    return new EnConfig({
        domains,
        styleCategories,
        resultTypes,
        comparisonGroups,
        equivalenceTables,
    });
}

/**
 * Get the parsed aggregate style data (class/school/state averages + group
 * names), computed once and cached in the DataStore. The dataset's wiring
 * (inputs + builder) is declared in enDatasets.js.
 * @param {import('../common/services/dataStore.js').DataStore} dataStore - Store holding the current class's loaded datasets.
 * @returns {ParsedStyleAggregation} Class, school and state style averages plus the group names they belong to.
 */
export function getEnStyleAverages(dataStore) {
    return dataStore.getDataset(EN_DATA_KEYS.STYLE_AVERAGES);
}

/**
 * Get the EN config for the current class, built once and cached in the
 * DataStore. The dataset's wiring (raw inputs + `buildEnConfig`) is declared
 * in enDatasets.js.
 *
 * Note the two competence-level keys are not interchangeable:
 * `en.competenceLevels` holds `students_competence-levels.json` (one row per student),
 * `en.competenceLevelsClass` the aggregate `competence-levels.json` that carries the
 * class/school/state rows — and with them the cut scores.
 * @param {import('../common/services/dataStore.js').DataStore} dataStore - Store holding the current class's loaded datasets.
 * @returns {EnConfig} The config built from this class's payload.
 */
export function getEnConfig(dataStore) {
    return dataStore.getDataset(EN_DATA_KEYS.CONFIG);
}
