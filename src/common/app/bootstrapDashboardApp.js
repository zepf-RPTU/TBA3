import { noticeCallout, requireEl, waitForLayout } from '@tba3/module-base';
import { applyTemplateTokens, resolveDotPath } from '@tba3/module-base/glossary';
import { html, nothing, render } from 'lit';
import shellGlossary from './shellGlossary.json' with { type: 'json' };
import { installDefaultTrustedTypesPolicy } from './trustedTypes.js';
import { initColorScheme, initCompetenceLevelThemeFromStorage } from '@tba3/modules/theme';
import { loadCauseKey } from './loadFailure.js';
import { skeletonHoldDelay } from './viewSkeleton.js';
import { installGlobalErrorNotifications } from '../services/notificationService.js';
import { claimExportTab } from '../export/exportTab.js';
import { exportImageStore } from '../export/exportImageStore.js';

/**
 * Id of the cold-start placeholder each dashboard's HTML ships
 * (see src/styles/skeleton.css).
 * @type {string}
 */
const APP_SKELETON_ID = 'app-skeleton';

/** @typedef {import('./appModule.js').BaseAppModule<any>} DashboardApp */

/**
 * A dashboard's app class, as bootstrap constructs it: its `defaultOptions` carry its
 * spec.
 * @typedef {(new () => DashboardApp) & Pick<typeof import('./appModule.js').BaseAppModule, 'create'>} DashboardAppClass
 */

/**
 * Bootstrap one dashboard: put its app in the page's `.main-content` placeholder, wait
 * for its first render, and replace the cold-start placeholder — rendering an inline
 * error rather than throwing when initialisation fails.
 * @param {object} config
 * @param {DashboardAppClass} config.AppModule
 * @param {string} config.appId - Which dashboard this is (`en`, `ma`, `sl`): the app module's id is `<appId>-app`, and the app's context carries it.
 * @param {string} config.appName - The dashboard's name as the reader knows it (`Englisch 8`), for the inline error when bootstrapping fails.
 * @returns {Promise<DashboardApp|null>} The mounted app, or null when bootstrapping failed and the error was rendered.
 */
export async function bootstrapDashboardApp({ AppModule, appId, appName }) {
    // The page's <main>, which the app replaces; it holds the error when the boot fails.
    const mainContainer = /** @type {HTMLElement} */ (document.querySelector('.main-content'));
    // A failed boot takes the toast channel down again: the inline alert below then
    // names the failure, and what the half-built app throws afterwards is noise.
    let stopErrorNotifications = () => {};
    /** @type {DashboardApp|null} */
    let app = null;

    try {
        // Before Tabulator or Quill write their first string into the page.
        installDefaultTrustedTypesPolicy();

        // The export cart is this tab's (exportTab.js): take the tab's identity before any
        // card reads the cart, then drop what closed tabs of this dashboard left behind.
        await claimExportTab(appId);
        exportImageStore.discardClosedTabs(appId).catch((error) => {
            console.warn("[bootstrap] Could not remove closed tabs' captures:", error);
        });

        // The shell is a fixed, non-scrolling viewport (src/styles/view-layout.css),
        // so a restored scroll offset can only strand it off-screen.
        if ('scrollRestoration' in history) history.scrollRestoration = 'manual';

        // Before first render, to avoid a flash; an OS light/dark flip while "System" is
        // chosen repaints through the cascade like a sidebar switch.
        initCompetenceLevelThemeFromStorage();
        const stopFollowingColorScheme = initColorScheme();

        app = AppModule.create(`${appId}-app`, /** @type {DashboardApp['options']} */ ({ appId }));
        // What the app fails to catch, from its boot on, is reported through the toast
        // channel rather than lost to the console. Reading the context builds it, and
        // throws into the catch below when the glossary does not come up.
        stopErrorNotifications = installGlobalErrorNotifications(app.context.glossary);
        // The app takes the landmark's place and its role: the skip link lands on it.
        app.className = mainContainer.className;
        app.tabIndex = -1;
        app.setAttribute('role', 'main');
        mainContainer.replaceWith(app);
        // The skip link moves focus without following its `#<app>` href: the hash is
        // the router's, where that fragment names no view and enters the history.
        const skipLink = document.querySelector('.skip-link');
        if (skipLink) {
            app.resources.trackDomListener(skipLink, 'click', (event) => {
                event.preventDefault();
                app?.focus();
            });
        }
        // Page-wide, but the app's to take down with itself.
        app.resources.trackSubscription(stopFollowingColorScheme);
        app.resources.trackSubscription(stopErrorNotifications);
        const initialized = app.contentComplete;
        // The placeholder covers only the boot of the shell: once the sidebar and
        // header are up and the first view is covered by its own placeholder, the
        // page is the app's, while the view waits for its data. Give layout its
        // frames first, or the placeholder comes off over a not-yet-painted shell.
        await Promise.race([app.whenShellReady(), initialized]);
        await waitForLayout();
        await holdAppSkeleton();
        removeAppSkeleton();
        await initialized;
        return app;
    } catch (error) {
        console.error(`Error during ${appName} initialization:`, error);
        stopErrorNotifications();
        removeAppSkeleton();
        // The placeholder the app took the place of holds the message alone; taking the
        // app out tears it down.
        app?.replaceWith(mainContainer);
        mainContainer.replaceChildren();
        renderLoadError(mainContainer, 'beforeend', {
            message: bootFailureMessage(appName, error),
            detail: bootFailureLinks(),
        });
        return null;
    }
}

