/**
 * The report ("Bericht") view is shared by all three dashboards; this is its
 * one declaration. Apps spread `createReportViewConfig()` into their
 * `viewConfig` and `REPORT_HEADER_CONFIG` into their header config; the toolbar
 * and the view module take the view key from here.
 *
 * Kept apart from reportViewModule.js so the config (evaluated at boot) does
 * not pull the view module in before it is navigated to.
 */

/** Router view key of the report view (`#report`). */
export const REPORT_VIEW_KEY = 'report';

/**
 * @param {string} appPrefix - `en` | `ma` | `sl` (container ids are `${appPrefix}-report-container`)
 * @returns {object} the `viewConfig` entry for the report view
 */
export function createReportViewConfig(appPrefix) {
    return {
        containerId: `${appPrefix}-report-container`,
        buttonId: 'reportViewButton',
        icon: 'summarize',
        sidebarPinBottom: true,
        navigationGlossaryPath: `${appPrefix}.nav-cards.element_texts.nav-report`,
        skeleton: 'grid',
        load: () => import('./reportViewModule.js').then((m) => m.ReportViewModule),
    };
}

/** Header config of the report view: glossary title and subtitle, no controls. */
export const REPORT_HEADER_CONFIG = Object.freeze({
    glossaryPath: 'general.report.header',
    controls: [],
});
