/**
 * ReportViewModule — the "Bericht" view, where the Sammelexport is arranged: the images
 * captured at tick time, on the A4 pages they will print on.
 */

import { BaseViewModule } from '../../modules/baseViewModule.js';
import { cssVars, renderIcon, requireEl, resizeService } from '@tba3/module-base';
import { applyTemplateTokens } from '@tba3/module-base/glossary';
import { html, nothing, render } from 'lit';
import { classMap } from 'lit/directives/class-map.js';

import { repeat } from 'lit/directives/repeat.js';
import { formatFooterLine } from '../../export/pdfComposer.js';
import { confirmClearSelection } from '../../export/exportSelectionUI.js';
import { SPAN_PRESETS } from '../../export/exportCart.js';
import { exportReportPdf, layoutReportPreview, planReportPages } from './reportLayout.js';
import { ReportCardDrag } from './reportCardDrag.js';
import './reportViewModule.css';
import { notify, notifyFailure } from '../../services/notificationService.js';

/**
 * Preview zoom. `fit-page` is the default: a whole page fits the visible area,
 * so one scroll step is roughly one page instead of one endless column.
 */
const ZOOM_MODES = Object.freeze(['fit-page', 'fit-width', 'full', 'half']);
const DEFAULT_ZOOM = 'fit-page';
/** The capture time in a card's caption; built once, as every caption reads it on every render. */
const CAPTION_TIME = new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit' });

/** @typedef {import('../../export/exportCart.js').ReportItem} ReportItem */

/**
 * A card on screen: the capture it shows and the object URL bound to its blob.
 * @typedef {object} ReportCard
 * @property {number} capturedAt - When its image was captured; a re-capture is a new card.
 * @property {string} url - Object URL of the stored blob.
 */

/** @typedef {import('./reportLayout.js').CardPlacement} CardPlacement */
/** @typedef {import('./reportLayout.js').PreviewLayout} PreviewLayout */

