/**
 * The `{{Domänen}}` title token of the EN cards that span both domains: the payload's
 * names, each linked to its entry by id, never by matching the name as text.
 */

import { domainListRuns } from '../../common/charts/domainLabelFormatter.js';

/**
 * @param {import('../../common/glossary/glossaryAnnotator.js').GlossaryAnnotator} glossary
 * @param {import('../enConfig.js').EnConfig} enConfig
 * @returns {Array<{text: string, glossaryKey: string|null}>} `Hören und Lesen`, in payload order.
 */
export function enDomainListRuns(glossary, enConfig) {
    return domainListRuns(
        glossary,
        null,
        enConfig.domainIds.map((domainId, i) => ({
            domainId,
            domainName: enConfig.domainLabels[i],
        })),
    );
}
