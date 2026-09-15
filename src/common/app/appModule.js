/**
 * BaseAppModule — abstract coordinator each dashboard's app module extends.
 *
 * Owns the app state, the lazy-loaded view modules and their switching, hash routing,
 * the shared header and sidebar, and the DataStore. Subclasses supply the view map,
 * the initial state, the per-view header configs and the header hooks. Read this file
 * before changing app-level behaviour — it centralizes a lot.
 */

import { AppState } from './appState.js';
import { comparisonStateFromAppState } from './appComparisonState.js';
import { BaseViewModule } from '../modules/baseViewModule.js';
import { HeaderOrchestrator } from '../modules/header/headerOrchestrator.js';
import { NotesController } from '../modules/notes/notesController.js';
import { SidebarModule } from '../modules/sidebarModule.js';
import { buildTourSteps } from '../modules/tutorial/tourStepBuilder.js';
import { TutorialController } from '../modules/tutorial/tutorialController.js';
import { ViewLifecycle } from './viewLifecycle.js';
import { ViewRouter } from './viewRouter.js';
import { initializeBatchExportToolbar } from '../export/batchExportToolbar.js';
import {
    MISSING_GLOSSARY_TITLE,
    resolveDotPath,
    resolveGlossaryTitle,
    stripHtmlToText,
} from '@tba3/module-base';
import { buildCompetenceLevelGlossaryEntries, glossaryAnnotator } from '@tba3/modules/glossary';
import { tooltipService } from '@tba3/modules/tooltips';
import { DataStore } from '../services/dataStore.js';

/**
 * View configuration structure
 * @typedef {object} ViewConfigEntry
 * @property {string} containerId - ID for the view's container element (required)
 * @property {string} buttonId - ID for the sidebar navigation button (required)
 * @property {string} icon - Material Symbols icon name for the sidebar button and view title (required)
 * @property {() => Promise<typeof BaseViewModule>} load - Lazy loader resolving to the view module class (required)
 * @property {string} navigationGlossaryPath - Glossary entry whose `title` names the view in the sidebar, nav cards, notes, report and help (required)
 * @property {boolean} [sidebarPinBottom] - Pin this button to the bottom of the sidebar (optional)
 * @property {string} [skeleton] - Loading placeholder shape: stack | rows | split | triple | grid (optional, defaults to stack)
 */

/**
 * A view config entry after configure(): `label` is its glossary title.
 * @typedef {ViewConfigEntry & {label: string}} LabelledViewConfigEntry
 */

export class BaseAppModule extends BaseViewModule {
    // View state machine collaborator (container/module slots, transitions,
    // queued navigation, rollback, prewarm, theme-stale tracking).
    /** @type {ViewLifecycle} */
    #viewLifecycle;

    // Shared app state (keyed state bag + comparison verbs), built in configure()
    /** @type {AppState} */
    #appState;
    /** @type {import("@tba3/modules/common/charts/comparisonState.js").ComparisonState} */
    #comparisonState;

    // Hash-based view router (URL <-> active view sync)
    /** @type {ViewRouter} */
    #router;

    // Configuration - must be set by subclass
    /** @type {{viewConfig: {[viewType: string]: LabelledViewConfigEntry}, defaultView?: string, sidebarConfig?: object, headerContainerId?: string}} */
    #config;

    // Header/control orchestration collaborator (owns the HeaderModule, per-view
    // header configs, glossary resolution, control building, and render-skip).
    /** @type {HeaderOrchestrator|null} */
    #headerOrchestrator = null;

    // Per-view notes drawer (rich-text, in-memory only; see src/common/modules/notes/)
    /** @type {NotesController|null} */
    #notesController = null;

    // Guided walkthrough engine, shared by every view: the header info button
    // starts a tour derived from the active view's module tree. A plain
    // page-lifetime singleton (like the notes drawer), so it survives view
    // switches; see src/common/modules/tutorial/.
    /** @type {TutorialController} */
    #tutorialController = new TutorialController();

    // Shared data store for raw data and cached transformations
    /** @type {DataStore} */
    #dataStore;

    // Sidebar chrome collaborator (nav sidebar + KS theme picker).
    // It renders the nav buttons, so it also owns their click wiring and their
    // active state — see SidebarModule.setupViewNavigation/setActiveView.
    /** @type {SidebarModule|null} */
    #sidebar = null;

