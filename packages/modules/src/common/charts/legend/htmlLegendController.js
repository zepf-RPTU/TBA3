/**
 * HtmlLegendController — the HTML legend panel as a renderer collaborator.
 *
 * Sibling of `LegendRenderer` (`renderer.legend`): a chart that renders its
 * legend as HTML toggle pills in a side panel owns one of these as
 * `renderer.htmlLegend`. It holds the panel lifecycle (reset / rebind on every
 * render, teardown on destroy), the visibility state the pills toggle, and the
 * one delegated click handler that turns a pill click into a state change.
 *
 * What it deliberately does not know: how a hidden series is taken out of the
 * SVG. The chart passes section descriptors describing its pills and an
 * `onChange` callback, and applies the new state to its own marks.
 *
 * Semantics shared by every chart using it:
 * - state persists across re-renders of the same renderer (a resize or data
 *   refresh does not undo a viewer's toggles); keys absent from the next render
 *   are dropped, new keys start visible
 * - a section may declare `minVisible` — a click that would take its group below
 *   that count is ignored (the pill stays pressed)
 * - a section may render a derived master pill (`masterLabel`): pressed while any
 *   child is on, clicking it turns every child off (or all on when none is)
 * - a section may make its heading a toggle-all control (`toggleAll`)
 *
 * Pills carry `data-type` = the section's group and `data-value` = the item key;
 * the state is `{[group]: {[key]: boolean}}`.
 * @module htmlLegendController
 */

import {
    createHtmlLegendClickBinding,
    createHtmlLegendPill,
    createHtmlLegendPillGroup,
    createHtmlLegendSection,
    resetHtmlLegendPanel,
    setHtmlLegendPillState,
} from './htmlLegendPanel.js';

const CLICKABLE_HEADING_CLASS =
    'legend-section-title legend-section-title--clickable interactive-subtle hover-color';

/**
 * @typedef {object} HtmlLegendItem
 * @property {string} key - The key the pill toggles in its group's state.
 * @property {string} label - Text shown on the pill.
 * @property {Array<{text: string, glossaryKey?: string|null}>} [labelSegments] - Pre-split glossary runs.
 * @property {boolean} [isChild] - Render indented under its parent series.
 */

/**
 * @typedef {object} HtmlLegendSection
 * @property {string} [group] - State group the section's pills toggle. A section without one is display-only.
 * @property {string} [title] - Heading text.
 * @property {HtmlLegendItem[]} [items] - Pills to render.
 * @property {number} [minVisible] - Lower bound on visible keys in the group; a click going below it is ignored.
 * @property {string} [masterLabel] - Renders a derived "all children" pill under this label.
 * @property {boolean} [toggleAll] - Make the heading a click target that toggles every item in the section.
 * @property {object} [headingOptions] - Passed through to `createHtmlLegendSection`.
 * @property {string} [pillGroupClass] - Extra class on the pill group container.
 * @property {(panel: HTMLElement) => string[]} [render] - Custom drawer; returns the keys it created pills for (with `data-type` = the section group).
 */

/**
 * @typedef {object} HtmlLegendChange
 * @property {string} group - Group whose keys changed.
 * @property {string|null} key - The toggled key, or null when several changed at once (master / heading).
 * @property {{[group: string]: {[key: string]: boolean}}} state - The live state after the change.
 */

export class HtmlLegendController {
    /** @type {any} */
    #host;
    /** @type {HTMLElement|null} */
    #panel = null;
    /** @type {{destroy: Function}|null} */
    #binding = null;
    /** @type {{[group: string]: {[key: string]: boolean}}} */
    #state = {};
    /** @type {{[group: string]: number}} */
    #minVisible = {};
    /** @type {HtmlLegendSection[]} */
    #sections = [];
    /** @type {((change: HtmlLegendChange) => void)|null} */
    #onChange = null;

    /**
     * @param {any} host - Owning renderer; `host.options.legendContainer` is the panel to draw into.
     */
    constructor(host) {
        this.#host = host;
    }

    /**
     * @param {string} group - State group.
     * @param {string} key - Key within it.
     * @returns {boolean} True unless the key is explicitly hidden.
     */
    isVisible(group, key) {
        return this.#state[group]?.[key] !== false;
    }

    /**
     * @returns {boolean} Whether any key in any group is hidden — a re-render then has to re-apply the state to its marks.
     */
    anyHidden() {
        return Object.values(this.#state).some((keys) =>
            Object.values(keys).some((visible) => !visible),
        );
    }

