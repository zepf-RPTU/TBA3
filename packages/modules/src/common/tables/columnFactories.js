/**
 * Standardized Tabulator column definition factories:
 * the KS/Richtig columns, the base createColumnDef factory and its metadata helper,
 * the interactive student-id link and item-number cells, and the shared traits column.
 */

import { COLUMN_GROW_RATIOS, VISUAL_COLUMN_MIN_WIDTHS } from './columnWidthConstants.js';
import { TERM_CONSTANTS } from '../domain/terms.js';
import { getTraitsText, getTraitsAsText } from './traitUtils.js';
import { LABELS } from './tableLabels.js';
import { compareLevelLabels, createGerLevelHtml } from '../domain/levels.js';
import { iconSvg } from '@tba3/module-base/utils/icons.js';
import { glossaryAnnotator } from '../glossary/glossaryAnnotator.js';

// ============================================================================
// STANDARDIZED COLUMN BUILDERS
// ============================================================================

/**
 * Create a standardized KS (Kompetenzstufe) column for tables
 * Uses responsive width configuration with widthGrow (minWidth auto-calculated from title)
 * @param {object} [options] - Configuration options
 * @param {boolean|string} [options.headerFilter] - Header filter type (false, or a Tabulator filter like "list"; default: false)
 * @param {boolean} [options.headerSort] - Whether to enable header sorting (default: false)
 * @param {number} [options.minWidth] - Minimum width (optional, auto-calculated if not set)
 * @param {number} [options.widthGrow] - Width grow factor (default: COLUMN_GROW_RATIOS.ks)
 * @param {object} [options.headerFilterParams] - Filter parameters for list filter
 * @param {string} [options.field] - Field name holding the level value (default: "ks")
 * @param {string} [options.title] - Column title (default: TERM_CONSTANTS.COMP_LEVEL)
 * @returns {object} Tabulator column configuration for KS column
 */
export function createKsColumn({
    headerFilter = false,
    headerSort = false,
    minWidth,
    widthGrow = COLUMN_GROW_RATIOS.ks,
    headerFilterParams,
    field = 'ks',
    title = TERM_CONSTANTS.COMP_LEVEL,
} = {}) {
    const colDef = {
        title: title,
        field: field,
        hozAlign: 'center',
        widthGrow: widthGrow,
        headerSort: headerSort,
        // Levels order by their scale, not alphabetically — `MiStd-- < MiStd- < MiStd`,
        // `Ia < Ib < II`, `k.h.N.` first.
        sorter: compareLevelLabels,
        // The same band-coloured, glossary-stamped cell the EN tables render.
        formatter: (cell) => createGerLevelHtml(cell.getValue() || 'N/A'),
    };

    if (minWidth !== undefined) {
        colDef.minWidth = minWidth;
    }

    if (headerFilter) {
        colDef.headerFilter = 'list';
        if (headerFilterParams) {
            colDef.headerFilterParams = headerFilterParams;
        }
        // Custom filter function for exact matching
        colDef.headerFilterFunc = function (headerValue, rowValue) {
            if (!headerValue) return true;
            return rowValue === headerValue;
        };
    }

    return colDef;
}

/**
 * Create the "Nr." (item number) column the EN and MA item and student-data tables
 * share: the number, optionally decorated, plus the "show task" preview button
 * behind it. The apps differ only in how a row's number reads (EN prefixes the
 * domain in `all` mode) and which rows have a task to preview (EN's task-parent
 * rows have none), so those two are injected. Sorting follows the displayed value
 * unless the app supplies its own sort key (EN clusters by domain in `all` mode
 * even for rows it displays unprefixed).
 * @param {object} [options={}] - Per-app adjustments to the shared column.
 * @param {string} [options.title='Nr.'] - Column header text
 * @param {(name: string, rowData: object) => string} [options.getDisplayName] - The number as displayed; the raw value by default
 * @param {(name: string, rowData: object) => string} [options.getSortKey] - The string the sorter compares; the displayed name by default
 * @param {(rowData: object) => boolean} [options.isPreviewable] - Whether a row has a single task to preview; every row by default
 * @param {((rowData: object) => void) | null} [options.onShowTask=null] - Opens the task preview; without it no button is rendered
 * @returns {object} Tabulator column definition
 */
