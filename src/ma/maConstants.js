/**
 * MA constants — the Mathe dashboard's layout modes and dataset list.
 */

/** The item and student views' layout-switch values (the `layoutMode` state key). */
export const LAYOUT_MODES = /** @type {const} */ ({
    BOTH: 'both',
    TABLE_ONLY: 'table-only',
    CHART_ONLY: 'chart-only',
});

/** @typedef {typeof LAYOUT_MODES[keyof typeof LAYOUT_MODES]} LayoutMode */

// The dashboard lists only the VERA-3 fixtures under `data/ma/`, each named by its scope.
// Any other group opens by `?scope=groups/<id>` against a running API. A group is the
// unit one Testheft was handed to, so it carries a single Äquivalenztabelle.
export const MA_DATASET_OPTIONS = [
    { id: 'groups/3a_mid', label: 'Lerngruppe 3a', folder: '3a_mid' },
    { id: 'groups/3b_good', label: 'Lerngruppe 3b', folder: '3b_good' },
    { id: 'groups/3c_bad', label: 'Lerngruppe 3c', folder: '3c_bad' },
];
