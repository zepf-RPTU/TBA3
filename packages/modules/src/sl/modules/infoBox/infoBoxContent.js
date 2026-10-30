/**
 * What an info box shows, without a DOM: the box a host names, the buttons of its
 * sections, and the shown section's entries with every placeholder, repeat block and
 * material link resolved against the store.
 */

import { COMPETENCE_SHARES } from '../../utils/slCompetenceShares.js';
import { normalizeDataSubjectName } from '../../utils/slSubjectConfig.js';
import { SL_DATASETS } from '../../slDatasets.js';
import { GROUP_COMPARISON_SUMMARY } from '../charts/groupComparison/groupComparisonSummary.js';
import { createMaterialSectionLinks } from './infoBoxLinks.js';
import { expandRepeatBlock } from './infoBoxRepeatBlocks.js';
import { InfoBoxTextResolver } from './infoBoxTextResolver.js';

/** @typedef {import('../../../common/data/schemas/infoBoxes.js').InfoBoxes} InfoBoxes */
/** @typedef {InfoBoxes['boxes'][string]['sections'][number]} InfoBoxSection */
/** @typedef {import('../../../common/data/schemas/infoBoxes.js').InfoBoxSublistBlock} InfoBoxSublistBlock */
/** @typedef {import('./infoBoxTextResolver.js').PlaceholderContext} PlaceholderContext */

/**
 * What a host hands the box its placeholders resolve against.
 * @typedef {object} PlaceholderInput
 * @property {string|null} [subjectName] - The current Fach.
 * @property {string|null} [groupName]
 * @property {import('../charts/groupComparison/groupComparisonChartTypes.js').GroupComparisonSelection} [comparison] - Its summary feeds the `summaries.comparison` placeholders.
 */

/**
 * A resolved text with its sublist, which holds text entries only.
 * @typedef {{type: 'text', segments: import('./infoBoxTextResolver.js').TextSegment[], children: InfoBoxTextEntry[]}} InfoBoxTextEntry
 */

/**
 * One thing a section shows: a resolved text, or a group of material links.
 * @typedef {InfoBoxTextEntry | {type: 'links', links: import('./infoBoxLinks.js').MaterialSectionLink[]}} InfoBoxEntry
 */

/**
 * A section as its button shows it.
 * @typedef {{key: string, icon: string, tooltipText: string}} SectionMeta
 */

/**
 * What a box shows.
 * @typedef {object} InfoBoxContent
 * @property {SectionMeta[]} sections - One per section of the box.
 * @property {string} activeSection - The shown section's key.
 * @property {InfoBoxEntry[]} entries - The shown section's entries, in order.
 */

/**
 * Every document and dataset `resolveInfoBox` reads.
 * @type {import('../../../common/data/documentStore.js').DocumentList}
 */
export const INFO_BOX_DOCUMENTS = [
    'info-boxes.json',
    SL_DATASETS.AVAILABLE_MATERIAL_SUBJECTS,
    SL_DATASETS.COMPETENCE_LEVEL_INDEX,
    SL_DATASETS.SELF_EFFICACY_SUMMARY,
    COMPETENCE_SHARES,
    GROUP_COMPARISON_SUMMARY,
];

/**
 * The content of the box a host names, on the section shown last while the box has it,
 * else on its first.
 * @param {Pick<import('../../../common/context/moduleContext.js').ModuleContext, 'documents'|'palette'|'glossary'>} context - Its store holds `INFO_BOX_DOCUMENTS`; its palette expands band aliases, its glossary links a printed Domäne to its entry.
 * @param {object} request
 * @param {string|null} request.boxKey - No key is a host with nothing to say yet; a key the document does not have is a defect, and warns.
 * @param {string|null} request.sectionKey - The section shown last.
 * @param {PlaceholderInput} request.placeholderContext
 * @param {((selection: import('./infoBoxLinks.js').MaterialSelection) => Promise<void>)|null} request.onOpenMaterial - Opens a material page; without it every material link renders disabled.
 * @param {(message: string, details?: object) => void} request.warn - Reports an unknown box and every placeholder that drops its text.
 * @returns {InfoBoxContent|null} `null` for no box, or a box without sections.
 */
