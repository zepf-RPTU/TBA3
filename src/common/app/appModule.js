/**
 * BaseAppModule — abstract coordinator each dashboard's app module extends: the app
 * state, the views and their switching, routing, the shared header and sidebar. A
 * subclass is its spec (`AppSpec`, its `static defaultOptions`).
 */

import { batch } from '@preact/signals-core';
import { BaseModule, createState, noticeCallout } from '@tba3/module-base';
import { render } from 'lit';
import { createComparisonState } from '@tba3/modules/charts';
import { createAppContext } from './appContext.js';
import { BatchExportToolbar } from '../export/batchExportToolbar.js';
import { exportImageStore } from '../export/exportImageStore.js';
import { HeaderOrchestrator } from '../modules/header/headerOrchestrator.js';
import { SidebarModule } from '../modules/sidebarModule.js';
import { buildTourSteps } from '../modules/tutorial/tourStepBuilder.js';
import { TutorialController } from '../modules/tutorial/tutorialController.js';
import { ViewLifecycle } from './viewLifecycle.js';
import {
    navigateToScope,
    resolveSelectedDataset,
    restoreScopeSwitchFocus,
} from './scopeSearchParams.js';
import { createDatasetLoader } from '../services/datasetAcquisition.js';
import { REPORT_VIEW_KEY } from '../views/report/reportViewConfig.js';
import {
    applyTemplateTokens,
    resolveDotPath,
    requireGlossaryTitle,
    resolveGlossaryTitle,
    stripHtmlToText,
} from '@tba3/module-base/glossary';
import { tooltipService } from '@tba3/modules/tooltips';
import { toStudentSelectItems } from '@tba3/modules/domain';
import { notify, notifyFailure } from '../services/notificationService.js';
import { loadCauseKey } from './loadFailure.js';

/**
 * One view as an app declares it. Its ids follow from the app id and the view key (see
 * LabelledViewConfigEntry), so an entry names only what differs between views.
 * @typedef {object} ViewConfigEntry
 * @property {string} icon - Material Symbols icon name for the sidebar button and view title
 * @property {string} [headerGlossaryPath] - Glossary entry of the view header: its title, subtitle, control labels and tour copy; `<app>.<view>.header` unless given
 * @property {boolean} [tour] - Offer the guided walkthrough button in the header; set on views whose modules carry tour copy
 * @property {() => Promise<ViewModuleClass>} load
 * @property {boolean} [sidebarPinBottom]
 * @property {import('./viewSkeleton.js').ViewSkeletonShape} skeleton - Loading placeholder shape
 * @property {boolean} [needsData] - Whether the view waits for the dataset's documents before it shows (default true); a view that reads none (a welcome page) shows at once, and its header copy reads no data either: it is drawn before the data lands, and only the app's header tokens (`headerTokens`) fill in, once it has
 * @property {Pick<import('../modules/navCard/navCardModule.js').NavCardItem, 'statePatch'>} [navCard] - What the view's welcome nav card adds to the one derived from this entry: the state written with the navigation
 * @property {'bounded'} [fit] - `bounded` keeps the view to the viewport's height wherever an app lets views flow to their content; stamped on the shell as `data-view-fit`
 */

/** @typedef {import('../modules/baseViewModule.js').BaseViewModule} BaseViewModule */

/**
 * A view module class as the shell creates it: a module element, configured through its
 * options.
 * @typedef {{create: (id: string, options: import('../modules/baseViewModule.js').ViewModuleOptions<any>) => import('../modules/baseViewModule.js').BaseViewModule<any>}} ViewModuleClass
 */

/** @typedef {{id: string, label: string, scope?: string, folder?: string}} DatasetDescriptor */

/**
 * The keys the shell keeps for every app; each app's state typedef extends it. Which
 * comparison groups show is not a key: the app keeps it in the chart layer's comparison
 * state.
 * @typedef {object} ShellState
 * @property {string|null} currentView - The view on screen, null before the first.
 * @property {string|null} previousView - The view shown before it.
 * @property {string|null} currentStudentId - The student a student view shows; the shell
 *     seeds it once the data has landed (`BaseAppModule.onDataReady`), null before and in
 *     an app without students.
 */

