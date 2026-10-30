/**
 * The header-action dropdown holding a table's column filters: one labelled control
 * per filter descriptor (text input or checkbox list), a mark on the rows that filter,
 * and a clear-all row while any does. It holds no filter state: the owning TableModule
 * supplies the descriptor and value accessors (read on open, so the panel reflects the
 * live column set) and applies every change.
 */

import {
    FOCUSABLE,
    headerActionDropdown,
    headerActionMenuItem,
    headerActionMenuSeparator,
    queryEl,
    renderIcon,
} from '@tba3/module-base';
import { html, nothing, render } from 'lit';
import { live } from 'lit/directives/live.js';
import { repeat } from 'lit/directives/repeat.js';
import { applyTemplateTokens } from '@tba3/module-base/glossary';
import {
    isTableFilterValueSet,
    resolveTableFilterOptions,
    tableFilterOptionLabel,
} from './tableFilterMetadata.js';
import { KeyedTimers } from '../../services/keyedTimers.js';
import './tableFilterMenu.css';

const TABLE_FILTER_BADGE_CLASS = 'table-filter-badge';
const ACTIVE_ROW_CLASS = 'is-active';

/**
 * Live-typing delay for text filters, matching Tabulator's default
 * `headerFilterLiveFilterDelay`. Without it every keystroke
 * re-runs the table filter and the `dataFiltered` fan-out behind it.
 */
const TEXT_FILTER_DEBOUNCE_MS = 300;

let controlIdCounter = 0;

/** @typedef {import('./tableFilterMetadata.js').TableFilterValue} TableFilterValue */
/** @typedef {import('./tableFilterMetadata.js').TableFilterDescriptor} TableFilterDescriptor */

/**
 * The table-filter dropdown of a table's header toolbar. The panel is rebuilt from
 * `getDescriptors()` every time it opens, so it survives column swaps and table
 * recreations. The button shows the number of active filters, so a filter set from
 * outside the menu (`_setTableFilterValue`) or cleared by the preset Reset is still
 * visible while the panel is closed.
 * @param {object} params
 * @param {import('../../glossary/glossaryAnnotator.js').GlossaryAnnotator} params.glossary
 * @param {number} params.activeCount - Number of fields with a value set
 * @param {() => Array<TableFilterDescriptor>} params.getDescriptors
 * @param {(field: string) => TableFilterValue} params.getValue
 * @param {() => Array<{[field: string]: any}>} params.getRows - The rows the table can show, which derived list options are read from
 * @param {(field: string, value: TableFilterValue) => void} params.onChange
 * @param {() => void} params.onClearAll - Drops every filter value at once.
 * @returns {import('lit').TemplateResult}
 */
export function tableFilterMenu({
    glossary,
    activeCount,
    getDescriptors,
    getValue,
    getRows,
    onChange,
    onClearAll,
}) {
    const tableFilterTooltip = glossary.getRequiredEntryText(
        'general.buttons.element_texts.table-filter.tooltip',
    );
    const clearAllLabel = glossary.getRequiredEntryText(
        'general.buttons.element_texts.table-filter-clear.label',
    );
    // The badge is decorative, so the count reaches screen readers through the
    // button's own name.
    const ariaLabel =
        activeCount > 0
            ? applyTemplateTokens(
                  glossary.getRequiredEntryText(
                      'general.buttons.element_texts.table-filter-active.label',
                  ),
                  { label: tableFilterTooltip, count: activeCount },
              )
            : tableFilterTooltip;

    return headerActionDropdown({
        name: 'table-filters',
        // Form controls, not menu items: role="menu" would mis-announce them.
        role: 'group',
        ariaLabel,
        tooltipText: tableFilterTooltip,
        menuLabel: tableFilterTooltip,
        // Sliders, not a funnel: a card's own filter control may carry the funnel in
        // the same toolbar, and two funnels there read as one control.
        buttonContent: html`${renderIcon('tune')}<span
                class=${TABLE_FILTER_BADGE_CLASS}
                aria-hidden="true"
                ?hidden=${activeCount === 0}
                >${activeCount > 0 ? String(activeCount) : ''}</span
            >`,
        dropdownClass: 'header-action-dropdown--scrollable styled-scrollbar table-filter-panel',
        buildMenu: (dropdown) =>
            renderFilterPanel(dropdown, {
                getDescriptors,
                getValue,
                getRows,
                onChange,
                clearAllLabel,
                allLabel: glossary.getRequiredEntryText(
                    'general.buttons.element_texts.table-filter-all.label',
                ),
                selectedLabel: glossary.getRequiredEntryText(
                    'general.buttons.element_texts.table-filter-selected.label',
                ),
                onClearAll,
            }),
    });
}

