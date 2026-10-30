/**
 * One sort key of a preset.
 * @typedef {object} PresetSort
 * @property {string} column - Field of the column to sort by.
 * @property {'asc'|'desc'} dir
 */

/**
 * A table preset's filter, sort and limit.
 * @typedef {object} Preset
 * @property {string} label - The preset button's label.
 * @property {PresetSort} sort
 * @property {import('./internal/tablePresetManager.js').TableRowFilter[]} [filters]
 * @property {number} [limit]
 * @property {string} [tooltipText]
 * @property {string} [unavailableReason] - Set while the table's current mode rules the
 *   preset out: the button keeps its place, greyed out, with this as its tooltip.
 */

/**
 * A preset as a table declares it: its copy named by its entry under the table's
 * interface texts.
 * @typedef {Omit<Preset, 'label'|'tooltipText'|'unavailableReason'> & {
 *   key: string,
 *   unavailable?: boolean,
 * }} PresetSpec - `key`: the entry (e.g. `'best-five'`); `unavailable`: the table's current mode rules the preset out.
 */

/**
 * A preset with its copy: the label from `${basePath}.${key}.label`, the tooltip from
 * `${basePath}.${key}.tooltip` when the entry has one, and an unavailable preset's reason
 * from `${basePath}.${key}-unavailable.tooltip`.
 * @param {import('../glossary/glossaryAnnotator.js').GlossaryAnnotator} glossary - The app's glossary.
 * @param {string} basePath - Glossary base path of the table's interface entries.
 * @param {PresetSpec} spec
 * @returns {Preset}
 */
export function resolvePreset(glossary, basePath, { key, unavailable = false, ...preset }) {
    const path = `${basePath}.${key}`;
    const tooltip = glossary.getEntryText(`${path}.tooltip`);
    return {
        ...preset,
        label: glossary.getRequiredEntryText(`${path}.label`),
        ...(tooltip && { tooltipText: tooltip }),
        ...(unavailable && {
            unavailableReason: glossary.getRequiredEntryText(`${path}-unavailable.tooltip`),
        }),
    };
}
