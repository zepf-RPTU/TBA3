/**
 * moduleRuntime — the host services `ContentModule` reads from its context (export, text
 * decoration) and their no-op defaults. A value handed down, not an
 * import: a static import would make every optional feature a hard dependency of the
 * base class.
 */

/**
 * One table of a module's data export: its serialised text and the title that names it
 * once a file holds several.
 * @typedef {object} ExportDataBlock
 * @property {string} title - What the table is called, as the screen names it.
 * @property {string} text - The table as CSV or JSON.
 */

/**
 * The module behind an export target: the element a capture clones, the three methods
 * an export service calls on it for what a plain DOM clone cannot carry, and the settle
 * wait between opening it and cloning it. `BaseModule` implements all of them, the three
 * hooks forwarding to its children.
 * @typedef {HTMLElement & {
 *   prepareExportCapture: () => () => void,
 *   prepareExportClone: (cloneOf: (live: Element) => Element|null) => void,
 *   getExportDataText: (format: 'csv'|'json') => ExportDataBlock[],
 *   whenSettled: () => Promise<void>,
 * }} ExportableModule
 */

/**
 * What a module offers for export, and what a registered export service receives. The
 * service names the target from `moduleId` and `identity`: one id per thing exported.
 * @typedef {object} ExportControlDefinition
 * @property {string} moduleId - The module's id.
 * @property {string|Array<string|number|null|undefined>|null} identity - What the module shows now, beyond itself (`getExportIdentity()`).
 * @property {string} title - Human-readable label for metadata and file names.
 * @property {ExportType} type
 * @property {string|null} [view] - The key of the view the module sits in (`viewKey` option): a key, never the view's label.
 * @property {ExportableModule} module
 */

/**
 * What a module exports as: `'table'` offers its data (CSV, JSON) beside a PDF,
 * `'visual'` a captured image (PDF, PNG, JPG), `'chart'` both: the image and the data
 * it shows.
 * @typedef {'table'|'visual'|'chart'} ExportType
 */

/**
 * A module's export controls, as a registered export service hands them back.
 * @typedef {object} ModuleExportControl
 * @property {() => unknown} template - The controls, a lit value; the signals it reads re-render the toolbar.
 * @property {(definition: ExportControlDefinition) => void} update - Follow a changed definition.
 * @property {() => void} dispose - Let the module go: a batch capture still running is then not ticked.
 */

/** @type {{createModuleExportControl: (definition: ExportControlDefinition) => ModuleExportControl}} */
const NOOP_EXPORT_SERVICE = Object.freeze({
    createModuleExportControl: () => ({ template: () => null, update() {}, dispose() {} }),
});

/**
 * The services a module reads from its context's `runtime`, and the no-op defaults it
 * falls back to without one: export does nothing and text is not decorated.
 */
export const DEFAULT_RUNTIME = Object.freeze({
    exportService: NOOP_EXPORT_SERVICE,
    /**
     * Decorate rendered copy; the default is identity. Takes and returns HTML: callers
     * escape data before handing it over.
     * @type {(html: string) => string}
     */
    decorateText: (html) => html,
});

/**
 * The host services a module reads; see `DEFAULT_RUNTIME` for each member.
 * @typedef {typeof DEFAULT_RUNTIME} ModuleRuntime
 */
