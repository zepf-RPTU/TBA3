/**
 * A stand-in for the module behind an export target, for suites that build export
 * definitions without mounting a `ContentModule`.
 */

/**
 * Give `card` the export methods a module has: a capture with nothing to prepare or
 * undo, nothing to settle, a clone left as is, and the given serialised tables.
 * @param {HTMLElement} [card] - The card the capture clones; a detached div by default.
 * @param {(format: 'csv'|'json') => import('@tba3/module-base').ExportDataBlock[]} [dataText]
 * @returns {import('@tba3/module-base').ExportControlDefinition['module']} The card, as an exportable module.
 */
export function exportableModule(card = document.createElement('div'), dataText = () => []) {
    return Object.assign(card, {
        prepareExportCapture: () => () => {},
        prepareExportClone: () => {},
        getExportDataText: dataText,
        whenSettled: async () => {},
    });
}