export function resolveInfoBox(
    { documents, palette, glossary },
    { boxKey, sectionKey, placeholderContext, onOpenMaterial, warn },
) {
    /** @type {InfoBoxes} */
    const document = documents.get('info-boxes.json');
    const box = (boxKey && document.boxes[boxKey]) || null;
    if (boxKey && !box) warn(`No info box found for key "${boxKey}"`);
    const sections = box?.sections ?? [];
    const active = sections.find((section) => section.type === sectionKey) ?? sections[0];
    if (!active) return null;

    /** @type {PlaceholderContext} */
    const current = {
        ...placeholderContext,
        subjectName: normalizeDataSubjectName(placeholderContext.subjectName ?? null),
        locale: document.meta.locale,
        summaries: {
            selfEfficacy: documents.getDataset(SL_DATASETS.SELF_EFFICACY_SUMMARY),
            ...(placeholderContext.comparison
                ? {
                      comparison: documents.getDataset(
                          GROUP_COMPARISON_SUMMARY,
                          placeholderContext.comparison,
                      ),
                  }
                : {}),
        },
    };
    const queries = documents.getDataset(COMPETENCE_SHARES);
    const resolver = new InfoBoxTextResolver({
        queries,
        palette,
        glossary,
        warnUnresolved: (source, reason, params) =>
            warn(`Could not resolve placeholder ${source} (${reason})`, {
                boxKey,
                sectionKey: active.type,
                params,
                context: current,
            }),
    });

    /**
     * One text block as an entry, a repeat iteration resolved against its own context on
     * top of the box's.
     * @param {string} text
     * @param {import('./infoBoxRepeatBlocks.js').RepeatContextOverride|null} override
     * @param {InfoBoxTextEntry[]} children
     * @returns {InfoBoxTextEntry[]} One entry, or none when the text resolved to nothing.
     */
    const textEntry = (text, override, children) => {
        const segments = resolver.resolveTextBlock(
            text,
            override ? { ...current, ...override } : current,
        );
        return segments === null ? [] : [{ type: 'text', segments, children }];
    };

    /**
     * The text entries a block becomes: a text block one entry (with its sublist as
     * children), a repeat block one per iteration.
     * @param {InfoBoxSublistBlock} block
     * @returns {InfoBoxTextEntry[]}
     */
    const textEntries = (block) => {
        if (typeof block === 'string') return textEntry(block, null, []);
        if ('repeat' in block) {
            return expandRepeatBlock(block, {
                index: documents.getDataset(SL_DATASETS.COMPETENCE_LEVEL_INDEX),
                placeholderContext: current,
                quoteTemplate: document.meta.quotedLabel,
            }).flatMap(({ block: repeated, contextOverride }) =>
                textEntry(repeated, contextOverride, []),
            );
        }
        return textEntry(
            block.text,
            null,
            (block.sublist ?? []).flatMap((child) => textEntries(child)),
        );
    };

    const activeType = document.sectionTypes[active.type];
    return {
        sections: sections.map(({ type }) => ({
            key: type,
            icon: document.sectionTypes[type].icon,
            tooltipText: document.sectionTypes[type].tooltip,
        })),
        activeSection: active.type,
        entries: active.blocks.flatMap(
            /**
             * A link block's links as one entry, any other block its text entries.
             * @param {import('../../../common/data/schemas/infoBoxes.js').InfoBoxBlock} block
             * @returns {InfoBoxEntry[]}
             */
            (block) => {
                if (typeof block === 'string' || !('type' in block)) return textEntries(block);
                const links = createMaterialSectionLinks({
                    material: block.material,
                    subject: block.subject,
                    currentSubject: current.subjectName ?? null,
                    groupName: current.groupName ?? null,
                    queries,
                    labelTemplate: document.meta.materialLinkLabel,
                    materialSubjects: documents.getDataset(SL_DATASETS.AVAILABLE_MATERIAL_SUBJECTS),
                    onOpenMaterial,
                    // A section may override its type's ranking mode.
                    materialLinkSubjectMode:
                        active.materialLinkSubjectMode ??
                        activeType.materialLinkSubjectMode ??
                        null,
                });
                return links.length > 0 ? [{ type: 'links', links }] : [];
            },
        ),
    };
}
