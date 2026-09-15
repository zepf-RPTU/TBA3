/**
 * Progress-bar distribution columns and their formatter.
 *
 * The progress-bar column factory, its formatter, the Pilotierung sibling column
 * and its export columns. Their sorters read the active sort field from the
 * header-sort registry in progressBarSorting.js, a one-way dependency.
 */

import { VISUAL_COLUMN_MIN_WIDTHS, COLUMN_GROW_RATIOS } from './columnWidthConstants.js';
import { getThemeColors } from '../services/themeService.js';
import { glossaryAnnotator } from '../glossary/glossaryAnnotator.js';
import { formatDownloadNumber } from './downloadNumberFormat.js';
import { createDownloadColumn } from './tableExport.js';
import { LABELS } from './tableLabels.js';
import {
    getRegisteredProgressBarSortState,
    PILOTIERUNG_VALUE_FIELD,
    PILOTIERUNG_DIFF_FIELD,
    PILOTIERUNG_VALUE_LABEL,
    PILOTIERUNG_DIFF_LABEL,
} from './progressBarSorting.js';
import './progressBarColumn.css';

const PILOTIERUNG_COLUMN_TITLE = `${PILOTIERUNG_VALUE_LABEL} (${PILOTIERUNG_DIFF_LABEL})`;

/**
 * @param {unknown} value - A row field.
 * @returns {number|null} The number, or `null` when the row carries none — an absent share
 *   is unknown, not 0 %.
 */
function readNumber(value) {
    const number = Number.parseFloat(String(value));
    return Number.isFinite(number) ? number : null;
}

/** @returns {HTMLSpanElement} The centred label a bar shows in place of its segments when the row has no data. */
function createNoDataText() {
    const emptyText = document.createElement('span');
    emptyText.textContent = glossaryAnnotator.getRequiredEntryText(
        'general.messages.no-data-short',
    );
    emptyText.style.position = 'absolute';
    emptyText.style.left = '50%';
    emptyText.style.top = '50%';
    emptyText.style.transform = 'translate(-50%, -50%)';
    emptyText.style.fontSize = '10px';
    emptyText.style.color = getThemeColors().chrome.textSecondary;
    return emptyText;
}

/**
 * Creates a progress bar formatter for percentage distribution columns
 * @param {object} [options] - Configuration options
 * @param {Array} [options.fields] - Array of field names for dynamic field configuration (optional)
 * @param {object} [options.colors] - Object mapping field names to colors (optional)
 * @param {object} [options.labels] - Object mapping field names to display labels (optional)
 * @param {string} [options.correctField] - Field name for correct percentage (default: 'percentageCorrect')
 * @param {string} [options.incorrectField] - Field name for incorrect percentage (default: 'percentageIncorrect')
 * @param {string} [options.notAttemptedField] - Field name for not attempted percentage (default: 'percentageNotAttempted')
 * @param {string} [options.correctCountField] - Field name for correct count (default: 'correctCount')
 * @param {string} [options.incorrectCountField] - Field name for incorrect count (default: 'incorrectCount')
 * @param {string} [options.notAttemptedCountField] - Field name for not attempted count (default: 'notAttemptedCount')
 * @param {string} [options.correctLabel] - Label for correct in tooltip (default: 'Richtig')
 * @param {string} [options.incorrectLabel] - Label for incorrect in tooltip (default: 'Falsch')
 * @param {string} [options.notAttemptedLabel] - Label for not attempted in tooltip (default: 'Unbearbeitet')
 * @param {boolean} [options.normalize] - Whether to normalize percentages to 100% (default: true)
 * @param {boolean} [options.showCounts] - Whether to show absolute counts alongside percentages (default: false)
 * @param {string} [options.mode] - 'fixed' for standard 3-bar (correct/incorrect/notAttempted) or 'dynamic' for flexible fields (default: 'fixed')
 * @param {string} [options.benchmarkField] - Row field (0–1) drawn as a black vertical reference line at value*100% of the bar width (default: none)
 * @param {string} [options.benchmarkLabel] - Tooltip label for the benchmark marker (default: 'Pilotierung')
 * @returns {Function} Tabulator formatter function
 */
