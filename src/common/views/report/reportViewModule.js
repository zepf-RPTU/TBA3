/**
 * ReportViewModule — the "Bericht" view, where the Sammelexport is arranged.
 *
 * Shows the images captured at tick time on the A4 pages they will print on:
 * `planReportPages()` packs them into row bands and the same bands go to
 * `pdfComposer.addBands()`, so the preview is the document, page breaks included.
 * Shared across the three apps; the only per-app input is the `viewConfig` option.
 */

import { BaseViewModule } from '../../modules/baseViewModule.js';
import { escapeHtml, iconSvg, queryEl } from '@tba3/module-base';
import { glossaryAnnotator } from '@tba3/modules/glossary';
import { exportSelectionManager } from '../../export/exportSelectionManager.js';
import { exportImageStore } from '../../export/exportImageStore.js';
import { buildExportFileName, getAppId } from '../../export/exportFiles.js';
import { A4, createPdfComposer, formatFooterLine } from '../../export/pdfComposer.js';
import {
    SPAN_PRESETS,
    composeBandCanvas,
    loadReportLayout,
    mergeReportLayout,
    planReportBands,
    planReportPages,
    saveReportLayout,
} from './reportLayout.js';
import './reportViewModule.css';
import { notifyFailure } from '../../services/notificationService.js';

/** CSS pixels per millimetre at the 96 dpi the browser assumes for `mm`. */
const PX_PER_MM = 96 / 25.4;
/** Space between two page sheets in the preview (px, independent of zoom). */
const SHEET_GAP_PX = 24;

/**
 * Preview zoom. `fit-page` is the default: a whole page fits the visible area,
 * so one scroll step is roughly one page instead of one endless column.
 */
const ZOOM_MODES = Object.freeze([
    { id: 'fit-page', label: 'Seite' },
    { id: 'fit-width', label: 'Breite' },
    { id: 'full', label: '100 %' },
    { id: 'half', label: '50 %' },
]);
const DEFAULT_ZOOM = 'fit-page';

const CONFIG = {
    /** @type {Record<number, string>} */
    spanLabels: { 12: '1/1', 8: '2/3', 6: '1/2', 4: '1/3' },
};

/**
 * The view's copy, from `general.report.*` in the glossary.
 * @param {string} key - Entry below `general.report`.
 * @returns {string} The text.
 */
const reportText = (key) => glossaryAnnotator.getRequiredEntryText(`general.report.${key}`);

/**
 * @param {number} count - How many cards were dropped for having no stored image.
 * @returns {string} The notice text, singular or plural.
 */
const healedNotice = (count) =>
    count === 1
        ? reportText('healed-notice-one')
        : reportText('healed-notice-many').replace('{count}', String(count));

/**
 * @typedef {object} ReportItem
 * @property {string} id - Cart entry id, also written to the card's dataset.
 * @property {number} span - Grid columns the card occupies, out of 12.
 * @property {import('../../export/exportImageStore.js').StoredExportImage} record - The stored capture: its blob, source view, dataset and timestamp.
 */

export class ReportViewModule extends BaseViewModule {
    /** @type {Array<ReportItem>} in report order */
    #items = [];
    /** @type {Map<string, HTMLElement>} */
    #cardById = new Map();
    /** @type {Map<string, string>} object URLs of the card images */
    #urlById = new Map();
    /** @type {Array<HTMLElement>} page sheets, one per planned page */
    #sheets = [];
    /** @type {string} one of ZOOM_MODES — session-only, resets to the default on entry */
    #zoom = DEFAULT_ZOOM;
    /** Bumped per #refresh(); a refresh that awaited past a newer one stops. */
    #refreshToken = 0;
    /** @type {{id: string, pointerId: number, handle: HTMLElement, snapshot: Array<ReportItem>}|null} */
    #drag = null;
    /**
     * The card whose toolbar is revealed, or null. Hover does this on a pointer
     * that has one; without it a tap is the only way to ask for a card's
     * controls, and only one card may answer at a time — the toolbars are wider
     * than the cards they belong to, so two revealed at once overlap and the one
     * on top is decided by DOM order, which #applyOrder deliberately keeps
     * diverging from what the user sees.
     * @type {string|null}
     */
    #activeId = null;
    #dragFrame = 0;
    /** @type {{x: number, y: number}|null} */
    #dragPointer = null;

