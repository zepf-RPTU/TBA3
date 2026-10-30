/**
 * The progress-bar distribution column with its formatter and its export columns, the
 * Pilotierung sibling column and its export columns, and the result block the item
 * tables end with. Each column declares its header sort cycle, and its sorter reads the
 * step in force back from progressBarSorting.js.
 */

import { VISUAL_COLUMN_MIN_WIDTHS, COLUMN_GROW_RATIOS } from './columnWidthConstants.js';
import { formatDownloadNumber } from './downloadNumberFormat.js';
import { createDownloadColumn } from './tableExport.js';
import { distributionFields } from './distributionFields.js';
import { getProgressBarSortField } from './progressBarSorting.js';
import { GLOSSARY_KEYS } from '../glossary/glossaryKeys.js';
import { compareNumbers } from '../utils/compare.js';
import { toPercent } from '../domain/itemResultCounts.js';
import './progressBarColumn.css';
import { createDOMStackedBar, createEmptyBarLabel, processSegments } from './stackedBarCell.js';
import { MISSING_VALUE, formatCount, formatPercent, formatShare } from '../utils/numberFormat.js';
import { pilotDiffHtml } from '../utils/pilotDiff.js';
import { TERM_CONSTANTS } from '../domain/terms.js';
import { RESULT } from '../domain/apiValueMaps.js';

/**
 * Pilotierung column field names and labels, shared by the column definition and its
 * sort cycle. The column title contains both labels verbatim
 * (`progressBarSortLabelsInTitle`, checked when the column is built): the header
 * highlight finds the active step's label inside it.
 */
const PILOT_VALUE_FIELD = 'pilotSolutionFrequency';
const PILOT_DIFF_FIELD = 'pilotSolutionFrequencyDiff';
const PILOT_VALUE_LABEL = 'Pilotierung';
const PILOT_DIFF_LABEL = 'Δ';

/** @type {ReadonlyArray<import('./progressBarSorting.js').ProgressBarSortStep>} */
const PILOT_SORT_STEPS = Object.freeze([
    { field: PILOT_VALUE_FIELD, label: PILOT_VALUE_LABEL, dir: 'asc' },
    { field: PILOT_VALUE_FIELD, label: PILOT_VALUE_LABEL, dir: 'desc' },
    { field: PILOT_DIFF_FIELD, label: PILOT_DIFF_LABEL, dir: 'asc' },
    { field: PILOT_DIFF_FIELD, label: PILOT_DIFF_LABEL, dir: 'desc' },
]);

/**
 * The cycle of a Richtig | Unbearbeitet | Falsch bar: each share ascending, then
 * descending.
 * @param {ReturnType<typeof import('./distributionFields.js').distributionFields>} fields - The row fields the bar reads.
 * @returns {ReadonlyArray<import('./progressBarSorting.js').ProgressBarSortStep>}
 */
function distributionSortSteps(fields) {
    return Object.freeze(
        [
            [fields.correct, RESULT.CORRECT],
            [fields.notAttempted, RESULT.NOT_ATTEMPTED],
            [fields.incorrect, RESULT.INCORRECT],
        ].flatMap(([field, label]) => [
            { field, label, dir: /** @type {const} */ ('asc') },
            { field, label, dir: /** @type {const} */ ('desc') },
        ]),
    );
}

const PILOT_COLUMN_TITLE = `${PILOT_VALUE_LABEL} (${PILOT_DIFF_LABEL})`;

/**
 * @param {unknown} value - A row field.
 * @returns {number|null} The number, or `null` when the row carries none: an absent share
 *   is unknown, not 0 %.
 */
function readNumber(value) {
    const number = Number.parseFloat(String(value));
    return Number.isFinite(number) ? number : null;
}

/**
 * Creates the formatter of a Richtig | Unbearbeitet | Falsch distribution bar.
 * @param {import('../context/moduleContext.js').ModuleContext} context - The app's context: the palette the segments resolve on, the glossary's no-data text.
 * @param {ReturnType<typeof distributionFields>} fields - The row fields the bar reads.
 * @param {string|null} benchmarkField - Row field (0–1) drawn as a benchmark line at value*100% of the bar width, or `null` for none.
 * @param {string} countLabel - The tooltip's label for a segment's count: what the row counts.
 * @returns {import('./columnFactories.js').TableCellFormatter}
 */