export function createItemNumberColumn({
    title = 'Nr.',
    getDisplayName = (name) => name,
    getSortKey = getDisplayName,
    isPreviewable = () => true,
    onShowTask = null,
} = {}) {
    return createColumnDef(title, 'name', {
        headerFilter: 'input',
        widthGrow: COLUMN_GROW_RATIOS.id,
        minWidth: VISUAL_COLUMN_MIN_WIDTHS.itemNumber,
        hozAlign: 'left',
        formatter(cell) {
            const data = cell.getRow().getData();
            const onActivate = onShowTask && isPreviewable(data) ? () => onShowTask(data) : null;
            return createItemNumberCell(getDisplayName(cell.getValue(), data), onActivate);
        },
        sorter(a, b, aRow, bRow) {
            const aKey = getSortKey(a || '', aRow.getData());
            const bKey = getSortKey(b || '', bRow.getData());
            return aKey.localeCompare(bKey, undefined, { numeric: true });
        },
    });
}

/**
 * Create a standardized "Richtig" (correct answers) column for tables
 * Uses responsive width configuration with widthGrow (minWidth auto-calculated from title)
 * @param {object} [options] - Configuration options
 * @param {number} [options.totalItems] - Total number of items (for displaying "von X")
 * @param {boolean} [options.headerFilter] - Whether to enable header filtering (default: false)
 * @param {boolean} [options.headerSort] - Whether to enable header sorting (default: false)
 * @param {number} [options.minWidth] - Minimum width (optional, auto-calculated if not set)
 * @param {number} [options.widthGrow] - Width grow factor (default: COLUMN_GROW_RATIOS.text)
 * @param {string} [options.sorter] - Sorter type (e.g., "number")
 * @param {string} [options.cssClass] - CSS class to apply
 * @returns {object} Tabulator column configuration for "Richtig" column
 */
export function createRichtigColumn({
    totalItems,
    headerFilter = false,
    headerSort = false,
    minWidth,
    widthGrow = COLUMN_GROW_RATIOS.text,
    sorter,
    cssClass,
} = {}) {
    const title = totalItems ? `Richtig (von ${totalItems})` : 'Richtig';

    const colDef = {
        title: title,
        field: 'summedResult',
        // A count: right-aligned so the tabular digits line up down the column.
        hozAlign: 'right',
        headerSort: headerSort,
        widthGrow: widthGrow,
    };

    if (minWidth !== undefined) {
        colDef.minWidth = minWidth;
    }

    if (sorter !== undefined) {
        colDef.sorter = sorter;
    }

    if (cssClass !== undefined) {
        colDef.cssClass = cssClass;
    }

    if (headerFilter) {
        colDef.headerFilter = 'input';
    }

    return colDef;
}

/**
 * Copy a style object onto an element as inline properties.
 * @param {HTMLElement} element - The cell element being styled.
 * @param {object} style - Property name to value, as a column definition supplied it.
 */
function applyInlineStyleProperties(element, style) {
    if (!style) return;

    if (typeof style === 'string') {
        element.style.cssText = style;
        return;
    }

    if (typeof style === 'object') {
        for (const [property, value] of Object.entries(style)) {
            if (value == null) continue;
            element.style.setProperty(property, value);
        }
    }
}

// ============================================================================
// BASE COLUMN DEFINITION FACTORY
// ============================================================================

/**
 * Read a column definition’s `tableMeta`, rejecting anything that is not a plain object.
 * An array or a primitive here is a config mistake; returning null keeps it from being
 * spread into the column and silently producing junk attributes.
 * @param {object} [source] - The column definition to read from.
 * @returns {object|null} The metadata, or null when the definition carries none usable.
 */
function normalizeColumnTableMeta(source = {}) {
    if (
        !source.tableMeta ||
        typeof source.tableMeta !== 'object' ||
        Array.isArray(source.tableMeta)
    ) {
        return null;
    }

    return Object.keys(source.tableMeta).length > 0 ? { ...source.tableMeta } : null;
}

