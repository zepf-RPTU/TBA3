/**
 * SidebarModule — the dashboard shell's navigation rail (view buttons) and its two
 * settings menus, light/dark colour scheme and competence-level color theme.
 *
 * Not a `BaseModule` subclass: dependencies are injected, DOM listeners go on the
 * coordinator's resource tracker so cleanup cascades, and its one outward intent
 * (switch view) is an injected callback. The rail is one lit-html template over the
 * active view, scheme and theme; every change re-renders it in place.
 */

import {
    cssVars,
    headerActionRadioDropdown,
    isModifiedClick,
    onChange,
    renderIcon,
} from '@tba3/module-base';
import { html, nothing, render } from 'lit';

import { repeat } from 'lit/directives/repeat.js';
import { isUnclaimedEscape } from '@tba3/modules/overlays';
import {
    applyColorScheme,
    applyCompetenceLevelTheme,
    COLOR_SCHEMES,
    DATA_THEME_ID,
    getActiveColorScheme,
    getActiveCompetenceLevelTheme,
    getAvailableCompetenceLevelThemes,
    getBandColorsByLevel,
    getRampStops,
} from '@tba3/modules/theme';
import { siteUrl } from '../services/apiClient.js';
import SIDEBAR_LOGO_URL from './RPTU-Zepf-Logo.jpg';
import './sidebarModule.css';

/** @typedef {import('../app/appModule.js').LabelledViewConfigEntry} LabelledViewConfigEntry */

/**
 * @typedef {object} SidebarButton
 * @property {string} viewType - The view it switches to.
 * @property {string} id
 * @property {string} icon - Material Symbols icon name.
 * @property {string} text
 */

export class SidebarModule {
    /** @type {{[viewType: string]: LabelledViewConfigEntry}} */
    #viewConfig;
    /** @type {import('@tba3/module-base').ResourceTracker} */
    #resources;
    /** @type {(viewType: string) => void} */
    #onViewSelected;
    /** @type {import('@tba3/modules/context').ModuleContext} */
    #context;

    /** @type {HTMLElement|null} */
    #sidebarElement = null;
    /** @type {string|null} The view whose nav button shows as current. */
    #activeView = null;

    /**
     * @param {object} deps
     * @param {{[viewType: string]: LabelledViewConfigEntry}} deps.viewConfig - View configuration entries with their resolved `label` (source of the nav buttons)
     * @param {import('@tba3/module-base').ResourceTracker} deps.resources - Coordinator resource tracker (for DOM-listener cleanup)
     * @param {(viewType: string) => void} deps.onViewSelected - Switch to the view whose nav button was clicked
     * @param {import('@tba3/modules/context').ModuleContext} deps.context - The app's context: its glossary words the rail, its palette previews the competence-level themes
     */
    constructor({ viewConfig, resources, onViewSelected, context }) {
        this.#context = context;
        this.#viewConfig = viewConfig;
        this.#resources = resources;
        this.#onViewSelected = onViewSelected;
    }

    // ========================================================================
    // PUBLIC API
    // ========================================================================

