/**
 * Config-driven card module that shows any ChartRenderer. A chart type is a config
 * descriptor handed to this host, never a subclass of it.
 */

import {
    ContentModule,
    createState,
    headerActionButton,
    renderIcon,
    resizeService,
    sameValue,
    withDefaults,
} from '@tba3/module-base';
import { renderChartMessage } from '../chartMessage.js';
import { releaseChartLayout } from '../legend/chartContainerLayout.js';
import { comparisonModeDropdown } from './comparisonModeControl.js';
import { dataTableTemplate, dataTableText, toDataTableList } from './chartDataTable.js';
import { syncScrollRegion } from '../../utils/scrollRegion.js';
import { computed, signal, untracked } from '@preact/signals-core';
import { nothing, render as renderTemplate } from 'lit';
import './chartHostModule.css';

/** @typedef {import('../renderers/chartRenderer.js').ChartRenderer} ChartRenderer */

/**
 * The options every chart host takes; a chart type's own keys extend it. `thumbnail`
 * shows the chart as a picture inside a control (a
 * watermark): no card of its own, no export, no wait for a settled box, and the chart
 * type hands its renderer `thumbnail: true`.
 * @typedef {import('@tba3/module-base').ContentOptions & {
 *   context: import('../../context/moduleContext.js').ModuleContext,
 *   comparisonState?: import('../comparisonState.js').ComparisonStateReader | null,
 *   thumbnail?: boolean,
 * }} ChartHostOptions
 */

/**
 * What `createRenderer` hands back: one renderer, several, or none. Synchronous: the
 * host has already awaited the descriptor's `documents`, so a factory has nothing to await.
 * @template {ChartRenderer} TChart
 * @typedef {TChart | TChart[] | null} ChartRendererResult
 */

/**
 * Any verbs a chart type binds onto its host: what the host stores, whatever the
 * descriptor declares. A descriptor names its own verbs as `TApi`.
 * @typedef {{[method: string]: AnyVerb}} ChartHostApi
 */

/** @typedef {(...args: never[]) => unknown} AnyVerb */

/**
 * No verbs: the `TApi` of a chart type without a `publicAPI`.
 * @typedef {Record<never, never>} NoVerbs
 */

/**
 * The `publicAPI` that implements the verbs `TApi` declares: each takes the host
 * first, then the caller's arguments, and returns what the verb does.
 * @template {object} TApi
 * @template THost
 * @typedef {{[K in keyof TApi]: (host: THost, ...args: Parameters<Extract<TApi[K], AnyVerb>>) => ReturnType<Extract<TApi[K], AnyVerb>>}} ChartHostVerbs
 */

