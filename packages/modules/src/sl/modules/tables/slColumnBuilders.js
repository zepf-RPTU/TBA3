/**
 * slColumnBuilders — Column-definition helpers for the SL tables: the survey-measure
 * columns, their vizMode-switching cell formatter with the box-plot cell, the competence-level
 * distribution column, the gender and "Merkmale" column groups, and the survey, trait
 * and gender row fields.
 */

import { escapeHtml } from '@tba3/module-base';
import { createDownloadColumn } from '../../../common/tables/tableExport.js';
import {
    createDOMStackedBar,
    createEmptyStackedBar,
    fieldShare,
} from '../../../common/tables/stackedBarCell.js';
import { formatDownloadNumber } from '../../../common/tables/downloadNumberFormat.js';
import { boxPlotTooltip, ratingBandTooltip } from '../../utils/slBoxPlotStats.js';
import { cursorTooltip, setTooltipContent } from '../../../common/services/cursorTooltip.js';
import { shareRows } from '../../../common/charts/shareRows.js';
import { VIZ_MODES } from '../../slVizModes.js';
import {
    COLUMN_GROW_RATIOS,
    TABLE_BAR_HEIGHT_PX,
    VISUAL_COLUMN_MIN_WIDTHS,
} from '../../../common/tables/columnWidthConstants.js';
import { getTraitFallbackLabel } from '../../../common/tables/traitUtils.js';
import { GENDER_LABELS } from '../../../common/domain/apiValueMaps.js';
import { TERM_CONSTANTS } from '../../../common/domain/terms.js';
import { GLOSSARY_KEYS } from '../../../common/glossary/glossaryKeys.js';
import { buildRatingBuckets, SL_SERIES_COLORS } from '../../utils/slRatingAppearance.js';
import { RATING_DOMAIN } from '../../../common/domain/apiValueMaps.js';
import { surveyFigures } from '../../utils/slSurveyDerivation.js';
import { formatCount } from '../../../common/utils/numberFormat.js';
import { percentOf } from '../../../common/domain/itemResultCounts.js';

/** The survey rating scale the box-plot cell is drawn on. */
const [RATING_SCALE_MIN, RATING_SCALE_MAX] = RATING_DOMAIN;
const BOX_OPACITY = 0.7;
const SVG_NS = 'http://www.w3.org/2000/svg';
/** The box-plot cell's width, and the inset at both ends of the rating scale inside it. */
const BOX_CELL_WIDTH_PX = 120;
const BOX_CELL_INSET_PX = 10;
/** The box's and the whisker caps' height, as a share of the cell's. */
const BOX_HEIGHT_RATIO = 0.4;
const WHISKER_CAP_HEIGHT_RATIO = 0.2;

/**
 * Append one SVG element to the box-plot canvas.
 * @param {SVGElement} svg
 * @param {'line'|'rect'} tag
 * @param {{[attribute: string]: string|number}} attributes
 */
function appendSvg(svg, tag, attributes) {
    const element = document.createElementNS(SVG_NS, tag);
    for (const [name, value] of Object.entries(attributes)) {
        // Paint is a style: the colours are `var()` tokens, which an SVG attribute
        // does not resolve.
        if (name === 'fill' || name === 'stroke') element.style.setProperty(name, String(value));
        else element.setAttribute(name, String(value));
    }
    svg.appendChild(element);
}

/**
 * A cell formatter drawing a survey measure's statistics as a compact box plot:
 * whiskers, the Q1–Q3 box and the median.
 * @param {object} options
 * @param {string} options.boxColor
 * @param {string} options.dataField - Row field holding the measure's statistics
 * @param {string} options.tooltipTitle
 * @param {import('../../../common/glossary/glossaryAnnotator.js').GlossaryAnnotator} options.glossary
 * @returns {import('../../../common/tables/columnFactories.js').TableCellFormatter}
 */
