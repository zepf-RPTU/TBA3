/**
 * Table filter menu — the header-action dropdown that replaced the per-column
 * Tabulator header filters.
 *
 * A self-contained widget next to the column-visibility menu: it renders one
 * labelled control per filter descriptor (text input or single select). Clearing
 * everything at once is the preset Reset button's job, so the panel has no reset
 * action of its own. It holds no filter state — the owning TableModule
 * supplies the descriptor/value accessors (read lazily on open, so the panel
 * always reflects the live column set) and applies every change.
 */

import { glossaryAnnotator } from '../../glossary/glossaryAnnotator.js';
import { ensureHeaderActionDropdownControl } from '@tba3/module-base/modules/header/headerActionDropdown.js';
import { resolveTableFilterOptions } from '../tableFilterMetadata.js';
import { iconSvg } from '@tba3/module-base/utils/icons.js';
import './tableFilterMenu.css';

/** DOM selector identifying the table-filter control wrapper in a header-actions toolbar. */
export const TABLE_FILTER_CONTROL_SELECTOR = '[data-header-action-control="table-filters"]';

const TABLE_FILTER_BADGE_CLASS = 'table-filter-badge';
const TEXT_FILTER_PLACEHOLDER = 'Suchen…';

/**
 * Live-typing delay for text filters, matching the `headerFilterLiveFilterDelay`
 * of the Tabulator header filters this menu replaced. Without it every keystroke
 * re-runs the table filter and the `dataFiltered` fan-out behind it.
 */
const TEXT_FILTER_DEBOUNCE_MS = 300;

// Sliders, not a funnel: the EN class table already spends the funnel icon on its
// scatterplot student filter, and two funnels in one toolbar read as one control.
const TABLE_FILTER_ICON_HTML = iconSvg('tune');

let controlIdCounter = 0;

/**
 * Creates the table-filter dropdown button inside a header-actions toolbar.
 *
 * Idempotent: if the control already exists in `headerActions`, it is left
 * untouched — the panel is rebuilt from `getDescriptors()` every time it opens,
 * so it survives column swaps and table recreations without being rebuilt.
 * @param {object} params - Where to mount the control, and how it reads and writes the table’s filter state.
 * @param {HTMLElement|null} params.headerActions - The header-actions container to mount into
 * @param {() => Array<import('../tableFilterMetadata.js').TableFilterDescriptor>} params.getDescriptors - Current filterable columns
 * @param {(field: string) => any} params.getValue - Current value of one field
 * @param {(field: string, value: any) => void} params.onChange - Called when a control changes
 */
export function createTableFilterMenu({ headerActions, getDescriptors, getValue, onChange }) {
    if (!headerActions) return;
    if (headerActions.querySelector(TABLE_FILTER_CONTROL_SELECTOR)) return;

    const tableFilterTooltip = glossaryAnnotator.getRequiredEntryText(
        'general.buttons.element_texts.table-filter.tooltip',
    );

    const control = ensureHeaderActionDropdownControl(headerActions, {
        wrapperSelector: TABLE_FILTER_CONTROL_SELECTOR,
        wrapperAttributes: {
            'data-header-action-control': 'table-filters',
        },
        buttonAttributes: {
            'data-header-action-button': 'table-filters',
        },
        ariaLabel: tableFilterTooltip,
        tooltipText: tableFilterTooltip,
        buttonHTML: `${TABLE_FILTER_ICON_HTML}<span class="${TABLE_FILTER_BADGE_CLASS}" aria-hidden="true" hidden></span>`,
        dropdownClass:
            'header-action-dropdown header-action-dropdown--scrollable table-filter-panel',
        buildMenu: (dropdown) =>
            renderFilterPanel(dropdown, { getDescriptors, getValue, onChange }),
    });

    // The panel holds form controls, not menu items — role="menu" (the shared
    // dropdown default) would mis-announce them to screen readers.
    control?.dropdown.setAttribute('role', 'group');
    control?.dropdown.setAttribute('aria-label', tableFilterTooltip);
}

/**
 * Reflect the number of active filters on the toolbar button, so a filter set
 * from outside the menu (MA's KS chart sync) or cleared by the preset Reset is
 * still visible while the panel is closed.
 * @param {HTMLElement|null} headerActions - The header-actions container
 * @param {number} activeCount - Number of fields with a value set
 */