function createProgressBarFormatter(options = {}) {
    const {
        fields = null,
        colors = null,
        labels = null,
        correctField = 'percentageCorrect',
        incorrectField = 'percentageIncorrect',
        notAttemptedField = 'percentageNotAttempted',
        correctCountField = 'correctCount',
        incorrectCountField = 'incorrectCount',
        notAttemptedCountField = 'notAttemptedCount',
        correctLabel = LABELS.RICHTIG,
        incorrectLabel = LABELS.FALSCH,
        notAttemptedLabel = LABELS.UNBEARBEITET,
        normalize = true,
        showCounts = false,
        mode = 'fixed',
        benchmarkField = null,
        benchmarkLabel = 'Pilotierung',
    } = options;

    // Default colors for fixed mode (using CSS variables with fallbacks)
    const defaultColors = {
        [correctField]: 'var(--result-correct, #28a745)',
        [incorrectField]: 'var(--result-incorrect, #dc3545)',
        [notAttemptedField]: 'var(--result-not-attempted, #ffc107)',
    };

    // Default labels for fixed mode
    const defaultLabels = {
        [correctField]: correctLabel,
        [incorrectField]: incorrectLabel,
        [notAttemptedField]: notAttemptedLabel,
    };

    return function (cell) {
        const rowData = cell.getRow().getData();

        // Build container using existing progress-bars styles
        const container = document.createElement('div');
        container.className = 'percentage-bar-container';

        const stack = document.createElement('div');
        stack.className = 'bar-stack';
        stack.style.width = '100%';

        let fieldsToProcess, colorsToUse, labelsToUse;

        if (mode === 'dynamic' && fields && colors && labels) {
            // Dynamic mode: use provided fields, colors, and labels
            fieldsToProcess = fields;
            colorsToUse = colors;
            labelsToUse = labels;

            // Calculate total for percentage calculation
            const total = fieldsToProcess.reduce((sum, field) => {
                const value = parseFloat(rowData[field]) || 0;
                return sum + value;
            }, 0);

            if (total === 0) {
                container.appendChild(createNoDataText());
                return container;
            }

            // Create segments for dynamic fields
            fieldsToProcess.forEach((field) => {
                const value = parseFloat(rowData[field]) || 0;
                if (value > 0) {
                    const percentage = (value / total) * 100;

                    const bar = document.createElement('div');
                    bar.className = 'bar-segment';
                    bar.style.width = `${percentage}%`;
                    bar.style.backgroundColor =
                        colorsToUse[field] || getThemeColors().chrome.defaultBarColor;
                    bar.setAttribute(
                        'data-tooltip-text',
                        `${labelsToUse[field] || field}: ${value} (${percentage.toFixed(1)}%)`,
                    );

                    stack.appendChild(bar);
                }
            });
        } else {
            // Fixed mode: use standard correct/incorrect/notAttempted pattern
            fieldsToProcess = [correctField, incorrectField, notAttemptedField];
            colorsToUse = { ...defaultColors, ...colors };
            labelsToUse = { ...defaultLabels, ...labels };

            // A share the row does not carry gets no segment and no tooltip; a row carrying
            // none of the three shows the no-data text instead of an empty bar.
            const segments = [
                {
                    className: 'bar-correct',
                    share: readNumber(rowData[correctField]),
                    label: correctLabel,
                    countField: correctCountField,
                },
                {
                    className: 'bar-not-attempted',
                    share: readNumber(rowData[notAttemptedField]),
                    label: notAttemptedLabel,
                    countField: notAttemptedCountField,
                },
                {
                    className: 'bar-incorrect',
                    share: readNumber(rowData[incorrectField]),
                    label: incorrectLabel,
                    countField: incorrectCountField,
                },
            ].filter(
                /** @type {(segment: { className: string, share: number|null, label: string, countField: string }) => segment is { className: string, share: number, label: string, countField: string }} */ (
                    (segment) => segment.share !== null
                ),
            );

            if (segments.length === 0) {
                container.appendChild(createNoDataText());
                return container;
            }

            // Normalize to 100% when the shares do not add up (keeps visual proportions);
            // the tooltips keep the shares as delivered.
            const total = segments.reduce((sum, segment) => sum + segment.share, 0);
            const scale = normalize && total > 0 && total !== 100 ? 100 / total : 1;

            for (const { className, share, label, countField } of segments) {
                const bar = document.createElement('div');
                bar.className = className;
                bar.style.width = `${share * scale}%`;
                const count = showCounts ? readNumber(rowData[countField]) : null;
                bar.setAttribute(
                    'data-tooltip-text',
                    count === null
                        ? `${label}: ${share.toFixed(1)}%`
                        : `${label}: ${share.toFixed(1)}% (${count})`,
                );
                stack.appendChild(bar);
            }
        }

        container.appendChild(stack);

        // Optional benchmark marker (e.g. Pilotierung expected solution rate):
        // a black vertical line at `value * 100%` of the bar width.
        if (benchmarkField) {
            const benchmark = parseFloat(rowData[benchmarkField]);
            if (Number.isFinite(benchmark)) {
                const marker = document.createElement('div');
                marker.className = 'bar-benchmark-marker';
                marker.style.left = `${Math.max(0, Math.min(100, benchmark * 100))}%`;
                marker.setAttribute(
                    'data-tooltip-text',
                    `${benchmarkLabel}: ${Math.round(benchmark * 100)}%`,
                );
                container.appendChild(marker);
            }
        }

        return container;
    };
}

