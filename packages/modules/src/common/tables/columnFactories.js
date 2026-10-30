/**
 * The Tabulator column definition factories; `createColumnDef` is the base the others
 * build on.
 */

import { COLUMN_GROW_RATIOS, VISUAL_COLUMN_MIN_WIDTHS } from './columnWidthConstants.js';
import { TERM_CONSTANTS } from '../domain/terms.js';
import { GLOSSARY_KEYS } from '../glossary/glossaryKeys.js';
import { getTraitData, getTraitsText, getTraitsHtml } from './traitUtils.js';
import { compareText, orderComparator } from '../utils/compare.js';
import { formatCountOf } from '../utils/numberFormat.js';
import { compareLevelLabels } from '../domain/levels.js';
import {
    createGerLevelHtml,
    createItemLevelHtml,
} from '../services/itemCompetenceLevelAppearance.js';
import { escapeHtml, iconSvg, setTrustedHTML } from '@tba3/module-base';
import { genderLabel, RESULT, RESULT_CODE } from '../domain/apiValueMaps.js';
import './columnFactories.css';

/**
 * TableModule-owned column metadata. It never reaches Tabulator: the column
 * processor reads it and strips it off the definition.
 * @typedef {object} ColumnTableMeta
 * @property {boolean} [excludeFromColumnVisibilityMenu]
 * @property {boolean} [skipGlossaryAnnotation] - Skip both header and cell glossary annotation.
 * @property {boolean} [skipCellGlossaryAnnotation]
 * @property {string} [headerGlossaryKey] - The glossary entry the whole header links to, in place of free-text annotation of the title: for a title whose wording would resolve to another entry, or to none.
 * @property {ReadonlyArray<import('./progressBarSorting.js').ProgressBarSortStep>} [progressBarSortSteps] - The header-click sort cycle of a progress-bar or Pilotierung column.
 * @property {boolean} [progressBarSortLabelsInTitle] - The title contains every step's label, which the header highlights in place rather than after the title; building a column whose title lacks one throws.
 * @property {(rows: ReadonlyArray<{[field: string]: any}>) => ReadonlyArray<string>} [cellWords] - The texts the column's cells show, given the rows it is built with: its floor fits each of their words, so no cell breaks one, and a later `setRows` keeps that floor. `createColumnDef` reads the field's text; a column whose cells show other texts (a stack of names) names them, and one of a closed vocabulary names every text it may show, so a later `setRows` cannot bring a wider one.
 * @property {boolean} [fitContent] - Fix the column's width to its floor, so it never grows and its share of the width goes to the others (a fixed width, not a `maxWidth` cap: fitColumns hands its rounding remainder to the last flex column, which a cap would clamp away): for a column of single words or unbreakable texts (a multi-word cell would wrap at the floor) whose widest text the floor already sees through `cellWords`.
 */

/** @typedef {import('tabulator-tables').CellComponent} CellComponent */
/** @typedef {import('tabulator-tables').RowComponent} RowComponent */
/** @typedef {import('tabulator-tables').ColumnComponent} ColumnComponent */
/**
 * A table row as Tabulator holds it: each table's own record shape.
 * @typedef {{[field: string]: any}} RowData
 */

/**
 * A Tabulator cell or title formatter. Its result is whatever Tabulator renders:
 * markup, an element, or the raw value.
 * @typedef {(cell: CellComponent, formatterParams?: unknown, onRendered?: (callback: () => void) => void) => any} TableCellFormatter
 */

/**
 * A Tabulator column sorter. The values are the two cells' raw values, whose type is
 * the column's own.
 * @typedef {(a: any, b: any, aRow: RowComponent, bRow: RowComponent, column: ColumnComponent, dir: string, sorterParams: unknown) => number} TableSorter
 */

/**
 * A column definition as the table modules declare it: Tabulator's column options
 * plus the fields this package reads and the reserved `tableMeta` namespace. The
 * options the package does not read stay open (`[option: string]: any`).
 * @typedef {{
 *   title?: string,
 *   field?: string,
 *   width?: number,
 *   minWidth?: number,
 *   headerSort?: boolean,
 *   visible?: boolean,
 *   columns?: TableColumnDefinition[],
 *   formatter?: TableCellFormatter | string,
 *   titleFormatter?: TableCellFormatter | string,
 *   sorter?: TableSorter | string,
 *   cellClick?: (event: UIEvent, cell: CellComponent) => void,
 *   accessorDownload?: (value: any, data: RowData) => unknown,
 *   tableMeta?: ColumnTableMeta,
 *   [option: string]: any,
 * }} TableColumnDefinition
 */

