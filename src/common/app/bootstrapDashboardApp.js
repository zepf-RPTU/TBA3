import { configureModuleRuntime, initDropdownManager, waitForLayout } from '@tba3/module-base';
import { glossaryAnnotator } from '@tba3/modules/glossary';
import { initColorScheme, initKsThemeFromStorage, setPaletteRepaint } from '@tba3/modules/theme';
import { ApiUnreachableError } from '../services/apiClient.js';
import { skeletonHoldDelay } from './viewSkeleton.js';
import { installGlobalErrorNotifications } from '../services/notificationService.js';
import { exportService } from '../export/exportService.js';
import { buildExportTargetId } from '../export/exportTargetId.js';
import { repaintBandThumbnails } from '../modules/bandThumbnail.js';

/**
 * Id of the cold-start placeholder each dashboard's HTML ships
 * (see src/styles/skeleton.css).
 * @type {string}
 */
const APP_SKELETON_ID = 'app-skeleton';

/**
 * Bootstrap one dashboard: mount its app class, run init, and replace the
 * cold-start placeholder — rendering an inline error rather than throwing
 * when initialisation fails.
 * @param {object} config - Everything the dashboard needs to start.
 * @param {new (...args: any[]) => any} config.AppModule - The app class to instantiate.
 * @param {string} config.appId - Dashboard id, used for storage scoping and the glossary namespace.
 * @param {string} config.containerSelector - Selector for the element the app mounts into.
 * @param {object} [config.options] - Extra options forwarded to the app constructor.
 * @param {*} [config.initData] - Payload handed to the app initialiser.
 * @param {string} [config.appName] - The dashboard's name as the reader knows it (`Englisch 8`), for the inline error when bootstrapping fails.
 * @returns {Promise<any>} The mounted app, or null when bootstrapping failed and the error was rendered.
 */
export async function bootstrapDashboardApp({
    AppModule,
    appId,
    containerSelector = '.main-content',
    options = { defaultView: 'welcome' },
    initData,
    appName = '',
}) {
    // The shell is a fixed, non-scrolling viewport (src/styles/foundation/layout-reset.css),
    // so a restored scroll offset can only strand it off-screen.
    if ('scrollRestoration' in history) history.scrollRestoration = 'manual';

    // A dashboard is an export-capable host, so register the export service before
    // the first module is constructed — a module resolves its services once, at
    // construction. Without this the cards keep their no-op default and simply
    // grow no export button (see @tba3/module-base).
    // `annotateHTML` returns its input untouched until the app initialises the
    // annotator (BaseAppModule), so registering it this early is safe.
    configureModuleRuntime({
        exportService,
        buildExportTargetId,
        decorateText: (html) => glossaryAnnotator.annotateHTML(html),
    });

    // The band thumbnails sit in the sidebar and view titles, outside every view
    // tree, so no onThemeChanged() reaches them. Registered before the first theme
    // is applied below and before any dataset registers its scales.
    setPaletteRepaint(repaintBandThumbnails);

    // One open header-action menu at a time, closed by an outside click or Escape.
    // The coordinator installs no listeners of its own until asked.
    initDropdownManager();

    // Apply the persisted KS color theme and colour scheme before first render to
    // avoid a flash. An OS light/dark flip while "System" is chosen redraws the active
    // view the same way a sidebar theme switch does; `app` is assigned below.
    initKsThemeFromStorage();
    /** @type {any} */
    let app = null;
    initColorScheme(() => app?.refreshThemeInCurrentView());

    const mainContainer = document.querySelector(containerSelector);
    if (!mainContainer) {
        console.error(`Dashboard bootstrap: container '${containerSelector}' not found`);
        removeAppSkeleton();
        renderBootstrapError(
            document.body,
            'The dashboard container could not be found, so the dashboard could not be displayed.',
        );
        return null;
    }

    try {
        app = new AppModule(appId, mainContainer, options);
        await app.init(initData);
        // init() now awaits the first view's whenRevealed() (see BaseAppModule's
        // hydrate), so the view is uncovered by this point — but the uncover and
        // this line land in the same task, so still give layout its frames or the
        // shell skeleton can come off over a not-yet-painted view.
        await waitForLayout();
        await holdAppSkeleton();
        removeAppSkeleton();
        // From here on the page is the app's; what it fails to catch is reported
        // through the toast channel rather than lost to the console.
        installGlobalErrorNotifications();
        return app;
    } catch (error) {
        console.error(`Error during ${appName || appId} initialization:`, error);
        removeAppSkeleton();
        // Product copy, not the exception: the reader is a teacher, and the one cause
        // they can tell apart — the data source not answering — gets named. The
        // exception itself stays in the console above.
        const subject = appName ? `Das Dashboard „${appName}“` : 'Das Dashboard';
        const cause =
            error instanceof ApiUnreachableError
                ? 'Die Datenquelle ist nicht erreichbar.'
                : 'Beim Laden ist ein Fehler aufgetreten.';
        renderBootstrapError(
            mainContainer,
            `${subject} konnte nicht geladen werden. ${cause} Laden Sie die Seite neu.`,
        );
        return null;
    }
}

/**
 * Hold the cold-start placeholder for the rest of its minimum display time, so
 * a dashboard that loads just past the anti-flash delay shows a proper
 * placeholder instead of a half-faded ghost. No-op once that time has passed.
 *
 * The shell ships in the initial HTML, so `performance.now()` — time since
 * navigation start — is how long it has been on screen.
 *
 * Only the success path holds: an error must never be delayed.
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

/**
 * Render an accessible, plain-text bootstrap failure message into a container.
 *
 * Never throws: bootstrap must still return `null` even if rendering fails.
 * @param {Element|null} container Target element to own the message
 * @param {string}       message   User-visible, plain-text message
 */
function renderBootstrapError(container, message) {
    try {
        if (!container) return;
        const alert = document.createElement('div');
        alert.className = 'dashboard-bootstrap-error';
        alert.setAttribute('role', 'alert');
        alert.textContent = message;
        if (container === document.body) {
            // No app container exists yet; do not wipe the whole page.
            container.appendChild(alert);
        } else {
            // Own the app container we were about to render the dashboard into.
            container.replaceChildren(alert);
        }
    } catch (renderError) {
        console.error('Dashboard bootstrap: failed to render error state', renderError);
    }
}