/**
 * Creates a standard progress bar column definition for tables.
 * Uses responsive width configuration with minWidth and widthGrow.
 * Supports fieldPrefix for domain-separated columns (e.g. 'd0' → reads d0PercentageCorrect).
 * @param {{[key: string]: any}} options - Configuration options (same as createProgressBarFormatter; supports fieldPrefix, e.g. 'd0' reads d0PercentageCorrect)
 * @param {string} title - Column title (default: 'Verteilung: Richtig | Unbearbeitet | Falsch')
 * @param {string} field - Field name (default: 'percentageCombined')
 * @param {object} columnOptions - Additional Tabulator column options (can override minWidth, widthGrow)
 * @returns {object} Tabulator column definition
 */
export function createProgressBarColumn(
    options = {},
    title = `${LABELS.VERTEILUNG}: ${LABELS.RICHTIG} | ${LABELS.UNBEARBEITET} | ${LABELS.FALSCH}`,
    field = 'percentageCombined',
    columnOptions = {},
) {
    const prefix = options.fieldPrefix || '';

    // Auto-derive prefixed field names when prefix is set
    if (prefix) {
        options = {
            ...options,
            correctField: options.correctField || `${prefix}PercentageCorrect`,
            incorrectField: options.incorrectField || `${prefix}PercentageIncorrect`,
            notAttemptedField: options.notAttemptedField || `${prefix}PercentageNotAttempted`,
            correctCountField: options.correctCountField || `${prefix}CorrectCount`,
            incorrectCountField: options.incorrectCountField || `${prefix}IncorrectCount`,
            notAttemptedCountField: options.notAttemptedCountField || `${prefix}NotAttemptedCount`,
        };
    }

    // Capture the resolved field names for the per-column sorter
    const correctSortField = options.correctField || 'percentageCorrect';
    const columnField = field;

    return {
        title: title,
        field: field,
        minWidth: VISUAL_COLUMN_MIN_WIDTHS.progressBar,
        widthGrow: COLUMN_GROW_RATIOS.progressBar,
        formatter: createProgressBarFormatter(options),
        // The bar is drawn from sibling fields, so this column's own field holds
        // nothing to export. createDistributionDownloadColumns() carries the
        // numbers instead (tableExport.js).
        download: false,
        headerSort: true,
        sorter: function (a, b, aRow, bRow) {
            const aData = aRow.getData();
            const bData = bRow.getData();
            const table = aRow.getTable();

            const sortState = getRegisteredProgressBarSortState(table, columnField);
            const currentSortField = sortState?.field || correctSortField;

            const aVal = parseFloat(aData[currentSortField]) || 0;
            const bVal = parseFloat(bData[currentSortField]) || 0;

            return aVal - bVal;
        },
        ...columnOptions,
    };
}