/**
 * A failed load's copy, read from the shell glossary as bundled: a boot failure may be
 * the app's own glossary failing to come up, so it cannot go through the app.
 * @param {string} key - The `general.messages` entry.
 * @param {{[token: string]: string}} [tokens] - Its `{{token}}` values.
 * @returns {string}
 */
function messageText(key, tokens) {
    return applyTemplateTokens(
        String(resolveDotPath(shellGlossary, `general.messages.${key}`) ?? ''),
        tokens,
    );
}

/**
 * A dashboard that did not come up at all.
 * @param {string} appName - The dashboard's name as the reader knows it.
 * @param {unknown} error
 * @returns {string}
 */
function bootFailureMessage(appName, error) {
    return `${messageText('app-load-failed', { dashboard: appName })} ${messageText(loadCauseKey(error))}`;
}

/**
 * The ways out of a dashboard that did not come up: the chooser, and, when the address
 * names a dataset or an API (`?scope`, `?api`), the same page without them: a reload
 * would keep them and fail again. The Impressum follows, as the sidebar that links it
 * never rendered.
 * @returns {import('lit').TemplateResult}
 */
function bootFailureLinks() {
    const withQuery = window.location.search !== '';
    return html`<p>
        <a href="../">${messageText('load-link-chooser')}</a>${
            withQuery
                ? html` ·
                      <a href=${window.location.pathname}>${messageText('load-link-default')}</a>`
                : nothing
        }
        ·
        <a href="../docs/docs/impressum.html">${messageText('load-link-imprint')}</a>
    </p>`;
}

/**
 * Name a dashboard that did not come up: one alert callout, placed where the caller
 * says. Never throws: bootstrap must still settle even if rendering fails.
 * @param {Element} anchor - The element the message is placed against.
 * @param {InsertPosition} position - Where, relative to `anchor`.
 * @param {{message: string, detail?: import('lit').TemplateResult}} content - The plain-text message, and the links under it.
 */
function renderLoadError(anchor, position, { message, detail }) {
    try {
        const host = document.createElement('div');
        render(
            noticeCallout({
                message,
                detail,
                role: 'alert',
                className: 'dashboard-bootstrap-error',
            }),
            host,
        );
        anchor.insertAdjacentElement(position, requireEl(host, '.notice-callout'));
    } catch (renderError) {
        console.error('Dashboard bootstrap: failed to render the load error', renderError);
    }
}

/**
 * Hold the cold-start placeholder for the rest of its minimum display time, so a
 * dashboard that loads just past the anti-flash delay does not flicker. The shell
 * ships in the initial HTML, so `performance.now()` is how long it has been on
 * screen. Only the success path holds: an error is never delayed.
 */
async function holdAppSkeleton() {
    const wait = skeletonHoldDelay(performance.now());
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
}

/**
 * Remove the cold-start placeholder. Called on every exit path — a stranded
 * skeleton would sit on top of the bootstrap error message and hide it.
 */
function removeAppSkeleton() {
    document.getElementById(APP_SKELETON_ID)?.remove();
}
