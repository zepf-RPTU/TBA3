/**
 * `@tba3/modules/charts/task-ring-grid` — the Aufgabenring-Raster descriptor with the
 * layout helpers a host needs around it.
 *
 * `getTaskRingChartDefinitions` derives one ring per Domäne from the item rows,
 * `resolveDefaultDomain` picks the initially selected one, and the two host utilities
 * decide whether a domain switch can reuse the mounted host or has to remount it.
 */

export { taskRingGridConfig } from './taskRingGridConfig.js';
export { getTaskRingChartDefinitions, resolveDefaultDomain } from './taskRingGridLayout.js';
export { remountChartHost, updateTaskRingHostIfReusable } from './taskRingHostUtils.js';