/**
 * Creates the "Pilotierung" column definition shared by the MA and EN item
 * tables. The cell shows the expected solution rate as a percentage followed by
 * the signed difference to the class mean, coloured green/red.
 *
 * Pair with setupPilotierungColumnSorting() to enable the cyclic header sort
 * (absolute value ↑/↓, then difference Δ ↑/↓). The sorter reads the active sort
 * field from the sort registry and falls back to the absolute value when the
 * column is not yet registered.
 * @returns {object} Tabulator column definition
 */
export function createPilotierungColumn() {
    return {
        title: PILOTIERUNG_COLUMN_TITLE,
        field: PILOTIERUNG_VALUE_FIELD,
        headerFilter: false,
        headerSort: true,
        // Numbers: right-aligned so the percentages line up down the column.
        hozAlign: 'right',
        // The cell combines the value with the signed difference; the raw field
        // is a 0–1 fraction. createPilotierungDownloadColumns() exports both
        // numbers separately.
        download: false,
        formatter(cell) {
            const freq = cell.getValue();
            if (freq == null) {
                return '—';
            }
            const freqPct = Math.round(freq * 100);
            const diff = cell.getRow().getData()[PILOTIERUNG_DIFF_FIELD];
            if (diff == null) {
                return `${freqPct}%`;
            }
            const sign = diff >= 0 ? '+' : '';
            const diffClass = diff >= 0 ? 'result-diff--up' : 'result-diff--down';
            return `${freqPct}%&nbsp;<span class="${diffClass}">(${sign}${diff}%)</span>`;
        },
        sorter(a, b, aRow, bRow) {
            const sortState = getRegisteredProgressBarSortState(
                aRow.getTable(),
                PILOTIERUNG_VALUE_FIELD,
            );
            const currentSortField = sortState?.field ?? PILOTIERUNG_VALUE_FIELD;
            const aVal = aRow.getData()[currentSortField] ?? -Infinity;
            const bVal = bRow.getData()[currentSortField] ?? -Infinity;
            return aVal - bVal;
        },
    };
}

/**
 * The two export columns behind the Pilotierung column: the expected solution
 * rate as a whole percent, and the signed difference in percentage points.
 *
 * Defined next to the cell above so the exported fields cannot drift away from
 * the ones the cell reads.
 * @returns {Array<object>} The two column definitions, value first.
 */
export function createPilotierungDownloadColumns() {
    return [
        // A synthetic field, not PILOTIERUNG_VALUE_FIELD: two columns sharing one
        // field would make getColumn() — which `follows` relies on — ambiguous.
        createDownloadColumn(
            `${PILOTIERUNG_VALUE_LABEL} (%)`,
            `${PILOTIERUNG_VALUE_FIELD}Prozent`,
            {
                follows: PILOTIERUNG_VALUE_FIELD,
                // Stored as a fraction; the cell shows it as a whole percent.
                accessor: (_value, data) => {
                    const raw = data[PILOTIERUNG_VALUE_FIELD];
                    return raw == null ? '' : formatDownloadNumber(raw * 100, 0);
                },
            },
        ),
        createDownloadColumn(
            `${PILOTIERUNG_VALUE_LABEL} ${PILOTIERUNG_DIFF_LABEL} (%-Punkte)`,
            PILOTIERUNG_DIFF_FIELD,
            {
                follows: PILOTIERUNG_VALUE_FIELD,
                accessor: (value) => formatDownloadNumber(value, 0),
            },
        ),
    ];
}
