/**
 * Scatterplot selection controller — owns the EN scatterplot's student-selection state
 * and its drag-to-select (marquee) interaction.
 *
 * The chart *has* one of these (`this.#selection`), created once and persisting across
 * renders; each render re-points it at the fresh svg/g/points via `wireRectangleSelection`.
 * It owns the selected-id set + the rectangle-selecting flag, exposes the public
 * `getSelectedIds`/`setSelectedIds`/`clearSelection` contract the chart delegates to, and
 * the `isSelected`/`isRectangleSelecting` queries the chart's point-render styling reads.
 * D3 selections, the tooltip create/hide helpers, the selection config, and the
 * change callback are injected — no other chart internals are touched.
 */

import { getThemeColors } from '../../../../common/services/themeService.js';
import * as d3 from 'd3';

const INTERACTIVE_MARK_SELECTOR = '.student-point, .class-average-point, .comparison-average-point';

export class ScatterSelectionController {
    #selectedIds;
    #isRectangleSelecting = false;
    #touchSelectionArmed = false;
    /** @type {any} */ #svg = null;
    /** @type {any} */ #g = null;
    #onSelectionChanged;
    #createTooltip;
    #hideTooltip;
    #selectionConfig;
    #tooltipId;

    /**
     * @param {{
     *   selectedIds?: Iterable<any>,
     *   onSelectionChanged?: ((ids: Set<any>) => void)|null,
     *   createTooltip: (id: string, opts: object) => any,
     *   hideTooltip: (tooltip: any) => void,
     *   selectionConfig: {COLOR: string, STROKE_WIDTH: number, UNSELECTED_OPACITY: number, RECT_FILL: string, RECT_STROKE_DASHARRAY: string},
     *   tooltipId: string
     * }} deps - The renderer-owned pieces this controller borrows: the current selection, the change callback, the tooltip helpers it must reuse so tooltips stay tracked, and the selection styling.
     */
    constructor({
        selectedIds = [],
        onSelectionChanged = null,
        createTooltip,
        hideTooltip,
        selectionConfig,
        tooltipId,
    }) {
        this.#selectedIds = new Set(selectedIds);
        this.#onSelectionChanged = onSelectionChanged;
        this.#createTooltip = createTooltip;
        this.#hideTooltip = hideTooltip;
        this.#selectionConfig = selectionConfig;
        this.#tooltipId = tooltipId;
    }

    // ------------------------------------------------------------------
    // Queries (read by the chart's point-render styling)
    // ------------------------------------------------------------------
    isSelected(id) {
        return this.#selectedIds.has(id);
    }

    get isRectangleSelecting() {
        return this.#isRectangleSelecting;
    }

    // ------------------------------------------------------------------
    // Public selection API (the chart delegates its external contract here)
    // ------------------------------------------------------------------
    getSelectedIds() {
        return new Set(this.#selectedIds);
    }

    setSelectedIds(ids) {
        this.#selectedIds = new Set(ids);
        this.refreshPointAppearances();
    }

    clearSelection() {
        this.#selectedIds.clear();
        this.refreshPointAppearances();
        this.#notify();
    }

    /**
     * Toggle a single student's selection (from a point click).
     * @param {string} studentId - The student the clicked point stands for.
     */
    toggle(studentId) {
        if (this.#selectedIds.has(studentId)) {
            this.#selectedIds.delete(studentId);
        } else {
            this.#selectedIds.add(studentId);
        }
        this.#notify();
    }

    /**
     * Restyle a single point to match its current selection state.
     * @param {any} point - D3 selection of one .student-point
     * @param {{studentId: string}} d - The point's bound datum, read for the id the selection is keyed by.
     */
    updatePointAppearance(point, d) {
        const isSelected = this.#selectedIds.has(d.studentId);
        const cfg = this.#selectionConfig;
        point
            .classed('selected', isSelected)
            .style('stroke', isSelected ? cfg.COLOR : getThemeColors().chrome.chartStroke)
            .style('stroke-width', isSelected ? `${cfg.STROKE_WIDTH}px` : '1px')
            .style('opacity', isSelected ? 1 : cfg.UNSELECTED_OPACITY);
    }

    /**
     * Restyle every rendered point to match the current selection.
     */
    refreshPointAppearances() {
        if (!this.#g) return;
        const self = this;
        this.#g.selectAll('.student-point').each(function (d) {
            self.updatePointAppearance(d3.select(this), d);
        });
    }