/**
 * What an app's header controls close over, over the app's state `TState`: plain
 * values and the store, so the `*HeaderControls.js` builders stay testable with a stub
 * instead of an app instance.
 * @template {ShellState} [TState=ShellState]
 * @typedef {object} HeaderControlContext
 * @property {import('@tba3/module-base').State<TState>} state - The app state: a control reads its key's `.value` and writes it.
 * @property {DatasetDescriptor[]} datasetOptions - Selectable datasets
 * @property {DatasetDescriptor} currentDataset - The dataset the URL selected
 * @property {(datasetId: string) => void} navigate - Switch to another dataset
 * @property {import('@tba3/modules/documents').DocumentStore} documents - The dataset's store; a control whose items come from the data reads it when it renders (`resolveItems`, `resolveHidden`), only on views that wait for the data
 * @property {import('@tba3/modules/context').ModuleContext['palette']} palette - The app's competence-level palette
 */

/**
 * Builds an app's header controls per view from its control context, once, before the
 * documents land.
 * @template {ShellState} [TState=ShellState]
 * @typedef {(ctx: HeaderControlContext<TState>) => {[viewType: string]: ReadonlyArray<import('../modules/header/headerOrchestrator.js').HeaderControlDeclaration>}} HeaderControlsBuilder
 */

/**
 * Which datasets an app offers and what it acquires for the selected one.
 * @typedef {object} AppDatasetSpec
 * @property {DatasetDescriptor[]} options - The datasets the header selector lists
 * @property {string} defaultId - The dataset opened when the URL names none
 * @property {import('@tba3/modules/documents').DatasetRequest[]} requests - The app's requests: its `GROUP_REQUESTS` entry or `SCHOOL_REQUESTS`, plus any file the site serves
 */

/**
 * A view config entry as the shell resolves it for view key `<view>` in app `<app>`:
 * header entry `<app>.<view>.header` unless the entry names one, container
 * `<app>-<view>-container`, sidebar button `<view>ViewButton`, name from the
 * glossary entry `<app>.nav-cards.element_texts.nav-<view>` (its `title` names the view
 * wherever the reader sees it) as `label`. Its loader is untyped: the resolved entries
 * are shared with code that knows no app state; the shell constructs a view through the
 * spec's typed loader.
 * @typedef {Omit<ViewConfigEntry, 'load' | 'headerGlossaryPath'> & {load: () => Promise<unknown>, headerGlossaryPath: string, containerId: string, buttonId: string, navigationGlossaryPath: string, label: string}} LabelledViewConfigEntry
 */

/**
 * An app as its subclass declares it (its `defaultOptions`), over its state `TState`,
 * plus the dashboard id bootstrap passes.
 * @template {ShellState} [TState=ShellState]
 * @typedef {object} AppSpec
 * @property {AppDatasetSpec} dataset - The datasets the app offers and acquires
 * @property {{[viewType: string]: ViewConfigEntry}} views - The views, in sidebar and routing order
 * @property {string} defaultView - The view shown when the URL names none
 * @property {Omit<TState, keyof ShellState>} initialState - The app's own state keys; the shell adds `currentView`, `previousView` and `currentStudentId`
 * @property {import('@tba3/module-base/glossary').GlossaryTree} glossaryData - The app's assembled glossary
 * @property {string} appId - Which dashboard this is (`en`, `ma`, `sl`); bootstrap passes it
 * @property {HeaderControlsBuilder<TState>} [headerControls] - The header controls of each view that has any (`build*ViewHeaderControls`)
 * @property {import('@tba3/modules/documents').DatasetKey<string[]>} [comparisonIds] - The dataset of every comparison population's id, each starting shown; none for an app without comparison toggles
 * @property {(documents: import('@tba3/modules/documents').DocumentStore) => import('@tba3/module-base/glossary').GlossaryReplacements} [headerTokens] - The tokens every view header's title and subtitle may carry (`{{Fach}}`), read once the data has landed; each reads empty before. None for an app whose header copy has none
 * @property {{records: import('@tba3/modules/documents').DatasetKey<Parameters<typeof toStudentSelectItems>[0]>, view: string}} [students] - The student records the student selector lists, and the view a student opens in, which starts on the first record. None for an app without students
 */

/**
 * What the app builds from its spec before anything renders: its context (with the
 * runtime it hands every module and the selected dataset's store) and the dataset the
 * URL selected.
 * @typedef {object} AppCore
 * @property {import('./appContext.js').AppContext} context
 * @property {DatasetDescriptor} currentDataset - The dataset the URL selected
 */