// ============================================================================
// STANDARDIZED COLUMN BUILDERS
// ============================================================================

/**
 * The column of a competence level, which every level column in every table is: a
 * band-coloured, glossary-stamped mark, sorted and filtered by the scale.
 * @param {import('../services/competenceLevelPalette.js').CompetenceLevelPalette} palette - The app's palette: the column sorts, filters and paints by its scales.
 * @param {object} [options]
 * @param {string} [options.field]
 * @param {string} [options.title]
 * @param {string} [options.titleDownload] - Column title in a download (default: the title)
 * @param {boolean} [options.headerSort] - Whether the header click sorts (default: the table's)
 * @param {boolean} [options.headerFilter] - Whether the filter menu offers the levels the rows hold, in scale order
 * @param {number} [options.widthGrow] - Responsive grow ratio (default: COLUMN_GROW_RATIOS.medium)
 * @param {ColumnTableMeta} [options.tableMeta] - Cell glossary annotation is always skipped
 * @param {typeof createGerLevelHtml} [options.levelHtml] - The cell markup: a reported level
 *   paints as itself (default), an Aufgabenniveau through its item-slot span (`createItemLevelHtml`)
 * @returns {TableColumnDefinition}
 */
export function createCompetenceLevelColumn(
    palette,
    {
        field = 'competenceLevelName',
        title = TERM_CONSTANTS.COMP_LEVEL,
        headerFilter = false,
        levelHtml = createGerLevelHtml,
        ...options
    } = {},
) {
    const byScale = (/** @type {string|null} */ a, /** @type {string|null} */ b) =>
        compareLevelLabels(palette, a, b);
    return createColumnDef(title, field, {
        widthGrow: COLUMN_GROW_RATIOS.medium,
        ...options,
        sorter: byScale,
        formatter: (cell) => levelHtml(palette, cell.getValue()),
        // The chip carries its own glossary stamp.
        tableMeta: { ...options.tableMeta, skipCellGlossaryAnnotation: true },
        ...(headerFilter && {
            headerFilter: 'list',
            headerFilterParams: { sort: byScale },
        }),
    });
}

/**
 * The single-item preview payload of an item or student-data row.
 * @param {RowData} rowData
 * @returns {import('../overlays/itemPreviewOverlay.js').ItemPreview}
 */
export function toItemPreview(rowData) {
    return { number: rowData.name ?? '', title: rowData.exerciseName ?? '' };
}

/**
 * The "Aufgabenniveau" column: the item's level, sortable and filterable by the scale. Narrow, not content-width: its
 * payload-driven labels render in the chip's type, which the header-font floor would
 * under-measure.
 * @param {import('../services/competenceLevelPalette.js').CompetenceLevelPalette} palette - The app's palette: the column sorts, filters and paints by its scales.
 * @returns {TableColumnDefinition}
 */
export function createItemCompetenceLevelColumn(palette) {
    return createCompetenceLevelColumn(palette, {
        title: TERM_CONSTANTS.ITEM_COMPETENCE_LEVEL,
        field: 'competenceLevel',
        headerFilter: true,
        levelHtml: createItemLevelHtml,
        widthGrow: COLUMN_GROW_RATIOS.narrow,
    });
}

/**
 * The "Aufgabe" column: the exercise an item belongs to, with a text filter: a booklet holds up to one exercise per item, too
 * many long titles to pick from a checkbox list.
 * @param {number} widthGrow - Responsive grow ratio, one of `COLUMN_GROW_RATIOS`.
 * @param {{lang?: string}} [options] - `lang`: the language the titles are in, when it is not the page's, so a screen reader pronounces them in it (WCAG 3.1.2).
 * @returns {TableColumnDefinition}
 */
