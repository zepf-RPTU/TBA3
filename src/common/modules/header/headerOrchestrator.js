/**
 * HeaderOrchestrator — the glue between an app coordinator's per-view config and the
 * shared `HeaderModule`.
 *
 * Creates and holds the `HeaderModule`, stores the per-view header configs, resolves
 * glossary-driven header text and control-interface labels, builds per-view control
 * definitions with live app state injected, keeps the no-op render-skip signature
 * cache, and dispatches control changes back to the control that declared them. A plain
 * collaborator the coordinator *has*, not a `BaseModule` subclass: every app dependency
 * is injected, so the app keeps its extension contract while the coordinator shrinks to
 * coordination.
 *
 * A control definition is self-contained: alongside `type`/`id`/`options` it may declare
 * `injectState(control)` and `onChange(data)`, both closing over their app's
 * control context — see the per-app `src/{en,ma,sl}/*HeaderControls.js` builders. The
 * orchestrator strips both callbacks off the clone before it reaches the `HeaderModule`,
 * so rendering, and the render-skip signature, see plain data.
 *
 * The `HeaderModule` is registered as a child of the *app* through the injected
 * `registerChildModule`, so cleanup cascades through the coordinator's teardown.
 * @module headerOrchestrator
 */

import { HeaderModule } from './headerModule.js';
import {
    MISSING_GLOSSARY_TITLE,
    resolveDotPath,
    resolveGlossaryTitle,
    stripHtmlToText,
} from '@tba3/module-base';

/**
 * Plain-text label for a glossary `interface` entry — its `label` field, with
 * markup stripped so the result is safe as an attribute value or button label.
 * @param {object|null} entry - The glossary interface sub-entry, or null when there is none.
 * @param {string} [fallback=''] - Returned when the entry is missing or carries no text.
 * @returns {string} The label, with any markup removed.
 */
function getGlossaryInterfaceLabel(entry, fallback = '') {
    if (!entry || typeof entry !== 'object') return fallback;
    // An entry whose `label` is blank carries no caption — the declared one stands.
    const label = typeof entry.label === 'string' && entry.label.trim() ? entry.label : fallback;
    return stripHtmlToText(label);
}

// ============================================================================
// PURE RESOLVERS — exported so they can be pinned without a header
// ============================================================================

/**
 * Fold the view's glossary entry into its header config.
 *
 * The glossary is the SINGLE source of header copy: a config that names a
 * `glossaryPath` takes its `headerText` from the entry's title — a missing title
 * renders `MISSING_GLOSSARY_TITLE` rather than a literal from code — and the entry's
 * `subtitle` here is the only thing that ever sets `subtitle`. Apps must not declare a
 * static `subtitle` in their view header configs or write one at runtime — a view with no `glossaryPath`, or whose entry has no
 * `subtitle`, renders no subtitle at all.
 * @param {object} headerConfig - The view header config, possibly carrying a `glossaryPath`.
 * @param {object|null} glossaryData - The assembled glossary tree, or null before it loads.
 * @returns {object} A copy of the config, with the glossary title and subtitle folded in where one was found.
 */
export function resolveHeaderGlossaryConfig(headerConfig, glossaryData) {
    if (!glossaryData || !headerConfig?.glossaryPath) {
        return { ...headerConfig };
    }

    const glossaryEntry = resolveDotPath(glossaryData, headerConfig.glossaryPath);
    const resolvedConfig = {
        ...headerConfig,
        headerText: resolveGlossaryTitle(glossaryEntry) ?? MISSING_GLOSSARY_TITLE,
    };
    if (!glossaryEntry || typeof glossaryEntry !== 'object') {
        return resolvedConfig;
    }

    if (typeof glossaryEntry.subtitle === 'string' && glossaryEntry.subtitle.trim()) {
        resolvedConfig.subtitle = stripHtmlToText(glossaryEntry.subtitle);
    }

    if (glossaryEntry.interface && typeof glossaryEntry.interface === 'object') {
        resolvedConfig.glossaryInterface = glossaryEntry.interface;
    }

    return resolvedConfig;
}