function createProgressBarFormatter(context, fields, benchmarkField, countLabel) {
    // The three share fields in bar order; each result paints from its CSS token.
    const bar = {
        fields: [fields.correct, fields.notAttempted, fields.incorrect],
        colors: {
            [fields.correct]: 'var(--result-correct)',
            [fields.notAttempted]: 'var(--result-not-attempted)',
            [fields.incorrect]: 'var(--result-incorrect)',
        },
        labels: {
            [fields.correct]: RESULT.CORRECT,
            [fields.notAttempted]: RESULT.NOT_ATTEMPTED,
            [fields.incorrect]: RESULT.INCORRECT,
        },
    };
    const countField = {
        [fields.correct]: fields.correctCount,
        [fields.notAttempted]: fields.notAttemptedCount,
        [fields.incorrect]: fields.incorrectCount,
    };
    return function (cell) {
        const rowData = cell.getRow().getData();
        const hasData = bar.fields.some((field) => readNumber(rowData[field]) !== null);

        // A share the row does not carry, or a zero one, gets no segment; the bar
        // stacks the rest to 100 %, while each tooltip keeps the share as delivered.
        // A row with none of the three is not segmented (`processSegments` would
        // warn that every segment dropped out).
        const segments = hasData ? processSegments(context.palette, rowData, bar) : [];
        const benchmark = benchmarkField ? parseFloat(rowData[benchmarkField]) : NaN;
        const container = createDOMStackedBar(segments, {
            marker:
                hasData && Number.isFinite(benchmark)
                    ? {
                          at: toPercent(benchmark),
                          tooltip: {
                              rows: [
                                  {
                                      label: PILOT_VALUE_LABEL,
                                      value: formatShare(benchmark, 0),
                                  },
                              ],
                          },
                      }
                    : null,
            // Only the Richtig share is labelled, as delivered: the one a reader sets
            // against the Pilotierung rate; more labels would crowd the benchmark line.
            labelFormatter: (segment) =>
                segment.field === fields.correct
                    ? formatPercent(readNumber(rowData[fields.correct]), 0)
                    : null,
            getTooltipContent: (segment) => {
                const count = readNumber(rowData[countField[segment.field]]);
                return {
                    title: segment.label,
                    rows: [
                        {
                            label: TERM_CONSTANTS.SHARE,
                            value: formatPercent(readNumber(rowData[segment.field])),
                        },
                        count !== null && {
                            label: countLabel,
                            value: formatCount(count),
                        },
                    ],
                };
            },
        });
        container.classList.add('percentage-bar-container');

        if (!hasData) container.appendChild(createEmptyBarLabel(context.glossary));

        return container;
    };
}

/**
 * The progress-bar column, then the six hidden export columns that carry its numbers
 * (the three counts and the three percentages the bar is drawn from), each exported
 * only while the bar is shown. The bar's own field is only the column's name
 * (`distributionFields(prefix).bar`): it reads the sibling distribution fields.
 *
 * The header reads "Verteilung" and resolves to the glossary entry that carries the
 * bar's colour key; the sort step in force adds its share's label after it
 * (progressBarSorting.js).
 * @param {import('../context/moduleContext.js').ModuleContext} context - The app's context: the header's glossary, the bar's palette.
 * @param {object} [options]
 * @param {string} [options.fieldPrefix] - Domain prefix of the fields the bar reads (`'d0'` → `d0PercentageCorrect`); omitted, it reads the plain fields.
 * @param {string|null} [options.benchmarkField] - Row field (0–1) drawn as a benchmark marker.
 * @param {string} [options.countLabel] - What a row's counts count: students on an item row (the default), items on a student row (`TERM_CONSTANTS.ITEM_COUNT`).
 * @param {ReadonlyArray<string>} [options.skipFields] - Export columns another column of the table already carries: two columns cannot share a field.
 * @returns {import('./columnFactories.js').TableColumnDefinition[]} The bar first.
 */
export function createProgressBarColumns(
    context,
    {
        fieldPrefix = '',
        benchmarkField = null,
        countLabel = TERM_CONSTANTS.STUDENT_COUNT,
        skipFields = [],
    } = {},
) {
    const fields = distributionFields(fieldPrefix);
    /** @type {Array<[string, string]>} */
    const countFields = [
        [`${RESULT.CORRECT} (Anzahl)`, fields.correctCount],
        [`${RESULT.INCORRECT} (Anzahl)`, fields.incorrectCount],
        [`${RESULT.NOT_ATTEMPTED} (Anzahl)`, fields.notAttemptedCount],
    ];
    const counts = countFields.map(([title, field]) =>
        createDownloadColumn(title, field, { follows: fields.bar }),
    );
    /** @type {Array<[string, string]>} */
    const percentageFields = [
        [`${RESULT.CORRECT} (%)`, fields.correct],
        [`${RESULT.INCORRECT} (%)`, fields.incorrect],
        [`${RESULT.NOT_ATTEMPTED} (%)`, fields.notAttempted],
    ];
    const percentages = percentageFields.map(([title, field]) =>
        createDownloadColumn(title, field, {
            follows: fields.bar,
            // The row stores the full float (e.g. 62.06896551724138).
            accessor: (value) => formatDownloadNumber(value, 1),
        }),
    );
    return [
        progressBarColumn(context, fields, benchmarkField, countLabel),
        ...[...counts, ...percentages].filter(
            (column) => !skipFields.includes(/** @type {string} */ (column.field)),
        ),
    ];
}

