/**
 * comparisonModeControl — the ⌀ dropdown every averaging chart carries in its
 * module header, bound to the app's shared comparison state.
 *
 * Every host keeps one comparison state — in tba3 the app module's, wrapped as the
 * port. Every averaging chart's dropdown reads and writes that one state, and the
 * views observe it to keep every other chart — and every other dropdown — in step.
 * A state that cannot be written to gets no dropdown at all, which is how a
 * read-only surface (the scatterplot filter modal) shows averages without offering
 * to change them. What differs per chart is only *which* modes it can offer right
 * now, so `getModes` is the one thing a caller supplies. The ⌀ mark, the `data-header-action-*` naming, the comparison action
 * area, and the rule that a control with nothing to offer is removed rather than
 * shown empty live here, once; `chartHeaderControls` stays the generic layer
 * underneath.
 */

import { ensureHeaderActionCheckboxDropdown } from './chartHeaderControls.js';

/**
 * The averages mark, and the one button in the app whose face is text rather than a
 * Material Symbols glyph. Ø is a typographic sign; the icon set has no diameter glyph
 * and every near-miss in it reads as something else (a slashed circle says "turned
 * off", a sigma says "sum"), so the mark is written out — the same one the SL material
 * tables use for an average. `.btn-glyph` sizes it onto the optical centre the real
 * icons beside it sit on.
 */
const AVERAGES_MARK_HTML = '<span class="btn-glyph" aria-hidden="true">Ø</span>';

const CONTROL_NAME = 'comparison';
const CONTROL_SELECTOR = `[data-header-action-control="${CONTROL_NAME}"]`;
const CONTROL_LABEL = 'Vergleichswerte ein-/ausblenden';

/**
 * Ensure the comparison-mode dropdown exists in a chart host's header, bound to the
 * app's shared comparison state.
 *
 * The empty case removes rather than skips: every caller's mode list is data-derived,
 * so a payload that stops carrying references has to take the button with it. Leaving
 * one standing is worse than never showing it — it still reads as an available
 * comparison, and opening it says nothing at all.
 * @param {object} host - ChartHostModule (or compatible) exposing headerActionsContainer
 * @param {import("../comparisonState.js").ComparisonState|null} comparisonState - The shared comparison state; without a writable one no control is built.
 * @param {() => Array<{id: string, label: string}>} getModes - The modes this chart can offer; re-read on every menu open. With none, the control is removed rather than shown empty.
 */
export function ensureComparisonModeDropdown(host, comparisonState, getModes) {
    if (!host || typeof comparisonState?.setActive !== 'function') return;

    if (getModes().length === 0) {
        host.headerActionsContainer?.querySelector(CONTROL_SELECTOR)?.remove();
        return;
    }

    ensureHeaderActionCheckboxDropdown(
        host,
        /** @type {any} */ ({
            wrapperSelector: CONTROL_SELECTOR,
            wrapperAttributes: { 'data-header-action-control': CONTROL_NAME },
            buttonAttributes: { 'data-header-action-button': CONTROL_NAME },
            ariaLabel: CONTROL_LABEL,
            tooltipText: CONTROL_LABEL,
            buttonHTML: AVERAGES_MARK_HTML,
            getItems: () =>
                getModes().map((mode) => ({
                    id: mode.id,
                    label: mode.label,
                    checked: comparisonState.isActive(mode.id),
                })),
            onToggle: (item) => {
                comparisonState.setActive(item.id, !comparisonState.isActive(item.id));
            },
        }),
    );
}
