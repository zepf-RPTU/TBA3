/**
 * Multi-field header sorting for progress-bar and Pilotierung columns.
 *
 * A per-table registry holds one sort state per registered column, so a single
 * header click cycles through that column's sort fields (correct → not
 * attempted → incorrect, or value → Δ) and back to unsorted, while the header
 * title highlights the field in force. The column definitions live beside this
 * file and read the registry through getRegisteredProgressBarSortState().
 */

import { glossaryAnnotator } from '../glossary/glossaryAnnotator.js';
import { LABELS } from './tableLabels.js';

const PROGRESS_BAR_COLUMN_FIELD = 'percentageCombined';

const PROGRESS_BAR_SORT_SEQUENCE = Object.freeze([
    null,
    { fieldKey: 'correctSort', dir: 'asc' },
    { fieldKey: 'correctSort', dir: 'desc' },
    { fieldKey: 'notAttemptedSort', dir: 'asc' },
    { fieldKey: 'notAttemptedSort', dir: 'desc' },
    { fieldKey: 'incorrectSort', dir: 'asc' },
    { fieldKey: 'incorrectSort', dir: 'desc' },
]);

// 2-field variant: cycles through primary (correctSort) and secondary (incorrectSort) only.
const DUAL_FIELD_SORT_SEQUENCE = Object.freeze([
    null,
    { fieldKey: 'correctSort', dir: 'asc' },
    { fieldKey: 'correctSort', dir: 'desc' },
    { fieldKey: 'incorrectSort', dir: 'asc' },
    { fieldKey: 'incorrectSort', dir: 'desc' },
]);

/**
 * Pilotierung column field names and labels.
 *
 * These are shared between createPilotierungColumn and setupPilotierungColumnSorting
 * so the column definition and its sort registration cannot drift apart. The column
 * title MUST contain both labels verbatim because updateProgressBarHeaderHighlight()
 * highlights the active sort field by string-replacing its label inside the title.
 */
export const PILOTIERUNG_VALUE_FIELD = 'pilotierungswert';
export const PILOTIERUNG_DIFF_FIELD = 'pilotierungsDiff';
export const PILOTIERUNG_VALUE_LABEL = 'Pilotierung';
export const PILOTIERUNG_DIFF_LABEL = 'Δ';

const progressBarSortRegistry = new WeakMap();

/**
 * Glossary-annotate a column header title, when the annotator is up.
 * @param {string} titleHtml - The header markup.
 * @returns {string} The annotated markup, or the input unchanged when annotation is unavailable.
 */
function annotateHeaderTitle(titleHtml) {
    if (!glossaryAnnotator.isInitialized || !titleHtml || typeof titleHtml !== 'string') {
        return titleHtml;
    }

    return glossaryAnnotator.annotateHTML(titleHtml);
}

/**
 * The per-table registry of progress-bar sort states.
 * @param {object} table - Tabulator table instance.
 * @param {boolean} [create=false] - Create the store when the table has none yet.
 * @returns {object|null} The store, or null when the table has none and `create` is false.
 */
function getProgressBarSortStore(table, create = false) {
    let store = progressBarSortRegistry.get(table);

    if (!store && create) {
        store = {
            activeColumnField: null,
            columns: new Map(),
            headerClickHandler: null,
        };
        progressBarSortRegistry.set(table, store);
    }

    return store;
}

/**
 * Build the sort state for one progress-bar column: which fields its cycle sorts by, and in what order.
 * @param {string} columnField - Field name of the progress-bar column.
 * @param {object} [options] - A `fieldPrefix` for domain-separated columns, plus explicit sort-field and sequence overrides.
 * @returns {object} The initial state, sorting by the correct-share field ascending.
 */
function createProgressBarSortState(columnField, options = {}) {
    const prefix = options.fieldPrefix || '';
    const correctSort =
        options.correctSortField || (prefix ? `${prefix}PercentageCorrect` : 'percentageCorrect');
    const incorrectSort =
        options.incorrectSortField ||
        (prefix ? `${prefix}PercentageIncorrect` : 'percentageIncorrect');
    const notAttemptedSort = prefix ? `${prefix}PercentageNotAttempted` : 'percentageNotAttempted';
    const sortSequence = options.sortSequence || PROGRESS_BAR_SORT_SEQUENCE;
    const sortFieldLabels = options.sortFieldLabels || null;

    return {
        columnField,
        correctSort,
        incorrectSort,
        notAttemptedSort,
        sortSequence,
        sortFieldLabels,
        field: correctSort,
        dir: 'asc',
        clickCount: 0,
    };
}

/**
 * The registered sort state of one progress-bar column.
 * @param {object} table - Tabulator table instance.
 * @param {string} columnField - Field name of the progress-bar column.
 * @returns {object|null} The state, or null when the column was never set up.
 */
