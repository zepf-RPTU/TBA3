/**
 * SidebarModule — self-contained sidebar chrome for the dashboard shell.
 *
 * Owns the sidebar concern: the
 * navigation sidebar HTML (view buttons) and the two settings pickers — KS color
 * theme and light/dark colour scheme (render + wiring + active-state sync). It is a plain collaborator the app coordinator
 * *has*, not a `BaseModule` subclass — dependencies are injected, DOM listeners
 * are registered on the coordinator's resource tracker so cleanup cascades, and
 * it emits its one outward intent (rebuild the active view after a theme switch)
 * via an injected callback rather than reaching into app internals.
 * @module sidebarModule
 */

import { escapeHtml, iconSvg } from '@tba3/module-base';
import { glossaryAnnotator } from '@tba3/modules/glossary';
import {
    applyColorScheme,
    applyKsTheme,
    COLOR_SCHEMES,
    DATA_THEME_ID,
    getActiveColorScheme,
    getActiveKsTheme,
    getAvailableKsThemes,
    getBandColorsByLevel,
    getScaleLevelNames,
} from '@tba3/modules/theme';
import './sidebarModule.css';

export class SidebarModule {
    /** @type {object | null} */
    #sidebarConfig;
    /** @type {{[viewType: string]: object}} */
    #viewConfig;
    /** @type {string|null} */
    #defaultView;
    /** @type {import('@tba3/module-base/utils/resourceTracker.js').ResourceTracker} */
    #resources;
    /** @type {() => void} */
    #onThemeChanged;
    /** @type {(viewType: string) => void} */
    #onViewSelected;

    // Cached sidebar element for cleanup
    /** @type {HTMLElement|null} */
    #sidebarElement = null;
    // viewType -> nav button, captured at render time so setActiveView() does not
    // re-query the DOM on every view switch.
    /** @type {{[viewType: string]: HTMLElement}} */
    #viewButtonElements = {};

    /**
     * @param {object} deps - The sidebar’s configuration and the callbacks it drives the app through.
     * @param {object | null} deps.sidebarConfig - Sidebar config (title); null skips the sidebar
     * @param {{[viewType: string]: {label: string}}} deps.viewConfig - View configuration entries with their resolved `label` (source of the nav buttons)
     * @param {string|null} deps.defaultView - Default view id (its button renders active)
     * @param {import('@tba3/module-base/utils/resourceTracker.js').ResourceTracker} deps.resources - Coordinator resource tracker (for DOM-listener cleanup)
     * @param {() => void} deps.onThemeChanged - Refresh the active view's charts after a KS theme or colour-scheme switch
     * @param {(viewType: string) => void} deps.onViewSelected - Switch to the view whose nav button was clicked
     */
    constructor({
        sidebarConfig,
        viewConfig,
        defaultView,
        resources,
        onThemeChanged,
        onViewSelected,
    }) {
        this.#sidebarConfig = sidebarConfig ?? null;
        this.#viewConfig = viewConfig ?? {};
        this.#defaultView = defaultView ?? null;
        this.#resources = resources;
        this.#onThemeChanged = onThemeChanged;
        this.#onViewSelected = onViewSelected;
    }

    // ========================================================================
    // PUBLIC API (called by the app coordinator)
    // ========================================================================

    /**
     * Build the navigation sidebar — when configured — and insert it into
     * document.body.
     */
    render() {
        if (this.#sidebarConfig) {
            this.#createSidebarElement();
        }
    }

