/**
 * Generic Tabulator cell formatters:
 * a survey-measure box plot, the correct/incorrect/not-attempted result
 * icon, count+percentage text, and the stacked variable-height cell builder.
 */

import { getThemeColors } from '../services/themeService.js';
import { iconSvg } from '@tba3/module-base/utils/icons.js';

/** The classes `createResultFormatter` stamps on its icons; EN's result descriptors reuse them. */
export const RESULT_ICON_CLASSES = {
    CORRECT: 'result-icon-correct',
    INCORRECT: 'result-icon-incorrect',
    NOT_ATTEMPTED: 'result-icon-not-attempted',
};

/**
 * Creates a box plot formatter for a survey measure's statistics in table cells
 * Renders a simple box plot with whiskers, box (Q1-Q3), and median line
 * @param {object} options - Configuration options
 * @param {string} options.boxColor - Color for the box
 * @param {string} options.dataField - Row field holding the measure's statistics
 * @param {string} options.tooltipTitle - Title for the tooltip
 * @param {number} [options.minValue] - Minimum value for scale (default: 1)
 * @param {number} [options.maxValue] - Maximum value for scale (default: 5)
 * @param {number} [options.boxOpacity] - Opacity for the box (default: 0.7)
 * @param {number} [options.height] - Canvas height in px; box/whisker geometry scales with it (default: 40)
 * @returns {Function} Tabulator formatter function
 */
export function createBoxPlotFormatter(options) {
    const {
        boxColor,
        dataField,
        tooltipTitle,
        minValue = 1,
        maxValue = 5,
        boxOpacity = 0.7,
        height = 40,
    } = options;

    return function (cell) {
        const rowData = cell.getRow().getData();
        const boxPlotData = rowData[dataField];

        // Return empty if no data or invalid data (strict type checking)
        if (
            !boxPlotData ||
            boxPlotData.count === 0 ||
            typeof boxPlotData.mean !== 'number' ||
            typeof boxPlotData.standardDeviation !== 'number' ||
            typeof boxPlotData.q1 !== 'number' ||
            typeof boxPlotData.q3 !== 'number'
        ) {
            const emptySpan = document.createElement('span');
            emptySpan.textContent = '-';
            emptySpan.style.color = getThemeColors().chrome.textDisabled;
            return emptySpan;
        }

        // Create SVG container
        const container = document.createElement('div');
        container.style.width = '100%';
        container.style.height = `${height}px`;
        container.style.display = 'flex';
        container.style.alignItems = 'center';
        container.style.justifyContent = 'center';

        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('width', '120');
        svg.setAttribute('height', `${height}`);
        svg.setAttribute('viewBox', `0 0 120 ${height}`);

        // Use actual calculated values from the data (matching longitudinal box plot)
        const mean = boxPlotData.mean;
        const stdDev = boxPlotData.standardDeviation;
        const median = boxPlotData.median != null ? boxPlotData.median : mean;
        const q1 = boxPlotData.q1;
        const q3 = boxPlotData.q3;

        // Calculate whisker bounds (excluding outliers) - same as longitudinal box plot
        // Whiskers extend to 1.5 * stdDev beyond the mean, clamped to scale
        const min = Math.max(minValue, mean - 1.5 * stdDev);
        const max = Math.min(maxValue, mean + 1.5 * stdDev);

        // Scale function to convert values to pixel positions
        const scale = (value) => {
            const range = maxValue - minValue;
            return 10 + ((value - minValue) / range) * 100; // 10px padding on left, 100px width
        };

        const minX = scale(min);
        const q1X = scale(q1);
        const medianX = scale(median);
        const q3X = scale(q3);
        const maxX = scale(max);

        // Geometry scales with canvas height (ratios preserved from the 40px design).
        const centerY = height / 2;
        const boxHeight = height * 0.4;
        const whiskerCapHeight = height * 0.2;
        const strokeColor = getThemeColors().chrome.text;

        // Draw lower whisker (min to Q1)
        const lowerWhisker = /** @type {any} */ (
            document.createElementNS('http://www.w3.org/2000/svg', 'line')
        );
        lowerWhisker.setAttribute('x1', minX);
        lowerWhisker.setAttribute('y1', centerY);
        lowerWhisker.setAttribute('x2', q1X);
        lowerWhisker.setAttribute('y2', centerY);
        lowerWhisker.setAttribute('stroke', strokeColor);
        lowerWhisker.setAttribute('stroke-width', '1.5');
        svg.appendChild(lowerWhisker);

        // Draw lower whisker cap
        const lowerCap = /** @type {any} */ (
            document.createElementNS('http://www.w3.org/2000/svg', 'line')
        );
        lowerCap.setAttribute('x1', minX);
        lowerCap.setAttribute('y1', centerY - whiskerCapHeight / 2);
        lowerCap.setAttribute('x2', minX);
        lowerCap.setAttribute('y2', centerY + whiskerCapHeight / 2);
        lowerCap.setAttribute('stroke', strokeColor);
        lowerCap.setAttribute('stroke-width', '1.5');
        svg.appendChild(lowerCap);

        // Draw box (Q1 to Q3)
        const box = /** @type {any} */ (
            document.createElementNS('http://www.w3.org/2000/svg', 'rect')
        );
        box.setAttribute('x', q1X);
        box.setAttribute('y', centerY - boxHeight / 2);
        box.setAttribute('width', q3X - q1X);
        box.setAttribute('height', boxHeight);
        box.setAttribute('fill', boxColor);
        box.setAttribute('fill-opacity', boxOpacity);
        box.setAttribute('stroke', strokeColor);
        box.setAttribute('stroke-width', '1.5');
        svg.appendChild(box);

        // Draw median line
        const medianLine = /** @type {any} */ (
            document.createElementNS('http://www.w3.org/2000/svg', 'line')
        );
        medianLine.setAttribute('x1', medianX);
        medianLine.setAttribute('y1', centerY - boxHeight / 2);
        medianLine.setAttribute('x2', medianX);
        medianLine.setAttribute('y2', centerY + boxHeight / 2);
        medianLine.setAttribute('stroke', getThemeColors().chrome.chartLabelFill);
        medianLine.setAttribute('stroke-width', '2');
        svg.appendChild(medianLine);

        // Draw upper whisker (Q3 to max)
        const upperWhisker = /** @type {any} */ (
            document.createElementNS('http://www.w3.org/2000/svg', 'line')
        );
        upperWhisker.setAttribute('x1', q3X);
        upperWhisker.setAttribute('y1', centerY);
        upperWhisker.setAttribute('x2', maxX);
        upperWhisker.setAttribute('y2', centerY);
        upperWhisker.setAttribute('stroke', strokeColor);
        upperWhisker.setAttribute('stroke-width', '1.5');
        svg.appendChild(upperWhisker);

        // Draw upper whisker cap
        const upperCap = /** @type {any} */ (
            document.createElementNS('http://www.w3.org/2000/svg', 'line')
        );
        upperCap.setAttribute('x1', maxX);
        upperCap.setAttribute('y1', centerY - whiskerCapHeight / 2);
        upperCap.setAttribute('x2', maxX);
        upperCap.setAttribute('y2', centerY + whiskerCapHeight / 2);
        upperCap.setAttribute('stroke', strokeColor);
        upperCap.setAttribute('stroke-width', '1.5');
        svg.appendChild(upperCap);

        // Add tooltip with statistics (matching longitudinal box plot format)
        // Note: tooltip shows unclamped min/max, but rendering uses clamped values
        const tooltipMin = mean - 1.5 * stdDev;
        const tooltipMax = mean + 1.5 * stdDev;
        container.setAttribute(
            'data-tooltip-html',
            [
                tooltipTitle,
                `Median: ${median.toFixed(2)}`,
                `Mittelwert: ${mean.toFixed(2)}`,
                `Std.-Abw.: ${stdDev.toFixed(2)}`,
                `Q1 / Q3: ${q1.toFixed(2)} / ${q3.toFixed(2)}`,
                `Min / Max: ${tooltipMin.toFixed(2)} / ${tooltipMax.toFixed(2)}`,
            ].join('<br>'),
        );

        container.appendChild(svg);
        return container;
    };
}