/**
 * Extract TableModule-owned metadata from a column definition or column options object.
 * Only the reserved `tableMeta` namespace is considered part of the supported contract.
 * @param {object} [columnDef={}] - Column definition or options object
 * @returns {object} Cloned metadata object, or an empty object when none exists
 */
export function extractColumnAppMeta(columnDef = {}) {
    return normalizeColumnTableMeta(columnDef) ?? {};
}

/**
 * Base factory for creating Tabulator column definitions.
 * Provides sensible defaults and conditional property injection to reduce boilerplate.
 * App-only metadata lives under `tableMeta`, is consumed later by TableModule,
 * and is stripped before the definition is passed to Tabulator.
 * @param {string} title - Column header text
 * @param {string} field - Row data property name
 * @param {object} [options={}] - Column options
 * @param {number} [options.widthGrow] - Responsive grow ratio (default: COLUMN_GROW_RATIOS.text)
 * @param {number} [options.minWidth] - Minimum pixel width
 * @param {Function|string} [options.formatter] - Cell formatter function or built-in name
 * @param {Function} [options.accessorDownload] - Plain-text value for the CSV/JSON download, for columns whose cell renders a visual element (formatters never run for those formats)
 * @param {string} [options.hozAlign='left'] - Horizontal alignment
 * @param {string} [options.vertAlign='middle'] - Vertical alignment
 * @param {boolean|string} [options.headerFilter=false] - Filter type: false, 'input', 'list'
 * @param {object} [options.headerFilterParams] - Filter configuration
 * @param {Function} [options.headerFilterFunc] - Custom filter function
 * @param {boolean} [options.headerSort=false] - Enable column sorting
 * @param {Function|string} [options.sorter] - Custom sorter (implies headerSort=true)
 * @param {Function} [options.cellClick] - Cell click handler
 * @param {string} [options.cssClass] - CSS class for column cells
 * @param {boolean} [options.visible=true] - Column visibility
 * @param {object} [options.tableMeta] - Reserved TableModule metadata namespace
 * @param {boolean} [options.tableMeta.excludeFromColumnVisibilityMenu=false] - Exclude column from the standardized visibility menu
 * @param {boolean} [options.tableMeta.skipGlossaryAnnotation=false] - Skip both header and cell glossary annotation for this column
 * @param {boolean} [options.tableMeta.skipHeaderGlossaryAnnotation=false] - Skip header glossary annotation for this column
 * @param {boolean} [options.tableMeta.skipCellGlossaryAnnotation=false] - Skip cell glossary annotation for this column
 * @returns {object} Tabulator column definition
 */
export function createColumnDef(title, field, options = {}) {
    const tableMeta = extractColumnAppMeta(options);
    const colDef = {
        title,
        field,
        widthGrow: options.widthGrow ?? COLUMN_GROW_RATIOS.text,
        hozAlign: options.hozAlign || 'left',
        vertAlign: options.vertAlign || 'middle',
        variableHeight: true,
    };

    if (options.minWidth !== undefined) colDef.minWidth = options.minWidth;
    if (options.formatter != null) colDef.formatter = options.formatter;
    if (options.accessorDownload) colDef.accessorDownload = options.accessorDownload;
    if (options.visible === false) colDef.visible = false;
    if (Object.keys(tableMeta).length > 0) colDef.tableMeta = tableMeta;
    colDef.cssClass = ['cell-wrap-text', options.cssClass].filter(Boolean).join(' ');
    if (options.cellClick) colDef.cellClick = options.cellClick;

    // Sort
    if (options.sorter) {
        colDef.headerSort = true;
        colDef.sorter = options.sorter;
    } else if (options.headerSort === false) {
        colDef.headerSort = false;
    } else if (options.headerSort) {
        colDef.headerSort = true;
    }

    // Filter
    if (options.headerFilter) {
        colDef.headerFilter = options.headerFilter === true ? 'input' : options.headerFilter;
        if (options.headerFilterParams) colDef.headerFilterParams = options.headerFilterParams;
        if (options.headerFilterFunc) colDef.headerFilterFunc = options.headerFilterFunc;
    }

    return colDef;
}

// ============================================================================
// SHARED INTERACTION COLUMN HELPERS
// ============================================================================

