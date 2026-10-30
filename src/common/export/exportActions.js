/**
 * Export menu actions for content modules, by the target's `type`: a table gets CSV/JSON
 * (the module's `getExportDataText`) plus PDF, a chart gets PDF/PNG/JPG and CSV/JSON,
 * any other card PDF/PNG/JPG. Raster and PDF output go through the capture
 * (`exportCapture.js`) and the composer (`pdfComposer.js`).
 */

import { csvField } from '@tba3/module-base';
import { captureExportRoot } from './exportCapture.js';
import { buildExportFileName, canvasToBlob, triggerDownload } from './exportFiles.js';
import { createPdfComposer } from './pdfComposer.js';

const JPEG_QUALITY = 0.92;
const UTF8_BOM = String.fromCharCode(0xfeff);

/** @typedef {import('@tba3/module-base').ExportControlDefinition} ExportTarget */

/**
 * One offered export format.
 * @typedef {object} ExportAction
 * @property {string} id - The menu row's id, the format name.
 * @property {string} label - Menu label, the format name.
 * @property {string} icon - Material Symbols name shown before the label.
 * @property {string} description - What the file holds, the menu row's second line.
 * @property {() => Promise<void>} onSelect - Captures and downloads in this format.
 */

/**
 * What an export's file and PDF footer name: the dashboard, the card, and the label of
 * the view it is exported from.
 * @typedef {{appId: string, title: string, view: string}} ExportNaming
 */

/**
 * Actions for an export target. Only the target's type, module, title and view are used.
 * @param {ExportTarget} exportTarget - The target being exported; its `type` picks data formats, image formats or both.
 * @param {Pick<import('../app/appContext.js').AppContext, 'appId' | 'viewLabel' | 'glossary'>} context - The app: its id and view labels name the files, its glossary the menu entries.
 * @returns {ExportAction[]} One entry per offered format, each capturing when selected.
 */
export function createDefaultExportActions(exportTarget, { appId, viewLabel, glossary }) {
    /** @type {ExportNaming} */
    const naming = {
        appId,
        title: exportTarget.title,
        view: viewLabel(exportTarget.view ?? ''),
    };
    /**
     * @param {string} label - The format name; lower-cased, it keys the description.
     * @param {string} icon
     * @param {() => Promise<void>} onSelect
     * @returns {ExportAction}
     */
    const action = (label, icon, onSelect) => ({
        id: label,
        label,
        icon,
        description: glossary.getRequiredEntryText(
            `general.buttons.element_texts.export-${label.toLowerCase()}.description`,
        ),
        onSelect,
    });
    const pdf = action('PDF', 'picture_as_pdf', () => exportPdf(exportTarget, naming));
    const data = () => [
        action('CSV', 'table', () => exportDataText(exportTarget, naming, 'csv')),
        action('JSON', 'data_object', () => exportDataText(exportTarget, naming, 'json')),
    ];
    const images = () => [
        action('PNG', 'image', () => exportRaster(exportTarget, naming, 'image/png', 'png')),
        action('JPG', 'image', () => exportRaster(exportTarget, naming, 'image/jpeg', 'jpg')),
    ];
    switch (exportTarget.type) {
        case 'table':
            return [...data(), pdf];
        case 'chart':
            return [pdf, ...images(), ...data()];
        default:
            return [pdf, ...images()];
    }
}

/**
 * @param {ExportTarget} exportTarget
 * @param {ExportNaming} naming
 */
async function exportPdf(exportTarget, naming) {
    // The library loads while the card is captured. A library that fails first is
    // reported once the capture has put the card back, so the export stays busy until then.
    const loadingComposer = createPdfComposer(naming);
    loadingComposer.catch(() => {});
    const canvas = await captureExportRoot(exportTarget, { paper: true });
    let composer;
    try {
        composer = await loadingComposer;
        // A table reads on across pages; any other card stays whole on one page.
        composer.addCapture(canvas, { paginate: exportTarget.type === 'table' });
    } finally {
        // Release the backing store now, not at GC.
        canvas.width = 0;
    }
    composer.save(buildExportFileName({ ...naming, ext: 'pdf' }));
}

/**
 * @param {ExportTarget} exportTarget
 * @param {ExportNaming} naming
 * @param {'image/png'|'image/jpeg'} mimeType
 * @param {'png'|'jpg'} extension - Matches `mimeType`.
 */
async function exportRaster(exportTarget, naming, mimeType, extension) {
    const canvas = await captureExportRoot(exportTarget);
    const blob = await canvasToBlob(
        canvas,
        mimeType,
        mimeType === 'image/jpeg' ? JPEG_QUALITY : undefined,
    );
    canvas.width = 0;
    triggerDownload(blob, buildExportFileName({ ...naming, ext: extension }));
}

/**
 * @param {ExportTarget} exportTarget
 * @param {ExportNaming} naming
 * @param {'csv'|'json'} format
 */
async function exportDataText(exportTarget, naming, format) {
    if (!exportTarget.module.isConnected) {
        throw new Error('[exportActions] Export target is not mounted.');
    }
    const blocks = exportTarget.module.getExportDataText(format);
    if (blocks.length === 0) {
        throw new Error('[exportActions] No data found in export target.');
    }

    const mime = format === 'csv' ? 'text/csv;charset=utf-8' : 'application/json;charset=utf-8';
    triggerDownload(
        new Blob([joinDataBlocks(blocks, format)], { type: mime }),
        buildExportFileName({ ...naming, ext: format }),
    );
}

/**
 * The file's text from its tables. One table is written as it is; several are named,
 * as the screen names them: a CSV puts each title on a line of its own above that
 * table's header (as statistics offices' CSVs do), a JSON array holds one
 * `{title, rows}` per table. The blocks are already serialised, so nothing is parsed.
 * @param {import('@tba3/module-base').ExportDataBlock[]} blocks - The tables, at least one.
 * @param {'csv'|'json'} format
 * @returns {string}
 */
function joinDataBlocks(blocks, format) {
    const titled = blocks.length > 1;
    if (format === 'csv') {
        const tables = blocks.map(({ title, text }) =>
            titled ? `${csvField(title)}\n${text}` : text,
        );
        return UTF8_BOM + tables.join('\n\n');
    }
    if (!titled) return blocks[0].text;
    const tables = blocks.map(
        ({ title, text }) => `{"title": ${JSON.stringify(title)}, "rows": ${text}}`,
    );
    return `[\n${tables.join(',\n')}\n]`;
}
