/**
 * ItemRingFocusConfig — ChartHostModule descriptor for the item ring focus card: one
 * item ring (a Leitidee or a competence value) in detail, swapped in place when the
 * `ringId` option names another.
 */

import { soleSelectedStudent, studentSelection } from './selection.js';
import { ItemRingFocusChart } from './itemRingFocus.js';
import { itemCountText } from './itemRingTitleMetrics.js';
import { resolveShownRing, ringItems } from '../../../utils/maItemRings.js';
import { MA_DATASETS } from '../../../maDatasets.js';
import { sameItems, writeState } from '@tba3/module-base';

/** @typedef {import('./itemRingFocus.js').ItemRingFocusState} ItemRingFocusHostState */

/**
 * @typedef {import('../../../../common/charts/host/chartHostModule.js').ChartHostOptions & {
 *     ringGrouping: import('@preact/signals-core').ReadonlySignal<string>,
 *     ringId?: import('@preact/signals-core').ReadonlySignal<string|null>,
 *     student?: import('@preact/signals-core').ReadonlySignal<string|null>,
 *     onStudentSelected?: (studentId: string) => void,
 * }} ItemRingFocusOptions
 */

/** @typedef {import('../../../../common/charts/host/chartHostModule.js').ChartHostModule<ItemRingFocusChart, ItemRingFocusOptions, null, ItemRingFocusHostState>} ItemRingFocusChartHost */

/**
 * Resolve the ring the options name and write what the card now shows into the host's
 * state, title and subtitle. The ring is the dataset's own object, so the same one
 * changes nothing and keeps its items; a selection holding the same members keeps the
 * array the state already has.
 * @param {ItemRingFocusChartHost} host
 */
function present(host) {
    const { ringGrouping, ringId, student } = host.options;
    const documents = host.options.context.documents;
    // An unknown or empty ring falls back as the grid's selection does, to the first
    // populated one. Without a populated ring the first one still names the card;
    // without any, the chart says so itself.
    const shown = resolveShownRing(
        documents.getDataset(MA_DATASETS.ITEM_RINGS),
        ringGrouping.peek(),
        ringId?.peek(),
    );
    const ring = shown.ring ?? shown.grouping.rings[0] ?? null;
    let items = host.state.items.peek();
    // The student group the viewer picked is per ring: another starts from the default.
    let studentGroup = host.state.studentGroup.peek();
    if (ring !== host.state.ring.peek()) {
        items = ring ? ringItems(documents.getDataset(MA_DATASETS.ITEM_RECORDS), ring) : [];
        studentGroup = null;
    }
    const current = host.state.selectedStudents.peek();
    const selectedStudents = studentSelection(student?.peek() ?? null);
    writeState(host.state, {
        ring,
        items,
        selectedStudents: sameItems(current, selectedStudents) ? current : selectedStudents,
        studentGroup,
    });
    host.setTitle(ring?.title ?? '');
    // Under the ring's name, as in the grid: the rate reads with caution over few items.
    host.setSubtitle(ring ? itemCountText(items.length) : null);
}

// ============================================================================
// CONFIG DESCRIPTOR
// ============================================================================

/** @type {import('../../../../common/charts/host/chartHostModule.js').ChartHostConfig<ItemRingFocusChart, ItemRingFocusOptions, null, import('../../../../common/charts/host/chartHostModule.js').NoVerbs, ItemRingFocusHostState>} */
export const itemRingFocusConfig = {
    glossaryPath: 'ma.item.item-ring-focus',

    documents: [MA_DATASETS.ITEM_RINGS, MA_DATASETS.ITEM_RECORDS, MA_DATASETS.STUDENT_RECORDS],

    defaultOptions: {
        showModuleTitle: true,
    },

    /** @returns {ItemRingFocusHostState} Nothing shown until the first render. */
    initialState: () => ({
        ring: null,
        items: [],
        selectedStudents: null,
        studentGroup: null,
    }),

    /**
     * One host serves every ring in turn, so the ring — and the student, where one is
     * focused — is what tells two captures apart.
     * @param {ItemRingFocusChartHost} host
     * @returns {Array<string|null>} The ring's id and the one selected student; either may be `null`.
     */
    getExportIdentity(host) {
        return [
            host.state.ring.value?.id ?? null,
            soleSelectedStudent(host.state.selectedStudents.value),
        ];
    },

    /**
     * Follow the `ringGrouping`, `ringId` and `student` options once the card has
     * drawn: the first render reads them as they are then.
     * @param {ItemRingFocusChartHost} host
     */
    createController(host) {
        const { ringGrouping, ringId, student } = host.options;
        host.onChange(
            () => [ringGrouping.value, ringId?.value, student?.value],
            () => {
                if (host.chart) present(host);
            },
        );
    },

    /**
     * @param {ItemRingFocusChartHost} host
     * @returns {ItemRingFocusChart}
     */
    createRenderer(host) {
        const documents = host.options.context.documents;
        present(host);
        // The content body, not the outer container, which also holds the header.
        return new ItemRingFocusChart(host.chartArea, {
            ...host.rendererOptions,
            items: host.state.items,
            students: documents.getDataset(MA_DATASETS.STUDENT_RECORDS),
            ring: host.state.ring,
            selectedStudents: host.state.selectedStudents,
            studentGroup: host.state.studentGroup,
            onStudentSelected: host.options.onStudentSelected,
        });
    },
};
