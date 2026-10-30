/**
 * HeaderOrchestrator — binds an app coordinator's per-view config to the shared
 * `HeaderModule`. Not a `BaseModule` subclass: every app dependency is injected.
 *
 * A control declaration may carry `injectState(control)` and `onChange(data)`, both
 * closing over their app's control context (`HeaderControlContext`); the
 * orchestrator strips them before the `HeaderModule` sees the control, so rendering
 * and control reuse see plain data. Title, subtitle, icon and the tour button come
 * from the app's `viewConfig`; the title and subtitle may carry app tokens
 * (`{{Fach}}`), empty until the app sets them (`setTokens`) once the data lands.
 *
 * The header follows the app state, whoever writes it: one effect renders the requested
 * view's header and re-runs whenever a state key its controls read changes. With the
 * same controls the header patches them in place, so a re-run keeps the focus.
 *
 * The coordinator places the `HeaderModule` (`header`) in the app, so its teardown,
 * the effect included, goes with the app's.
 */

import { signal, untracked } from '@preact/signals-core';
import { HeaderModule } from './headerModule.js';
import {
    applyTemplateTokens,
    missingGlossaryText,
    resolveDotPath,
    requireGlossaryTitle,
    stripHtmlToText,
} from '@tba3/module-base/glossary';

/** @typedef {import('./headerModule.js').HeaderControlDefinition} HeaderControlDefinition */
/** @typedef {import('./headerModule.js').RenderedControlDefinition} RenderedControlDefinition */
/** @typedef {import('./headerModule.js').HeaderControlChange} HeaderControlChange */
/** @typedef {import('@tba3/module-base/glossary').GlossaryEntry} GlossaryEntry */
/** @typedef {import('@tba3/module-base/glossary').GlossaryTree} GlossaryTree */

/**
 * A header control as a view declares it: the rendered definition plus the callbacks
 * that bind it to app state.
 * @typedef {HeaderControlDefinition & {
 *   injectState?: (control: HeaderControlDefinition) => void,
 *   onChange?: (data: HeaderControlChange) => void
 * }} HeaderControlDeclaration
 */

/**
 * A view's header copy as its glossary entry supplies it.
 * @typedef {object} HeaderGlossaryCopy
 * @property {string} headerText - The entry's title, or the missing-title marker.
 * @property {string} [subtitle] - The entry's subtitle, markup stripped; none without one.
 * @property {{[subKey: string]: GlossaryEntry}} [glossaryInterface] - The control labels, the view's over the app's shared ones.
 * @property {(subKey: string) => string} interfacePath - Where a control label belongs, which a missing one's marker names: the app's shared map for a key it declares, the view's own otherwise.
 */

/**
 * The view config fields the header reads.
 * @typedef {object} HeaderViewEntry
 * @property {string} headerGlossaryPath - Glossary entry supplying the title, subtitle and control labels.
 * @property {string} [icon] - Material Symbols icon in front of the title.
 * @property {boolean} [tour] - Offer the guided walkthrough button.
 */

/**
 * Plain-text label for a glossary `interface` entry — its `label` field, with
 * markup stripped so the result is safe as an attribute value or button label.
 * @param {GlossaryEntry|null} entry
 * @param {string} path - The entry's dot path, named by the marker.
 * @returns {string} The missing-entry marker when there is none.
 */
function getGlossaryInterfaceLabel(entry, path) {
    const label = entry?.label;
    if (typeof label !== 'string' || !label.trim()) return missingGlossaryText(path);
    return stripHtmlToText(label);
}

/**
 * @param {GlossaryEntry|null} entry
 * @returns {string|undefined} Undefined when the entry has none.
 */
function getGlossaryInterfaceTooltip(entry) {
    const tooltip = entry?.tooltip;
    return typeof tooltip === 'string' && tooltip.trim() ? tooltip : undefined;
}

// ============================================================================
// GLOSSARY RESOLVERS
// ============================================================================

/**
 * @param {unknown} value - A glossary node.
 * @returns {{[key: string]: GlossaryEntry}} The node as a map, or an empty one.
 */
function asObject(value) {
    return value && typeof value === 'object'
        ? /** @type {{[key: string]: GlossaryEntry}} */ (value)
        : {};
}

/**
 * Read a view's header copy from its glossary entry.
 *
 * The glossary is the only source of header copy: a missing title renders the
 * missing-entry marker, and only the entry's `subtitle` sets a subtitle. Control labels
 * come from the entry's `interface` map, over the app's own (`<app>.header.interface`)
 * for a control that several views share.
 * @param {string} glossaryPath - The view's header entry.
 * @param {GlossaryTree} glossaryData
 * @param {import('@tba3/module-base/glossary').GlossaryReplacements} tokens - The app's tokens for the title and subtitle; a token without a value reads empty.
 * @returns {HeaderGlossaryCopy}
 */
