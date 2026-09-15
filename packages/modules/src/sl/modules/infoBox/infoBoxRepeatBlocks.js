/**
 * Repeat-block expansion for the SL info boxes: a `{repeat, template, filter}` block is
 * rolled out once per Klasse or once per Fach, each copy with the `[[token]]`s of its
 * template substituted and a placeholder-context override for that iteration.
 *
 * Pure over its inputs. The only state it reads is the `SlData` port and the current
 * placeholder context (for the `current` keyword in a filter), both passed in.
 */

import { buildCompetenceLevelIndex, deriveClassNames } from '../../slCompetenceLevelIndex.js';
import {
    getSubjectShortDisplayName,
    normalizeDataSubjectName,
} from '../../utils/slSubjectConfig.js';

const REPEAT_TEMPLATE_TOKEN_PATTERN = /\[\[\s*([a-zA-Z][a-zA-Z0-9]*)\s*\]\]/g;

/**
 * Whether a block is a repeat block: a plain object with a string `repeat` and `template`.
 * @param {*} block - Any block of a section.
 * @returns {boolean} True for a repeat block.
 */
export function isRepeatBlockDefinition(block) {
    return Boolean(
        block &&
        typeof block === 'object' &&
        typeof block.repeat === 'string' &&
        typeof block.template === 'string',
    );
}

/**
 * Roll a repeat block out into one text block per matching Klasse or Fach.
 *
 * `repeat: 'classes'` takes a `filter.subjectName` (the Klassen that sat that Fach),
 * `repeat: 'subjects'` a `filter.className` (the Fächer that Klasse sat); each is a
 * literal or `current`, read from the placeholder context.
 * @param {Record<string, any>} block - A block `isRepeatBlockDefinition` accepted.
 * @param {object} deps - What the expansion reads.
 * @param {import('../../slData.js').SlData} deps.slData - The data port.
 * @param {Record<string, any>|null} [deps.placeholderContext] - The box's current context.
 * @param {string} [deps.moduleId] - Names the box in the warning for an unsupported repeat type.
 * @returns {Array<{block: string, contextOverride: Record<string, any>}>} One entry per iteration; empty for an unsupported type.
 */
export function expandRepeatBlock(
    block,
    { slData, placeholderContext = null, moduleId = 'unknown' },
) {
    const filter = block.filter ?? {};
    let items;
    if (block.repeat === 'classes') {
        items = getClassRepeatItems(
            slData,
            resolveFilterValue(filter.subjectName, placeholderContext?.subjectName),
        );
    } else if (block.repeat === 'subjects') {
        items = getSubjectRepeatItems(
            slData,
            resolveFilterValue(filter.className, placeholderContext?.className),
        );
    } else {
        console.warn(`InfoBoxModule[${moduleId}]: Unsupported repeat block`, block);
        return [];
    }

    return items.map(({ contextOverride, tokenValues }) => ({
        block: interpolateRepeatTemplate(block.template, tokenValues),
        contextOverride,
    }));
}

/**
 * A filter value: `current` reads the context, anything else is the literal.
 * @param {*} value - The filter value as the template wrote it.
 * @param {*} currentValue - What `current` resolves to.
 * @returns {string|null} The value, or `null` for no filter.
 */
function resolveFilterValue(value, currentValue) {
    if (typeof value !== 'string' || !value.trim()) {
        return null;
    }

    return value.trim().toLowerCase() === 'current' ? (currentValue ?? null) : value.trim();
}

/**
 * One iteration per Klasse of the school, narrowed to those that sat `subjectName`.
 * @param {import('../../slData.js').SlData} slData - The data port.
 * @param {string|null} subjectName - The Fach to narrow to, or `null` for every Klasse.
 * @returns {Array<{contextOverride: Record<string, any>, tokenValues: Record<string, string>}>} One per Klasse.
 */
function getClassRepeatItems(slData, subjectName) {
    const index = slData.competenceLevelIndex();
    if (!index.schoolId) {
        return [];
    }

    const normalizedSubjectName = normalizeDataSubjectName(subjectName);
    const rows = index.classRows.filter(
        (row) =>
            getRowClassName(row) &&
            (!normalizedSubjectName ||
                normalizeDataSubjectName(row?.subject?.name) === normalizedSubjectName),
    );

    return deriveClassNames(rows).map((className) => ({
        contextOverride: { className },
        tokenValues: { quotedClassName: quoteDisplayLabel(className) },
    }));
}

/**
 * One iteration per Fach in payload order, narrowed to those `className` sat.
 * @param {import('../../slData.js').SlData} slData - The data port.
 * @param {string|null} className - The Klasse to narrow to, or `null` for every Fach.
 * @returns {Array<{contextOverride: Record<string, any>, tokenValues: Record<string, string>}>} One per Fach.
 */
function getSubjectRepeatItems(slData, className) {
    const competenceLevels = slData.competenceLevels();
    const schoolId = buildCompetenceLevelIndex(competenceLevels).schoolId;
    const rows = competenceLevels.filter(
        (row) =>
            normalizeDataSubjectName(row?.subject?.name) &&
            (!className || (row?.id !== schoolId && getRowClassName(row) === className)),
    );
    const seen = new Set();

    return buildCompetenceLevelIndex(rows)
        .subjectDomains.map((entry) => normalizeDataSubjectName(entry?.subjectName))
        .filter(
            /**
             * @param {string|null} subjectName - The normalized Fach name.
             * @returns {subjectName is string} True the first time a named Fach appears.
             */
            (subjectName) => {
                if (!subjectName || seen.has(subjectName)) {
                    return false;
                }
                seen.add(subjectName);
                return true;
            },
        )
        .map((subjectName) => ({
            contextOverride: { subjectName },
            tokenValues: {
                subjectShortDisplayName: getSubjectShortDisplayName(subjectName) || subjectName,
                quotedSubjectDisplayName: quoteDisplayLabel(subjectName),
            },
        }));
}

/**
 * @param {*} row - A payload row.
 * @returns {string} Its trimmed `name`, or `''`.
 */
function getRowClassName(row) {
    return typeof row?.name === 'string' ? row.name.trim() : '';
}

/**
 * Substitute the `[[token]]`s of a template; unknown tokens stay literal.
 * @param {string} template - The template text.
 * @param {Record<string, string>} tokenValues - Values by token name.
 * @returns {string} The filled template.
 */
function interpolateRepeatTemplate(template, tokenValues) {
    return template.replace(REPEAT_TEMPLATE_TOKEN_PATTERN, (match, tokenName) =>
        Object.hasOwn(tokenValues, tokenName) ? tokenValues[tokenName] : match,
    );
}

/**
 * A label in German quotation marks, or nothing for a blank.
 * @param {string} label - The label.
 * @returns {string} `„label“`, or `''`.
 */
function quoteDisplayLabel(label) {
    return label ? `„${label}“` : '';
}
