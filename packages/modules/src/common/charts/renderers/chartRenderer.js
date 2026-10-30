/**
 * Base class for the D3 chart renderers: the common lifecycle, responsive behaviour and
 * drawing utilities. Every instance must be wrapped in a ChartHostModule for its
 * resources to be managed. Subclasses implement `renderChart` and
 * `formatTooltipContent`.
 */

import {
    resizeService,
    ResourceTracker,
    onChange,
    owningModuleId,
    rootFontSizePx,
} from '@tba3/module-base';
import { cursorTooltip } from '../../services/cursorTooltip.js';
import { AXIS_DEFAULTS, DEFAULT_DIMENSIONS } from '../chartDefaults.js';
import { MOTION, animate } from '../motionPreference.js';
import { getResponsiveChartDimensions } from './internal/chartDimensions.js';
import { resolveChartTextSizePx } from '../chartTypography.js';
import { fontFamilyToken, fontWeightToken } from '../../utils/fontTokens.js';
import {
    HOVER_PRESETS,
    setRestingSize,
    wireNearestPointer,
    wireTooltipEvents as wireChartTooltipEvents,
} from './internal/chartInteractionUtils.js';
import { clearChartMessage, renderChartMessage } from '../chartMessage.js';
import { selectOrAppend } from '../selectOrAppend.js';
import { measureTexts } from './internal/chartTextMeasurement.js';
import { MarkKeyboard } from './internal/markKeyboard.js';
import { comparisonModeEntries, comparisonSeriesClass } from '../comparisonSeries.js';
import {
    installContainerLayout,
    placeKeyBeside,
    prepareContainerLayout,
} from '../legend/chartContainerLayout.js';
import { chartKeyTemplate, keyMarkSlotPx, nextLegendIdPrefix } from '../legend/htmlLegendPanel.js';
import { nothing, render } from 'lit';
import { signal } from '@preact/signals-core';
import {
    findOwningCard,
    findOwningModuleTitle,
    labelByTitle,
    syncScrollRegion,
} from '../../utils/scrollRegion.js';
import * as d3 from 'd3';
import './chartRenderer.css';

export { HOVER_PRESETS, setRestingSize };

/**
 * Options every chart renderer honours. A subclass documents its own keys and intersects
 * them with these, so a caller may still pass the shared ones.
 * @typedef {object} ChartRendererOptions
 * @property {import('../../context/moduleContext.js').ModuleContext} context - The app's context: the glossary its titles and messages read, the palette its bands paint from. It comes with `host.rendererOptions`.
 * @property {import('../comparisonState.js').ComparisonStateReader|null} [comparisonState] - The app's comparison state, which `activeModes` reads and a drawn chart follows.
 * @property {import('../chartAxisUtils.js').ChartLayout} [layout] - Per-side padding and the width / height range the plot is held in.
 * @property {boolean} [autoResize] - Redraw when the container resizes (default true).
 * @property {boolean} [focusableMarks] - Default true. False keeps the marks out of the tab
 *     order, for a chart inside a control that is itself the keyboard target.
 * @property {boolean} [tabStop] - Default true. False leaves the marks focusable and walked by
 *     the arrows, but none a tab stop: for a chart in a group whose owner is the one
 *     stop and moves focus into it.
 * @property {boolean} [thumbnail] - Default false. True draws the chart as a picture inside
 *     a control (a watermark): no hover, tooltip, click or focus, and the
 *     subclass leaves out axes, labels and legend.
 * @property {'side'|'top'|'auto'} [legend] - Give the chart an HTML legend panel: a
 *     side panel of pills, or its key (`chartKey`) over the plot or (`auto`) beside it
 *     while the plot beside it stays at least as wide as tall, else over it. The renderer splits its container into the plot area
 *     and the panel. None draws no HTML legend.
 */

/**
 * A renderer's measured container box. The chart area inside the box is the layout's
 * (`layout.chart`), never a copy here.
 * @typedef {object} ChartDimensions
 * @property {number} containerWidth - Container content width in px.
 * @property {number} containerHeight - Container content height in px.
 * @property {number} geometryScale - A fortieth of the shorter side, which container-scaled mark sizes derive from.
 * @property {number} keyHeight - The key panel's height, px; 0 without a key. Read with the box, after the key is painted, so a pass that lays something out against the key forces no layout of its own.
 */

/**
 * Space per side in px.
 * @typedef {{top: number, right: number, bottom: number, left: number}} LayoutSides
 */

/** @typedef {{x: number, y: number, width: number, height: number}} LayoutRect */

/**
 * The layout `initializeSVG()` stores on the renderer.
 * @typedef {object} ComputedChartLayout
 * @property {LayoutRect} chart - The plot rectangle.
 * @property {LayoutSides} axes - Axis space reserved per side.
 */
/** @typedef {import('./internal/chartInteractionUtils.js').ChartCallbackContext} ChartCallbackContext */
/** @typedef {import('./internal/chartInteractionUtils.js').HoverEffect} HoverEffect */

/** @typedef {import('../comparisonSeries.js').ComparisonGroupEntry} ComparisonGroupEntry */

/**
 * A signal's value, or the error computing it threw.
 * @param {import('@preact/signals-core').ReadonlySignal<unknown>} key
 * @returns {unknown}
 */
function settledValue(key) {
    try {
        return key.value;
    } catch (error) {
        return error;
    }
}

/**
 * Per-key visibility of a chart's comparison series, keyed by comparison mode id.
 * @typedef {{[key: string]: boolean}} VisibilityState
 */

/**
 * Visibility state from the app's comparison toggles, keyed by mode id. A group the
 * payload does not carry gets no key, and therefore no marker.
 * @param {ReadonlyArray<{id: string}>} groups - The toggleable groups (ids e.g. 'school', 'state').
 * @param {ReadonlyArray<string>|null} activeModes - The mode keys currently toggled on.
 *   `null` means the host has no comparison state and every mode the payload carries
 *   is visible.
 * @returns {VisibilityState}
 */
function comparisonVisibility(groups, activeModes) {
    /** @type {VisibilityState} */
    const state = {};
    for (const { id: modeId } of groups) {
        state[modeId] = activeModes === null ? true : activeModes.includes(modeId);
    }
    return state;
}

const DEFAULT_RENDER_DIMENSION_TOLERANCE_PX = 0.5;

/** The least padding a plot keeps on each side, whatever `options.layout` asks. */
const MIN_PLOT_PADDING_PX = 4;

/** `geometryScale` is the container's shorter side over this. */
const GEOMETRY_SCALE_DIVISOR = 40;

/** Class on a chart host while its content is wider than the card and scrolls. */
const CONTENT_SCROLL_CLASS = 'chart-content-scroll';

/**
 * Whether two measured lengths are the same to within a tolerance: sub-pixel layout
 * jitter must not trigger a redraw.
 * @param {number} a
 * @param {number} b
 * @param {number} tolerancePx
 * @returns {boolean}
 */
function dimensionsAreClose(a, b, tolerancePx) {
    return Math.abs(a - b) <= tolerancePx;
}

