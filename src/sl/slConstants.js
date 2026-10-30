/**
 * SL constants — the values the Schulleitung header switches write into app state.
 */

/** The Details view's Ansicht switch (the `detailsGrouping` state key). */
export const DETAILS_GROUPINGS = Object.freeze({
    BY_SUBJECTS: 'by_subjects',
    BY_GROUPS: 'by_groups',
});

/** The Details view's Darstellung switch (the `displayMode` state key). */
export const DISPLAY_MODES = Object.freeze({
    CHARTS: 'charts',
    TABLE: 'table',
});

/** The Entwicklung view's line-chart shape (the `longitudinalViewMode` state key). */
export const LONGITUDINAL_VIEW_MODES = Object.freeze({
    NORMAL: 'normal',
    STACKED: 'stacked',
});

/** The Entwicklung view's Diagrammtyp toggle (the `longitudinalChartType` state key). */
export const LONGITUDINAL_CHART_TYPES = Object.freeze({
    LINES: 'lines',
    BOXPLOT: 'boxplot',
});

/** @typedef {typeof LONGITUDINAL_CHART_TYPES[keyof typeof LONGITUDINAL_CHART_TYPES]} LongitudinalChartType */