/**
 * Render the panel body: one row per filter descriptor, then the clear-all row, which
 * shows only while some row filters. lit-html owns the panel's children; every change
 * renders it again from the table's values, which patches the controls in place.
 * @param {HTMLElement} dropdown
 * @param {object} handlers
 * @param {() => Array<TableFilterDescriptor>} handlers.getDescriptors
 * @param {(field: string) => TableFilterValue} handlers.getValue
 * @param {() => Array<{[field: string]: any}>} handlers.getRows - The rows derived list options are read from.
 * @param {(field: string, value: TableFilterValue) => void} handlers.onChange
 * @param {string} handlers.clearAllLabel
 * @param {string} handlers.allLabel - A list filter's summary while nothing is selected.
 * @param {string} handlers.selectedLabel - A list filter's summary while several values are selected, with a `{{ count }}` token.
 * @param {() => void} handlers.onClearAll
 */
function renderFilterPanel(
    dropdown,
    {
        getDescriptors,
        getValue,
        getRows,
        onChange,
        clearAllLabel,
        allLabel,
        selectedLabel,
        onClearAll,
    },
) {
    // Rows and descriptors stay fixed while the panel is open, so each list resolves
    // its options once per open, on its first expand. Only a list without fixed
    // values derives them from the rows.
    /** @type {Array<{[field: string]: any}>|undefined} */
    let rows;
    /** @type {Map<string, Array<{value: string, label: string}>>} */
    const options = new Map();
    /**
     * @param {TableFilterDescriptor} descriptor - A list descriptor.
     * @returns {Array<{value: string, label: string}>}
     */
    const optionsFor = (descriptor) => {
        let resolved = options.get(descriptor.field);
        if (!resolved) {
            resolved = resolveTableFilterOptions(
                descriptor,
                descriptor.params.values ? [] : (rows ??= getRows()),
            );
            options.set(descriptor.field, resolved);
        }
        return resolved;
    };
    const descriptors = getDescriptors() ?? [];
    const controlIds = new Map(
        descriptors.map((descriptor) => [
            descriptor.field,
            `table-filter-control-${++controlIdCounter}`,
        ]),
    );
    /** Pending text-filter applies, per field. */
    const pending = new KeyedTimers();
    /** @type {Set<string>} The list filters whose checkboxes show; every open starts with none. */
    const expanded = new Set();

    /**
     * @param {string} field
     * @param {TableFilterValue} value
     */
    const apply = (field, value) => {
        pending.cancel(field);
        onChange(field, value);
        paint();
    };
    /** @type {FilterRowHandlers} */
    const rowHandlers = {
        optionsFor,
        allLabel,
        selectedLabel,
        apply,
        isExpanded: (field) => expanded.has(field),
        // An expanded list low in a scrolling panel opens below its fold, so it is
        // scrolled into view, then its summary button: a list taller than the panel
        // shows its top under the button instead of hiding the button.
        toggleExpanded: (field, listId) => {
            const opening = !expanded.delete(field);
            if (opening) expanded.add(field);
            paint();
            if (!opening) return;
            queryEl(dropdown, `#${listId}`)?.scrollIntoView({ block: 'nearest' });
            queryEl(dropdown, `#${controlIds.get(field)}`)?.scrollIntoView({ block: 'nearest' });
        },
        // Typing filters live, but one re-filter per pause instead of per
        // keystroke; `change` (blur / Enter) flushes the pending one.
        defer: (field, value) => {
            pending.schedule(field, TEXT_FILTER_DEBOUNCE_MS, () => apply(field, value));
        },
    };
    const onClear = () => {
        pending.clear();
        onClearAll();
        paint();
        queryEl(dropdown, FOCUSABLE)?.focus();
    };

    /** Render the panel from the table's current values. */
    function paint() {
        const values = descriptors.map((descriptor) => getValue(descriptor.field));
        const fieldRows = repeat(
            descriptors,
            (descriptor) => descriptor.field,
            (descriptor, index) =>
                fieldRowTemplate(
                    descriptor,
                    values[index],
                    /** @type {string} */ (controlIds.get(descriptor.field)),
                    rowHandlers,
                ),
        );
        // The same action row as the column menu's "Alle Spalten einblenden", shown
        // only while a filter is set.
        const clearRow = !values.some(isTableFilterValueSet)
            ? nothing
            : html`${headerActionMenuSeparator()}${headerActionMenuItem(
                  {
                      label: clearAllLabel,
                      icon: 'clear_all',
                      buttonClass: 'table-filter-clear',
                  },
                  null,
                  onClear,
              )}`;
        render(html`${fieldRows}${clearRow}`, dropdown);
    }

    paint();
}

