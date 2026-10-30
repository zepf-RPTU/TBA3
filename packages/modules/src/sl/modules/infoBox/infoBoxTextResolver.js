import * as selections from './infoBoxShareSelections.js';
import * as stateComparison from './infoBoxStateComparison.js';
import { parseInfoBoxText } from './infoBoxPlaceholders.js';
import { ALL_DOMAINS, normalizeTarget } from '../../utils/slQueryPrimitives.js';
import { formatStandardBands } from '../../utils/slCompetenceLevels.js';
import { getListFormat, getNumberFormat } from '../../../common/utils/numberFormat.js';

const INTEGER_FORMAT = { maximumFractionDigits: 0 };
const DECIMAL_FORMAT = { minimumFractionDigits: 2, maximumFractionDigits: 2 };
/** The selection fields a template prints as written; `domainName` linked to its entry. */
const SELECTION_TEXT_FIELDS = ['groupName', 'subjectName', 'domainName'];

/**
 * The `selectShareTarget` scopes, each the verb that picks its superlative.
 * @type {Record<string, (queries: CompetenceShareQueries, params: ShareArgs & {mode: 'min'|'max'}) => InfoBoxSelection|null>}
 */
const SHARE_TARGET_SCOPES = {
    groupMean: selections.selectGroupByMeanShare,
    groupRange: selections.selectGroupBySubjectShareRange,
    subjectDomainShare: selections.selectSubjectDomainByShare,
    subjectGroupRange: selections.selectSubjectByShareGroupRange,
    subjectDomainGroupRange: selections.selectSubjectDomainByShareGroupRange,
    subjectStateDiff: stateComparison.selectSubjectByStateShareDiff,
    groupInSubject: selections.selectGroupBySubjectShare,
};

/**
 * The values each enumerated argument takes; any other value drops the block.
 * @type {{mode: ReadonlyArray<'min'|'max'>, comparison: ReadonlyArray<'gt'|'lt'>, aggregation: ReadonlyArray<'anyDomain'|'subject'>}}
 */
const ARGUMENT_VALUES = {
    mode: ['min', 'max'],
    comparison: ['gt', 'lt'],
    aggregation: ['anyDomain', 'subject'],
};

/**
 * An enumerated argument, when it is one of its values.
 * @template {keyof typeof ARGUMENT_VALUES} K
 * @param {PlaceholderParams} params
 * @param {K} name
 * @returns {(typeof ARGUMENT_VALUES)[K][number]|null} `null` when absent or unknown.
 */
function enumParam(params, name) {
    const value = stringParam(params[name]);
    const values = /** @type {ReadonlyArray<string>} */ (ARGUMENT_VALUES[name]);
    // `includes` has just shown the value is one of the argument's own.
    return values.includes(value)
        ? /** @type {(typeof ARGUMENT_VALUES)[K][number]} */ (value)
        : null;
}

/**
 * A string argument, trimmed; `''` when absent.
 * @param {unknown} raw - The value as the template wrote it.
 * @returns {string}
 */
function stringParam(raw) {
    return typeof raw === 'string' ? raw.trim() : '';
}

/**
 * One resolved piece of a text block: literal template text, or the runs of a value a
 * placeholder resolved to, which the box highlights. A Domäne's run is linked to its
 * entry (`resolveDomainEntryKey`); any other run is plain text.
 * @typedef {{text: string} | {runs: import('@tba3/module-base/glossary').GlossaryTextRuns}} TextSegment
 */

/**
 * What a box's placeholders resolve against.
 * @typedef {object} PlaceholderContext
 * @property {string|null} [subjectName]
 * @property {string|null} [groupName]
 * @property {string} [domainId] - The Domäne of the box's Fach a `domains` repeat row is about.
 * @property {string} [locale] - From `info-boxes.json` `meta.locale`.
 * @property {{[namespace: string]: any}} [summaries] - The figures a `summary` placeholder
 *     reads by the path its template writes (`summaries[namespace][entity][field]`), which
 *     no type can follow.
 */

