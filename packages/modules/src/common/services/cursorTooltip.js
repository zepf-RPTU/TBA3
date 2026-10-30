/**
 * Mark tooltips: rich HTML above the hovered or focused mark of a chart or dense
 * visual. Content is structured text, escaped on render, with no glossary annotation.
 * It stands above its mark, following it when the page or a scroll area moves, and
 * takes the pointer (WCAG 1.4.13: a magnifier user pans across it), so it hides only
 * after a grace period once the pointer has left both mark and tooltip; Escape
 * dismisses it until the pointer leaves the mark.
 *
 * The page has one tooltip element, shown for one mark at a time. It is a manual
 * popover: in the top layer, above a modal dialog the chart sits in, and shown and
 * hidden only by the pointer and focus paths.
 */

import { cssVarsAttr, escapeHtml, followAnchor, setTrustedHTML } from '@tba3/module-base';
import { markerPath } from '../charts/markerSymbols.js';
import { MISSING_VALUE } from '../utils/numberFormat.js';
import './cursorTooltip.css';

/**
 * The mark a row names, drawn small before its label, so a reader matches the row to
 * the marker on the chart without the legend: its shape and paint as on the chart, at
 * the key's one size, on a chip of the card surface (the tooltip box is near-black in
 * both schemes). Both tooltip paths draw it.
 * @typedef {object} TooltipRowKey
 * @property {string} symbol - `circle`, or a `markerPath` shape.
 * @property {import('../charts/averageMarkers.js').AverageMarkerPaint} paint
 */

/**
 * One label/value line; the value is formatted by the caller, and a missing one
 * (`null`, `undefined` or `''`) prints `MISSING_VALUE`.
 * @typedef {{label: string, value: string|number|null|undefined, key?: TooltipRowKey}} TooltipRow
 */

/**
 * Structured content of a mark tooltip, all plain text. A falsy entry in
 * `rows` or `footer` is skipped, so a conditional row reads `condition && row`.
 * @typedef {object} TooltipContent
 * @property {string} [title] - Heading line: the thing hovered.
 * @property {string} [subtitle] - Line under the heading: what the thing belongs to.
 * @property {Array<TooltipRow|false|null|undefined>} [rows] - Label/value rows.
 * @property {Array<TooltipRow|false|null|undefined>} [footer] - Rows drawn under a divider: a summary of the whole the row belongs to.
 */

/** Gap between the mark and the tooltip above it: short, so the pointer crosses it within the grace. */
const MARK_GAP_PX = 4;
/**
 * How long the tooltip stays once the pointer left its mark or itself: time to cross
 * the gap into it, or back.
 */
const HIDE_GRACE_MS = 300;

/**
 * A row's value as printed: `MISSING_VALUE` for a missing one.
 * @param {TooltipRow} row
 * @returns {string|number}
 */
function rowValue(row) {
    return row.value === null || row.value === undefined || row.value === ''
        ? MISSING_VALUE
        : row.value;
}

/**
 * The rows that are there: a falsy entry is a conditional row left out.
 * @param {Array<TooltipRow|false|null|undefined>} rows
 * @returns {TooltipRow[]}
 */
function presentRows(rows) {
    return /** @type {TooltipRow[]} */ (rows.filter((row) => !!row));
}

/** Nominal size of a key's marker, within the key's ±7 box; a circle covers the area the other shapes do. */
const KEY_MARKER_SIZE_UNITS = 4.5;

/** Radius of a key's centre dot, in its 14-unit box. */
const KEY_DOT_RADIUS_UNITS = 1.5;

/**
 * A row key's markup: the mark as an inline SVG, its paint carried as custom properties
 * the stylesheet reads (`.tooltip-key`), set through CSSOM when the markup is parsed.
 * @param {TooltipRowKey} key
 * @returns {string} The `<svg>`.
 */
