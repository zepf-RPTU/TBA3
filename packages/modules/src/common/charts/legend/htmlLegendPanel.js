/**
 * Shared HTML legend panel primitives.
 *
 * These helpers create DOM structure, sync pill state, and manage delegated
 * legend listener bindings. Chart-specific visibility rules stay in the
 * renderer that owns the chart data.
 */

import { applyCompetencyBandPaint } from '../chartUtils.js';

/**
 * Reset an HTML legend panel, removing delegated listeners and clearing content.
 * @param {HTMLElement|null} previousPanel - Panel being replaced; cleared even when it is not the new one.
 * @param {HTMLElement|null} nextPanel - Panel about to be filled; cleared first so a re-render cannot double up.
 * @param {Function|{destroy: Function}|null} clickBindingOrHandler - The binding to dispose, or a bare handler to detach.
 * @returns {HTMLElement|null} The panel that is now empty and ready to fill, or null when neither was given.
 */
export function resetHtmlLegendPanel(previousPanel, nextPanel, clickBindingOrHandler) {
    const panels = /** @type {HTMLElement[]} */ (
        [previousPanel, nextPanel].filter((activePanel, index, allPanels) => {
            return activePanel && allPanels.indexOf(activePanel) === index;
        })
    );

    const binding = /** @type {any} */ (clickBindingOrHandler);
    if (clickBindingOrHandler && typeof binding.destroy === 'function') {
        binding.destroy();
    }

    panels.forEach((activePanel) => {
        if (typeof clickBindingOrHandler === 'function') {
            activePanel.removeEventListener(
                'click',
                /** @type {EventListener} */ (clickBindingOrHandler),
            );
        }
        activePanel.innerHTML = '';
    });

    return nextPanel || null;
}

/**
 * Attach a delegated click handler to an HTML legend panel.
 * @param {HTMLElement} panel - Panel the listener is delegated on.
 * @param {EventListener} clickHandler - Receives clicks from any pill inside the panel.
 * @returns {{ destroy: Function }} Idempotent binding disposable
 */
export function createHtmlLegendClickBinding(panel, clickHandler) {
    let active = true;
    panel.addEventListener('click', clickHandler);

    return {
        destroy() {
            if (!active) return;
            active = false;
            panel.removeEventListener('click', clickHandler);
        },
    };
}

/**
 * Create an HTML legend section with a title.
 * @param {HTMLElement} parent - Element the section is appended to.
 * @param {string} title - Heading text for the section.
 * @param {object} [options] - Class names and heading attributes, for callers that style a variant.
 * @param {string} [options.headingClassName='legend-section-title'] - Class for the heading element.
 * @param {{[attribute: string]: string}} [options.headingAttributes] - Extra attributes set on the heading, such as an id a control points at.
 * @returns {{ section: HTMLDivElement, heading: HTMLDivElement }} The appended wrapper and its heading, so callers can fill or label them.
 */
export function createHtmlLegendSection(parent, title, options = {}) {
    const { headingClassName = 'legend-section-title', headingAttributes = {} } = options;

    const section = document.createElement('div');
    section.className = 'legend-section';

    const heading = document.createElement('div');
    heading.className = headingClassName;
    heading.textContent = title;

    Object.entries(headingAttributes).forEach(([name, value]) => {
        if (value != null) {
            heading.setAttribute(name, String(value));
        }
    });

    section.appendChild(heading);
    parent.appendChild(section);
    return { section, heading };
}

/**
 * Create a legend pill group container.
 * @param {HTMLElement} parent - Element the group is appended to.
 * @returns {HTMLDivElement} The empty pill group, ready for `createHtmlLegendPill` calls.
 */
export function createHtmlLegendPillGroup(parent) {
    const group = document.createElement('div');
    group.className = 'btn-group legend-pill-group';
    parent.appendChild(group);
    return group;
}