function resolveHeaderGlossaryCopy(glossaryPath, glossaryData, tokens) {
    const glossaryEntry = resolveDotPath(glossaryData, glossaryPath);
    const appInterfacePath = `${glossaryPath.split('.')[0]}.header.interface`;
    const appInterface = asObject(resolveDotPath(glossaryData, appInterfacePath));
    const viewInterface = asObject(glossaryEntry?.interface);
    /** @type {HeaderGlossaryCopy} */
    const copy = {
        headerText: applyTemplateTokens(
            requireGlossaryTitle(glossaryEntry, glossaryPath),
            tokens,
        ).trim(),
        interfacePath: (subKey) =>
            subKey in appInterface && !(subKey in viewInterface)
                ? `${appInterfacePath}.${subKey}`
                : `${glossaryPath}.interface.${subKey}`,
    };
    if (!glossaryEntry || typeof glossaryEntry !== 'object') return copy;

    if (typeof glossaryEntry.subtitle === 'string' && glossaryEntry.subtitle.trim()) {
        copy.subtitle = applyTemplateTokens(stripHtmlToText(glossaryEntry.subtitle), tokens).trim();
    }
    copy.glossaryInterface = { ...appInterface, ...viewInterface };
    return copy;
}

/**
 * Resolve a control's label and tooltip — and those of its items — from the
 * view's glossary `interface` entries, by each one's `glossarySubKey`.
 * @param {HeaderControlDefinition} control - The control with its current state.
 * @param {{[subKey: string]: GlossaryEntry}|null} glossaryInterface - The view's glossary `interface` map, or null.
 * @param {(subKey: string) => string} entryPath - Where each label belongs (`HeaderGlossaryCopy.interfacePath`), named by a missing one's marker.
 * @returns {RenderedControlDefinition} A labelled copy of the control.
 */
function applyGlossaryInterfaceToControl(control, glossaryInterface, entryPath) {
    /**
     * @param {string} glossarySubKey - The entry's key in the view's glossary `interface` map.
     * @returns {GlossaryEntry|null}
     */
    const resolveInterfaceEntry = (glossarySubKey) => {
        const entry = glossaryInterface?.[glossarySubKey];
        return entry && typeof entry === 'object' ? entry : null;
    };
    const { items, ...options } = control.options;
    const controlKey = options.glossarySubKey;
    if (controlKey) {
        const entry = resolveInterfaceEntry(controlKey);
        options.label = getGlossaryInterfaceLabel(entry, entryPath(controlKey));
        options.tooltipText = getGlossaryInterfaceTooltip(entry);
    }

    return {
        ...control,
        options: {
            ...options,
            items: (items ?? []).map((item) => {
                if (item.glossarySubKey === undefined) return item;
                const entry = resolveInterfaceEntry(item.glossarySubKey);
                return {
                    value: item.value,
                    label: getGlossaryInterfaceLabel(entry, entryPath(item.glossarySubKey)),
                    tooltipText: getGlossaryInterfaceTooltip(entry),
                    disabled: item.disabled,
                };
            }),
        },
    };
}

export class HeaderOrchestrator {
    /** @type {string} */
    #ownerName;
    /** @type {{[viewType: string]: HeaderViewEntry}} */
    #viewConfig;
    /** @type {GlossaryTree} */
    #glossaryData;

    /** @type {HeaderModule} */
    #headerModule;
    /** @type {{[viewType: string]: ReadonlyArray<HeaderControlDeclaration>}} */
    #viewControls;
    /** The app's tokens for the title and subtitle (`setTokens`); each reads empty until set. */
    #tokens = signal(/** @type {import('@tba3/module-base/glossary').GlossaryReplacements} */ ({}));
    /** The header the effect renders and changes dispatch against: which view, and whether with its controls. */
    #request = signal(/** @type {{viewType: string, withControls: boolean}|null} */ (null));