/**
 * Create a standardized result formatter for tables
 * Renders check/x/block icons for correct/incorrect/not-attempted results
 * @param {object} cell - Tabulator cell object
 * @returns {HTMLElement|string} Formatted result element with icons
 */
export function createResultFormatter(cell) {
    const value = cell.getValue();

    let iconClass, iconName;

    if (value == 1) {
        iconClass = RESULT_ICON_CLASSES.CORRECT;
        iconName = 'check_circle';
    } else if (value == 0) {
        iconClass = RESULT_ICON_CLASSES.INCORRECT;
        iconName = 'cancel';
    } else if (value == -1) {
        iconClass = RESULT_ICON_CLASSES.NOT_ATTEMPTED;
        iconName = 'block';
    } else {
        return value;
    }

    return iconSvg(iconName, { className: iconClass });
}

/**
 * Creates a formatter function for columns showing count and percentage.
 * @param {string} totalField - Field name containing the total count (default: 'anzahlSus')
 * @returns {Function} Tabulator cell formatter function
 */
export function createCountPercentageFormatter(totalField = 'anzahlSus') {
    return function (cell) {
        const count = cell.getValue() || 0;
        const rowData = cell.getRow().getData();
        const total = rowData[totalField] || 0;
        const percentage = total > 0 ? ((count / total) * 100).toFixed(1) : '0.0';
        return `${count} (${percentage}%)`;
    };
}

/**
 * Creates a stacked cell container with multiple elements for variableHeight cells.
 * @param {object} options - Configuration options
 * @param {Function} options.getItems - Function to get items array from rowData
 * @param {Function} options.createItemElement - Function to create DOM element for each item
 * @param {Function} [options.skipCondition] - Optional function to check if cell should be skipped
 * @param {string} [options.emptyValue=''] - Value to return when skipped or empty
 * @param {string|null} [options.singleItemValue='-'] - Value to return for single item (null forces rendering the element)
 * @param {number} [options.gap=8] - Gap between items in pixels
 * @returns {Function} Tabulator cell formatter function
 */
export function createStackedCellFormatter(options) {
    const {
        getItems,
        createItemElement,
        skipCondition = null,
        emptyValue = '',
        singleItemValue = '-',
        gap = 8,
    } = options;

    return function (cell) {
        const rowData = cell.getRow().getData();

        if (skipCondition && skipCondition(rowData)) {
            return emptyValue;
        }

        const items = getItems(rowData);

        if (!items || items.length === 0) {
            return emptyValue;
        }
        if (items.length <= 1 && singleItemValue !== null) {
            return singleItemValue;
        }

        const container = document.createElement('div');
        container.style.display = 'flex';
        container.style.flexDirection = 'column';
        container.style.gap = `${gap}px`;
        container.style.padding = '4px 0';
        container.style.width = '100%';

        items.forEach((item, index) => {
            const element = createItemElement(item, index, rowData);
            if (element) {
                container.appendChild(element);
            }
        });

        return container;
    };
}