export function createExerciseColumn(widthGrow, { lang } = {}) {
    return createColumnDef(TERM_CONSTANTS.EXERCISE, 'exerciseName', {
        hozAlign: 'left',
        widthGrow,
        headerFilter: 'input',
        ...(lang && {
            formatter: (/** @type {import('tabulator-tables').CellComponent} */ cell) => {
                const title = document.createElement('span');
                title.lang = lang;
                title.textContent = cell.getValue() ?? '';
                return title;
            },
        }),
    });
}

/**
 * The "Nr." (item number) column: the "show item" preview button, then the number. How
 * a row's number reads is injected (a domain prefix, say); sorting and the text filter follow the
 * displayed value.
 * @param {import('../glossary/glossaryAnnotator.js').GlossaryAnnotator} glossary - The app's glossary, naming the preview button.
 * @param {object} [options={}] - Per-app adjustments to the shared column.
 * @param {(name: string, rowData: {[field: string]: any}) => string} [options.getDisplayName] - The number as displayed
 * @param {((rowData: {[field: string]: any}) => void) | null} [options.onShowItem=null] - Opens the item preview; without it no button is rendered
 * @returns {TableColumnDefinition}
 */
export function createItemNumberColumn(
    glossary,
    { getDisplayName = (name) => name, onShowItem = null } = {},
) {
    return createColumnDef('Nr.', 'name', {
        headerFilter: 'input',
        headerFilterParams: {
            text: (/** @type {string|null} */ name, /** @type {RowData} */ rowData) =>
                getDisplayName(name || '', rowData),
        },
        minWidth: VISUAL_COLUMN_MIN_WIDTHS.itemNumber,
        hozAlign: 'left',
        formatter(cell) {
            const data = cell.getRow().getData();
            const onActivate = onShowItem ? () => onShowItem(data) : null;
            return createItemNumberCell(
                glossary,
                getDisplayName(cell.getValue(), data),
                onActivate,
            );
        },
        sorter(a, b, aRow, bRow) {
            const aKey = getDisplayName(a || '', aRow.getData());
            const bKey = getDisplayName(b || '', bRow.getData());
            return compareText(aKey, bKey);
        },
    });
}

/**
 * The "Richtig" (correct answers) column. The cell reads "x von N" with the row's own
 * `totalCount`, the items that student's results cover in the active scope; it sorts by
 * the count.
 * @returns {TableColumnDefinition}
 */
export function createRichtigColumn() {
    return {
        field: 'correctCount',
        formatter: (cell) => {
            const { correctCount, totalCount } = cell.getRow().getData();
            return totalCount
                ? formatCountOf(correctCount, totalCount)
                : String(correctCount ?? '');
        },
        sorter: 'number',
        widthGrow: COLUMN_GROW_RATIOS.narrow,
        // Numbers carry no glossary term; the title is the entry's label.
        tableMeta: { headerGlossaryKey: GLOSSARY_KEYS.RICHTIG, skipCellGlossaryAnnotation: true },
    };
}

/**
 * The distinct texts the rows hold in a field.
 * @param {ReadonlyArray<{[field: string]: unknown}>} data
 * @param {string} field
 * @returns {string[]} Its string values, each once.
 */
function fieldTexts(data, field) {
    const texts = new Set(data.map((row) => row[field]));
    return [...texts].filter((value) => typeof value === 'string');
}

/**
 * Base factory for Tabulator columns: wrapping, growing like a narrow column unless the
 * options say otherwise. Every other option passes through as given; the alignment is
 * the column processor's centre unless the options set `hozAlign`.
 * @param {string} title
 * @param {string} field
 * @param {TableColumnDefinition} [options={}] - `cssClass` is appended to `cell-wrap-text`.
 * @returns {TableColumnDefinition}
 */
export function createColumnDef(title, field, { cssClass, tableMeta, ...options } = {}) {
    return {
        title,
        field,
        widthGrow: COLUMN_GROW_RATIOS.narrow,
        variableHeight: true,
        ...options,
        // A wrapping cell breaks between words: the column floors to its widest one, and
        // the browser does not hyphenate German everywhere.
        tableMeta: { cellWords: (rows) => fieldTexts(rows, field), ...tableMeta },
        cssClass: ['cell-wrap-text', cssClass].filter(Boolean).join(' '),
    };
}

