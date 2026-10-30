/**
 * The bridge between the `headerFilter*` column options the tables declare and the
 * header-action filter menu that renders them.
 *
 * Column definitions declare `headerFilter` / `headerFilterParams`. TableModule
 * extracts them into descriptors and strips the keys before the definitions reach
 * Tabulator, so no column renders a filter row in its header: the declarations drive
 * the filter dropdown and one programmatic Tabulator filter.
 *
 * Matching mirrors Tabulator's own header-filter semantics
 * (tabulator-tables, Filter.initializeColumn):
 *   - text filters match partially and case-insensitively ("like")
 *   - list filters hold several values and pass a row matching any of them, each
 *     with loose equality ("="), so a "1" option still matches a numeric row value
 *   - a value only counts as set when it is a non-empty string or list
 */

import { resolveDotPath } from '@tba3/module-base/glossary';
import { compareText, orderComparator } from '../../utils/compare.js';

/**
 * A list filter's `headerFilterParams`. Without `values`, the options are the distinct
 * values of the column's field in the rows the table can show, read when the menu opens,
 * so they follow every row swap.
 * @typedef {object} ListFilterParams
 * @property {{[value: string]: string}} [values] - A fixed value → label map, listed in its own order unless `sort` is given.
 * @property {(value: any) => string} [label] - The label of a derived value; the value itself by default.
 * @property {((a: string, b: string) => number)|string[]} [sort] - How the labels sort: a comparator or an explicit order; derived options sort alphabetically by default.
 * @property {(cellValue: any) => any[]} [expand] - The option values one cell value contributes (a trait set each trait), which a row then matches; the value itself by default.
 */

/**
 * An input filter's `headerFilterParams`.
 * @typedef {object} TextFilterParams
 * @property {(value: any, rowData: {[field: string]: any}) => string} [text] - The text the typed text is looked for in: what the row's cell shows, where that is not the field's value (a prefixed item number); the value itself by default.
 */

/**
 * One field's filter value: the typed text of an `input` filter, the selected option
 * values of a `list` filter.
 * @typedef {string|string[]} TableFilterValue
 */

/**
 * @typedef {object} TableFilterDescriptor
 * @property {string} field
 * @property {string} title - Column header text, used as the menu label
 * @property {'input'|'list'} type - Control the menu renders for this field
 * @property {ListFilterParams & TextFilterParams} params - The column's `headerFilterParams`
 */

/**
 * The title of a column outside its group's header row (a download, the filter menu),
 * which then names the group.
 * @param {string} groupTitle
 * @param {string} title
 * @returns {string}
 */
export function groupedColumnTitle(groupTitle, title) {
    return `${groupTitle} – ${title}`;
}

/**
 * Collect filter descriptors from raw column definitions, recursing into column
 * groups. Columns without a field, without a `headerFilter`, or that can never be
 * shown (excluded from the column-visibility menu: hidden sort targets, export-only
 * columns) are skipped. A column that merely starts hidden keeps its filter, as one
 * the reader hides does: it can be shown later. A grouped column's label names its
 * group, so two groups' same-titled columns (a GER per domain) stay apart.
 * @param {import('../columnFactories.js').TableColumnDefinition[]} columns - Unprocessed.
 * @returns {Array<TableFilterDescriptor>} One descriptor per filterable column, in column order.
 */
export function extractTableFilterDescriptors(columns) {
    /** @type {TableFilterDescriptor[]} */
    const descriptors = [];

    /**
     * @param {import('../columnFactories.js').TableColumnDefinition} column - A definition or column group.
     * @param {string} [groupTitle] - The title of the column group it sits in, if any.
     */
    const visit = (column, groupTitle) => {
        if (!column || typeof column !== 'object') return;

        if (Array.isArray(column.columns)) {
            const title = typeof column.title === 'string' ? column.title : undefined;
            column.columns.forEach((sub) => visit(sub, title));
            return;
        }

        if (
            !column.headerFilter ||
            !column.field ||
            column.tableMeta?.excludeFromColumnVisibilityMenu === true
        ) {
            return;
        }

        const title =
            typeof column.title === 'string' && column.title ? column.title : column.field;
        descriptors.push({
            field: column.field,
            title: groupTitle ? groupedColumnTitle(groupTitle, title) : title,
            type: column.headerFilter === 'list' ? 'list' : 'input',
            params: column.headerFilterParams ?? {},
        });
    };

    for (const column of Array.isArray(columns) ? columns : []) visit(column);
    return descriptors;
}