function keyHTML({ symbol, paint }) {
    const vars = cssVarsAttr({
        '--tooltip-key-fill': paint.fill,
        '--tooltip-key-stroke': paint.stroke,
        '--tooltip-key-stroke-width': `${paint.strokeWidth}px`,
        '--tooltip-key-dot': paint.dotFill ?? 'transparent',
    });
    const dot = paint.dotFill
        ? `<circle class="tooltip-key-dot" r="${KEY_DOT_RADIUS_UNITS}"></circle>`
        : '';
    // oxlint-disable-next-line tba3/icon-sources -- a data mark, not an icon: the chart's marker shape, which no glyph has
    return `<svg class="tooltip-key" viewBox="-7 -7 14 14" aria-hidden="true"${vars}><path d="${markerPath(symbol, KEY_MARKER_SIZE_UNITS)}"></path>${dot}</svg>`;
}

/**
 * The markup of label/value rows, skipping the falsy entries.
 * @param {Array<TooltipRow|false|null|undefined>} rows
 * @returns {string} One `.tooltip-row` per row.
 */
function rowsHTML(rows) {
    return presentRows(rows)
        .map(
            (row) => `<div class="tooltip-row">
                    <span class="label">${row.key ? keyHTML(row.key) : ''}${escapeHtml(row.label)}:</span>
                    <strong class="value">${escapeHtml(rowValue(row))}</strong>
                </div>`,
        )
        .join('');
}

class CursorTooltip {
    /** @type {HTMLDivElement|null} The page's one tooltip; see `#tooltip()`. */
    #element = null;

    /** @type {Element|null} The mark the tooltip is shown for, while it is. */
    #owner = null;

    /** @type {Element|null} The mark whose tooltip Escape dismissed, until the pointer leaves it. */
    #dismissed = null;

    /** @type {ReturnType<typeof setTimeout>|null} The pending hide after the pointer left. */
    #hideTimer = null;

    /** Stops the tooltip following its mark; set while it is shown. */
    #stopFollowing = () => {};

