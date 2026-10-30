/**
 * A chart container's content box: its measured box less padding, border and, in a scroll
 * container, the scrollbars, which take their thickness out of the box the SVG fills.
 * @param {HTMLElement} container
 * @param {number} defaultWidthPx - Used when the container measures no width.
 * @param {number} defaultHeightPx - Used when the container measures no height.
 * @returns {{ width: number, height: number }}
 */
export function getResponsiveChartDimensions(container, defaultWidthPx, defaultHeightPx) {
    const containerRect = container.getBoundingClientRect();
    const fullWidth = containerRect.width || container.clientWidth || defaultWidthPx;
    const fullHeight = containerRect.height || container.clientHeight || defaultHeightPx;

    const computedStyle = getComputedStyle(container);
    const paddingLeft = parseFloat(computedStyle.paddingLeft) || 0;
    const paddingRight = parseFloat(computedStyle.paddingRight) || 0;
    const paddingTop = parseFloat(computedStyle.paddingTop) || 0;
    const paddingBottom = parseFloat(computedStyle.paddingBottom) || 0;

    const borderLeft = parseFloat(computedStyle.borderLeftWidth) || 0;
    const borderRight = parseFloat(computedStyle.borderRightWidth) || 0;
    const borderTop = parseFloat(computedStyle.borderTopWidth) || 0;
    const borderBottom = parseFloat(computedStyle.borderBottomWidth) || 0;

    // The horizontal scrollbar of a chart wider than its card (`fitContentWidth`) would
    // otherwise cut its thickness off the plot's bottom edge. Read only on a scroll
    // container: elsewhere the two rounded sizes may differ by a pixel with no scrollbar.
    const scrolls = [computedStyle.overflowX, computedStyle.overflowY].some(
        (overflow) => overflow === 'auto' || overflow === 'scroll',
    );
    const scrollbarWidth = scrolls
        ? Math.max(0, container.offsetWidth - container.clientWidth - borderLeft - borderRight)
        : 0;
    const scrollbarHeight = scrolls
        ? Math.max(0, container.offsetHeight - container.clientHeight - borderTop - borderBottom)
        : 0;

    const width = Math.max(
        0,
        fullWidth - paddingLeft - paddingRight - borderLeft - borderRight - scrollbarWidth,
    );
    const height = Math.max(
        0,
        fullHeight - paddingTop - paddingBottom - borderTop - borderBottom - scrollbarHeight,
    );

    return { width, height };
}
