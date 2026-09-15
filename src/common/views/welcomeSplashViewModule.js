/**
 * WelcomeSplashViewModule — the landing view EN and MA share: a greeting card over the
 * splash background with the navigation cards below.
 *
 * Each app's subclass supplies only the glossary keys and the nav-card catalog. The
 * corner notice carries the credit the background's Freepik license requires wherever
 * the image is shown; the chooser repeats it as static markup, having no glossary.
 */

import { glossaryAnnotator } from '@tba3/modules/glossary';
import { BaseViewModule } from '../modules/baseViewModule.js';
import { NavCardModule } from '../modules/navCard/navCardModule.js';
import { TextModule } from './textModule.js';
import './welcomeSplashViewModule.css';

/**
 * @typedef {object} WelcomeSplashSpec
 * @property {string} appPrefix - `en` / `ma`; prefixes the view class and the child ids
 * @property {string} greetingKey - Glossary key of the greeting text
 * @property {string} navCardsKey - Glossary key of the nav-cards module
 * @property {(navigate: (viewTarget: string, options?: object) => void) => object} buildNavConfig - The app's nav-card catalog, bound to this view's `navigate`
 */

export class WelcomeSplashViewModule extends BaseViewModule {
    /** @type {WelcomeSplashSpec} */
    #spec;
    /** @type {TextModule|null} */
    #greetingModule = null;
    /** @type {NavCardModule|null} */
    #navCardModule = null;

    /**
     * @param {string} id - Unique identifier for this module
     * @param {HTMLElement} container - Container element
     * @param {import('../modules/baseViewModule.js').ViewModuleOptions} options - Configuration options
     * @param {WelcomeSplashSpec} spec - What is app-specific about this welcome view
     */
    constructor(id, container, options, spec) {
        super(id, container, options);
        this.#spec = spec;
    }

    /**
     * Render the welcome view
     * @override
     * @param {object} _data - Data for rendering
     * @returns {Promise<void>}
     */
    async _renderView(_data = {}) {
        this.#createDOM();
        this.#constructModules();
        await this.#hydrateModules();
    }

    get #greetingContainerId() {
        return `${this.#spec.appPrefix}-welcome-greeting`;
    }

    get #navCardsContainerId() {
        return `${this.#spec.appPrefix}-welcome-nav-cards`;
    }

    #createDOM() {
        const container = this.container;
        if (!container) return;
        container.className = `${this.#spec.appPrefix}-welcome-view welcome-splash view-base`;
        container.innerHTML = `
            <div class="welcome-container">
                <div class="welcome-greeting" id="${this.#greetingContainerId}"></div>
                <div class="welcome-cards" id="${this.#navCardsContainerId}"></div>
            </div>
            <div class="welcome-image-notice">
                <span class="welcome-image-notice-label">${glossaryAnnotator.getRequiredEntryText('general.messages.splash-placeholder')}</span>
                <span class="welcome-image-notice-credit">${glossaryAnnotator.getRequiredEntryText('general.messages.splash-image-credit')}</span>
            </div>
        `;
    }

    #constructModules() {
        const greetingContainer = this.getContainer(this.#greetingContainerId, 'Greeting');
        if (greetingContainer) {
            this.#greetingModule = new TextModule(this.#greetingContainerId, greetingContainer, {
                ...this._childOptions(),
                glossaryKey: this.#spec.greetingKey,
            });
            this.registerChildModule(this.#greetingModule);
        }

        const navCardsContainer = this.getContainer(this.#navCardsContainerId, 'Nav Cards');
        if (!navCardsContainer) return;

        const navConfig = this.#spec.buildNavConfig((viewTarget, options) =>
            this.navigate(viewTarget, options),
        );
        this.#navCardModule = new NavCardModule(this.#navCardsContainerId, navCardsContainer, {
            ...this._childOptions(),
            ...navConfig,
            // No module title: the nav cards render directly into the shared
            // .welcome-cards grid.
            showModuleTitle: false,
            currentView: 'welcome',
            glossaryKey: this.#spec.navCardsKey,
        });
        this.registerChildModule(this.#navCardModule);
    }

    /**
     * Mount + hydrate both modules.
     *
     * The greeting is mounted early on purpose: `TextModule` shows a module title, so its
     * mount builds a header and a body, and `welcome-greeting-body` has to land on that
     * body rather than on the wrapper. The nav cards need no such thing — they set
     * `showModuleTitle: false`, so their `contentContainer` is the `.welcome-cards` div
     * whether they are mounted or not, and `_hydrateChildren` mounts them anyway.
     * @returns {Promise<void>}
     */
    async #hydrateModules() {
        this.#greetingModule?.mount({});
        this.#greetingModule?.contentContainer.classList.add('welcome-greeting-body');
        await this._hydrateChildren([[this.#greetingModule], [this.#navCardModule]]);
    }
}