/**
 * Resolve a list descriptor's selectable options: the fixed `values`, or the distinct
 * values of the field across `rows` and their tree children.
 * @param {TableFilterDescriptor} descriptor - A list descriptor.
 * @param {Array<{[field: string]: any}>} rows - The rows the table can show.
 * @returns {Array<{value: string, label: string}>}
 */
export function resolveTableFilterOptions(descriptor, rows) {
    const { values, sort, expand } = descriptor.params;
    const options = values
        ? Object.keys(values).map((value) => ({
              value,
              label: tableFilterOptionLabel(descriptor, value),
          }))
        : [...distinctValues(rows, descriptor.field, expand)].map((value) => ({
              value: String(value),
              label: tableFilterOptionLabel(descriptor, value),
          }));

    const comparator = Array.isArray(sort) ? orderComparator(sort) : sort;
    if (comparator || !values) {
        options.sort((a, b) => (comparator ?? compareText)(a.label, b.label));
    }

    return options;
}

/**
 * The label a list filter shows for one option value, without scanning any rows.
 * @param {TableFilterDescriptor} descriptor - A `list` descriptor.
 * @param {any} value
 * @returns {string} The fixed value's text, the derived value's `label`, or the value itself.
 */
export function tableFilterOptionLabel({ params: { values, label } }, value) {
    if (values) return String(values[value] ?? value);
    return label ? label(value) : String(value);
}

/**
 * @param {Array<{[field: string]: any}>} rows
 * @param {string} field - Field to read, dot-nesting allowed.
 * @param {((cellValue: any) => any[])|undefined} expand - See `ListFilterParams`.
 * @returns {Set<any>} The non-empty values, in first-appearance order.
 */
function distinctValues(rows, field, expand) {
    const found = new Set();
    for (const row of rows) {
        const cellValue = resolveDotPath(row, field);
        for (const value of expand ? expand(cellValue) : [cellValue]) {
            if (value !== undefined && value !== null && value !== '') found.add(value);
        }
    }
    return found;
}

/**
 * Whether a filter value counts as set.
 * @param {TableFilterValue|undefined} value
 * @returns {boolean} A non-empty text, or a list with a value selected.
 */
export function isTableFilterValueSet(value) {
    return Array.isArray(value) ? value.length > 0 : Boolean(value);
}

/**
 * Whether a row passes every set filter value (values combine with AND, as
 * Tabulator's header filters do).
 * @param {Array<TableFilterDescriptor>} descriptors - The filterable columns of the current set.
 * @param {{readonly [field: string]: TableFilterValue}} values
 * @param {{[field: string]: any}} rowData
 * @returns {boolean} Unset fields are skipped.
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
 * Match a single row against one descriptor's value: a list filter passes the row when
 * any selected value matches (values within one field combine with OR).
 * @param {TableFilterDescriptor} descriptor
 * @param {TableFilterValue} value - Already known to be set.
 * @param {{[field: string]: any}} rowData
 * @returns {boolean}
 */
function matchesDescriptor(descriptor, value, rowData) {
    const rowValue = resolveDotPath(rowData ?? {}, descriptor.field);

    if (descriptor.type === 'input') {
        const typed = /** @type {string} */ (value);
        const { text } = descriptor.params;
        const shown = text ? text(rowValue, rowData ?? {}) : rowValue;
        return shown != null && String(shown).toLowerCase().includes(typed.toLowerCase());
    }

    const selected = /** @type {string[]} */ (value);
    const { expand } = descriptor.params;
    // Loose equality, as Tabulator's "=" filter: a "1" list option matches a
    // numeric row value (a result code); the options are the values stringified.
    const rowValues = expand ? expand(rowValue) : [rowValue];
    return selected.some((option) => rowValues.some((candidate) => candidate == option));
}