/**
 * Creates a small "show task" preview trigger button for an item-number cell.
 * Clicking it opens the single-task preview pop-up; the click is stopped from
 * bubbling so it never toggles Tabulator row selection / rowClick.
 *
 * Internal helper for createItemNumberCell.
 * @param {Function} onActivate - Called when the button is clicked
 * @returns {HTMLButtonElement} The trigger button, already wired and stopping propagation.
 */
function createItemPreviewButton(onActivate) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn btn--icon item-preview-trigger';
    button.setAttribute('data-item-action', 'show-task');
    const label = glossaryAnnotator.getRequiredEntryText(
        'general.buttons.element_texts.item-preview.label',
    );
    button.setAttribute('aria-label', label);
    button.setAttribute('title', label);
    button.innerHTML = iconSvg('visibility');
    button.addEventListener('click', (event) => {
        event.stopPropagation();
        onActivate?.();
    });
    return button;
}

/**
 * Builds an item-number cell element: a preview trigger button followed by the
 * number text. Shared by the EN and MA item / student-data tables so the "show
 * task" affordance in front of the task number is identical everywhere.
 * @param {string} displayValue - The (already formatted) item number text
 * @param {Function|null} [onShowTask] - Called when the preview button is clicked
 * @returns {HTMLElement} The cell wrapper: a preview trigger when a handler was given, then the number text.
 */
function createItemNumberCell(displayValue, onShowTask) {
    const wrapper = document.createElement('span');
    wrapper.className = 'item-number-cell';

    if (typeof onShowTask === 'function') {
        wrapper.appendChild(createItemPreviewButton(onShowTask));
    }

    const value = document.createElement('span');
    value.className = 'item-number-cell-value';
    value.textContent = displayValue ?? '';
    wrapper.appendChild(value);

    return wrapper;
}

/**
 * Creates a standardized interactive student-id link column.
 * The shared helper keeps the visual treatment and click plumbing consistent
 * while leaving event publishing to the calling module.
 * @param {string} title - Column header text
 * @param {string} field - Row data property name
 * @param {object} [options={}] - Column options
 * @param {string} [options.linkClass] - CSS classes applied to the link span
 * @param {string} [options.tooltipText] - Static tooltip text
 * @param {Function} [options.getTooltipText] - ({ value, rowData, cell }) => string
 * @param {string | object | Function} [options.style] - Inline style string/object or callback
 * @param {Function} [options.onClick] - ({ event, cell, value, rowData }) => void
 * @param {string} [options.headerFilter] - Tabulator header filter type (default: 'input')
 * @param {number} [options.widthGrow] - Width grow factor (default: COLUMN_GROW_RATIOS.id)
 * @param {object} [options.tableMeta] - Extra table metadata merged into the column
 * @returns {object} Tabulator column definition
 */
export function createStudentIdLinkColumn(title, field, options = {}) {
    const {
        linkClass = 'student-id-link interactive hover-color',
        tooltipText = 'Klicken für Einzelansicht',
        getTooltipText = null,
        style = null,
        onClick = null,
        headerFilter = 'input',
        widthGrow = COLUMN_GROW_RATIOS.id,
        tableMeta = {},
        ...columnOptions
    } = options;
    const columnTableMeta =
        tableMeta && typeof tableMeta === 'object' && !Array.isArray(tableMeta) ? tableMeta : {};

    return createColumnDef(title, field, {
        headerFilter,
        widthGrow,
        tableMeta: {
            ...columnTableMeta,
            skipCellGlossaryAnnotation:
                columnTableMeta.skipCellGlossaryAnnotation ??
                columnTableMeta.skipGlossaryAnnotation ??
                true,
        },
        ...columnOptions,
        formatter(cell) {
            const value = cell.getValue();
            const rowData = cell.getRow().getData();
            const link = document.createElement('span');
            link.className = linkClass;
            link.textContent = value ?? '';

            const resolvedTooltip =
                typeof getTooltipText === 'function'
                    ? getTooltipText({ value, rowData, cell })
                    : tooltipText;
            if (resolvedTooltip) {
                link.setAttribute('data-tooltip-text', resolvedTooltip);
            }

            const resolvedStyle =
                typeof style === 'function' ? style({ value, rowData, cell }) : style;
            applyInlineStyleProperties(link, resolvedStyle);

            return link;
        },
        cellClick: onClick
            ? (event, cell) => {
                  onClick({
                      event,
                      cell,
                      value: cell.getValue(),
                      rowData: cell.getRow().getData(),
                  });
              }
            : undefined,
    });
}

