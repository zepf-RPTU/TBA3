/**
 * A real item-ring grid host over a hand-made booklet, for the grid's suites.
 */

import { signal } from '@preact/signals-core';
import { itemRingGridConfig } from '../../src/ma/modules/charts/itemRing/itemRingGridConfig.js';
import { MA_DATASETS } from '../../src/ma/index.js';
import { getItemRingSets } from '../../src/ma/utils/maItemRings.js';
import { mountChart } from './chartHarness.js';
import { createSubjectContext } from './subjectContext.js';

/**
 * Mount the grid over these items, students and rings, its first render drawn.
 * @param {object} booklet
 * @param {Array<{iqbId: string, domain: string}>} booklet.items - The item records.
 * @param {Array<{studentId: string}>} booklet.students - The student records.
 * @param {Array<{domain: string, domainLabel: string}>} booklet.domains - The Leitideen.
 * @param {import('../../src/ma/utils/maCompetenceGroupings.js').MaCompetenceGrouping[]} [booklet.groupings]
 * @param {Partial<import('../../src/ma/modules/charts/itemRing/itemRingGridConfig.js').ItemRingGridOptions>} [options] - The grid's own options; the grouping is the Leitidee by default.
 * @param {{widthPx?: number, heightPx?: number}} [frame]
 * @returns {Promise<import('../../src/ma/modules/charts/itemRing/itemRingGridConfig.js').ItemRingGridHost>}
 */
export async function mountRingGrid(
    { items, students, domains, groupings = [] },
    options = {},
    { widthPx = 900, heightPx = 500 } = {},
) {
    const context = await createSubjectContext('ma', {
        datasets: [
            [MA_DATASETS.ITEM_RECORDS, items],
            [MA_DATASETS.STUDENT_RECORDS, students],
            [MA_DATASETS.ITEM_RINGS, getItemRingSets(domains, groupings, items)],
        ],
    });
    return /** @type {any} */ (
        await mountChart(
            itemRingGridConfig,
            { context, ringGrouping: signal('leitidee'), ...options },
            { id: 'ring-grid', widthPx, heightPx },
        )
    );
}
