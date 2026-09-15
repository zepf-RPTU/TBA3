/**
 * moduleRuntime — the host-settable defaults a module falls back to when its
 * options carry no service.
 *
 * `BaseModule` and `ContentModule` have always resolved their services from
 * `options.<service> ?? <singleton>`. The seam was real, but the fallback was a
 * static `import` of the singleton, which made every optional feature a hard
 * dependency of the base class: importing `contentModule.js` pulled the export
 * pipeline, and with it the hash router, the competence palette and Tabulator —
 * whether or not a card ever opted into export.
 *
 * Here the fallback becomes a value the *host* sets once, defaulting to a no-op.
 * A dashboard registers the real services in `bootstrapDashboardApp.js`; a
 * consumer that wants none registers nothing and the features stay absent
 * rather than inert-but-loaded. Per-instance `options.<service>` still wins, so
 * a test can hand one module a mock without touching the runtime.
 *
 * Why a host-set default rather than threading the services through
 * `BaseModule._childOptions()`: `_childOptions()` is rooted in an app module, and
 * a module used standalone has no app or view tree above it to thread anything.
 */

/** @type {{createModuleExportButton: (definition: object, options: object) => void, removeModuleExportButton: (container: HTMLElement|null) => void}} */
const NOOP_EXPORT_SERVICE = Object.freeze({
    createModuleExportButton() {},
    removeModuleExportButton() {},
});

/**
 * The defaults a module gets before any host registers anything: export does
 * nothing, and a target id names the module alone.
 */
const DEFAULTS = Object.freeze({
    exportService: NOOP_EXPORT_SERVICE,
    /**
     * Decorate rendered copy — tba3 registers the glossary annotator, which wraps
     * known terms in the spans its delegated popup listens for. The default is
     * identity: a consumer without a glossary reads plain text, and the annotator
     * (with its compiled alias regex and term cache) stays out of the graph.
     * Takes and returns HTML: callers escape data before handing it over.
     * @type {(html: string) => string}
     */
    decorateText: (html) => html,
    /** @type {(moduleId: string, identity?: string|Array<string|number|null|undefined>|null) => string} */
    buildExportTargetId: (moduleId) => `module-${moduleId}`,
});

/** @type {typeof DEFAULTS} */
let runtime = { ...DEFAULTS };

/**
 * Register the services modules should fall back to. Merges, so a host can
 * register capabilities as it initialises them. Call before constructing any
 * module — a module resolves its services once, at construction.
 * @param {Partial<typeof DEFAULTS>} services - The services to register; keys left out keep their current value.
 */
export function configureModuleRuntime(services) {
    runtime = { ...runtime, ...services };
}

/**
 * The currently registered services.
 * @returns {typeof DEFAULTS} The service bundle a module falls back to.
 */
export function moduleRuntime() {
    return runtime;
}