// ============================================================================
// SHARED INTERACTION COLUMN HELPERS
// ============================================================================

/**
 * The "show item" preview trigger of an item-number cell. Its click does not bubble,
 * so it never toggles Tabulator row selection / rowClick.
 * @param {import('../glossary/glossaryAnnotator.js').GlossaryAnnotator} glossary
 * @param {() => void} onActivate
 * @returns {HTMLButtonElement}
 */
function createItemPreviewButton(glossary, onActivate) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn btn--icon item-preview-trigger';
    // Reached from its row (installRowKeyboard), not by Tab: a stop per row floods the order.
    button.tabIndex = -1;
    const label = glossary.getRequiredEntryText('general.buttons.element_texts.item-preview.label');
    button.setAttribute('aria-label', label);
    button.setAttribute('data-tooltip-text', label);
    setTrustedHTML(button, iconSvg('visibility'));
    button.addEventListener('click', (event) => {
        event.stopPropagation();
        onActivate?.();
    });
    return button;
}

/**
 * An item-number cell: the preview trigger when a handler is given, then the number text.
 * @param {import('../glossary/glossaryAnnotator.js').GlossaryAnnotator} glossary
 * @param {string} displayValue - Already formatted.
 * @param {(() => void)|null} [onShowItem]
 * @returns {HTMLElement}
 */
function createItemNumberCell(glossary, displayValue, onShowItem) {
    const wrapper = document.createElement('span');
    wrapper.className = 'item-number-cell';

    if (typeof onShowItem === 'function') {
        wrapper.appendChild(createItemPreviewButton(glossary, onShowItem));
    }

    const value = document.createElement('span');
    value.className = 'item-number-cell-value';
    value.textContent = displayValue ?? '';
    wrapper.appendChild(value);

    return wrapper;
}

/**
 * The "ID" column of the group tables: the student id as a link-styled button that hands
 * the id to `onSelect`, with a tooltip saying what the click opens.
 * @param {object} [options={}]
 * @param {string|((rowData: {[field: string]: any}) => string)} [options.tooltip] - The link's tooltip, or the tooltip of one row
 * @param {((studentId: string) => void)|null} [options.onSelect]
 * @returns {TableColumnDefinition}
 */
export function createStudentIdLinkColumn({ tooltip, onSelect = null } = {}) {
    return createColumnDef('ID', 'studentId', {
        hozAlign: 'left',
        headerFilter: 'input',
        tableMeta: { skipCellGlossaryAnnotation: true },
        formatter(cell) {
            const link = document.createElement('button');
            link.type = 'button';
            link.className = 'student-id-link';
            // Reached from its row (installRowKeyboard), not by Tab.
            link.tabIndex = -1;
            link.textContent = cell.getValue() ?? '';

            const text = typeof tooltip === 'function' ? tooltip(cell.getRow().getData()) : tooltip;
            if (text) link.setAttribute('data-tooltip-text', text);
            return link;
        },
        cellClick: onSelect ? (_event, cell) => onSelect(cell.getValue()) : undefined,
    });
}

// ============================================================================
// SHARED MULTI-VALUE LIST COLUMN
// ============================================================================

/**
 * The list filter's value for rows without any value: a stable token, not the option's
 * translated label, so a value worded like that label stays its own option.
 */
const MULTI_VALUE_NONE = '__no-value__';

/**
 * A row's values, one per line: the stacked cell of a multi-value column. Not
 * annotated here: the column's cell formatter is wrapped for glossary annotation like
 * every other, and that pass sees the values between these tags.
 * @param {string[]} values - The values, in the order the cell lists them.
 * @returns {string} The cell markup; empty without values.
 */
function stackedValuesHtml(values) {
    if (values.length === 0) return '';
    const lines = values.map((value) => `<div>${escapeHtml(value)}</div>`).join('');
    return `<div class="multi-value-cell layout-stack">${lines}</div>`;
}

/**
 * Two rows' values, value by value; a row without any sorts after every row with one,
 * in either direction.
 * @param {string[]} a
 * @param {string[]} b
 * @param {(a: string, b: string) => number} compare
 * @param {string} dir - The sort direction: Tabulator hands a descending sort the two
 *   rows swapped and orders by the result as is, so the empty rows' rule is flipped there.
 * @returns {number}
 */