export function getRegisteredProgressBarSortState(table, columnField) {
    return getProgressBarSortStore(table)?.columns.get(columnField) ?? null;
}

/**
 * Return one column’s sort state to the start of its cycle.
 * @param {object} state - The sort state to reset.
 */
function resetProgressBarSortState(state) {
    state.field = state.correctSort;
    state.dir = 'asc';
    state.clickCount = 0;
}

/**
 * How far through its cycle a column’s sort state currently is.
 * @param {object} state - The sort state to locate in the sequence.
 * @returns {number} Index into the sort sequence; 0 when the state matches no later step.
 */
function getProgressBarClickCount(state) {
    const sequence = state.sortSequence || PROGRESS_BAR_SORT_SEQUENCE;
    for (let i = 1; i < sequence.length; i++) {
        const step = sequence[i];
        if (step && state.field === state[step.fieldKey] && state.dir === step.dir) {
            return i;
        }
    }
    return 0;
}

/**
 * Point a column’s sort state at one field and direction.
 * @param {object} state - The sort state to update.
 * @param {string} [sortField] - Field to sort by; defaults to the correct-share field.
 * @param {string} [dir='asc'] - Sort direction.
 */
function setProgressBarSortState(state, sortField = state.correctSort, dir = 'asc') {
    const normalizedField = String(sortField).toLowerCase();

    if (normalizedField === state.notAttemptedSort.toLowerCase()) {
        state.field = state.notAttemptedSort;
    } else if (normalizedField === state.incorrectSort.toLowerCase()) {
        state.field = state.incorrectSort;
    } else {
        state.field = state.correctSort;
    }

    state.dir = dir;
    state.clickCount = getProgressBarClickCount(state);
}

/**
 * Find which registered progress-bar column a sort key belongs to.
 * @param {object} table - Tabulator table instance.
 * @param {string} sortKey - The column field, or one of the underlying sort fields.
 * @returns {object|null} The matching column and its sort field, or null when the key belongs to no progress-bar column.
 */
function resolveProgressBarSortTarget(table, sortKey) {
    const store = getProgressBarSortStore(table);
    if (!store || !sortKey) return null;

    for (const [columnField, state] of store.columns.entries()) {
        if (columnField === sortKey) {
            return { columnField, state, sortField: state.correctSort };
        }

        const matchedField = [state.correctSort, state.notAttemptedSort, state.incorrectSort].find(
            (candidate) => candidate === sortKey,
        );

        if (matchedField) {
            return { columnField, state, sortField: matchedField };
        }
    }

    return null;
}

/**
 * Whether a field names a progress-bar column.
 * @param {string} columnField - The field to test.
 * @returns {boolean} True for the shared column constant and for any domain-prefixed `…Percentages` field.
 */
export function isProgressBarColumnField(columnField) {
    return columnField === PROGRESS_BAR_COLUMN_FIELD || columnField?.endsWith('Percentages');
}

/**
 * Sets up cyclic multi-field sorting for the Pilotierung column.
 * Clicking the header cycles: absolute value ↑ → ↓ → difference (Δ) ↑ → ↓ → reset.
 * The active sort field is highlighted in the column header title.
 *
 * Must be called after the Tabulator table is created, alongside setupProgressBarSorting.
 * @param {object} table - Tabulator table instance
 */
export function setupPilotierungColumnSorting(table) {
    if (!table) return;
    setupProgressBarSorting(table, PILOTIERUNG_VALUE_FIELD, {
        correctSortField: PILOTIERUNG_VALUE_FIELD,
        incorrectSortField: PILOTIERUNG_DIFF_FIELD,
        sortSequence: DUAL_FIELD_SORT_SEQUENCE,
        sortFieldLabels: {
            [PILOTIERUNG_VALUE_FIELD]: PILOTIERUNG_VALUE_LABEL,
            [PILOTIERUNG_DIFF_FIELD]: PILOTIERUNG_DIFF_LABEL,
        },
    });
}

/**
 * Sets up progress bar column sorting behavior on a table.
 * Call this after creating the table to enable multi-field sorting.
 * Supports fieldPrefix for domain-separated columns (e.g. 'd0' → sorts by d0PercentageCorrect).
 * Can be called multiple times for tables with multiple bar columns.
 * @param {object} table - Tabulator table instance
 * @param {string} columnField - Field name of the progress bar column (default: 'percentageCombined')
 * @param {{[key: string]: any}} [options] - Configuration options (supports fieldPrefix for sort field names, e.g. 'd0', plus correctSortField/incorrectSortField/sortSequence/sortFieldLabels)
 */