/**
 * A chart type: the config descriptor a ChartHostModule is built from. `TController` is
 * what `createController` builds; `TApi` the verbs its `publicAPI` binds onto the host;
 * `TState` the host's state (`initialState`, `host.state`). The host takes no payload: a
 * chart reads its documents from the store and what it shows from its options and state.
 * @template {ChartRenderer} [TChart=ChartRenderer]
 * @template {ChartHostOptions} [TOptions=ChartHostOptions]
 * @template [TController=null]
 * @template {object} [TApi=NoVerbs]
 * @template {object} [TState={}]
 * @typedef {object} ChartHostConfig
 * @property {(host: ChartHostModule<TChart, TOptions, TController, TState>) => ChartRendererResult<TChart>} createRenderer
 * @property {string} [glossaryPath] - Dot-notation path into glossary.json for the module's title/subtitle/tour copy
 * @property {import('../../data/documentStore.js').DocumentList} [documents] - Documents and datasets the chart type reads from the
 *     host's context store; ensured before every render cycle.
 * @property {(host: ChartHostModule<TChart, TOptions, TController, TState>) => unknown} [bodyControls]
 *     The chart type's own controls (a lit value), in a strip at the top of the body
 *     that stays put while the chart area under it (`host.chartArea`) scrolls. Rendered
 *     inside an effect: the signals it reads re-render the strip, and a control keeps
 *     its node (and the focus on it) across those renders.
 * @property {(host: ChartHostModule<TChart, TOptions, TController, TState>) => unknown} [headerActions]
 *     The chart type's own header buttons (lit values), after the ⌀ dropdown and before
 *     the export control. Rendered with the shell: the signals they read re-render it
 *     (the host's state, `host.chart`, a renderer's own signals).
 * @property {(host: ChartHostModule<TChart, TOptions, TController, TState>) => import('./chartDataTable.js').ChartDataTables} [dataTable]
 *     What the chart draws, as a table, for a chart type drawn by several renderers;
 *     without it the host asks the renderer (`ChartRenderer.dataTable()`).
 *     A header toggle shows the table in place of the plot, and the export offers it as
 *     CSV and JSON beside the image. Read inside an effect while the table shows, so it
 *     follows the signals it reads (`host.chart`, the ⌀ toggles). Without a table to show
 *     (nothing drawn, a renderer that draws none) there is no toggle. Not on a thumbnail.
 * @property {(host: ChartHostModule<TChart, TOptions, TController, TState>) => Array<{id: string, label: string}>} [comparisonModes]
 *     The comparison groups the ⌀ header dropdown offers now, re-read on every render
 *     and every menu open; with none there is no control. Defaults to the groups the live renderer declared
 *     (`ChartRenderer.comparisonModeEntries`), so a chart type that paints none gets no
 *     dropdown. A config names it when the renderer declares no groups because a toggle
 *     redraws it rather than fading marks, or when the groups come from the data before
 *     a renderer exists.
 * @property {ChartHostVerbs<TApi, ChartHostModule<TChart, TOptions, TController, TState>>} [publicAPI]
 *     Named methods exposed on the instance. Each signature is checked against `TApi`,
 *     which the config's `*Host` typedef adds to the host so its callers are checked too.
 * @property {Partial<TOptions>} [defaultOptions] - Fill the keys the caller leaves undefined
 * @property {(host: ChartHostModule<TChart, TOptions, TController, TState>) => (string|Array<string|number|null|undefined>|null)} [getExportIdentity]
 *     What the host currently shows, folded into its export target id. Required
 *     of any chart type whose host is re-pointed at a different entity in place
 *     (a Leitidee, a student), or its captures share one id — see
 *     `ContentModule#getExportIdentity`.
 * @property {(host: ChartHostModule<TChart, TOptions, TController, TState>) => import('@tba3/module-base').StateInit<TState>} [initialState]
 *     The host's state (`host.state`, one signal per key), seeded from its options on
 *     first read. A key given a signal shares it: an app signal passed as an
 *     option is the host's state itself, so nothing forwards changes.
 * @property {(host: ChartHostModule<TChart, TOptions, TController, TState>) => (TController | void)} [createController]
 *     Runs once when the host connects: builds the chart type's controller, for
 *     descriptors whose callbacks share one (they reach it as `host.controller`; the host
 *     calls its `destroy()`, if it has one, when it tears down), or only sets the host
 *     up (registers `host.onChange` followers, which the host disposes) and returns
 *     nothing.
 * @property {(host: ChartHostModule<TChart, TOptions, TController, TState>) => unknown} [rebuildOn]
 *     Reads the signals that pick the renderer set: another renderer class, another
 *     number of them, or whether there is one to build. Other data is no rebuild: the
 *     renderer takes it as a state signal and redraws in place. A change of its result
 *     (`onChange`: arrays element by element) re-renders the host.
 */

/**
 * Whether an element's content overflows it, either way.
 * @param {HTMLElement} element - A scroll container.
 * @returns {boolean}
 */
function overflows(element) {
    return element.scrollWidth > element.clientWidth || element.scrollHeight > element.clientHeight;
}

/**
 * Normalize what `createRenderer` returned into an array.
 * @template {ChartRenderer} TChart
 * @param {TChart | TChart[] | null} result
 * @returns {TChart[]}
 */
function toChartArray(result) {
    if (result == null) return [];
    return Array.isArray(result) ? result : [result];
}

