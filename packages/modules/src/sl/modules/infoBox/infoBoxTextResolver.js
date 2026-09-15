import { emptySlData } from '../../slData.js';
import { CompetenceShareQueries } from '../../utils/slCompetenceShares.js';
import * as selections from './infoBoxShareSelections.js';
import * as stateComparison from './infoBoxStateComparison.js';
import { resolveInfoBoxTextPlaceholders } from './infoBoxPlaceholders.js';
import { normalizeTarget } from '../../utils/slQueryPrimitives.js';
import {
    formatStandardBands,
    resolveCompetenceLevelRankAlias,
} from '../../utils/slCompetenceLevels.js';
import { normalizeDataSubjectName } from '../../utils/slSubjectConfig.js';
import { getNumberFormat } from '../../../common/utils/numberFormat.js';

const SKIP_BLOCK_TOKEN = '__INFO_BOX_SKIP_BLOCK__';
const VALUE_MARKER_OPEN = '__INFO_BOX_VALUE_OPEN__';
const VALUE_MARKER_CLOSE = '__INFO_BOX_VALUE_CLOSE__';

/**
 * A placeholder's boolean argument. Every value arrives as an unquoted string out of
 * `parseInfoBoxPlaceholderParams`, and an author writing `skipBlock=True` must not get the
 * opposite of what they asked for — so this is one shared reading rather than one per
 * handler.
 * @param {string|undefined} raw - The value as the template wrote it.
 * @returns {boolean} `false` for anything that is not literally "true"
 */
function parseBooleanParam(raw) {
    return (
        String(raw ?? 'false')
            .trim()
            .toLowerCase() === 'true'
    );
}

/**
 * A string argument, trimmed; `''` when absent.
 * @param {*} raw - The value as the template wrote it.
 * @returns {string} The trimmed value.
 */
function stringParam(raw) {
    return typeof raw === 'string' ? raw.trim() : '';
}

/** @typedef {{ selections: Map<string, any> }} ResolutionState */

class InfoBoxTextResolver {
    #moduleId;
    /** @type {CompetenceShareQueries|null} */
    #queries;
    #slData;
    #placeholderContextProvider;
    #warnUnresolved;

    /**
     * @param {object} options - The resolver's collaborators.
     * @param {string} [options.moduleId] - Names the box in warnings.
     * @param {CompetenceShareQueries} [options.queries] - The share queries; built over `slData` when absent.
     * @param {import('../../slData.js').SlData} [options.slData] - The data port the queries read.
     * @param {() => (Record<string, any>|null)} options.getPlaceholderContext - The box's current context.
     * @param {(source: string, reason: string, params: object|null) => void} [options.warnUnresolved] - Reports a placeholder that did not resolve.
     */
    constructor({ moduleId, queries, slData, getPlaceholderContext, warnUnresolved }) {
        this.#moduleId = moduleId ?? 'unknown';
        this.#queries = queries ?? null;
        this.#slData = slData ?? emptySlData();
        this.#placeholderContextProvider = getPlaceholderContext;
        this.#warnUnresolved = warnUnresolved ?? (() => {});
    }

    /**
     * Fill a text block's placeholders.
     * @param {string} block - The template text.
     * @returns {string|null} The text, or `null` when a `skipBlock` placeholder resolved to nothing.
     */
    resolveTextBlock(block) {
        const resolvedText = resolveInfoBoxTextPlaceholders({
            text: String(block ?? ''),
            resolvePlaceholder: (parsed, { resolutionState }) =>
                this.#resolvePlaceholderForRender(parsed, resolutionState),
        });

        return resolvedText.includes(SKIP_BLOCK_TOKEN) ? null : resolvedText;
    }

