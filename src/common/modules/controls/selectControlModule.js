/**
 * SelectControlModule — a labelled `<select>` that reports the chosen value through its
 * `onChange` option.
 */

import { BaseModule } from '@tba3/module-base';
import { html, nothing } from 'lit';
import { live } from 'lit/directives/live.js';
import { repeat } from 'lit/directives/repeat.js';

/** @typedef {{value: string, label: string, disabled?: boolean}} SelectItem */

/**
 * @typedef {import('@tba3/module-base').BaseOptions & {
 *   items: ReadonlyArray<SelectItem>,
 *   value?: string | null,
 *   label?: string,
 *   tooltipText?: string,
 *   containerClass?: string,
 *   selectClass?: string,
 *   onChange: (data: {value: string}) => void,
 * }} SelectControlOptions
 */

/**
 * What the field shows; the header replaces it through `view`.
 * @typedef {Pick<SelectControlOptions, 'items' | 'value' | 'label' | 'tooltipText' | 'containerClass' | 'selectClass'>} SelectControlView
 */

/**
 * @param {string} base - The shared class.
 * @param {string} [extra] - An owner-local class.
 * @returns {string}
 */
const classList = (base, extra) => [base, extra].filter(Boolean).join(' ');

/** @augments {BaseModule<SelectControlOptions>} */
export class SelectControlModule extends BaseModule {
    /** @override */
    static properties = {
        // Every assignment is a new declaration to show, even the same object rewritten.
        view: { attribute: false, hasChanged: () => true },
        value: { attribute: false },
    };

    constructor() {
        super();
        /** @type {SelectControlView|null} What the field shows: the options until an owner brings another. */
        this.view = null;
        /** @type {string|null} The selected item; an owner sets it to sync the field to state that changed elsewhere, without a report. */
        this.value = null;
    }

    /** @override */
    _setup() {
        super._setup();
        this.view ??= this.options;
    }

    /**
     * A new declaration brings the value it shows, else its first item that can be chosen.
     * @override
     * @param {import('lit').PropertyValues<this>} changed
     */
    willUpdate(changed) {
        const view = this.view;
        if (!view) return;
        if (changed.has('view')) {
            this.value = view.value ?? view.items.find((item) => !item.disabled)?.value ?? null;
        }
        this.className = classList('control-field control-field--inline', view.containerClass);
    }

    /**
     * The field is the element, an inline control field holding a `control-label` bound
     * to a `control-select`; its content is re-rendered in place.
     * @override
     * @returns {unknown}
     */
    render() {
        if (!this.view) return nothing;
        const { items, label, tooltipText, selectClass } = this.view;
        const selectId = `${this.id}-select`;
        // The label is the select's accessible name, so it is bound with `for` rather
        // than merely placed beside it. Each option binds its own selectedness: a value
        // bound on the select would land before its options exist. Its label goes in as
        // `textContent`, so the formatter's line breaks stay out of the option's text.
        const labelElement = label
            ? html`<label class="control-label" for=${selectId}>${label}</label>`
            : nothing;
        return html`${labelElement}<select
                id=${selectId}
                class=${classList('control-select', selectClass)}
                data-tooltip-text=${tooltipText || nothing}
                @change=${this.#onChange}
            >
                ${repeat(
                    items,
                    (item) => item.value,
                    (item) =>
                        html`<option
                            value=${item.value}
                            .selected=${live(item.value === this.value)}
                            ?disabled=${item.disabled}
                            .textContent=${item.label}
                        ></option>`,
                )}
            </select>`;
    }

    /** @param {Event} event - The select's change. */
    #onChange = (event) => {
        const { value } = /** @type {HTMLSelectElement} */ (event.currentTarget);
        this.value = value;
        this.options.onChange({ value });
    };
}

customElements.define('tba-select-control', SelectControlModule);