/**
 * `createChart` binds the descriptor's `publicAPI` verbs onto the instance and returns
 * the host typed with them (the descriptor's `TApi`), so `tsc` checks every verb call.
 * @template {ChartRenderer} [TChart=ChartRenderer]
 * @template {ChartHostOptions} [TOptions=ChartHostOptions]
 * @template [TController=null]
 * @template {object} [TState={}]
 * @augments {ContentModule<TOptions>}
 */
class ChartHostModule extends ContentModule {
    /** @type {ChartHostConfig<TChart, TOptions, TController, ChartHostApi, TState>} */
    #config;
    /** @type {TController | null} */
    #controller = null;
    /** @type {import('@tba3/module-base').State<TState> | null} */
    #state = null;
    /**
     * The newest render cycle's renderers (always an array, even for a single chart): a
     * signal, so the header actions that read them follow a new set.
     * @type {import('@preact/signals-core').Signal<TChart[]>}
     */
    #charts = signal([]);

    /**
     * Renderers a newer set replaced, still showing what they drew: destroyed just before
     * the newer set's `create()`, so the card never shows an empty body in between.
     * @type {TChart[]}
     */
    #retired = [];

    /** @type {WeakMap<ChartRenderer, unknown>} The `rebuildOn` result each renderer was built from. */
    #builtFrom = new WeakMap();

    /** @type {HTMLElement|null} The failure sentence a failed newest cycle left, until a cycle succeeds. */
    #failure = null;

    /** @type {HTMLElement|null} The area the chart draws into, once the body is split (`#ensureBodyLayout`). */
    #chartArea = null;

    /** Whether the data table shows in place of the chart; view state, kept for the session. */
    #showTable = signal(false);

    /**
     * What the chart draws now, as tables, built once per change for the table area, the
     * toggle and the export alike; none on a host that offers no table.
     */
    #tables = computed(() => (this.#offersDataTable ? this.#readDataTables() : []));

    /**
     * Whether there is a table to show, for the toggle and the CSV/JSON export: a
     * computed boolean, so the header re-renders when it flips, not on every change the
     * table itself follows.
     */
    #hasTable = computed(() => this.#tables.value.length > 0);

    /** Whether a `rebuildOn` change came while the host was hidden. */
    #rebuildPending = false;

    /**
     * The newest render cycle's number: it decides which cycle may still draw, show the
     * failure sentence and clear `aria-busy`. What awaiters wait for is the base's
     * content pass, which every cycle is part of.
     * @type {number}
     */
    #renderCycle = 0;

    /** Whether a render cycle has started, so the documents are in: the header actions read the store. */
    #cycleStarted = signal(false);

    /**
     * A host for one chart type, configured and not yet connected: what a parent places
     * itself. Typed by the descriptor, so the host's state and verbs are. The
     * descriptor's `defaultOptions` fill the keys the caller leaves undefined, and an
     * options-level `glossaryKey` takes precedence over the descriptor's `glossaryPath`.
     * @template {ChartRenderer} [C=ChartRenderer]
     * @template {ChartHostOptions} [O=ChartHostOptions]
     * @template [K=null]
     * @template {object} [S={}]
     * @template {object} [A=NoVerbs]
     * @param {string} id
     * @param {ChartHostConfig<C, O, K, A, S>} config
     * @param {NoInfer<O>} options - The chart-host options plus the chart type's own.
     * @returns {ChartHostModule<C, O, K, S> & A} The host, with the chart type's verbs.
     */
    static createChart(id, config, options) {
        const merged = withDefaults(config.defaultOptions ?? {}, {
            ...options,
            ...(options.thumbnail ? { showModuleCard: false, enableModuleExport: false } : {}),
            glossaryKey: options.glossaryKey ?? config.glossaryPath ?? null,
        });
        const host = /** @type {ChartHostModule<C, O, K, S>} */ (
            /** @type {unknown} */ (ChartHostModule.create(id, merged))
        );
        host.#config = /** @type {ChartHostConfig<C, O, K, ChartHostApi, S>} */ (
            /** @type {unknown} */ (config)
        );
        if (host.#config.publicAPI) host.#bindPublicAPI(host.#config.publicAPI);
        return /** @type {ChartHostModule<C, O, K, S> & A} */ (host);
    }