    // ------------------------------------------------------------------
    // Rectangle (marquee) selection — wired per render against fresh svg/g/points
    // ------------------------------------------------------------------
    /**
     * Install the drag-to-select brush. Called each render with the current selections.
     * @param {any} svg - D3 selection of the chart svg (event surface)
     * @param {any} g - D3 selection of the chart group (coordinate space + point container)
     * @param {any} points - D3 selection of the .student-point circles
     */
    wireRectangleSelection(svg, g, points) {
        this.#svg = svg;
        this.#g = g;
        const self = this;
        const cfg = this.#selectionConfig;
        let startX = 0;
        let startY = 0;
        let isDragging = false;
        let activePointerId = null;

        // Selection rectangle inside the chart group (same coordinate space as
        // points). Select-or-append: this method runs on every render against a
        // fresh group, but a group that survives one would otherwise collect a
        // second rectangle each time.
        let selectionRect = g.select('rect.selection-rectangle');
        if (selectionRect.empty()) {
            selectionRect = g.append('rect').attr('class', 'selection-rectangle');
        }
        selectionRect
            .attr('fill', cfg.RECT_FILL)
            .attr('stroke', cfg.COLOR)
            .attr('stroke-width', 1)
            .attr('stroke-dasharray', cfg.RECT_STROKE_DASHARRAY)
            .style('pointer-events', 'none')
            .style('display', 'none');

        // The armed flag outlives the DOM it is expressed on.
        this.#applyTouchSelectionArmedClass();

        // Undo whatever #previewRectangleSelection painted during the drag. It
        // styles points without touching the selection, so any path that ends a
        // drag without committing one has to put the real appearances back.
        const restoreAppearances = () => {
            points.each(function (d) {
                self.updatePointAppearance(d3.select(this), d);
            });
        };

        const endDrag = (apply, event) => {
            if (!isDragging) return;
            isDragging = false;
            activePointerId = null;
            self.#setRectangleInteraction(false);
            selectionRect.style('display', 'none');

            if (!apply) {
                restoreAppearances();
                return;
            }

            const [currentX, currentY] = d3.pointer(event, g.node());
            const x = Math.min(startX, currentX);
            const y = Math.min(startY, currentY);
            const width = Math.abs(currentX - startX);
            const height = Math.abs(currentY - startY);

            // Only apply if the rectangle is large enough (not just a click);
            // below the threshold the gesture was a click, so the preview has to
            // go back rather than leave points wearing the selected look.
            if (width > 5 && height > 5) {
                self.#applyRectangleSelection(points, x, y, width, height);
            } else {
                restoreAppearances();
            }
        };

        svg.on('pointerdown.selection', function (event) {
            // Only start on left button / primary contact, and not when starting
            // on a student point
            if (event.button !== 0 || !event.isPrimary) return;
            if (event.target.classList.contains('student-point')) return;
            // A finger's default gesture is scrolling the page, so a touch drag
            // only becomes a marquee once the user has said that is what they
            // want. A mouse drag is never gated — it has no other meaning here.
            if (event.pointerType === 'touch' && !self.#touchSelectionArmed) return;

            const [x, y] = d3.pointer(event, g.node());
            startX = x;
            startY = y;
            isDragging = true;
            activePointerId = event.pointerId;
            self.#setRectangleInteraction(true);

            // Capture on the svg replaces the old mouseleave abort: move and up
            // keep arriving even once the pointer has left the chart, so a drag
            // that ends outside still applies rather than being thrown away.
            /** @type {any} */ (svg.node()).setPointerCapture(event.pointerId);

            selectionRect
                .attr('x', startX)
                .attr('y', startY)
                .attr('width', 0)
                .attr('height', 0)
                .style('display', 'block');

            event.preventDefault();
        });

        svg.on('pointermove.selection', function (event) {
            if (!isDragging || event.pointerId !== activePointerId) return;

            const [currentX, currentY] = d3.pointer(event, g.node());
            const x = Math.min(startX, currentX);
            const y = Math.min(startY, currentY);
            const width = Math.abs(currentX - startX);
            const height = Math.abs(currentY - startY);

            selectionRect.attr('x', x).attr('y', y).attr('width', width).attr('height', height);

            self.#previewRectangleSelection(points, x, y, width, height);
        });

        svg.on('pointerup.selection', function (event) {
            if (event.pointerId !== activePointerId) return;
            endDrag(true, event);
        });

        // The browser took the gesture over (a pan it decided was a scroll, a
        // palm rejection); the drag is abandoned, not completed.
        svg.on('pointercancel.selection', function (event) {
            if (event.pointerId !== activePointerId) return;
            endDrag(false, event);
        });
    }

    /**
     * Arm or disarm touch marquee selection. Off by default: an unarmed touch
     * drag over the chart scrolls the page, which is what a finger usually means.
     * Mouse drags ignore this entirely.
     * @param {boolean} armed - Whether a touch drag should draw a marquee.
     */
    setTouchSelectionArmed(armed) {
        this.#touchSelectionArmed = Boolean(armed);
        this.#applyTouchSelectionArmedClass();
    }

    /**
     * Mirror the armed flag onto the svg, where CSS turns it into
     * `touch-action: none` — only while armed, so the chart does not fight page
     * scrolling the rest of the time. Re-applied on every wiring because each
     * render hands over a fresh svg.
     */
    #applyTouchSelectionArmedClass() {
        this.#svg?.classed('selection-armed', this.#touchSelectionArmed);
    }