    // ========================================================================
    // CONFIGURATION (must be called by subclass constructor)
    // ========================================================================

    /**
     * Configure the app module with domain-specific settings
     * Must be called by subclass constructor after super()
     * @param {object} config - Configuration object with viewConfig, sidebarConfig, defaultView
     * @param {{[viewType: string]: ViewConfigEntry}} config.viewConfig - View configuration entries
     * @param {string} [config.defaultView] - Default view id shown on initial load
     * @protected
     */
    configure(config) {
        // Validate viewConfig structure
        this.#validateViewConfig(config.viewConfig);

        // Every consumer of a view's name (sidebar, notes, report caption, MA help
        // back-link) reads `label`; resolving it here from the glossary keeps them
        // on the one name the nav cards show too.
        this.#config = {
            ...config,
            viewConfig: this.#labelViewConfig(config.viewConfig),
        };

        // Initialize state. Built here rather than as a field initializer: it seeds
        // from the subclass's getInitialState(), which does not exist before super()
        // has returned.
        this.#appState = new AppState({ initialState: this.getInitialState() });
        this.#comparisonState = comparisonStateFromAppState(this.#appState);

        // Create the view lifecycle collaborator. Everything app-owned that a
        // transition touches is injected: the current-view state (kept here,
        // because header controls read it through getStateValue), the subclass
        // pre/post-show hooks, sidebar + URL activation, view construction, and
        // child teardown. A queued navigation is dispatched through the public
        // showView() so subclass overrides still run for it.
        this.#viewLifecycle = new ViewLifecycle({
            ownerName: this.constructor.name,
            viewConfig: this.#config.viewConfig,
            resources: this.resources,
            getCurrentView: () => this.#appState.getStateValue('currentView'),
            setCurrentView: (viewType) => {
                this.#appState.updateState({ currentView: viewType });
            },
            initializeView: (viewType, container) => this.initializeView(viewType, container),
            beforeShowView: (viewType, options) => this.beforeShowView(viewType, options),
            afterShowView: (viewType, context) => this.afterShowView(viewType, context),
            onViewActivated: (viewType, { replace }) => {
                this.#sidebar?.setActiveView(viewType);
                this.#router?.syncUrl(viewType, { replace });
            },
            navigate: (viewType, options) => this.showView(viewType, options),
        });

        // Set default view in options if not already set
        if (!this.options.defaultView) {
            this.setOptions({ defaultView: config.defaultView });
        }

        // Create shared data store for raw data + transformation cache
        this.#dataStore = new DataStore();

        // Create the hash-based view router. Driven by showView(); routes
        // back/forward and manual URL edits back into showView().
        this.#router = new ViewRouter(Object.keys(this.#config.viewConfig), (viewType) =>
            this.showView(viewType),
        );

        // App-wide notes drawer. A plain singleton (not a BaseModule child, mounted
        // to document.body) so it survives view switches; the header's notes button
        // toggles it, and it keeps the header button's pressed-state in sync when
        // closed from its own close button/Escape. Its "link to module" control
        // enumerates a view's modules — which only exist once that view has
        // rendered, so the drawer lists only views opened this session — and a
        // chip click navigates to the linked module's view before that module
        // is highlighted.
        this.#notesController = new NotesController({
            appId: this.getContainerClassPrefix(),
            onActiveChange: (active) => this.getHeaderModule()?.setNotesActive(active),
            getLinkTargets: (viewType) => this.#viewLifecycle.getNotesLinkTargets(viewType),
            isViewLive: (viewType) => Boolean(this.#viewLifecycle.getViewModule(viewType)),
            onNavigate: async (viewType) => {
                await this.showView(viewType);
                await this.#viewLifecycle.whenViewRevealed(viewType);
            },
        });
        this.#notesController.setViews(
            Object.entries(this.#config.viewConfig).map(([viewType, viewData]) => ({
                viewType,
                label: viewData.label,
            })),
        );

        // Create the header/control orchestration collaborator. Constructed here
        // (not at render) so it exists before setViewHeaderConfigs() — which some
        // subclasses call from their constructor. The HeaderModule itself is built
        // later, in init(), once its container exists. The glossary getter and the
        // notes/info toggles are injected; per-control state injection and change
        // reactions travel with the control definitions themselves
        // (src/{en,ma,sl}/*HeaderControls.js).
        // The HeaderModule is registered as an app child so cleanup still
        // cascades through this coordinator's teardown.
        this.#headerOrchestrator = new HeaderOrchestrator({
            ownerName: this.constructor.name,
            headerContainerId: this.#config.headerContainerId ?? null,
            viewConfig: this.#config.viewConfig,
            getGlossaryData: () => this.getOption('glossaryData') ?? null,
            onNotesToggled: () => this.#notesController?.toggle(),
            onInfoToggled: (data) => this.#handleInfoToggled(data),
            registerChildModule: (module) => this.registerChildModule(module),
        });
    }

    /**
     * Set view-specific header configurations.
     * Called by the subclass constructor after configure(), or from initializeComponents().
     * @param {{[viewType: string]: object}} viewHeaderConfigs - Map of viewType -> header config
     * @protected
     */
    setViewHeaderConfigs(viewHeaderConfigs) {
        this.#headerOrchestrator?.setViewHeaderConfigs(viewHeaderConfigs);
    }

    /**
     * Validate viewConfig structure
     * @param {{[viewType: string]: ViewConfigEntry}} viewConfig - View configuration object
     */
    #validateViewConfig(viewConfig) {
        if (!viewConfig || typeof viewConfig !== 'object') {
            throw new Error(`${this.constructor.name}: viewConfig must be an object`);
        }

        // 'load' is validated here rather than at navigation time: a view whose
        // loader is missing can only fail once the user tries to open it, which
        // is far from the typo that caused it.
        const requiredFields = [
            'containerId',
            'buttonId',
            'icon',
            'navigationGlossaryPath',
            'load',
        ];

        Object.entries(viewConfig).forEach(([viewType, viewData]) => {
            const missingFields = requiredFields.filter((field) => !viewData[field]);
            if (missingFields.length > 0) {
                throw new Error(
                    `${this.constructor.name}: viewConfig.${viewType} missing required fields: ${missingFields.join(', ')}`,
                );
            }
            // Present but not callable (a bare module path, an already-started
            // `import(...)`) would otherwise slip past this check and only fail
            // at navigation — the deferral this validation exists to prevent.
            if (typeof viewData.load !== 'function') {
                throw new Error(
                    `${this.constructor.name}: viewConfig.${viewType}.load must be a function resolving to the view module class`,
                );
            }
        });
    }

    /**
     * Copy the view config with each view's `label` resolved from its glossary title.
     * @param {{[viewType: string]: ViewConfigEntry}} viewConfig - The validated view config
     * @returns {{[viewType: string]: LabelledViewConfigEntry}} The same entries, each with `label`
     */
    #labelViewConfig(viewConfig) {
        const glossaryData = this.getOption('glossaryData') ?? null;
        return Object.fromEntries(
            Object.entries(viewConfig).map(([viewType, viewData]) => {
                const title = resolveGlossaryTitle(
                    resolveDotPath(glossaryData, viewData.navigationGlossaryPath),
                );
                const label = title ? stripHtmlToText(title) : MISSING_GLOSSARY_TITLE;
                return [viewType, { ...viewData, label }];
            }),
        );
    }

    // ========================================================================
    // ABSTRACT METHODS (must be implemented by subclass)
    // ========================================================================

    /**
     * Get the initial state for this app module
     * @abstract
     * @returns {object} Initial state object
     * @protected
     */
    getInitialState() {
        return { currentView: null };
    }

    /**
     * Get the CSS class prefix for view containers (e.g., 'en', 'ma', 'sl')
     * @abstract
     * @returns {string} CSS class prefix
     * @protected
     */
    getContainerClassPrefix() {
        return 'app';
    }

    /**
     * Get the shared DataStore instance.
     * Modules use this to access raw data and cached transformations.
     * @returns {DataStore} The shared store holding raw data and cached transformations.
     * @protected
     */
    get dataStore() {
        return this.#dataStore;
    }

    /**
     * Get options to pass when creating view modules
     * @param {string} viewType - The view type being initialized
     * @returns {object} Options object for the view module constructor
     * @protected
     */
    // eslint-disable-next-line no-unused-vars
    getViewModuleOptions(viewType) {
        return {
            appState: this.#appState,
            comparisonState: this.#comparisonState,
            glossaryData: this.getOption('glossaryData') ?? null,
            onNavigate: (view, opts) => this.showView(view, opts),
            dataStore: this.#dataStore,
            viewConfig: this.#config.viewConfig,
        };
    }

    /**
     * Hook called before showing a view (after hiding current, before initializing new).
     * Default implementation updates the shared header for the new view.
     * Override for additional pre-show logic; call super to keep header updates.
     *
     * Runs only when a transition actually dispatches — a showView() call that
     * arrives mid-transition is queued and reaches this hook later, with its own
     * options. So state derived from `options` (MA's layout mode) belongs here,
     * not in a showView() override, where it would be applied at queue time.
     * @param {string} viewType - The view type being shown
     * @param {object} options - Options passed to showView
     * @protected
     */
    // eslint-disable-next-line no-unused-vars
    async beforeShowView(viewType, options) {
        // A tour's steps anchor into the view it was derived from; navigating
        // away invalidates every one of them.
        this.closeTour();
        await this.updateHeaderForView(viewType);
    }

    /**
     * Hook called after a view is shown. Default implementation switches the
     * notes drawer's active tab to follow the dashboard view.
     * Override for additional post-show logic; call super to keep the notes sync.
     * @param {string} viewType - The view type that was shown
     * @param {{previousView: string|null}} [context] - The view that was current before this switch (null on first show)
     * @protected
     */
    // eslint-disable-next-line no-unused-vars
    afterShowView(viewType, context = { previousView: null }) {
        this.#notesController?.setActiveView(viewType);
    }

    // ========================================================================
    // STATE
    // ========================================================================

    /**
     * Get current view
     *
     * The one state key the app reads for itself: routing, the sidebar and the
     * tour all ask which view is live. Everything else reaches state through
     * the `appState` accessor.
     * @returns {string|null} Current view type
     */
    getCurrentView() {
        return this.#appState.getStateValue('currentView');
    }

    // ========================================================================
    // MODULE LIFECYCLE
    // ========================================================================

    /**
     * Default assignId to true (extends BaseViewModule, needs container ID).
     * @override
     */
    validateContainer({ assignId = true } = {}) {
        return super.validateContainer({ assignId });
    }

    /**
     * Render the app module
     * @override
     * @param {object} data - Application data
     * @returns {Promise<void>}
     */
    async _doRender(data = {}) {
        if (!this.#config) {
            throw new Error(
                `${this.constructor.name}[${this.id}]: configure() must be called before render()`,
            );
        }

        // Store app data
        this.setData(data);

        // The glossary is the source of every label the chrome below renders (sidebar
        // nav names, header button names, the batch toolbar), so it comes up first.
        this.#initializeGlossary();

        // Create DOM structure (view containers)
        this.createViewContainers();

        // Resolve the initial view now — a deep-linked view from the URL hash if
        // present and valid, otherwise the default. getViewFromLocation() only
        // reads the hash, so it needs neither app data nor a started router.
        const initialView = this.#router.getViewFromLocation() || this.options.defaultView;

        // Kick the initial view's dynamic import() before the data init, so its
        // module graph downloads in parallel with the JSON fetches instead of
        // waiting for them to finish first. The module system caches the promise,
        // so initializeView()'s own await resolves immediately.
        this.#viewLifecycle.warmUpViewImport(initialView);

        // Hook for subclasses to initialize components (e.g., header, sidebar)
        await this.initializeComponents();

        // Wire the sidebar nav buttons to view switching
        this.#sidebar?.setupViewNavigation();

        // Set up the sidebar KS color-theme picker
        this.#sidebar?.setupThemeControls();

        // Start the router and show the initial view (already resolved above;
        // start() does not change the hash).
        this.#router.start();
        await this.showView(initialView, { replaceHistory: true });

        // Warm the remaining views' module graphs once the first view is actually
        // uncovered — showView() resolves before revealView() finishes its settle
        // wait, so an idle callback armed here could otherwise fire (or hit its
        // timeout) while the first view is still measuring tables and put the
        // other views' parse/evaluate on the main thread mid-reveal. Asked through
        // whenViewRevealed() so this shares its fail-safe: a first render that
        // never reveals must not cost the app its prefetch forever.
        await this.#viewLifecycle.whenViewRevealed(initialView);
        this.#viewLifecycle.prefetchOtherViewModules(initialView);
    }

    /**
     * Hook for subclasses to initialize additional components after DOM is created.
     * Default implementation initializes the shared header (if headerContainerId is set).
     * Override to add extra components (e.g., SL's NavCardModule), but call super.
     * @protected
     */
    async initializeComponents() {
        await this.initializeHeader();
        initializeBatchExportToolbar();
        this.initializePageInteractions();
    }

    /**
     * Initialize page-lifetime delegated tooltip and glossary popup services.
     * Runs before any view is shown; the annotator itself is up since _doRender().
     * @protected
     */
    initializePageInteractions() {
        tooltipService.setupDelegatedTooltips();
        if (!glossaryAnnotator.isInitialized) return;

        // Competence-level texts come from the payload, not `glossary.json` — the scales
        // vary by state, so the client cannot hold them all. Safe here because every app
        // registers its scales before calling up into this method.
        glossaryAnnotator.registerPayloadEntries(buildCompetenceLevelGlossaryEntries());

        tooltipService.initGlossaryPopups();
    }

    /**
     * Bring the glossary annotator up against this app's assembled tree, before any
     * chrome that reads copy from it is built.
     */
    #initializeGlossary() {
        const glossaryData = this.getOption('glossaryData') ?? null;
        const glossaryNamespace = this.getContainerClassPrefix();
        if (!glossaryData || !glossaryNamespace) return;

        glossaryAnnotator.init(glossaryData, glossaryNamespace);
        if (!glossaryAnnotator.isInitialized) {
            console.warn(
                `${this.constructor.name}: glossary interactions disabled for namespace '${glossaryNamespace}'`,
            );
        }
    }

    /**
     * Creates the DOM structure with view containers
     * Subclasses can override createHeaderElements() to add elements before view containers
     * Subclasses can override createFooterElements() to add elements after view containers
     * @protected
     */
    createViewContainers() {
        const container = this.container;
        if (!container) return;
        // Clear container
        container.innerHTML = '';

        // Hook for subclasses to add header/other elements before view containers
        this.createHeaderElements();

        // Create view containers
        this.#viewLifecycle.createContainers(container);

        // Hook for subclasses to add footer/other elements after view containers
        this.createFooterElements();
    }

    /**
     * Hook for subclasses to create header or other elements before view containers
     * Called by createViewContainers() after clearing the container
     * Automatically generates sidebar and shared header container (if headerContainerId is set)
     * @protected
     */
    createHeaderElements() {
        // Build the sidebar chrome (nav sidebar + KS theme picker).
        // A has-a collaborator: it owns its own DOM, using our resource tracker
        // for listener cleanup and calling back to refresh the active view's charts
        // on a theme switch. The theme-picker wiring runs later, once the DOM exists.
        this.#sidebar = new SidebarModule({
            sidebarConfig: this.#config.sidebarConfig ?? null,
            viewConfig: this.#config.viewConfig,
            defaultView: this.options.defaultView,
            resources: this.resources,
            onThemeChanged: () => this.refreshThemeInCurrentView(),
            onViewSelected: (viewType) => this.showView(viewType),
        });
        this.#sidebar.render();

        // Create shared header container (if configured)
        const headerContainerId = this.#config.headerContainerId;
        if (headerContainerId) {
            const prefix = this.getContainerClassPrefix();
            const headerContainer = document.createElement('div');
            headerContainer.id = headerContainerId;
            headerContainer.className = `${prefix}-shared-header-container`;
            this.container?.appendChild(headerContainer);
        }
    }

    /**
     * Hook for subclasses to create footer or other elements after view containers
     * Called by createViewContainers() after creating all view containers
     * @protected
     */
    createFooterElements() {
        // Override in subclass to add footer elements
    }

    // ========================================================================
    // VIEW MANAGEMENT
    // The view state machine — container/module slots, lazy initialization,
    // the transition lock and its single-slot navigation queue, rollback after
    // a failed switch, the notes drawer's off-screen prewarm, and theme-stale
    // tracking — is owned by the ViewLifecycle collaborator
    // (src/common/app/viewLifecycle.js). The methods below are thin
    // forwarders that preserve the contract used by subclasses (showView /
    // isTransitioning / getViewModule …) and by the sidebar and notes drawer;
    // initializeView() stays here because it is where the app's own
    // dependencies (view options, child registration) are applied.
    // ========================================================================

    /**
     * Refresh the currently active view after a KS color-theme switch (delegates
     * to the view lifecycle, which also remembers the hidden views that missed it).
     */
    refreshThemeInCurrentView() {
        this.#viewLifecycle.refreshThemeInCurrentView();
    }

    /**
     * Show a specific view
     * @param {string} viewType - View type key
     * @param {object} options - Optional view options
     * @returns {Promise<void>}
     */
    async showView(viewType, options = {}) {
        await this.#viewLifecycle.showView(viewType, options);
    }

    /**
     * Construct, initialize and register a view module (lazy loading). Called by
     * the view lifecycle, which owns the slot the instance is stored in.
     *
     * Every failure below throws rather than returning: showView() decides
     * what a failed load means (rethrow on cold start so bootstrap renders
     * its error panel, roll back to the previous view otherwise). Returning
     * quietly would let showView() continue past the failure and commit
     * currentView, the URL and the nav buttons to a view with no module.
     * @param {string} viewType - View type
     * @param {HTMLElement} container - The view's container element
     * @returns {Promise<BaseViewModule>} The initialized, registered view module
     * @protected
     */
    async initializeView(viewType, container) {
        const viewData = this.#config.viewConfig[viewType];
        if (!viewData) {
            throw new Error(`${this.constructor.name}: No view configured for '${viewType}'`);
        }

        const ModuleClass = await viewData.load();
        if (typeof ModuleClass !== 'function') {
            throw new Error(
                `${this.constructor.name}: load() for view '${viewType}' did not resolve to a module class`,
            );
        }

        // Get view-specific options from subclass
        const viewOptions = this.getViewModuleOptions(viewType);

        // Create view module instance
        const viewModule = new ModuleClass(`${viewType}-module`, container, {
            ...viewOptions,
            skeleton: viewData.skeleton,
        });

        // Initialize with app data. If init() throws, destroy the half-built
        // instance before rethrowing: it was never stored or registered, so its
        // tracked listeners, observers and subscriptions would otherwise stay
        // live and a retry would stack a second set. Safe now that destroy()
        // clears (rather than removes) a container-owned element, so the view
        // container survives for the rollback and any later retry.
        const appData = this.getData();
        try {
            await viewModule.init(appData);
        } catch (error) {
            viewModule.destroy();
            throw error;
        }

        this.registerChildModule(viewModule);
        return viewModule;
    }

    // ========================================================================
    // SHARED HEADER LIFECYCLE
    // Header creation, per-view updates, control-state injection, and
    // control-changed dispatch are owned by the HeaderOrchestrator collaborator
    // (src/common/modules/header/headerOrchestrator.js). The methods below are
    // thin forwarders that preserve the protected contract used by subclasses
    // (setViewHeaderConfigs / getHeaderModule) and internal callers
    // (initializeHeader / updateHeaderForView). Per-control state injection and
    // change reactions are declared on the control definitions themselves
    // (src/{en,ma,sl}/*HeaderControls.js).
    // ========================================================================

    /**
     * Initialize the shared header module (delegates to the orchestrator).
     * Called by the default initializeComponents() implementation.
     * @protected
     */
    async initializeHeader() {
        await this.#headerOrchestrator?.init();
    }

    /**
     * Update header content for a specific view (delegates to the orchestrator).
     * @param {string} viewType - View type identifier
     * @protected
     */
    async updateHeaderForView(viewType) {
        await this.#headerOrchestrator?.updateForView(viewType);
    }

    /**
     * Get the shared header module instance.
     * Subclasses may need this for direct header access (e.g., setNotesActive/setInfoActive).
     * @returns {import('../modules/header/headerModule.js').HeaderModule|null} The shared header, or null before the orchestrator has created it.
     * @protected
     */
    getHeaderModule() {
        return this.#headerOrchestrator?.getHeaderModule() ?? null;
    }

    /**
     * Get the view header configurations.
     * @param {string} [viewType] - Optional specific view type
     * @returns {object} Full config map (no arg) or single view config
     * @protected
     */
    getViewHeaderConfig(viewType) {
        if (!this.#headerOrchestrator) return viewType ? null : {};
        return this.#headerOrchestrator.getViewHeaderConfig(viewType);
    }

    /**
     * The accessor core every app's header-control context shares — plain
     * functions only, so the *HeaderControls.js modules stay testable with a
     * stub instead of an app instance. Subclasses spread their app-specific
     * members (datasetOptions, currentDataset, navigate, extra getters) on top.
     * @param {object} [extras] - App-specific context members
     * @returns {object} The context handed to the app's build*ViewHeaderConfigs()
     * @protected
     */
    _buildHeaderControlContext(extras = {}) {
        return {
            getStateValue: (key) => this.#appState.getStateValue(key),
            updateState: (patch) => this.#appState.updateState(patch),
            ...extras,
        };
    }

    // ========================================================================
    // GUIDED WALKTHROUGH
    //
    // The header info button starts and stops a tour of the active view. Steps
    // are derived from that view's module tree (tourStepBuilder.js), so a view
    // needs no tour code of its own — and a view whose glossary carries no
    // tutorial copy yields no steps and simply doesn't start one.
    // ========================================================================

    /**
     * Close any open tour and release the header button. No-op when no tour is
     * running.
     * @protected
     */
    closeTour() {
        this.#tutorialController.close();
    }

    /**
     * Header info button handler (injected into the HeaderOrchestrator).
     * @param {{active: boolean}} data - Whether the walkthrough is being started or stopped.
     */
    #handleInfoToggled(data) {
        if (data?.active !== true) {
            this.closeTour();
            return;
        }

        // Steps are derived from the view's registered modules, so a click that
        // lands while the view is still initializing would yield a tour of
        // whatever happened to be registered so far. The reveal window counts
        // too: showView() clears isTransitioning before revealView() finishes,
        // and until it does the container is still covered (RENDERING_ATTRIBUTE
        // → visibility: hidden), so a tour started there would spotlight
        // elements the user cannot see. Refuse in both windows rather than run a
        // truncated or invisible walkthrough.
        const viewType = this.getCurrentView();
        const stillRendering = viewType
            ? this.getViewContainer(viewType)?.hasAttribute(BaseViewModule.RENDERING_ATTRIBUTE) ===
              true
            : false;
        if (this.#viewLifecycle.isTransitioning || stillRendering) {
            this.getHeaderModule()?.setInfoActive(false);
            return;
        }

        const view = viewType
            ? /** @type {import('../modules/baseViewModule.js').BaseViewModule|null} */ (
                  this.getViewModule(viewType)
              )
            : null;
        const steps =
            view && viewType
                ? buildTourSteps(view, {
                      glossaryData: this.getOption('glossaryData') ?? null,
                      headerPath: this.getViewHeaderConfig(viewType)?.glossaryPath ?? null,
                  })
                : [];

        if (steps.length === 0) {
            console.warn(`${this.constructor.name}: No tour steps for view '${viewType}'`);
            this.getHeaderModule()?.setInfoActive(false);
            return;
        }

        this.#tutorialController.start(steps, {
            onClose: () => this.getHeaderModule()?.setInfoActive(false),
        });
    }

    /**
     * The shared app state every view, child module and chart config is handed as
     * the `appState` option.
     * @returns {AppState} The app's state collaborator
     */
    get appState() {
        return this.#appState;
    }

    /**
     * Get view container by view type
     * @param {string} viewType - View type
     * @returns {HTMLElement|null} View container element
     * @protected
     */
    getViewContainer(viewType) {
        return this.#viewLifecycle.getViewContainer(viewType);
    }

    /**
     * Get view module by view type
     * @param {string} viewType - View type
     * @returns {import('@tba3/module-base/modules/baseModule.js').BaseModule|null} View module instance
     * @protected
     */
    getViewModule(viewType) {
        return this.#viewLifecycle.getViewModule(viewType);
    }

    /**
     * @override
     */
    destroy() {
        // The tour overlay lives on document.body and its scroll/resize
        // listeners are on window — neither is reachable from the module tree,
        // so both would outlive the app if a tour were open here.
        this.closeTour();

        // Remove sidebar from document.body
        this.#sidebar?.destroy();

        if (this.#router) {
            this.#router.destroy();
        }

        super.destroy();
    }
}
