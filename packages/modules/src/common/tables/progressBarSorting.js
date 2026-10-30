/**
 * Multi-field header sorting for progress-bar and Pilotierung columns.
 *
 * A column declares its sort cycle as `tableMeta.progressBarSortSteps`; one header
 * click advances the cycle (correct → not attempted → incorrect, or value → Δ) and
 * the click after the last step leaves the table unsorted. Tabulator sorts by the
 * column's own field, and the column's sorter reads the step in force back through
 * getProgressBarSortField(). The header title highlights the step's label: in place
 * for a column whose title contains its labels (`tableMeta.progressBarSortLabelsInTitle`,
 * Pilotierung (Δ)), after the title otherwise (Verteilung: Richtig). A repaint can change
 * a header's line count, so it re-pins Tabulator's header heights.
 */

import { setTrustedHTML } from '@tba3/module-base';

/**
 * One step of a header-click sort cycle.
 * @typedef {object} ProgressBarSortStep
 * @property {string} field - The row field the step sorts by.
 * @property {string} label - The step's label, highlighted in the column title or shown below it.
 * @property {'asc'|'desc'} dir
 */

/**
 * A column as the sort cycle reads it: its field, its header element and its definition.
 * @typedef {{
 *   getField(): string,
 *   getElement(): HTMLElement,
 *   getDefinition(): Pick<import('tabulator-tables').ColumnDefinition, 'title'|'titleFormatter'>,
 * }} SortColumn
 */

/**
 * What the sort cycle reads of a table: its root element (where it takes the header
 * clicks), the column default, the columns by field, the sort calls and the redraw that
 * re-pins the header heights. Any object with these members serves as the registry key,
 * so a test hands in a stand-in.
 * @typedef {{
 *   element: HTMLElement,
 *   options?: {columnDefaults?: {headerSort?: boolean}},
 *   initialized: boolean,
 *   redraw(force?: boolean): void,
 *   getColumn(field: string): SortColumn|false|undefined,
 *   setSort(column: string, dir: 'asc'|'desc'): void,
 *   clearSort(): void,
 * }} SortTable
 */

/**
 * A column's declared sort cycle.
 * @typedef {object} SortCycle
 * @property {ReadonlyArray<ProgressBarSortStep>} steps - In click order.
 * @property {boolean} labelsInTitle - Whether the column's title contains its steps' labels.
 */

/**
 * The per-table registry: the declared cycles and the one step in force.
 * @typedef {object} ProgressBarSortStore
 * @property {Map<string, SortCycle>} columns - Sort cycle per column field.
 * @property {string|null} activeColumnField - The column whose step is in force, or null.
 * @property {number} activeStep - Index of that step in the column's cycle.
 */

/** @type {WeakMap<object, ProgressBarSortStore>} */
const progressBarSortRegistry = new WeakMap();

/**
 * Collect the declared sort cycles of a column set, column groups included.
 * @param {import('./columnFactories.js').TableColumnDefinition[]} columns - Unprocessed.
 * @param {boolean} sortable - The table's default for a column without its own `headerSort`.
 * @param {Map<string, SortCycle>} [into]
 * @returns {Map<string, SortCycle>} Sort cycle per column field.
 */
function collectSortSteps(columns, sortable, into = new Map()) {
    for (const column of columns) {
        const steps = column.tableMeta?.progressBarSortSteps;
        // An unsortable column opts out: a header click must not start the cycle.
        if (column.field && steps && (column.headerSort ?? sortable)) {
            into.set(column.field, {
                steps,
                labelsInTitle: Boolean(column.tableMeta?.progressBarSortLabelsInTitle),
            });
        }
        if (Array.isArray(column.columns)) collectSortSteps(column.columns, sortable, into);
    }
    return into;
}

/**
 * Register a column set's declared sort cycles on its table, replacing the previous
 * set's and starting unsorted. Installs the shared header-click handler once per
 * table, in the capture phase on the table root: Tabulator sorts from a click listener
 * on the header element itself, which a handler on the root's bubbling side runs after,
 * so a cycle column's click is taken before Tabulator's sort sees it. The headers are
 * painted by the next resetProgressBarSorting().
 * @param {SortTable} table
 * @param {import('./columnFactories.js').TableColumnDefinition[]} columns - Unprocessed.
 */
export function setupProgressBarSorting(table, columns) {
    const existing = progressBarSortRegistry.get(table);
    const cycles = collectSortSteps(columns, table.options?.columnDefaults?.headerSort ?? true);
    if (existing) {
        existing.columns = cycles;
        existing.activeColumnField = null;
        return;
    }

    /** @type {ProgressBarSortStore} */
    const store = { columns: cycles, activeColumnField: null, activeStep: 0 };
    progressBarSortRegistry.set(table, store);

    table.element.addEventListener(
        'click',
        (event) => {
            const header =
                event.target instanceof Element
                    ? event.target.closest('.tabulator-col[tabulator-field]')
                    : null;
            const clickedField = header?.getAttribute('tabulator-field') ?? '';
            const steps = store.columns.get(clickedField)?.steps;
            if (!steps) return;

            event.stopImmediatePropagation();
            advanceCycle(table, store, clickedField, steps);
        },
        { capture: true },
    );
}

/**
 * One header click on a cycle column: its next step, or after the last the table
 * unsorted.
 * @param {SortTable} table
 * @param {ProgressBarSortStore} store
 * @param {string} clickedField
 * @param {ReadonlyArray<ProgressBarSortStep>} steps - The column's cycle.
 */
