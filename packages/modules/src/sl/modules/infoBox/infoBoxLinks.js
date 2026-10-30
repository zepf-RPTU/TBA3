import { applyTemplateTokens } from '@tba3/module-base/glossary';
import { pickSelection } from '../../utils/slSelectionRanking.js';
import { MEDIUM_OR_ABOVE_ALIAS } from '../../utils/slCompetenceLevels.js';
import { ALL_DOMAINS } from '../../utils/slQueryPrimitives.js';
import { hasMaterialPage, isCurrentMaterialSubjectToken } from '../../utils/slSubjectConfig.js';

/**
 * The subjects a ranking mode names for a population: the one with the highest share at
 * or above the Regelstandard (`best`), the lowest (`worst`), or both (`extrema`). A Fach whose scale
 * cannot express that share is left out rather than scored 0 %.
 * @param {import('../../utils/slCompetenceShares.js').CompetenceShareQueries} queries
 * @param {string} target - `school` or a group name.
 * @param {string} mode - `best`, `worst` or `extrema`.
 * @returns {string[]} The Fach names, deduplicated.
 */
function rankMaterialSubjects(queries, target, mode) {
    const measured = queries.getSubjectNames(target).map((subjectName) => {
        const share = queries.getSubjectCompetenceShare({
            target,
            subjectName,
            domainId: ALL_DOMAINS,
            levelAlias: MEDIUM_OR_ABOVE_ALIAS,
        });
        return share === null ? null : { subjectName, share };
    });
    const pick = (/** @type {'min'|'max'} */ rankMode) =>
        pickSelection(measured, (selection) => selection.share, rankMode)?.subjectName;
    const picked =
        mode === 'worst'
            ? [pick('min')]
            : mode === 'extrema'
              ? [pick('max'), pick('min')]
              : [pick('max')];

    return [...new Set(picked.filter((subjectName) => subjectName !== undefined))];
}

/**
 * What opening a material page needs: the Fach and the type to select.
 * @typedef {{subject: string, type: string}} MaterialSelection
 */

/**
 * A link an info-box section renders: its label, and the handler that opens the material
 * page, absent when it cannot act (it then renders disabled).
 * @typedef {{label: string, onActivate: (() => Promise<void>)|null}} MaterialSectionLink
 */

/**
 * Turn one link block into the material links it stands for: each a label plus the
 * handler that opens the material page of that Fach and type. `Fach` is the current
 * Fach, or — without one — whatever the section's ranking mode names, so
 * `extrema` yields two links; any other subject is one link naming it. A link to a page
 * that does not exist — a Fach the dataset does not offer (`Gesamt` among
 * them) or a type without a page — has no handler.
 * @param {object} spec
 * @param {string} spec.material - The material type as the template writes it.
 * @param {string} spec.subject - `Fach`, or the subject the link names.
 * @param {string|null} [spec.currentSubject] - The current subject, if any.
 * @param {string|null} [spec.groupName] - Scopes a ranking mode to one group.
 * @param {import('../../utils/slCompetenceShares.js').CompetenceShareQueries} spec.queries - Answers the ranking modes.
 * @param {string|null} [spec.materialLinkSubjectMode] - A ranking mode instead of a named subject.
 * @param {string} spec.labelTemplate - The label with `{{type}}` and `{{subject}}` tokens, from the document's `meta.materialLinkLabel`.
 * @param {readonly string[]} spec.materialSubjects - The Fächer with material pages; a link to any other renders disabled.
 * @param {((selection: MaterialSelection) => Promise<void>)|null} [spec.onOpenMaterial]
 * @returns {MaterialSectionLink[]} One link per resolved subject.
 */
export function createMaterialSectionLinks({
    material,
    subject,
    currentSubject = null,
    groupName = null,
    queries,
    materialLinkSubjectMode = null,
    labelTemplate,
    materialSubjects,
    onOpenMaterial = null,
}) {
    let subjects = [subject];
    if (isCurrentMaterialSubjectToken(subject)) {
        // The current Fach wins; only without one is the ranking asked.
        const current = typeof currentSubject === 'string' ? currentSubject.trim() : '';
        const ranked =
            !current && materialLinkSubjectMode
                ? rankMaterialSubjects(queries, groupName || 'school', materialLinkSubjectMode)
                : [];
        subjects = current ? [current] : ranked.length > 0 ? ranked : subjects;
    }

    const hasPage = hasMaterialPage(material);
    return subjects.map((linkSubject) => ({
        label: applyTemplateTokens(labelTemplate, { type: material, subject: linkSubject }),
        onActivate:
            hasPage && materialSubjects.includes(linkSubject) && onOpenMaterial
                ? () => onOpenMaterial({ subject: linkSubject, type: material })
                : null,
    }));
}