/**
 * Resolve a control's label and tooltip — and those of its modes / items — from the
 * view's glossary `interface` entries, by each one's `glossarySubKey`. Entries that
 * carry no text leave the declared label in place.
 * @param {object} control - A cloned control definition (mutated and returned).
 * @param {object|null} glossaryInterface - The view's glossary `interface` map, or null.
 * @returns {object} The same control, labelled.
 */
export function applyGlossaryInterfaceToControl(control, glossaryInterface) {
    if (!glossaryInterface || typeof glossaryInterface !== 'object') {
        return control;
    }

    const resolveInterfaceEntry = (glossarySubKey) => {
        if (!glossarySubKey) return null;
        const entry = glossaryInterface[glossarySubKey];
        return entry && typeof entry === 'object' ? entry : null;
    };

    if (control.options?.glossarySubKey) {
        const entry = resolveInterfaceEntry(control.options.glossarySubKey);
        if (entry) {
            const resolvedLabel = getGlossaryInterfaceLabel(entry, control.options.label);
            if (resolvedLabel) {
                control.options.label = resolvedLabel;
            }
            if (typeof entry.tooltip === 'string' && entry.tooltip.trim()) {
                control.options.tooltipText = entry.tooltip;
            }
        }
    }

    if (Array.isArray(control.options?.modes)) {
        control.options.modes = control.options.modes.map((mode) => {
            const entry = resolveInterfaceEntry(mode.glossarySubKey);
            if (!entry) return mode;

            const resolvedLabel = getGlossaryInterfaceLabel(entry, mode.label);
            return {
                ...mode,
                label: resolvedLabel,
                tooltipText:
                    typeof entry.tooltip === 'string' && entry.tooltip.trim()
                        ? entry.tooltip
                        : mode.tooltipText,
            };
        });
    }

    if (Array.isArray(control.options?.items)) {
        control.options.items = control.options.items.map((item) => {
            const entry = resolveInterfaceEntry(item.glossarySubKey);
            if (!entry) return item;

            const resolvedLabel = getGlossaryInterfaceLabel(entry, item.label);
            return {
                ...item,
                label: resolvedLabel,
                tooltipText:
                    typeof entry.tooltip === 'string' && entry.tooltip.trim()
                        ? entry.tooltip
                        : item.tooltipText,
            };
        });
    }

    return control;
}

/**
 * A JSON-stable projection of a header render payload for the no-op render
 * skip: keys sorted, functions / DOM nodes / cycles reduced to markers, so two
 * payloads that would render the same header serialise the same.
 * @param {*} value - Any payload value.
 * @param {WeakSet<object>} [seen] - Objects already on the current path.
 * @returns {*} The normalised value.
 */
export function normalizeHeaderRenderValue(value, seen = new WeakSet()) {
    if (typeof value === 'function') return '[Function]';
    if (typeof value === 'undefined') return '[Undefined]';
    if (typeof value === 'symbol') return value.toString();
    if (value === null || typeof value !== 'object') return value;

    if (typeof Node !== 'undefined' && value instanceof Node) {
        return `[Node:${value.nodeName}]`;
    }

    if (seen.has(value)) return '[Circular]';
    seen.add(value);

    if (Array.isArray(value)) {
        return value.map((item) => normalizeHeaderRenderValue(item, seen));
    }

    const normalized = {};
    Object.keys(value)
        .sort()
        .forEach((key) => {
            normalized[key] = normalizeHeaderRenderValue(value[key], seen);
        });
    return normalized;
}

export class HeaderOrchestrator {
    /** @type {string} */
    #ownerName;
    /** @type {string|null} */
    #headerContainerId;
    /** @type {{[viewType: string]: object}} */
    #viewConfig;
    /** @type {() => (object | null)} */
    #getGlossaryData;
    /** @type {(data: {active: boolean, source: string}) => void} */
    #onNotesToggled;
    /** @type {(data: {active: boolean}) => void} */
    #onInfoToggled;
    /** @type {(childModule: any) => void} */
    #registerChildModule;

