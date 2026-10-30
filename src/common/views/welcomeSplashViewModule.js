/**
 * WelcomeSplashViewModule — a landing view: a greeting card over the splash background
 * with the navigation cards below. The app id prefixes the child ids
 * and the glossary keys; the cards' extras come from each view entry's `navCard`.
 */

import { ContentModule, trusted } from '@tba3/module-base';
import { html, render } from 'lit';
import { BaseViewModule } from '../modules/baseViewModule.js';
import { NavCardModule, viewNavCardItems } from '../modules/navCard/navCardModule.js';

/** The greeting card: title and body are its glossary entry's `title` and `body`. */
class GreetingModule extends ContentModule {
    /** @override */
    async _renderBody() {
        render(trusted(this.glossaryBody), this.contentContainer);
    }
}

customElements.define('tba-greeting', GreetingModule);

export class WelcomeSplashViewModule extends BaseViewModule {
    /** @type {GreetingModule|null} */
    #greetingModule = null;
    /** @type {NavCardModule|null} */
    #navCardModule = null;

    /**
     * @override
     * @returns {Promise<void>}
     */
    async _renderView() {
        this.#constructModules();
        this.#render();
    }

    #render() {
        const { glossary } = this.options.context;
        const label = glossary.getRequiredEntryText('general.messages.splash-placeholder');
        // Glossary markup: the license asks for a link to Freepik.
        const credit = trusted(
            glossary.getRequiredEntryText('general.messages.splash-image-credit'),
        );
        this.classList.add('welcome-splash');
        render(
            html`
                <div class="welcome-container">${this.#greetingModule}${this.#navCardModule}</div>
                <div class="welcome-image-notice">
                    <span class="welcome-image-notice-label">${label}</span>
                    <span>${credit}</span>
                </div>
            `,
            this,
        );
    }

    #constructModules() {
        const { appId } = this.options.context;
        this.#greetingModule = GreetingModule.create(`${appId}-welcome-greeting`, {
            ...this._childOptions(),
            glossaryKey: `${appId}.welcome.greeting`,
            showModuleTitle: true,
            bodyClassName: 'welcome-greeting-body',
        });
        this.#greetingModule.className = 'welcome-greeting';

        this.#navCardModule = NavCardModule.create(`${appId}-welcome-nav-cards`, {
            ...this._childOptions(),
            // The grid is the .welcome-cards panel itself, not a module card.
            showModuleCard: false,
            items: viewNavCardItems(this.options.viewConfig, 'icon').filter(
                (item) => item.viewTarget !== this.options.viewKey,
            ),
            onNavigate: (viewTarget, statePatch) => this.navigate(viewTarget, { statePatch }),
            glossaryKey: `${appId}.nav-cards`,
        });
        this.#navCardModule.className = 'welcome-cards';
    }
}

customElements.define('tba-welcome-splash-view', WelcomeSplashViewModule);
