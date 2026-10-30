/**
 * Each EN domain's label, abbreviation, initial, colour and glossary key, as the style renderers paint them.
 * Below the cards' shared module, so a renderer never imports the module that builds it.
 */

import { getChartDomainAbbreviation } from '../../../../common/charts/domainLabelFormatter.js';

/**
 * The slice of a host's EN configuration the style cards and their renderers read.
 * @typedef {{
 *     styleCategories: Array<{value: string, fieldName: string, label: string}>,
 *     domainIds: string[],
 *     domainLabels: string[],
 * }} StyleChartEnConfig
 */

/**
 * @typedef {{label: string, abbreviation: string, initial: string, color: string, glossaryKey: string|null}} DomainStyle
 */

/**
 * Each domain's label, abbreviation, initial, colour and glossary key, as both cards'
 * renderers paint them: the lollipop's rows and stem tags, and the spider's spoke prefixes.
 * @param {{domainIds: string[], domainLabels: string[]}} enConfig - The two domains.
 * @param {import('../../../../common/glossary/glossaryAnnotator.js').GlossaryAnnotator} glossary - The app's glossary, which resolves each domain id's entry.
 * @returns {{[domainId: string]: DomainStyle}}
 */
export function buildDomainStyles(enConfig, glossary) {
    const domainColors = ['var(--chart-domain0-color)', 'var(--chart-domain1-color)'];
    return Object.fromEntries(
        enConfig.domainIds.map((id, i) => [
            id,
            {
                label: enConfig.domainLabels[i],
                abbreviation: getChartDomainAbbreviation(enConfig.domainLabels[i]),
                initial: getChartDomainAbbreviation(enConfig.domainLabels[i], 1),
                color: domainColors[i],
                // The entry that claims the domain's id; a domain the glossary does not
                // know is plain text.
                glossaryKey: glossary.resolveDomainEntryKey(id),
            },
        ]),
    );
}
