/**
 * Real export menu actions for content modules.
 *
 * Visual modules (charts, item detail, info box, material, …) get PDF/PNG/JPG;
 * tables get CSV/JSON (Tabulator download module, honours filters/sort/column
 * visibility) plus PDF. All raster/PDF output goes through the shared
 * capture → composer pipeline (the report view reuses the same composer).
 */

import { captureExportRoot, findTablesInRoot, resolveCaptureRoot } from './exportCapture.js';
import { setDownloadFormat } from '@tba3/modules/tables';
import { buildExportFileName, canvasToBlob, triggerDownload } from './exportFiles.js';
import { createPdfComposer } from './pdfComposer.js';

const JPEG_QUALITY = 0.92;
const CSV_OPTIONS = Object.freeze({ delimiter: ';', bom: false });
const UTF8_BOM = String.fromCharCode(0xfeff);

/**
 * @typedef {object} ExportActionSource
 * @property {() => HTMLElement|null} getCaptureRoot - Module card to capture (resolved at click time)
 * @property {() => string} getTitle - Human-readable title for metadata / file names
 */

/**
 * @typedef {object} ExportActionContext
 * @property {string} [title] - Visible title at click time, used when the source has none.
 * @property {{id?: string, title?: string, type?: string, view?: string, container?: any}} [exportTarget] - The registered export target this action was invoked from.
 */

/**
 * PDF / PNG / JPG actions for any DOM-rendered module.
 * @param {ExportActionSource} source - Supplies the capture root and the title; the module being exported.
 * @returns {Array<{label: string, onSelect: (context: ExportActionContext) => Promise<void>}>} One entry per offered format, each capturing when selected.
 */
export function createVisualExportActions(source) {
    return [
        { label: 'PDF', onSelect: (context) => exportPdf(source, context) },
        { label: 'PNG', onSelect: (context) => exportRaster(source, context, 'image/png', 'png') },
        { label: 'JPG', onSelect: (context) => exportRaster(source, context, 'image/jpeg', 'jpg') },
    ];
}

/**
 * CSV / JSON / PDF actions for modules whose root contains Tabulator tables.
 * @param {ExportActionSource} source - Supplies the capture root and the title; the module being exported.
 * @returns {Array<{label: string, onSelect: (context: ExportActionContext) => Promise<void>}>} One entry per offered format, each capturing when selected.
 */
export function createTableExportActions(source) {
    return [
        { label: 'CSV', onSelect: (context) => exportTableData(source, context, 'csv') },
        { label: 'JSON', onSelect: (context) => exportTableData(source, context, 'json') },
        { label: 'PDF', onSelect: (context) => exportPdf(source, context) },
    ];
}

/**
 * Default actions for an export target that supplied none: chosen by type,
 * using only the target's container + title (no module instance needed).
 * @param {{type?: string, title?: string, container?: any}} exportTarget - The target that supplied no actions of its own; its `type` picks table or visual formats.
 * @returns {Array<{label: string, onSelect: (context: ExportActionContext) => Promise<void>}>} Table formats for a table target, visual formats otherwise.
 */
export function createDefaultExportActions(exportTarget) {
    const source = {
        getCaptureRoot: () => resolveCaptureRoot(exportTarget?.container),
        getTitle: () => exportTarget?.title || 'Export',
    };
    return exportTarget?.type === 'table'
        ? createTableExportActions(source)
        : createVisualExportActions(source);
}

/**
 * @param {ExportActionSource} source - Supplies the capture root and the title; the module being exported.
 * @param {ExportActionContext} context - What the caller knows at click time: the visible title, and the export target it came from.
 * @returns {{title: string, view: string}} Title and source view, resolved from whichever of source and context supplies them.
 */
function resolveMeta(source, context) {
    const title = source.getTitle() || context?.title || context?.exportTarget?.title || 'Export';
    const view = context?.exportTarget?.view || '';
    return { title, view };
}

/**
 * @param {ExportActionSource} source - Supplies the capture root and the title; the module being exported.
 * @returns {HTMLElement} The element to capture.
 */
function requireRoot(source) {
    const root = source.getCaptureRoot();
    if (!(root instanceof HTMLElement)) {
        throw new Error('[exportActions] Export target is not rendered.');
    }
    return root;
}

/**
 * @param {ExportActionSource} source - Supplies the capture root and the title; the module being exported.
 * @param {ExportActionContext} context - What the caller knows at click time: the visible title, and the export target it came from.
 */
async function exportPdf(source, context) {
    const root = requireRoot(source);
    const meta = resolveMeta(source, context);
    const composer = await createPdfComposer();
    composer.addCapture(await captureExportRoot(root), meta);
    composer.save(buildExportFileName({ ...meta, ext: 'pdf' }));
}

/**
 * @param {ExportActionSource} source - Supplies the capture root and the title; the module being exported.
 * @param {ExportActionContext} context - What the caller knows at click time: the visible title, and the export target it came from.
 * @param {'image/png'|'image/jpeg'} mimeType - Encoding the canvas is serialised to.
 * @param {'png'|'jpg'} extension - File extension for the download, matching `mimeType`.
 */
async function exportRaster(source, context, mimeType, extension) {
    const root = requireRoot(source);
    const meta = resolveMeta(source, context);
    const canvas = await captureExportRoot(root);
    const blob = await canvasToBlob(
        canvas,
        mimeType,
        mimeType === 'image/jpeg' ? JPEG_QUALITY : undefined,
    );
    triggerDownload(blob, buildExportFileName({ ...meta, ext: extension }));
}

/**
 * @param {ExportActionSource} source - Supplies the capture root and the title; the module being exported.
 * @param {ExportActionContext} context - What the caller knows at click time: the visible title, and the export target it came from.
 * @param {'csv'|'json'} format - Serialisation Tabulator is asked for.
 */
async function exportTableData(source, context, format) {
    const root = requireRoot(source);
    const meta = resolveMeta(source, context);
    const tables = findTablesInRoot(root);
    if (tables.length === 0) {
        throw new Error('[exportActions] No table found in export target.');
    }

    // Tabulator's intercept callback receives the generated text synchronously —
    // which is also what lets the download accessors read the format flag below.
    setDownloadFormat(format);
    const parts = tables.map((table) => {
        let content = '';
        table.download(format, null, format === 'csv' ? CSV_OPTIONS : {}, 'active', (text) => {
            content = String(text ?? '');
        });
        return content;
    });

    let text;
    let mime;
    if (format === 'csv') {
        text = UTF8_BOM + parts.join('\n\n');
        mime = 'text/csv;charset=utf-8';
    } else {
        text = parts.length === 1 ? parts[0] : `[\n${parts.join(',\n')}\n]`;
        mime = 'application/json;charset=utf-8';
    }

    triggerDownload(
        new Blob([text], { type: mime }),
        buildExportFileName({ ...meta, ext: format }),
    );
}