/**
 * What a filter row hands its edits to.
 * @typedef {object} FilterRowHandlers
 * @property {(descriptor: TableFilterDescriptor) => Array<{value: string, label: string}>} optionsFor - A list filter's selectable options.
 * @property {string} allLabel - A list filter's summary while nothing is selected.
 * @property {string} selectedLabel - A list filter's summary while several values are selected.
 * @property {(field: string, value: TableFilterValue) => void} apply - Applies an edited value now.
 * @property {(field: string, value: string) => void} defer - Applies a typed value once typing pauses.
 * @property {(field: string) => boolean} isExpanded - Whether a list filter's checkboxes show.
 * @property {(field: string, listId: string) => void} toggleExpanded - Shows or hides a list filter's checkboxes (the list `listId`).
 */

/**
 * @param {Event} event - An edit of a text filter.
 * @returns {string}
 */
function inputValue(event) {
    return /** @type {HTMLInputElement} */ (event.currentTarget).value;
}

/**
 * One labelled filter control: a text input for `input` descriptors, a disclosure
 * button over a checkbox list for `list` descriptors. The panel is a role="group",
 * not a list: the row is only a layout box.
 * @param {TableFilterDescriptor} descriptor
 * @param {TableFilterValue} value
 * @param {string} controlId - The control's id, which its label points at.
 * @param {FilterRowHandlers} handlers
 * @returns {import('lit').TemplateResult}
 */
function fieldRowTemplate(descriptor, value, controlId, handlers) {
    const { field } = descriptor;
    const control =
        descriptor.type === 'list'
            ? listControl(descriptor, /** @type {string[]} */ (value), controlId, handlers)
            : html`<input
                  type="text"
                  id=${controlId}
                  class="control-input table-filter-field-control"
                  .value=${live(/** @type {string} */ (value))}
                  @input=${(/** @type {Event} */ event) => handlers.defer(field, inputValue(event))}
                  @change=${(/** @type {Event} */ event) => handlers.apply(field, inputValue(event))}
              />`;
    const rowClass = isTableFilterValueSet(value)
        ? `table-filter-field ${ACTIVE_ROW_CLASS}`
        : 'table-filter-field';
    return html`<li class=${rowClass} role="none">
        <label class="control-label" id="${controlId}-label" for=${controlId}
            >${descriptor.title}</label
        >
        ${control}
    </li>`;
}

/**
 * A list filter's control: a summary button naming the selection ("Alle", the one
 * label, or "n ausgewählt") that shows a checkbox per option below it. The checked
 * values filter with OR.
 * @param {TableFilterDescriptor} descriptor
 * @param {string[]} selected
 * @param {string} controlId - The button's id.
 * @param {FilterRowHandlers} handlers
 * @returns {import('lit').TemplateResult} The button, and the checkbox list while it is expanded.
 */
function listControl(descriptor, selected, controlId, handlers) {
    const { field } = descriptor;
    const expanded = handlers.isExpanded(field);
    const labelId = `${controlId}-label`;
    const listId = `${controlId}-options`;
    const summary =
        selected.length === 0
            ? handlers.allLabel
            : selected.length === 1
              ? tableFilterOptionLabel(descriptor, selected[0])
              : applyTemplateTokens(handlers.selectedLabel, { count: selected.length });
    // Named by the row label and the summary, so the selection is announced too.
    return html`<button
            type="button"
            id=${controlId}
            class="control-select table-filter-field-control table-filter-list-toggle"
            aria-labelledby="${labelId} ${controlId}"
            aria-expanded=${expanded ? 'true' : 'false'}
            aria-controls=${listId}
            @click=${() => handlers.toggleExpanded(field, listId)}
        >
            <span class="table-filter-list-summary">${summary}</span
            >${renderIcon('keyboard_arrow_down')}
        </button>
        ${expanded ? optionList(descriptor, selected, listId, labelId, handlers) : nothing}`;
}

/**
 * A list filter's checkboxes, one per option. Its options resolve only here, so a
 * collapsed list never scans the table's rows.
 * @param {TableFilterDescriptor} descriptor
 * @param {string[]} selected
 * @param {string} listId - The list's id, which the summary button controls.
 * @param {string} labelId - The row label's id, which names the list.
 * @param {FilterRowHandlers} handlers
 * @returns {import('lit').TemplateResult}
 */
function optionList(descriptor, selected, listId, labelId, handlers) {
    const { field } = descriptor;
    const options = handlers.optionsFor(descriptor);
    // Toggles against the selection, not the options: a selected value the rows do not
    // offer (the persistent filters narrowed them) stays selected.
    /**
     * @param {{id: string}} option
     * @returns {void}
     */
    const onToggle = ({ id }) =>
        handlers.apply(
            field,
            selected.includes(id) ? selected.filter((value) => value !== id) : [...selected, id],
        );
    return html`<ul
        id=${listId}
        class="table-filter-options"
        role="group"
        aria-labelledby=${labelId}
    >
        ${options.map(({ value, label }) =>
            headerActionMenuItem(
                { id: value, label, checked: selected.includes(value) },
                'checkbox',
                onToggle,
            ),
        )}
    </ul>`;
}
