/**
 * `@tba3/modules/info-box` — the Infobox card and the summary namespaces its text
 * placeholders read.
 *
 * A host builds a summary from what the sibling chart has selected
 * (`buildSelfEfficacyInfoBoxSummary`), wraps it in the namespace the templates address it
 * by, and hands that to the card as its placeholder context.
 */

export { InfoBoxModule } from './infoBoxModule.js';
export { buildSelfEfficacyInfoBoxSummary } from './selfEfficacyInfoBoxSummary.js';

export {
    buildComparisonInfoBoxSummaryNamespace,
    buildSelfEfficacyInfoBoxSummaryNamespace,
} from './infoBoxSummaryNamespaces.js';