function compareValueLists(a, b, compare, dir) {
    if (a.length === 0 || b.length === 0) {
        const emptyLast = Number(a.length === 0) - Number(b.length === 0);
        return dir === 'desc' ? -emptyLast : emptyLast;
    }
    for (let index = 0; index < Math.min(a.length, b.length); index++) {
        const result = compare(a[index], b[index]);
        if (result !== 0) return result;
    }
    return a.length - b.length;
}

/**
 * A column whose cell holds several values (Stile, Merkmale, competences):
 * the values stacked one per line, joined with ", " in a download, and — while
 * `filterable` — a list filter offering each value the rows carry, matching a row that
 * carries the chosen one, and a sort by the rows' values in `order`, rows without any
 * last. The floor fits every word of `order` as well as the rows', so a row swap
 * (`setRows`) cannot bring a wider one. `noneLabel` names an option for rows without
 * any value, after the others. Every other option passes through to `createColumnDef`,
 * so a column can render its own cell, sort its own way or download its own text.
 * @param {string} title
 * @param {string} field
 * @param {TableColumnDefinition & {
 *   toValues?: (value: any) => string[],
 *   order?: ReadonlyArray<string>,
 *   noneLabel?: string|null,
 *   filterable?: boolean,
 * }} [options] - How a cell value becomes its values (an array is its own), the order of
 *   the filter's options and the sort (the values in order, unlisted ones after them,
 *   alphabetically), the none option's label, and whether to filter and sort; the rest are
 *   column options.
 * @returns {TableColumnDefinition}
 */
export function createMultiValueListColumn(
    title,
    field,
    {
        toValues = (value) => (Array.isArray(value) ? value : []),
        order = [],
        noneLabel = null,
        filterable = true,
        tableMeta,
        ...options
    } = {},
) {
    const compare = orderComparator(order);
    /** @type {TableColumnDefinition} */
    const filter = filterable
        ? {
              headerFilter: 'list',
              headerFilterParams: {
                  expand: (/** @type {unknown} */ value) => {
                      const values = toValues(value);
                      return values.length === 0 && noneLabel ? [MULTI_VALUE_NONE] : values;
                  },
                  ...(noneLabel && {
                      label: (/** @type {string} */ value) =>
                          value === MULTI_VALUE_NONE ? noneLabel : value,
                  }),
                  // The filter sorts the options' labels.
                  sort: (/** @type {string} */ a, /** @type {string} */ b) =>
                      Number(a === noneLabel) - Number(b === noneLabel) || compare(a, b),
              },
              /** @type {TableSorter} */
              sorter: (a, b, _aRow, _bRow, _column, dir) =>
                  compareValueLists(toValues(a), toValues(b), compare, dir),
          }
        : { headerSort: false };
    return createColumnDef(title, field, {
        hozAlign: 'left',
        widthGrow: COLUMN_GROW_RATIOS.medium,
        formatter: (cell) => stackedValuesHtml(toValues(cell.getValue())),
        // The field holds a list, which the download would otherwise stringify.
        accessorDownload: (value) => toValues(value).join(', '),
        ...filter,
        ...options,
        // The cell stacks the values, so the column floors to their widest word.
        tableMeta: {
            cellWords: (rows) => [...order, ...rows.flatMap((row) => toValues(row[field]))],
            ...tableMeta,
        },
    });
}

// ============================================================================
// SHARED TRAITS COLUMN (Merkmale)
// ============================================================================

/**
 * A traits cell value's trait names (`getTraitData`).
 * @param {Set<string>|undefined} traits - The row's trait codes.
 * @returns {string[]}
 */
const traitNames = (traits) => getTraitData({ traits }).names;

/**
 * The "Merkmale" (traits) column, a multi-value list column
 * over the trait names. The cell renders the glossary-stamped chips of
 * `getTraitsHtml`, so the column opts out of cell glossary annotation.
 *
 * `filterable` gives the list filter and the sort (group tables): one entry per
 * trait the rows carry, alphabetically, then the none option for rows without one. A
 * display-only column (single-row student info tables) omits it.
 * @param {import('../glossary/glossaryAnnotator.js').GlossaryAnnotator} glossary - The app's glossary: the chips' popups and the none option.
 * @param {ReadonlyMap<string, string>} traitLabels - The payload's labels, the table's subject catalog's `TRAIT_LABELS` dataset.
 * @param {object} [options={}]
 * @param {boolean} [options.filterable=false] - Offer the list filter and the sort.
 * @returns {TableColumnDefinition}
 */