export function syncTableFilterMenuButton(headerActions, activeCount) {
    const badge = headerActions?.querySelector(
        `${TABLE_FILTER_CONTROL_SELECTOR} .${TABLE_FILTER_BADGE_CLASS}`,
    );
    if (!badge) return;

    badge.textContent = activeCount > 0 ? String(activeCount) : '';
    /** @type {HTMLElement} */ (badge).hidden = activeCount === 0;

    // The badge itself is decorative, so the count has to reach screen readers
    // through the button's own name — otherwise "a filter is active" is a
    // purely visual signal.
    const button = headerActions?.querySelector(
        `${TABLE_FILTER_CONTROL_SELECTOR} button[aria-haspopup]`,
    );
    const baseLabel = button?.getAttribute('data-tooltip-text');
    if (!button || !baseLabel) return;

    button.setAttribute(
        'aria-label',
        activeCount > 0 ? `${baseLabel} (${activeCount} aktiv)` : baseLabel,
    );
}

/**
 * (Re)render the panel body: one row per filter descriptor.
 * @param {HTMLElement} dropdown - Panel body element whose children are replaced.
 * @param {object} handlers - Live accessors into the owning table’s filter state.
 * @param {Function} handlers.getDescriptors - Returns the filter descriptors to render a row for.
 * @param {Function} handlers.getValue - Reads the current value of one descriptor.
 * @param {Function} handlers.onChange - Applies an edited value back to the table.
 */
function renderFilterPanel(dropdown, { getDescriptors, getValue, onChange }) {
    const fragment = document.createDocumentFragment();

    for (const descriptor of getDescriptors() ?? []) {
        fragment.appendChild(createFieldRow(descriptor, { getValue, onChange }));
    }

    dropdown.replaceChildren(fragment);
}

/**
 * One labelled filter control: a text input for `input` descriptors, a single
 * select for `list` descriptors.
 * @param {import('../tableFilterMetadata.js').TableFilterDescriptor} descriptor - The field to build a control for.
 * @param {object} handlers - Live accessors into the owning table’s filter state.
 * @param {Function} handlers.getValue - Reads the current value of this descriptor.
 * @param {Function} handlers.onChange - Applies an edited value back to the table.
 * @returns {HTMLLIElement} The row element, a layout box with `role="none"`.
 */
function createFieldRow(descriptor, { getValue, onChange }) {
    const listItem = document.createElement('li');
    // The panel is a role="group", not a list — the row is only a layout box.
    listItem.setAttribute('role', 'none');
    listItem.className = 'table-filter-field control-field';

    const controlId = `table-filter-control-${++controlIdCounter}`;
    const label = document.createElement('label');
    label.className = 'control-label';
    label.htmlFor = controlId;
    label.textContent = descriptor.title;

    const control =
        descriptor.type === 'list'
            ? createListControl(descriptor, getValue(descriptor.field))
            : createTextControl(getValue(descriptor.field));

    control.id = controlId;
    control.className = 'table-filter-field-control';
    control.dataset.tableFilterField = descriptor.field;

    const apply = () => onChange(descriptor.field, control.value);

    if (descriptor.type === 'list') {
        control.addEventListener('change', apply);
    } else {
        // Typing filters live, but one re-filter per pause instead of per
        // keystroke; `change` (blur / Enter) flushes the pending one.
        let debounceTimer = null;
        control.addEventListener('input', () => {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(apply, TEXT_FILTER_DEBOUNCE_MS);
        });
        control.addEventListener('change', () => {
            clearTimeout(debounceTimer);
            apply();
        });
    }

    listItem.append(label, control);
    return listItem;
}

/**
 * @param {any} value - Current filter value
 * @returns {HTMLInputElement} A text input seeded with the current value.
 */
function createTextControl(value) {
    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = TEXT_FILTER_PLACEHOLDER;
    input.value = value == null ? '' : String(value);
    return input;
}

/**
 * @param {import('../tableFilterMetadata.js').TableFilterDescriptor} descriptor - The column being filtered, whose options are resolved here.
 * @param {any} value - Current filter value
 * @returns {HTMLSelectElement} A select seeded with the current value, its clear option first.
 */
function createListControl(descriptor, value) {
    const select = document.createElement('select');

    for (const option of resolveTableFilterOptions(descriptor)) {
        select.appendChild(new Option(option.label, option.value));
    }

    select.value = value == null ? '' : String(value);
    return select;
}
