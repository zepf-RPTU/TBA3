/**
 * EnWelcomeViewModule — the EN landing view: the shared welcome splash with EN's
 * greeting and nav-card catalog.
 */

import { WelcomeSplashViewModule } from '../../common/views/welcomeSplashViewModule.js';
import { getDefaultNavCardConfig } from '../enConstants.js';

export class EnWelcomeViewModule extends WelcomeSplashViewModule {
    /**
     * @param {string} id - Unique identifier for this module
     * @param {HTMLElement} container - Container element
     * @param {import('../../common/modules/baseViewModule.js').ViewModuleOptions} [options={}] - Configuration options
     */
    constructor(id, container, options = {}) {
        super(id, container, options, {
            appPrefix: 'en',
            greetingKey: 'en.welcome.greeting',
            navCardsKey: 'en.nav-cards',
            buildNavConfig: getDefaultNavCardConfig,
        });
    }
}