function createBoxPlotFormatter(options) {
    const { boxColor, dataField, tooltipTitle, glossary } = options;
    const height = TABLE_BAR_HEIGHT_PX;

    return function (cell) {
        const rowData = cell.getRow().getData();
        const boxPlotData = rowData[dataField];

        if (
            !boxPlotData ||
            boxPlotData.count === 0 ||
            typeof boxPlotData.mean !== 'number' ||
            typeof boxPlotData.standardDeviation !== 'number' ||
            typeof boxPlotData.q1 !== 'number' ||
            typeof boxPlotData.q3 !== 'number'
        ) {
            return createEmptyStackedBar(glossary);
        }

        const container = document.createElement('div');
        container.style.width = '100%';
        container.style.height = `${height}px`;
        container.style.display = 'flex';
        container.style.alignItems = 'center';
        container.style.justifyContent = 'center';

        const svg = document.createElementNS(SVG_NS, 'svg');
        svg.setAttribute('width', `${BOX_CELL_WIDTH_PX}`);
        svg.setAttribute('height', `${height}`);
        svg.setAttribute('viewBox', `0 0 ${BOX_CELL_WIDTH_PX} ${height}`);

        // The whisker ends are Tukey's (the extreme values inside the 1.5·IQR fences),
        // as in every SL box-plot chart.
        const { median, q1, q3, whiskerMin, whiskerMax } = boxPlotData;

        // Drawn inside the rating scale; the tooltip reports the values themselves.
        const min = Math.max(RATING_SCALE_MIN, whiskerMin);
        const max = Math.min(RATING_SCALE_MAX, whiskerMax);

        const scaleLengthPx = BOX_CELL_WIDTH_PX - 2 * BOX_CELL_INSET_PX;
        /**
         * @param {number} value
         * @returns {number} Its x position in px.
         */
        const scale = (value) => {
            const range = RATING_SCALE_MAX - RATING_SCALE_MIN;
            return BOX_CELL_INSET_PX + ((value - RATING_SCALE_MIN) / range) * scaleLengthPx;
        };

        const minX = scale(min);
        const q1X = scale(q1);
        const medianX = scale(median);
        const q3X = scale(q3);
        const maxX = scale(max);

        const centerY = height / 2;
        const boxHeight = height * BOX_HEIGHT_RATIO;
        const whiskerCapHeight = height * WHISKER_CAP_HEIGHT_RATIO;
        const stroke = { stroke: 'var(--text-color)', 'stroke-width': '1.5' };
        const capTop = centerY - whiskerCapHeight / 2;
        const capBottom = centerY + whiskerCapHeight / 2;

        appendSvg(svg, 'line', { x1: minX, y1: centerY, x2: q1X, y2: centerY, ...stroke });
        appendSvg(svg, 'line', { x1: minX, y1: capTop, x2: minX, y2: capBottom, ...stroke });
        appendSvg(svg, 'rect', {
            x: q1X,
            y: centerY - boxHeight / 2,
            width: q3X - q1X,
            height: boxHeight,
            fill: boxColor,
            'fill-opacity': BOX_OPACITY,
            ...stroke,
        });
        appendSvg(svg, 'line', {
            x1: medianX,
            y1: centerY - boxHeight / 2,
            x2: medianX,
            y2: centerY + boxHeight / 2,
            stroke: 'var(--chart-label-color)',
            'stroke-width': '2',
        });
        appendSvg(svg, 'line', { x1: q3X, y1: centerY, x2: maxX, y2: centerY, ...stroke });
        appendSvg(svg, 'line', { x1: maxX, y1: capTop, x2: maxX, y2: capBottom, ...stroke });

        // The outliers are counted by the rule that drew the whiskers.
        const tooltip = boxPlotTooltip(boxPlotData, {
            title: tooltipTitle,
            count: boxPlotData.count,
            min: whiskerMin,
            max: whiskerMax,
        });
        setTooltipContent(container, tooltip);
        // One image to assistive tech, named by the statistics the tooltip shows: the
        // tooltip has no keyboard path.
        container.setAttribute('role', 'img');
        container.setAttribute('aria-label', cursorTooltip.toPlainText(tooltip));

        container.appendChild(svg);
        return container;
    };
}

/**
 * Create a Tabulator cell formatter that switches between boxplot and
 * stacked-bar rendering. It reads `vizModeGetter()` on each render, so a table
 * redraw applies a mode change.
 * @param {object} config
 * @param {string} config.dataField - Row data field containing box-plot stats (e.g. `'teachingQuality'`)
 * @param {string} config.boxColor - CSS colour for the box-plot box
 * @param {string} config.tooltipTitle - Tooltip/label text (e.g. `'Unterrichtsqualität'`)
 * @param {() => string} config.vizModeGetter - Returns the current viz mode (`VIZ_MODES.BOXPLOT` or `VIZ_MODES.STACKED_BAR`)
 * @param {import('../../../common/glossary/glossaryAnnotator.js').GlossaryAnnotator} config.glossary - Labels an empty cell.
 * @returns {(cell: import('tabulator-tables').CellComponent) => string | HTMLElement} Empty for a row without `dataField`.
 */
