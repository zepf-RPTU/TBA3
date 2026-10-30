/**
 * The EN scatterplot's student selection, the look a point rests in, and the drag-to-select (marquee) interaction. The selection and the
 * touch arming are signals the chart is handed (its host's state), so a write from
 * anywhere repaints the points; a click or a marquee writes them too. The chart creates
 * one controller and keeps it across renders; each render re-points it at the fresh
 * svg/g/points through `wireRectangleSelection`.
 */

import { onChange, ResourceTracker, toSignal } from '@tba3/module-base';
import { CHART_CONFIG } from './scatterplotConstants.js';
import { MARK_DEFAULTS } from '../../../../common/charts/chartDefaults.js';
import { selectOrAppend } from '../../../../common/charts/selectOrAppend.js';
import * as d3 from 'd3';

/**
 * @typedef {{stroke: string, strokeWidth: string, opacity: number}} PointStyle
 */

/** @typedef {import('./scatterplot.js').JitteredPoint} JitteredPoint */

/** @typedef {d3.Selection<SVGCircleElement, JitteredPoint, any, any>} PointSelection */

export class ScatterSelectionController {
    /** @type {import('@preact/signals-core').Signal<ReadonlySet<string>>} */
    #selectedIds;
    /** @type {import('@preact/signals-core').Signal<boolean>} */
    #touchSelectionArmed;
    #enabled;
    #isRectangleSelecting = false;
    /** @type {d3.Selection<SVGSVGElement, unknown, any, any>|null} */ #svg = null;
    /** @type {d3.Selection<SVGGElement, unknown, any, any>|null} */ #g = null;
    #hideTooltip;
    /** The signal followers `destroy()` ends. */
    #resources = new ResourceTracker('ScatterSelectionController');
    /**
     * Highlight state each point was last painted with by the marquee preview, so a
     * pointermove only restyles the points whose state flipped. Replaced whenever
     * something else paints the points.
     * @type {WeakMap<Element, boolean>}
     */
    #previewHighlight = new WeakMap();