    /**
     * Build the navigation sidebar and insert it right before the main container:
     * `.sidebar ~ .main-content` (sidebarModule.css) needs the order, and the skip link
     * in the entry HTML must stay the page's first focusable element, ahead of the rail.
     */
    render() {
        const sidebarElement = document.createElement('aside');
        sidebarElement.className = 'sidebar';
        document.body.insertBefore(
            sidebarElement,
            document.querySelector('.main-content') ?? document.body.firstChild,
        );
        this.#sidebarElement = sidebarElement;
        this.#render();
        // Which themes the competence-level menu offers depends on the scales: redrawn when they land.
        this.#resources.trackSubscription(
            onChange(
                () => this.#context.palette.revision.value,
                () => this.#render(),
            ),
        );
    }

    /**
     * Wire the nav buttons to switch to their view, and the rail itself to expand on
     * tap. One delegated listener on the rail serves every button.
     *
     * Not called from render(), which runs while the coordinator is still initializing:
     * a click landing then would switch views too early. The coordinator calls this
     * once its components are up.
     */
    setupViewNavigation() {
        const sidebar = /** @type {HTMLElement} */ (this.#sidebarElement);
        // The entries are links to the views' hashes: a click with a modifier key is the
        // browser's (a new tab), a plain one navigates through the app.
        this.#resources.trackDomListener(sidebar, 'click', (event) => {
            const button = /** @type {HTMLElement} */ (event.target).closest('[data-view-type]');
            if (!(button instanceof HTMLElement)) return;
            if (isModifiedClick(/** @type {MouseEvent} */ (event))) return;
            event.preventDefault();
            // A view switch collapses the rail.
            sidebar.classList.remove('is-expanded');
            this.#onViewSelected(/** @type {string} */ (button.dataset.viewType));
        });

        this.#setupRailDisclosure();
    }

    /**
     * Reflect the active view in the nav buttons.
     * @param {string} activeViewType
     */
    setActiveView(activeViewType) {
        this.#activeView = activeViewType;
        this.#render();
    }

    /**
     * Remove the sidebar from document.body.
     */
    destroy() {
        this.#sidebarElement?.remove();
        // Dropped with the DOM, so a late setActiveView() cannot restyle detached nodes.
        this.#sidebarElement = null;
    }

    // ========================================================================
    // PRIVATE HELPERS
    // ========================================================================

    /**
     * Let a tap on the rail expand it, since `:hover` cannot on a touch device
     * (sidebarModule.css). `.is-expanded` is the ungated twin of the hover rule, so a
     * mouse must not set it: `:hover` ends when the cursor leaves but the class
     * does not, and `.sidebar ~ .main-content` keeps its static 60px offset, so a
     * latched rail would sit over 190px of dashboard with nothing to close it.
     * The gate is the click's own `pointerType` — per interaction, like
     * tooltipService's, not the per-device axis the CSS uses.
     *
     * Delegated to the sidebar element rather than bound to its parts, so every
     * surface of the rail — the settings block included — toggles it.
     */
    #setupRailDisclosure() {
        const sidebar = /** @type {HTMLElement} */ (this.#sidebarElement);

        this.#resources.trackDomListener(sidebar, 'click', (event) => {
            if (/** @type {PointerEvent} */ (event).pointerType === 'mouse') return;
            // Buttons and the nav links carry their own verbs, and a settings menu is a
            // DOM descendant drawn beside the rail; only the rail's own surface toggles.
            if (/** @type {HTMLElement} */ (event.target).closest('button, a, [popover]')) return;
            sidebar.classList.toggle('is-expanded');
        });

        // Capture, not bubble: several in-content controls call stopPropagation()
        // on their own click (the table's preview trigger, a progress-bar column
        // header, a scatterplot point), and a bubble-phase listener never sees
        // those, so the rail would stay open behind them.
        this.#resources.trackDomListener(
            document,
            'click',
            (event) => {
                if (sidebar.contains(/** @type {Node} */ (event.target))) return;
                sidebar.classList.remove('is-expanded');
            },
            { capture: true },
        );

        // The rail is dismissible, so it answers Escape like every other dismissible
        // surface: an Escape nothing else claimed collapses it and is handled, so an
        // open overlay behind it waits for the next Escape.
        this.#resources.trackDomListener(document, 'keydown', (event) => {
            if (!isUnclaimedEscape(/** @type {KeyboardEvent} */ (event))) return;
            if (!sidebar.classList.contains('is-expanded')) return;
            event.preventDefault();
            sidebar.classList.remove('is-expanded');
        });
    }

    /** Render the rail's content: main nav list, optional bottom-pinned list, settings menus. */
    #render() {
        const sidebar = this.#sidebarElement;
        if (!sidebar) return;
        /** @type {SidebarButton[]} */
        const viewButtons = [];
        /** @type {SidebarButton[]} */
        const bottomButtons = [];
        Object.entries(this.#viewConfig).forEach(([viewType, viewData]) => {
            const btn = {
                viewType,
                id: viewData.buttonId,
                icon: viewData.icon,
                text: viewData.label,
            };
            (viewData.sidebarPinBottom ? bottomButtons : viewButtons).push(btn);
        });

        const bottomNav =
            bottomButtons.length > 0
                ? html`<nav
                      class="sidebar-nav-bottom"
                      aria-label=${this.#label('sidebar-more-views')}
                  >
                      <ul>
                          ${this.#buttonList(bottomButtons)}
                      </ul>
                  </nav>`
                : nothing;

        render(
            html`
                <div class="sidebar-header">
                    <img
                        class="sidebar-logo"
                        src=${SIDEBAR_LOGO_URL}
                        width="400"
                        height="182"
                        alt=${this.#label('sidebar-logo')}
                    />
                </div>
                <div class="sidebar-content">
                    <nav class="sidebar-nav" aria-label=${this.#label('sidebar-views')}>
                        <ul>
                            ${this.#buttonList(viewButtons)}
                        </ul>
                    </nav>
                    ${bottomNav}
                    <div class="sidebar-settings">
                        ${this.#colorSchemeMenu()}${this.#competenceLevelThemeMenu()}
                    </div>
                    <div class="sidebar-legal">
                        <a
                            class="btn btn--text sidebar-nav-button"
                            href=${siteUrl('docs/docs/impressum.html').href}
                            target="_blank"
                            rel="noopener"
                        >
                            <span class="sidebar-nav-icon">${renderIcon('info')}</span>
                            <span class="sidebar-nav-text">${this.#label('sidebar-imprint')}</span>
                            <span class="visually-hidden">${this.#label('new-tab-hint')}</span>
                        </a>
                    </div>
                </div>
            `,
            sidebar,
        );
    }

    /**
     * @param {string} key - Entry under `general.buttons.element_texts`, without `.label`.
     * @returns {string}
     */
    #label(key) {
        return this.#context.glossary.getRequiredEntryText(
            `general.buttons.element_texts.${key}.label`,
        );
    }

    /**
     * @param {SidebarButton[]} buttons
     * @returns {unknown} Their list items, the active view's marked.
     */
    #buttonList(buttons) {
        return repeat(
            buttons,
            (btn) => btn.viewType,
            (btn) => {
                const isActive = btn.viewType === this.#activeView;
                return html`<li class="sidebar-nav-item">
                    <a
                        href="#${btn.viewType}"
                        id=${btn.id}
                        class="btn btn--text sidebar-nav-button ${isActive ? 'is-active' : ''}"
                        data-view-type=${btn.viewType}
                        aria-current=${isActive ? 'page' : nothing}
                    >
                        <span class="sidebar-nav-icon">${renderIcon(btn.icon)}</span>
                        <span class="sidebar-nav-text">${btn.text}</span>
                    </a>
                </li>`;
            },
        );
    }

    /**
     * The light/dark menu: three fixed options, the active one's glyph leading the row.
     * @returns {import('lit').TemplateResult}
     */
    #colorSchemeMenu() {
        const activeScheme = getActiveColorScheme();
        const { icon } = /** @type {(typeof COLOR_SCHEMES)[number]} */ (
            COLOR_SCHEMES.find((scheme) => scheme.id === activeScheme)
        );
        return this.#settingsMenu({
            name: 'color-scheme',
            leading: html`<span class="sidebar-nav-icon">${renderIcon(icon)}</span>`,
            ids: COLOR_SCHEMES.map((scheme) => scheme.id),
            getSelected: getActiveColorScheme,
            onSelect: applyColorScheme,
        });
    }

    /**
     * The competence-level color-theme menu, there from the first paint so the rail does
     * not grow under the cursor once the data lands: the built-in themes need no palette.
     * `Landesvorgabe` is offered only when the registered scale carries colors visible on
     * the active colour scheme, and a palette revision or a scheme switch re-renders the
     * menu with that check redone. The active theme's preview swatch leads the row, so it
     * is recognizable in the collapsed icon rail.
     * @returns {import('lit').TemplateResult}
     */
    #competenceLevelThemeMenu() {
        const { palette } = this.#context;
        return this.#settingsMenu({
            name: 'competence-level-theme',
            leading: html`<span class="competence-level-theme-swatch" aria-hidden="true"
                >${this.#swatchDots(getActiveCompetenceLevelTheme(palette))}</span
            >`,
            ids: getAvailableCompetenceLevelThemes(palette).map((theme) => theme.id),
            getSelected: () => getActiveCompetenceLevelTheme(palette),
            onSelect: applyCompetenceLevelTheme,
        });
    }

    /**
     * One settings row: a rail entry naming the setting, whose leading icon shows the
     * current value, opening a radio menu of the options beside the rail. The accessible
     * name carries the value too, since the row's text does not.
     * @param {object} setting
     * @param {string} setting.name - The glossary key after `sidebar-`; each option's label sits under `sidebar-<name>-<id>`.
     * @param {unknown} setting.leading - The row's leading icon or swatch.
     * @param {string[]} setting.ids - The options, in menu order.
     * @param {() => string} setting.getSelected
     * @param {(id: string) => unknown} setting.onSelect - Applies the picked option.
     * @returns {import('lit').TemplateResult}
     */
    #settingsMenu({ name, leading, ids, getSelected, onSelect }) {
        const title = this.#label(`sidebar-${name}`);
        const optionLabel = (/** @type {string} */ id) => this.#label(`sidebar-${name}-${id}`);
        return headerActionRadioDropdown({
            name,
            ariaLabel: `${title}: ${optionLabel(getSelected())}`,
            // Like every rail entry, none: it would cover the row below.
            tooltipText: '',
            family: 'text',
            buttonClass: 'sidebar-nav-button sidebar-settings-trigger',
            buttonContent: html`${leading}<span class="sidebar-nav-text">${title}</span
                ><span class="sidebar-settings-chevron">${renderIcon('chevron_right')}</span>`,
            dropdownClass: `sidebar-settings-menu sidebar-${name}-menu`,
            menuLabel: title,
            placement: 'right-end',
            options: ids.map((id) => ({ id, label: optionLabel(id) })),
            getSelected,
            onSelect: (id) => {
                // The page repaints through the cascade; the re-render redraws the rows and
                // redoes the theme menu's `Landesvorgabe` check.
                onSelect(id);
                this.#render();
            },
        });
    }

    /**
     * Three preview dots for a theme's swatch: the lowest / middle / highest colour. A
     * built-in theme sets its light and dark ramp stops as one `light-dark()` `--swatch`;
     * `Landesvorgabe` sets its payload bands as the active scheme paints them, redrawn on
     * a scheme pick.
     * @param {string} themeId
     * @returns {import('lit').TemplateResult[]} Empty dots when the payload has no bands.
     */
    #swatchDots(themeId) {
        /** @type {Array<{[property: string]: string}>} */
        let dots;
        if (themeId !== DATA_THEME_ID) {
            const light = getRampStops(themeId, 'light');
            const dark = getRampStops(themeId, 'dark');
            dots = [0, 2, 4].map((i) => ({ '--swatch': `light-dark(${light[i]}, ${dark[i]})` }));
        } else {
            // Scope to one scale — a page can hold more than one, and picking
            // low/mid/high across mixed scales would produce a meaningless preview.
            const { palette } = this.#context;
            const byLevel = getBandColorsByLevel(palette, DATA_THEME_ID);
            const colors = palette
                .getLeadingScaleLevels()
                .map(({ name }) => byLevel[name])
                .filter(Boolean);
            dots =
                colors.length === 0
                    ? [{}, {}, {}]
                    : [
                          colors[0],
                          colors[Math.floor((colors.length - 1) / 2)],
                          colors[colors.length - 1],
                      ].map((color) => ({ '--swatch': color }));
        }
        return dots.map((vars) => html`<span ${cssVars(vars)}></span>`);
    }
}
