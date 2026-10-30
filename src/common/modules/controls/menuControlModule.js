/**
 * MenuControlModule — a labelled menu button that picks one of its items, for a choice
 * whose report has a large effect (a dataset switch reloads the page): unlike a
 * `<select>`, an arrow key on the closed control changes nothing, only an explicit pick
 * (WCAG 3.2.2).
 */

import { BaseModule, headerActionRadioDropdown, renderIcon } from '@tba3/module-base';
import { html, nothing } from 'lit';
import './menuControlModule.css';

/** @typedef {{value: string, label: string}} MenuControlItem */

/**
 * @typedef {import('@tba3/module-base').BaseOptions & {
 *   items: ReadonlyArray<MenuControlItem>,
 *   value?: string | null,
 *   label?: string,
 *   tooltipText?: string,
 *   containerClass?: string,
 *   onChange: (data: {value: string}) => void,
 * }} MenuControlOptions
 */

/**
 * What the field shows; the header replaces it through `view`.
 * @typedef {Pick<MenuControlOptions, 'items' | 'value' | 'label' | 'tooltipText' | 'containerClass'>} MenuControlView
 */

/** @augments {BaseModule<MenuControlOptions>} */
export class MenuControlModule extends BaseModule {
    /** @override */
    static properties = {
        // Every assignment is a new declaration to show, even the same object rewritten.
        view: { attribute: false, hasChanged: () => true },
    };

    /** @type {string|null} */
    #value = null;

    constructor() {
        super();
        /** @type {MenuControlView|null} What the field shows: the options until an owner brings another. */
        this.view = null;
    }

    /** @override */
    _setup() {
        super._setup();
        this.view ??= this.options;
    }

    /**
     * A new declaration brings the value it shows, else its first item.
     * @override
     * @param {import('lit').PropertyValues<this>} changed
     */
    willUpdate(changed) {
        const view = this.view;
        if (!view) return;
        if (changed.has('view')) this.#value = view.value ?? view.items[0]?.value ?? null;
        this.className = ['control-field control-field--inline', view.containerClass]
            .filter(Boolean)
            .join(' ');
    }

    /**
     * The field is the element: a visible label, then the trigger showing the current
     * choice. The trigger's name is label and choice, as the label is no `<label>`.
     * @override
     * @returns {unknown}
     */
    render() {
        if (!this.view) return nothing;
        const { items, label = '', tooltipText = '' } = this.view;
        const current = items.find((item) => item.value === this.#value)?.label ?? '';
        return html`<span class="control-label" aria-hidden="true">${label}</span
            >${headerActionRadioDropdown({
                family: 'text',
                ariaLabel: label ? `${label}: ${current}` : current,
                tooltipText,
                buttonClass: 'control-select control-menu-trigger',
                buttonContent: html`<span class="control-menu-value">${current}</span>${renderIcon(
                        'keyboard_arrow_down',
                    )}`,
                menuLabel: label || null,
                placement: 'bottom-start',
                options: items.map(({ value, label: itemLabel }) => ({
                    id: value,
                    label: itemLabel,
                })),
                getSelected: () => this.#value,
                onSelect: (value) => {
                    this.#value = value;
                    this.requestUpdate();
                    this.options.onChange({ value });
                },
            })}`;
    }
}

customElements.define('tba-menu-control', MenuControlModule);