    /**
     * Wire each nav button to switch to its view, and the rail itself to expand
     * on tap. Reuses the map captured at render time, so the buttons are
     * resolved exactly once, by the code that rendered them.
     *
     * Deliberately not called from render(): that runs while the coordinator is
     * still initializing, and a click landing then would switch views too early.
     * The coordinator calls this once its components are up.
     *
     * No-op when no sidebar is configured — there are no buttons to wire.
     */
    setupViewNavigation() {
        if (!this.#sidebarElement) return;

        Object.entries(this.#viewConfig).forEach(([viewType, viewData]) => {
            const button = this.#viewButtonElements[viewType];
            if (!button) {
                console.warn(
                    `SidebarModule: no nav button rendered for view ${viewType} (ID: ${viewData.buttonId})`,
                );
                return;
            }
            this.#resources.trackDomListener(button, 'click', () => {
                // A view switch ends the disclosure: the labels have done their job.
                this.#sidebarElement?.classList.remove('is-expanded');
                this.#onViewSelected?.(viewType);
            });
        });

        this.#setupRailDisclosure();
    }

    /**
     * Wire the sidebar settings pickers: apply the chosen KS theme or colour scheme
     * and refresh the active view's charts so those that bake resolved colors pick up
     * the new palette. CSS-`var()`-driven surfaces update instantly via the
     * `data-ks-theme` / `data-color-scheme` attributes on <html>.
     */
    setupThemeControls() {
        if (!this.#sidebarElement) return;

        const schemeOptions = /** @type {NodeListOf<HTMLElement>} */ (
            this.#sidebarElement.querySelectorAll('[data-color-scheme-option]')
        );
        schemeOptions.forEach((option) => {
            this.#resources.trackDomListener(option, 'click', () => {
                const schemeId = option.dataset.colorSchemeOption;
                if (!schemeId || schemeId === getActiveColorScheme()) return;

                applyColorScheme(schemeId);
                this.#syncColorSchemeControls();
                void this.#onThemeChanged?.();
            });
        });

        // The sidebar HTML is built before the data fetch, so the picker was rendered
        // without knowing whether the payload carries a state palette. Rebuild it here
        // — the coordinator calls this after initializeComponents(), by which point the
        // competence-level scale is registered.
        const optionsGroup = this.#sidebarElement.querySelector('.sidebar-ks-theme-options');
        if (optionsGroup) {
            optionsGroup.innerHTML = this.#generateKsThemeOptionsHTML();
        }

        const options = /** @type {NodeListOf<HTMLElement>} */ (
            this.#sidebarElement.querySelectorAll('[data-ks-theme-option]')
        );
        options.forEach((option) => {
            const handler = () => {
                const themeId = option.dataset.ksThemeOption;
                if (!themeId || themeId === getActiveKsTheme()) return;

                applyKsTheme(themeId);
                this.#syncKsThemeControls();
                void this.#onThemeChanged?.();
            };
            this.#resources.trackDomListener(option, 'click', handler);
        });
    }

    /**
     * Reflect the active view in the nav buttons. The sidebar renders these
     * buttons and stamps the default view's initial state, so it owns their
     * active state for the rest of the session too; the coordinator just says
     * which view won.
     *
     * No-op when no sidebar is configured — there are no buttons to update.
     * @param {string} activeViewType - The view type that should be active
     */
    setActiveView(activeViewType) {
        Object.entries(this.#viewButtonElements).forEach(([viewType, button]) => {
            const isActive = viewType === activeViewType;
            button.classList.toggle('is-active', isActive);
            if (isActive) {
                button.setAttribute('aria-current', 'page');
            } else {
                button.removeAttribute('aria-current');
            }
        });
    }

    /**
     * Remove the sidebar from document.body. DOM listeners are owned by the
     * coordinator's resource tracker and cleaned up separately.
     */
    destroy() {
        if (this.#sidebarElement && this.#sidebarElement.parentNode) {
            this.#sidebarElement.parentNode.removeChild(this.#sidebarElement);
        }

        // Dropped with the DOM they point at, so a late setActiveView() cannot
        // restyle detached nodes and the map cannot pin the removed subtree.
        this.#viewButtonElements = {};
    }

    // ========================================================================
    // PRIVATE HELPERS
    // ========================================================================

    /**
     * Let a tap on the rail expand it, since `:hover` cannot on a touch device
     * (sidebar.css). `.is-expanded` is the ungated twin of the hover rule, so a
     * mouse must not set it: `:hover` ends when the cursor leaves but the class
     * does not, and `.sidebar ~ .main-content` keeps its static 60px offset, so a
     * latched rail would sit over 190px of dashboard with nothing to close it.
     * The gate is the click's own `pointerType` — per interaction, like
     * tooltipService's, not the per-device axis the CSS uses.
     *
     * Delegated to the sidebar element rather than bound to its parts on
     * purpose — setupThemeControls() runs right after this and rewrites
     * `.sidebar-settings-options`, which would drop any listener attached to the
     * option buttons themselves.
     */
    #setupRailDisclosure() {
        const sidebar = this.#sidebarElement;
        if (!sidebar) return;

        this.#resources.trackDomListener(sidebar, 'click', (event) => {
            if (/** @type {PointerEvent} */ (event).pointerType === 'mouse') return;
            // Buttons carry their own verbs; only the rail's own surface toggles.
            if (/** @type {HTMLElement} */ (event.target).closest('button')) return;
            sidebar.classList.toggle('is-expanded');
        });

        // Capture, not bubble: several in-content controls call stopPropagation()
        // on their own click (the table's preview trigger, a progress-bar column
        // header, a scatterplot point), and a bubble-phase listener never sees
        // those — the rail would stay open behind them. Same fix, same reason as
        // the body-level handler in tooltipService.js.
        this.#resources.trackDomListener(
            document,
            'click',
            (event) => {
                if (sidebar.contains(/** @type {Node} */ (event.target))) return;
                sidebar.classList.remove('is-expanded');
            },
            { capture: true },
        );

        // The rail is dismissible, so it answers Escape like every other
        // dismissible surface. Bubble phase and guarded on the class so it cannot
        // preempt SingletonOverlay's capture-phase handler: an open overlay
        // consumes the key, and the rail only collapses when it is the thing open.
        this.#resources.trackDomListener(document, 'keydown', (event) => {
            if (/** @type {KeyboardEvent} */ (event).key !== 'Escape') return;
            if (!sidebar.classList.contains('is-expanded')) return;
            sidebar.classList.remove('is-expanded');
        });
    }

    /**
     * Generate and insert sidebar into the page
     */
    #createSidebarElement() {
        const sidebarConfig = this.#sidebarConfig;
        const viewConfig = this.#viewConfig;

        // Generate view buttons from viewConfig, split into main and bottom-pinned groups
        const mainButtons = [];
        const bottomButtons = [];
        Object.entries(viewConfig).forEach(([viewType, viewData]) => {
            const btn = {
                id: viewData.buttonId,
                icon: viewData.icon,
                text: viewData.label,
                active: viewType === this.#defaultView,
            };
            (viewData.sidebarPinBottom ? bottomButtons : mainButtons).push(btn);
        });

        // Generate sidebar HTML
        const sidebarHTML = this.#generateSidebarHTML({
            title: sidebarConfig.title || 'Dashboard',
            viewButtons: mainButtons,
            bottomButtons,
        });

        // Insert the sidebar right before the main container: `.sidebar ~ .main-content`
        // (sidebarModule.css) needs the order, and the skip link in the entry HTML must
        // stay the page's first focusable element, ahead of the rail.
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = sidebarHTML;
        const sidebarElement = /** @type {HTMLElement|null} */ (tempDiv.firstElementChild);
        if (!sidebarElement) return;
        const mainContent = document.querySelector('.main-content');
        document.body.insertBefore(sidebarElement, mainContent ?? document.body.firstChild);
        this.#sidebarElement = sidebarElement;

        // Resolve the buttons just rendered above, keyed by view. Scoped to the
        // sidebar rather than the document so a page that happens to reuse one
        // of these ids elsewhere cannot capture the wrong element. A missing
        // entry is not warned about here — setupViewNavigation() warns once it
        // goes to wire the same id.
        this.#viewButtonElements = {};
        Object.entries(viewConfig).forEach(([viewType, viewData]) => {
            const button = /** @type {HTMLElement|null} */ (
                sidebarElement.querySelector(`[id="${CSS.escape(viewData.buttonId)}"]`)
            );
            if (button) this.#viewButtonElements[viewType] = button;
        });
    }

    /**
     * Generate sidebar HTML (internalized from sidebarUtils)
     * @param {object} config - Sidebar configuration
     * @returns {string} HTML string for the sidebar
     */
    #generateSidebarHTML(config) {
        const { title = 'Dashboard', viewButtons = [], bottomButtons = [] } = config;

        const renderButtonList = (buttons) =>
            buttons
                .map((btn) => {
                    const buttonIconHTML = iconSvg(btn.icon);

                    return `
                    <li class="sidebar-nav-item">
                        <button id="${escapeHtml(btn.id)}" class="btn btn--text sidebar-nav-button${btn.active ? ' is-active' : ''}"${btn.active ? ' aria-current="page"' : ''}>
                            <span class="sidebar-nav-icon">${buttonIconHTML}</span>
                            <span class="sidebar-nav-text">${escapeHtml(btn.text)}</span>
                        </button>
                    </li>`;
                })
                .join('');

        const bottomNavHTML =
            bottomButtons.length > 0
                ? `
            <nav class="sidebar-nav-bottom" aria-label="${glossaryAnnotator.getRequiredEntryText('general.buttons.element_texts.sidebar-more-views.label')}">
                <ul style="list-style: none; padding: 0; margin: 0;">
${renderButtonList(bottomButtons)}
                </ul>
            </nav>`
                : '';

        const settingsHTML =
            this.#generateColorSchemeSettingsHTML() + this.#generateKsThemeSettingsHTML();

        return `
    <!-- Sidebar Navigation -->
    <aside class="sidebar">
        <div class="sidebar-header">
            <p class="sidebar-title">${escapeHtml(title)}</p>
        </div>
        <div class="sidebar-content">
            <nav class="sidebar-nav" aria-label="${glossaryAnnotator.getRequiredEntryText('general.buttons.element_texts.sidebar-views.label')}">
                <ul style="list-style: none; padding: 0; margin: 0;">
${renderButtonList(viewButtons)}
                </ul>
            </nav>
${bottomNavHTML}${settingsHTML}
        </div>
    </aside>`;
    }

    /**
     * The light/dark picker above the KS theme picker. Three fixed options, so unlike
     * the KS picker it is never regenerated after the data loads.
     * @returns {string} HTML string for the colour-scheme settings section
     */
    #generateColorSchemeSettingsHTML() {
        const activeScheme = getActiveColorScheme();
        const options = COLOR_SCHEMES.map((scheme) => {
            const isActive = scheme.id === activeScheme;
            return `
                    <button type="button" class="sidebar-settings-option interactive-subtle${isActive ? ' is-active' : ''}" aria-pressed="${isActive ? 'true' : 'false'}" data-color-scheme-option="${escapeHtml(scheme.id)}">
                        <span class="sidebar-settings-icon">${iconSvg(scheme.icon)}</span>
                        <span class="sidebar-settings-text">${escapeHtml(scheme.label)}</span>
                    </button>`;
        }).join('');

        return `
            <div class="sidebar-settings">
                <p class="sidebar-settings-title" id="sidebar-scheme-title">Darstellung</p>
                <div class="sidebar-settings-options sidebar-scheme-options" role="group" aria-labelledby="sidebar-scheme-title">
${options}
                </div>
            </div>`;
    }

    /**
     * Generate the KS color-theme picker shown at the bottom of the sidebar.
     * Each option carries a static preview swatch (so it is recognizable in the
     * collapsed icon rail) and a label revealed when the sidebar expands.
     * @returns {string} HTML string for the settings section
     */
    #generateKsThemeSettingsHTML() {
        return `
            <div class="sidebar-settings">
                <p class="sidebar-settings-title" id="sidebar-settings-title">Farbschema</p>
                <div class="sidebar-settings-options sidebar-ks-theme-options" role="group" aria-labelledby="sidebar-settings-title">
${this.#generateKsThemeOptionsHTML()}
                </div>
            </div>`;
    }

    /**
     * The picker's option buttons. Regenerated by `setupThemeControls()` once the data
     * has loaded, since which themes are available depends on the payload.
     * @returns {string} Markup for one option button per available theme, the active one marked.
     */
    #generateKsThemeOptionsHTML() {
        const activeTheme = getActiveKsTheme();

        return getAvailableKsThemes()
            .map((theme) => {
                const isActive = theme.id === activeTheme;
                return `
                    <button type="button" class="sidebar-settings-option interactive-subtle${isActive ? ' is-active' : ''}" aria-pressed="${isActive ? 'true' : 'false'}" data-ks-theme-option="${escapeHtml(theme.id)}">
                        <span class="ks-theme-swatch" data-theme="${escapeHtml(theme.id)}" aria-hidden="true">${this.#generateKsThemeSwatchDotsHTML(theme.id)}</span>
                        <span class="sidebar-settings-text">${escapeHtml(theme.label)}</span>
                    </button>`;
            })
            .join('');
    }

    /**
     * Three preview dots for a theme's swatch. The built-in themes are painted by
     * static rules in sidebar.css; `Landesvorgabe` cannot be, because its colors come
     * from the loaded payload — so it gets its lowest / middle / highest band inline.
     * @param {string} themeId - Theme whose swatch is being drawn.
     * @returns {string} Three preview dots — inline-coloured for `Landesvorgabe`, empty for themes painted by CSS.
     */
    #generateKsThemeSwatchDotsHTML(themeId) {
        if (themeId !== DATA_THEME_ID) {
            return '<span></span><span></span><span></span>';
        }

        // Scope to one scale — a page can hold more than one (e.g. SL's Roman scale
        // alongside its GER one), and picking low/mid/high across mixed scales would
        // produce a meaningless preview.
        const byLevel = getBandColorsByLevel(DATA_THEME_ID);
        const firstLevelName = Object.keys(byLevel)[0];
        const colors = (firstLevelName ? getScaleLevelNames(firstLevelName) : [])
            .map((name) => byLevel[name])
            .filter(Boolean);
        if (colors.length === 0) return '<span></span><span></span><span></span>';

        return [colors[0], colors[Math.floor((colors.length - 1) / 2)], colors[colors.length - 1]]
            .map((color) => `<span style="background:${escapeHtml(color)}"></span>`)
            .join('');
    }

    /**
     * Reflect the chosen colour scheme in its picker's button states.
     */
    #syncColorSchemeControls() {
        if (!this.#sidebarElement) return;

        const activeScheme = getActiveColorScheme();
        /** @type {NodeListOf<HTMLElement>} */ (
            this.#sidebarElement.querySelectorAll('[data-color-scheme-option]')
        ).forEach((option) => {
            const isActive = option.dataset.colorSchemeOption === activeScheme;
            option.classList.toggle('is-active', isActive);
            option.setAttribute('aria-pressed', isActive ? 'true' : 'false');
        });
    }

    /**
     * Reflect the active KS theme in the sidebar picker's button states.
     */
    #syncKsThemeControls() {
        if (!this.#sidebarElement) return;

        const activeTheme = getActiveKsTheme();
        /** @type {NodeListOf<HTMLElement>} */ (
            this.#sidebarElement.querySelectorAll('[data-ks-theme-option]')
        ).forEach((option) => {
            const isActive = option.dataset.ksThemeOption === activeTheme;
            option.classList.toggle('is-active', isActive);
            option.setAttribute('aria-pressed', isActive ? 'true' : 'false');
        });
    }
}