/**
 * The arguments every share placeholder reads (`#readShareArgs`).
 * @typedef {{target: NonNullable<ReturnType<typeof normalizeTarget>>, levelAlias: string, subjectName: string|null, domainId: import('../../utils/slQueryPrimitives.js').DomainScope}} ShareArgs
 */
/** @typedef {import('../../utils/slCompetenceShares.js').CompetenceShareQueries} CompetenceShareQueries */
/** @typedef {import('../../utils/slSelectionRanking.js').InfoBoxSelection} InfoBoxSelection */
/** @typedef {import('./infoBoxPlaceholders.js').PlaceholderParams} PlaceholderParams */

/** Names the resolver in a target warning. */
const CALLER = 'InfoBoxTextResolver';

/** The warning every share placeholder drops its block with when an argument is off. */
const INVALID_SHARE_PARAMETERS = 'missing or invalid share parameters';

/** A placeholder that cannot resolve; its message is the warning `resolveTextBlock` gives. */
class Unresolved extends Error {}

/**
 * Drop the block being resolved, with `reason` as the warning.
 * @param {string} reason
 * @returns {never}
 */
function unresolved(reason) {
    throw new Unresolved(reason);
}

class InfoBoxTextResolver {
    /** @type {CompetenceShareQueries} */
    #queries;
    /** @type {import('../../../common/services/competenceLevelPalette.js').CompetenceLevelPalette} */
    #palette;
    /** @type {import('../../../common/glossary/glossaryAnnotator.js').GlossaryAnnotator} */
    #glossary;
    /** @type {(source: string, reason: string, params: PlaceholderParams|null) => void} Reports an unresolved placeholder. */
    #warn;
    /** @type {PlaceholderContext} What the block being resolved reads `current` and `summaries` against. */
    #context = {};
    /** @type {Map<string, InfoBoxSelection>} The selections that block's placeholders recorded so far. */
    #selections = new Map();
    /**
     * Each placeholder's resolution: its text (as runs where it names a Domäne), `null`
     * to drop the block silently (an unmeasured summary field), or `unresolved(reason)`
     * to drop it with a warning.
     * @type {Record<string, (params: PlaceholderParams) => string|import('@tba3/module-base/glossary').GlossaryTextRuns|null>}
     */
    #handlers = {
        summary: (params) => this.#resolveSummary(params),
        selectShareTarget: (params) => this.#selectShareTarget(params),
        selectSubjectDomain: (params) => this.#selectSubjectDomain(params),
        share: (params) =>
            this.#subjectFigure(params, (args) =>
                this.#formatPercentage(this.#queries.getCompetenceLevelShare(args)),
            ),
        subjectShare: (params) =>
            this.#subjectFigure(params, (args) =>
                this.#formatPercentage(this.#queries.getSubjectCompetenceShare(args)),
            ),
        subjectShareGroupRange: (params) =>
            this.#subjectFigure(params, (args) =>
                this.#formatPercentageRange(
                    selections.getSubjectCompetenceShareGroupRange(this.#queries, args),
                ),
            ),
        shareRange: (params) =>
            this.#formatPercentageRange(
                selections.getCompetenceLevelShareRange(this.#queries, this.#readShareArgs(params)),
            ) ?? unresolved('share range could not be resolved'),
        listStateComparisonSubjects: (params) => {
            const aggregation =
                enumParam(params, 'aggregation') ?? unresolved(INVALID_SHARE_PARAMETERS);
            return this.#listStateComparison(params, (args) =>
                stateComparison.listSubjectsByStateComparison(this.#queries, {
                    ...args,
                    aggregation,
                }),
            );
        },
        listStateComparisonGroups: (params) =>
            this.#listStateComparison(params, (args) =>
                stateComparison.listGroupsByStateComparison(this.#queries, args),
            ),
        standardBands: (params) => this.#resolveStandardBands(params),
    };

    /**
     * @param {object} options
     * @param {CompetenceShareQueries} options.queries
     * @param {import('../../../common/services/competenceLevelPalette.js').CompetenceLevelPalette} options.palette - Expands a band alias into its levels and bands.
     * @param {import('../../../common/glossary/glossaryAnnotator.js').GlossaryAnnotator} options.glossary - Links a printed Domäne to its entry.
     * @param {(source: string, reason: string, params: PlaceholderParams|null) => void} [options.warnUnresolved]
     */
    constructor({ queries, palette, glossary, warnUnresolved }) {
        this.#queries = queries;
        this.#palette = palette;
        this.#glossary = glossary;
        this.#warn = warnUnresolved ?? (() => {});
    }

    /**
     * Fill a text block's placeholders. A block is all or nothing: one placeholder that
     * does not resolve drops the whole sentence, since a sentence with a hole in it
     * ("Dort liegen  der SuS …") still reads as a statement about the school. Every
     * drop warns, except for an unmeasured summary field (a Lösungsquote has no share).
     * @param {string} block
     * @param {PlaceholderContext} context - What `current` and `summaries` resolve against.
     * @returns {TextSegment[]|null} `null` when the block is dropped.
     */
    resolveTextBlock(block, context) {
        this.#context = context;
        this.#selections = new Map();
        /** @type {TextSegment[]} */
        const segments = [];

        for (const piece of parseInfoBoxText(block)) {
            if ('text' in piece) {
                segments.push(piece);
                continue;
            }

            const { call, source } = piece;
            const handler = call ? this.#handlers[call.name] : undefined;
            if (!call || !handler) {
                this.#warn(source, 'unknown placeholder', call?.params ?? null);
                return null;
            }

            try {
                const value = handler(call.params);
                if (value === null) return null;
                segments.push({ runs: typeof value === 'string' ? [{ text: value }] : value });
            } catch (error) {
                if (!(error instanceof Unresolved)) throw error;
                this.#warn(source, error.message, call.params);
                return null;
            }
        }

        return segments;
    }

    /**
     * Select the Domäne of the `domains` repeat row being resolved (`selectSubjectDomain`)
     * and record it under its id.
     * @param {PlaceholderParams} params
     * @returns {string|import('@tba3/module-base/glossary').GlossaryTextRuns} The selection's `field`.
     */
    #selectSubjectDomain(params) {
        const selectionId = stringParam(params.id);
        // A template never names a Fach or a Domäne: the box texts are one file for every
        // dataset, so both come from the context.
        const { subjectName, domainId } = this.#context;

        if (!selectionId || !subjectName || !domainId) {
            return unresolved('missing selectSubjectDomain id, or no domains repeat row');
        }

        const selection =
            this.#queries
                .getOrderedDomainsForSubject(subjectName)
                .find((domain) => domain.domainId === domainId) ??
            unresolved('subject domain selection could not be resolved');

        return this.#recordSelection(selectionId, selection, params);
    }

    /**
     * Pick one Lerngruppe, Fach or Fach/Domäne by its competence-level share and record it
     * under `id`, so later placeholders in the same block can say `target=selection:<id>`.
     *
     * `scope` chooses the superlative: which end of a ranking, a spread, or a distance
     * from the Landesschnitt. Every scope ranks on a competence-level share, the metric
     * the block goes on to print. The `levelAlias` may differ between the two (the alarm
     * blocks rank on `ge_medium` ascending and then print `le_medium`), so the ranking alias and the
     * printing alias are separate arguments.
     *
     * `target` is required for every scope but reaches only those that take one:
     * `subjectGroupRange` and `subjectDomainGroupRange` always rank over the whole school,
     * so a template narrowing them to one Lerngruppe gets the school-wide answer.
     * `groupInSubject` ranks within the Fach the box is shown for.
     * @param {PlaceholderParams} params - `id`, `target`, `levelAlias`, `scope`, `mode`, `field`, optionally `domainId`.
     * @returns {string|import('@tba3/module-base/glossary').GlossaryTextRuns} The requested field of the selection.
     */
    #selectShareTarget(params) {
        const selectionId = stringParam(params.id) || unresolved(INVALID_SHARE_PARAMETERS);
        const mode = enumParam(params, 'mode') ?? unresolved(INVALID_SHARE_PARAMETERS);
        const selectByScope =
            SHARE_TARGET_SCOPES[stringParam(params.scope)] ?? unresolved(INVALID_SHARE_PARAMETERS);

        const selection =
            selectByScope(this.#queries, { ...this.#readShareArgs(params), mode }) ??
            unresolved('share target selection could not be resolved');

        return this.#recordSelection(selectionId, selection, params);
    }

    /**
     * Record a selection for later placeholders in the block and print its `field`.
     * @param {string} selectionId - The id later placeholders address it by.
     * @param {InfoBoxSelection} selection
     * @param {PlaceholderParams} params - Supplies `field`.
     * @returns {string|import('@tba3/module-base/glossary').GlossaryTextRuns}
     */
    #recordSelection(selectionId, selection, params) {
        this.#selections.set(selectionId, selection);
        return (
            this.#formatSelectionField(selection, stringParam(params.field)) ??
            unresolved('selection field could not be resolved')
        );
    }

    /**
     * The arguments every share placeholder reads: its population, the levels a band alias
     * names, and the Fach and Domäne. A `selection:<id>` target lends its own Fach and
     * Domäne; without one the Fach is the one the box is shown for.
     * @param {PlaceholderParams} params
     * @returns {ShareArgs}
     */
    #readShareArgs(params) {
        const selection = this.#selectionReference(params.target);
        const target = this.#resolvePlaceholderTarget(params.target, selection);
        const levelAlias = params.levelAlias;
        if (!target || !this.#queries.getAliasLevels(levelAlias)?.length) {
            return unresolved(INVALID_SHARE_PARAMETERS);
        }
        return {
            target,
            levelAlias: /** @type {string} */ (levelAlias),
            subjectName: selection?.subjectName ?? this.#context.subjectName ?? null,
            domainId: this.#resolvePlaceholderDomainId(params.domainId, selection),
        };
    }

    /**
     * A figure for one Fach, dropped with a warning when it cannot be resolved.
     * @param {PlaceholderParams} params
     * @param {(args: ShareArgs & {subjectName: string}) => string|null} figure - Queries and formats it.
     * @returns {string}
     */
    #subjectFigure(params, figure) {
        return (
            figure(this.#readSubjectShareArgs(params)) ??
            unresolved('share value could not be resolved')
        );
    }

    /**
     * The share arguments of a figure for one Fach: they must name one.
     * @param {PlaceholderParams} params
     * @returns {ShareArgs & {subjectName: string}}
     */
    #readSubjectShareArgs(params) {
        const args = this.#readShareArgs(params);
        if (!args.subjectName) return unresolved(INVALID_SHARE_PARAMETERS);
        // Checked just above: the arguments name a Fach.
        return /** @type {ShareArgs & {subjectName: string}} */ (args);
    }

    /**
     * Name the competence bands a band alias is bounded by, for the parenthetical a standard
     * is spelled out in: "den Regelstandard oder höher (≥ III bzw. B1)".
     *
     * Read from the loaded scales, so one `info-boxes.json` serves every dataset:
     * `III bzw. B1` says nothing on a `KS 1…KS 5` ladder.
     *
     * Renders bands only, never the comparison operator: `≥` and `<` stay in the German
     * around the placeholder, so one placeholder serves "oder höher" and "unterhalb".
     * @param {PlaceholderParams} params - Reads `levelAlias`.
     * @returns {string}
     */
    #resolveStandardBands(params) {
        const bands =
            formatStandardBands(this.#palette, params.levelAlias) ??
            unresolved('missing or invalid standardBands parameters');
        // No loaded scale tags that band (a GER ladder stopping at B1 cannot answer
        // `e_high`): drop the sentence with a warning rather than render
        // "Der Optimalstandard () …".
        return bands || unresolved('no loaded competence scale tags that band');
    }

    /**
     * The Fächer or groups above or below the Landesschnitt, as a list
     * (`listStateComparisonSubjects`, `listStateComparisonGroups`).
     * @param {PlaceholderParams} params
     * @param {(args: ShareArgs & {comparison: 'gt'|'lt'}) => string[]|null} list - The names on the requested side; `null` when the payload has no single Landesschnitt.
     * @returns {string} The list, or the `empty` label for none.
     */
    #listStateComparison(params, list) {
        const comparison = enumParam(params, 'comparison') ?? unresolved(INVALID_SHARE_PARAMETERS);
        const emptyLabel = stringParam(params.empty) || unresolved(INVALID_SHARE_PARAMETERS);
        const names =
            list({ ...this.#readShareArgs(params), comparison }) ??
            unresolved('the payload delivers no single Landesschnitt');
        return this.#formatLabelList(names, emptyLabel);
    }

    /**
     * A summary field the host put in the context: `summaries[namespace][field]`, or with
     * `entity` `summaries[namespace][entity][field]`.
     * @param {PlaceholderParams} params - `namespace`, optionally `entity`, `field`, `format`.
     * @returns {string|null} `null` when there is nothing to show.
     */
    #resolveSummary(params) {
        const namespace = stringParam(params.namespace);
        const entityName = stringParam(params.entity);
        const field = stringParam(params.field);

        if (!namespace || !field) return unresolved('missing or invalid summary parameters');

        const summary = this.#context.summaries?.[namespace];
        const record = entityName ? summary?.[entityName] : summary;
        const value = record?.[field];
        if (typeof value === 'string') {
            return value.trim() || null;
        }

        if (!Number.isFinite(value)) {
            return null;
        }

        return (
            this.#formatNumber(value, stringParam(params.format)) ??
            unresolved('a numeric summary field needs format=percent|integer|decimal')
        );
    }

    /**
     * The selection a `selection:<id>` argument points at, or nothing for any other value.
     * @param {unknown} value - The argument as the template wrote it.
     * @returns {InfoBoxSelection|null} The selection recorded earlier in this text, if any.
     */
    #selectionReference(value) {
        const selectionMatch = stringParam(value).match(/^selection:(.+)$/);
        return selectionMatch ? (this.#selections.get(selectionMatch[1].trim()) ?? null) : null;
    }

    /**
     * The population a placeholder argument names: `school`, `group:current`, or
     * `selection:<id>` pointing at one resolved earlier in the same text.
     * @param {unknown} targetValue - The argument as the template wrote it.
     * @param {InfoBoxSelection|null} selection - The selection a `selection:<id>` argument points at.
     * @returns {ReturnType<typeof normalizeTarget>} `null` when none resolves.
     */
    #resolvePlaceholderTarget(targetValue, selection) {
        const rawTarget = stringParam(targetValue);
        if (rawTarget === 'school') {
            return normalizeTarget('school', CALLER);
        }

        if (rawTarget === 'group:current') {
            const groupName = this.#context.groupName;
            return groupName ? normalizeTarget(groupName, CALLER) : null;
        }

        if (rawTarget.startsWith('selection:')) {
            const target = selection?.target ?? selection?.groupName ?? null;
            return target ? normalizeTarget(target, CALLER) : null;
        }

        return null;
    }

    /**
     * One text field of a recorded selection.
     * @param {InfoBoxSelection} selection
     * @param {string} field - The field: `subjectDomainLabel` or one of `SELECTION_TEXT_FIELDS`.
     * @returns {string|import('@tba3/module-base/glossary').GlossaryTextRuns|null} The text, a Domäne as runs; `null` for an unknown or missing field.
     */
    #formatSelectionField(selection, field) {
        if (field === 'subjectDomainLabel') {
            return this.#formatSubjectDomainSelectionLabel(selection);
        }
        if (!SELECTION_TEXT_FIELDS.includes(field) || typeof selection[field] !== 'string') {
            return null;
        }
        return field === 'domainName'
            ? [{ text: selection[field], glossaryKey: this.#domainEntryKey(selection) }]
            : selection[field];
    }

    /**
     * The entry for a selection's Domäne of its Fach: a Domäne's name names one of
     * several Fächer, so it is never matched as a term.
     * @param {InfoBoxSelection} selection
     * @returns {string|null}
     */
    #domainEntryKey(selection) {
        return this.#glossary.resolveDomainEntryKey(selection.domainId, selection.subjectName);
    }

    /**
     * The Domänen a placeholder reads, decided here once: the Domäne its selection
     * recorded (`null` for a Fach without Domänen), or `ALL_DOMAINS` when the selection
     * recorded none — a Fach ranked with its Domänen pooled, or no selection at all.
     * @param {unknown} value - The argument as the template wrote it: `selection:<id>`.
     * @param {InfoBoxSelection|null} selection - The placeholder's own selection, used when the argument is absent.
     * @returns {import('../../utils/slQueryPrimitives.js').DomainScope}
     */
    #resolvePlaceholderDomainId(value, selection) {
        const rawValue = stringParam(value);
        // Like the Fach, a Domäne is never named literally: a template points at one
        // another placeholder in the same text selected.
        const source = rawValue ? this.#selectionReference(rawValue) : selection;

        return source && Object.hasOwn(source, 'domainId')
            ? (source.domainId ?? null)
            : ALL_DOMAINS;
    }

    /**
     * A share as a percentage in the document's locale.
     * @param {number|null} value - The share, 0–1.
     * @returns {string|null}
     */
    #formatPercentage(value) {
        if (value === null) {
            return null;
        }

        // Not `formatShare`: info-boxes.json may carry a `meta.locale`, which decides
        // the separator and the space before the sign.
        return getNumberFormat(
            { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 },
            this.#context.locale,
        ).format(value);
    }

    /**
     * A share range as `min–max` percentages.
     * @param {import('../../utils/slSelectionRanking.js').FiniteRange|null} range
     * @returns {string|null}
     */
    #formatPercentageRange(range) {
        return range
            ? `${this.#formatPercentage(range.min)}–${this.#formatPercentage(range.max)}`
            : null;
    }

    /**
     * Names as a locale-formatted list.
     * @param {string[]} values
     * @param {string} emptyLabel - What to write for no names.
     * @returns {string}
     */
    #formatLabelList(values, emptyLabel) {
        const items = values.map((value) => value.trim()).filter(Boolean);

        return items.length === 0 ? emptyLabel : getListFormat(this.#context.locale).format(items);
    }

    /**
     * A Fach/Domäne selection as `Fach (Domäne)`, or the Fach alone when the names agree.
     * @param {InfoBoxSelection} selection
     * @returns {string|import('@tba3/module-base/glossary').GlossaryTextRuns|null} `null` without a Fach; runs, the Domäne's linked, with a Domäne.
     */
    #formatSubjectDomainSelectionLabel(selection) {
        if (typeof selection.subjectName !== 'string') {
            return null;
        }

        const subjectName = selection.subjectName.trim();
        const domainName =
            typeof selection.domainName === 'string' ? selection.domainName.trim() : '';

        if (!domainName || domainName === subjectName) {
            return subjectName;
        }

        return [
            { text: `${subjectName} (` },
            { text: domainName, glossaryKey: this.#domainEntryKey(selection) },
            { text: ')' },
        ];
    }

    /**
     * A summary number in the format the placeholder names.
     * @param {number} value
     * @param {string} format - `percent`, `integer` or `decimal`.
     * @returns {string|null} `null` for an unknown format.
     */
    #formatNumber(value, format) {
        const locale = this.#context.locale;
        switch (format) {
            case 'percent':
                return this.#formatPercentage(value);
            case 'integer':
                return getNumberFormat(INTEGER_FORMAT, locale).format(value);
            case 'decimal':
                return getNumberFormat(DECIMAL_FORMAT, locale).format(value);
            default:
                return null;
        }
    }
}

export { InfoBoxTextResolver };