    /**
     * @param {string} id - Module id.
     * @param {HTMLElement} container - Element the report view renders into.
     * @param {import('../../modules/baseViewModule.js').ViewModuleOptions & {viewConfig?: {[view: string]: {label?: string}}}} [options={}] - View options, plus the `viewConfig` used to label a card with the view it came from.
     */
    constructor(id, container, options = {}) {
        super(id, container, options);
    }

    // ========================================================================
    // LIFECYCLE
    // ========================================================================

    /**
     * @override
     * @param {object} [_data] - Payload from the parent view; the report reads its own cart, so this is unused.
     */
    async _renderView(_data = {}) {
        this.#createDOM();
        this.#setupListeners();
        await this.#refresh();
    }

    /**
     * Cards ticked while another view was on screen arrive here.
     * @override
     */
    onResume() {
        this.#setNotice('');
        void this.#refresh();
    }

    /** @override */
    destroy() {
        this.#cancelDrag();
        this.#urlById.forEach((url) => URL.revokeObjectURL(url));
        this.#urlById.clear();
        this.#cardById.clear();
        this.#activeId = null;
        this.#sheets = [];
        this.#items = [];
        super.destroy();
    }

    // ========================================================================
    // DOM
    // ========================================================================

    #createDOM() {
        const container = this.container;
        if (!container) return;
        const zoomButtons = ZOOM_MODES.map(
            ({ id, label }) => `
            <button type="button" class="btn btn--text btn--size-control" data-report-zoom="${id}"
                    aria-pressed="${id === this.#zoom}">${escapeHtml(label)}</button>`,
        ).join('');