export function createVizModeSwitchingFormatter({
    dataField,
    boxColor,
    tooltipTitle,
    vizModeGetter,
    glossary,
}) {
    const boxPlot = createBoxPlotFormatter({
        boxColor,
        dataField,
        tooltipTitle,
        glossary,
    });

    return function (cell) {
        const rowData = cell.getRow().getData();

        if (!rowData[dataField]) {
            return '';
        }

        return vizModeGetter() === VIZ_MODES.BOXPLOT
            ? boxPlot(cell)
            : createRatingStackedBar(glossary, rowData[dataField].distribution, tooltipTitle);
    };
}

/**
 * A stacked bar of a survey measure's rating bands.
 * @param {import('../../../common/glossary/glossaryAnnotator.js').GlossaryAnnotator} glossary
 * @param {import('../../utils/slRatingDistribution.js').RatingDistributionEntry[]} distribution - The bands with their headcounts.
 * @param {string} title - The tooltip title.
 * @returns {HTMLElement}
 */
function createRatingStackedBar(glossary, distribution, title) {
    // The buckets are segments already — label, colour, headcount, share of the students
    // rated; an empty band draws nothing.
    const segments = buildRatingBuckets(distribution).filter((bucket) => bucket.value > 0);
    if (segments.length === 0) return createEmptyStackedBar(glossary);

    return createDOMStackedBar(segments, {
        getTooltipContent: (segment) =>
            ratingBandTooltip(
                {
                    label: segment.label,
                    count: segment.value,
                    total: segment.total,
                    percentage: segment.percentage,
                },
                { title },
            ),
    });
}

/**
 * The columns of one per-student survey measure (Unterrichtsqualität /
 * Selbstwirksamkeit): a vizMode-switching cell over the measure's statistics
 * (`dataField`), then the six export columns with the statistics' numbers. State rows
 * render empty — the Landesschnitt delivers no survey data.
 * @param {object} config
 * @param {string} config.title - Column header and tooltip text
 * @param {'teachingQuality'|'selfEfficacy'} config.dataField - Row data field with the statistics; it also names the theme colour
 * @param {() => string} config.vizModeGetter
 * @param {import('../../../common/glossary/glossaryAnnotator.js').GlossaryAnnotator} config.glossary - Labels an empty cell.
 * @returns {import('../../../common/tables/columnFactories.js').TableColumnDefinition[]} The visual column, then its export columns.
 */
export function createSurveyMeasureColumns({ title, dataField, vizModeGetter, glossary }) {
    return [
        {
            title,
            field: dataField,
            formatter: createVizModeSwitchingFormatter({
                dataField,
                boxColor: SL_SERIES_COLORS[dataField],
                tooltipTitle: title,
                vizModeGetter,
                glossary,
            }),
            widthGrow: COLUMN_GROW_RATIOS.bar,
            minWidth: VISUAL_COLUMN_MIN_WIDTHS.progressBar,
            // The field holds the statistics object; the export columns carry its numbers.
            download: false,
        },
        ...createSurveyMeasureDownloadColumns({ dataField, label: title, follows: dataField }),
    ];
}

/**
 * The six export columns behind one survey-measure column: the statistics the box plot
 * is drawn from.
 * @param {object} config
 * @param {string} config.dataField - Row field holding the statistics object (e.g. `'teachingQuality'`).
 * @param {string} config.label - German measure name, prefixed onto every header.
 * @param {string} config.follows - Field of the visual column these belong to.
 * @returns {import('../../../common/tables/columnFactories.js').TableColumnDefinition[]}
 */
