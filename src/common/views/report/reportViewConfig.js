/**
 * The report ("Bericht") view's one declaration: an app puts `REPORT_VIEW_CONFIG` under
 * `REPORT_VIEW_KEY` in its views, and the view is reached by that key.
 *
 * Kept apart from reportViewModule.js so the config (evaluated at boot) does
 * not pull the view module in before it is navigated to.
 */

/** Router view key of the report view (`#report`). */
export const REPORT_VIEW_KEY = 'report';

/**
 * The report view's entry; its header copy is shared by every app.
 * @type {import('../../app/appModule.js').ViewConfigEntry}
 */
export const REPORT_VIEW_CONFIG = Object.freeze({
    // The report reads the tab's captures, no document: it opens while the dataset
    // loads, and after it failed, with the cards captured under other datasets.
    needsData: false,
    icon: 'summarize',
    headerGlossaryPath: 'general.report.header',
    sidebarPinBottom: true,
    skeleton: 'grid',
    // The paged preview sizes its pages from the scroll area, so it cannot flow.
    fit: 'bounded',
    load: () => import('./reportViewModule.js').then((m) => m.ReportViewModule),
});