        container.className = 'report-view view-base';
        container.innerHTML = `
            <div class="report-toolbar layout-row">
                <span class="report-summary" aria-live="polite"></span>
                <div class="btn-group btn-group--segmented report-zoom" role="group" aria-label="${reportText('zoom.label')}">${zoomButtons}</div>
                <div class="btn-group report-toolbar-actions">
                    <button type="button" class="btn btn--text btn--primary btn--size-control" data-report-action="export">
                        ${iconSvg('picture_as_pdf')}
                        Als PDF exportieren
                    </button>
                    <button type="button" class="btn btn--text btn--size-control" data-report-action="clear">
                        ${iconSvg('clear_all')}
                        Auswahl leeren
                    </button>
                </div>
            </div>
            <p class="report-notice" role="status" hidden></p>
            <p class="report-empty" hidden>${reportText('empty')}</p>
            <div class="report-scroll">
                <div class="report-pages" role="list" aria-label="${reportText('pages.label')}"></div>
            </div>
        `;
    }

    #setupListeners() {
        const pages = this.#pagesEl();
        const scroll = queryEl(this.container, '.report-scroll');
        const toolbar = queryEl(this.container, '.report-toolbar');
        if (!pages || !scroll || !toolbar) return;

        this.resources.trackDomListener(toolbar, 'click', (event) =>
            this.#onToolbarClick(/** @type {MouseEvent} */ (event)),
        );
        this.resources.trackDomListener(pages, 'click', (event) =>
            this.#onCardClick(/** @type {MouseEvent} */ (event)),
        );
        this.resources.trackDomListener(pages, 'pointerdown', (event) =>
            this.#onPointerDown(/** @type {PointerEvent} */ (event)),
        );
        this.resources.trackDomListener(pages, 'pointermove', (event) =>
            this.#onPointerMove(/** @type {PointerEvent} */ (event)),
        );
        this.resources.trackDomListener(pages, 'pointerup', () => this.#endDrag());
        this.resources.trackDomListener(pages, 'pointercancel', () => this.#cancelDrag());
        this.resources.trackDomListener(document, 'keydown', (event) => {
            if (this.#drag && /** @type {KeyboardEvent} */ (event).key === 'Escape')
                this.#cancelDrag();
        });
        // A tap that lands outside the page area drops the revealed toolbar, the
        // way moving the cursor off a card does. Capture, for the reason
        // tooltipService.js gives: controls that stopPropagation() on their own
        // click are invisible to a bubble-phase document listener.
        this.resources.trackDomListener(
            document,
            'click',
            (event) => {
                if (pages.contains(/** @type {Node} */ (event.target))) return;
                this.#setActive(null);
            },
            { capture: true },
        );
        this.resources.trackSubscription(
            exportSelectionManager.on('selectionChanged', () => {
                if (!this.isSuspended) void this.#refresh();
            }),
        );
        // The fit modes depend on the viewport; destroy() releases this via
        // resizeService.removeByScope(this.id).
        this.resizeService.observe(scroll, () => this.#applyLayout(), {
            scopeId: this.id,
            debounceMs: 100,
        });
    }

    /**
     * @param {ReportItem} item - Cart entry to render, carrying its stored image and span.
     * @returns {HTMLElement} The card element, with an object URL bound to the stored blob.
     */
    #createCard(item) {
        const card = document.createElement('article');
        card.className = 'report-card';
        card.setAttribute('role', 'listitem');
        card.dataset.reportItemId = item.id;
        card.dataset.capturedAt = String(item.record.capturedAt);

        const url = URL.createObjectURL(item.record.blob);
        this.#urlById.set(item.id, url);

        const spanButtons = SPAN_PRESETS.map(
            (span) => `
            <button type="button" class="btn btn--text btn--size-toolbar-xs" data-report-card-action="span" data-span="${span}"
                    aria-pressed="false" aria-label="${reportText('card-width.label')} ${escapeHtml(CONFIG.spanLabels[span])}">${escapeHtml(CONFIG.spanLabels[span])}</button>`,
        ).join('');

        // The toolbar overlays the card instead of sitting above it: on the page
        // it would occupy space the PDF does not have, and it must stay legible
        // at any zoom (nothing here is transform-scaled).
        card.innerHTML = `
            <div class="report-card-toolbar">
                <button type="button" class="btn btn--icon report-card-handle" data-report-card-action="drag" aria-label="${reportText('card-move.label')}">
                    ${iconSvg('drag_indicator')}
                </button>
                <div class="report-card-heading">
                    <span class="report-card-title">${escapeHtml(item.record.title || item.id)}</span>
                    <span class="report-card-meta">${escapeHtml(this.#captionFor(item))}</span>
                </div>
                <div class="btn-group btn-group--segmented report-card-spans" role="group" aria-label="${reportText('card-width.label')}">${spanButtons}</div>
                <button type="button" class="btn btn--icon" data-report-card-action="up" aria-label="${reportText('card-up.label')}">
                    ${iconSvg('arrow_upward')}
                </button>
                <button type="button" class="btn btn--icon" data-report-card-action="down" aria-label="${reportText('card-down.label')}">
                    ${iconSvg('arrow_downward')}
                </button>
                <button type="button" class="btn btn--icon" data-report-card-action="remove" aria-label="${reportText('card-remove.label')}">
                    ${iconSvg('close')}
                </button>
            </div>
            <img class="report-card-image" alt="${escapeHtml(item.record.title || item.id)}"
                 width="${item.record.width}" height="${item.record.height}" src="${url}">
        `;
        return card;
    }

    /**
     * @param {ReportItem} item - Cart entry whose provenance is being described.
     * @returns {string} View label, dataset and capture time, joined for display under the card.
     */
    #captionFor(item) {
        const viewConfig = this.getOption('viewConfig') ?? {};
        const label = viewConfig[item.record.view]?.label ?? item.record.view;
        const time = new Date(item.record.capturedAt).toLocaleTimeString('de-DE', {
            hour: '2-digit',
            minute: '2-digit',
        });
        // The dataset is named because a report can hold cards from several of
        // them — switching dataset reloads the page but keeps the cart.
        const dataset = item.record.datasetLabel;
        return [`Ansicht ${label}`, dataset, `aufgenommen ${time}`].filter(Boolean).join(' · ');
    }

    // ========================================================================
    // STATE
    // ========================================================================

    /**
     * Rebuild the item list from the cart, the stored images and the saved
     * layout, then reconcile the cards. Safe to call at any time; overlapping
     * calls resolve to the latest.
     */
    async #refresh() {
        const token = ++this.#refreshToken;
        const selectedBefore = new Set(exportSelectionManager.getPersistedSelectedIds());
        const records = await exportImageStore.list();
        if (this.destroyed || token !== this.#refreshToken) return;
        // Read the cart *after* the list resolved: a tick that completed while
        // the list was in flight is selected now and must not count as stale.
        const selected = new Set(exportSelectionManager.getPersistedSelectedIds());

        // Images whose selection is gone (cleared elsewhere, failed toggles).
        const stale = records.filter((record) => !selected.has(record.itemId));
        stale.forEach((record) => {
            exportImageStore.delete(record.itemId).catch(() => {});
        });
        const live = records.filter((record) => selected.has(record.itemId));
        const recordById = new Map(live.map((record) => [record.itemId, record]));

        // Selections whose image is gone (IndexedDB unusable or evicted while
        // the cart in localStorage survived). A tick stores its image before it
        // selects, so an id that was selected both before and after the list
        // and still has no record is a genuine orphan, never a tick that landed
        // during the await. Drop it so cart, checkboxes and report agree again.
        const orphans = Array.from(selected).filter(
            (id) => selectedBefore.has(id) && !recordById.has(id),
        );
        if (orphans.length > 0) {
            this.#setNotice(healedNotice(orphans.length));
            orphans.forEach((id) => exportSelectionManager.deselect(id));
            return; // each deselect emits selectionChanged → a fresh #refresh reconciles
        }

        const appId = getAppId();
        const viewOrder = Object.keys(this.getOption('viewConfig') ?? {});
        const layout = mergeReportLayout(loadReportLayout(appId), live, viewOrder);
        this.#items = layout.map((entry) => ({
            id: entry.id,
            span: entry.span,
            record: /** @type {import('../../export/exportImageStore.js').StoredExportImage} */ (
                recordById.get(entry.id)
            ),
        }));
        saveReportLayout(appId, this.#items);
        this.#reconcileCards();
    }

    #reconcileCards() {
        const pages = this.#pagesEl();
        if (!pages) return;

        // Drop cards that left the report or whose image was re-captured (an
        // untick + tick while this view was suspended keeps the id but changes
        // the record); they are rebuilt below.
        const wanted = new Map(this.#items.map((item) => [item.id, item]));
        for (const [id, card] of Array.from(this.#cardById)) {
            const item = wanted.get(id);
            if (item && card.dataset.capturedAt === String(item.record.capturedAt)) continue;
            card.remove();
            this.#cardById.delete(id);
            if (this.#activeId === id) this.#activeId = null;
            const url = this.#urlById.get(id);
            if (url) URL.revokeObjectURL(url);
            this.#urlById.delete(id);
        }
        for (const item of this.#items) {
            let card = this.#cardById.get(item.id);
            if (!card) {
                card = this.#createCard(item);
                this.#cardById.set(item.id, card);
                pages.appendChild(card);
            }
            this.#applySpan(card, item.span);
        }
        this.#applyOrder();
        this.#updateSummary();
    }

    /**
     * Record each card's place in the report and re-run the page layout; nodes
     * stay where they were inserted, only their inline geometry changes.
     */
    #applyOrder() {
        const last = this.#items.length - 1;
        this.#items.forEach((item, index) => {
            const card = this.#cardById.get(item.id);
            if (!card) return;
            card.dataset.reportOrder = String(index);
            const up = queryEl(card, '[data-report-card-action="up"]');
            const down = queryEl(card, '[data-report-card-action="down"]');
            if (up) /** @type {HTMLButtonElement} */ (up).disabled = index === 0;
            if (down) /** @type {HTMLButtonElement} */ (down).disabled = index === last;
        });
        this.#applyLayout();
    }

    /**
     * @param {HTMLElement} card - Card to resize.
     * @param {number} span - Grid columns the card occupies, out of 12.
     */
    #applySpan(card, span) {
        card.dataset.span = String(span);
        card.querySelectorAll('[data-report-card-action="span"]').forEach((button) => {
            button.setAttribute(
                'aria-pressed',
                String(Number(/** @type {HTMLElement} */ (button).dataset.span) === span),
            );
        });
    }

    // ========================================================================
    // PAGE LAYOUT
    // ========================================================================

    /**
     * Place every card on the A4 page it will be printed on. The plan is the
     * one the export uses, converted from millimetres to preview pixels.
     */
    #applyLayout() {
        const scroll = queryEl(this.container, '.report-scroll');
        const pagesEl = this.#pagesEl();
        // Zero-sized while the view is off screen: the resize observation
        // re-runs this as soon as it has a box.
        if (!scroll || !pagesEl || scroll.clientWidth === 0 || scroll.clientHeight === 0) return;

        const plan = planReportPages(
            this.#items.map((item) => ({
                id: item.id,
                span: item.span,
                width: item.record.width,
                height: item.record.height,
            })),
        );

        // The batch toolbar is fixed over the bottom of the viewport. Reserve its
        // height so the last page can be scrolled clear of it and, more to the
        // point, so "fit page" really fits the area the user can see.
        const batchToolbar = document.querySelector('.batch-export-toolbar.visible');
        scroll.style.setProperty(
            '--report-bottom-inset',
            `${batchToolbar?.getBoundingClientRect().height ?? 0}px`,
        );

        const available = this.#availableBox(scroll);
        // A viewport shorter than the scroll area's own padding would make the
        // fit modes return a negative width, which the browser silently drops.
        const pageWidth = Math.max(1, this.#pageWidthPx(available));
        const pageHeight = pageWidth * (A4.h / A4.w);
        const perMm = pageWidth / A4.w;
        // Pages sit side by side whenever the viewport is wide enough for
        // another one — a portrait page rarely fills a landscape screen, and a
        // single column would waste the rest of it and scroll further than
        // necessary. Never more columns than there are pages, so a short report
        // stays centred.
        const columns = Math.max(
            1,
            Math.min(
                plan.length || 1,
                Math.floor((available.width + SHEET_GAP_PX) / (pageWidth + SHEET_GAP_PX)),
            ),
        );
        const rows = Math.ceil(plan.length / columns);
        const stackWidth = columns * pageWidth + (columns - 1) * SHEET_GAP_PX;

        pagesEl.style.setProperty('--report-page-width', `${pageWidth}px`);
        pagesEl.style.setProperty('--report-page-margin', `${A4.margin * perMm}px`);
        pagesEl.style.width = `${stackWidth}px`;
        pagesEl.style.height =
            rows === 0 ? '0px' : `${rows * pageHeight + (rows - 1) * SHEET_GAP_PX}px`;
        pagesEl.dataset.columns = String(columns);
        this.#syncSheets(pagesEl, plan.length, { columns, pageWidth, pageHeight });

        plan.forEach((cards, pageIndex) => {
            const originX = (pageIndex % columns) * (pageWidth + SHEET_GAP_PX) + A4.margin * perMm;
            const originY =
                Math.floor(pageIndex / columns) * (pageHeight + SHEET_GAP_PX) + A4.margin * perMm;
            cards.forEach((rect) => {
                const card = this.#cardById.get(rect.id);
                if (!card) return;
                const left = originX + rect.xMm * perMm;
                const width = rect.wMm * perMm;
                card.dataset.page = String(pageIndex + 1);
                // Flip the overlay toolbar on cards past the middle of the whole
                // stack, so it is not clipped by the edge of the scroll area.
                card.dataset.align = left + width / 2 > stackWidth / 2 ? 'end' : 'start';
                card.style.left = `${left}px`;
                card.style.top = `${originY + rect.yMm * perMm}px`;
                card.style.width = `${width}px`;
                card.style.height = `${rect.hMm * perMm}px`;
            });
        });
    }

    /**
     * @param {HTMLElement} scroll - its padding already carries the bottom inset
     * @returns {{width: number, height: number}} the area one page has to fit into
     */
    #availableBox(scroll) {
        const styles = getComputedStyle(scroll);
        return {
            width:
                scroll.clientWidth -
                parseFloat(styles.paddingLeft) -
                parseFloat(styles.paddingRight),
            height:
                scroll.clientHeight -
                parseFloat(styles.paddingTop) -
                parseFloat(styles.paddingBottom),
        };
    }

    /**
     * @param {{width: number, height: number}} available - Size of the area the sheets are laid out in.
     * @returns {number} width of one page sheet in px
     */
    #pageWidthPx(available) {
        switch (this.#zoom) {
            case 'fit-width':
                return available.width;
            case 'full':
                return A4.w * PX_PER_MM;
            case 'half':
                return (A4.w * PX_PER_MM) / 2;
            default:
                return Math.min(available.width, available.height * (A4.w / A4.h));
        }
    }

    /**
     * @param {HTMLElement} pagesEl - Container holding the page sheets.
     * @param {number} count - How many sheets the current cards need.
     * @param {{columns: number, pageWidth: number, pageHeight: number}} grid - px
     */
    #syncSheets(pagesEl, count, { columns, pageWidth, pageHeight }) {
        while (this.#sheets.length > count) this.#sheets.pop()?.remove();
        while (this.#sheets.length < count) {
            const sheet = document.createElement('div');
            sheet.className = 'report-sheet';
            sheet.setAttribute('aria-hidden', 'true');
            sheet.innerHTML = '<span class="report-sheet-footer"></span>';
            // Keep the sheets in page order and ahead of the cards, which are
            // appended: the cards must paint on top of the paper.
            const previous = this.#sheets[this.#sheets.length - 1];
            if (previous) previous.after(sheet);
            else pagesEl.prepend(sheet);
            this.#sheets.push(sheet);
        }
        this.#sheets.forEach((sheet, index) => {
            sheet.style.left = `${(index % columns) * (pageWidth + SHEET_GAP_PX)}px`;
            sheet.style.top = `${Math.floor(index / columns) * (pageHeight + SHEET_GAP_PX)}px`;
            sheet.style.width = `${pageWidth}px`;
            sheet.style.height = `${pageHeight}px`;
            const footer = queryEl(sheet, '.report-sheet-footer');
            if (footer) {
                footer.textContent = formatFooterLine({
                    title: reportText('header.title'),
                    page: index + 1,
                    total: count,
                });
            }
        });
    }

    /** @param {string} zoom - Zoom preset to apply to the sheet preview. */
    #setZoom(zoom) {
        if (!ZOOM_MODES.some((mode) => mode.id === zoom)) return;
        this.#zoom = zoom;
        this.container?.querySelectorAll('[data-report-zoom]').forEach((button) => {
            button.setAttribute(
                'aria-pressed',
                String(/** @type {HTMLElement} */ (button).dataset.reportZoom === zoom),
            );
        });
        this.#applyLayout();
    }

    /** @param {string} text - empty hides the notice */
    #setNotice(text) {
        const notice = queryEl(this.container, '.report-notice');
        if (!notice) return;
        notice.textContent = text;
        notice.hidden = !text;
    }

    #updateSummary() {
        const count = this.#items.length;
        const summary = queryEl(this.container, '.report-summary');
        const empty = queryEl(this.container, '.report-empty');
        const exportButton = /** @type {HTMLButtonElement|null} */ (
            queryEl(this.container, '[data-report-action="export"]')
        );
        if (summary)
            summary.textContent =
                count === 0 ? 'Keine Elemente' : count === 1 ? '1 Element' : `${count} Elemente`;
        if (empty) empty.hidden = count > 0;
        if (exportButton) exportButton.disabled = count === 0;
    }

    #saveLayout() {
        saveReportLayout(getAppId(), this.#items);
    }

    /**
     * @param {string} id - Cart entry to move.
     * @param {number} delta - Positions to shift it by; negative moves it earlier.
     */
    #move(id, delta) {
        const from = this.#items.findIndex((item) => item.id === id);
        const to = from + delta;
        if (from === -1 || to < 0 || to >= this.#items.length) return;
        const [item] = this.#items.splice(from, 1);
        this.#items.splice(to, 0, item);
        this.#applyOrder();
        this.#saveLayout();
    }

    /**
     * @param {string} id - Cart entry to resize.
     * @param {number} span - Grid columns it should occupy, out of 12.
     */
    #setSpan(id, span) {
        const item = this.#items.find((entry) => entry.id === id);
        const card = this.#cardById.get(id);
        if (!item || !card || !SPAN_PRESETS.includes(span)) return;
        item.span = span;
        this.#applySpan(card, span);
        this.#applyLayout();
        this.#saveLayout();
    }

    /**
     * Reveal one card's toolbar and no other.
     * @param {string|null} id - Cart entry to reveal, or null to reveal none.
     */
    #setActive(id) {
        if (this.#activeId === id) return;
        if (this.#activeId) this.#cardById.get(this.#activeId)?.classList.remove('is-active');
        this.#activeId = id;
        if (id) this.#cardById.get(id)?.classList.add('is-active');
    }

    /** @param {string} id - Cart entry to drop from the report. */
    #remove(id) {
        // The manager drops the stored image; its selectionChanged re-runs #refresh().
        exportSelectionManager.deselect(id);
    }

    #clear() {
        if (
            !confirm(
                glossaryAnnotator.getRequiredEntryText('general.messages.confirm-clear-report'),
            )
        )
            return;
        exportSelectionManager.clearSelection();
    }

    // ========================================================================
    // EVENTS
    // ========================================================================

    /** @param {MouseEvent} event - Click delegated from the toolbar. */
    #onToolbarClick(event) {
        const target = /** @type {HTMLElement} */ (event.target);
        const zoom = /** @type {HTMLElement|null} */ (target.closest('[data-report-zoom]'));
        if (zoom?.dataset.reportZoom) {
            this.#setZoom(zoom.dataset.reportZoom);
            return;
        }
        const button = /** @type {HTMLElement|null} */ (target.closest('[data-report-action]'));
        if (!button) return;
        if (button.dataset.reportAction === 'export')
            void this.#exportPdf(/** @type {HTMLButtonElement} */ (button));
        if (button.dataset.reportAction === 'clear') this.#clear();
    }

    /** @param {MouseEvent} event - Click delegated from the card list. */
    #onCardClick(event) {
        const button = /** @type {HTMLElement|null} */ (
            /** @type {HTMLElement} */ (event.target).closest('[data-report-card-action]')
        );
        const card = /** @type {HTMLElement|null} */ (button?.closest('.report-card') ?? null);
        const id = card?.dataset.reportItemId;
        // A tap that missed the toolbar is the request to reveal one: the card it
        // landed on becomes active, the bare page background clears.
        if (!button) {
            const tapped = /** @type {HTMLElement|null} */ (
                /** @type {HTMLElement} */ (event.target).closest('.report-card')
            );
            this.#setActive(tapped?.dataset.reportItemId ?? null);
            return;
        }
        if (!id) return;

        switch (button.dataset.reportCardAction) {
            case 'up':
                this.#move(id, -1);
                break;
            case 'down':
                this.#move(id, 1);
                break;
            case 'span':
                this.#setSpan(id, Number(button.dataset.span));
                break;
            case 'remove':
                this.#remove(id);
                break;
            default:
                break;
        }
    }

    // ---- drag ---------------------------------------------------------------

    /** @param {PointerEvent} event - Pointer press that may begin a card drag. */
    #onPointerDown(event) {
        if (event.button !== 0 || this.#drag) return;
        const handle = /** @type {HTMLElement|null} */ (
            /** @type {HTMLElement} */ (event.target).closest('.report-card-handle')
        );
        const card = /** @type {HTMLElement|null} */ (handle?.closest('.report-card') ?? null);
        const id = card?.dataset.reportItemId;
        if (!handle || !card || !id) return;

        event.preventDefault();
        handle.setPointerCapture(event.pointerId);
        this.#drag = { id, pointerId: event.pointerId, handle, snapshot: [...this.#items] };
        card.classList.add('is-dragging');
    }

    /** @param {PointerEvent} event - Pointer movement during an active card drag. */
    #onPointerMove(event) {
        if (!this.#drag || event.pointerId !== this.#drag.pointerId) return;
        this.#dragPointer = { x: event.clientX, y: event.clientY };
        if (this.#dragFrame) return;
        this.#dragFrame = requestAnimationFrame(() => {
            this.#dragFrame = 0;
            if (this.#drag && this.#dragPointer) this.#dragTo(this.#dragPointer);
        });
    }

    /**
     * Move the dragged card to the slot under the pointer. The cards whose
     * vertical extent contains the pointer form the target row; the one under
     * the pointer decides (before it in its left half, after it otherwise), or
     * the row's first/last card when the pointer is left/right of them all.
     * Only the cards on the page under the pointer are candidates — with the
     * sheets side by side, the page next to it holds cards at the same height.
     * With nothing at that height — a page margin, the gap between two sheets,
     * past the last card — the slot follows the last card that ends above the
     * pointer on that page, or the last card of the pages before it, so
     * dropping between pages appends to the page above.
     * @param {{x: number, y: number}} pointer - Current pointer position, in page coordinates.
     */
    #dragTo(pointer) {
        if (!this.#drag) return;
        const dragId = this.#drag.id;
        const from = this.#items.findIndex((item) => item.id === dragId);
        if (from === -1) return;

        /** @type {Array<{id: string, rect: DOMRect}>} */
        const others = [];
        this.#items.forEach((item) => {
            const rect = this.#cardById.get(item.id)?.getBoundingClientRect();
            if (item.id !== dragId && rect) others.push({ id: item.id, rect });
        });
        if (others.length === 0) return;

        // With the sheets packed into columns, "in this row" and "above" only
        // mean anything inside one page: the sheet beside it carries cards at
        // the very same height. So the page under the pointer supplies the
        // candidates, and the pages before it decide the fallback slot.
        const page = this.#pageUnder(pointer);
        const pageOf = (id) => Number(this.#cardById.get(id)?.dataset.page);
        const onPage = page === 0 ? others : others.filter(({ id }) => pageOf(id) === page);
        const earlier = page === 0 ? [] : others.filter(({ id }) => pageOf(id) < page);

        let target;
        const row = onPage.filter(({ rect }) => pointer.y >= rect.top && pointer.y <= rect.bottom);
        if (row.length > 0) {
            const under = row.find(({ rect }) => pointer.x >= rect.left && pointer.x <= rect.right);
            const leftOfRow = pointer.x < row[0].rect.left;
            const anchor = under ?? (leftOfRow ? row[0] : row[row.length - 1]);
            const after = under ? pointer.x > anchor.rect.left + anchor.rect.width / 2 : !leftOfRow;
            target = this.#items.findIndex((item) => item.id === anchor.id) + (after ? 1 : 0);
        } else {
            const above = onPage.filter(({ rect }) => rect.bottom < pointer.y);
            const last = above[above.length - 1] ?? earlier[earlier.length - 1];
            target = last ? this.#items.findIndex((item) => item.id === last.id) + 1 : 0;
        }
        // Removing the dragged card first shifts everything after it up by one.
        if (target > from) target -= 1;
        if (target === from) return;

        const [item] = this.#items.splice(from, 1);
        this.#items.splice(target, 0, item);
        this.#applyOrder();
    }

    #endDrag() {
        if (!this.#drag) return;
        this.#finishDrag();
        this.#saveLayout();
    }

    #cancelDrag() {
        if (!this.#drag) return;
        this.#items = this.#drag.snapshot;
        this.#finishDrag();
        this.#applyOrder();
    }

    #finishDrag() {
        const drag = this.#drag;
        this.#drag = null;
        this.#dragPointer = null;
        if (this.#dragFrame) {
            cancelAnimationFrame(this.#dragFrame);
            this.#dragFrame = 0;
        }
        if (!drag) return;
        this.#cardById.get(drag.id)?.classList.remove('is-dragging');
        if (drag.handle.hasPointerCapture?.(drag.pointerId))
            drag.handle.releasePointerCapture(drag.pointerId);
    }

    // ========================================================================
    // EXPORT
    // ========================================================================

    /** @param {HTMLButtonElement} button - The export button, disabled while the PDF is produced. */
    async #exportPdf(button) {
        if (this.#items.length === 0 || button.disabled) return;

        button.disabled = true;
        button.setAttribute('aria-busy', 'true');
        try {
            /** @type {Map<string, CanvasImageSource>} */
            const imageById = new Map();
            await Promise.all(
                this.#items.map(async (item) => {
                    const image = /** @type {HTMLImageElement|null} */ (
                        this.#cardById.get(item.id)?.querySelector('img')
                    );
                    if (!image)
                        throw new Error(`[ReportView] Missing card image for "${item.id}".`);
                    await image.decode();
                    imageById.set(item.id, image);
                }),
            );

            const bands = planReportBands(
                this.#items.map((item) => ({
                    id: item.id,
                    span: item.span,
                    width: item.record.width,
                    height: item.record.height,
                })),
            );
            const composer = await createPdfComposer();
            // Bands are rendered one at a time while the pages are written (a
            // 30-card report would otherwise hold ~30 full-width canvases at once).
            composer.addBands(
                bands.map((band) => ({
                    widthPx: Math.max(1, Math.round(band.width)), // same rounding as composeBandCanvas
                    heightPx: Math.max(1, Math.round(band.height)),
                    render: () => composeBandCanvas(band, imageById),
                })),
                { title: reportText('header.title') },
            );
            composer.save(buildExportFileName({ title: reportText('header.title'), ext: 'pdf' }));
            // The written PDF ends the workflow, so the cart goes with it —
            // otherwise it is still full at the next visit and re-ticks the
            // checkboxes of modules the user is done with. Only after save():
            // a failed compose must leave the selection intact.
            exportSelectionManager.clearSelection();
            this.#setNotice(reportText('exported-notice'));
        } catch (error) {
            notifyFailure(
                'general.messages.report-export-failed',
                '[ReportView] Export failed',
                error,
            );
        } finally {
            button.disabled = false;
            button.removeAttribute('aria-busy');
        }
    }

    // ========================================================================
    // HELPERS
    // ========================================================================

    /**
     * @param {{x: number, y: number}} pointer - viewport coordinates
     * @returns {number} 1-based page under the pointer, 0 when it is over none
     */
    #pageUnder(pointer) {
        return (
            this.#sheets.findIndex((sheet) => {
                const rect = sheet.getBoundingClientRect();
                return (
                    pointer.x >= rect.left &&
                    pointer.x <= rect.right &&
                    pointer.y >= rect.top &&
                    pointer.y <= rect.bottom
                );
            }) + 1
        );
    }

    /** @returns {HTMLElement|null} the positioned container holding sheets and cards */
    #pagesEl() {
        return queryEl(this.container, '.report-pages');
    }
}
