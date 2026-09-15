/**
 * slColumnBuilders — Column-definition helpers shared by the SL table modules
 * (SlClassTableModule and SlDomainTableModule): the vizMode-switching cell
 * formatter behind the survey-measure columns, and the "Merkmale" trait
 * column group.
 *
 * The formatter accepts a `vizModeGetter` callback (e.g. `() => this._state.vizMode`)
 * so it remains decoupled from module internals.
 * @module slColumnBuilders
 */

import { createBoxPlotFormatter } from '../../../common/tables/cellFormatters.js';
import { createDownloadColumn } from '../../../common/tables/tableExport.js';
import { formatDownloadNumber } from '../../../common/tables/downloadNumberFormat.js';
import { createRatingStackedBar, EMBEDDED_BAR_HEIGHT } from './slRatingStackedBar.js';
import { VIZ_MODES } from '../../slVizModes.js';
import { VISUAL_COLUMN_MIN_WIDTHS } from '../../../common/tables/columnWidthConstants.js';
import { getTraitFallbackLabel } from '../../../common/domain/traitRegistry.js';

/**
 * Create a Tabulator cell formatter that switches between boxplot and
 * stacked-bar rendering based on the current vizMode.
 *
 * The returned formatter reads the vizMode lazily on each render via
 * `vizModeGetter()`, so it responds to mode toggles after a table redraw.
 * @param {object} config - The fields the cell reads and how it renders them.
 * @param {string} config.dataField      - Row data field containing box-plot stats (e.g. `'teachingQuality'`)
 * @param {string} config.valuesField    - Row data field containing raw values for stacked bar (e.g. `'teachingQualityValues'`)
 * @param {string|function(): string} config.boxColor - CSS colour for the box-plot box, or a getter resolved per render (so a KS theme switch recolors it via redraw)
 * @param {string} config.tooltipTitle   - Tooltip/label text (e.g. `'Unterrichtsqualität'`)
 * @param {function(): string} config.vizModeGetter - Returns the current viz mode (`VIZ_MODES.BOXPLOT` or `VIZ_MODES.STACKED_BAR`)
 * @param {string[]} [config.skipTypes=[]] - Row types that should render empty (e.g. `['state']`)
 * @returns {function(object): string | HTMLElement} Tabulator cell formatter
 */
export function createVizModeSwitchingFormatter({
    dataField,
    valuesField,
    boxColor,
    tooltipTitle,
    vizModeGetter,
    skipTypes = [],
}) {
    return function (cell) {
        const rowData = cell.getRow().getData();

        // Skip configured row types
        if (skipTypes.length > 0 && skipTypes.includes(rowData.type)) {
            return '';
        }

        // Skip if no data
        if (!rowData[dataField]) {
            return '';
        }

        if (vizModeGetter() === VIZ_MODES.BOXPLOT) {
            return createBoxPlotFormatter({
                boxColor: typeof boxColor === 'function' ? boxColor() : boxColor,
                dataField,
                tooltipTitle,
                height: EMBEDDED_BAR_HEIGHT,
            })(cell);
        } else {
            return createRatingStackedBar(rowData[valuesField], tooltipTitle);
        }
    };
}

/**
 * The six export columns behind one survey-measure column (Unterrichtsqualität,
 * Selbstwirksamkeit): the statistics the box plot is drawn from.
 *
 * The visual column exports nothing usable on its own — its field holds the
 * whole statistics object, which the download would stringify — so it opts out
 * with `download: false` and these carry the numbers.
 * @param {object} config - Which measure to export and where it belongs.
 * @param {string} config.dataField - Row field holding the statistics object (e.g. `'teachingQuality'`).
 * @param {string} config.label - German measure name, prefixed onto every header.
 * @param {string} config.follows - Field of the visual column these belong to.
 * @returns {Array<object>} The six column definitions.
 */
export function createSurveyMeasureDownloadColumns({ dataField, label, follows }) {
    /** @type {Array<[string, string, string, number]>} header suffix, field suffix, statistics property, decimal places */
    const measures = [
        ['Mittelwert', 'Mean', 'mean', 2],
        ['SD', 'Sd', 'standardDeviation', 2],
        ['Median', 'Median', 'median', 2],
        ['Q1', 'Q1', 'q1', 2],
        ['Q3', 'Q3', 'q3', 2],
        ['n', 'Count', 'count', 0],
    ];

    return measures.map(([headerSuffix, fieldSuffix, property, digits]) =>
        createDownloadColumn(`${label} – ${headerSuffix}`, `${dataField}${fieldSuffix}`, {
            follows,
            // Rows without the measure (e.g. the SL domain table's state rows)
            // export an empty cell rather than a zero.
            accessor: (_value, data) => formatDownloadNumber(data?.[dataField]?.[property], digits),
        }),
    );
}

/**
 * Create a Tabulator grouped column definition for trait columns ("Merkmale").
 *
 * Each trait becomes a narrow sub-column with the supplied formatter.
 * @param {string[]} traitNames - Array of trait display names
 * @param {Function} formatter - Tabulator cell formatter to use for each trait column
 * @returns {object | null} Tabulator grouped column definition, or `null` if `traitNames` is empty
 */
export function createTraitColumns(traitNames, formatter) {
    if (!traitNames || traitNames.length === 0) return null;

    return {
        title: 'Merkmale',
        columns: traitNames.map((trait) => ({
            title: trait.toUpperCase(),
            // The sub-column header is the bare code, and it is the one place a trait
            // appears with no student attached. Only *unfamiliar* codes need this:
            // TableModule's glossary titleFormatter already turns a header the glossary
            // knows into a popup chip, and Tabulator's own tooltip would then open on
            // top of that popup.
            headerTooltip: getTraitFallbackLabel(trait) ?? false,
            field: `trait_${trait}`,
            headerSort: false,
            hozAlign: 'center',
            vertAlign: 'middle',
            minWidth: VISUAL_COLUMN_MIN_WIDTHS.traitSubColumn,
            widthGrow: 0,
            formatter,
        })),
    };
}
