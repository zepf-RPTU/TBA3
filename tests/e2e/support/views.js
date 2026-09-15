/**
 * The dashboards' routable views, in sidebar order.
 *
 * Its own module rather than a constant in its consumer: the desktop and touch axe
 * sweeps both enumerate it through support/axe.js, and a view missing from the list is
 * a view that is silently unscanned by both.
 *
 * Add a view here and every gate that enumerates them picks it up.
 */

/** @type {{[app: string]: string[]}} */
export const VIEWS = {
    en: ['welcome', 'overview', 'class', 'item', 'student', 'report'],
    ma: ['welcome', 'overview', 'class', 'item', 'student', 'report', 'help'],
    sl: ['summary', 'welcome', 'overview', 'comparison', 'longitudinal', 'material', 'report'],
};