/**
 * The bar itself.
 * @param {import('../context/moduleContext.js').ModuleContext} context
 * @param {ReturnType<typeof distributionFields>} fields
 * @param {string|null} benchmarkField
 * @param {string} countLabel
 * @returns {import('./columnFactories.js').TableColumnDefinition}
 */
function progressBarColumn(context, fields, benchmarkField, countLabel) {
    const field = fields.bar;

    return {
        field,
        minWidth: VISUAL_COLUMN_MIN_WIDTHS.progressBar,
        widthGrow: COLUMN_GROW_RATIOS.bar,
        formatter: createProgressBarFormatter(context, fields, benchmarkField, countLabel),
        // This column's own field holds nothing to export: the export columns carry the
        // numbers.
        download: false,
        sorter: function (a, b, aRow, bRow) {
            const sortField = getProgressBarSortField(aRow.getTable(), field) ?? fields.correct;
            return compareNumbers(
                readNumber(aRow.getData()[sortField]),
                readNumber(bRow.getData()[sortField]),
            );
        },
        tableMeta: {
            headerGlossaryKey: GLOSSARY_KEYS.VERTEILUNG,
            progressBarSortSteps: distributionSortSteps(fields),
            // The formatter returns an element; there is no text to annotate.
            skipCellGlossaryAnnotation: true,
        },
    };
}

/**
 * The result block an item table ends with: the distribution bar with
 * its Pilotierung marker and export columns, then the Pilotierung column with its
 * export columns.
 * @param {import('../context/moduleContext.js').ModuleContext} context
 * @returns {import('./columnFactories.js').TableColumnDefinition[]}
 */
export function createItemResultColumns(context) {
    return [
        ...createProgressBarColumns(context, { benchmarkField: PILOT_VALUE_FIELD }),
        createPilotColumn(),
        ...createPilotDownloadColumns(),
    ];
}

/**
 * The "Pilotierung" column of an item table. The cell shows the expected
 * solution rate as a percentage followed by the signed difference to the group mean,
 * coloured green/red.
 *
 * Its header click cycles absolute value ↑/↓, then difference Δ ↑/↓. The sorter
 * reads the step in force and falls back to the absolute value when the column is
 * not registered.
 * @returns {import('./columnFactories.js').TableColumnDefinition}
 */
function createPilotColumn() {
    return {
        title: PILOT_COLUMN_TITLE,
        field: PILOT_VALUE_FIELD,
        // createPilotDownloadColumns() exports the value and the difference.
        download: false,
        formatter(cell) {
            const freq = cell.getValue();
            if (freq == null) return MISSING_VALUE;
            // Value and difference meet at the cell's centre line (progressBarColumn.css):
            // centred as one string, a row with another digit count shifts by half a
            // character and the column stops lining up.
            const value = `<span class="pilot-value">${formatShare(freq, 0)}</span>`;
            const diff = cell.getRow().getData()[PILOT_DIFF_FIELD];
            if (diff == null) {
                return `<span class="pilot-cell">${value}</span>`;
            }
            return `<span class="pilot-cell">${value}${pilotDiffHtml(diff, 'pilot-diff')}</span>`;
        },
        sorter(a, b, aRow, bRow) {
            const sortField =
                getProgressBarSortField(aRow.getTable(), PILOT_VALUE_FIELD) ?? PILOT_VALUE_FIELD;
            return compareNumbers(aRow.getData()[sortField], bRow.getData()[sortField]);
        },
        tableMeta: {
            progressBarSortSteps: PILOT_SORT_STEPS,
            progressBarSortLabelsInTitle: true,
            skipCellGlossaryAnnotation: true,
        },
    };
}

/**
 * The two export columns behind the Pilotierung column: the expected solution
 * rate as a whole percent, and the signed difference in percentage points.
 * @returns {import('./columnFactories.js').TableColumnDefinition[]}
 */
function createPilotDownloadColumns() {
    return [
        // A synthetic field, not PILOT_VALUE_FIELD: two columns sharing one field
        // would make getColumn(), which `follows` relies on, ambiguous.
        createDownloadColumn(`${PILOT_VALUE_LABEL} (%)`, `${PILOT_VALUE_FIELD}Percent`, {
            follows: PILOT_VALUE_FIELD,
            // Stored as a fraction; the cell shows it as a whole percent.
            accessor: (_value, data) => {
                const raw = data[PILOT_VALUE_FIELD];
                return formatDownloadNumber(raw == null ? null : toPercent(raw), 0);
            },
        }),
        createDownloadColumn(
            `${PILOT_VALUE_LABEL} ${PILOT_DIFF_LABEL} (%-Punkte)`,
            PILOT_DIFF_FIELD,
            {
                follows: PILOT_VALUE_FIELD,
                accessor: (value) => formatDownloadNumber(value, 0),
            },
        ),
    ];
}