function advanceCycle(table, store, clickedField, steps) {
    const nextStep = store.activeColumnField === clickedField ? store.activeStep + 1 : 0;
    if (nextStep >= steps.length) {
        resetProgressBarSorting(table);
        table.clearSort();
        return;
    }

    setActiveStep(table, store, clickedField, nextStep);
}

/**
 * Put one column's step in force: sort the table by the column and repaint the
 * headers. The state is set before `setSort`, so the `dataSorted` it dispatches
 * already reads the new step.
 * @param {SortTable} table
 * @param {ProgressBarSortStore} store
 * @param {string} columnField
 * @param {number} stepIndex
 */
function setActiveStep(table, store, columnField, stepIndex) {
    const { steps } = /** @type {SortCycle} */ (store.columns.get(columnField));
    store.activeColumnField = columnField;
    store.activeStep = stepIndex;
    table.setSort(columnField, steps[stepIndex].dir);
    paintHeaders(table, store);
    realignHeaders(table);
}

/**
 * The row field a progress-bar column's sorter compares by: its step in force, or
 * the first step's field while another column (or none) is sorted.
 * @param {SortTable} table
 * @param {string} columnField
 * @returns {string|null} The sort field, or null when the column declared no cycle.
 */
export function getProgressBarSortField(table, columnField) {
    const store = progressBarSortRegistry.get(table);
    const steps = store?.columns.get(columnField)?.steps;
    if (!store || !steps) return null;
    return steps[store.activeColumnField === columnField ? store.activeStep : 0].field;
}

/**
 * The step in force, as a key that changes exactly when it does. Tabulator's sorters
 * name only the column, so two steps of one column look alike without it.
 * @param {SortTable} table
 * @returns {string} The column and step, or '' when no progress-bar column is sorted.
 */
export function progressBarSortKey(table) {
    const store = progressBarSortRegistry.get(table);
    if (!store?.activeColumnField) return '';
    return `${store.activeColumnField}#${store.activeStep}`;
}

/**
 * Return every progress-bar column of a table to the start of its cycle and paint
 * the headers without a highlight.
 * @param {SortTable} table
 */
export function resetProgressBarSorting(table) {
    const store = progressBarSortRegistry.get(table);
    if (!store) return;

    // Unsorted already (a fresh build or column set), the headers keep the titles
    // they were laid out with, and so their heights.
    const highlighted = store.activeColumnField !== null;
    store.activeColumnField = null;
    paintHeaders(table, store);
    if (highlighted) realignHeaders(table);
}

/**
 * Sort a table by one of its progress-bar columns, programmatically.
 * @param {SortTable} table
 * @param {string} sortKey - The column field (its first field with this direction), or one of its steps' fields.
 * @param {'asc'|'desc'} dir
 * @returns {boolean} False when the key belongs to no column.
 */
export function applyProgressBarSorting(table, sortKey, dir) {
    const store = progressBarSortRegistry.get(table);
    if (!store) return false;

    for (const [columnField, { steps }] of store.columns) {
        const stepIndex = steps.findIndex(
            (step) => step.dir === dir && (columnField === sortKey || step.field === sortKey),
        );
        if (stepIndex !== -1) {
            setActiveStep(table, store, columnField, stepIndex);
            return true;
        }
    }

    return false;
}

/**
 * Paint each registered column's header title, highlighting the label of the step
 * in force. The title runs through the column's own titleFormatter, so it keeps the
 * glossary annotation it was built with.
 * @param {SortTable} table
 * @param {ProgressBarSortStore} store
 */
function paintHeaders(table, store) {
    for (const [columnField, { steps, labelsInTitle }] of store.columns) {
        const column = table.getColumn(columnField);
        // `false`, not null, when no column has the field.
        if (!column) continue;
        const titleElement = column.getElement().querySelector('.tabulator-col-title');
        if (!titleElement) continue;

        const definition = column.getDefinition();
        const title = definition.title ?? '';
        if (store.activeColumnField !== columnField) {
            setTrustedHTML(titleElement, formatTitle(definition, title));
            continue;
        }

        const { label } = steps[store.activeStep];
        const active = `<span class="progress-bar-sort-active">${label}</span>`;
        setTrustedHTML(
            titleElement,
            labelsInTitle
                ? formatTitle(definition, title.replace(label, active))
                : `${formatTitle(definition, title)}: ${active}`,
        );
    }
}

/**
 * Pin the header heights again after a repaint. Tabulator pins every header's height
 * when it lays the headers out (`ColumnManager.verticalAlignHeaders()`), so a title
 * that gained a line would be cut off. The redraw is not forced: a forced one resets
 * the body scroll (see TableHeaderGeometry#attach). A table still building lays its
 * headers out itself.
 * @param {SortTable} table
 */
function realignHeaders(table) {
    if (table.initialized) table.redraw(false);
}

/**
 * Title markup run through the column's own titleFormatter, as the header was built.
 * @param {ReturnType<SortColumn['getDefinition']>} definition
 * @param {string} text - Title markup.
 * @returns {string}
 */
function formatTitle(definition, text) {
    const { titleFormatter } = definition;
    if (typeof titleFormatter !== 'function') return text;
    // A stand-in header cell: a titleFormatter reads only the title.
    const cell = /** @type {import('tabulator-tables').CellComponent} */ (
        /** @type {unknown} */ ({ getValue: () => text })
    );
    const formatted = titleFormatter(cell, {}, () => {});
    return typeof formatted === 'string' ? formatted : formatted.outerHTML;
}