export function setupProgressBarSorting(
    table,
    columnField = PROGRESS_BAR_COLUMN_FIELD,
    options = {},
) {
    if (!table) return;

    const store = getProgressBarSortStore(table, true);
    store.columns.set(columnField, createProgressBarSortState(columnField, options));

    if (store.headerClickHandler) {
        return;
    }

    store.headerClickHandler = (event, column) => {
        const clickedField = column.getField();
        const clickedState = store.columns.get(clickedField);
        if (!clickedState) return;

        event.stopPropagation();

        const isActiveColumn = store.activeColumnField === clickedField;
        if (!isActiveColumn) {
            resetProgressBarSorting(table);
        }

        const nextClickCount =
            ((isActiveColumn ? clickedState.clickCount : 0) + 1) % clickedState.sortSequence.length;

        if (nextClickCount === 0) {
            table.clearSort();
            resetProgressBarSorting(table);
            return;
        }

        for (const [registeredField, registeredState] of store.columns.entries()) {
            if (registeredField === clickedField) continue;
            resetProgressBarSortState(registeredState);
            updateProgressBarHeaderHighlight(table, registeredField, null);
        }

        const nextState = clickedState.sortSequence[nextClickCount];
        setProgressBarSortState(clickedState, clickedState[nextState.fieldKey], nextState.dir);
        store.activeColumnField = clickedField;

        table.setSort(clickedField, clickedState.dir);
        updateProgressBarHeaderHighlight(table, clickedField, clickedState.field);
    };

    table.on('headerClick', store.headerClickHandler);
}

/**
 * Return every progress-bar column of a table to the start of its sort cycle.
 * @param {object} table - Tabulator table instance.
 */
export function resetProgressBarSorting(table) {
    const store = getProgressBarSortStore(table);
    if (!store) return;

    store.activeColumnField = null;

    for (const [columnField, state] of store.columns.entries()) {
        resetProgressBarSortState(state);
        updateProgressBarHeaderHighlight(table, columnField, null);
    }
}

/**
 * Sort a table by one of its progress-bar columns, programmatically.
 * @param {object} table - Tabulator table instance.
 * @param {string} sortKey - The column field, or one of its underlying sort fields.
 * @param {string} [dir='asc'] - Sort direction.
 * @returns {boolean} True when a matching column was found and sorted; false when the key belongs to none.
 */
export function applyProgressBarSorting(table, sortKey, dir = 'asc') {
    const target = resolveProgressBarSortTarget(table, sortKey);
    if (!target) return false;

    resetProgressBarSorting(table);
    setProgressBarSortState(target.state, target.sortField, dir);

    const store = getProgressBarSortStore(table);
    store.activeColumnField = target.columnField;

    table.setSort(target.columnField, dir);
    updateProgressBarHeaderHighlight(table, target.columnField, target.state.field);
    return true;
}

/**
 * Updates the progress bar header title to highlight the currently sorted field.
 * Supports both un-prefixed ('percentageCorrect') and prefixed ('d0PercentageCorrect') field names.
 * @param {object} table - Tabulator table instance
 * @param {string} columnField - Field name of the progress bar column
 * @param {string|null} sortField - Current sort field name, or null to clear
 */
export function updateProgressBarHeaderHighlight(table, columnField, sortField) {
    const columns = table.getColumns();
    const column = columns.find((col) => col.getField() === columnField);
    if (!column) return;

    const titleElement = column.getElement().querySelector('.tabulator-col-title');
    if (!titleElement) return;

    // Use the column's own definition title as the base so any domain prefix is preserved.
    const baseTitle = column.getDefinition().title;

    if (!sortField) {
        titleElement.innerHTML = annotateHeaderTitle(baseTitle);
        return;
    }

    // Highlight the active sort label within the base title (works for both plain and domain-prefixed titles).
    const lowerField = sortField.toLowerCase();
    let labelToHighlight;
    if (lowerField.endsWith('percentagecorrect')) {
        labelToHighlight = LABELS.RICHTIG;
    } else if (lowerField.endsWith('percentagenotattempted')) {
        labelToHighlight = LABELS.UNBEARBEITET;
    } else if (lowerField.endsWith('percentageincorrect')) {
        labelToHighlight = LABELS.FALSCH;
    }

    // Fall back to column-specific label map for non-standard sort fields (e.g. Pilotierung column).
    if (!labelToHighlight) {
        const store = getProgressBarSortStore(table);
        const state = store?.columns.get(columnField);
        labelToHighlight = state?.sortFieldLabels?.[sortField] ?? null;
    }

    if (labelToHighlight) {
        titleElement.innerHTML = annotateHeaderTitle(
            baseTitle.replace(
                labelToHighlight,
                `<span style="color: var(--primary-color, #007bff);">${labelToHighlight}</span>`,
            ),
        );
    } else {
        titleElement.innerHTML = annotateHeaderTitle(baseTitle);
    }
}