    /**
     * The documents the chart type reads: the descriptor names them, so the content
     * pass ensures them before every render it starts.
     * @override
     * @returns {import('../../data/documentStore.js').DocumentList} File names or dataset keys.
     */
    get documents() {
        return this.#config.documents ?? [];
    }

    /**
     * What the chart type shows, as signals: one copy, the host's, seeded on first read
     * (`initialState`). A renderer that draws a key is handed the host's signal as an
     * option and keeps it in its own state (`createState` shares a signal it is given), so
     * a write here redraws the live renderer and seeds the next one.
     * @returns {import('@tba3/module-base').State<TState>}
     */
    get state() {
        return (this.#state ??= createState(
            this.#config.initialState?.(this) ??
                /** @type {import('@tba3/module-base').StateInit<TState>} */ ({}),
        ));
    }

    /**
     * The descriptor's controller, and the signals that rebuild the renderer.
     * @override
     */
    _setup() {
        super._setup();
        const { createController, rebuildOn } = this.#config;
        if (createController) this.#controller = createController(this) ?? null;
        if (rebuildOn) {
            // A hidden host rebuilds when it is shown again (`_onShow`), not for a view
            // nobody sees.
            this.onChange(
                () => rebuildOn(this),
                () => {
                    if (this.visible) void this.rerender();
                    else this.#rebuildPending = true;
                },
            );
        }
    }

    /**
     * The controller the descriptor's `createController` built, or null without one.
     * Typed as `TController` without the null: a descriptor declares `TController`
     * exactly when it declares `createController`, and the default is `null`.
     * @returns {TController}
     */
    get controller() {
        return /** @type {TController} */ (this.#controller);
    }

    /**
     * Where the chart draws: in a split body (a `bodyControls` strip, a data table) the
     * area of its own, else the body itself. A chart type's `createRenderer` hands it to
     * its renderer.
     * @returns {HTMLElement}
     */
    get chartArea() {
        return this.#chartArea ?? this.contentContainer;
    }

    /**
     * The renderer options the host owns, which a chart type's `createRenderer` spreads
     * into its own: the app's context, whether the host is a thumbnail (the renderer then
     * draws no key and wires no interaction), and the app's comparison state, which a
     * renderer follows once it declared its groups (`setComparisonModes`).
     * @returns {{context: import('../../context/moduleContext.js').ModuleContext, thumbnail: boolean, comparisonState: import('../comparisonState.js').ComparisonStateReader|null}}
     */
    get rendererOptions() {
        return {
            context: this.options.context,
            thumbnail: this.options.thumbnail === true,
            comparisonState: this.options.comparisonState ?? null,
        };
    }

    /**
     * The first renderer, for a host managing a single chart.
     * @returns {TChart | null} Null when the host manages none.
     */
    get chart() {
        return this.#charts.value[0] ?? null;
    }

    /**
     * Whether the data table shows in place of the chart: a tracked read, so a header
     * action that acts on the plot alone renders inactive meanwhile
     * (`headerActionButton({inactive})`).
     * @returns {boolean}
     */
    get showsTable() {
        return this.#showTable.value;
    }

    /** @returns {TChart[]} The newest render cycle's renderers, in creation order. */
    get charts() {
        return this.#charts.value;
    }

    /**
     * Whether `rebuildOn` still reads what the renderer was built from. A renderer draws
     * a pass only then: what a rebuild changed is its successor's to draw. Read fresh and
     * untracked, so it holds before the host's own `rebuildOn` effect has run, and a pass
     * started inside an effect does not subscribe it to the `rebuildOn` signals.
     * @param {ChartRenderer} chart - A renderer this host built.
     * @returns {boolean} Also true when nothing rebuilds (no `rebuildOn`).
     */
    isCurrentBuild(chart) {
        const { rebuildOn } = this.#config;
        return (
            !rebuildOn ||
            sameValue(
                this.#builtFrom.get(chart),
                untracked(() => rebuildOn(this)),
            )
        );
    }

    /**
     * A chart is exportable once it has a renderer: as an image, and while it has a data
     * table to show also as its data.
     * @override
     * @returns {'chart'|'visual'|null} `'chart'` while there is a data table, else `'visual'`; null without a renderer.
     */
    _getExportType() {
        if (this.#charts.value.length === 0) return null;
        return this.#hasTable.value ? 'chart' : 'visual';
    }

    /**
     * The data tables as CSV or JSON, each under its own title or the card's.
     * @override
     * @param {'csv'|'json'} format
     * @returns {import('@tba3/module-base').ExportDataBlock[]}
     */
    _ownExportData(format) {
        return this.#tables.peek().map((table) => ({
            title: table.title ?? this.cardTitle,
            text: dataTableText(table, format),
        }));
    }

    /** @returns {boolean} Whether the host offers the chart's data as a table: never on a thumbnail. */
    get #offersDataTable() {
        return !this.options.thumbnail;
    }

    /**
     * What the chart draws now, as tables: the config's own function, or the renderer's;
     * none without a renderer or from a renderer that draws none. Reading the renderers
     * subscribes a caller to a rebuild.
     * @returns {import('./chartDataTable.js').ChartDataTable[]}
     */
    #readDataTables() {
        const [chart] = this.charts;
        if (!chart) return [];
        const { dataTable } = this.#config;
        return toDataTableList(dataTable ? dataTable(this) : chart.dataTable());
    }

    /** Back from the table to the chart, which draws at once what it skipped while hidden. */
    #showChart() {
        this.#showTable.value = false;
        this.drawStale();
    }

    /**
     * A capture (PDF, image, report) shows the chart, also while its table does: the
     * image formats promise the chart, and CSV/JSON carry the table. The table comes
     * back once the capture is cloned, or at once when the preparation fails.
     * @override
     * @returns {Array<() => () => void>} Showing the chart, then the superclass's steps.
     */
    _captureSteps() {
        const steps = super._captureSteps();
        if (!this.#showTable.peek()) return steps;
        return [
            () => {
                this.#showChart();
                return () => {
                    this.#showTable.value = true;
                };
            },
            ...steps,
        ];
    }

    /**
     * The renderers size their SVG to the body (`height: 100%`), which the capture stage
     * lets grow to its content: the clone keeps the body's height on screen, unless the
     * body scrolls, where it grows to show everything.
     * @override
     * @param {(live: Element) => Element|null} cloneOf - Maps a live element to its copy in the clone.
     */
    _prepareOwnClone(cloneOf) {
        const body = this.contentContainer;
        const cloneBody = /** @type {HTMLElement|null} */ (cloneOf(body));
        const height = body.clientHeight;
        if (!cloneBody || height === 0 || body.scrollHeight > height + 1) return;
        cloneBody.style.height = `${height}px`;
    }

    /**
     * What this host currently shows, for its export target id: the descriptor's
     * `getExportIdentity`, or none.
     * @override
     */
    getExportIdentity() {
        return this.#config.getExportIdentity?.(this) ?? null;
    }

    // ========================================================================
    // LIFECYCLE
    // ========================================================================

    /**
     * The content pass is a render cycle.
     * @override
     * @returns {Promise<void>}
     */
    async _renderBody() {
        await this.#startRenderCycle();
    }

    /**
     * Render the chart(s): a new cycle, which supersedes any still running.
     * 1. Calls `config.createRenderer(host)` to obtain renderer(s)
     * 2. Renders the header actions, then syncs the export control
     * 3. Waits for a stable content box
     * 4. Destroys the renderers it replaced, then calls `.create()` on each new one
     *
     * The host carries `aria-busy` until the newest cycle has finished. A newest cycle
     * that fails leaves the failure sentence, not the renderers it was replacing.
     * @returns {Promise<void>}
     */
    #startRenderCycle() {
        const renderCycle = ++this.#renderCycle;
        this.setAttribute('aria-busy', 'true');
        const render = this.#renderCycleContent(renderCycle).catch((error) => {
            if (renderCycle === this.#renderCycle) this.#showFailure();
            throw error;
        });
        const clearBusy = () => {
            if (renderCycle === this.#renderCycle) this.removeAttribute('aria-busy');
        };
        void render.then(clearBusy, clearBusy);
        return render;
    }

    /**
     * The ⌀ dropdown first, then the config's own buttons, then the data-table toggle
     * while there is a table to show; the export control follows. The groups are the
     * renderer's declared ones unless the config names its own (a chart that redraws on a
     * toggle, or groups from the data). Nothing until a render cycle has started: all
     * read the documents from the store.
     * @override
     * @returns {unknown}
     */
    _headerActions() {
        if (!this.#cycleStarted.value) return nothing;
        const { comparisonModes, headerActions } = this.#config;
        return [
            comparisonModeDropdown(this, () =>
                comparisonModes ? comparisonModes(this) : (this.chart?.comparisonModeEntries ?? []),
            ),
            headerActions?.(this) ?? nothing,
            this.#hasTable.value ? this.#dataTableToggle() : nothing,
        ];
    }

    /**
     * The toggle between the chart and its data table. The icon shows what a click
     * switches *to*, as the orientation toggle's does. Back to the chart, it draws at
     * once what it skipped while hidden, not on the resize observer's delay.
     * @returns {import('lit').TemplateResult}
     */
    #dataTableToggle() {
        const shown = this.#showTable.value;
        return headerActionButton({
            name: 'data-table-toggle',
            ariaLabel: this.options.context.glossary.getRequiredEntryText(
                'general.buttons.element_texts.data-table-toggle.label',
            ),
            pressed: shown,
            buttonContent: renderIcon(shown ? 'bar_chart' : 'table'),
            onClick: () => {
                if (shown) this.#showChart();
                else this.#showTable.value = true;
            },
        });
    }

    /**
     * One render cycle; see `#startRenderCycle()`.
     * @param {number} renderCycle - The cycle this pass belongs to.
     * @returns {Promise<void>}
     */
    async #renderCycleContent(renderCycle) {
        // The content pass ensured the documents before it started the first cycle.
        this.#cycleStarted.value = true;
        this.#ensureBodyLayout();

        // The renderer about to be built reads the `rebuildOn` signals as they are now,
        // so a rebuild that came while hidden is done by this cycle.
        this.#rebuildPending = false;
        const builtFrom = this.#config.rebuildOn?.(this);
        const charts = toChartArray(this.#config.createRenderer(this));
        // The host reference set here is what comparisonModes and create() read.
        for (const chart of charts) {
            chart.host = this;
            this.#builtFrom.set(chart, builtFrom);
        }
        this.#retired.push(...this.#charts.peek());
        this.#charts.value = charts;

        // The header actions read the new renderers (their ⌀ groups, a zoom toggle that
        // depends on the data), and they affect the body height that renderers measure:
        // let the shell render them before create(), so the first draw measures the
        // settled shell.
        await this._whenTemplateRendered();
        this.syncExportControls();

        if (!this.#isRenderCycleCurrent(renderCycle)) {
            this.#abandonCycle(renderCycle);
            return;
        }

        await this.#waitForStableContentLayout();

        if (!this.#isRenderCycleCurrent(renderCycle)) {
            this.#abandonCycle(renderCycle);
            return;
        }

        this.#destroyRenderers(this.#retired.splice(0));
        // A retired renderer removes only its drawing, for a successor to draw into its
        // frame: with none, the frame goes. A descriptor's empty state stays.
        if (charts.length === 0) releaseChartLayout(this.chartArea);
        // Only the host's own sentence: a descriptor's empty state stays.
        this.#failure?.remove();
        this.#failure = null;
        for (const chart of charts) chart.create();
    }

    /**
     * Shown again: a view revisit, or the card (or one around it) unfolded. A rebuild
     * that came while hidden runs now. Otherwise a renderer that was created without a
     * box (header controls and export target exist), or went stale while hidden, draws
     * now; one that drew at this size skips. Every chart of this host measures before
     * any draws; a chart whose key is repainted first still forces a layout of its own.
     * @override
     */
    _onShow() {
        // Also before the first cycle has finished: its renderer may predate the change.
        if (this.#rebuildPending) {
            void this.rerender();
            return;
        }
        if (!this.initialized) return;
        this.drawStale();
    }

    /**
     * Rebuild the renderer set: a new render cycle that tears down the charts and
     * calls `createRenderer` again. The cycle becomes the host's content pass, so
     * `updateComplete` and `contentComplete` settle with it, not with a pass it replaced.
     *
     * Safe from any verb at any time: before the host connects, while its first content
     * pass still waits for the documents, and after it tore down it does nothing; once
     * the documents are in, a call supersedes a first render still in flight, so a
     * switch made meanwhile is not lost. A failed cycle is logged here and the call
     * never rejects, so fire-and-forget callers need no catch of their own; it rejects
     * the host's completion promises while it is the newest pass.
     * @returns {Promise<void>}
     */
    async rerender() {
        if (!this.isConnected || this.destroyed) return;
        // Before the content pass has its documents there is nothing to read yet: the
        // cycle it starts once they land draws the state as it is then.
        if (!this.#cycleStarted.peek()) return;
        const cycle = this.#startRenderCycle();
        this._adoptContentPass(cycle);
        try {
            await cycle;
        } catch (error) {
            console.error(`ChartHostModule[${this.id}]: rerender failed:`, error);
        }
    }

    async #waitForStableContentLayout() {
        if (this.options.thumbnail || this.charts.length === 0) {
            return;
        }
        // A host inside a `display: none` subtree does not wait: the renderer bails on the
        // same test right after. The first render under the `visibility: hidden` render
        // cover has a layout and waits.
        await this._whenLaidOut();
    }

    /**
     * @override
     */
    _teardown() {
        this.#renderCycle++;
        const controller = /** @type {{destroy?: () => void} | null} */ (this.#controller);
        try {
            controller?.destroy?.();
        } finally {
            // A controller that throws must not leave the renderers and the card standing.
            this.#destroyCharts();
            this.removeAttribute('aria-busy');

            super._teardown();
        }
    }

    // ========================================================================
    // PRIVATE HELPERS
    // ========================================================================

    /**
     * Split the body once, for a chart type with `bodyControls` or a data table: the
     * controls strip on top, the chart area, and the table area that takes the chart
     * area's place while the table shows. The table needs a node of its own, as a
     * renderer empties the area it draws into. The strip and the table are rendered from
     * the signals they read; a chart hidden behind its table skips its passes and
     * catches up when shown (`ChartRenderer#hidden`). The table area is a scroll
     * region, reachable by the keyboard, while its tables overflow it.
     */
    #ensureBodyLayout() {
        const { bodyControls } = this.#config;
        const offersTable = this.#offersDataTable;
        if ((!bodyControls && !offersTable) || this.#chartArea) return;
        const body = this.contentContainer;
        const chartArea = document.createElement('div');
        chartArea.className = 'chart-host-chart-area';
        body.replaceChildren(chartArea);
        this.#chartArea = chartArea;
        if (bodyControls) {
            const strip = document.createElement('div');
            strip.className = 'chart-host-controls';
            body.classList.add('chart-host-body--controls');
            chartArea.before(strip);
            this.effect(() => {
                renderTemplate(bodyControls(this), strip);
            });
        }
        if (offersTable) {
            const tableArea = document.createElement('div');
            tableArea.className = 'chart-host-table-area';
            body.classList.add('chart-host-body--table');
            chartArea.after(tableArea);
            // A scroll region while its tables overflow it. Checked after each render: new
            // rows grow the content, not the area, so no resize would report them. The
            // observer covers the card's own resizes, measuring with every other observer.
            // A hidden area has nothing to scroll and is not measured.
            let scrolls = false;
            this.resources.trackSubscription(
                resizeService.observe(tableArea, {
                    measure: () => {
                        scrolls = !tableArea.hidden && overflows(tableArea);
                        return true;
                    },
                    draw: () => syncScrollRegion(tableArea, scrolls, this.titleElement),
                }),
            );
            this.effect(() => {
                const tables = this.#showTable.value ? this.#tables.value : [];
                const shown = tables.length > 0;
                chartArea.hidden = shown;
                tableArea.hidden = !shown;
                renderTemplate(
                    shown ? dataTableTemplate(tables, this.cardTitle) : nothing,
                    tableArea,
                );
                syncScrollRegion(tableArea, shown && overflows(tableArea), this.titleElement);
                // Nothing to show (a failed cycle, a chart that draws nothing now): back to
                // the chart, so a later payload never opens the table unasked.
                if (!shown && this.#showTable.peek()) untracked(() => this.#showChart());
            });
        }
    }

    /**
     * Draw what went stale while hidden, or whose box changed: every chart measures
     * before any draws, so N charts force one layout, not N. A controller that resizes
     * its renderers' boxes itself calls it after the write.
     */
    drawStale() {
        const stale = this.charts.filter((chart) => chart.measureIfStale());
        for (const chart of stale) chart.drawMeasured();
    }

    /** Destroy every renderer the host holds, the retired ones included, and clear both. */
    #destroyCharts() {
        this.#destroyRenderers([...this.#retired.splice(0), ...this.#charts.peek()]);
        this.#charts.value = [];
    }

    /**
     * The newest cycle failed: destroy every renderer, which would otherwise stay on
     * screen drawn for what the failed cycle replaced, and show the failure sentence
     * (`general.messages.chart-error`) until a cycle succeeds. The exception goes to the
     * console (`rerender()`) or rejects the content pass, never into the card.
     */
    #showFailure() {
        this.#destroyCharts();
        releaseChartLayout(this.chartArea);
        this.#failure = renderChartMessage(this.chartArea, {
            text: this.options.context.glossary.getRequiredEntryText(
                'general.messages.chart-error',
            ),
            kind: 'error',
        });
    }

    /**
     * Tear down what a stopped cycle leaves when no newer cycle took over (the host left
     * the document). A superseded cycle leaves its renderers to the newer one, which
     * destroys them before its own `create()`.
     * @param {number} renderCycle - The cycle that stopped.
     */
    #abandonCycle(renderCycle) {
        if (renderCycle === this.#renderCycle) this.#destroyCharts();
    }

    /**
     * Destroy renderer instances and drop their host reference. One failing
     * renderer must not keep the rest alive.
     * @param {TChart[]} charts
     */
    #destroyRenderers(charts) {
        for (const chart of charts) {
            try {
                chart.destroy();
                chart.host = null;
            } catch (error) {
                console.error(`ChartHostModule[${this.id}]: Error destroying chart:`, error);
            }
        }
    }

    /**
     * Check whether an async render cycle is still current and attached to live DOM.
     * @param {number} renderCycle - The cycle the caller started in.
     * @returns {boolean}
     */
    #isRenderCycleCurrent(renderCycle) {
        return (
            renderCycle === this.#renderCycle &&
            !this.destroyed &&
            this.contentContainer.isConnected
        );
    }

    /**
     * Bind config.publicAPI methods directly onto the instance, so callers invoke
     * them as `host.myMethod(arg1, arg2)`.
     * @param {NonNullable<ChartHostConfig<TChart, TOptions, TController, ChartHostApi, TState>['publicAPI']>} api
     */
    #bindPublicAPI(api) {
        for (const [name, fn] of Object.entries(api)) {
            if (name in this) {
                console.warn(
                    `ChartHostModule[${this.id}]: publicAPI '${name}' shadows an existing host property or method`,
                );
            }
            Reflect.set(this, name, (/** @type {never[]} */ ...args) => fn(this, ...args));
        }
    }
}

customElements.define('tba-chart-host', ChartHostModule);

export { ChartHostModule };