    /**
     * Toggle pointer-events on interactive marks while a marquee drag is active, so the
     * drag reads the background rather than individual points; restores them afterward.
     * @param {boolean} isActive - True while a drag is in progress.
     */
    #setRectangleInteraction(isActive) {
        this.#isRectangleSelecting = isActive;
        if (!this.#svg) return;

        const interactiveMarks = this.#svg.selectAll(INTERACTIVE_MARK_SELECTOR);

        if (isActive) {
            interactiveMarks.each(function () {
                const mark = d3.select(this);
                if (mark.attr('data-pointer-events-before-marquee') == null) {
                    mark.attr(
                        'data-pointer-events-before-marquee',
                        mark.style('pointer-events') || '',
                    );
                }
                mark.style('pointer-events', 'none');
            });
            this.#hideTooltip(this.#createTooltip(this.#tooltipId, { interactive: true }));
            return;
        }

        requestAnimationFrame(() => {
            if (this.#isRectangleSelecting) return;

            interactiveMarks.each(function () {
                const mark = d3.select(this);
                const previousPointerEvents = mark.attr('data-pointer-events-before-marquee');
                mark.style('pointer-events', /** @type {any} */ (previousPointerEvents || null));
                mark.attr('data-pointer-events-before-marquee', null);
            });
        });
    }

    /**
     * Preview the marquee selection while dragging (highlight points in the rect or
     * already selected; dim the rest).
     * @param {any} points - D3 selection of all .student-point circles.
     * @param {number} x - Marquee left edge, in plot coordinates.
     * @param {number} y - Marquee top edge, in plot coordinates.
     * @param {number} width - Marquee width in px.
     * @param {number} height - Marquee height in px.
     */
    #previewRectangleSelection(points, x, y, width, height) {
        const self = this;
        const cfg = this.#selectionConfig;
        points.each(function (d) {
            const point = d3.select(this);
            const cx = parseFloat(point.attr('cx'));
            const cy = parseFloat(point.attr('cy'));
            const isInRect = cx >= x && cx <= x + width && cy >= y && cy <= y + height;
            const isSelected = self.#selectedIds.has(d.studentId);

            if (isInRect || isSelected) {
                point
                    .style('stroke', cfg.COLOR)
                    .style('stroke-width', `${cfg.STROKE_WIDTH}px`)
                    .style('opacity', 1);
            } else {
                point
                    .style('stroke', getThemeColors().chrome.chartStroke)
                    .style('stroke-width', '1px')
                    .style('opacity', cfg.UNSELECTED_OPACITY);
            }
        });
    }

    /**
     * Commit the marquee selection: add every point inside the rectangle to the
     * selection (preserving prior selections), restyle, and notify.
     * @param {any} points - D3 selection of all .student-point circles.
     * @param {number} x - Marquee left edge, in plot coordinates.
     * @param {number} y - Marquee top edge, in plot coordinates.
     * @param {number} width - Marquee width in px.
     * @param {number} height - Marquee height in px.
     */
    #applyRectangleSelection(points, x, y, width, height) {
        const self = this;
        const newlySelected = [];

        points.each(function (d) {
            const point = d3.select(this);
            const cx = parseFloat(point.attr('cx'));
            const cy = parseFloat(point.attr('cy'));
            if (cx >= x && cx <= x + width && cy >= y && cy <= y + height) {
                newlySelected.push(d.studentId);
            }
        });

        // Add to the existing selection — the "Clear" action starts fresh instead.
        newlySelected.forEach((id) => this.#selectedIds.add(id));

        points.each(function (d) {
            self.updatePointAppearance(d3.select(this), d);
        });

        this.#notify();
    }

    #notify() {
        this.#onSelectionChanged?.(this.#selectedIds);
    }
}
