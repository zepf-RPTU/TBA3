/**
 * `@tba3/modules/tooltips` — the one tooltip and popup owner.
 *
 * `setupDelegatedTooltips()` is enough for `data-tooltip-text` / `data-tooltip-html`.
 * `initGlossaryPopups()` adds the hover popups over `[data-glossary-key]`; it is a
 * warning and a no-op while no glossary is initialised, so a host without one may still
 * call it. The tooltip CSS comes in through `tooltipService.js`; ship
 * `@tba3/modules/styles/glossary-popup.css` alongside.
 */

export { tooltipService } from './tooltipService.js';