    // Owned state
    /** @type {HeaderModule|null} */
    #headerModule = null;
    /** @type {object | null} */
    #viewHeaderConfigs = null;
    /** @type {string|null} */
    #lastHeaderRenderSignature = null;
    /** @type {Map<string, object>} The current view's control defs by id, from the last updateForView(). */
    #activeControlDefs = new Map();

    /**
     * @param {object} deps - Everything the orchestrator needs from the owning app module.
     * @param {string} deps.ownerName - App class name, for warning/log parity
     * @param {string|null} deps.headerContainerId - Shared header container id (null disables the header)
     * @param {{[viewType: string]: object}} deps.viewConfig - View config map (source of each view's title icon)
     * @param {() => (object | null)} deps.getGlossaryData - Live glossary data accessor
     * @param {(data: {active: boolean, source: string}) => void} deps.onNotesToggled - Notes button toggled
     * @param {(data: {active: boolean}) => void} deps.onInfoToggled - Info button toggled (starts/stops the guided walkthrough)
     * @param {(childModule: any) => void} deps.registerChildModule - Register the HeaderModule as an app child
     */
    constructor({
        ownerName,
        headerContainerId,
        viewConfig,
        getGlossaryData,
        onNotesToggled,
        onInfoToggled,
        registerChildModule,
    }) {
        this.#ownerName = ownerName;
        this.#headerContainerId = headerContainerId ?? null;
        this.#viewConfig = viewConfig ?? {};
        this.#getGlossaryData = getGlossaryData;
        this.#onNotesToggled = onNotesToggled ?? (() => {});
        this.#onInfoToggled = onInfoToggled ?? (() => {});
        this.#registerChildModule = registerChildModule;
    }

    // ========================================================================
    // PUBLIC API (called by the app coordinator)
    // ========================================================================

    /**
     * Store the per-view header configurations. Called by the app's forwarding
     * `setViewHeaderConfigs()` (subclass constructor or initializeComponents).
     * @param {{[viewType: string]: object}} viewHeaderConfigs - View type to that view's header config.
     */
    setViewHeaderConfigs(viewHeaderConfigs) {
        this.#viewHeaderConfigs = viewHeaderConfigs;
    }

    /**
     * Get the view header configurations.
     * @param {string} [viewType] - Optional specific view type
     * @returns {object} Full config map (no arg) or single view config
     */
    getViewHeaderConfig(viewType) {
        if (!this.#viewHeaderConfigs) return viewType ? null : {};
        return viewType ? this.#viewHeaderConfigs[viewType] : { ...this.#viewHeaderConfigs };
    }

    /**
     * Get the shared header module instance (created by init()).
     * @returns {HeaderModule|null} The shared header, or null before `init()` has created it.
     */
    getHeaderModule() {
        return this.#headerModule;
    }

    /**
     * Create and initialize the shared header module. No-op when the app has no
     * header container configured.
     */
    async init() {
        const headerContainerId = this.#headerContainerId;
        if (!headerContainerId) return;

        const headerContainer = document.getElementById(headerContainerId);
        if (!headerContainer) {
            console.warn(`${this.#ownerName}: Header container not found (${headerContainerId})`);
            return;
        }

        // Title, subtitle and controls arrive per view in updateForView().
        this.#headerModule = new HeaderModule(headerContainerId, headerContainer, {
            showNotesButton: true,
            onControlChanged: (controlId, data) => this.dispatchControlChange(controlId, data),
            onNotesToggled: (data) => this.#onNotesToggled(data),
            onInfoToggled: (data) => this.#onInfoToggled(data),
        });

