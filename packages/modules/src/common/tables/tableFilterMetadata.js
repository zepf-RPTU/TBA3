/**
 * Table filter metadata — the bridge between the `headerFilter*` column options
 * the tables already declare and the header-action filter menu that renders them.
 *
 * Column definitions keep declaring `headerFilter` / `headerFilterParams` /
 * `headerFilterFunc`. TableModule extracts them into descriptors and strips the
 * keys before the definitions reach Tabulator, so no column renders a filter row
 * in its header any more — the same declarations now drive the filter dropdown
 * and a single programmatic Tabulator filter.
 *
 * Matching mirrors Tabulator's own header-filter semantics
 * (tabulator-tables, Filter.initializeColumn):
 *   - text filters match partially and case-insensitively ("like")
 *   - list filters match with loose equality ("="), so a "1" option still
 *     matches a numeric row value
 *   - a `headerFilterFunc` overrides both and receives (value, rowValue, rowData)
 *   - a value only counts as set when it is truthy or the number 0
 */

import { getNestedValue } from './tableDataUtils.js';

/**
 * @typedef {object} TableFilterDescriptor
 * @property {string} field - Row data property the filter matches against
 * @property {string} title - Column header text, used as the menu label
 * @property {'input'|'list'} type - Control the menu renders for this field
 * @property {object | Function | null} params - Raw `headerFilterParams` (object or thunk)
 * @property {Function|null} matcher - Raw `headerFilterFunc`, when the column defines one
 */

/**
 * Collect filter descriptors from raw column definitions, recursing into column
 * groups. Columns without a field, without a `headerFilter`, or hidden
 * (`visible: false`) are skipped — a hidden column has no header the user could
 * have filtered on before, so it must not gain one in the menu.
 * @param {Array<object>} columns - Unprocessed Tabulator column definitions
 * @returns {Array<TableFilterDescriptor>} One descriptor per filterable, visible column, in column order.
 */
export function extractTableFilterDescriptors(columns) {
    const descriptors = [];

    const visit = (column) => {
        if (!column || typeof column !== 'object') return;

        if (Array.isArray(column.columns)) {
            column.columns.forEach(visit);
            return;
        }

        if (!column.headerFilter || !column.field || column.visible === false) return;

        descriptors.push({
            field: column.field,
            title: typeof column.title === 'string' && column.title ? column.title : column.field,
            type: column.headerFilter === 'list' ? 'list' : 'input',
            params: column.headerFilterParams ?? null,
            matcher: typeof column.headerFilterFunc === 'function' ? column.headerFilterFunc : null,
        });
    };

    (Array.isArray(columns) ? columns : []).forEach(visit);
    return descriptors;
}

/**
 * Resolve a list descriptor's selectable options.
 *
 * `headerFilterParams` may be a thunk (EN "Stile" builds its values from the
 * live data), so it is only called here — when the menu opens. The optional
 * `sort` comparator receives labels, matching how the callers write it
 * (they special-case the "Alle" label, which is the empty value's label).
 * The empty value is always rendered first: it is the select's clear option.
 * @param {TableFilterDescriptor} descriptor - A list descriptor, whose params may be a thunk evaluated here.
 * @returns {Array<{value: string, label: string}>} The selectable options, the select's clear option first; empty when the descriptor carries no value map.
 */
export function resolveTableFilterOptions(descriptor) {
    const params =
        typeof descriptor?.params === 'function' ? descriptor.params() : descriptor?.params;
    const values = params?.values;
    if (!values || typeof values !== 'object') return [];

    const options = Object.entries(values).map(([value, label]) => ({
        value,
        label: label == null ? value : String(label),
    }));

    if (typeof params.sort === 'function') {
        options.sort((a, b) => params.sort(a.label, b.label));
    }

    const emptyIndex = options.findIndex((option) => option.value === '');
    if (emptyIndex > 0) {
        options.unshift(...options.splice(emptyIndex, 1));
    }

    return options;
}

/**
 * Whether a filter value counts as set. Mirrors Tabulator's default
 * `headerFilterEmptyCheck`: everything falsy except the number 0 is "empty".
 * @param {any} value - The current filter value for one field.
 * @returns {boolean} True when the value should be applied — everything falsy except the number 0 counts as unset.
 */
export function isTableFilterValueSet(value) {
    return Boolean(value) || value === 0;
}

/**
 * Whether a row passes every set filter value (values combine with AND, as
 * Tabulator's header filters did).
 * @param {Array<TableFilterDescriptor>} descriptors - The filterable columns of the current set.
 * @param {{[field: string]: any}} values - Field → current filter value
 * @param {object} rowData - The row being tested.
 * @returns {boolean} True when the row passes every set filter; unset fields are skipped.
 */
export function matchesTableFilters(descriptors, values, rowData) {
    for (const descriptor of descriptors) {
        const value = values?.[descriptor.field];
        if (!isTableFilterValueSet(value)) continue;
        if (!matchesDescriptor(descriptor, value, rowData)) return false;
    }

    return true;
}

/**
 * Match a single row against one descriptor's value.
 * @param {TableFilterDescriptor} descriptor - The column being filtered on.
 * @param {any} value - The current filter value, already known to be set.
 * @param {object} rowData - The row being tested.
 * @returns {boolean} True when the row satisfies this one descriptor.
 */
function matchesDescriptor(descriptor, value, rowData) {
    const rowValue = getNestedValue(rowData ?? {}, descriptor.field);

    if (descriptor.matcher) {
        return Boolean(descriptor.matcher(value, rowValue, rowData));
    }

    if (descriptor.type === 'input') {
        return (
            rowValue != null && String(rowValue).toLowerCase().includes(String(value).toLowerCase())
        );
    }

    // Loose on purpose: mirrors Tabulator's "=" filter, so a "1" list option
    // keeps matching a numeric row value (EN/MA "Ergebnis").
    return rowValue == value;
}