export class ChartRenderer {
    /** @type {HTMLElement} The element the chart was handed, which `create()` lays its plot area (and key panel) into. */
    #root;
    /** @type {import('../legend/chartContainerLayout.js').ContainerLayoutPlan} */
    #layoutPlan;
    #resources;
    #destroyed = false;
    /**
     * Whether the owner has called `create()`. Before it, a state change or `refresh()`
     * only updates state: the pending `create()` draws it.
     */
    #created = false;
    #rendering = false;
    /** Whether a `refresh()` arrived during a pass, so one more pass follows it. */
    #refreshQueued = false;
    /** Whether the next pass answers a `refresh()` (a state or data change), not a resize. */
    #refreshPending = false;
    /** The transition length of the pass running now; see `drawDurationMs`. */
    #drawDurationMs = 0;
    /** The marks' keyboard model: the chart's one tab stop and the arrow-key walk. */
    #keyboard = new MarkKeyboard(
        () => this.svg?.node() ?? null,
        () => this.options.tabStop !== false,
    );
    /** @type {number|null} The root font size the last measure read, which the chart text tokens resolve against. */
    #rootFontSizePx = null;
    /** @type {ChartDimensions|null} The container box the last measure read; null until one did. */
    #measured = null;
    /** @type {string|null} What the painted key's entries were; a change of them changes the plot's room. */
    #keySignature = null;
    /** @type {number|null} The painted `auto` key's width (`#placeAutoKey`), the same in either place; null until measured after a paint, Infinity for a key with no entry. */
    #keyWidthPx = null;
    /** @type {{dimensions: ChartDimensions, refresh: boolean, animate: boolean, valid: boolean, key?: import('../legend/htmlLegendPanel.js').ChartKey|null}|null} What `measureIfStale` found for `drawMeasured` to draw; `key` when the key is still to paint, `animate` for a `refresh()` drawn in place. */
    #pendingPass = null;
    /**
     * The comparison groups this chart toggles and how a toggle reaches it; `null` until
     * `setComparisonModes`. A signal, so the ⌀ menu that reads the groups follows them.
     * @type {import('@preact/signals-core').Signal<{groups: ReadonlyArray<ComparisonGroupEntry>, onToggle: 'fade'|'redraw'}|null>}
     */
    #comparison = signal(null);
    /** @type {{groups: ReadonlyArray<ComparisonGroupEntry>|null, activeModes: ReadonlyArray<string>|null, state: VisibilityState}|null} The last `visibilityState`, and the groups and toggles it was computed from. */
    #visibility = null;
    /** Whether wiring a mark renews its `aria-label`; false during a resize-only pass, whose data and state are unchanged. */
    #relabelMarks = true;
    /**
     * @param {HTMLElement} container - The element the chart draws into. Its id (for a card's body, which has none, the id of the module element around it) prefixes the ids the chart gives its own nodes (SVG root, tooltip, gradients), so there must be one.
     * @param {ChartRendererOptions & {[key: string]: any}} options
     */
    constructor(container, options) {
        const id = container instanceof HTMLElement ? owningModuleId(container) : '';
        if (!(container instanceof HTMLElement) || !id) {
            throw new Error(
                '[ChartRenderer] needs a container element with an id, or one inside a module',
            );
        }
        this.#root = container;
        // Only planned here: the renderer this one replaces still draws into the
        // container until its host destroys it, just before this one's `create()`.
        // A thumbnail draws no key, whatever its chart type asks for.
        this.#layoutPlan = prepareContainerLayout(
            id,
            options.thumbnail ? undefined : options.legend,
        );
        /** @type {HTMLElement} The plot area the chart draws into, laid out by `create()`; until then the element it was handed. */
        this.container = container;
        /** @type {string} The id the chart prefixes the ids of its nodes with. */
        this.containerId = this.#layoutPlan.plotAreaId;
        /** @type {HTMLElement|null} The panel the key (`chartKey`) draws into, when the chart has one (`legend`); laid out by `create()`. */
        this.legendPanel = null;

        /** @type {import('../../context/moduleContext.js').ModuleContext} The app's context (`options.context`), typed. */
        this.context = options.context;

        this.#resources = new ResourceTracker(this.containerId);

        /** @type {{[key: string]: any}} */
        this.options = {
            autoResize: true,
            focusableMarks: true,
            thumbnail: false,
            ...options,
        };

        /** @type {ChartDimensions|null} */
        this.dimensions = null;
        /** @type {ComputedChartLayout|null} Set by `initializeSVG()`. */
        this.layout = null;

        // What the chart shows, as signals. A subclass replaces it after `super()` with
        // its own `createState({...})`, typed; a key handed in as a signal (its host's
        // `mode`) is shared, not copied. Once created, the chart redraws on every change.
        /** @type {import('@tba3/module-base').State<{[key: string]: unknown}>} */
        this.state = {};

        /** @type {d3.Selection<SVGSVGElement, unknown, null, undefined> | null} The SVG root; set by `createSVGElement()`, null once cleared. */
        this.svg = null;
        /** @type {d3.Selection<SVGGElement, unknown, null, undefined> | null} The plot group; set by `initializeSVG()`, null once cleared. */
        this.g = null;

        /** @type {{isCurrentBuild?: (chart: ChartRenderer) => boolean} | null} The ChartHostModule showing this chart, set by it before create(); this chart draws no pass while the host rebuilds it (`isCurrentBuild`). */
        this.host = null;
    }

    /** Prefixes the ids of the key's headings in `legendPanel`. */
    #legendIdPrefix = nextLegendIdPrefix();

    /** @type {import('../legend/htmlLegendPanel.js').ChartKey|null} The key drawn last, redrawn when a comparison toggles. */
    #key = null;

    /** @type {import('@preact/signals-core').Signal<Map<string, boolean>>} Whether each toggle series of the key drawn last is on (`seriesId`); a viewer's choice is kept across redraws. A signal, so a data table read in an effect (`dataTable()`) follows a pill. */
    #seriesShown = signal(new Map());

    /**
     * The chart's key, drawn into its `legendPanel` over (or beside) the plot: each
     * entry its mark and label, or (a block with a `group`) a pill that shows or hides a
     * series (`isSeriesShown`). Read at the start of every pass, before the plot area is
     * measured, so the key's room comes out of it. None by default.
     * @returns {import('../legend/htmlLegendPanel.js').ChartKey|null}
     */
    chartKey() {
        return null;
    }

    /**
     * Whether a series is shown: neither the app's comparison toggles nor a pill of the
     * key switched it off. A key no toggle knows is shown.
     * @param {string} key - The series key: a comparison mode id, or a toggle entry's key.
     * @param {string} [group] - The toggle block the entry sits in; its keys are its own.
     * @returns {boolean}
     */
    isSeriesShown(key, group) {
        if (group !== undefined && this.#seriesShown.value.get(seriesId(group, key)) === false) {
            return false;
        }
        return this.visibilityState[key] !== false;
    }

    /**
     * Draw the key: a display entry whose series is off faded, a pill pressed while its
     * series is on. Take a key drawn before away when there is none now.
     * @param {import('../legend/htmlLegendPanel.js').ChartKey|null} key
     */
    #paintKey(key) {
        if (!key) {
            if (this.#key) this.#clearKeyPanel();
            this.#key = null;
            return;
        }
        this.#key = key;
        this.#seedSeries(key);
        if (!this.legendPanel) return;
        this.#keyWidthPx = null;
        const { glossary } = this.context;
        this.legendPanel.style.setProperty('--legend-mark-slot', `${keyMarkSlotPx(key)}px`);
        render(
            chartKeyTemplate(key, {
                idPrefix: this.#legendIdPrefix,
                hiddenNote: glossary.getRequiredEntryText('general.messages.series-hidden'),
                isShown: (group, series) =>
                    this.#seriesShown.peek().get(seriesId(group, series)) !== false,
                toggle: (group, keys) => this.#toggleSeries(keys.map((k) => seriesId(group, k))),
                entryShown: (series) => this.isSeriesShown(series),
                textSegments: (label) => glossary.getTextSegments(label),
            }),
            this.legendPanel,
        );
    }

    /** Empty the key's panel. */
    #clearKeyPanel() {
        if (this.legendPanel) render(nothing, this.legendPanel);
    }

    /**
     * Keep the viewer's toggles for the series the key still draws, drop the rest, and
     * start a series that just appeared off when its entry says so.
     * @param {import('../legend/htmlLegendPanel.js').ChartKey} key
     */
    #seedSeries(key) {
        const previous = this.#seriesShown.peek();
        /** @type {Map<string, boolean>} */
        const shown = new Map();
        for (const { group, items } of key) {
            if (!group) continue;
            for (const { key: entry, initiallyHidden } of items) {
                if (entry == null) continue;
                const series = seriesId(group, entry);
                shown.set(series, previous.get(series) ?? !initiallyHidden);
            }
        }
        // Written only when a pill changed, so what reads the pills follows real changes.
        const changed =
            shown.size !== previous.size ||
            [...shown].some(([series, on]) => previous.get(series) !== on);
        if (changed) this.#seriesShown.value = shown;
    }

    /**
     * A pill's click: switch the series off when any of them is on, else all on, and
     * redraw for the new set.
     * @param {string[]} ids - The series the pill (or its section's master) toggles (`seriesId`).
     */
    #toggleSeries(ids) {
        const shown = new Map(this.#seriesShown.peek());
        const anyShown = ids.some((series) => shown.get(series) !== false);
        for (const series of ids) shown.set(series, !anyShown);
        this.#seriesShown.value = shown;
        this.refresh();
    }

    /**
     * Whether there is data to draw; a pass shows `noDataMessage()` otherwise.
     * @returns {boolean}
     */
    validateData() {
        return true;
    }

    /**
     * The sentence shown when `validateData()` fails. Override to name the reason.
     * @protected
     * @returns {string}
     */
    noDataMessage() {
        return this.context.glossary.getRequiredEntryText('general.messages.no-data');
    }

    /** Draw the chart; subclasses implement it. */
    renderChart() {
        throw new Error('renderChart() must be implemented');
    }

    // ========================================================================
    // LIFECYCLE
    // ========================================================================

    /**
     * Create and render the chart. Lays out the container first (the plot area, the key
     * panel, the arrow-key wiring): the host calls it once the renderer it replaces is
     * gone, so that one's drawing stands until then. The plot area is emptied, so the
     * render that follows must repaint it: `refresh()`, not `measureIfStale()`, which
     * skips an unchanged size. Every later pass draws into the SVG this one made
     * (`createSVGElement`).
     */
    create() {
        if (!this.#root.isConnected) return;

        const { plotArea, legendPanel } = installContainerLayout(this.#root, this.#layoutPlan);
        this.container = plotArea;
        this.legendPanel = legendPanel;
        this.#keyboard.wire(d3.select(plotArea));

        this.clearContainer();
        this.#measured = null;
        this.#keySignature = null;

        const firstCreate = !this.#created;
        this.#created = true;

        // The pills start as the key says, before any draw: a chart created behind its
        // data table, or folded, draws only later, and its table lists what it will draw.
        if (this.legendPanel && this.validateData()) this.#seedSeries(this.chartKey() ?? []);

        this.refresh();
        if (firstCreate) this.#follow();

        // The observer's first callback reports the size just drawn, which
        // measureIfStale() skips. Measured with every chart resized in the same flush
        // before any draws; busy until the redraw a resize starts has run.
        if (this.options.autoResize && !this.#destroyed && this.container.isConnected) {
            this.#resources.trackSubscription(
                resizeService.observe(
                    this.container,
                    { measure: () => this.measureIfStale(), draw: () => this.drawMeasured() },
                    { busy: true },
                ),
            );
        }
    }

    /**
     * Redraw the chart in place for a change of state or data, not of size: the
     * pass animates what moves (`drawDurationMs`) and reuses the container box the last
     * measure read, measuring again only when the key's entries changed (they take their
     * room out of the plot). Called during a render pass (a `renderChart()` that sets
     * state), it runs one more pass once that one returns. A hidden chart only goes
     * stale: the draw on show (`measureIfStale`, `drawMeasured`) catches up.
     */
    refresh() {
        this.#refreshPending = true;

        if (this.#rendering) {
            this.#refreshQueued = true;
            return;
        }

        if (this.#prepare(false)) this.drawMeasured();
    }

    /**
     * @returns {boolean} True once `destroy()` has run; further work should be skipped.
     */
    get destroyed() {
        return this.#destroyed;
    }

    /**
     * How long the pass running now animates what it moves (`animate()` resolves
     * reduced motion): `MOTION.BASE_MS` when it answers a `refresh()` (a toggle, a
     * selection, new data) on screen, and 0 for a resize, which follows the container at
     * once. A first draw has nothing to move; its marks enter without a transition. A
     * `refresh()` that went stale while hidden draws on show without one too: nobody
     * watched the state it would move from, and a capture clones the chart as soon as
     * it is shown.
     * @protected
     * @returns {number}
     */
    get drawDurationMs() {
        return this.#drawDurationMs;
    }

    /**
     * Where the keyboard enters the chart from its owner, when the owner holds the tab
     * stop (`tabStop: false`): its first shown mark.
     * @returns {Element|null} Null while no mark is shown or focusable.
     */
    firstShownMark() {
        return this.#keyboard.firstShownMark();
    }

    /**
     * Release the chart's resize observation, arrow keys, tooltip and key, and remove what
     * it drew (`removeDrawing()`), and nothing else in its container. A chart never
     * created laid nothing out and drew nothing: its container is still its predecessor's.
     */
    destroy() {
        if (this.#destroyed) return;
        this.#destroyed = true;

        this.#resources.destroy();
        if (!this.#created) return;
        this.#keyboard.unwire(d3.select(this.container));
        cursorTooltip.hide(this.container);
        this.#clearKeyPanel();
        this.removeDrawing();
    }

    /**
     * Remove what the chart drew (its SVG root, its message and the scroll region a
     * wide drawing made of the container) and nothing else: the layout stays for the
     * `create()` of the renderer that replaces this one, which lays out its own. A
     * subclass that draws HTML of its own beside the SVG removes it too.
     * @protected
     */
    removeDrawing() {
        const svg = this.svg?.node();
        if (svg) {
            d3.select(svg).interrupt().selectAll('*').interrupt();
            svg.remove();
        }
        clearChartMessage(this.container);
        this.#setContentScroll(false);
        this.svg = null;
        this.g = null;
    }

    /**
     * From the first `create()` on, follow the chart's state signals and, once it declared
     * its comparison groups, the app's comparison toggles. A change of state redraws
     * (`refresh()`); a change of the shown comparison groups fades them in place, or
     * redraws a chart that declared it redraws or cannot fade. The effects skip their
     * first run (`create()` has just drawn) and end with `destroy()`.
     */
    #follow() {
        if (this.#destroyed) return;

        this.#resources.trackSubscription(
            onChange(
                // A derived key that fails to compute is a change too: the pass reads it
                // again and reports the failure, as it reports one of its own.
                () => Object.values(this.state).map((key) => settledValue(key)),
                () => this.refresh(),
            ),
        );

        // The port's signal changes only with the shown ids, so every change is one.
        this.#resources.trackSubscription(
            onChange(
                () => (this.#comparison.value ? this.activeModes : null),
                () => {
                    const comparison = this.#comparison.peek();
                    if (!comparison) return;
                    // A hidden chart only goes stale (`refresh()` stops at the visibility
                    // test); the redraw on show reads the toggles then.
                    if (
                        comparison.onToggle === 'redraw' ||
                        this.#hidden ||
                        !this.#applyActiveModes()
                    ) {
                        this.refresh();
                    }
                },
            ),
        );
    }

    /**
     * Whether the container sits in a `display: none` subtree (e.g. its view switched
     * away). A style read, not a layout one: a state change of a hidden chart forces no
     * layout.
     * @returns {boolean} True when a pass would draw into nothing.
     */
    get #hidden() {
        return !this.container.checkVisibility();
    }

    /**
     * The comparison groups the app shows, or `null` for a chart built without a
     * comparison state, which draws every group its payload carries. A tracked read: in
     * an effect it follows the toggles.
     * @returns {ReadonlyArray<string>|null} In order.
     */
    get activeModes() {
        return this.options.comparisonState?.activeModes.value ?? null;
    }

    /**
     * Fade the comparison series, and their legend entries, to the visibility the
     * current `activeModes` give. A legend entry follows the visibility key its `key` names.
     * @returns {boolean} False for a chart without comparison visibility.
     */
    #applyActiveModes() {
        const svg = this.svg;
        const groups = this.#comparison.peek()?.groups;
        if (!groups || !svg) return false;
        const visibility = this.visibilityState;

        groups.forEach(({ id }, index) => {
            this.setElementVisibility(
                svg.selectAll(`.${comparisonSeriesClass(index)}`),
                visibility[id],
                { durationMs: MOTION.BASE_MS },
            );
        });

        if (this.#key) this.#paintKey(this.#key);
        return true;
    }

    /**
     * Show or hide chart elements. Always use this method (or the isVisible option in
     * wireTooltipEvents) to toggle visibility: a hidden element leaves hover, the
     * keyboard and the accessibility tree at once, and the chart's tab stop moves off it
     * before the fade ends. The move runs once at the end of the task, so a caller may
     * toggle bar by bar in a loop.
     * @template {d3.BaseType} E
     * @template D
     * @param {d3.Selection<E, D, any, any>} selection
     * @param {boolean|((this: E, d: D) => boolean)} visible - Whether the elements
     *   should be visible, or a per-element test (d3's value-or-function convention), so
     *   one call shows some and hides the rest.
     * @param {object} [options]
     * @param {number} [options.durationMs=0] - Fade length.
     * @param {boolean} [options.collapse=false] - Take a hidden element out of the layout (`display: none` once faded), for a group the chart re-lays out without.
     * @returns {d3.Selection<E, D, any, any>} The fade, a transition or (instant) the selection, for chaining what moves with it; typed as the selection, as `animate` returns it.
     * @example
     * // Hide markers with transition
     * this.setElementVisibility(this.svg.selectAll('.marker'), false, { durationMs: MOTION.BASE_MS });
     */
    setElementVisibility(selection, visible, { durationMs = 0, collapse = false } = {}) {
        // `isMarkShown` reads both attributes. A shown element clears its own
        // `pointer-events`, so a hidden ancestor still governs it.
        /** @type {(this: E, d: D) => boolean} */
        const isShown = typeof visible === 'function' ? visible : () => visible;
        selection
            .attr('aria-hidden', function (d) {
                return isShown.call(this, d) ? null : 'true';
            })
            .style('pointer-events', function (d) {
                return isShown.call(this, d) ? null : 'none';
            });
        if (collapse) selection.filter(isShown).style('display', null);

        const motion = animate(selection, { durationMs }).style('opacity', function (d) {
            return isShown.call(this, d) ? 1 : 0;
        });
        if (collapse) {
            // Reads the element's current state, not this call's: a show issued while this
            // fade runs clears `display` at once but starts its own transition a frame
            // later, and this fade can still end in that frame.
            /** @this {E} */
            const leaveLayout = function () {
                const element = /** @type {Element} */ (/** @type {unknown} */ (this));
                if (element.getAttribute('aria-hidden') === 'true') {
                    d3.select(element).style('display', 'none');
                }
            };
            if (motion === selection) selection.each(leaveLayout);
            else motion.on('end', leaveLayout);
        }

        this.#keyboard.queueSync();
        return motion;
    }

    // ========================================================================
    // COMPARISON VISIBILITY
    // ========================================================================

    /**
     * Declare the comparison groups this chart can toggle: from then on it follows the ⌀
     * toggles of its `comparisonState`. A chart with comparison markers calls it once it
     * knows them, usually in its constructor; a chart that declares none ignores the
     * toggles.
     * @param {ReadonlyArray<ComparisonGroupEntry>} groups - In draw order.
     * @param {{onToggle?: 'fade'|'redraw'}} [options] - `fade` fades each group's marks (`comparisonSeriesClass`) in place; `redraw` refreshes the chart, for one that lays out anew without a group.
     * @protected
     */
    setComparisonModes(groups, { onToggle = 'fade' } = {}) {
        this.#comparison.value = { groups, onToggle };
    }

    /**
     * The ⌀ menu entries for the declared comparison groups, named as the payload names
     * them; what a host whose config names no `comparisonModes` offers.
     * @returns {Array<{id: string, label: string}>} None for a chart that declared none.
     */
    get comparisonModeEntries() {
        return comparisonModeEntries(this.#comparison.value?.groups ?? []);
    }

    /**
     * Whether each declared comparison group is shown, from the current `activeModes`.
     * @returns {VisibilityState} Empty for a chart that declared none.
     */
    get visibilityState() {
        const groups = this.#comparison.peek()?.groups ?? null;
        // The comparison state replaces its array on every toggle, so identity is the key.
        const activeModes = this.activeModes;
        const cached = this.#visibility;
        if (cached?.groups === groups && cached.activeModes === activeModes) return cached.state;
        const state = groups ? comparisonVisibility(groups, activeModes) : {};
        this.#visibility = { groups, activeModes, state };
        return state;
    }

    // ========================================================================
    // SVG MANAGEMENT
    // ========================================================================

    /**
     * Empty the container and drop the `svg`/`g` handles. A redraw never clears; it draws
     * into the SVG it has, and `destroy()` removes only its drawing (`removeDrawing()`).
     *
     * The `svg`/`g` handles go with the nodes they pointed at: subclasses guard their
     * incremental-update paths on those two, and a handle left bound to a detached node
     * would pass that guard and join outside the document.
     */
    clearContainer() {
        // While its mark is still in the container: a removed mark fires no `mouseleave`
        // or `blur` to hide the tooltip it showed, and `hide` no longer finds it here.
        cursorTooltip.hide(this.container);
        // Interrupted first: a removed node's transition would leave its timer running.
        d3.select(this.container).selectAll('*').interrupt().remove();

        this.svg = null;
        this.g = null;
    }

    /**
     * Resolve a chart text size token from CSS in px.
     * @param {'sm'|'base'} [size='base']
     * @returns {number}
     */
    resolveChartTextSize(size = 'base') {
        this.#rootFontSizePx ??= rootFontSizePx();
        return resolveChartTextSizePx(size, this.#rootFontSizePx);
    }

    /**
     * The chart's SVG root, with the standard font and colour: the one this renderer drew
     * last pass, resized in place, or a new one. Reusing it lets a redraw join into the
     * marks already on screen, so keyboard focus and running transitions survive. Only a
     * root this renderer made and still holds is reused; any other content (a message
     * state, nothing yet) is cleared first. Called directly by a chart that positions
     * its own groups (centred rings, non-standard margins).
     *
     * A new SVG is named after its card: `aria-labelledby` the card's title, and
     * `aria-describedby` the card's subtitle. It is a `role="img"` until a mark becomes focusable, then a `group`
     * (`MarkKeyboard`). No SVG `<title>`: browsers show it as a native tooltip
     * over the whole chart.
     * @param {number} width
     * @param {number} height
     * @param {object} [options]
     * @param {HTMLElement} [options.parent] - An element inside the container to append to; the
     *     caller has cleared the container. Omitted, the SVG goes into the container.
     * @returns {d3.Selection<SVGSVGElement, unknown, null, undefined>}
     */
    createSVGElement(width, height, options = {}) {
        const parent = options.parent ?? this.container;
        let svg = this.svg;
        if (!svg || svg.node()?.parentNode !== parent) {
            if (!options.parent) this.clearContainer();
            svg = this.#appendSVG(parent);
        }

        svg.attr('width', width).attr('height', height);
        this.svg = svg;
        return svg;
    }

    /**
     * Append a new SVG root, named. Done once per root:
     * naming it again would put `role="img"` back over the `group` a focusable mark set.
     * @param {HTMLElement} parent
     * @returns {d3.Selection<SVGSVGElement, unknown, null, undefined>}
     */
    #appendSVG(parent) {
        const svg = d3
            .select(parent)
            .append('svg')
            .attr('id', `${this.containerId}-svg-root`)
            .classed('chart-root', true)
            .style('font-family', fontFamilyToken())
            .style('color', 'var(--text-color)')
            // `fill` inherits, so any text or mark without its own fill takes the theme
            // ink instead of the SVG default black, which vanishes on the dark surface.
            .style('fill', 'currentColor');
        this.#nameSVG(/** @type {SVGSVGElement} */ (svg.node()));
        return svg;
    }

    /**
     * A name of the chart's own, over its card's title: for one of several charts in a card.
     * @protected
     * @returns {string|null} `null` names the chart after its card.
     */
    accessibleName() {
        return null;
    }

    /**
     * What the chart draws, as a table: what a host whose config sets no `dataTable` shows
     * in place of the plot and exports as data. Read in an effect, so a chart's table
     * follows the signals it reads. Exactly what the chart draws now: a comparison
     * toggled off leaves it, and a value the source does not deliver is an empty cell.
     * @returns {import('../host/chartDataTable.js').ChartDataTables} One table per kind of figure drawn; `null` while nothing is drawn, or for a chart that offers none.
     */
    dataTable() {
        return null;
    }

    /**
     * Name and describe the SVG after its card. The card's title and subtitle are in the
     * DOM by now: a ContentModule builds its shell at mount, before any chart renders.
     * @param {SVGSVGElement} svg
     */
    #nameSVG(svg) {
        const ownName = this.accessibleName();
        const card = findOwningCard(this.container);
        const title = ownName ? null : (card?.titleElement ?? null);
        labelByTitle(svg, title);
        if (ownName) svg.setAttribute('aria-label', ownName);
        // An unnamed `img` fails axe `svg-img-alt`; without a name the SVG stays a plain one.
        if (title || ownName) svg.setAttribute('role', 'img');

        const subtitle = card?.subtitleElement;
        if (subtitle && !subtitle.matches(':empty')) {
            if (!subtitle.id) subtitle.id = `${svg.id}-description`;
            svg.setAttribute('aria-describedby', subtitle.id);
        }
    }

    /**
     * Initialize a standard single SVG with margins, or bring the one drawn last pass up
     * to date: the SVG root and its plot group (`g.chart-plot`) are reused, resized and
     * moved in place (see `createSVGElement`). The plot group sits at the chart area
     * origin `previewLayout()` gives, which is stored as `layout`.
     * @param {Partial<LayoutSides>} [axisOverrides] - Per-side axis space (px); a side without one takes none.
     * @returns {{svg: d3.Selection<SVGSVGElement, unknown, null, undefined>, g: d3.Selection<SVGGElement, unknown, null, undefined>, dimensions: ChartDimensions, layout: ComputedChartLayout}}
     */
    initializeSVG(axisOverrides = {}) {
        const dimensions = this.measuredDimensions();
        const svg = this.createSVGElement(dimensions.containerWidth, dimensions.containerHeight);
        const layout = this.previewLayout(axisOverrides);
        this.layout = layout;
        const g = selectOrAppend(svg, 'g', 'chart-plot').attr(
            'transform',
            `translate(${layout.chart.x}, ${layout.chart.y})`,
        );
        this.g = g;
        return { svg, g, dimensions, layout };
    }

    /**
     * The dimensions this render pass measured, measuring now when called outside one.
     * @returns {ChartDimensions}
     */
    measuredDimensions() {
        this.dimensions ??= this.calculateDimensions();
        return this.dimensions;
    }

    // ========================================================================
    // DIMENSION CALCULATIONS
    // ========================================================================

    /**
     * Let the chart grow past its container when its content needs more width than the
     * card gives it. Widens this pass's `dimensions` (a copy, so the measured box is not
     * touched), gives the host a horizontal scrollbar with a trailing-edge cue, and puts
     * it in the tab order as a named region, since a region that scrolls has to be
     * keyboard-reachable. When the content fits again all of that is undone. A renderer
     * calls this during its pass, once it has measured what it needs; the resize observer
     * watches the host, whose width the overflow does not change, so the wider SVG starts
     * no re-render loop.
     * @param {number} requiredWidthPx - Width the content needs.
     */
    fitContentWidth(requiredWidthPx) {
        const dims = { ...this.measuredDimensions() };
        const scrolls = requiredWidthPx > dims.containerWidth;
        this.#setContentScroll(scrolls);
        if (scrolls) dims.containerWidth = requiredWidthPx;
        this.dimensions = dims;
    }

    /**
     * Make the container the scroll region `fitContentWidth` needs, or undo that: for
     * content that fits again, and for a drawing that goes (a message in its place,
     * `removeDrawing`), which no pass calls that method for again, while an empty region
     * would stay a Tab stop that scrolls nothing.
     * @param {boolean} scrolls
     */
    #setContentScroll(scrolls) {
        const host = this.container;
        if (!scrolls && !host.classList.contains(CONTENT_SCROLL_CLASS)) return;
        host.classList.toggle(CONTENT_SCROLL_CLASS, scrolls);
        syncScrollRegion(host, scrolls, scrolls ? findOwningModuleTitle(host) : null);
    }

    /**
     * Measure the container.
     * @returns {ChartDimensions}
     */
    calculateDimensions() {
        const { width: containerWidth, height: containerHeight } = getResponsiveChartDimensions(
            this.container,
            DEFAULT_DIMENSIONS.widthPx,
            DEFAULT_DIMENSIONS.heightPx,
        );
        return {
            containerWidth,
            containerHeight,
            geometryScale: Math.min(containerWidth, containerHeight) / GEOMETRY_SCALE_DIVISOR,
            keyHeight: this.legendPanel?.getBoundingClientRect().height ?? 0,
        };
    }

    /**
     * Measure rendered text dimensions: through the page's one offscreen SVG, each
     * string once per font for the page (`internal/chartTextMeasurement.js`).
     * @param {string[]} texts
     * @param {object} [options] - Font and offset overrides used for the measurement only.
     * @param {number} [options.fontSizePx] - Explicit size for measurement, bypassing the token scale
     * @param {'sm'|'base'} [options.textSize] - Token-sized text override
     * @param {number} [options.rotationDeg=0]
     * @param {string|number|null} [options.fontWeight]
     * @returns {{ maxWidth: number, maxHeight: number, totalWidth: number, totalHeight: number, sizes: Array<{width: number, height: number}> }} `sizes` in input order.
     */
    measureTexts(texts, options = {}) {
        if (!texts || texts.length === 0)
            return { maxWidth: 0, maxHeight: 0, totalWidth: 0, totalHeight: 0, sizes: [] };

        const sizes = measureTexts(texts, {
            fontSizePx: options.fontSizePx ?? this.resolveChartTextSize(options.textSize),
            fontFamily: fontFamilyToken(),
            fontWeight: options.fontWeight ?? null,
            rotationDeg: options.rotationDeg ?? 0,
        });
        return {
            maxWidth: /** @type {number} */ (d3.max(sizes, (size) => size.width)),
            maxHeight: /** @type {number} */ (d3.max(sizes, (size) => size.height)),
            totalWidth: d3.sum(sizes, (size) => size.width),
            totalHeight: d3.sum(sizes, (size) => size.height),
            sizes,
        };
    }

    /**
     * The space an axis needs: its widest (or tallest) tick label, the tick padding and
     * its title.
     * @param {import('../chartAxisUtils.js').AxisSide} side
     * @param {string[]|number[]} tickValues
     * @param {import('../chartAxisUtils.js').AxisMeasureOptions} [options] - Formatting, rotation and title metrics that affect the space needed; tick-selection keys are ignored here.
     * @returns {number} In px.
     */
    measureAxisSpace(side, tickValues, options = {}) {
        const formatter = options.formatter || String;

        const texts = tickValues.map((v) => String(formatter(v)));
        const measured = this.measureTexts(texts, {
            textSize: options.textSize,
            rotationDeg: options.rotationDeg,
        });

        let titleSpace = 0;
        if (options.axisTitleText) {
            // The title's line height is its cost on every side: a left/right title is
            // rotated 90°, so its height becomes horizontal space. Measured at the weight
            // `renderAxisTitle` draws it with.
            const titleMeasured = this.measureTexts([options.axisTitleText], {
                fontWeight: fontWeightToken('semibold'),
            });
            titleSpace = AXIS_DEFAULTS.titleGapPx + titleMeasured.maxHeight;
        }

        const labelExtent =
            side === 'left' || side === 'right' ? measured.maxWidth : measured.maxHeight;
        return labelExtent + AXIS_DEFAULTS.tickPaddingPx + titleSpace;
    }

    /**
     * Render an axis title, placed in the axis space `initializeSVG()` laid out.
     * @template {d3.BaseType} P
     * @template D
     * @param {d3.Selection<P, D, any, any>} target - Usually the plot group `g`.
     * @param {'left'|'right'|'bottom'} side
     * @param {string} text
     * @param {object} [options]
     * @param {string} [options.accent] - Series colour, for one scale of a dual-scale chart; otherwise the title is primary ink (chartRenderer.css)
     * @param {[number, number]} [options.span] - The stretch of the axis, in plot coordinates, the title centres on; defaults to the whole axis (for a stacked axis carrying two scales)
     * @param {string} [options.glossaryKey]
     * @param {string} [options.key] - Which title of `target` this is, across draws; defaults to `side`. A chart whose title changes side (an orientation toggle) passes a fixed key, so the one title moves.
     * @returns {d3.Selection<SVGTextElement, D, P, any>} The title, classed `axis-label`: the one drawn under `key` last pass, updated in place, or a new one
     */
    renderAxisTitle(target, side, text, options = {}) {
        const key = options.key ?? side;
        /** @type {d3.Selection<SVGTextElement, D, P, any>} */
        const titles = target.selectChildren('text.axis-label');
        let titleEl = titles.filter(function () {
            return /** @type {SVGTextElement} */ (this).dataset.axisTitle === key;
        });
        if (titleEl.empty()) {
            titleEl = target
                .append('text')
                .attr('class', 'axis-label')
                .attr('data-axis-title', key)
                .attr('text-anchor', 'middle')
                .style('font-weight', fontWeightToken('semibold'));
        }
        const layout = this.layout;
        if (!layout) return titleEl;
        const fontSize = this.resolveChartTextSize();
        const chartW = layout.chart.width;
        const chartH = layout.chart.height;
        const vertical = side === 'left' || side === 'right';
        const [spanStart, spanEnd] = options.span ?? [0, vertical ? chartH : chartW];
        const center = (spanStart + spanEnd) / 2;

        // Every attribute a side or an option sets is written on every draw, so a title
        // that moved side or lost an option carries nothing over from its last draw.
        titleEl.text(text);
        if (options.accent) titleEl.style('fill', options.accent);
        else titleEl.style('fill', null);
        this.context.glossary.stampGlossaryAttr(titleEl, options.glossaryKey ?? null);

        const [rotate, x, y] = {
            left: ['rotate(-90)', -center, -(layout.axes.left - fontSize)],
            right: ['rotate(90)', center, -(chartW + layout.axes.right - fontSize)],
            bottom: [null, center, chartH + layout.axes.bottom - fontSize / 2],
        }[side];
        titleEl.attr('transform', rotate).attr('x', x).attr('y', y);

        return titleEl;
    }

    // ========================================================================
    // LAYOUT SYSTEM
    // ========================================================================

    /**
     * The layout these axis bands would give, without storing it: the plot rectangle left
     * of the container once the padding (`options.layout`, at least `MIN_PLOT_PADDING_PX`
     * a side) and the axis space are taken, held in `options.layout.aspectRange` when set
     * and centred in what remains. What a rule that weighs two layouts (a band chart's
     * lie/stand) asks before the pass draws one.
     * @param {Partial<LayoutSides>} [axisOverrides] - Per-side axis space (px); a side without one takes none.
     * @param {ChartDimensions} [dims] - The box to lay out in: by default this pass's, else one measured now (read, not stored: a getter asking outside a pass leaves the renderer as it found it). A measure laying out its own box passes it.
     * @returns {ComputedChartLayout}
     */
    previewLayout(axisOverrides = {}, dims = this.dimensions ?? this.calculateDimensions()) {
        /** @type {import('../chartAxisUtils.js').ChartLayout} */
        const { padding = {}, aspectRange } = this.options.layout ?? {};
        /**
         * @param {keyof LayoutSides} side
         * @returns {number}
         */
        const pad = (side) => Math.max(MIN_PLOT_PADDING_PX, padding[side] ?? 0);
        const axes = {
            top: axisOverrides.top ?? 0,
            right: axisOverrides.right ?? 0,
            bottom: axisOverrides.bottom ?? 0,
            left: axisOverrides.left ?? 0,
        };
        let x = pad('left') + axes.left;
        let y = pad('top') + axes.top;
        let width = Math.max(0, dims.containerWidth - x - pad('right') - axes.right);
        let height = Math.max(0, dims.containerHeight - y - pad('bottom') - axes.bottom);
        if (aspectRange && width > 0 && height > 0) {
            if (width / height > aspectRange.max) {
                x += (width - height * aspectRange.max) / 2;
                width = height * aspectRange.max;
            } else if (width / height < aspectRange.min) {
                y += (height - width / aspectRange.min) / 2;
                height = width / aspectRange.min;
            }
        }
        return { chart: { x, y, width, height }, axes };
    }

    // ========================================================================
    // CHART TOOLTIPS
    // ========================================================================

    /** Hide the chart's tooltip, for an interaction that takes the pointer (a marquee drag). */
    hideTooltip() {
        cursorTooltip.hide(this.container);
    }

    /**
     * The tooltip content of a data element; subclasses implement it.
     * @abstract
     * @param {unknown} segment - The data segment being hovered; each chart declares its own shape
     * @returns {import('../../services/cursorTooltip.js').TooltipContent}
     * @example
     * // In a subclass:
     * formatTooltipContent(segment) {
     *     return {
     *         title: segment.label,
     *         rows: [
     *             { label: TERM_CONSTANTS.SHARE, value: formatPercent(segment.percentage) },
     *             segment.count > 0 && { label: TERM_CONSTANTS.STUDENT_COUNT, value: formatCount(segment.count) },
     *         ],
     *     };
     * }
     */
    // eslint-disable-next-line no-unused-vars
    formatTooltipContent(segment) {
        throw new Error(
            `[ChartRenderer] Subclass must implement formatTooltipContent(). Chart: ${this.containerId}`,
        );
    }

    /**
     * Wire tooltip, hover effect, click and keyboard focus to a D3 selection: the marks
     * become focusable and the chart keeps its one tab stop among them.
     * `options.isVisible` guards hover for elements that can be hidden (average markers
     * with visibility toggles): when it returns false, mouseenter skips the tooltip and
     * the effect.
     * @template TDatum
     * @param {import('d3').Selection<any, TDatum, any, any>} selection
     * @param {import('./internal/chartInteractionUtils.js').TooltipWiringOptions<TDatum>} options
     * @returns {import('d3').Selection<any, TDatum, any, any>} The same selection, for chaining.
     * @example
     * // A bar dims while hovered
     * this.wireTooltipEvents(bars, {
     *     getTooltipContent: (d) => this.formatTooltipContent(d),
     *     hoverEffect: 'area',
     * });
     * @example
     * // A toggleable marker grows while hovered, and only while shown
     * this.wireTooltipEvents(markers, {
     *     getTooltipContent: (d) => this.formatTooltipContent(d),
     *     isVisible: (d) => this.isSeriesShown(d.modeId),
     *     hoverEffect: 'point',
     *     onClick: (d) => this.handleClick(d),
     * });
     */
    wireTooltipEvents(selection, options) {
        if (!this.options.thumbnail) this.#wireMarks(selection, options);
        return selection;
    }

    /**
     * Wire the marks' tooltip, hover, click and keyboard, and keep the chart's tab stop.
     * @template TDatum
     * @param {import('d3').Selection<any, TDatum, any, any>} selection
     * @param {import('./internal/chartInteractionUtils.js').TooltipWiringOptions<TDatum>} options
     * @returns {import('./internal/chartInteractionUtils.js').MarkHandlers<TDatum>}
     */
    #wireMarks(selection, options) {
        const handlers = wireChartTooltipEvents(
            selection,
            options,
            this.options.focusableMarks,
            this.#relabelMarks,
        );
        this.#keyboard.queueSync();
        return handlers;
    }

    /**
     * One transparent hit band per datum, joined as the children of `g`, a layer the
     * caller made over every mark of the chart: the datum's one hover target and tab
     * stop, whatever its marks' size (a lollipop's stem and head, a near-zero column, a
     * year's dots). The band tints with the `band` look; the `linked` marks it stands for
     * take their own hover look with it.
     *
     * Along the datum axis a band is centred on its datum and reaches halfway to its
     * nearer neighbour on both sides (an edge datum mirrors its one inner gap, a lone
     * datum fills the plot), so the tint sits symmetric around the mark at the plot's
     * edges and beside a group gap alike. The bands keep the data's order, which the
     * arrow keys walk.
     * @template TDatum
     * @template {import('d3').BaseType} P
     * @template PD
     * @param {import('d3').Selection<P, PD, any, any>} g - The layer the bands are joined in, over the marks.
     * @param {TDatum[]} data - One band per datum.
     * @param {object} options
     * @param {(d: TDatum) => string} options.key
     * @param {(d: TDatum) => number} options.position - The datum's centre on the datum axis.
     * @param {[number, number]} options.bounds - The plot's extent on the datum axis.
     * @param {[number, number]} options.across - The band's extent on the value axis.
     * @param {boolean} [options.horizontal] - Data stacked down the y axis (rows) rather than along x.
     * @param {string} options.className - The bands' class, which the join selects them by.
     * @param {(d: TDatum) => import('../../services/cursorTooltip.js').TooltipContent} options.getTooltipContent
     * @param {import('./internal/chartInteractionUtils.js').LinkedMarks<TDatum>[]} [options.linked] - The datum's marks, restyled beside the band's tint.
     * @returns {import('d3').Selection<SVGRectElement, TDatum, P, PD>}
     */
    joinHitBands(
        g,
        data,
        {
            key,
            position,
            bounds,
            across,
            horizontal = false,
            className,
            getTooltipContent,
            linked = [],
        },
    ) {
        const centres = data.map((d) => ({ id: key(d), at: position(d) }));
        centres.sort((a, b) => a.at - b.at);
        /** @type {Map<string, [number, number]>} */
        const span = new Map();
        centres.forEach(({ id, at }, i) => {
            const prev = centres[i - 1]?.at;
            const next = centres[i + 1]?.at;
            const half = Math.min(
                prev === undefined ? Infinity : (at - prev) / 2,
                next === undefined ? Infinity : (next - at) / 2,
            );
            span.set(
                id,
                Number.isFinite(half)
                    ? [Math.max(bounds[0], at - half), Math.min(bounds[1], at + half)]
                    : bounds,
            );
        });
        const spanOf = (/** @type {TDatum} */ d) =>
            /** @type {[number, number]} */ (span.get(key(d)));
        const lo = (/** @type {TDatum} */ d) => spanOf(d)[0];
        const hi = (/** @type {TDatum} */ d) => spanOf(d)[1];
        const [a0, a1] = across;

        // Every child the class matches is a band this join made, bound to a datum.
        /** @type {import('d3').Selection<SVGRectElement, TDatum, P, PD>} */
        const existing = g.selectChildren(`rect.${className}`);
        const hits = existing
            .data(data, key)
            .join((enter) => enter.append('rect'))
            .attr('class', `chart-hit ${className}`)
            .attr(horizontal ? 'y' : 'x', lo)
            .attr(horizontal ? 'height' : 'width', (d) => hi(d) - lo(d))
            .attr(horizontal ? 'x' : 'y', a0)
            .attr(horizontal ? 'width' : 'height', a1 - a0)
            .order();

        this.wireTooltipEvents(hits, { getTooltipContent, hoverEffect: 'band', linked });
        return hits;
    }

    /**
     * Points packed closer than the minimum target size: they take the keyboard like any
     * wired mark, and the pointer through `wireNearestPointer`. The points themselves
     * take no pointer (`pointer-events: none` in the chart's sheet). One such layer per
     * chart: it listens on the chart root.
     * @template TDatum
     * @template {SVGElement} E
     * @param {import('d3').Selection<E, TDatum, any, any>} points
     * @param {import('./internal/chartInteractionUtils.js').TooltipWiringOptions<TDatum> & {
     *     position: (d: TDatum) => [number, number],
     *     suspended?: () => boolean,
     * }} options - The wiring, plus each point's centre in its parent's coordinates and a pause while the pointer belongs to something else (a marquee drag).
     * @returns {import('d3').Selection<E, TDatum, any, any>} The points, for chaining.
     */
    wireNearestPoints(points, { position, suspended, ...wiring }) {
        const svg = this.svg;
        if (this.options.thumbnail || !svg) return points;
        const handlers = this.#wireMarks(points, { ...wiring, pointer: false });
        wireNearestPointer(svg, points, handlers, { position, suspended });
        return points;
    }

    /** Replace the chart with the sentence saying there is nothing to draw (`noDataMessage()`). */
    #showNoDataMessage() {
        this.#replaceWithMessage({ text: this.noDataMessage() });
    }

    /**
     * Replace the chart with the failure sentence (`general.messages.chart-error`). The
     * exception itself is logged where it is caught, never shown in the card.
     */
    #showErrorMessage() {
        this.#replaceWithMessage({
            text: this.context.glossary.getRequiredEntryText('general.messages.chart-error'),
            kind: 'error',
        });
    }

    /**
     * Replace the chart, and the scroll region it may have made of the container, with a
     * sentence.
     * @param {Parameters<typeof renderChartMessage>[1]} message
     */
    #replaceWithMessage(message) {
        this.clearContainer();
        this.#setContentScroll(false);
        renderChartMessage(this.container, message);
    }

    /**
     * Lay a sentence over the plot area (`layout.chart`) of the drawn chart, whose frame
     * and axes stay: the in-chart empty state of a chart whose marks are all filtered out.
     * Every pass clears it first, so `renderChart()` only lays it when it applies.
     * @param {string} message - Why nothing is drawn, and what to change.
     */
    renderNoDataOverlay(message) {
        const origin = this.svgOrigin();
        if (!origin || !this.layout) return;
        const { x, y, width, height } = this.layout.chart;
        renderChartMessage(this.container, {
            text: message,
            rect: { x: origin.x + x, y: origin.y + y, width, height },
        });
    }

    /**
     * Where the drawn SVG's top-left sits in the container's coordinates, the frame an
     * absolutely placed HTML element over the plot is laid out in: inside the
     * container's padding and edge, and scrolled with it.
     * @protected
     * @returns {{x: number, y: number}|null} `null` before a draw.
     */
    svgOrigin() {
        const svg = this.svg?.node();
        if (!svg) return null;
        const container = this.container;
        const svgBox = svg.getBoundingClientRect();
        const containerBox = container.getBoundingClientRect();
        return {
            x: svgBox.left - containerBox.left - container.clientLeft + container.scrollLeft,
            y: svgBox.top - containerBox.top - container.clientTop + container.scrollTop,
        };
    }

    /**
     * The in-chart empty state of a chart whose key hides every mark: the
     * `general.messages.all-hidden` sentence over the plot, whose frame and axes stay.
     * The chart calls it from `renderChart`: only it knows how its toggles combine
     * into marks.
     * @protected
     */
    renderAllHiddenOverlay() {
        this.renderNoDataOverlay(
            this.context.glossary.getRequiredEntryText('general.messages.all-hidden'),
        );
    }

    /** Remove the overlay `renderNoDataOverlay` laid over the plot, if any. */
    #clearNoDataOverlay() {
        clearChartMessage(this.container);
    }

    /**
     * Measure the container, and say whether a draw is due: a chart that never had a box
     * draws, one that did and has not been resized skips (unless a `refresh()` went stale
     * while it was hidden). The resize observer and a host showing several charts measure
     * them all before any draws (`drawMeasured`), so N charts coming on screen force one
     * layout, not N.
     * @returns {boolean} Whether `drawMeasured` has something to draw.
     */
    measureIfStale() {
        return this.#prepare(true);
    }

    /**
     * The write half: draw what the last `measureIfStale` (or `refresh()`) measured, then
     * any `refresh()` that arrived during the pass. It never throws: a failure shows this
     * chart's error state, so a host drawing several charts in a loop still draws the
     * rest. `renderChart` still measures text as it draws; only the container is read
     * ahead.
     */
    drawMeasured() {
        this.#write();
        while (this.#refreshQueued && !this.#destroyed) {
            this.#refreshQueued = false;
            if (this.#prepare(false)) this.#write();
        }
    }

    /**
     * Decide one pass: paint the key on a first draw or a refresh, and measure the
     * container when asked, when nothing was measured yet, or when the key's entries
     * changed. Leaves the pass for `#write`.
     * @param {boolean} remeasure - Whether the container may have changed size (a resize, a show).
     * @returns {boolean} Whether there is a pass to write.
     */
    #prepare(remeasure) {
        // A host installs its renderers before awaiting the layout settle, so a sibling's
        // sync verb can reach one through `host.chart` before create(), which draws it.
        if (!this.#created || this.#destroyed || this.#rendering) return false;
        // A renderer its host is rebuilding keeps what it drew until the host destroys it:
        // a pass now, for state, size or a toggle it cannot fade, would draw what the
        // rebuild changed, which is its successor's to draw.
        if (this.host?.isCurrentBuild?.(this) === false) return false;
        // A hidden container (its view switched away) has nothing to draw into; the
        // resize observer also fires when it goes to display:none.
        if (this.#hidden) return false;

        try {
            const valid = this.container.isConnected && this.validateData();
            const refresh = this.#refreshPending;
            let measure = remeasure || this.#measured === null;
            // The key takes its room out of the plot area the measure reads, so one whose
            // entries changed is painted first; any other waits for the write, which
            // keeps this half a read. Only a first draw or a refresh (a pill's toggle is
            // one) can change it; a comparison toggle repaints it itself. A chart without
            // a panel (no `legend` option) has nowhere to draw one.
            /** @type {import('../legend/htmlLegendPanel.js').ChartKey|null|undefined} */
            let unpaintedKey;
            if (refresh || this.#measured === null) {
                const key = valid && this.legendPanel ? this.chartKey() : null;
                const signature = keySignature(key);
                if (signature !== this.#keySignature || this.#measured === null) {
                    this.#keySignature = signature;
                    measure = true;
                    this.#paintKey(key);
                } else {
                    unpaintedKey = key;
                }
            }

            let dimensions = this.#measured;
            if (measure) {
                this.#placeAutoKey();
                const next = this.calculateDimensions();
                // The resize observer's first callback reports the size just drawn, and a
                // show at an unchanged size has nothing new to draw.
                if (
                    !refresh &&
                    dimensions &&
                    dimensionsAreClose(
                        next.containerWidth,
                        dimensions.containerWidth,
                        DEFAULT_RENDER_DIMENSION_TOLERANCE_PX,
                    ) &&
                    dimensionsAreClose(
                        next.containerHeight,
                        dimensions.containerHeight,
                        DEFAULT_RENDER_DIMENSION_TOLERANCE_PX,
                    )
                ) {
                    return false;
                }
                dimensions = next;
                this.#measured = next;
                this.#rootFontSizePx = rootFontSizePx();
            }
            this.#pendingPass = {
                dimensions: /** @type {ChartDimensions} */ (dimensions),
                refresh,
                animate: refresh && !remeasure,
                valid,
                key: unpaintedKey,
            };
            return true;
        } catch (error) {
            this.#fail(error);
            return false;
        }
    }

    /**
     * Place an `auto` key: beside the plot while the plot left beside it is at least as
     * wide as tall, so a square plot (a spider) loses no size to it, else over the plot.
     * The key's width is its widest entry plus its trailing padding, the same in either
     * place, so the measure a move starts places it the same way again.
     */
    #placeAutoKey() {
        const panel = this.legendPanel;
        if (this.#layoutPlan.legend !== 'auto' || !panel) return;
        // Measured once per paint: a resize, and the measure a move starts, read the box.
        if (this.#keyWidthPx === null) {
            const entries = [
                ...panel.querySelectorAll(
                    '.legend-section-title, .legend-pill, .legend-swatch-item',
                ),
            ];
            this.#keyWidthPx =
                entries.length === 0
                    ? Infinity
                    : Math.max(...entries.map((entry) => entry.getBoundingClientRect().width)) +
                      2 * (parseFloat(getComputedStyle(panel).paddingInlineEnd) || 0);
        }
        const root = this.#root;
        placeKeyBeside(root, panel, root.clientWidth - this.#keyWidthPx >= root.clientHeight);
    }

    /** Draw the pass `#prepare` left. */
    #write() {
        const pass = this.#pendingPass;
        this.#pendingPass = null;
        if (!pass || this.#destroyed) return;

        this.#rendering = true;
        try {
            this.dimensions = pass.dimensions;
            // A first draw (no svg yet) has nothing to move: its marks enter without one.
            this.#drawDurationMs = pass.animate && this.svg ? MOTION.BASE_MS : 0;
            this.#relabelMarks = pass.refresh;
            this.#refreshPending = false;

            if (!this.container.isConnected) return;
            if (pass.key !== undefined) this.#paintKey(pass.key);
            // Each pass decides afresh whether its plot needs the overlay.
            this.#clearNoDataOverlay();
            if (!pass.valid) {
                this.#clearKeyPanel();
                this.#showNoDataMessage();
                return;
            }

            this.renderChart();
            // A pass that does not animate leaves its end state when it returns: a
            // transition of 0 ms (an exit's fade and removal among them) would otherwise
            // land on d3's next frame, after a capture has cloned the chart. The flush is
            // global, so it moves other charts' running transitions on by one tick, as
            // that frame would.
            if (this.#drawDurationMs === 0) d3.timerFlush();
            // A pass may draw glossary terms and no marks: the SVG still turns `group`.
            this.#keyboard.queueSync();
        } catch (error) {
            this.#fail(error);
        } finally {
            this.#rendering = false;
            this.#drawDurationMs = 0;
            this.#relabelMarks = true;
        }
    }

    /**
     * Show this chart's error state for a pass that threw; the next resize measures and
     * tries again.
     * @param {unknown} error
     */
    #fail(error) {
        console.error(`[ChartRenderer] Render error in '${this.containerId}':`, error);
        this.#measured = null;
        this.#clearKeyPanel();
        this.#showErrorMessage();
    }
}

/**
 * A toggle series' identity across the key: its block's group and its entry's key, so
 * two groups may use the same keys.
 * @param {string} group
 * @param {string} key
 * @returns {string}
 */
function seriesId(group, key) {
    return JSON.stringify([group, key]);
}

/**
 * What decides a key's room: its blocks and their entries, not which are faded.
 * @param {import('../legend/htmlLegendPanel.js').ChartKey|null} key
 * @returns {string} A comparable form; empty for none.
 */
function keySignature(key) {
    if (!key) return '';
    return JSON.stringify(
        key.map((block) => [
            block.title,
            block.group,
            block.columns,
            block.masterLabel,
            block.items.map((item) => [item.key, item.label, item.glossaryKey]),
        ]),
    );
}
