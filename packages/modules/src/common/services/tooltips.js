/**
 * `@tba3/modules/tooltips` — the owner of the delegated tooltips and glossary popups.
 *
 * `init(glossary)` turns on `data-tooltip-text` / `data-tooltip-html`, and the hover popups
 * over `[data-glossary-key]` when the app's glossary is initialised — pass the app's
 * `GlossaryAnnotator`, or null without one. The tooltip CSS comes in through
 * `tooltipService.js`; ship `@tba3/modules/styles/glossary-popup.css` alongside.
 */

export { tooltipService } from './tooltipService.js';