export function createTraitsColumn(glossary, traitLabels, { filterable = false } = {}) {
    return createMultiValueListColumn(TERM_CONSTANTS.TRAITS, 'traits', {
        toValues: traitNames,
        noneLabel: glossary.getRequiredEntryText(
            'general.buttons.element_texts.table-filter-none.label',
        ),
        filterable,
        // Short chips, centred like the level column.
        hozAlign: 'center',
        formatter: (cell) => getTraitsHtml(glossary, traitLabels, cell.getRow().getData()),
        // A row without traits downloads the missing-value dash its cell shows.
        accessorDownload: (_value, data) => getTraitsText(data),
        tableMeta: { skipCellGlossaryAnnotation: true },
    });
}

/**
 * The "Geschlecht" column: the row keeps the API value, the cell,
 * the filter and the export show its label (`GENDER_LABELS`); a missing gender is an
 * empty cell.
 * @param {object} [options={}]
 * @param {boolean} [options.filterable=false] - Offer the list filter over the rows' genders.
 * @returns {TableColumnDefinition}
 */
export function createGenderColumn({ filterable = false } = {}) {
    return createColumnDef(TERM_CONSTANTS.GENDER, 'gender', {
        hozAlign: 'left',
        formatter: (cell) => (cell.getValue() ? genderLabel(cell.getValue()) : ''),
        accessorDownload: (value) => (value ? genderLabel(value) : ''),
        // Plain text like the other identity columns: a label, not a term to look up.
        tableMeta: { skipCellGlossaryAnnotation: true },
        ...(filterable && { headerFilter: 'list', headerFilterParams: { label: genderLabel } }),
    });
}

// ============================================================================
// RESULT COLUMN
// ============================================================================

/** The result codes as the filter menu offers them, in reading order. */
const RESULT_OPTIONS = [
    [RESULT_CODE.CORRECT, `✓ ${RESULT.CORRECT}`],
    [RESULT_CODE.INCORRECT, `✗ ${RESULT.INCORRECT}`],
    [RESULT_CODE.NOT_ATTEMPTED, `⊘ ${RESULT.NOT_ATTEMPTED}`],
];

/** @type {{[code: number]: [icon: string, className: string, label: string]}} */
const RESULT_ICONS = {
    [RESULT_CODE.CORRECT]: ['check_circle', 'result-icon-correct', RESULT.CORRECT],
    [RESULT_CODE.INCORRECT]: ['cancel', 'result-icon-incorrect', RESULT.INCORRECT],
    [RESULT_CODE.NOT_ATTEMPTED]: ['block', 'result-icon-not-attempted', RESULT.NOT_ATTEMPTED],
};

/**
 * Renders a result code as its icon, named for assistive tech (the icon is
 * `aria-hidden`); anything else as it is.
 * @param {import('tabulator-tables').CellComponent} cell
 * @returns {string}
 */
function resultIconFormatter(cell) {
    const value = cell.getValue();
    const icon = RESULT_ICONS[value];
    if (!icon) return value;
    return `${iconSvg(icon[0], { className: icon[1] })}<span class="visually-hidden">${icon[2]}</span>`;
}

/**
 * The "Ergebnis" column of a student's item rows: one icon per result code, and a filter over all three results.
 * @returns {TableColumnDefinition}
 */
export function createResultColumn() {
    return createColumnDef('Ergebnis', 'resultCode', {
        // No fixed minWidth: the header-derived floor fits "Ergebnis", and the icon
        // is narrower than the title.
        headerFilter: 'list',
        headerFilterParams: {
            values: Object.fromEntries(RESULT_OPTIONS),
            // An object lists integer-like keys in numeric order, so the order is explicit.
            sort: RESULT_OPTIONS.map(([, label]) => label),
        },
        formatter: resultIconFormatter,
    });
}