/**
 * @template {ShellState} [TState=ShellState]
 * @augments {BaseModule<AppSpec<TState> & import('@tba3/module-base').BaseOptions>}
 */
export class BaseAppModule extends BaseModule {
    // The collaborators are built in _setup(), once the options are set and the
    // resources exist.

    /** @type {AppCore|undefined} */
    #coreInstance;
    /** @type {{[viewType: string]: LabelledViewConfigEntry}} */
    #viewConfig;
    /** @type {import('@tba3/module-base').State<TState>} */
    #appState;
    /** @type {import('@tba3/modules/charts').ComparisonState} Which comparison groups show. */
    #comparisonState = createComparisonState();
    /** @type {ViewLifecycle} */
    #viewLifecycle;
    /** @type {HeaderOrchestrator} */
    #headerOrchestrator;
    /** @type {TutorialController} */
    #tutorialController;
    /** @type {SidebarModule} */
    #sidebar;
    /** @type {BatchExportToolbar|null} The bar that opens the report; built with the shell's components. */
    #batchToolbar = null;

    // App-wide notes drawer, imported on the first toggle; destroyed with the app.
    /** @type {Promise<import('../modules/notes/notesController.js').NotesController> | null} */
    #notes = null;

    /** @type {Promise<void>|null} Every document landed and the data-dependent start-up done; started by the first render. */
    #dataReady = null;
    /** @type {boolean} Whether #dataReady has resolved. */
    #dataLanded = false;
    /** @type {unknown} Why #dataReady rejected; undefined while it has not. */
    #dataFailure = undefined;