        await this.#headerModule.init();
        this.#registerChildModule(this.#headerModule);
    }

    /**
     * Update header content for a specific view.
     * Reads from viewHeaderConfigs, builds controls with state, and re-renders.
     * @param {string} viewType - View type identifier
     */
    async updateForView(viewType) {
        const headerConfig = this.#viewHeaderConfigs?.[viewType];
        if (!headerConfig) return;

        // Noted before the header check: dispatch resolves against the view last
        // asked for, so two views declaring one control id with different
        // handlers cannot cross-fire.
        this.#activeControlDefs = new Map(
            (headerConfig.controls ?? []).map((def) => [def.id, def]),
        );

        if (!this.#headerModule) return;

        const resolvedHeaderConfig = resolveHeaderGlossaryConfig(
            headerConfig,
            this.#getGlossaryData(),
        );
        const { glossaryInterface = null, ...renderHeaderConfig } = resolvedHeaderConfig;

        // Build controls with current state values
        const controls = this.#buildControlsForView(
            renderHeaderConfig.controls || [],
            glossaryInterface,
        );

        const renderPayload = {
            viewType,
            ...renderHeaderConfig,
            controls,
            iconName: this.#resolveTitleIcon(viewType),
        };

        if (this.#shouldSkipHeaderRender(renderPayload)) {
            return;
        }

        await this.#headerModule.render(renderPayload);
    }

    /**
     * Route a header control change to the `onChange` of the control that
     * declared it. Wired as the HeaderModule's `onControlChanged` callback.
     * The current view's declaration wins; the flat scan of every view config
     * is the fallback for a change that fires before the first `updateForView`.
     * @param {string} controlId - Control identifier
     * @param {object} data - Control change data
     */
    dispatchControlChange(controlId, data) {
        const controlDef =
            this.#activeControlDefs.get(controlId) ?? this.#findControlDef(controlId);
        if (controlDef?.onChange) {
            controlDef.onChange(data);
            return;
        }
        console.debug(`${this.#ownerName}: Unhandled control changed:`, controlId, data);
    }

    // ========================================================================
    // PRIVATE HELPERS
    // ========================================================================

    /**
     * Find a control definition by id across all view configs.
     * @param {string} controlId - The control to look up.
     * @returns {object | null} The first matching definition across all view configs, or null when no view declares it.
     */
    #findControlDef(controlId) {
        if (!this.#viewHeaderConfigs) return null;

        for (const config of Object.values(this.#viewHeaderConfigs)) {
            const found = config?.controls?.find((def) => def.id === controlId);
            if (found) return found;
        }
        return null;
    }

    /**
     * Build controls array with current state values injected.
     * Clones each control def, lets the def's own `injectState` write live app
     * state into the clone, and strips the declaration callbacks so the render
     * path sees plain data.
     * @param {Array} controlDefs - Control definitions from viewHeaderConfigs
     * @param {object | null} glossaryInterface - Optional glossary interface labels
     * @returns {Array} Controls with state values injected
     */
    #buildControlsForView(controlDefs, glossaryInterface = null) {
        return controlDefs.map((controlDef) => {
            const control = {
                ...controlDef,
                options: { ...controlDef.options },
            };

            if (Array.isArray(controlDef.options?.modes)) {
                control.options.modes = controlDef.options.modes.map((mode) => ({ ...mode }));
            }

            if (Array.isArray(controlDef.options?.items)) {
                control.options.items = controlDef.options.items.map((item) => ({ ...item }));
            }

            controlDef.injectState?.(control);
            delete control.injectState;
            delete control.onChange;
            return applyGlossaryInterfaceToControl(control, glossaryInterface);
        });
    }

    /**
     * Resolve the icon shown in front of a view's header title: the Material Symbols
     * name the view's own `viewConfig` entry declares, so every app gets the same
     * treatment without repeating the lookup.
     * @param {string} viewType - The view whose title is being rendered.
     * @returns {string|null} The icon name, or null when the view declares none.
     */
    #resolveTitleIcon(viewType) {
        return this.#viewConfig?.[viewType]?.icon || null;
    }

    #shouldSkipHeaderRender(renderPayload) {
        const signature = JSON.stringify(normalizeHeaderRenderValue(renderPayload));
        if (signature === this.#lastHeaderRenderSignature) {
            return true;
        }

        this.#lastHeaderRenderSignature = signature;
        return false;
    }
}