    /**
     * @param {{
     *   enabled?: boolean,
     *   selectedIds?: ReadonlySet<string> | import('@preact/signals-core').Signal<ReadonlySet<string>>,
     *   touchSelectionArmed?: boolean | import('@preact/signals-core').Signal<boolean>,
     *   hideTooltip: () => void,
     * }} deps - Whether the chart selects at all (off, every point rests plain); the selection and whether a touch drag draws a marquee, as the host's signals (shared); and the chart's tooltip hide (a drag takes the pointer off every point).
     */
    constructor({
        enabled = true,
        selectedIds = new Set(),
        touchSelectionArmed = false,
        hideTooltip,
    }) {
        this.#enabled = enabled;
        this.#selectedIds = toSignal(selectedIds);
        this.#touchSelectionArmed = toSignal(touchSelectionArmed);
        this.#hideTooltip = hideTooltip;
        this.#resources.trackSubscription(
            onChange(
                () => this.#selectedIds.value,
                () => this.#repaint(),
            ),
        );
        this.#resources.trackSubscription(
            onChange(
                () => this.#touchSelectionArmed.value,
                () => this.#applyTouchSelectionArmedClass(),
            ),
        );
    }

    /** Stop following the signals: the chart is destroyed, the host keeps them. */
    destroy() {
        this.#resources.destroy();
    }

    /**
     * @param {string} id
     * @returns {boolean}
     */
    isSelected(id) {
        return this.#selectedIds.peek().has(id);
    }

    get isRectangleSelecting() {
        return this.#isRectangleSelecting;
    }

    /**
     * Toggle a single student's selection (from a point click); the write repaints.
     * @param {string} studentId
     */
    toggle(studentId) {
        const next = new Set(this.#selectedIds.peek());
        if (!next.delete(studentId)) next.add(studentId);
        this.#selectedIds.value = next;
    }

    // ------------------------------------------------------------------
    // Point look — the one place a point's stroke and opacity are decided
    // ------------------------------------------------------------------
    /**
     * The look a point rests in: highlighted when selected, dimmed while others are,
     * plain otherwise: before anything is picked, every point is a candidate at full
     * strength, matching its key entry. The hover leave returns to this.
     * @param {{studentId: string}} d
     * @returns {PointStyle}
     */
    restingStyle(d) {
        return this.#style(this.isSelected(d.studentId), this.#selectedIds.peek().size > 0);
    }

    /**
     * Paint the given points in their resting look.
     * @param {PointSelection} points
     */
    paintResting(points) {
        this.#previewHighlight = new WeakMap();
        const selectedIds = this.#selectedIds.peek();
        points.classed('selected', (d) => selectedIds.has(d.studentId));
        // A point a click selects is a toggle button, its selection the pressed state.
        points.attr('aria-pressed', (d) =>
            this.#enabled ? String(selectedIds.has(d.studentId)) : null,
        );
        paint(points, (d) => this.restingStyle(d));
    }

    #repaint() {
        if (this.#g) {
            this.paintResting(/** @type {PointSelection} */ (this.#g.selectAll('.student-point')));
        }
    }

    /**
     * @param {boolean} highlighted - Whether the point wears the selected look.
     * @param {boolean} selecting - Whether some point does: the others then dim, in a chart that selects.
     * @returns {PointStyle}
     */
    #style(highlighted, selecting) {
        const cfg = CHART_CONFIG.SELECTION;
        if (highlighted) {
            return { stroke: cfg.COLOR, strokeWidth: `${cfg.STROKE_WIDTH_PX}px`, opacity: 1 };
        }
        const dimmed = this.#enabled && selecting;
        return {
            stroke: 'var(--color-card-background)',
            strokeWidth: `${MARK_DEFAULTS.outlineWidthPx}px`,
            opacity: dimmed ? cfg.UNSELECTED_OPACITY : CHART_CONFIG.POINTS.OPACITY,
        };
    }

    // ------------------------------------------------------------------
    // Rectangle (marquee) selection — wired per render against fresh svg/g/points
    // ------------------------------------------------------------------
    /**
     * Install the drag-to-select brush. Called each render with the current selections.
     * @param {d3.Selection<SVGSVGElement, unknown, any, any>} svg - The event surface.
     * @param {d3.Selection<SVGGElement, unknown, any, any>} g - The points' coordinate space and container.
     * @param {PointSelection} points
     */
    wireRectangleSelection(svg, g, points) {
        // A drag the last wiring began cannot end: its pointer lived in that wiring's
        // handlers. It is dropped as a cancelled gesture is, or the points would stay
        // off the pointer and the tooltip suspended.
        if (this.#isRectangleSelecting) this.#setRectangleInteraction(false);
        this.#svg = svg;
        this.#g = g;
        const cfg = CHART_CONFIG.SELECTION;
        let startX = 0;
        let startY = 0;
        /** Where the press landed on screen: the drag test measures travel there. */
        let startClient = [0, 0];
        /** @type {number|null} The pointer of the drag in progress; null while none is. */
        let activePointerId = null;

        // Inside the chart group, the points' coordinate space. Select-or-append:
        // a group that survives a render must not collect a second rectangle.
        const selectionRect = selectOrAppend(g, 'rect', 'selection-rectangle');
        selectionRect
            .style('fill', cfg.RECT_FILL)
            .style('stroke', cfg.COLOR)
            .attr('stroke-width', 1)
            .attr('stroke-dasharray', cfg.RECT_STROKE_DASHARRAY)
            .style('display', 'none');

        // The armed flag outlives the DOM it is expressed on.
        this.#applyTouchSelectionArmedClass();

        // Undo whatever #previewRectangleSelection painted during the drag. It
        // styles points without touching the selection, so any path that ends a
        // drag without committing one has to put the real appearances back.
        const restoreAppearances = () => this.paintResting(points);

        /**
         * @param {boolean} apply - Commit the marquee (pointerup) or abandon it (pointercancel).
         * @param {PointerEvent} event
         */
        const endDrag = (apply, event) => {
            if (activePointerId === null) return;
            activePointerId = null;
            this.#setRectangleInteraction(false);
            selectionRect.style('display', 'none');

            if (!apply) {
                restoreAppearances();
                return;
            }

            const rect = rectFrom([startX, startY], d3.pointer(event, g.node()));

            // Only apply past the drag threshold the point click uses too, so a press
            // is one or the other; below it the gesture was a click, so the preview has
            // to go back rather than leave points wearing the selected look.
            const travel = Math.hypot(
                event.clientX - startClient[0],
                event.clientY - startClient[1],
            );
            if (travel > MARK_DEFAULTS.dragThresholdPx) {
                this.#applyRectangleSelection(points, rect);
            } else {
                restoreAppearances();
            }
        };

        svg.on('pointerdown.selection', (/** @type {PointerEvent} */ event) => {
            // Only start on left button / primary contact. A drag may start on a point:
            // the pointer picks a point only on a click that did not move.
            if (event.button !== 0 || !event.isPrimary) return;
            // A finger's default gesture scrolls the page, so a touch drag is a
            // marquee only while armed. A mouse drag is never gated.
            if (event.pointerType === 'touch' && !this.#touchSelectionArmed.peek()) return;

            const [x, y] = d3.pointer(event, g.node());
            startX = x;
            startY = y;
            startClient = [event.clientX, event.clientY];
            activePointerId = event.pointerId;
            this.#previewHighlight = new WeakMap();
            this.#setRectangleInteraction(true);

            // Capture on the svg: move and up keep arriving once the pointer has left
            // the chart, so a drag that ends outside still applies.
            /** @type {SVGSVGElement} */ (svg.node()).setPointerCapture(event.pointerId);

            selectionRect
                .attr('x', startX)
                .attr('y', startY)
                .attr('width', 0)
                .attr('height', 0)
                .style('display', 'block');

            event.preventDefault();
        });

        svg.on('pointermove.selection', (/** @type {PointerEvent} */ event) => {
            if (event.pointerId !== activePointerId) return;

            const rect = rectFrom([startX, startY], d3.pointer(event, g.node()));
            selectionRect
                .attr('x', rect.x)
                .attr('y', rect.y)
                .attr('width', rect.width)
                .attr('height', rect.height);

            this.#previewRectangleSelection(points, rect);
        });

        svg.on('pointerup.selection', (/** @type {PointerEvent} */ event) => {
            if (event.pointerId !== activePointerId) return;
            endDrag(true, event);
        });

        // The browser took the gesture over (a pan it decided was a scroll, a
        // palm rejection); the drag is abandoned, not completed.
        svg.on('pointercancel.selection', (/** @type {PointerEvent} */ event) => {
            if (event.pointerId !== activePointerId) return;
            endDrag(false, event);
        });
    }

    /**
     * Mirror the armed flag onto the svg, where CSS turns it into
     * `touch-action: none` — only while armed, so the page scrolls the rest of the
     * time. Re-applied on every wiring because each render hands over a fresh svg.
     */
    #applyTouchSelectionArmedClass() {
        this.#svg?.classed('selection-armed', this.#touchSelectionArmed.peek());
    }

    /**
     * Mark the svg while a marquee drag is active; CSS switches pointer-events off on
     * the interactive marks under that class, so the drag reads the background rather
     * than individual points. The class comes off a frame after the drag ends.
     * @param {boolean} isActive
     */
    #setRectangleInteraction(isActive) {
        this.#isRectangleSelecting = isActive;
        if (!this.#svg) return;

        if (isActive) {
            this.#svg.classed('marquee-active', true);
            this.#hideTooltip();
            return;
        }

        const svg = this.#svg;
        this.#resources.trackAnimationFrame(() => {
            if (this.#isRectangleSelecting) return;
            svg.classed('marquee-active', false);
        });
    }

    /**
     * Preview the marquee selection while dragging (highlight points in the rect or
     * already selected; dim the rest).
     * @param {PointSelection} points
     * @param {MarqueeRect} rect
     */
    #previewRectangleSelection(points, rect) {
        const previous = this.#previewHighlight;
        const selectedIds = this.#selectedIds.peek();
        // A drag in progress is a selection: what the marquee leaves out dims.
        const style = (/** @type {boolean} */ highlighted) => this.#style(highlighted, true);
        points.each(function (d) {
            const highlighted = selectedIds.has(d.studentId) || isInRect(d, rect);
            if (previous.get(this) === highlighted) return;
            previous.set(this, highlighted);
            paint(d3.select(this), () => style(highlighted));
        });
    }

    /**
     * Commit the marquee selection: add every point inside the rectangle to the
     * selection (preserving prior selections). The write repaints, unless the marquee
     * caught nothing new: then the preview goes back here.
     * @param {PointSelection} points
     * @param {MarqueeRect} rect
     */
    #applyRectangleSelection(points, rect) {
        const current = this.#selectedIds.peek();
        const next = new Set(current);
        points.each((d) => {
            if (isInRect(d, rect)) next.add(d.studentId);
        });
        if (next.size === current.size) {
            this.paintResting(points);
            return;
        }
        this.#selectedIds.value = next;
    }
}

