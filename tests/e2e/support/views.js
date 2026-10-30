/**
 * The dashboards' routable views, in sidebar order. The axe sweeps and the export-id
 * check enumerate it, so a view missing here is unchecked by both.
 */

/** @type {{[app: string]: string[]}} */
export const VIEWS = {
    en: ['welcome', 'overview', 'group', 'item', 'student', 'report'],
    ma: ['welcome', 'overview', 'group', 'item', 'student', 'report', 'help'],
    sl: ['summary', 'matrix', 'details', 'comparison', 'longitudinal', 'material', 'report'],
};
