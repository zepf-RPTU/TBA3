/**
 * HeaderModule — the shared view header: title cluster, view controls, action buttons,
 * laid out by src/styles/header-module.css. Generic: what it shows arrives as `payload`,
 * what it reports leaves through its option callbacks; it reads no app state.
 */

import { BaseModule, headerActionButton, renderIcon, resizeService } from '@tba3/module-base';
import { html, nothing } from 'lit';
import { repeat } from 'lit/directives/repeat.js';
import { ModeSwitchModule } from './modeSwitchModule.js';
import { MenuControlModule } from '../controls/menuControlModule.js';
import { SelectControlModule } from '../controls/selectControlModule.js';

/**
 * One choice of a mode switch or select, as a view declares it, with exactly one source
 * for its label: a data-derived choice brings its `label`, any other names the glossary
 * `interface` entry that labels it (`glossarySubKey`).
 * A `disabled` choice shows but cannot be chosen.
 * @typedef {{value: string, disabled?: boolean} & ({label: string, glossarySubKey?: never} | {glossarySubKey: string, label?: never})} HeaderControlItem
 */

/**
 * One choice as it renders: labelled, from the glossary when its declaration named an entry.
 * @typedef {object} RenderedControlItem
 * @property {string} value - Reported as `value` on change.
 * @property {string} label
 * @property {string} [tooltipText]
 * @property {boolean} [disabled] - Shown, but not choosable.
 */

/**
 * What a header control reports when the user picks another choice.
 * @typedef {object} HeaderControlChange
 * @property {string} value
 */

/**
 * Options of a declared header control; which ones apply depends on the control type.
 * @typedef {object} HeaderControlOptions
 * @property {boolean} [hidden] - Keep the control built but out of sight.
 * @property {string} [label] - Select or menu label, mode-switch group name; set from the glossary entry `glossarySubKey` names.
 * @property {string} [tooltipText] - Select or menu tooltip; set from the glossary entry `glossarySubKey` names.
 * @property {string} [glossarySubKey] - Key of the view's glossary `interface` entry that labels the control.
 * @property {ReadonlyArray<HeaderControlItem>} [items]
 * @property {string|null} [value] - The active choice.
 * @property {string} [containerClass] - Owner-local class on a select's field.
 */

/**
 * A control's options as it renders: every item labelled.
 * @typedef {Omit<HeaderControlOptions, 'items'> & {items: ReadonlyArray<RenderedControlItem>}} RenderedControlOptions
 */

const CONTROL_TYPES = Object.freeze({
    modeSwitch: ModeSwitchModule,
    select: SelectControlModule,
    menu: MenuControlModule,
});

/**
 * A header control as a view declares it.
 * @typedef {object} HeaderControlDefinition
 * @property {keyof typeof CONTROL_TYPES} type
 * @property {string} id - Reported with every change.
 * @property {HeaderControlOptions} options
 */

/**
 * A header control as the header renders it: the orchestrator's labelled copy.
 * @typedef {Omit<HeaderControlDefinition, 'options'> & {options: RenderedControlOptions}} RenderedControlDefinition
 */

/**
 * What one header render shows.
 * @typedef {object} HeaderRenderPayload
 * @property {string} headerText - The view title.
 * @property {string|null} iconName - Material Symbols icon beside the title.
 * @property {string} subtitle - None when empty.
 * @property {boolean} tour - Offer the guided walkthrough button.
 * @property {ReadonlyArray<RenderedControlDefinition>} controls - Built with their current state and labelled.
 */

/** @typedef {'notes'|'info'} HeaderActionButtonName */

/**
 * The header's options: the app's context, whose glossary labels the action buttons, and
 * where it reports a control change and an action-button click.
 * @typedef {import('@tba3/module-base').BaseOptions & {
 *   context: import('@tba3/modules/context').ModuleContext,
 *   onControlChanged: (controlId: string, change: HeaderControlChange) => void,
 *   onNotesClicked: () => void,
 *   onInfoClicked: () => void,
 * }} HeaderOptions
 */

/**
 * The header's action buttons, in display order: the glossary entry that labels each,
 * its icon, the `data-header-action-button` hook a tour step anchors to, and the
 * option callback a click reports through.
 * @type {Readonly<{[name in HeaderActionButtonName]: {labelGlossaryPath: string, iconName: string, action: string, onClick: 'onNotesClicked'|'onInfoClicked'}}>}
 */