    /**
     * The tooltip element under `<body>`, made on first use and again when something
     * took it out of the document. The pointer and the keyboard only ever show one
     * tooltip at a time, so one element serves every chart; the mark that showed it
     * last owns it.
     * @returns {HTMLDivElement}
     */
    #tooltip() {
        if (this.#element?.isConnected) return this.#element;
        // Hidden from assistive tech: the marks carry the same text as their accessible
        // names (`toPlainText`), so a screen reader would hear it twice.
        const tooltip = document.createElement('div');
        tooltip.id = 'cursor-tooltip';
        tooltip.className = 'tooltip mark-tooltip';
        tooltip.popover = 'manual';
        tooltip.setAttribute('aria-hidden', 'true');
        // The pointer may rest on the tooltip; leaving it for anything but its mark
        // starts the grace as leaving the mark does.
        tooltip.addEventListener('mouseenter', () => this.#cancelHide());
        tooltip.addEventListener('mouseleave', (event) => {
            const to = event.relatedTarget;
            if (to instanceof Node && this.#owner?.contains(to)) return;
            this.#hideSoon();
        });
        document.body.append(tooltip);
        this.#element = tooltip;
        return tooltip;
    }

    /**
     * Show the tooltip beside a mark, for the pointer resting on it or the keyboard
     * focusing it. A mark whose tooltip Escape dismissed shows none until it is left.
     * @param {Element} owner - The mark it is shown for.
     * @param {TooltipContent} content
     */
    show(owner, content) {
        if (owner === this.#dismissed) return;
        this.#cancelHide();
        const tooltip = this.#tooltip();
        setTrustedHTML(tooltip, this.buildHTML(content));
        if (!this.isShown()) tooltip.showPopover();
        // The same mark again (new content) keeps its following: the tooltip's resize
        // places it anew.
        if (this.#owner === owner) return;
        this.#owner = owner;
        this.#stopFollowing();
        // Placed from the origin, so the shrink-to-fit width is the one `max-width` caps,
        // not one the last position squeezed against the viewport edge.
        tooltip.style.left = '0px';
        tooltip.style.top = '0px';
        // Above, not beside: the tooltip takes the pointer, so beside a mark it would sit
        // over the next mark of the row and catch the click meant for it.
        this.#stopFollowing = followAnchor(owner, tooltip, {
            placement: 'top',
            gapPx: MARK_GAP_PX,
            crossAxis: true,
        });
    }

    /** @returns {boolean} Whether the tooltip is on screen. */
    isShown() {
        return this.#element?.matches(':popover-open') ?? false;
    }

    /**
     * The pointer left a mark: its tooltip goes after the grace, unless the pointer
     * reaches the tooltip or another mark first; a dismissed mark may show again.
     * @param {Element} owner - The mark left.
     */
    leave(owner) {
        if (this.#dismissed === owner) this.#dismissed = null;
        if (this.#owner === owner) this.#hideSoon();
    }

    /** Hide after the grace period, unless the pointer comes back first. */
    #hideSoon() {
        this.#cancelHide();
        this.#hideTimer = setTimeout(() => this.hide(), HIDE_GRACE_MS);
    }

    #cancelHide() {
        if (this.#hideTimer !== null) clearTimeout(this.#hideTimer);
        this.#hideTimer = null;
    }

    /**
     * Escape: hide the tooltip, and keep it hidden for its mark until the pointer
     * leaves that mark (WCAG 1.4.13, dismissible without moving the pointer).
     * @returns {boolean} Whether a tooltip was shown, so the press is claimed.
     */
    dismiss() {
        if (!this.isShown()) return false;
        this.#dismissed = this.#owner;
        this.hide();
        return true;
    }

    /**
     * Hide the tooltip; given a root, only while it is shown for a mark inside it (a
     * chart taking its marks away, or claiming the pointer).
     * @param {Element|null} [root]
     */
    hide(root = null) {
        if (root && !(this.#owner && root.contains(this.#owner))) return;
        this.#cancelHide();
        this.#stopFollowing();
        this.#owner = null;
        if (this.isShown()) this.#element?.hidePopover();
    }

    /**
     * The tooltip as one sentence for an accessible name: title, subtitle, then each row
     * as `label: value`, joined by `. ` (a comma would blur into the decimal commas).
     * @param {TooltipContent} content
     * @returns {string}
     */
    toPlainText(content) {
        const { title, subtitle, rows = [], footer = [] } = content;
        const rowTexts = presentRows([...rows, ...footer]).map(
            (row) => `${row.label}: ${rowValue(row)}`,
        );
        return [title, subtitle, ...rowTexts].filter(Boolean).join('. ');
    }

    /**
     * The tooltip markup for `{ title, subtitle, rows, footer }`, every part escaped: what
     * `show()` writes, and the string `setTooltipContent` stores in `data-tooltip-html`,
     * which `tooltipService` glossary-annotates as markup before it shows it.
     * @param {TooltipContent} content
     * @returns {string}
     */
    buildHTML(content) {
        const { title, subtitle, rows = [], footer = [] } = content;

        let markup = '';
        if (title) {
            markup += `<div class="tooltip-title">${escapeHtml(title)}</div>`;
        }
        if (subtitle) {
            markup += `<div class="tooltip-subtitle">${escapeHtml(subtitle)}</div>`;
        }
        markup += rowsHTML(rows);
        const footerRows = rowsHTML(footer);
        if (footerRows) {
            markup += `<div class="tooltip-divider">${footerRows}</div>`;
        }

        return markup;
    }
}

export const cursorTooltip = new CursorTooltip();

/**
 * Give an element the delegated tooltip of structured content: the same title and rows
 * a chart tooltip shows, rendered and escaped by `buildHTML`, which `tooltipService`
 * shows on hover (glossary-annotated, like every `data-tooltip-html`).
 * @param {Element} element - The trigger, e.g. a table bar segment.
 * @param {TooltipContent} content
 */
export function setTooltipContent(element, content) {
    element.setAttribute('data-tooltip-html', cursorTooltip.buildHTML(content));
}
