/**
 * SelectControlModule - Reusable dropdown select control for header
 * Creates a <select> with a label and emits events when selection changes.
 * Used for data-driven dropdowns (e.g., domain selector in SL Longitudinal view).
 */

import { BaseModule } from '@tba3/module-base';

export class SelectControlModule extends BaseModule {
    /** @type {string|number|null} */
    #selectedValue = null;
    #items = [];

    /**
     * @param {string} id - Unique identifier
     * @param {string|HTMLElement|null} container - Container element or selector
     * @param {object} options - Configuration options
     * @param {Array<{value: string, label: string}>} [options.items] - Dropdown options
     * @param {string} [options.defaultValue] - Initially selected value
     * @param {string} [options.label] - Label text before the dropdown, bound as the select's accessible name
     * @param {string} [options.tooltipText] - Delegated tooltip on the select (the glossary entry's `tooltip`)
     * @param {string} [options.containerClass=''] - Optional owner-local container CSS class
     * @param {string} [options.selectClass=''] - Optional owner-local select CSS class
     * @param {Function} [options.onSelectionChanged] - Callback when selection changes
     */
    constructor(id, container, options = {}) {
        super(id, container, options);

        this.setDefaults({
            items: [],
            defaultValue: null,
            label: null,
            tooltipText: null,
            containerClass: '',
            selectClass: '',
        });

        this.#items = this.options.items;
        this.#selectedValue = this.options.defaultValue ?? this.#items[0]?.value ?? null;

        if (options.onSelectionChanged) {
            this.registerCallback('selectionChanged', options.onSelectionChanged);
        }
    }

    _doRender() {
        const container = document.createElement('div');
        container.className = [
            'control-field',
            'control-field--inline',
            this.options.containerClass,
        ]
            .filter(Boolean)
            .join(' ');

        const select = document.createElement('select');
        select.id = `${this.id}-select`;
        select.className = ['control-select', this.options.selectClass].filter(Boolean).join(' ');
        if (this.options.tooltipText) {
            select.dataset.tooltipText = this.options.tooltipText;
        }

        // The label is the select's accessible name, so it is bound with `for` rather
        // than merely placed beside it. The header may render once before the glossary
        // label is injected; the axe passes guard against a select that stays unnamed.
        if (this.options.label) {
            const label = document.createElement('label');
            label.className = 'control-label';
            label.htmlFor = select.id;
            label.textContent = this.options.label;
            container.appendChild(label);
        }

        this.#items.forEach((item) => {
            const option = document.createElement('option');
            option.value = item.value;
            option.textContent = item.label;
            if (String(item.value) === String(this.#selectedValue)) {
                option.selected = true;
            }
            select.appendChild(option);
        });

        select.addEventListener('change', (e) => {
            this.#selectedValue = /** @type {HTMLSelectElement} */ (e.target).value;
            this.triggerCallback('selectionChanged', {
                selectedValue: this.#selectedValue,
                selectedLabel: this.#items.find(
                    (i) => String(i.value) === String(this.#selectedValue),
                )?.label,
            });
        });

        container.appendChild(select);
        this.element = container;
        return container;
    }
}
