/**
 * MaWelcomeViewModule — the MA landing view: the shared welcome splash with MA's
 * greeting and nav-card catalog.
 */

import { WelcomeSplashViewModule } from '../../common/views/welcomeSplashViewModule.js';
import { getDefaultNavCardConfig } from '../maConstants.js';

export class MaWelcomeViewModule extends WelcomeSplashViewModule {
    /**
     * @param {string} id - Unique identifier for this module
     * @param {HTMLElement} container - Container element
     * @param {import('./maLayoutViewBase.js').MAViewModuleOptions} [options={}] - Configuration options
     */
    constructor(id, container, options = {}) {
        super(id, container, options, {
            appPrefix: 'ma',
            greetingKey: 'ma.welcome.greeting',
            navCardsKey: 'ma.nav-cards',
            buildNavConfig: getDefaultNavCardConfig,
        });
    }
}
