/**
 * The cards of the SL Details view's chart grids (Selbstwirksamkeit, the whole school, one
 * per Fach, one per group), each with its glossary copy, watermark and detail: the charts
 * its overlay stacks and the info box beside them. A card names its selection once; its
 * preview and its detail overlay both draw it.
 */

import {
    applyMarkupTokens,
    applyTemplateTokens,
    missingGlossaryText,
    resolveDotPath,
} from '@tba3/module-base/glossary';
import { domainListRuns } from '@tba3/modules/charts';
import { competenceDetailSectionConfig } from '@tba3/modules/charts/competence-detail';
import { selfEfficacyConfig } from '@tba3/modules/charts/self-efficacy';
import {
    domainsOfSubject,
    findSelfEfficacy,
    listCompetenceGroups,
    listCompetenceSubjects,
    selectCompetenceSlice,
    SL_DATASETS,
} from '@tba3/modules/sl-domain';

/** @typedef {import('../modules/slDetailOverlay/slDetailOverlayModule.js').DetailChart} DetailChart */
/** @typedef {import('../modules/slDetailOverlay/slDetailOverlayModule.js').DetailPanel} DetailPanel */
/** @typedef {import('../modules/slDetailOverlay/slDetailOverlayModule.js').CardDetail} CardDetail */
/** @typedef {import('@tba3/modules/documents').DocumentStore} DocumentStore */

/**
 * A competence chart's selection: one Fach, one group, or the school's own rows.
 * @typedef {object} CompetenceSelection
 * @property {string|null} subjectName - The Fach, on a subject card.
 * @property {string|null} groupName - The group, on a group card.
 * @property {boolean} showOnlySchoolData - The whole-school card: draw the school rows only.
 */

/**
 * One card of a thumbnail grid.
 * @typedef {object} ThumbnailCard
 * @property {string} title
 * @property {DetailChart} preview - The chart drawn as the card's watermark: the descriptor its detail overlay drives, with the card's selection.
 * @property {CardDetail} detail - What the detail overlay shows when the card is activated.
 */

/** @type {Readonly<{[subject: string]: string}>} */
const SUBJECT_PREVIEW_GLOSSARY_KEYS = Object.freeze({
    Deutsch: 'preview-de',
    Englisch: 'preview-en',
    Französisch: 'preview-fr',
    Mathematik: 'preview-ma',
});

/**
 * The glossary entry of a preview card.
 * @param {'subject-view'|'group-view'} section
 * @param {string|null} previewKey
 * @returns {string}
 */
const previewPath = (section, previewKey) =>
    `sl.details.${section}.preview-cards.element_texts.${previewKey}`;

/** The Selbstwirksamkeit card's entry, which also titles its chart in the overlay. */
const SELF_EFFICACY_PATH = previewPath('subject-view', 'preview-sw');

/**
 * A preview card's glossary copy.
 * @param {import('@tba3/module-base/glossary').GlossaryTree|null} glossaryData
 * @param {'subject-view'|'group-view'} section
 * @param {string|null} previewKey - The card's entry; without one the card has no copy.
 * @param {import('@tba3/module-base/glossary').GlossaryReplacements} [replacements]
 * @returns {{title: string, description: string|null}}
 */
function cardTexts(glossaryData, section, previewKey, replacements = {}) {
    const path = previewPath(section, previewKey);
    const entry = previewKey ? resolveDotPath(glossaryData, path) : null;
    // The description becomes the detail card's subtitle, which renders as markup: the
    // values put into it (a group name from the payload) go in escaped, a Domäne as the
    // term of its entry.
    return {
        title: applyTemplateTokens(entry?.title, replacements) || missingGlossaryText(path),
        description: applyMarkupTokens(entry?.description, replacements) || null,
    };
}

/**
 * A Selbstwirksamkeit chart panel of a detail overlay.
 * @param {object} [options] - What the chart draws beyond its title entry.
 * @returns {DetailPanel}
 */
const selfEfficacyPanel = (options = {}) => ({
    suffix: 'sp',
    config: selfEfficacyConfig,
    options: { glossaryKey: SELF_EFFICACY_PATH, ...options },
});

/**
 * The Selbstwirksamkeit strip over a group's (or the school's) chart, when it has
 * Selbstwirksamkeit rows.
 * @param {DocumentStore} documents
 * @param {string|null} groupName - `null` for the school.
 * @returns {DetailPanel[]} The strip, or nothing.
 */
function selfEfficacyStrip(documents, groupName) {
    if (!findSelfEfficacy(documents, groupName)) return [];
    // Its height follows the viz mode the overlay is opened in.
    return [
        {
            ...selfEfficacyPanel({
                groupName,
                showOnlySchoolData: groupName === null,
                // The strip folds away to give the chart under it the column.
                collapsible: true,
            }),
            className: 'overlay-panel--sp',
        },
    ];
}

/**
 * What a competence card's detail follows from its selection: the export identity (never
 * display text), the chart's title entry and the info box beside it.
 * @param {CompetenceSelection} selection
 * @returns {Pick<CardDetail, 'key' | 'kasten'> & {chartCopy: {glossaryKey?: string, glossaryReplacements?: Record<string, string>}}}
 */
