/**
 * HeaderModule — the shared view header: title cluster, view controls, action buttons.
 *
 * Layout contract, identical in every app (src/styles/header-module.css):
 *   [ title ]              [ controls, centered ]   [ notes | info ]
 *   [ subtitle, spanning the full header width on row 2 ]
 * Generic: event types and app state arrive through options, never imported.
 */

import { BaseModule, createIcon, iconSvg } from '@tba3/module-base';
import { glossaryAnnotator } from '@tba3/modules/glossary';
import { ModeSwitchModule } from './modeSwitchModule.js';
import { SelectControlModule } from './selectControlModule.js';
import { createToggleIconButton, setToggleIconButtonState } from './toggleIconButtonBuilder.js';

/**
 * HeaderModule - Reusable header component
 * Displays view information, testing details, and customizable controls
 * @augments BaseModule
 */
export class HeaderModule extends BaseModule {
    /** @type {HTMLButtonElement|null} */
    #infoButtonElement = null;
    #infoActive = false;

    /** @type {HTMLButtonElement|null} */
    #notesButtonElement = null;
    #notesActive = false;

    // Map of controls created via controls array
    #controls = new Map();

    /**
     * Creates a new HeaderModule instance
     * @param {string} id - Unique identifier for this module
     * @param {string|HTMLElement} container - Container element or selector
     * @param {{[key: string]: any}} [options={}] - Configuration options: headerText, subtitle,
     *   controls[] (each { type, id, options }), showInfoButton, showNotesButton,
     *   onControlChanged, onInfoToggled, onNotesToggled. See setDefaults() for defaults.
     */
    constructor(id, container, options = {}) {
        super(id, container, options);

        this.setDefaults({
            headerText: 'Ansicht',
            subtitle: '',
            controls: [],
            showInfoButton: false,
            showNotesButton: false,
        });

        // Register callbacks from options if provided
        if (options.onControlChanged) {
            this.registerCallback('controlChanged', options.onControlChanged);
        }
        if (options.onInfoToggled) {
            this.registerCallback('infoToggled', options.onInfoToggled);
        }
        if (options.onNotesToggled) {
            this.registerCallback('notesToggled', options.onNotesToggled);
        }
    }

    // ========================================================================
    // CONTROLS API
    // ========================================================================

    /**
     * Create controls from the declarative controls array
     * @param {Array<object>} controlDefs - Array of control definitions
     * @param {HTMLElement} container - Container to append controls to
     */
    #createControlsFromDefinitions(controlDefs, container) {
        if (!controlDefs || !Array.isArray(controlDefs) || controlDefs.length === 0) {
            return;
        }