    /** @type {() => void} Resolves `#shellReady`. */
    #markShellReady = () => {};
    /** @type {Promise<void>} The sidebar, header and router are up, and the first view is covered. */
    #shellReady = new Promise((resolve) => {
        this.#markShellReady = resolve;
    });

    /**
     * The context, the selected dataset and its store, built on first use: bootstrap
     * reads the glossary before the app connects.
     * @returns {AppCore}
     * @throws {Error} when the app's glossary does not come up
     */
    get #core() {
        if (this.#coreInstance) return this.#coreInstance;
        const { appId, glossaryData, dataset } = this.options;
        const currentDataset = resolveSelectedDataset(dataset.options, dataset.defaultId);
        const context = createAppContext({
            appId,
            glossaryData,
            dataset: currentDataset,
            // Read on use: the views resolve in _setup(), after the context.
            viewLabel: (viewType) => this.#viewConfig[viewType]?.label ?? '',
            store: {
                requests: dataset.requests,
                loadRequest: createDatasetLoader(currentDataset, appId),
            },
            images: exportImageStore,
        });
        // Every app ships a glossary: one that does not come up is a wiring bug.
        if (!context.glossary.isInitialized) {
            throw new Error(
                `${this.constructor.name}: the glossary for '${context.appId}' did not initialise`,
            );
        }
        this.#coreInstance = { context, currentDataset };
        return this.#coreInstance;
    }

    /**
     * The app state as the shell's own keys see it: under a generic `TState` a literal
     * write does not type-check, but every app's state carries the shell keys.
     * @returns {import('@tba3/module-base').State<ShellState>} The same state.
     */
    get #shell() {
        return /** @type {import('@tba3/module-base').State<ShellState>} */ (
            /** @type {unknown} */ (this.#appState)
        );
    }

    /**
     * The app's context, handed to every view and module as the `context` option.
     * @returns {import('./appContext.js').AppContext}
     */
    get context() {
        return this.#core.context;
    }

    /**
     * Resolve each declared view into its `LabelledViewConfigEntry`.
     * @param {{[viewType: string]: ViewConfigEntry}} views
     * @returns {{[viewType: string]: LabelledViewConfigEntry}}
     * @throws {Error} when a view's header entry carries no title: every view has a header,
     *   so a missing one is a wiring bug, found at boot rather than on the first visit
     */
    #resolveViewConfig(views) {
        const appId = this.context.appId;
        return Object.fromEntries(
            Object.entries(views).map(([viewType, viewData]) => {
                const headerGlossaryPath =
                    viewData.headerGlossaryPath ?? `${appId}.${viewType}.header`;
                if (
                    !resolveGlossaryTitle(
                        resolveDotPath(this.options.glossaryData, headerGlossaryPath),
                    )
                ) {
                    throw new Error(
                        `${this.constructor.name}: view '${viewType}' has no header title at '${headerGlossaryPath}'`,
                    );
                }
                const navigationGlossaryPath = `${appId}.nav-cards.element_texts.nav-${viewType}`;
                const title = requireGlossaryTitle(
                    resolveDotPath(this.options.glossaryData, navigationGlossaryPath),
                    navigationGlossaryPath,
                );
                return [
                    viewType,
                    {
                        ...viewData,
                        headerGlossaryPath,
                        containerId: `${appId}-${viewType}-container`,
                        buttonId: `${viewType}ViewButton`,
                        navigationGlossaryPath,
                        label: stripHtmlToText(title),
                    },
                ];
            }),
        );
    }

    /**
     * The resolved view config every view is handed as its `viewConfig` option.
     * @returns {{[viewType: string]: LabelledViewConfigEntry}} View type → resolved entry.
     * @protected
     */
    get viewConfig() {
        return this.#viewConfig;
    }

    // ========================================================================
    // VIEW TRANSITION AND NOTES DRAWER
    // ========================================================================

    /**
     * Before a view shows (after the current one is hidden and its state patch
     * written, before the new one is built): close the tour, and render the shared
     * header for the new view.
     * @param {string} viewType
     */
    async #beforeShowView(viewType) {
        // A tour's steps anchor into the view it was derived from; navigating
        // away invalidates every one of them.
        this.#tutorialController.close();
        // Inside the view's skeleton window: a view that reads the dataset waits for it
        // here, so a deep link to one shows the shell and its placeholder meanwhile.
        if (this.#viewConfig[viewType].needsData !== false && !this.#dataLanded) {
            await this.#headerOrchestrator.updateForView(viewType, { withControls: false });
            await this.#dataReady;
        }
        await this.#headerOrchestrator.updateForView(viewType);
    }

    /**
     * Open or close the notes drawer, importing it on the first call: Quill and the
     * drawer are a chunk most sessions never need. The drawer is one per app (mounted to
     * document.body), so it survives view switches.
     */
    async #toggleNotes() {
        this.#notes ??= import('../modules/notes/notesController.js').then(
            ({ NotesController }) =>
                new NotesController({
                    appId: this.context.appId,
                    dataset: this.context.exportDataset,
                    glossary: this.context.glossary,
                    onActiveChange: (active) =>
                        this.#headerOrchestrator.setActionPressed('notes', active),
                    views: Object.entries(this.#viewConfig).map(([viewType, viewData]) => ({
                        viewType,
                        label: viewData.label,
                    })),
                    // The live module's own targets once the view was built this
                    // session, else none: the drawer asks the user to open the view first.
                    getLinkTargets: (viewType) =>
                        this.#viewLifecycle.getViewModule(viewType)?.getNotesLinkTargets() ?? null,
                    onNavigate: async (viewType) => {
                        // A link chip only shows its module: the writer stays in the editor.
                        await this.showView(viewType, { keepFocus: true });
                        await this.#viewLifecycle.whenViewRevealed(viewType);
                    },
                }),
        );
        try {
            await (await this.#notes).toggle();
        } catch (error) {
            // A failed chunk load (a dropped connection) may succeed on the next click. A
            // drawer that failed to open goes down with its lock, or the next one would
            // queue behind it.
            const notes = this.#notes;
            this.#notes = null;
            notes?.then(
                (controller) => controller.destroy(),
                () => {},
            );
            notifyFailure(
                this.context.glossary,
                'general.messages.notes-failed',
                `${this.constructor.name}: Failed to open the notes drawer`,
                error,
            );
        }
    }

    // ========================================================================
    // LIFECYCLE
    // ========================================================================

    /**
     * Build the app's collaborators from its spec.
     * @override
     */
    _setup() {
        super._setup();
        this.#viewConfig = this.#resolveViewConfig(this.options.views);
        this.#appState = createState(
            /** @type {import('@tba3/module-base').StateInit<TState>} */ ({
                currentView: null,
                previousView: null,
                currentStudentId: null,
                ...this.options.initialState,
            }),
        );
        this.#viewLifecycle = new ViewLifecycle({
            ownerName: this.constructor.name,
            viewConfig: this.#viewConfig,
            resources: this.resources,
            viewOptions: {
                appState: this.#shell,
                comparisonState: this.#comparisonState,
                studentView: this.options.students?.view,
                context: this.context,
            },
            beforeShowView: (viewType) => this.#beforeShowView(viewType),
            isNamedInline: (error) => error !== undefined && error === this.#dataFailure,
        });
        // Its HeaderModule is placed in the app ahead of the view containers.
        this.#headerOrchestrator = new HeaderOrchestrator({
            ownerName: this.constructor.name,
            headerId: `${this.context.appId}-shared-header`,
            headerClassName: `${this.context.appId}-shared-header-container`,
            viewConfig: this.#viewConfig,
            glossaryData: this.options.glossaryData,
            viewControls:
                this.options.headerControls?.({
                    state: this.#appState,
                    datasetOptions: this.options.dataset.options,
                    currentDataset: this.#core.currentDataset,
                    navigate: navigateToScope,
                    documents: this.context.documents,
                    palette: this.context.palette,
                }) ?? {},
            context: this.context,
            onNotesClicked: () => this.#toggleNotes(),
            onInfoClicked: () => this.#handleInfoClicked(),
        });
        this.#tutorialController = new TutorialController({ glossary: this.context.glossary });
        this.#sidebar = new SidebarModule({
            viewConfig: this.#viewConfig,
            resources: this.resources,
            onViewSelected: (viewType) => this.showView(viewType),
            context: this.context,
        });
        // The view indicators follow the committed view.
        this.onChange(
            () => this.#shell.currentView.value,
            (viewType) => {
                if (!viewType) return;
                this.#sidebar.setActiveView(viewType);
            },
        );
    }

    /**
     * Build the shell and show the first view: the app's one content pass.
     * @override
     * @returns {Promise<void>}
     */
    async _renderContent() {
        // The sidebar (beside the app), then in the app the shared header ahead of the
        // view containers.
        this.replaceChildren();
        this.#sidebar.render();
        this.append(this.#headerOrchestrator.header);
        // The first view's import starts here, alongside the JSON fetches below.
        const initialView = this.#viewLifecycle.mount(this, this.options.defaultView);

        // Every document in one parallel start, not awaited: the shell and a view that
        // reads none (the welcome page) show while it runs, and a view that reads the
        // data waits for it in #beforeShowView().
        this.#dataReady = this.context.documents.ensureAll().then(async () => {
            await this.onDataReady();
            this.#dataLanded = true;
        });
        // A failed load is named once, above the views, which stay usable; a view switch
        // it fails then raises no toast repeating it (`isNamedInline`).
        this.#dataReady.catch((error) => {
            this.#dataFailure = error;
            console.error(`${this.constructor.name}: the dataset failed to load:`, error);
            this._showNotice(
                noticeCallout({
                    message: this.#dataFailureMessage(error),
                    role: 'alert',
                    className: 'dashboard-bootstrap-error',
                }),
            );
        });

        await this.initializeComponents();

        this.#sidebar.setupViewNavigation();

        // start() covers the first view synchronously, before its first await, so the
        // shell is ready for the cold-start placeholder to come off.
        const started = this.#viewLifecycle.start(initialView);
        this.#markShellReady();
        await started;
        restoreScopeSwitchFocus();
    }

    /**
     * Start-up of the shell, which reads no document: the header, the batch export
     * toolbar, and the tooltip and glossary popup service, which is one per page and
     * goes down with the app. Override to add components, calling super first.
     * @protected
     */
    async initializeComponents() {
        await this.#headerOrchestrator.init();
        this.#batchToolbar = new BatchExportToolbar({
            host: this,
            context: this.context,
            currentView: this.#shell.currentView,
            onOpenReport: () => void this.showView(REPORT_VIEW_KEY),
        });
        tooltipService.init(this.context.glossary);
        this.resources.trackSubscription(() => tooltipService.dispose());
    }

    /**
     * Start-up that reads the data, once every document has landed (the store has
     * registered the competence-level scales by then): fill the header tokens of the
     * spec's `headerTokens`, show every comparison population of its `comparisonIds` and
     * pick the student the student view opens on. Views that read the data wait for it,
     * so it does no rendering of its own; the header redraws on its tokens by itself.
     * Override to add data-dependent start-up, calling super first.
     * @returns {Promise<void>}
     * @protected
     */
    async onDataReady() {
        const { comparisonIds, students, headerTokens } = this.options;
        if (headerTokens) this.#headerOrchestrator.setTokens(headerTokens(this.context.documents));
        if (comparisonIds) {
            const ids = this.context.documents.getDataset(comparisonIds);
            batch(() => ids.forEach((id) => this.#comparisonState.setActive(id, true)));
        }
        // The student view opens on the first student in selector order (by name) when
        // nothing selected one yet, so the selector and the view start on the same one.
        const student = this.#shell.currentStudentId;
        if (students && student.peek() == null) {
            const records = this.context.documents.getDataset(students.records);
            const first = toStudentSelectItems(records)[0];
            if (first) student.value = first.value;
        }
    }

    /**
     * Name something once, above the views: a callout under the shared header (the
     * dataset failed to load, or a subclass's own notice).
     * @param {import('lit').TemplateResult} callout - A `noticeCallout(...)`.
     * @protected
     */
    _showNotice(callout) {
        const host = document.createElement('div');
        render(callout, host);
        this.#headerOrchestrator.header.after(...host.children);
    }

    /**
     * A dataset that failed to load under a running shell: the dashboard itself is up,
     * and another dataset from the header is the way on. A reload would keep the same
     * `?scope`.
     * @param {unknown} error
     * @returns {string}
     */
    #dataFailureMessage(error) {
        const { glossary, exportDataset } = this.context;
        const text = (/** @type {string} */ key) =>
            glossary.getRequiredEntryText(`general.messages.${key}`);
        return [
            applyTemplateTokens(text('data-load-failed'), { dataset: exportDataset.label }),
            text(loadCauseKey(error)),
            text('load-recovery-switch'),
        ].join(' ');
    }

    /**
     * @override
     */
    _teardown() {
        // The tour overlay lives on document.body and its scroll/resize
        // listeners are on window — neither is reachable from the module tree,
        // so both would outlive the app if a tour were open here.
        this.#tutorialController.close();

        this.#sidebar.destroy();

        this.#viewLifecycle.destroy();

        // The toolbar is no module: it follows the cart until disposed.
        this.#batchToolbar?.dispose();

        // So does the notes drawer, which listens on window; it exists once opened.
        const notes = this.#notes;
        this.#notes = null;
        notes?.then(
            (controller) => controller.destroy(),
            () => {},
        );

        super._teardown();
    }

    // ========================================================================
    // VIEWS
    // The view state machine is ViewLifecycle's; the app forwards a navigation to it.
    // ========================================================================

    /**
     * @param {string} viewType
     * @param {import('./viewLifecycle.js').ShowViewOptions} [options]
     * @returns {Promise<void>}
     */
    async showView(viewType, options = {}) {
        await this.#viewLifecycle.showView(viewType, options);
    }

    // ========================================================================
    // GUIDED WALKTHROUGH
    // ========================================================================

    /**
     * Header info button handler (injected into the HeaderOrchestrator): stop a running
     * tour, or start one of the active view. The button shows pressed while the tour runs.
     */
    #handleInfoClicked() {
        if (this.#tutorialController.isOpen) {
            this.#tutorialController.close();
            return;
        }

        // Steps derive from the view's rendered modules and anchor on its elements: a
        // view still being built or covered would yield a truncated or invisible tour.
        const viewType = /** @type {string} */ (this.#shell.currentView.peek());
        if (!this.#viewLifecycle.isSettled(viewType)) {
            notify(this.context.glossary.getRequiredEntryText('general.messages.tour-busy'));
            return;
        }

        const steps = buildTourSteps(
            /** @type {BaseViewModule} */ (this.#viewLifecycle.getViewModule(viewType)),
            { glossaryData: this.options.glossaryData, glossary: this.context.glossary },
            this.#viewConfig[viewType].headerGlossaryPath,
            this.#headerOrchestrator.tokens,
        );

        if (steps.length === 0) {
            console.warn(`${this.constructor.name}: No tour steps for view '${viewType}'`);
            return;
        }

        this.#headerOrchestrator.setActionPressed('info', true);
        this.#tutorialController.start(steps, {
            onClose: () => this.#headerOrchestrator.setActionPressed('info', false),
        });
    }

    // ========================================================================
    // PUBLIC API
    // ========================================================================

    /**
     * The shared app state, one signal per key; every view gets it as its `appState`
     * option.
     * @returns {import('@tba3/module-base').State<TState>}
     */
    get appState() {
        return this.#appState;
    }

    /**
     * Resolves once the shell (sidebar, header, router) is up and the first view is
     * covered by its placeholder — before its data or its render.
     * @returns {Promise<void>}
     */
    whenShellReady() {
        return this.#shellReady;
    }
}
