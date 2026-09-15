/**
 * ModeSwitchModule - Reusable mode switching button group
 * Creates buttons for each mode and emits events when modes are switched.
 * Only one mode can be active at a time (active button is disabled).
 */

import {
    BaseModule,
    createSegmentedButtonRow,
    createSegmentedChoiceButton,
    setSegmentedChoiceButtonState,
} from '@tba3/module-base';
import './modeSwitchModule.css';

/**
 * ModeSwitchModule - Generic mode switch component
 * Can be used as a standalone module or child module
 */
export class ModeSwitchModule extends BaseModule {
    /** @type {string} */
    #currentMode;
    #modes = [];

    /**
     * Creates a new ModeSwitchModule instance
     * @param {string} id - Unique identifier for this module
     * @param {string|HTMLElement|null} container - Container element or selector
     * @param {object} options - Configuration options
     * @param {Array<{id: string, label: string, glossaryKey?: string, tooltipText?: string}>} [options.modes] - Array of mode definitions
     * @param {string} [options.defaultMode] - Initial active mode
     * @param {string} [options.containerClass] - Optional custom class for the main container (default: 'mode-switch')
     * @param {string} [options.buttonContainerClass] - Optional custom class for button container (default: 'mode-switch-buttons')
     * @param {string} [options.buttonClass] - Optional custom class for buttons (default: 'mode-button')
     * @param {Function} [options.onModeChanged] - Callback function when mode changes
     */
    constructor(id, container, options = {}) {
        super(id, container, options);

        // Validate required options
        if (!options.modes || !Array.isArray(options.modes) || options.modes.length === 0) {
            throw new Error('ModeSwitchModule requires options.modes array with at least one mode');
        }

        this.setDefaults({
            modes: [],
            defaultMode: null,
            containerClass: 'mode-switch',
            buttonContainerClass: 'mode-switch-buttons',
            buttonClass: 'mode-button',
        });

        // Store modes
        this.#modes = this.options.modes;

        // Validate and set default mode
        const defaultMode = this.options.defaultMode || this.#modes[0].id;
        if (!this.#modes.find((m) => m.id === defaultMode)) {
            throw new Error(`Default mode '${defaultMode}' not found in modes array`);
        }
        this.#currentMode = defaultMode;

        // Register callbacks from options if provided
        if (options.onModeChanged) {
            this.registerCallback('modeChanged', options.onModeChanged);
        }
    }

    /**
     * Render the mode switch UI
     * @returns {HTMLElement} The rendered mode switch element
     */
    _doRender() {
        const container = document.createElement('div');
        container.className = this.options.containerClass;

        // Create button container
        const buttonContainer = createSegmentedButtonRow(this.options.buttonContainerClass);

        // Create buttons for each mode
        this.#modes.forEach((mode) => {
            const button = this.#createModeButton(mode);
            buttonContainer.appendChild(button);
        });

        container.appendChild(buttonContainer);

        // Store the element
        this.element = container;

        return container;
    }

    /**
     * Create a mode button
     * @param {{[key: string]: any}} mode - Mode definition
     * @returns {HTMLElement} Button element
     */
    #createModeButton(mode) {
        const isActive = mode.id === this.#currentMode;
        const button = createSegmentedChoiceButton({
            label: mode.label,
            glossaryKey: mode.glossaryKey,
            tooltipText: mode.tooltipText,
            buttonClass: this.options.buttonClass,
            isActive,
            disableWhenActive: true,
        });
        button.dataset.modeSwitchButton = 'true';
        button.dataset.mode = mode.id;

        // Add click handler
        this.resources.trackDomListener(button, 'click', () => {
            this.#handleModeChange(mode.id);
        });

        return button;
    }

    /**
     * Handle mode change
     * @param {string} newMode - New mode to switch to
     */
    #handleModeChange(newMode) {
        if (newMode === this.#currentMode) {
            return; // No change (shouldn't happen as button is disabled)
        }

        const oldMode = this.#currentMode;
        this.#currentMode = newMode;

        // Update button states
        this.#updateButtonStates();

        // Trigger local callbacks
        this.triggerCallback('modeChanged', {
            mode: newMode,
            previousMode: oldMode,
        });
    }

    /**
     * Update button active states and disabled property
     */
    #updateButtonStates() {
        const buttons = this.element?.querySelectorAll('[data-mode-switch-button]');
        if (!buttons) return;

        buttons.forEach((button) => {
            const isActive = button.dataset.mode === this.#currentMode;
            setSegmentedChoiceButtonState(button, isActive, { disableWhenActive: true });
        });
    }
}