        for (const controlDef of controlDefs) {
            try {
                // Skip hidden controls
                if (controlDef.options?.hidden) continue;

                const control = this.#createControlFromDefinition(controlDef);
                if (control) {
                    this.#controls.set(controlDef.id, control);
                    this.registerChildModule(control);

                    if (control.element) {
                        container.appendChild(control.element);
                    }
                }
            } catch (error) {
                console.error(`HeaderModule: Failed to create control '${controlDef.id}':`, error);
            }
        }
    }

    /**
     * Create a single control from its definition
     * @param {object} controlDef - Control definition object
     * @returns {BaseModule|null} The created control module or null
     */
    #createControlFromDefinition(controlDef) {
        const { type, id, options = {} } = controlDef;

        if (!type || !id) {
            console.warn('HeaderModule: Control definition missing type or id:', controlDef);
            return null;
        }

        let control = null;

        switch (type) {
            case 'modeSwitch':
                control = this.#createModeSwitchControl(id, options);
                break;

            case 'select':
                control = this.#createSelectControl(id, options);
                break;

            case 'buttonGroup':
                control = this.#createButtonGroupControl(id, options);
                break;

            default:
                console.warn(`HeaderModule: Unknown control type '${type}'`);
                return null;
        }

        if (control) {
            // init() is async but #createControlFromDefinition is sync — fire-and-forget is
            // intentional: _doRender() runs synchronously and sets control.element before any await yield.
            control.init();
        }

        return control;
    }

    /**
     * Create a mode switch control.
     * @param {string} id - Control id from the view header config; namespaced with the module id to stay unique on the page.
     * @param {object} options - Control definition: its modes, the initial one, and the change callback.
     * @returns {object} The control module, not yet rendered.
     */
    #createModeSwitchControl(id, options) {
        const controlId = `${this.id}-${id}`;

        return new ModeSwitchModule(controlId, null, {
            modes: options.modes || [],
            defaultMode: options.defaultMode || options.modes?.[0]?.id,
            containerClass: options.containerClass || 'header-module-mode-switch',
            onModeChanged: (data) => {
                this.triggerCallback('controlChanged', id, data);
                options.onModeChanged?.(data);
            },
        });
    }

    /**
     * Create a select dropdown control.
     * @param {string} id - Control id from the view header config; namespaced with the module id to stay unique on the page.
     * @param {object} options - Control definition: its choices, the initial value, and the change callback.
     * @returns {object} The control module, not yet rendered.
     */
    #createSelectControl(id, options) {
        const controlId = `${this.id}-${id}`;

        return new SelectControlModule(controlId, null, {
            items: options.items || [],
            defaultValue: options.defaultValue ?? null,
            label: options.label || null,
            tooltipText: options.tooltipText || null,
            containerClass: options.containerClass || '',
            selectClass: options.selectClass || '',
            onSelectionChanged: (data) => {
                this.triggerCallback('controlChanged', id, data);
                options.onSelectionChanged?.(data);
            },
        });
    }

    /**
     * Create a button group control — delegates to ModeSwitchModule (no-disableWhenActive variant).
     * @param {string} id - Control id from the view header config; namespaced with the module id to stay unique on the page.
     * @param {object} options - Control definition: its buttons, the initial one, and the change callback.
     * @returns {object} The control module, not yet rendered.
     */
    #createButtonGroupControl(id, options) {
        const controlId = `${this.id}-${id}`;

        return new ModeSwitchModule(controlId, null, {
            modes: (options.items || []).map((item) => ({
                id: item.value,
                label: item.label,
                glossaryKey: item.glossaryKey,
                glossarySubKey: item.glossarySubKey,
                tooltipText: item.tooltipText,
            })),
            defaultMode: options.defaultValue ?? options.items?.[0]?.value ?? null,
            containerClass: options.containerClass || 'header-module-button-group',
            buttonClass: '',
            buttonContainerClass: 'button-group-row',
            onModeChanged: (data) => {
                const selectedLabel =
                    options.items?.find((i) => i.value === data.mode)?.label ?? data.mode;
                this.triggerCallback('controlChanged', id, {
                    selectedValue: data.mode,
                    selectedLabel,
                });
                options.onSelectionChanged?.({ selectedValue: data.mode });
            },
        });
    }

    /**
     * Destroy all controls
     */
    #destroyControls() {
        this.destroyAndUnregisterAll(this.#controls);
    }

    // ========================================================================
    // RENDER
    // ========================================================================

    /**
     * Render the header info module
     * @override
     * @param {object} data - Optional data for rendering (can override options)
     * @returns {Promise<void>}
     */
    async _doRender(data = {}) {
        // Merge data with options for rendering
        const renderOptions = { ...this.options, ...data };

        const container = this.container;
        if (!container) return;

        // Clear container and set up classes directly on it
        container.innerHTML = '';
        container.classList.add('header-module');

        const controlList = document.createElement('div');
        controlList.className = 'header-module-control-list';

        const actions = document.createElement('div');
        actions.className = 'header-module-actions';

        // Create header section (view title) and the optional subtitle, which is a
        // grid child of its own rather than a child of the title block.
        const header = this.#createHeaderSection(renderOptions.headerText, renderOptions.iconName);
        const subtitle = this.#createSubtitleElement(renderOptions.subtitle);

        // Destroy existing controls before recreating
        this.#destroyControls();

        // Create controls from definitions if provided.
        if (renderOptions.controls && renderOptions.controls.length > 0) {
            this.#createControlsFromDefinitions(renderOptions.controls, controlList);
        }

        // Create and append notes button
        this.#ensureNotesButton();
        if (this.#notesButtonElement) {
            this.#notesButtonElement.style.display = renderOptions.showNotesButton ? '' : 'none';
            actions.appendChild(this.#notesButtonElement);
        }

        // Create and append info button
        this.#ensureInfoButton();
        if (this.#infoButtonElement) {
            this.#infoButtonElement.style.display = renderOptions.showInfoButton ? '' : 'none';
            actions.appendChild(this.#infoButtonElement);
        }

        // The container is the layout grid itself: title (col 1) | controls (col 2) |
        // actions (col 3) on row 1, and the subtitle spanning all columns on row 2. The
        // outer columns are equal fractions, so the controls stay centered on the header
        // regardless of how wide the title or actions get; the subtitle sidesteps that
        // narrow first column by taking the full header width.
        // Every child pins its own grid cell in CSS, so this append order is the reading
        // order for assistive tech, not the visual order.
        container.appendChild(header);
        if (subtitle) {
            container.appendChild(subtitle);
        }
        container.appendChild(controlList);
        container.appendChild(actions);
    }

    /**
     * Create header section with the view title
     * @param {string} headerText - Header text to display
     * @param {string|null} [iconName] - Optional Material Symbols icon name
     * @returns {HTMLElement} The title bar element, with the icon in front of the text when one was resolved.
     */
    #createHeaderSection(headerText, iconName = null) {
        const header = document.createElement('div');
        header.className = 'header-module-title';

        // The view title is the page's one <h1>: it is the element that names the page.
        const title = document.createElement('h1');

        if (iconName) {
            const icon = document.createElement('span');
            icon.className = 'header-module-title-icon';
            icon.setAttribute('aria-hidden', 'true');
            icon.appendChild(createIcon(iconName));
            title.appendChild(icon);
        }

        title.appendChild(document.createTextNode(headerText));
        header.appendChild(title);

        return header;
    }

    /**
     * Create the subtitle element, which occupies its own full-width header row.
     * @param {string} [subtitle] - Subtitle/description text
     * @returns {HTMLElement|null} null when the view has no subtitle
     */
    #createSubtitleElement(subtitle = '') {
        if (!subtitle) return null;

        const subtitleElement = document.createElement('p');
        subtitleElement.className = 'header-module-subtitle';
        subtitleElement.textContent = subtitle;
        return subtitleElement;
    }

    // ========================================================================
    // INFO BUTTON
    // ========================================================================

    /**
     * Ensure info button exists (create if needed)
     */
    #ensureInfoButton() {
        if (this.#infoButtonElement) {
            return;
        }

        const infoButton = createToggleIconButton({
            ariaLabel: glossaryAnnotator.getRequiredEntryText(
                'general.buttons.element_texts.tour-start.label',
            ),
            buttonAttributes: { 'data-header-action-button': 'tour-start' },
            isActive: this.#infoActive,
            svgMarkup: iconSvg('info'),
        });

        this.resources.trackDomListener(infoButton, 'click', () => {
            this.#toggleTour();
        });

        this.#infoButtonElement = infoButton;
    }

    /**
     * Toggle the guided walkthrough for the current view. The owning app
     * coordinator derives the steps and drives the TutorialController; the
     * header only owns the button's pressed state.
     */
    #toggleTour() {
        this.#infoActive = !this.#infoActive;

        if (this.#infoButtonElement) {
            setToggleIconButtonState(this.#infoButtonElement, this.#infoActive);
        }

        this.triggerCallback('infoToggled', { active: this.#infoActive });
    }

    // ========================================================================
    // NOTES BUTTON
    // ========================================================================

    /**
     * Ensure notes button exists (create if needed)
     */
    #ensureNotesButton() {
        if (this.#notesButtonElement) {
            return;
        }

        const notesButton = createToggleIconButton({
            ariaLabel: glossaryAnnotator.getRequiredEntryText(
                'general.buttons.element_texts.notes-toggle.label',
            ),
            buttonAttributes: { 'data-header-action-button': 'notes-toggle' },
            isActive: this.#notesActive,
            svgMarkup: iconSvg('edit_note'),
        });

        this.resources.trackDomListener(notesButton, 'click', () => {
            this.#toggleNotesPanel();
        });

        this.#notesButtonElement = notesButton;
    }

    /**
     * Toggle the notes panel open/closed
     */
    #toggleNotesPanel() {
        this.#notesActive = !this.#notesActive;

        if (this.#notesButtonElement) {
            setToggleIconButtonState(this.#notesButtonElement, this.#notesActive);
        }

        this.triggerCallback('notesToggled', { active: this.#notesActive });
    }

    /**
     * Sync the notes button's visual active state without toggling (e.g. when the
     * drawer is closed externally, such as via its own close button).
     * @param {boolean} active - Whether the notes drawer is currently open.
     */
    setNotesActive(active) {
        this.#notesActive = active;
        if (this.#notesButtonElement) {
            setToggleIconButtonState(this.#notesButtonElement, this.#notesActive);
        }
    }

    /**
     * Sync the info button's visual active state without toggling (e.g. when the
     * tour it launched closes via Esc/Fertig). Mirrors setNotesActive().
     * @param {boolean} active - Whether the guided walkthrough is currently running.
     */
    setInfoActive(active) {
        this.#infoActive = active;
        if (this.#infoButtonElement) {
            setToggleIconButtonState(this.#infoButtonElement, this.#infoActive);
        }
    }

    // ========================================================================
    // OTHER METHODS
    // ========================================================================

    /**
     * Cleanup when module is destroyed
     * @override
     */
    async destroy() {
        this.#destroyControls();
        await super.destroy();
    }
}