    /**
     * @param {object} deps
     * @param {string} deps.ownerName - App class name, for warning/log parity
     * @param {string} deps.headerId
     * @param {string} deps.headerClassName
     * @param {{[viewType: string]: HeaderViewEntry}} deps.viewConfig - The resolved view config
     * @param {GlossaryTree} deps.glossaryData
     * @param {{[viewType: string]: ReadonlyArray<HeaderControlDeclaration>}} deps.viewControls - Each view's control declarations; a view without controls has no entry
     * @param {import('@tba3/modules/context').ModuleContext} deps.context - Handed to the header module
     * @param {() => void} deps.onNotesClicked
     * @param {() => void} deps.onInfoClicked - Starts or stops the guided walkthrough
     */
    constructor({
        ownerName,
        headerId,
        headerClassName,
        viewConfig,
        glossaryData,
        viewControls,
        context,
        onNotesClicked,
        onInfoClicked,
    }) {
        this.#ownerName = ownerName;
        this.#viewConfig = viewConfig;
        this.#glossaryData = glossaryData;
        this.#viewControls = viewControls;
        // Title, subtitle and controls arrive per view in updateForView().
        this.#headerModule = HeaderModule.create(headerId, {
            context,
            onControlChanged: (controlId, data) => this.#dispatchControlChange(controlId, data),
            onNotesClicked,
            onInfoClicked,
        });
        this.#headerModule.className = headerClassName;
    }

    /** @returns {HeaderModule} The shared header, for the coordinator to place. */
    get header() {
        return this.#headerModule;
    }

    // ========================================================================
    // PUBLIC API
    // ========================================================================

    /** Start following the requested view; the header is in the page by now. */
    async init() {
        const headerModule = this.#headerModule;
        await headerModule.updateComplete;
        // Building the controls reads the state they show (`injectState`, `resolveHidden`),
        // and the copy reads the app's tokens, so the effect re-runs on exactly those; the
        // render itself tracks nothing.
        headerModule.effect(() => {
            const request = this.#request.value;
            if (!request) return;
            const payload = this.#buildPayload(request.viewType, request.withControls);
            untracked(() => {
                headerModule.payload = payload;
            });
        });
    }

    /**
     * Render the header for a view. Its title and subtitle need only the glossary, so a
     * view that waits for the data shows them first (`withControls: false`) and its
     * controls, which may read the data, once it has landed.
     * @param {string} viewType
     * @param {{withControls?: boolean}} [options]
     */
    async updateForView(viewType, { withControls = true } = {}) {
        // A fresh object, so asking for the same view again renders again. The effect
        // runs on the write and hands the header its payload; dispatch resolves against
        // the view last asked for, so two views declaring one control id with different
        // handlers cannot cross-fire.
        this.#request.value = { viewType, withControls };
        await this.#headerModule.updateComplete;
    }

    /** @returns {import('@tba3/module-base/glossary').GlossaryReplacements} The app's tokens as last set; the header's tour step fills them as the header does. */
    get tokens() {
        return this.#tokens.peek();
    }

    /**
     * Fill the app's tokens into every view's title and subtitle; the header redraws.
     * @param {import('@tba3/module-base/glossary').GlossaryReplacements} tokens
     */
    setTokens(tokens) {
        this.#tokens.value = tokens;
    }

    /**
     * Show whether the thing a header action button toggles is on.
     * @param {'notes'|'info'} name
     * @param {boolean} pressed - Whether the notes drawer is open or the tour running.
     */
    setActionPressed(name, pressed) {
        this.#headerModule.setActionPressed(name, pressed);
    }

    /**
     * Route a header control change to the `onChange` of the control that
     * declared it on the current view. Wired as the HeaderModule's
     * `onControlChanged` callback; a control only exists once `updateForView`
     * has rendered it, which records the view first.
     *
     * The change may reveal or hide another control; the state write re-runs the
     * header effect, which updates the controls in place and keeps the focus.
     * @param {string} controlId
     * @param {HeaderControlChange} data
     */
    #dispatchControlChange(controlId, data) {
        const viewType = this.#request.peek()?.viewType;
        const declaration = viewType
            ? this.#viewControls[viewType]?.find((control) => control.id === controlId)
            : undefined;
        if (!declaration?.onChange) {
            console.debug(`${this.#ownerName}: Unhandled control changed:`, controlId, data);
            return;
        }
        declaration.onChange(data);
    }

    // ========================================================================
    // PRIVATE HELPERS
    // ========================================================================

    /**
     * Build what the header shows for a view, its controls on their current state.
     * @param {string} viewType
     * @param {boolean} withControls
     * @returns {import('./headerModule.js').HeaderRenderPayload}
     */
    #buildPayload(viewType, withControls) {
        const { headerGlossaryPath, icon, tour } = this.#viewConfig[viewType];
        const { headerText, subtitle, glossaryInterface, interfacePath } =
            resolveHeaderGlossaryCopy(headerGlossaryPath, this.#glossaryData, this.#tokens.value);
        const declarations = withControls ? (this.#viewControls[viewType] ?? []) : [];
        return {
            headerText,
            subtitle: subtitle ?? '',
            iconName: icon ?? null,
            tour: Boolean(tour),
            controls: declarations.map((declaration) =>
                this.#buildControl(declaration, glossaryInterface ?? null, interfacePath),
            ),
        };
    }

    /**
     * Build one control as the header renders it: a copy of the declaration whose own
     * `injectState` writes live app state into it, stripped of the declaration
     * callbacks and labelled from the glossary.
     * @param {HeaderControlDeclaration} declaration
     * @param {{[subKey: string]: GlossaryEntry} | null} glossaryInterface
     * @param {(subKey: string) => string} interfacePath - Where each label belongs, named by a missing one's marker
     * @returns {RenderedControlDefinition}
     */
    #buildControl(declaration, glossaryInterface, interfacePath) {
        // eslint-disable-next-line no-unused-vars
        const { injectState, onChange, ...definition } = declaration;
        const control = { ...definition, options: { ...definition.options } };
        injectState?.(control);
        return applyGlossaryInterfaceToControl(control, glossaryInterface, interfacePath);
    }
}