function createSurveyMeasureDownloadColumns({ dataField, label, follows }) {
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
 * The row fields of one survey measure: under `field` the statistics with the headcount
 * and the rating bands merged in (`count` and `distribution` sit beside `statistics` on
 * the entry; the export column and the stacked bar read them off the same field).
 * @param {'teachingQuality'|'selfEfficacy'} field - The measure's column field.
 * @param {import('../../utils/slSurveyDerivation.js').SurveyAggregate|null|undefined} aggregate - The measure, when there is one.
 * @returns {{[field: string]: any}} The fields to spread into the row; none without statistics.
 */
export function surveyMeasureFields(field, aggregate) {
    const figures = surveyFigures(aggregate);
    return figures ? { [field]: figures } : {};
}

/**
 * The "Kompetenzstufen" column of both SL tables: a stacked bar per row (or per
 * Domäne), exported through the per-level columns that follow it.
 * @param {object} config
 * @param {string} config.field
 * @param {import('../../../common/tables/columnFactories.js').TableCellFormatter} config.formatter
 * @param {boolean} [config.variableHeight] - Whether a cell may stack several bars.
 * @returns {import('../../../common/tables/columnFactories.js').TableColumnDefinition}
 */
export function createCompetenceLevelDistributionColumn({
    field,
    formatter,
    variableHeight = false,
}) {
    return {
        title: TERM_CONSTANTS.COMP_LEVELS,
        field,
        variableHeight,
        formatter,
        widthGrow: COLUMN_GROW_RATIOS.bar,
        minWidth: VISUAL_COLUMN_MIN_WIDTHS.progressBar,
        download: false,
        tableMeta: {
            // The header opens the scale popup, like the chart legend. "Kompetenzstufen"
            // is an `exact` alias of `kompetenzstufenverteilung` in the glossary, so
            // free-text annotation would resolve it to "Kompetenzstufenverteilung".
            headerGlossaryKey: GLOSSARY_KEYS.COMPETENCE_LEVEL,
        },
    };
}

/**
 * The export columns behind a stacked-bar column: one per bar field, each the share
 * (%) of the bar its segment draws — the figure the table shows, whether the row holds
 * headcounts or delivered percentages. A field the row does not carry exports blank.
 * @param {object} config
 * @param {string[]} config.fields - The bar's fields, in stacking order.
 * @param {{[field: string]: string}} config.titles - Each field's column title, before the `(%)` unit.
 * @param {string} config.follows - The bar column whose visibility the columns follow.
 * @returns {import('../../../common/tables/columnFactories.js').TableColumnDefinition[]} Hidden download-only columns.
 */
export function createShareDownloadColumns({ fields, titles, follows }) {
    return fields.map((field) =>
        createDownloadColumn(`${titles[field]} (%)`, field, {
            follows,
            accessor: (value, data) =>
                formatDownloadNumber(value == null ? null : fieldShare(data, fields, field), 1),
        }),
    );
}

/**
 * The text of one count sub-column's cell, which also sizes the column.
 * @typedef {(row: {[field: string]: any}, field: string) => string} SubColumnLabel
 */

/**
 * A count sub-column as wide as its widest cell or header (`fitContent`). Its cells do
 * not wrap, so each text is one unbreakable word (no-break spaces) and the column's
 * floor fits the widest of them whole: a count and its share are never clipped or run
 * into the next column.
 * @param {string} field
 * @param {SubColumnLabel} label
 * @returns {Partial<import('../../../common/tables/columnFactories.js').TableColumnDefinition>} The shared part of the definition.
 */
function countSubColumn(field, label) {
    const text = (/** @type {{[field: string]: any}} */ row) =>
        label(row, field).replaceAll(' ', '\u00a0');
    return {
        field,
        formatter: (cell) => text(cell.getRow().getData()),
        // Counts and shares carry no glossary term.
        tableMeta: {
            fitContent: true,
            skipCellGlossaryAnnotation: true,
            cellWords: (rows) => rows.map(text),
        },
    };
}

/**
 * The "Geschlechtsverteilung" column group of a group table: one narrow count
 * sub-column per gender, titled with its label's initial and exported under the full label.
 * @param {SubColumnLabel} cellLabel
 * @returns {import('../../../common/tables/columnFactories.js').TableColumnDefinition}
 */
export function createGenderColumns(cellLabel) {
    return {
        title: 'Geschlechtsverteilung',
        columns: Object.entries(GENDER_LABELS).map(([gender, label]) => ({
            title: label.charAt(0),
            titleDownload: label,
            ...countSubColumn(`gender_${gender}`, cellLabel),
        })),
    };
}

/**
 * The grouped column for the traits ("Merkmale"); none without traits, so a table
 * never gets an empty column group.
 *
 * Each trait becomes a narrow sub-column; its cells are counts or shares. The rows hold
 * headcounts, so the file carries each count and, in a hidden `<Merkmal> (%)` column,
 * its share of the row's students (blank for a row without headcounts), while that
 * trait's column shows.
 * @param {import('../../../common/glossary/glossaryAnnotator.js').GlossaryAnnotator} glossary - The app's glossary, which names the codes it describes.
 * @param {ReadonlyMap<string, string>} traitLabels - The payload's labels (`SL_DATASETS.TRAIT_LABELS`) for the codes it does not.
 * @param {string[]} traitCodes - One sub-column each.
 * @param {SubColumnLabel} cellLabel
 * @returns {import('../../../common/tables/columnFactories.js').TableColumnDefinition[]} The column group and its share columns, or nothing.
 */
export function createTraitColumns(glossary, traitLabels, traitCodes, cellLabel) {
    if (traitCodes.length === 0) return [];
    return [
        {
            title: TERM_CONSTANTS.TRAITS,
            columns: traitCodes.map((trait) => ({
                title: trait.toUpperCase(),
                ...traitHeaderTooltip(getTraitFallbackLabel(glossary, traitLabels, trait)),
                ...countSubColumn(`trait_${trait}`, cellLabel),
            })),
        },
        ...traitCodes.map((trait) =>
            createDownloadColumn(`${trait.toUpperCase()} (%)`, `traitShare_${trait}`, {
                follows: `trait_${trait}`,
                accessor: (_value, data) =>
                    formatDownloadNumber(
                        percentOf(data[`trait_${trait}`] || 0, data.studentCount || 0),
                        1,
                    ),
            }),
        ),
    ];
}

/**
 * A trait sub-column's header tooltip. The header is the bare code. A code the glossary
 * knows keeps the default glossary titleFormatter, which makes it a popup chip; only an
 * unfamiliar code gets its label as a tooltip.
 * @param {string|null} label - The code's payload label, `null` for a code the glossary knows.
 * @returns {{titleFormatter?: (cell: import('tabulator-tables').CellComponent) => string}} The formatter, or nothing for a known code.
 */
function traitHeaderTooltip(label) {
    if (!label) return {};
    return {
        titleFormatter: (cell) =>
            `<span data-tooltip-text="${escapeHtml(label)}">${escapeHtml(cell.getValue())}</span>`,
    };
}

/**
 * The "Anzahl Schüler:innen" column of the SL tables; a row without a headcount (a
 * delivered comparison population) prints the missing mark.
 * @returns {import('../../../common/tables/columnFactories.js').TableColumnDefinition}
 */
export function createStudentCountColumn() {
    return {
        title: `Anzahl ${TERM_CONSTANTS.STUDENTS}`,
        field: 'studentCount',
        widthGrow: COLUMN_GROW_RATIOS.narrow,
        formatter: (cell) => formatCount(cell.getValue()),
    };
}

/**
 * The trait and gender fields of one row.
 * @param {string[]} traitCodes - The trait codes present in the data.
 * @param {(trait: string) => unknown} traitValue - The row's value per trait.
 * @param {(gender: string) => unknown} genderValue - The row's value per gender code.
 * @returns {{[field: string]: any}} The `trait_*` and `gender_*` fields.
 */
export function demographicFields(traitCodes, traitValue, genderValue) {
    return Object.fromEntries([
        ...traitCodes.map((trait) => [`trait_${trait}`, traitValue(trait)]),
        ...Object.keys(GENDER_LABELS).map((gender) => [`gender_${gender}`, genderValue(gender)]),
    ]);
}

/**
 * A table bar segment's tooltip in the chart vocabulary: which category, its share, and
 * — where the row's values are headcounts — how many of how many. A delivered
 * comparison row carries percentages, so it gets no count row.
 * @param {string} label - What the category is, e.g. `TERM_CONSTANTS.COMP_LEVEL`.
 * @returns {(segment: import('../../../common/utils/stackedBarUtils.js').StackedSegment, rowData?: {type?: string}) => import('../../../common/services/cursorTooltip.js').TooltipContent} The bar's `getTooltipContent`.
 */
export function shareSegmentTooltip(label) {
    return (segment, rowData) => ({
        rows: shareRows({
            label,
            value: segment.label,
            share: segment.percentage,
            count: rowData?.type === 'comparison' ? null : segment.value,
            total: segment.total,
        }),
    });
}