    /**
     * Rebuild the panel from section descriptors and rebind the click handler.
     * Seeds new keys visible, keeps the values of keys seen before, drops the rest.
     * Without a panel this only resets and reseeds, so the state stays usable.
     * @param {HtmlLegendSection[]} sections - The pills to draw, in order.
     * @param {(change: HtmlLegendChange) => void} onChange - Called after every state change the pills make.
     * @returns {{[group: string]: {[key: string]: boolean}}} The seeded state.
     */
    render(sections, onChange) {
        const panel = this.#host.options?.legendContainer ?? null;
        this.reset(panel);
        this.#sections = sections;
        this.#onChange = onChange;
        const previous = this.#reseed(sections);
        if (!panel) return this.#state;

        sections.forEach((section, index) => this.#renderSection(panel, section, index, previous));
        this.#binding = createHtmlLegendClickBinding(panel, (event) => this.#handleClick(event));
        return this.#state;
    }

    /**
     * Detach the click handler and empty the panel. The state is kept, so the
     * next `render()` restores the viewer's toggles.
     * @param {HTMLElement|null} [panel] - Panel to reset; defaults to the one this controller drew into.
     */
    reset(panel = this.#host.options?.legendContainer || this.#panel) {
        this.#panel = resetHtmlLegendPanel(this.#panel, panel, this.#binding);
        this.#binding = null;
    }

    // ------------------------------------------------------------------------
    // build
    // ------------------------------------------------------------------------

    /**
     * @param {HtmlLegendSection[]} sections - The descriptors about to be drawn.
     * @returns {{[group: string]: {[key: string]: boolean}}} The state of the previous render, for custom sections that seed their keys while drawing.
     */
    #reseed(sections) {
        const previous = this.#state;
        /** @type {{[group: string]: {[key: string]: boolean}}} */
        const next = {};
        this.#minVisible = {};
        sections.forEach((section) => {
            const group = section.group;
            if (!group) return;
            next[group] ??= {};
            this.#minVisible[group] = Math.max(
                this.#minVisible[group] ?? 0,
                section.minVisible ?? 0,
            );
            (section.items ?? []).forEach((item) => {
                next[group][item.key] = previous[group]?.[item.key] ?? true;
            });
        });
        this.#state = next;
        return previous;
    }

    /**
     * @param {HTMLElement} panel - The panel to append to.
     * @param {HtmlLegendSection} section - What to draw.
     * @param {number} index - Position in the section list, stamped on the heading for the toggle-all lookup.
     * @param {{[group: string]: {[key: string]: boolean}}} previous - The state of the previous render.
     */
    #renderSection(panel, section, index, previous) {
        if (section.render) {
            const keys = section.render(panel) ?? [];
            const group = section.group;
            if (group && keys.length) {
                this.#state[group] ??= {};
                keys.forEach((key) => {
                    this.#state[group][key] = previous[group]?.[key] ?? true;
                });
                this.#paintKeys(group, keys);
            }
            return;
        }

        const group = section.group;
        const headingOptions = { ...(section.headingOptions ?? {}) };
        if (section.toggleAll && group) {
            headingOptions.headingClassName = CLICKABLE_HEADING_CLASS;
            headingOptions.headingAttributes = {
                ...(headingOptions.headingAttributes ?? {}),
                'data-section-index': String(index),
            };
        }
        const { section: element } = createHtmlLegendSection(
            panel,
            section.title ?? '',
            headingOptions,
        );
        const pillGroup = createHtmlLegendPillGroup(element);
        if (section.pillGroupClass) pillGroup.classList.add(section.pillGroupClass);
        if (!group) return;

        if (section.masterLabel) {
            const master = createHtmlLegendPill(pillGroup, {
                label: section.masterLabel,
                dataType: group,
                active: this.#anyOn(group, section),
            });
            master.setAttribute('data-master', String(index));
        }
        (section.items ?? []).forEach((item) => {
            createHtmlLegendPill(pillGroup, {
                label: item.label,
                labelSegments: item.labelSegments,
                dataType: group,
                dataValue: item.key,
                active: this.#state[group][item.key],
                isChild: item.isChild === true,
            });
        });
    }

    // ------------------------------------------------------------------------
    // dispatch
    // ------------------------------------------------------------------------

    /**
     * @param {Event} event - Click delegated from the panel.
     */
    #handleClick(event) {
        if (!(event.target instanceof Element)) return;

        const heading = event.target.closest('.legend-section-title--clickable');
        if (heading) {
            // Only a `toggleAll` heading carries the index; without it there is no
            // section to flip — `Number(null)` would silently name section 0.
            const sectionIndex = heading.getAttribute('data-section-index');
            if (sectionIndex === null) return;
            const section = this.#sections[Number(sectionIndex)];
            if (section) this.#toggleSection(section);
            return;
        }

        const pill = /** @type {HTMLButtonElement|null} */ (event.target.closest('.legend-pill'));
        if (!pill || pill.disabled) return;
        const group = pill.getAttribute('data-type');
        if (!group || !this.#state[group]) return;

        const masterIndex = pill.getAttribute('data-master');
        if (masterIndex !== null) {
            const section = this.#sections[Number(masterIndex)];
            if (section) this.#toggleSection(section);
            return;
        }

        const key = pill.getAttribute('data-value');
        if (key === null || !(key in this.#state[group])) return;
        this.#toggleKey(group, key);
    }

    /**
     * Flip one key, respecting the group's floor.
     * @param {string} group - State group.
     * @param {string} key - Key within it.
     */
    #toggleKey(group, key) {
        const next = !this.#state[group][key];
        if (!next && !this.#canHide(group, 1)) return;
        this.#state[group][key] = next;
        this.#paintKeys(group, [key]);
        this.#paintMasters(group);
        this.#emit(group, key);
    }

    /**
     * Turn every item of a section off when any is on, else all on — the
     * master pill and the toggle-all heading share this rule.
     * @param {HtmlLegendSection} section - The section whose items flip together.
     */
    #toggleSection(section) {
        const group = section.group;
        if (!group) return;
        const keys = (section.items ?? []).map((item) => item.key);
        const next = !this.#anyOn(group, section);
        if (!next) {
            const turningOff = keys.filter((key) => this.#state[group][key]).length;
            if (!this.#canHide(group, turningOff)) return;
        }
        keys.forEach((key) => {
            this.#state[group][key] = next;
        });
        this.#paintKeys(group, keys);
        this.#paintMasters(group);
        this.#emit(group, null);
    }

    /**
     * @param {string} group - State group.
     * @param {number} count - How many visible keys the click would hide.
     * @returns {boolean} Whether the group stays at or above its `minVisible` floor.
     */
    #canHide(group, count) {
        const visible = Object.values(this.#state[group]).filter(Boolean).length;
        return visible - count >= (this.#minVisible[group] ?? 0);
    }

    /**
     * @param {string} group - State group.
     * @param {HtmlLegendSection} section - Whose items to inspect.
     * @returns {boolean} Whether any item of the section is on.
     */
    #anyOn(group, section) {
        return (section.items ?? []).some((item) => this.#state[group]?.[item.key]);
    }

    /**
     * @param {string} group - Group that changed.
     * @param {string|null} key - The key, or null for a multi-key change.
     */
    #emit(group, key) {
        this.#onChange?.({ group, key, state: this.#state });
    }

    // ------------------------------------------------------------------------
    // paint
    // ------------------------------------------------------------------------

    /**
     * Restate every pill for a set of keys in one pass — several pills can name the same key.
     * @param {string} group - State group.
     * @param {string[]} keys - Keys within it.
     */
    #paintKeys(group, keys) {
        if (!this.#panel) return;
        const wanted = new Set(keys);
        // Keys carry `|` and spaces (`Deutsch|Lesen`), so match attributes rather than build a selector.
        this.#panel.querySelectorAll('.legend-pill[data-value]').forEach((pill) => {
            const key = pill.getAttribute('data-value');
            if (pill.getAttribute('data-type') === group && key !== null && wanted.has(key)) {
                setHtmlLegendPillState(pill, this.#state[group][key]);
            }
        });
    }

    /**
     * Restate the master pills of every section in a group.
     * @param {string} group - State group.
     */
    #paintMasters(group) {
        if (!this.#panel) return;
        this.#panel.querySelectorAll('.legend-pill[data-master]').forEach((master) => {
            const section = this.#sections[Number(master.getAttribute('data-master'))];
            if (section?.group === group)
                setHtmlLegendPillState(master, this.#anyOn(group, section));
        });
    }
}