const ACTION_BUTTONS = Object.freeze({
    notes: {
        labelGlossaryPath: 'general.buttons.element_texts.notes-toggle.label',
        iconName: 'edit_note',
        action: 'notes-toggle',
        onClick: 'onNotesClicked',
    },
    info: {
        labelGlossaryPath: 'general.buttons.element_texts.tour-start.label',
        iconName: 'info',
        action: 'tour-start',
        onClick: 'onInfoClicked',
    },
});

/** @typedef {ModeSwitchModule|SelectControlModule|MenuControlModule} HeaderControlModule */

/**
 * Drops the header to two rows (header-module.css): set while one row cannot hold title,
 * controls and actions.
 */
const STACKED_CLASS = 'header-module--stacked';

/** @augments {BaseModule<HeaderOptions>} */
export class HeaderModule extends BaseModule {
    /**
     * @override
     * @type {import('lit').PropertyDeclarations}
     */
    static properties = { payload: { attribute: false } };

    /** @type {Map<string, HeaderControlModule>} By control id. */
    #controls = new Map();

    /** @type {number} The width the row fit was last measured at; 0 before one. */
    #fittedWidth = 0;

    /** @type {{[name in HeaderActionButtonName]: boolean}} Whether each action button's thing is on. */
    #pressed = { notes: false, info: false };