function selectionDetail({ subjectName, groupName }) {
    const placeholderContext = { subjectName, groupName };
    if (subjectName !== null) {
        return {
            key: `subject-${subjectName}`,
            // The payload's subject, not the card title: the title is glossary copy and
            // need not spell the subject the material pages are keyed by.
            chartCopy: {
                glossaryKey: 'sl.details.subject-view.chart',
                glossaryReplacements: { Fach: subjectName },
            },
            kasten: { boxKey: 'detailsSubjectSpecific', placeholderContext },
        };
    }
    if (groupName !== null) {
        return {
            key: `group-${groupName}`,
            chartCopy: {
                glossaryKey: 'sl.details.group-view.chart',
                glossaryReplacements: { Lerngruppe: groupName },
            },
            kasten: { boxKey: 'detailsGroupSpecific', placeholderContext },
        };
    }
    // The school's chart takes the card title.
    return {
        key: 'school',
        chartCopy: {},
        kasten: { boxKey: 'detailsSchoolSpecific', placeholderContext },
    };
}

/**
 * A competence card: its watermark and its overlay's chart draw the same selection.
 * @param {{title: string, description: string|null}} texts
 * @param {CompetenceSelection} selection - What the chart draws.
 * @param {{strip?: DetailPanel[], averagesHidden?: boolean}} [detailOptions] - Panels over the chart, and whether its averages start off.
 * @returns {ThumbnailCard}
 */
function competenceCard(
    { title, description },
    selection,
    { strip = [], averagesHidden = false } = {},
) {
    const { key, chartCopy, kasten } = selectionDetail(selection);
    return {
        title,
        preview: { config: competenceDetailSectionConfig, options: selection },
        detail: {
            title,
            key,
            panels: [
                ...strip,
                {
                    suffix: 'chart',
                    config: competenceDetailSectionConfig,
                    options: {
                        ...selection,
                        ...chartCopy,
                        title,
                        averagesHidden,
                        ...(description ? { showSubtitle: true, subtitle: description } : {}),
                    },
                },
            ],
            kasten,
        },
    };
}

/**
 * The Details view by Fach: the Selbstwirksamkeit card first when the school has
 * Selbstwirksamkeit rows, then one card per Fach in payload order, its copy naming the
 * Fach's Domänen as the payload calls them.
 * @param {DocumentStore} documents
 * @param {import('@tba3/module-base/glossary').GlossaryTree|null} glossaryData
 * @param {import('@tba3/modules/context').GlossaryAnnotator} glossary - Links each Domäne named to its entry.
 * @returns {ThumbnailCard[]}
 */
export function buildSubjectCards(documents, glossaryData, glossary) {
    const { title } = cardTexts(glossaryData, 'subject-view', 'preview-sw');
    /** @type {ThumbnailCard[]} */
    const cards = documents.getDataset(SL_DATASETS.SURVEY_ROWS).hasSelfEfficacy
        ? [
              {
                  title,
                  preview: { config: selfEfficacyConfig, options: {} },
                  // Every group's Selbstwirksamkeit, the whole column.
                  detail: {
                      title,
                      key: 'sp',
                      panels: [selfEfficacyPanel()],
                      kasten: { boxKey: 'detailsSelfEfficacy', placeholderContext: {} },
                  },
              },
          ]
        : [];
    const index = documents.getDataset(SL_DATASETS.COMPETENCE_LEVEL_INDEX);
    for (const subjectName of listCompetenceSubjects(index)) {
        cards.push(
            competenceCard(
                cardTexts(
                    glossaryData,
                    'subject-view',
                    SUBJECT_PREVIEW_GLOSSARY_KEYS[subjectName] ?? null,
                    {
                        Fach: subjectName,
                        Domänen: domainListRuns(
                            glossary,
                            subjectName,
                            domainsOfSubject(index, subjectName),
                        ),
                    },
                ),
                { subjectName, groupName: null, showOnlySchoolData: false },
            ),
        );
    }
    return cards;
}

/**
 * The Details view by group: the whole-school card (when the school has group entries),
 * then one card per group. A card's detail stacks the Selbstwirksamkeit strip of its group
 * (or the school) over its chart when it has Selbstwirksamkeit rows; its chart starts with
 * the averages off, so the group's own bars lead.
 * @param {DocumentStore} documents
 * @param {import('@tba3/module-base/glossary').GlossaryTree|null} glossaryData
 * @returns {ThumbnailCard[]}
 */
export function buildGroupCards(documents, glossaryData) {
    const index = documents.getDataset(SL_DATASETS.COMPETENCE_LEVEL_INDEX);
    /** @type {ThumbnailCard[]} */
    const cards = selectCompetenceSlice(index)
        ? [
              competenceCard(
                  cardTexts(glossaryData, 'group-view', 'preview-school'),
                  { subjectName: null, groupName: null, showOnlySchoolData: true },
                  { strip: selfEfficacyStrip(documents, null), averagesHidden: true },
              ),
          ]
        : [];
    for (const groupName of listCompetenceGroups(index)) {
        cards.push(
            competenceCard(
                cardTexts(glossaryData, 'group-view', 'preview-group', { Lerngruppe: groupName }),
                { subjectName: null, groupName, showOnlySchoolData: false },
                { strip: selfEfficacyStrip(documents, groupName), averagesHidden: true },
            ),
        );
    }
    return cards;
}