// ============================================================================
// SHARED TRAITS COLUMN (Merkmale)
// ============================================================================

/**
 * List-filter matcher for the traits column. Compares against the cache-backed
 * comma-joined trait text so filtering stays consistent across EN and MA.
 * @param {string} headerValue - The trait selected in the header filter; empty matches every row.
 * @param {*} _rowValue - The raw cell value, unused: the comparison runs on the joined text instead.
 * @param {object} rowData - The whole row, from which the trait text is read.
 * @returns {boolean} True when the row should stay visible.
 */
function traitsHeaderFilterFunc(headerValue, _rowValue, rowData) {
    if (!headerValue) return true;
    const traitText = getTraitsText(rowData);
    if (headerValue === LABELS.KEINE) return traitText === '—';
    if (traitText === '—') return false;
    return traitText.includes(headerValue);
}

/**
 * Sorter for the traits column: empty (—) rows sink to the bottom, rest alphabetical.
 * @param {*} _a - Raw cell value, unused: the comparison runs on the joined text instead.
 * @param {*} _b - Raw cell value, unused, for the same reason.
 * @param {object} aRow - One row component, from which the trait text is read.
 * @param {object} bRow - The other row component.
 * @returns {number} Standard comparator result, with untagged rows always last.
 */
function traitsSorter(_a, _b, aRow, bRow) {
    const aText = getTraitsText(aRow.getData());
    const bText = getTraitsText(bRow.getData());
    if (aText === '—' && bText !== '—') return 1;
    if (bText === '—' && aText !== '—') return -1;
    if (aText === '—' && bText === '—') return 0;
    return aText.localeCompare(bText);
}

/**
 * Formatter shared by all traits columns — emits the glossary-annotated HTML string.
 * @param {object} cell - Tabulator cell component.
 * @returns {string|HTMLElement} The annotated trait markup — always the string form here, since `getTraitsAsText` is called with `asHtmlString`.
 */
function traitsFormatter(cell) {
    return getTraitsAsText(cell.getRow().getData(), true);
}

/**
 * Creates the shared "Merkmale" (traits) column used by the EN and MA tables.
 * Filter and sort read the cache-backed comma-joined trait text (getTraitsText);
 * the cell renders the glossary-annotated HTML produced by getTraitsAsText, so
 * the column opts out of TableModule's cell glossary annotation to avoid double work.
 *
 * Pass `headerFilterParams` to get the interactive list filter + sort (class tables).
 * Omit it for a display-only column (single-row student info tables).
 * @param {string} title - Column header text
 * @param {object} [options={}] - Whether the column is interactive, and how it shares horizontal space.
 * @param {object} [options.headerFilterParams] - List filter params; when present, enables filter + sort
 * @param {number} [options.widthGrow=COLUMN_GROW_RATIOS.traits] - Responsive grow ratio
 * @returns {object} Tabulator column definition
 */
export function createTraitsColumn(
    title,
    { headerFilterParams, widthGrow = COLUMN_GROW_RATIOS.traits } = {},
) {
    const columnOptions = {
        widthGrow,
        hozAlign: 'center',
        formatter: traitsFormatter,
        // The field holds a Set, which the download would otherwise stringify to
        // "{}". Tabulator's row clone passes a Set through by reference, so the
        // accessor sees the live set and can reuse the sort/filter text.
        accessorDownload: (_value, data) => getTraitsText(data),
        tableMeta: { skipCellGlossaryAnnotation: true },
    };

    if (headerFilterParams) {
        columnOptions.headerFilter = 'list';
        columnOptions.headerFilterParams = headerFilterParams;
        columnOptions.headerFilterFunc = traitsHeaderFilterFunc;
        columnOptions.sorter = traitsSorter;
    } else {
        columnOptions.headerSort = false;
    }

    return createColumnDef(title, 'traits', columnOptions);
}