/** @augments BaseViewModule */
export class ReportViewModule extends BaseViewModule {
    /** @type {Array<ReportItem>} in report order */
    #items = [];
    /**
     * The cards on screen, by item id, in the order they were first shown. The DOM
     * keeps that order — a reorder moves only their geometry — so a card being
     * dragged keeps its node and the pointer capture on its handle.
     * @type {Map<string, ReportCard>}
     */
    #cards = new Map();
    /** @type {PreviewLayout|null} The last geometry the scroll area had a box for. */
    #layout = null;
    /** @type {string} one of ZOOM_MODES — session-only, resets to the default on entry */
    #zoom = DEFAULT_ZOOM;
    /** Bumped per #refresh(); a refresh that awaited past a newer one stops. */
    #refreshToken = 0;
    /** Whether a PDF export is running; the export button is busy meanwhile. */
    #exporting = false;
    /**
     * The scroll area and the page stack, found once after the first render; read
     * through #elements().
     * @type {{scroll: HTMLElement, pages: HTMLElement}|null}
     */
    #els = null;
    /** @type {ReportCardDrag} */
    #drag = new ReportCardDrag({
        getIds: () => this.#items.map((item) => item.id),
        moveTo: (id, index) => this.#moveTo(id, index),
        getCard: (id) => this.#cardElement(id),
        getSheets: () =>
            Array.from(
                this.#elements().pages.querySelectorAll('.report-sheet'),
                (sheet) => /** @type {HTMLElement} */ (sheet),
            ),
        setDragging: (id) => {
            this.#draggingId = id;
            this.#render();
        },
        commit: () => this.#saveLayout(),
    });
    /** @type {string|null} The card being dragged. */
    #draggingId = null;
    /**
     * The card whose toolbar a tap revealed, or null. One at a time: revealed
     * toolbars overlap (see the `.is-active` rule in reportViewModule.css).
     * @type {string|null}
     */
    #activeId = null;
    /** @type {string} What the status line last said about a moved card. */
    #status = '';
    /** @type {number|null} The place of the card this view just removed, whose successor takes focus. */
    #removedIndex = null;

    /**
     * The view's copy, from `general.report.*` in the glossary.
     * @param {string} key - Entry below `general.report`.
     * @param {Record<string, string>} [tokens] - Values for the entry's `{token}`s.
     * @returns {string}
     */
    #text(key, tokens) {
        return applyTemplateTokens(
            this.options.context.glossary.getRequiredEntryText(`general.report.${key}`),
            tokens,
        );
    }

    /**
     * @param {string} prefix - Entry stem with `-one` and `-many` forms (and `-empty` when `count` may be 0).
     * @param {number} count - The number the text states.
     * @returns {string} The singular, plural or empty form.
     */
    #countText(prefix, count) {
        if (count === 0) return this.#text(`${prefix}-empty`);
        if (count === 1) return this.#text(`${prefix}-one`);
        return this.#text(`${prefix}-many`, { count: String(count) });
    }

    // ========================================================================
    // LIFECYCLE
    // ========================================================================

    /**
     * @override
     */
    async _renderView() {
        this.classList.add('report-view');
        this.#render();
        this.#els = {
            scroll: requireEl(this, '.report-scroll'),
            pages: requireEl(this, '.report-pages'),
        };
        this.#setupListeners();
        await this.#refresh();
    }

    /** @override */
    _teardown() {
        this.#drag.cancel();
        this.#cards.forEach((card) => URL.revokeObjectURL(card.url));
        super._teardown();
    }

    // ========================================================================
    // DOM
    // ========================================================================

    /**
     * The scroll area and the page stack. Everything that reads them runs after the
     * first render.
     * @returns {{scroll: HTMLElement, pages: HTMLElement}}
     */
    #elements() {
        if (!this.#els) throw new Error(`ReportViewModule[${this.id}]: DOM not created yet`);
        return this.#els;
    }

    /**
     * @param {string} id - Cart entry id.
     * @returns {HTMLElement|undefined} Its card element, while it is on screen.
     */
    #cardElement(id) {
        return (
            /** @type {HTMLElement|null} */ (
                this.#els?.pages.querySelector(
                    `.report-card[data-report-item-id="${CSS.escape(id)}"]`,
                )
            ) ?? undefined
        );
    }

    #setupListeners() {
        const { pages, scroll } = this.#elements();
        this.resources.trackDomListener(document, 'keydown', (event) => {
            if (this.#drag.active && /** @type {KeyboardEvent} */ (event).key === 'Escape') {
                event.preventDefault();
                this.#drag.cancel();
            }
        });
        // A tap that lands outside the page area drops the revealed toolbar, the
        // way moving the cursor off a card does. Capture: controls that
        // stopPropagation() on their own click are invisible to a bubble-phase
        // document listener.
        this.resources.trackDomListener(
            document,
            'click',
            (event) => {
                if (pages.contains(/** @type {Node} */ (event.target))) return;
                this.#setActive(null);
            },
            { capture: true },
        );
        // Cards ticked while another view was on screen arrive on resume.
        this.watch(this.options.context.exportCart.selection, () => void this.#refresh());
        // The fit modes depend on the viewport.
        this.resources.trackSubscription(resizeService.observe(scroll, () => this.#applyLayout()));
    }

    /**
     * Render the toolbar, the empty note and the page preview from the view's state;
     * a re-render patches what is on screen.
     */
    #render() {
        // A torn-down view renders nothing more.
        if (this.destroyed) return;
        const count = this.#items.length;
        const clearLabel = this.options.context.glossary.getRequiredEntryText(
            'general.buttons.element_texts.report-clear.label',
        );
        const exportBusy = this.#exporting ? 'true' : nothing;
        const zoomButtons = repeat(
            ZOOM_MODES,
            (zoom) => zoom,
            (zoom) => {
                const isActive = zoom === this.#zoom;
                return html`<button
                    type="button"
                    class="btn--size-control btn btn--text ${isActive ? 'is-active' : ''}"
                    aria-pressed=${String(isActive)}
                    data-report-zoom=${zoom}
                    @click=${this.#onZoom}
                    .textContent=${this.#text(`zoom.${zoom}`)}
                ></button>`;
            },
        );
        const layout = this.#layout;
        const footerDate = new Date();
        const sheets = (layout?.sheets ?? []).map((style, index, all) => {
            const footer = formatFooterLine({
                appId: this.options.context.appId,
                page: index + 1,
                total: all.length,
                date: footerDate,
            });
            return html`<div class="report-sheet" aria-hidden="true" ${cssVars(style)}>
                <span class="report-sheet-footer">${footer}</span>
            </div>`;
        });
        const indexById = new Map(this.#items.map((item, index) => [item.id, index]));
        const cards = repeat(
            [...this.#cards].filter(([id]) => indexById.has(id)),
            ([id, card]) => `${id}@${card.capturedAt}`,
            ([id, card]) =>
                this.#cardTemplate(
                    this.#items[/** @type {number} */ (indexById.get(id))],
                    /** @type {number} */ (indexById.get(id)),
                    card.url,
                    layout?.cards.get(id),
                ),
        );

        render(
            html`
                <div class="report-toolbar layout-row layout-row--wrap">
                    <span class="report-summary" aria-live="polite"
                        >${this.#countText('summary', count)}</span
                    >
                    <span class="visually-hidden" role="status">${this.#status}</span>
                    <div
                        class="btn-group btn-group--segmented"
                        role="group"
                        aria-label=${this.#text('zoom.label')}
                    >
                        ${zoomButtons}
                    </div>
                    <div class="btn-group">
                        <button
                            type="button"
                            class="btn btn--text btn--primary btn--size-control"
                            ?disabled=${count === 0 || this.#exporting}
                            aria-busy=${exportBusy}
                            @click=${this.#onExport}
                        >
                            ${renderIcon('picture_as_pdf')} ${this.#text('export')}
                        </button>
                        <button
                            type="button"
                            class="btn btn--text btn--size-control"
                            aria-disabled=${count === 0 ? 'true' : 'false'}
                            @click=${this.#onClear}
                        >
                            ${renderIcon('clear_all')} ${clearLabel}
                        </button>
                    </div>
                </div>
                <p class="report-empty" tabindex="-1" ?hidden=${count > 0}>
                    ${this.#text('empty')}
                </p>
                <div class="report-scroll">
                    <div
                        class="report-pages"
                        role="list"
                        aria-label=${this.#text('pages.label')}
                        ${cssVars(layout?.pagesStyle ?? {})}
                        @click=${this.#onCardClick}
                        @pointerdown=${this.#onPointerDown}
                        @pointermove=${this.#onPointerMove}
                        @pointerup=${this.#onPointerUp}
                        @pointercancel=${this.#onPointerCancel}
                    >
                        ${sheets}${cards}
                    </div>
                </div>
            `,
            this,
        );
    }

    /**
     * One card. The toolbar overlays the card instead of sitting above it: on the page
     * it would occupy space the PDF does not have.
     * @param {ReportItem} item
     * @param {number} index - Its place in the report.
     * @param {string} url - Object URL of its stored image.
     * @param {CardPlacement|undefined} placement - Where it sits; none before the preview first had a box.
     * @returns {import('lit').TemplateResult}
     */
    #cardTemplate(item, index, url, placement) {
        const title = item.record.title || item.id;
        const widthLabel = this.#text('card-width.label');
        const spans = SPAN_PRESETS.map((span) => {
            const label = this.#text(`card-width.${span}`);
            return html`<button
                type="button"
                class="btn btn--text ${span === item.span ? 'is-active' : ''}"
                aria-pressed=${String(span === item.span)}
                data-report-card-action="span"
                data-span=${String(span)}
                aria-label=${`${widthLabel} ${label}`}
                .textContent=${label}
            ></button>`;
        });
        const classes = classMap({
            'is-active': this.#activeId === item.id,
            'is-dragging': this.#draggingId === item.id,
        });
        // A div: `listitem` is not an allowed role on <article>.
        return html`<div
            class="report-card ${classes}"
            role="listitem"
            data-report-item-id=${item.id}
            data-page=${placement ? String(placement.page) : nothing}
            data-align=${placement?.align ?? nothing}
            ${cssVars(placement?.style ?? {})}
        >
            <div class="report-card-toolbar">
                <!-- Pointer-only: the up and down buttons are its keyboard path. -->
                <span
                    class="btn btn--icon report-card-handle"
                    data-report-card-action="drag"
                    aria-hidden="true"
                >
                    ${renderIcon('drag_indicator')}
                </span>
                <div class="report-card-heading">
                    <span class="report-card-title">${title}</span>
                    <span class="report-card-meta">${this.#captionFor(item)}</span>
                </div>
                <div
                    class="btn-group btn-group--segmented report-card-spans"
                    role="group"
                    aria-label=${widthLabel}
                >
                    ${spans}
                </div>
                <button
                    type="button"
                    class="btn btn--icon"
                    data-report-card-action="up"
                    aria-label=${this.#text('card-up.label')}
                    aria-disabled=${index === 0 ? 'true' : nothing}
                >
                    ${renderIcon('arrow_upward')}
                </button>
                <button
                    type="button"
                    class="btn btn--icon"
                    data-report-card-action="down"
                    aria-label=${this.#text('card-down.label')}
                    aria-disabled=${index === this.#items.length - 1 ? 'true' : nothing}
                >
                    ${renderIcon('arrow_downward')}
                </button>
                <button
                    type="button"
                    class="btn btn--icon"
                    data-report-card-action="remove"
                    aria-label=${this.#text('card-remove.label')}
                >
                    ${renderIcon('close')}
                </button>
            </div>
            <img
                class="report-card-image"
                alt=${title}
                width=${String(item.record.width)}
                height=${String(item.record.height)}
                src=${url}
            />
        </div>`;
    }

    /**
     * @param {ReportItem} item
     * @returns {string} View label, dataset and capture time, joined for display under the card.
     */
    #captionFor(item) {
        const viewLabel = this.options.viewConfig[item.record.view]?.label;
        const time = CAPTION_TIME.format(item.record.capturedAt);
        // A report can hold cards from several datasets, so each names its own. A card
        // captured in a view the app no longer has names none.
        return [
            viewLabel ? this.#text('caption-view', { view: viewLabel }) : '',
            item.record.datasetLabel,
            this.#text('caption-captured', { time }),
        ]
            .filter(Boolean)
            .join(' · ');
    }

    /**
     * Rebuild the item list from the cart's report, then reconcile the cards. Safe to
     * call at any time; overlapping calls resolve to the latest.
     */
    async #refresh() {
        const token = ++this.#refreshToken;
        const { items, healedCount } = await this.options.context.exportCart.readReport(
            Object.keys(this.options.viewConfig),
        );
        // Said even when a newer refresh took over: the one that dropped the ticks
        // is the only one that knows.
        if (healedCount > 0)
            notify(this.#countText('healed-notice', healedCount), {
                persistent: true,
                glossary: this.options.context.glossary,
            });
        if (this.destroyed || token !== this.#refreshToken) return;

        this.#items = items;
        this.#reconcileCards();
        this.#focusAfterRemoval();
    }

    /**
     * Hand the focus a removed card's button held to the card now in its place, the
     * last one when it was the last, or the empty note when none is left.
     */
    #focusAfterRemoval() {
        if (this.#removedIndex === null) return;
        const next = this.#items[Math.min(this.#removedIndex, this.#items.length - 1)];
        this.#removedIndex = null;
        const target = next
            ? this.querySelector(
                  `.report-card[data-report-item-id="${CSS.escape(next.id)}"] [data-report-card-action="remove"]`,
              )
            : this.querySelector('.report-empty');
        if (target instanceof HTMLElement) target.focus();
    }

    /**
     * Drop the cards that left the report or whose image was re-captured (an untick +
     * tick while this view was suspended keeps the id but changes the record), add the
     * new ones, and re-run the layout.
     */
    #reconcileCards() {
        const wanted = new Map(this.#items.map((item) => [item.id, item]));
        for (const [id, card] of Array.from(this.#cards)) {
            if (wanted.get(id)?.record.capturedAt === card.capturedAt) continue;
            URL.revokeObjectURL(card.url);
            this.#cards.delete(id);
            if (this.#activeId === id) this.#activeId = null;
        }
        for (const item of this.#items) {
            if (this.#cards.has(item.id)) continue;
            this.#cards.set(item.id, {
                capturedAt: item.record.capturedAt,
                url: URL.createObjectURL(item.record.blob),
            });
        }
        this.#applyLayout();
    }

    // ========================================================================
    // PAGE LAYOUT
    // ========================================================================

    /**
     * Place every card on the A4 page it will be printed on, then re-render. While the
     * view is off screen its scroll area is zero-sized and the last geometry stays: the
     * resize observation re-runs this as soon as it has a box.
     */
    #applyLayout() {
        const scroll = this.#els?.scroll;
        if (scroll && scroll.clientWidth > 0 && scroll.clientHeight > 0) {
            this.#layout = layoutReportPreview(
                planReportPages(this.#items),
                this.#availableBox(scroll),
                this.#zoom,
            );
        }
        this.#render();
    }

    /**
     * @param {HTMLElement} scroll - The scroll area the pages are laid out in.
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

    #saveLayout() {
        this.options.context.exportCart.arrange(this.#items);
    }

    /**
     * Move one card to another place in the report and re-run the layout.
     * @param {string} id - Cart entry to move.
     * @param {number} index - Its new place; clamped to the report.
     * @param {{commit?: boolean}} [options] - `commit` saves the new order.
     */
    #moveTo(id, index, { commit = false } = {}) {
        const from = this.#items.findIndex((item) => item.id === id);
        const to = Math.min(Math.max(index, 0), this.#items.length - 1);
        if (from === -1 || to === from) return;
        const [item] = this.#items.splice(from, 1);
        this.#items.splice(to, 0, item);
        this.#applyLayout();
        if (commit) this.#saveLayout();
    }

    /**
     * @param {string} id - Cart entry to resize.
     * @param {number} span - Grid columns it should occupy, out of `REPORT_COLUMNS`.
     */
    #setSpan(id, span) {
        const item = this.#items.find((entry) => entry.id === id);
        if (!item) return;
        item.span = span;
        this.#applyLayout();
        this.#saveLayout();
    }

    /**
     * Reveal one card's toolbar and no other.
     * @param {string|null} id - Cart entry to reveal, or null to reveal none.
     */
    #setActive(id) {
        if (this.#activeId === id) return;
        this.#activeId = id;
        this.#render();
    }

    /** @param {Event} event - A click on a zoom choice. */
    #onZoom = (event) => {
        this.#zoom = /** @type {string} */ (
            /** @type {HTMLElement} */ (event.currentTarget).dataset.reportZoom
        );
        this.#applyLayout();
    };

    #onExport = () => void this.#exportPdf();

    // aria-disabled rather than disabled: the confirm dialog hands focus back to this
    // button just before the emptied report disables it, and a disabled button drops focus.
    #onClear = () => {
        if (this.#items.length === 0) return;
        void confirmClearSelection(this.options.context.exportCart, this.options.context.glossary);
    };

    /** @param {PointerEvent} event - A press on the page stack; on a handle it starts a drag. */
    #onPointerDown = (event) => {
        this.#drag.onPointerDown(event);
    };
    /** @param {PointerEvent} event - Pointer movement over the page stack. */
    #onPointerMove = (event) => {
        this.#drag.onPointerMove(event);
    };
    /** @param {PointerEvent} event - A pointer release over the page stack. */
    #onPointerUp = (event) => {
        this.#drag.onPointerUp(event);
    };
    /** @param {PointerEvent} event - A pointer cancel over the page stack. */
    #onPointerCancel = (event) => {
        this.#drag.onPointerCancel(event);
    };

    /** @param {MouseEvent} event - Click delegated from the card list. */
    #onCardClick = (event) => {
        const target = /** @type {HTMLElement} */ (event.target);
        const id = /** @type {HTMLElement|null} */ (target.closest('.report-card'))?.dataset
            .reportItemId;
        const button = /** @type {HTMLElement|null} */ (
            target.closest('[data-report-card-action]')
        );
        // A tap that missed the toolbar is the request to reveal one: the card it
        // landed on becomes active, the bare page background clears.
        if (!button) {
            this.#setActive(id ?? null);
            return;
        }
        if (!id) return;

        const from = this.#items.findIndex((item) => item.id === id);
        switch (button.dataset.reportCardAction) {
            // aria-disabled, not disabled, at either end: the moved card's button keeps
            // its focus, and the status line says where the card now stands.
            case 'up':
            case 'down': {
                const step = button.dataset.reportCardAction === 'up' ? -1 : 1;
                const to = Math.min(Math.max(from + step, 0), this.#items.length - 1);
                // At either end there is no move, and nothing to announce.
                if (to === from) break;
                // Set before the move, whose render shows it.
                // Named, so two moves in a row never say the same and both are announced.
                const { record } = this.#items[from];
                this.#status = this.#text('card-position', {
                    title: record.title || id,
                    position: String(to + 1),
                    count: String(this.#items.length),
                });
                this.#moveTo(id, to, { commit: true });
                break;
            }
            case 'span':
                this.#setSpan(id, Number(button.dataset.span));
                break;
            case 'remove':
                // The cart's change re-runs #refresh(), which moves the focus on.
                this.#removedIndex = from;
                this.options.context.exportCart.remove(id);
                break;
            default:
                break;
        }
    };

    /**
     * Write the report as a PDF. The items are taken once, before the first await: a
     * refresh while the images decode must not change what the export writes.
     */
    async #exportPdf() {
        if (this.#exporting || this.#items.length === 0) return;
        const items = [...this.#items];

        this.#exporting = true;
        this.#render();
        try {
            await exportReportPdf(this.options.context.appId, items, this.#text('header.title'));
            // The written PDF ends the workflow, so the cart goes with it. Only
            // after save(): a failed compose must leave the selection intact.
            this.options.context.exportCart.clear();
            notify(this.#text('exported-notice'));
        } catch (error) {
            notifyFailure(
                this.options.context.glossary,
                'general.messages.report-export-failed',
                '[ReportView] Export failed',
                error,
            );
        } finally {
            this.#exporting = false;
            if (!this.destroyed) this.#render();
        }
    }
}

customElements.define('tba-report-view', ReportViewModule);
