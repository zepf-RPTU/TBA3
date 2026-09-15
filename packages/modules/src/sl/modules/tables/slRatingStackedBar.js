import { processSegments, createDOMStackedBar } from '../../../common/charts/stackedBarUtils.js';
import { getThemeColors } from '../../../common/services/themeService.js';
import { buildRatingBuckets } from '../../utils/slRatingDistribution.js';

/**
 * Pixel height for DOM stacked bars embedded in SL table cells. Kept below
 * --table-row-content-min so the bar sits within the shared row-content floor
 * that also governs EN/MA trait cells.
 */
export const EMBEDDED_BAR_HEIGHT = 18;

/**
 * Creates a stacked bar element for rating distribution (self-efficacy/teaching quality)
 * @param {Array<number>} values - Array of numeric values to categorize into rating distribution
 * @param {string} title - Title for tooltips
 * @returns {HTMLElement} Stacked bar container element
 */
export function createRatingStackedBar(values, title = '') {
    if (!values || values.length === 0) {
        const emptySpan = document.createElement('span');
        emptySpan.textContent = '-';
        emptySpan.style.color = getThemeColors().chrome.textDisabled;
        return emptySpan;
    }

    const segments = buildRatingBuckets(values);

    // Process segments with percentages
    const processedSegments = processSegments(
        {},
        {
            segments: segments.map((s) => ({
                field: s.field,
                value: s.percentage,
                color: s.color,
                label: s.label,
                metadata: { count: s.value, total: s.total },
            })),
            normalize: false,
        },
    );

    // Create DOM stacked bar
    return createDOMStackedBar(processedSegments, {
        height: EMBEDDED_BAR_HEIGHT,
        borderRadius: 3,
        showLabels: false,
        showTooltips: true,
        tooltipContentMode: 'html',
        tooltipFormatter: (segment) => {
            const count = segment.metadata?.count ?? 0;
            const total = segment.metadata?.total ?? 0;
            return `${title}: ${segment.label}<br>${count} von ${total} (${segment.percentage?.toFixed(1) || 0}%)`;
        },
    });
}
