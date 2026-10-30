/**
 * The ⌀ dropdown every averaging chart carries in its module header, bound to the
 * host's shared comparison state. A chart supplies only the modes it can offer
 * (`getModes`).
 */

import { headerActionCheckboxDropdown } from '@tba3/module-base';
import { html, nothing } from 'lit';

/**
 * The averages mark: text, not a Material Symbols glyph, because the icon set has no
 * diameter sign (a slashed circle reads "turned off", a sigma "sum"). `.btn-glyph`
 * sizes it onto the optical centre of the icons beside it.
 */
const AVERAGES_MARK = html`<span class="btn-glyph" aria-hidden="true">Ø</span>`;

/**
 * The comparison-mode dropdown of a chart host's header. There is no control without
 * modes (the list is data-derived, and an empty menu would still read as an available
 * comparison) or without a writable state (a read-only snapshot draws its groups
 * but offers no toggle).
 * @param {{options: {context: {glossary: import('../../glossary/glossaryAnnotator.js').GlossaryAnnotator}, comparisonState?: (import('../comparisonState.js').ComparisonStateReader & Partial<Pick<import('../comparisonState.js').ComparisonState, 'setActive'>>)|null}}} host - ChartHostModule (or compatible); its glossary names the control.
 * @param {() => Array<{id: string, label: string}>} getModes - The modes this chart can offer; read now, and again on every menu open.
 * @returns {unknown} The control, or `nothing`.
 */
export function comparisonModeDropdown(host, getModes) {
    const comparisonState = host.options.comparisonState;
    const setActive = comparisonState?.setActive;
    if (!comparisonState || !setActive || getModes().length === 0) return nothing;

    return headerActionCheckboxDropdown({
        name: 'comparison',
        ariaLabel: host.options.context.glossary.getRequiredEntryText(
            'general.buttons.element_texts.comparison-toggle.label',
        ),
        buttonContent: AVERAGES_MARK,
        getItems: () =>
            getModes().map((mode) => ({
                id: mode.id,
                label: mode.label,
                checked: comparisonState.isActive(mode.id),
            })),
        onToggle: (item) => {
            setActive(item.id, !comparisonState.isActive(item.id));
        },
    });
}
