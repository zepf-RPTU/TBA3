/**
 * Chart dimension helpers.
 *
 * These functions are intentionally DOM-measurement only. ChartRenderer owns
 * render lifecycle and warning policy around the resulting dimensions.
 */

import { DEFAULT_DIMENSIONS } from '../../chartDefaults.js';

/**
 * Gets responsive container dimensions for charts.
 * @param {string} containerId - ID of the container element
 * @param {number} defaultWidth - Default width if container has no dimensions
 * @param {number} defaultHeight - Default height if container has no dimensions
 * @returns {{ width: number, height: number }} Content-box dimensions for SVG creation
 */
export function getResponsiveChartDimensions(
    containerId,
    defaultWidth = DEFAULT_DIMENSIONS.width,
    defaultHeight = DEFAULT_DIMENSIONS.height,
) {
    const container = document.getElementById(containerId);
    if (!container) {
        console.error(`[ChartRenderer] Container with id '${containerId}' not found`);
        return { width: defaultWidth, height: defaultHeight };
    }

    const containerRect = container.getBoundingClientRect();
    const fullWidth = containerRect.width || container.clientWidth || defaultWidth;
    const fullHeight = containerRect.height || container.clientHeight || defaultHeight;

    const computedStyle = getComputedStyle(container);
    const paddingLeft = parseFloat(computedStyle.paddingLeft) || 0;
    const paddingRight = parseFloat(computedStyle.paddingRight) || 0;
    const paddingTop = parseFloat(computedStyle.paddingTop) || 0;
    const paddingBottom = parseFloat(computedStyle.paddingBottom) || 0;

    const borderLeft = parseFloat(computedStyle.borderLeftWidth) || 0;
    const borderRight = parseFloat(computedStyle.borderRightWidth) || 0;
    const borderTop = parseFloat(computedStyle.borderTopWidth) || 0;
    const borderBottom = parseFloat(computedStyle.borderBottomWidth) || 0;

    const width = Math.max(0, fullWidth - paddingLeft - paddingRight - borderLeft - borderRight);
    const height = Math.max(0, fullHeight - paddingTop - paddingBottom - borderTop - borderBottom);

    return { width, height };
}