/**
 * The marquee in plot coordinates.
 * @typedef {{x: number, y: number, width: number, height: number}} MarqueeRect
 */

/**
 * The marquee spanned between the drag's start and the pointer, whichever way it runs.
 * @param {[number, number]} start
 * @param {[number, number]} current
 * @returns {MarqueeRect}
 */
function rectFrom([startX, startY], [currentX, currentY]) {
    return {
        x: Math.min(startX, currentX),
        y: Math.min(startY, currentY),
        width: Math.abs(currentX - startX),
        height: Math.abs(currentY - startY),
    };
}

/**
 * Whether a point lies inside the marquee. Reads the bound datum's jittered `x`/`y`,
 * the position the render and the zoom update write to `cx`/`cy`.
 * @param {{x: number, y: number}} d
 * @param {MarqueeRect} rect
 * @returns {boolean} True on the edge too.
 */
function isInRect(d, { x, y, width, height }) {
    return d.x >= x && d.x <= x + width && d.y >= y && d.y <= y + height;
}

/**
 * Apply a look to points.
 * @param {PointSelection} points
 * @param {(d: JitteredPoint) => PointStyle} styleOf
 */
function paint(points, styleOf) {
    points.each(function (d) {
        const { stroke, strokeWidth, opacity } = styleOf(d);
        // The ring rides as a custom property `scatterplot.css` reads, so the forced
        // colours rule replaces it through the normal cascade.
        d3.select(this)
            .style('--mark-outline', stroke)
            .style('stroke-width', strokeWidth)
            .style('opacity', opacity);
    });
}
