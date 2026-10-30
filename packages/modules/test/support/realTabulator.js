/**
 * The real Tabulator, for suites whose subject is Tabulator's own behaviour (its display
 * list, its selection, when it rebuilds rows), which no fake models. A suite calls
 * `destroyRealTabulators()` after each test.
 */

import { Tabulator } from '../../src/common/tables/tabulatorBuild.js';

/** @type {Tabulator[]} */
const built = [];

/**
 * Build a table in a fresh element on the page and wait for `tableBuilt`.
 * @param {import('tabulator-tables').Options} options
 * @param {number} widthPx - The element's width.
 * @returns {Promise<Tabulator>}
 */
export async function buildRealTabulator(options, widthPx) {
    const element = document.createElement('div');
    element.style.width = `${widthPx}px`;
    document.body.append(element);
    const table = new Tabulator(element, options);
    built.push(table);
    await new Promise((resolve) => table.on('tableBuilt', () => resolve(undefined)));
    return table;
}

/** Destroy every table `buildRealTabulator` built and take its element off the page. */
export function destroyRealTabulators() {
    for (const table of built.splice(0)) {
        const { element } = table;
        table.destroy();
        element.remove();
    }
}
