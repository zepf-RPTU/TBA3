/**
 * The welcome view's `viewConfig` entry. Kept apart from
 * welcomeSplashViewModule.js so the config (evaluated at boot) does not pull the view
 * module in before it is navigated to.
 */

/**
 * The welcome view's entry; its header copy is the app's `<app>.welcome.header`.
 * @type {import('../app/appModule.js').ViewConfigEntry}
 */
export const WELCOME_VIEW_CONFIG = Object.freeze({
    // The greeting and the nav cards read no document, so the page shows while the
    // dataset loads.
    needsData: false,
    icon: 'home',
    skeleton: 'stack',
    load: () => import('./welcomeSplashViewModule.js').then((m) => m.WelcomeSplashViewModule),
});