/**
 * Create a single HTML legend pill button.
 * @param {HTMLElement} parent - Group the pill is appended to.
 * @param {object} options - Label, the data attributes that identify it, and its initial state.
 * @param {string} options.label - Text shown on the pill.
 * @param {Array<{ text: string, glossaryKey?: string|null }>} [options.labelSegments] - Pre-split glossary runs, when the label carries annotated terms.
 * @param {string} options.dataType - Series or group kind the pill toggles, read back by the click handler.
 * @param {string} [options.dataValue] - Which member of that kind, when the type alone is ambiguous.
 * @param {boolean} [options.active=true] - Whether the pill starts toggled on.
 * @param {boolean} [options.disabled=false] - Whether the pill starts non-interactive.
 * @param {boolean} [options.isChild=false] - Render as a nested pill, indented under its parent series.
 * @returns {HTMLButtonElement} The appended pill.
 */
export function createHtmlLegendPill(parent, options) {
    const {
        label,
        labelSegments = null,
        dataType,
        dataValue,
        active = true,
        disabled = false,
        isChild = false,
    } = options;

    const button = document.createElement('button');
    button.className = 'btn btn--text legend-pill';
    if (active) button.classList.add('is-active');
    if (!active) button.classList.add('is-inactive');
    if (isChild) button.classList.add('child');
    button.setAttribute('data-type', dataType);
    if (dataValue) button.setAttribute('data-value', dataValue);
    button.setAttribute('aria-pressed', String(active));
    button.disabled = disabled;

    if (Array.isArray(labelSegments) && labelSegments.length > 0) {
        labelSegments.forEach((segment) => {
            const span = document.createElement('span');
            span.textContent = segment.text;
            if (segment.glossaryKey) {
                span.classList.add('glossary-term');
                span.setAttribute('data-glossary-key', segment.glossaryKey);
            }
            button.appendChild(span);
        });
    } else {
        button.textContent = label;
    }

    parent.appendChild(button);
    return button;
}

/**
 * Sync the visual state of an HTML legend pill.
 * @param {Element} pill - The pill to restyle. `Element`, not `HTMLElement`: callers reach pills through `querySelectorAll`, and only `classList`/`setAttribute` are used here.
 * @param {boolean} isActive - Whether the series it names is currently shown.
 */
export function setHtmlLegendPillState(pill, isActive) {
    pill.classList.toggle('is-active', isActive);
    pill.classList.toggle('is-inactive', !isActive);
    pill.setAttribute('aria-pressed', String(isActive));
}

/**
 * Append a display-only swatch legend section.
 * @param {HTMLElement} parent - Element the section is appended to.
 * @param {string} title - Heading text for the section.
 * @param {Array<{label: string, color: string, group?: string, appearance?: object | null}>} items - Swatches to list, in display order.
 * @returns {HTMLDivElement} The appended section; display-only, so it carries no click binding.
 */
export function appendHtmlLegendSwatchSection(parent, title, items) {
    const { section } = createHtmlLegendSection(parent, title);
    const list = document.createElement('div');
    list.className = 'niveaustufen-list';
    list.setAttribute('role', 'list');

    items.forEach(({ label, color, group = null, appearance = null }) => {
        const item = document.createElement('div');
        item.className = 'niveaustufen-item';
        item.setAttribute('role', 'listitem');

        const swatch = document.createElement('span');
        swatch.className = 'niveaustufen-swatch';
        swatch.setAttribute('aria-hidden', 'true');
        const levelClass = group || appearance?.patternKey || null;
        if (levelClass) {
            swatch.classList.add('competency-level', `level-${levelClass}`);
            // The band count is data-driven, so the swatch carries its own paint.
            // `group`-only callers have no appearance object and pass `color` directly.
            if (appearance) {
                applyCompetencyBandPaint(swatch, appearance);
            } else {
                swatch.style.setProperty('--ks-band-color', color);
            }
        } else {
            swatch.style.backgroundColor = color;
        }

        const text = document.createElement('span');
        text.textContent = label;

        item.appendChild(swatch);
        item.appendChild(text);
        list.appendChild(item);
    });

    section.appendChild(list);
    return section;
}
