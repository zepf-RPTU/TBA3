/**
 * Repeat-block expansion for the SL info boxes: a `{repeat, template}` block is rolled
 * out once per Lerngruppe, Fach or Domäne, each copy with the `[[token]]`s of its template
 * substituted and a placeholder-context override for that iteration.
 */

import { applyTemplateTokens } from '@tba3/module-base/glossary';
import { domainsOfSubject, groupNamesOf } from '../../slCompetenceLevelIndex.js';
import { getSubjectShortDisplayName } from '../../utils/slSubjectConfig.js';

/** @typedef {import('../../slCompetenceLevelIndex.js').CompetenceLevelIndex} CompetenceLevelIndex */

/**
 * What one iteration resolves against on top of the box's context: its Lerngruppe, its
 * Fach, or its Domäne of the box's Fach.
 * @typedef {{groupName: string}|{subjectName: string}|{domainId: string}} RepeatContextOverride
 */

const REPEAT_TEMPLATE_TOKEN_PATTERN = /\[\[\s*([a-zA-Z][a-zA-Z0-9]*)\s*\]\]/g;

/**
 * Roll a repeat block out into one text block per Lerngruppe, Fach or Domäne.
 *
 * A box shown for one Fach repeats only over the Lerngruppen that sat it (`groups`), a box
 * shown for one Lerngruppe only over the Fächer it sat (`subjects`); `domains` repeats
 * over the Domänen of the box's Fach.
 * @param {import('../../../common/data/schemas/infoBoxes.js').RepeatBlock} block
 * @param {object} deps
 * @param {CompetenceLevelIndex} deps.index - The Lerngruppen, Fächer and Domänen to repeat over.
 * @param {import('./infoBoxTextResolver.js').PlaceholderContext} deps.placeholderContext
 * @param {string} deps.quoteTemplate - How a quoted name reads, with a `{{label}}` token; the document's `meta.quotedLabel`.
 * @returns {Array<{block: string, contextOverride: RepeatContextOverride}>}
 */
export function expandRepeatBlock(block, { index, placeholderContext, quoteTemplate }) {
    /**
     * @param {string|null|undefined} label
     * @returns {string} Empty for no label.
     */
    const quote = (label) => (label ? applyTemplateTokens(quoteTemplate, { label }) : '');
    const items =
        block.repeat === 'groups'
            ? getGroupRepeatItems(index, placeholderContext.subjectName ?? null, quote)
            : block.repeat === 'subjects'
              ? getSubjectRepeatItems(index, placeholderContext.groupName ?? null, quote)
              : getDomainRepeatItems(index, placeholderContext.subjectName ?? null);

    return items.map(({ contextOverride, tokenValues }) => ({
        block: interpolateRepeatTemplate(block.template, tokenValues),
        contextOverride,
    }));
}

/**
 * One iteration per Lerngruppe of the school in name order, narrowed to those that sat
 * `subjectName`; none for a payload without a school.
 * @param {CompetenceLevelIndex} index - The school and its Lerngruppen' value groups.
 * @param {string|null} subjectName - The Fach to narrow to, or `null` for every Lerngruppe.
 * @param {(label: string) => string} quote
 * @returns {Array<{contextOverride: RepeatContextOverride, tokenValues: Record<string, string>}>}
 */
function getGroupRepeatItems(index, subjectName, quote) {
    return groupNamesOf(index, subjectName).map((groupName) => ({
        contextOverride: { groupName },
        tokenValues: { quotedGroupName: quote(groupName) },
    }));
}

/**
 * One iteration per Fach in payload order, narrowed to those `groupName` sat.
 * @param {CompetenceLevelIndex} index - The value groups per Lerngruppe and the Fächer.
 * @param {string|null} groupName - The Lerngruppe to narrow to, or `null` for every Fach.
 * @param {(label: string) => string} quote
 * @returns {Array<{contextOverride: RepeatContextOverride, tokenValues: Record<string, string>}>}
 */
function getSubjectRepeatItems(index, groupName, quote) {
    const subjectNames = groupName
        ? (index.groupsByName.get(groupName) ?? []).map((group) => group?.subject?.name)
        : index.subjectDomains.map((entry) => entry.subjectName);
    const distinctSubjectNames = new Set(
        subjectNames.filter(
            /** @type {(name: string|undefined) => name is string} */ ((name) => !!name),
        ),
    );

    return [...distinctSubjectNames].map((subjectName) => ({
        contextOverride: { subjectName },
        tokenValues: {
            subjectShortDisplayName: getSubjectShortDisplayName(subjectName),
            quotedSubjectDisplayName: quote(subjectName),
        },
    }));
}

/**
 * One iteration per Domäne of `subjectName` in payload order, its template without tokens:
 * a placeholder names the Domäne (`selectSubjectDomain`), linked to its entry.
 *
 * Only Domänen with an id: a Fach measured as a whole (Mathematik) has no Domäne to name,
 * and the domain-less student rows of a split Fach are none of its Domänen.
 * @param {CompetenceLevelIndex} index - The Fächer and their Domänen.
 * @param {string|null} subjectName - The box's Fach; without one, no iteration.
 * @returns {Array<{contextOverride: RepeatContextOverride, tokenValues: Record<string, string>}>}
 */
function getDomainRepeatItems(index, subjectName) {
    return domainsOfSubject(index, subjectName).flatMap(({ domainId }) =>
        domainId ? [{ contextOverride: { domainId }, tokenValues: {} }] : [],
    );
}

/**
 * Substitute the `[[token]]`s of a template; unknown tokens stay literal.
 * @param {string} template
 * @param {Record<string, string>} tokenValues - Values by token name.
 * @returns {string}
 */
function interpolateRepeatTemplate(template, tokenValues) {
    return template.replace(REPEAT_TEMPLATE_TOKEN_PATTERN, (match, tokenName) =>
        Object.hasOwn(tokenValues, tokenName) ? tokenValues[tokenName] : match,
    );
}
