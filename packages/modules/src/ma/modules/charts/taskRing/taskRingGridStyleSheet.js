/**
 * The per-host `<style>` element that carries one task-ring grid's solved geometry
 * (column/row tracks, ring size, font size, last-row centring). Generated rules rather
 * than inline styles so the grid items stay plain CSS-grid children the shared
 * stylesheet can address.
 */

import { unmarkScrollRegion } from '../../../../common/utils/scrollRegion.js';

/**
 * Per-host class name the generated layout rules are scoped to, so two grids on one page
 * cannot style each other.
 * @param {string} hostId - The host's element id.
 * @returns {string} A class name safe to put in a selector.
 */
function getTaskRingGridLayoutClass(hostId) {
    return `task-ring-grid-layout-${String(hostId).replace(/[^a-zA-Z0-9_-]/g, '-')}`;
}

/**
 * Id of the `<style>` element carrying one host's generated layout rules.
 * @param {string} hostId - The host's element id.
 * @returns {string} An id safe to pass to `getElementById`.
 */
function getTaskRingGridLayoutStyleId(hostId) {
    return `task-ring-grid-layout-style-${String(hostId).replace(/[^a-zA-Z0-9_-]/g, '-')}`;
}

/**
 * Rules that optically centre a partial last row (5 rings in 3 columns, 7 in 4, ...), which
 * would otherwise sit left-aligned in its tracks with a hole on the right.
 *
 * Integer grid tracks cannot express the half-cell offset an odd shortfall needs, so the row is
 * nudged with a transform. That is safe here: hit-testing follows CSS transforms, and the
 * selection outline and the "Gesamt" box-shadow are painted in the transformed coordinate
 * system, so they travel with the cell.
 * @param {string} layoutClass - The per-host class the rules are scoped to.
 * @param {{ estimatedCols: number, estimatedRows: number, ringWidth: number, columnGap: number }} layout - The solved grid geometry.
 * @param {number} chartCount - How many rings are placed, which decides how short the last row is.
 * @returns {string} CSS, empty when the last row is full
 */
export function buildLastRowCenteringRules(layoutClass, layout, chartCount) {
    const { estimatedCols: cols, estimatedRows: rows, ringWidth, columnGap } = layout;
    const deficit = cols - (chartCount - cols * (rows - 1));
    if (deficit <= 0) return '';

    const firstIndex = cols * (rows - 1) + 1;
    const startColumn = Math.floor(deficit / 2) + 1;
    const shiftPx = Math.round(((deficit % 2) * (ringWidth + columnGap)) / 2);

    const shiftRule =
        shiftPx === 0
            ? ''
            : `
        .${layoutClass}.task-ring-grid-body > .task-ring-chart-item:nth-child(n + ${firstIndex}) {
            transform: translateX(${shiftPx}px);
        }
    `;

    return `
        .${layoutClass}.task-ring-grid-body > .task-ring-chart-item:nth-child(${firstIndex}) {
            grid-column-start: ${startColumn};
        }
        ${shiftRule}
    `;
}

/**
 * Create or update this host's generated layout `<style>` element.
 * @param {import('../../../../common/charts/host/chartHostModule.js').ChartHostModule} host - The host the grid belongs to.
 * @param {object} layout - The solved grid geometry the rules are written from.
 * @param {number} chartCount - How many rings are placed.
 * @returns {string} The layout class to put on the grid body.
 */
export function ensureTaskRingGridLayoutStyle(host, layout, chartCount) {
    const styleId = getTaskRingGridLayoutStyleId(host.id);
    const layoutClass = getTaskRingGridLayoutClass(host.id);
    let styleEl = document.getElementById(styleId);

    if (!(styleEl instanceof HTMLStyleElement)) {
        // Deliberately unlayered: these per-instance sizes must beat every
        // authored sheet, and unlayered rules win over all cascade layers.
        styleEl = document.createElement('style');
        styleEl.id = styleId;
        document.head.appendChild(styleEl);
    }

    styleEl.textContent = `
        .${layoutClass}.task-ring-grid-body {
            grid-template-columns: repeat(${layout.estimatedCols}, ${layout.ringWidth}px);
            grid-template-rows: repeat(${layout.estimatedRows}, ${layout.ringHeight}px);
            align-content: ${layout.wrapMode ? 'start' : 'center'};
        }

        .${layoutClass}.task-ring-grid-body > .task-ring-chart-item {
            width: ${layout.ringWidth}px;
            height: ${layout.ringHeight}px;
            font-size: ${layout.fontSize}px;
        }

        ${buildLastRowCenteringRules(layoutClass, layout, chartCount)}
    `;

    return layoutClass;
}

/**
 * Drop a host's generated layout rules; a no-op when there are none.
 * @param {string} hostId - The host's element id.
 */
function removeTaskRingGridLayoutStyle(hostId) {
    const styleEl = document.getElementById(getTaskRingGridLayoutStyleId(hostId));
    if (styleEl) {
        styleEl.remove();
    }
}

/**
 * Undo everything the grid layout put on the DOM, so a host can be re-rendered — or torn
 * down — without leaving its generated rules behind.
 * @param {import('../../../../common/charts/host/chartHostModule.js').ChartHostModule} host - The host the grid belongs to.
 * @param {HTMLElement|null} container - The host's live render body, when it still exists.
 */
export function releaseTaskRingGridLayout(host, container) {
    const grid =
        /** @type {HTMLElement|null} */ (container?.querySelector('.task-ring-grid-body')) ??
        container;
    if (grid) {
        grid.classList.remove('task-ring-grid-body', getTaskRingGridLayoutClass(host.id));
        unmarkScrollRegion(grid);
    }
    container?.classList.remove('task-ring-grid-host');
    removeTaskRingGridLayoutStyle(host.id);
}
