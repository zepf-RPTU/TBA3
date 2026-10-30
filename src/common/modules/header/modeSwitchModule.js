/**
 * ModeSwitchModule — a segmented button group, one button per item, reporting the
 * chosen value through its `onChange` option. The group is named by the control's
 * glossary label.
 */

import { BaseModule } from '@tba3/module-base';
import { html, nothing } from 'lit';
import { repeat } from 'lit/directives/repeat.js';
import './modeSwitchModule.css';

/** @typedef {import('./headerModule.js').RenderedControlItem} RenderedControlItem */

/**
 * @typedef {import('@tba3/module-base').BaseOptions & {
 *   items: ReadonlyArray<RenderedControlItem>,
 *   value?: string | null,
 *   label?: string,
 *   onChange: (data: import('./headerModule.js').HeaderControlChange) => void,
 * }} ModeSwitchOptions
 */

/**
 * The choices a mode switch shows, the one to make active, and the group's name.
 * @typedef {Pick<ModeSwitchOptions, 'items' | 'value' | 'label'>} ModeSwitchView
 */

/** @augments {BaseModule<ModeSwitchOptions>} */
export class ModeSwitchModule extends BaseModule {
    /** @override */
    static properties = {
        // Every assignment is a new declaration to show, even the same object rewritten.
        view: { attribute: false, hasChanged: () => true },
    };

    /** @type {string} */
    #value = '';
    /** @type {ReadonlyArray<RenderedControlItem>} */
    #items = [];

    constructor() {
        super();
        /** @type {ModeSwitchView|null} The choices and the active one: the options until the header brings another declaration. */
        this.view = null;
    }

    /**
     * The segmented row is the control element itself.
     * @override
     */
    _setup() {
        super._setup();
        this.className = 'btn-group btn-group--segmented';
        this.setAttribute('role', 'group');
        this.view ??= this.options;
    }

    /**
     * @param {ReadonlyArray<RenderedControlItem>|undefined} items
     * @returns {ReadonlyArray<RenderedControlItem>} The same choices, at least one.
     */
    static #requireItems(items) {
        if (!Array.isArray(items) || items.length === 0) {
            throw new Error('ModeSwitchModule requires options.items array with at least one item');
        }
        return items;
    }

    /**
     * @param {string|null|undefined} value - The choice asked for.
     * @param {string} fallback - What stays active when no item offers it.
     * @returns {string}
     */
    #resolveValue(value, fallback) {
        return this.#items.some((item) => item.value === value && !item.disabled)
            ? /** @type {string} */ (value)
            : fallback;
    }

    /**
     * A new declaration brings new choices and the value to show; the active choice
     * stays when the declaration names none of the items.
     * @override
     * @param {import('lit').PropertyValues<this>} changed
     */
    willUpdate(changed) {
        if (!changed.has('view') || !this.view) return;
        const { items, value, label } = this.view;
        if (label) this.setAttribute('aria-label', label);
        this.#items = ModeSwitchModule.#requireItems(items);
        // Nothing is active where no choice can be made.
        const first = this.#items.find((item) => !item.disabled)?.value ?? '';
        this.#value = this.#resolveValue(value, this.#resolveValue(this.#value, first));
    }

    /**
     * The buttons, re-rendered in place.
     * @override
     * @returns {unknown}
     */
    render() {
        return repeat(
            this.#items,
            (item) => item.value,
            (item) => this.#buttonTemplate(item),
        );
    }

    /**
     * The button for one choice. The active one is pressed and `aria-disabled`, never
     * natively disabled: a click on it changes nothing, and a disabled button would drop
     * the focus it holds to the page. An unavailable one is `aria-disabled` too, greyed,
     * and still focusable so its tooltip can say why. The label goes in as
     * `textContent`: content the formatter wraps onto its own line would carry that
     * line's whitespace into the button's text.
     * @param {RenderedControlItem} item
     * @returns {import('lit').TemplateResult}
     */
    #buttonTemplate(item) {
        const isActive = item.value === this.#value;
        return html`<button
            class="mode-button btn btn--text ${isActive ? 'is-active' : ''}"
            data-tooltip-text=${item.tooltipText || nothing}
            aria-pressed=${String(isActive)}
            aria-disabled=${isActive || item.disabled ? 'true' : nothing}
            data-mode=${item.value}
            @click=${this.#onClick}
            .textContent=${item.label}
        ></button>`;
    }

    /** @param {Event} event - A click on a choice's button. */
    #onClick = (event) => {
        const { mode } = /** @type {HTMLElement} */ (event.currentTarget).dataset;
        // The active button stays clickable; choosing it again changes nothing.
        if (mode === undefined || mode === this.#value) return;
        if (this.#items.find((item) => item.value === mode)?.disabled) return;
        this.#value = mode;
        this.requestUpdate();
        this.options.onChange({ value: mode });
    };
}

customElements.define('tba-mode-switch', ModeSwitchModule);