    /**
     * The share queries, built lazily so a box constructed before its data arrived still
     * reads the port that was passed.
     * @returns {CompetenceShareQueries} The queries.
     */
    #getQueries() {
        if (!this.#queries) {
            this.#queries = new CompetenceShareQueries({
                moduleId: this.#moduleId,
                slData: this.#slData,
            });
        }

        return this.#queries;
    }

    #resolvePlaceholderForRender(parsed, resolutionState) {
        const resolvedValue = this.#resolvePlaceholder(parsed, resolutionState);
        if (!resolvedValue || resolvedValue === SKIP_BLOCK_TOKEN) {
            return resolvedValue;
        }

        return `${VALUE_MARKER_OPEN}${resolvedValue}${VALUE_MARKER_CLOSE}`;
    }

    /**
     * Dispatch one parsed placeholder to its handler; an unknown name resolves to nothing
     * and stays visible in the text.
     * @param {{name: string, params: object, source: string}} parsed - The placeholder.
     * @param {ResolutionState} resolutionState - This resolution pass's state.
     * @returns {string|null} The replacement, `''` for a selection-only placeholder, or `null`.
     */
    #resolvePlaceholder({ name, params, source }, resolutionState) {
        switch (name) {
            case 'summaryContext':
                return this.#resolveSummaryContextPlaceholder(params, source);
            case 'summaryEntity':
                return this.#resolveSummaryEntityPlaceholder(params, source);
            case 'selectShareTarget':
                return this.#resolveShareTargetSelectionPlaceholder(
                    params,
                    source,
                    resolutionState,
                );
            case 'selectSubjectDomain':
                return this.#resolveSubjectDomainSelectionPlaceholder(
                    params,
                    source,
                    resolutionState,
                );
            case 'share':
                return this.#resolveSharePlaceholder(params, source, resolutionState);
            case 'subjectShare':
                return this.#resolveSubjectSharePlaceholder(params, source, resolutionState);
            case 'shareRange':
                return this.#resolveShareRangePlaceholder(params, source, resolutionState);
            case 'subjectShareClassRange':
                return this.#resolveSubjectShareClassRangePlaceholder(
                    params,
                    source,
                    resolutionState,
                );
            case 'listStateComparisonSubjects':
                return this.#resolveStateComparisonSubjectListPlaceholder(
                    params,
                    source,
                    resolutionState,
                );
            case 'listStateComparisonClasses':
                return this.#resolveStateComparisonClassListPlaceholder(
                    params,
                    source,
                    resolutionState,
                );
            case 'standardBands':
                return this.#resolveStandardBandsPlaceholder(params, source);
            default:
                return null;
        }
    }

    #resolveSubjectDomainSelectionPlaceholder(params, source, resolutionState) {
        const selectionId = stringParam(params.id);
        const subjectName = this.#resolvePlaceholderSubjectName(params.subjectName ?? 'current');
        const order = Number.parseInt(stringParam(params.order), 10);
        const skipBlock = parseBooleanParam(params.skipBlock);

        if (!selectionId || !subjectName || !Number.isInteger(order) || order < 1) {
            this.#warn(source, 'missing or invalid selectSubjectDomain parameters', params);
            return skipBlock ? SKIP_BLOCK_TOKEN : null;
        }

        const selection = selections.selectSubjectDomainByOrder(this.#getQueries(), {
            subjectName,
            order,
            multiDomainOnly: parseBooleanParam(params.multiDomainOnly),
        });

        if (!selection) {
            this.#warn(source, 'subject domain selection could not be resolved', params);
            return skipBlock ? SKIP_BLOCK_TOKEN : null;
        }

        resolutionState.selections.set(selectionId, selection);

        const field = stringParam(params.field);
        if (!field) {
            return '';
        }

        const fieldValue = this.#formatSelectionField(selection, field);
        if (fieldValue === null) {
            this.#warn(source, 'subject domain field could not be resolved', params);
            return skipBlock ? SKIP_BLOCK_TOKEN : null;
        }

        return fieldValue;
    }

    /**
     * Pick one Klasse, Fach or Fach/Domäne by its competence-level share and record it
     * under `id`, so later placeholders in the same block can say `target=selection:<id>`.
     *
     * `scope` chooses the superlative — which end of a ranking, a spread, or a distance
     * from the Landesschnitt. Every scope ranks on a competence-level share, the same
     * *metric* the block goes on to print, which is the point: selecting on one metric and
     * reporting another is what the Lösungsquoten placeholders used to do. The `levelAlias`
     * may still differ — the alarm blocks rank on `ge_3` ascending and then print `le_3`,
     * because "die schwächste" and "wie viele höchstens auf …" are two readings of the same
     * weakness — so ranking alias and printing alias are deliberately separate arguments.
     *
     * `target` is required for every scope but reaches only those that take one:
     * `subjectClassRange` and `subjectDomainClassRange` always rank over the whole school,
     * so a template narrowing them to one Klasse gets the school-wide answer.
     * @param {object} params - The placeholder's arguments: `id`, `target`, `levelAlias`, `scope`, `mode`, `field`.
     * @param {string} source - The template path, for the warning when it cannot resolve.
     * @param {ResolutionState} resolutionState - This resolution pass's state.
     * @returns {string|null} The requested field of the selection, `''` when none was asked for, or `null` when nothing resolved.
     */
    #resolveShareTargetSelectionPlaceholder(params, source, resolutionState) {
        const selectionId = stringParam(params.id);
        const target = this.#resolvePlaceholderTarget(params.target, resolutionState);
        const levelNames = this.#resolvePlaceholderLevelNames(params.levelAlias);
        const mode = stringParam(params.mode ?? 'max').toLowerCase();
        const scope = stringParam(params.scope);

        if (!selectionId || !target || levelNames.length === 0 || !scope) {
            this.#warn(source, 'missing or invalid selectShareTarget parameters', params);
            return null;
        }

        const queries = this.#getQueries();
        let selection = null;
        if (scope === 'classMean') {
            selection = selections.selectClassByMeanShare(queries, { target, levelNames, mode });
        } else if (scope === 'classRange') {
            selection = selections.selectClassBySubjectShareRange(queries, {
                target,
                levelNames,
                mode,
            });
        } else if (scope === 'subjectDomainShare') {
            selection = selections.selectSubjectDomainByShare(queries, {
                target,
                levelNames,
                mode,
            });
        } else if (scope === 'subjectClassRange') {
            selection = selections.selectSubjectByShareClassRange(queries, { levelNames, mode });
        } else if (scope === 'subjectDomainClassRange') {
            selection = selections.selectSubjectDomainByShareClassRange(queries, {
                levelNames,
                mode,
            });
        } else if (scope === 'subjectStateDiff') {
            selection = stateComparison.selectSubjectByStateShareDiff(queries, {
                target,
                levelNames,
                mode,
            });
        } else if (scope === 'classInSubject') {
            const subjectName = this.#resolvePlaceholderSubjectName(
                params.subjectName ?? 'current',
            );
            if (!subjectName) {
                this.#warn(
                    source,
                    'missing or invalid selectShareTarget subject parameters',
                    params,
                );
                return null;
            }

            selection = selections.selectClassBySubjectShare(queries, {
                target,
                levelNames,
                subjectName,
                ...this.#optionalDomainParam(
                    this.#resolvePlaceholderDomainId(params.domainId, null, resolutionState),
                ),
                mode,
            });
        }

        if (!selection) {
            this.#warn(source, 'share target selection could not be resolved', params);
            return null;
        }

        resolutionState.selections.set(selectionId, selection);

        const field = stringParam(params.field);
        if (!field) {
            return '';
        }

        const fieldValue = this.#formatSelectionField(selection, field);
        if (fieldValue === null) {
            this.#warn(source, 'selection field could not be resolved', params);
        }

        return fieldValue;
    }

    #resolveSharePlaceholder(params, source, resolutionState) {
        const { target, subjectName, domainId, levelNames } = this.#resolveMetricPlaceholderContext(
            params,
            resolutionState,
        );

        if (!target || !subjectName || levelNames.length === 0) {
            this.#warn(source, 'missing or invalid share parameters', params);
            return null;
        }

        const share = this.#getQueries().getCompetenceLevelShare({
            target,
            levelNames,
            subjectName,
            ...this.#optionalDomainParam(domainId),
        });

        if (share === null) {
            this.#warn(source, 'share value could not be resolved', params);
            return null;
        }

        return this.#formatPercentageValue(share);
    }

    #resolveSubjectSharePlaceholder(params, source, resolutionState) {
        const { target, subjectName, domainId, levelNames } = this.#resolveMetricPlaceholderContext(
            { target: 'school', subjectName: 'current', ...params },
            resolutionState,
        );

        if (!target || !subjectName || levelNames.length === 0) {
            this.#warn(source, 'missing or invalid subjectShare parameters', params);
            return null;
        }

        const share = this.#getQueries().getSubjectCompetenceShare({
            target,
            levelNames,
            subjectName,
            ...this.#optionalDomainParam(domainId),
        });

        if (share === null) {
            this.#warn(source, 'subject share could not be resolved', params);
            return null;
        }

        return this.#formatPercentageValue(share);
    }

    /**
     * Name the competence bands a rank alias starts at, for the parenthetical a standard
     * is spelled out in: "den Regelstandard oder höher (≥ III bzw. B1)".
     *
     * Those parentheses used to be typed into `info_boxes.json`, which pinned the file to
     * the demo fixture's scales — `III bzw. B1` says nothing on Nordrhein-Westfalen's
     * `KS 1…KS 5`. Reading them from the loaded scales is what lets one file serve every
     * dataset.
     *
     * Renders bands only, never the comparison operator: `≥` and `<` stay in the German
     * around the placeholder, so one placeholder serves "oder höher" and "unterhalb".
     * @param {object} params - The placeholder's arguments: the rank alias and whether to suppress the surrounding block when it resolves to nothing.
     * @param {string} source - The template path, for the warning when it cannot resolve.
     * @returns {string|null} The bands, or `null` when the loaded scales name none for that rank.
     */
    #resolveStandardBandsPlaceholder(params, source) {
        const skipBlock = parseBooleanParam(params.skipBlock);
        const bands = formatStandardBands(params.levelAlias);

        if (bands === null) {
            this.#warn(source, 'missing or invalid standardBands parameters', params);
            return skipBlock ? SKIP_BLOCK_TOKEN : null;
        }

        if (bands === '') {
            // No loaded scale has a level of that rank — a GER ladder stopping at B1 cannot
            // answer `e_5`. Rendering "Der Optimalstandard () …" would be worse than dropping
            // the sentence, but the drop still has to be audible: the share placeholder that
            // would warn for the same alias lives in this block's `sublist`, and
            // `InfoBoxModule#createResolvedTextEntry` returns before building the sublist
            // once the text resolves to null — so nothing else reports it.
            this.#warn(source, 'no loaded competence scale has a level of that rank', params);
            return skipBlock ? SKIP_BLOCK_TOKEN : null;
        }

        return bands;
    }

    #resolveShareRangePlaceholder(params, source, resolutionState) {
        const target = this.#resolvePlaceholderTarget(params.target, resolutionState);
        const levelNames = this.#resolvePlaceholderLevelNames(params.levelAlias);

        if (!target || levelNames.length === 0) {
            this.#warn(source, 'missing or invalid shareRange parameters', params);
            return null;
        }

        const range = selections.getCompetenceLevelShareRange(this.#getQueries(), {
            target,
            levelNames,
        });

        if (!range) {
            this.#warn(source, 'share range could not be resolved', params);
            return null;
        }

        return this.#formatPercentageRange(range);
    }

    #resolveSubjectShareClassRangePlaceholder(params, source, resolutionState) {
        const { target, subjectName, domainId, levelNames } = this.#resolveMetricPlaceholderContext(
            { target: 'school', subjectName: 'current', ...params },
            resolutionState,
        );

        if (!target || !subjectName || levelNames.length === 0) {
            this.#warn(source, 'missing or invalid subjectShareClassRange parameters', params);
            return null;
        }

        const range = selections.getSubjectCompetenceShareClassRange(this.#getQueries(), {
            target,
            levelNames,
            subjectName,
            ...this.#optionalDomainParam(domainId),
        });

        if (!range) {
            this.#warn(source, 'subject class share range could not be resolved', params);
            return null;
        }

        return this.#formatPercentageRange(range);
    }

    #resolveStateComparisonSubjectListPlaceholder(params, source, resolutionState) {
        const target = this.#resolvePlaceholderTarget(params.target ?? 'school', resolutionState);
        const levelNames = this.#resolvePlaceholderLevelNames(params.levelAlias);
        const comparison = stringParam(params.comparison ?? 'gt').toLowerCase();
        const aggregation = stringParam(params.aggregation ?? 'anyDomain');

        if (!target || levelNames.length === 0 || !comparison || !aggregation) {
            this.#warn(source, 'missing or invalid listStateComparisonSubjects parameters', params);
            return null;
        }

        const subjectNames = stateComparison.listSubjectsByStateComparison(this.#getQueries(), {
            target,
            levelNames,
            comparison,
            aggregation,
        });

        return this.#formatLabelList(subjectNames, 'keinem Fach');
    }

    #resolveStateComparisonClassListPlaceholder(params, source, resolutionState) {
        const target = this.#resolvePlaceholderTarget(params.target ?? 'school', resolutionState);
        const levelNames = this.#resolvePlaceholderLevelNames(params.levelAlias);
        const comparison = stringParam(params.comparison ?? 'gt').toLowerCase();

        if (!target || levelNames.length === 0 || !comparison) {
            this.#warn(source, 'missing or invalid listStateComparisonClasses parameters', params);
            return null;
        }

        const classNames = stateComparison.listClassesByStateComparison(this.#getQueries(), {
            target,
            levelNames,
            comparison,
            subjectName: this.#resolvePlaceholderSubjectName(params.subjectName),
        });

        return this.#formatLabelList(classNames, 'keine Klasse');
    }

    #resolveSummaryContextPlaceholder(params, source) {
        const namespace = stringParam(params.namespace);
        const field = stringParam(params.field);
        const skipBlock = parseBooleanParam(params.skipBlock);

        if (!namespace || !field) {
            this.#warn(source, 'missing or invalid summaryContext parameters', params);
            return skipBlock ? SKIP_BLOCK_TOKEN : null;
        }

        const context = this.#getPlaceholderContext()?.summaries?.[namespace]?.context;
        const formattedValue = this.#formatSummaryValue(context?.[field], params.format);

        return formattedValue ?? (skipBlock ? SKIP_BLOCK_TOKEN : null);
    }

    #resolveSummaryEntityPlaceholder(params, source) {
        const namespace = stringParam(params.namespace);
        const entityName = stringParam(params.entity);
        const field = stringParam(params.field);
        const skipBlock = parseBooleanParam(params.skipBlock);

        if (!namespace || !entityName || !field) {
            this.#warn(source, 'missing or invalid summaryEntity parameters', params);
            return skipBlock ? SKIP_BLOCK_TOKEN : null;
        }

        const entity =
            this.#getPlaceholderContext()?.summaries?.[namespace]?.entities?.[entityName];
        const formattedValue = this.#formatSummaryValue(entity?.[field], params.format);

        return formattedValue ?? (skipBlock ? SKIP_BLOCK_TOKEN : null);
    }

    /**
     * The selection a `selection:<id>` argument points at, or nothing for any other value.
     * @param {*} value - The argument as the template wrote it.
     * @param {ResolutionState} resolutionState - This resolution pass's state.
     * @returns {Record<string, any>|null} The selection recorded earlier in this text, if any.
     */
    #resolveSelectionReference(value, resolutionState) {
        const selectionMatch = stringParam(value).match(/^selection:(.+)$/i);
        return selectionMatch
            ? (resolutionState.selections.get(selectionMatch[1].trim()) ?? null)
            : null;
    }

    /**
     * The population a placeholder argument names: `school`, `class:current`, or
     * `selection:<id>` pointing at one resolved earlier in the same text.
     * @param {*} targetValue - The argument as the template wrote it.
     * @param {ResolutionState} resolutionState - This resolution pass's state.
     * @returns {ReturnType<typeof normalizeTarget>} The normalised target, or `null` when none resolves.
     */
    #resolvePlaceholderTarget(targetValue, resolutionState) {
        const rawTarget = stringParam(targetValue).toLowerCase();
        if (rawTarget === 'school') {
            return normalizeTarget('school', this.#moduleId);
        }

        if (rawTarget === 'class:current') {
            const className = this.#getPlaceholderContext()?.className;
            return className ? normalizeTarget(className, this.#moduleId) : null;
        }

        if (rawTarget.startsWith('selection:')) {
            const selection = this.#resolveSelectionReference(targetValue, resolutionState);
            const target = selection?.target ?? selection?.className ?? null;
            return target ? normalizeTarget(target, this.#moduleId) : null;
        }

        return null;
    }

    /**
     * Target, Fach, Domäne and levels of a share placeholder. A `selection:<id>` target
     * lends its own Fach and Domäne to an argument the template left out.
     * @param {object} params - The placeholder's arguments, defaults already applied.
     * @param {ResolutionState} resolutionState - This resolution pass's state.
     * @returns {{target: ReturnType<typeof normalizeTarget>, subjectName: string|null, domainId: string|null|undefined, levelNames: string[]}} The resolved context.
     */
    #resolveMetricPlaceholderContext(params, resolutionState) {
        const targetSelection = this.#resolveSelectionReference(params.target, resolutionState);

        return {
            target: this.#resolvePlaceholderTarget(params.target, resolutionState),
            subjectName: this.#resolvePlaceholderSubjectName(params.subjectName, targetSelection),
            domainId: this.#resolvePlaceholderDomainId(
                params.domainId,
                targetSelection,
                resolutionState,
            ),
            levelNames: this.#resolvePlaceholderLevelNames(params.levelAlias),
        };
    }

    #optionalDomainParam(domainId) {
        return domainId !== undefined ? { domainId } : {};
    }

    #formatSelectionField(selection, field) {
        switch (field) {
            case 'className':
                return typeof selection.className === 'string' ? selection.className : null;
            case 'subjectName':
                return typeof selection.subjectName === 'string' ? selection.subjectName : null;
            case 'domainName':
                return typeof selection.domainName === 'string' ? selection.domainName : null;
            case 'subjectDomainLabel':
                return this.#formatSubjectDomainSelectionLabel(selection);
            default:
                return null;
        }
    }

    /**
     * The Fach a placeholder argument names: `current`, the Fach the box is shown for;
     * absent, the Fach of the placeholder's own selection.
     * @param {*} value - The argument as the template wrote it.
     * @param {Record<string, any>|null} [selection] - The placeholder's own selection.
     * @returns {string|null} The normalised Fach name, or `null` when none resolves.
     */
    #resolvePlaceholderSubjectName(value, selection = null) {
        const rawValue = stringParam(value);
        if (!rawValue) {
            return normalizeDataSubjectName(selection?.subjectName ?? null);
        }

        // A template never names a Fach: the box texts are one file for every dataset, and
        // a Fach typed into one would only resolve where that Fach happens to exist.
        return rawValue.toLowerCase() === 'current'
            ? normalizeDataSubjectName(this.#getPlaceholderContext()?.subjectName)
            : null;
    }

    /**
     * The Domäne a placeholder argument names. Tri-state like the query helpers:
     * `undefined` infers, an explicit `null` means the whole Fach.
     * @param {*} value - The argument as the template wrote it: `selection:<id>`.
     * @param {Record<string, any>|null} selection - The placeholder's own selection, used when the argument is absent.
     * @param {ResolutionState} resolutionState - This resolution pass's state.
     * @returns {string|null|undefined} The Domäne id, `null` for the whole Fach, or `undefined` to infer.
     */
    #resolvePlaceholderDomainId(value, selection, resolutionState) {
        const rawValue = stringParam(value);
        // Like the Fach above, a Domäne is never named literally — a template points at a
        // Domäne another placeholder in the same text already selected.
        const source = rawValue
            ? this.#resolveSelectionReference(rawValue, resolutionState)
            : selection;

        return source && Object.hasOwn(source, 'domainId') ? source.domainId : undefined;
    }

    #resolvePlaceholderLevelNames(levelAlias) {
        return resolveCompetenceLevelRankAlias(levelAlias) ?? [];
    }

    #formatPercentageValue(value) {
        const formatter = getNumberFormat(
            { minimumFractionDigits: 1, maximumFractionDigits: 1 },
            this.#locale(),
        );

        return `${formatter.format(value * 100)}%`;
    }

    #formatPercentageRange(range) {
        return `${this.#formatPercentageValue(range.minShare)}-${this.#formatPercentageValue(range.maxShare)}`;
    }

    #formatDecimalValue(value) {
        return getNumberFormat(
            { minimumFractionDigits: 2, maximumFractionDigits: 2 },
            this.#locale(),
        ).format(value);
    }

    #formatIntegerValue(value) {
        return getNumberFormat({ maximumFractionDigits: 0 }, this.#locale()).format(value);
    }

    #locale() {
        return this.#getPlaceholderContext()?.locale ?? 'de-DE';
    }

    #formatLabelList(values, emptyLabel) {
        const items = values.map((value) => value.trim()).filter(Boolean);

        if (items.length === 0) {
            return emptyLabel;
        }

        if (items.length === 1) {
            return items[0];
        }

        return `${items.slice(0, -1).join(', ')} und ${items[items.length - 1]}`;
    }

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

        return `${subjectName} (${domainName})`;
    }

    /**
     * A summary field as text: a string as written, a number in the requested `format`
     * (`percent`, `integer`, `decimal`, or by whether it is whole).
     * @param {*} value - The field's value.
     * @param {*} format - The placeholder's `format` argument.
     * @returns {string|null} The text, or `null` for nothing to show.
     */
    #formatSummaryValue(value, format) {
        if (typeof value === 'string') {
            return value.trim() || null;
        }

        if (!Number.isFinite(value)) {
            return null;
        }

        switch (stringParam(format).toLowerCase()) {
            case 'percent':
                return this.#formatPercentageValue(value);
            case 'integer':
                return this.#formatIntegerValue(value);
            case 'decimal':
                return this.#formatDecimalValue(value);
            default:
                return Number.isInteger(value)
                    ? this.#formatIntegerValue(value)
                    : this.#formatDecimalValue(value);
        }
    }

    #getPlaceholderContext() {
        return this.#placeholderContextProvider();
    }

    /**
     * Report an unresolved placeholder.
     * @param {string} source - The template path the placeholder sits in.
     * @param {string} reason - Why it did not resolve.
     * @param {object} params - The placeholder's arguments, for the message.
     */
    #warn(source, reason, params) {
        this.#warnUnresolved(source, reason, params);
    }
}

export { InfoBoxTextResolver };
export { VALUE_MARKER_CLOSE, VALUE_MARKER_OPEN };