    /** Stable click handlers, one per action-button callback option. */
    #actionHandlers = {
        onNotesClicked: () => this.options.onNotesClicked(),
        onInfoClicked: () => this.options.onInfoClicked(),
    };

    constructor() {
        super();
        /** @type {HeaderRenderPayload|null} What the header shows; null before a view asked for it. */
        this.payload = null;
    }

    /** @override */
    _setup() {
        super._setup();
        this.classList.add('header-module');
        // Without the default debounce: the next timer task, not 100 ms of a squeezed or
        // needlessly stacked header. Only a new width can change the fit; the height
        // changes the switch itself causes do not re-measure.
        this.resources.trackSubscription(
            resizeService.observe(
                this,
                () => {
                    if (this.clientWidth !== this.#fittedWidth) this.#fitRow();
                },
                { debounceMs: 0 },
            ),
        );
        // A font swap widens the children without resizing the header.
        void document.fonts.ready.then(() => this.#fitRow());
    }

    // ========================================================================
    // LAYOUT
    // ========================================================================

    /**
     * Stack the header when title, controls and actions do not fit one row: measured in
     * the one-row layout itself, so nothing but what it shows decides.
     */
    #fitRow() {
        // Hidden or gone: nothing to measure, keep the layout it has, and re-measure on the
        // next width it shows at, even the one it was last fitted at.
        if (!this.isConnected || this.clientWidth === 0) {
            this.#fittedWidth = 0;
            return;
        }
        this.#fittedWidth = this.clientWidth;
        this.classList.remove(STACKED_CLASS);
        this.classList.toggle(STACKED_CLASS, !this.#oneRowFits());
    }

    /**
     * Whether the one-row layout holds everything: the control list (which may shrink
     * below its content) shows all of it, and no cell runs into the next. The title
     * column never narrows below its longest word, so it is the others that give.
     * @returns {boolean}
     */
    #oneRowFits() {
        const list = /** @type {HTMLElement|null} */ (
            this.querySelector(':scope > .header-module-control-list')
        );
        const cells = [
            this.querySelector(':scope > .header-module-title'),
            list,
            this.querySelector(':scope > .header-module-actions'),
        ]
            .filter((cell) => cell instanceof HTMLElement)
            // A cell out of the layout (an empty control list) takes no room.
            .filter((cell) => cell.checkVisibility())
            .map((cell) => cell.getBoundingClientRect());
        const overlaps = cells.some(
            (cell, index) =>
                index > 0 && Math.round(cells[index - 1].right) > Math.round(cell.left),
        );
        return !overlaps && (!list || list.scrollWidth <= list.clientWidth);
    }

    // ========================================================================
    // CONTROLS
    // ========================================================================

    /**
     * Bring the control modules in line with the controls a new payload shows. A control
     * keeps its module, and so its element and the focus on the button just clicked, for
     * as long as its id and type stay: it takes the new declaration in place. A hidden
     * control is built too, so that state which reveals it later shows it where it
     * stands. A control no longer declared drops out of the render, which removes it.
     * @override
     * @param {import('lit').PropertyValues<this>} changed
     */
    willUpdate(changed) {
        if (!changed.has('payload') || !this.payload) return;
        const stale = new Map(this.#controls);
        for (const { type, id, options } of this.payload.controls) {
            const Control = CONTROL_TYPES[type];
            if (!Control) throw new Error(`HeaderModule: unknown control type '${type}'`);
            let control = this.#controls.get(id);
            if (control instanceof Control) {
                stale.delete(id);
                control.view = options;
            } else {
                control = this.#createControl(Control, id, options);
            }
            if (options.hidden) control.hide();
            else control.show();
        }
        for (const [id, control] of stale) {
            if (this.#controls.get(id) === control) this.#controls.delete(id);
        }
        // Once the controls have rendered their new widths, in the same task, so the
        // header paints in the layout that fits.
        void this._whenTemplateRendered()
            .then(() => Promise.all([...this.#controls.values()].map((c) => c.updateComplete)))
            .then(() => this.#fitRow());
    }

    /**
     * Build one control module.
     * @param {(new () => HeaderControlModule) & Pick<typeof BaseModule, 'create'>} Control - The module class its type names.
     * @param {string} id
     * @param {RenderedControlOptions} options
     * @returns {HeaderControlModule} Placed by the next render.
     */
    #createControl(Control, id, options) {
        // Namespaced with the module id, so the control's DOM ids stay unique on the page.
        const control = Control.create(`${this.id}-${id}`, {
            ...options,
            onChange: (/** @type {HeaderControlChange} */ data) =>
                this.options.onControlChanged(id, data),
        });
        this.#controls.set(id, control);
        return control;
    }

    // ========================================================================
    // RENDER
    // ========================================================================

    /**
     * Title, subtitle, controls and action buttons; a re-render patches what is on
     * screen, so controls and buttons keep their elements.
     * @override
     * @returns {unknown}
     */
    render() {
        const payload = this.payload;
        if (!payload) return nothing;
        const { headerText, iconName, subtitle, tour, controls } = payload;

        // Every child pins its own grid cell in CSS, so this order is the reading order
        // for assistive tech, not the visual order. The control list holds nothing but
        // its controls: `:empty` hides a list without any.
        const controlList = repeat(
            controls,
            (control) => control.id,
            (control) => this.#controls.get(control.id),
        );
        const subtitleLine = subtitle
            ? html`<p class="header-module-subtitle">${subtitle}</p>`
            : nothing;
        const infoButton = tour ? this.#actionButtonTemplate('info') : nothing;
        return html`${this.#titleTemplate(headerText, iconName)}${subtitleLine}
            <div class="header-module-control-list">${controlList}</div>
            <div class="header-module-actions">
                ${this.#actionButtonTemplate('notes')}${infoButton}
            </div>`;
    }

    /**
     * The view title — the page's one <h1>, the element that names the page.
     * @param {string} headerText
     * @param {string|null} iconName - Material Symbols icon name, when the view has one
     * @returns {import('lit').TemplateResult}
     */
    #titleTemplate(headerText, iconName) {
        const glyph = iconName ? renderIcon(iconName) : nothing;
        const icon = iconName
            ? html`<span class="header-module-title-icon" aria-hidden="true">${glyph}</span>`
            : nothing;
        return html`<h1 class="header-module-title">${icon}${headerText}</h1>`;
    }

    // ========================================================================
    // ACTION BUTTONS
    // ========================================================================

    /**
     * One action button. A click only reports: the app owns whether the drawer or the
     * tour is on, and shows it through setActionPressed().
     * @param {HeaderActionButtonName} name
     * @returns {import('lit').TemplateResult}
     */
    #actionButtonTemplate(name) {
        const { labelGlossaryPath, iconName, action, onClick } = ACTION_BUTTONS[name];
        const label = this.options.context.glossary.getRequiredEntryText(labelGlossaryPath);
        return headerActionButton({
            name: action,
            ariaLabel: label,
            pressed: this.#pressed[name],
            buttonContent: renderIcon(iconName),
            onClick: this.#actionHandlers[onClick],
        });
    }

    /**
     * Show whether the thing an action button toggles is on.
     * @param {HeaderActionButtonName} name
     * @param {boolean} pressed - Whether the notes drawer is open or the tour running.
     */
    setActionPressed(name, pressed) {
        this.#pressed[name] = pressed;
        this.requestUpdate();
    }
}

customElements.define('tba-header', HeaderModule);
