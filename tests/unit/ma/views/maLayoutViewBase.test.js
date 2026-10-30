// @vitest-browser

import { describe, it, expect, vi, afterEach } from 'vitest';
import { signal } from '@preact/signals-core';
import { MaLayoutViewBase } from '../../../../src/ma/views/maLayoutViewBase.js';
import { createTestAppOptions } from '../../support/glossaryFixture.js';
import { viewOptions } from '../../support/viewOptions.js';

/** @type {Map<string, {[option: string]: unknown}>} Each ring host's options, by id. */
const hostOptions = new Map();

// The ring hosts, as plain elements that fill at once and record what they were handed:
// only the split panel's own module fails here.
vi.mock('@tba3/modules/charts', async (importOriginal) => ({
    ...(await importOriginal()),
    ChartHostModule: class FakeRingHost extends HTMLElement {
        /**
         * @param {string} id
         * @param {unknown} _config
         * @param {{[option: string]: unknown}} options
         * @returns {FakeRingHost}
         */
        static createChart(id, _config, options) {
            if (!customElements.get('fake-ring-host'))
                customElements.define('fake-ring-host', this);
            hostOptions.set(id, options);
            return new this();
        }

        get contentComplete() {
            return Promise.resolve();
        }
    },
}));

/** A left-column module whose first content fails. */
class FailingModule extends HTMLElement {
    get contentComplete() {
        return Promise.reject(new Error('split fill failed'));
    }
}
customElements.define('test-failing-module', FailingModule);

/** The student the view's rings mark. */
const student = signal(/** @type {string|null} */ ('s1'));

/** A layout view whose split panel fails its first fill. */
class FailingSplitView extends MaLayoutViewBase {
    /**
     * @override
     * @returns {import('../../../../src/ma/views/maLayoutViewBase.js').SplitViewSpec}
     * @protected
     */
    _splitView() {
        const failing = /** @type {import('@tba3/module-base').BaseModule<any>} */ (
            /** @type {unknown} */ (new FailingModule())
        );
        return { prefix: 'failing', left: [failing], student };
    }
}
customElements.define('tba-failing-split-view', FailingSplitView);

/**
 * Place the view in chart-only mode, its chart-only panel filled.
 * @returns {Promise<{view: FailingSplitView, appState: ReturnType<typeof viewOptions>['appState']}>}
 */
async function placeView() {
    // One grouping without rings.
    const documents = /** @type {import('@tba3/modules/documents').DocumentStore} */ (
        /** @type {unknown} */ ({
            getDataset: () => ({ groupings: [{ id: 'leitidee', rings: [] }] }),
        })
    );
    const state = viewOptions({
        layoutMode: 'chart-only',
        itemRingGrouping: 'leitidee',
        chartOnlyRingId: null,
    });
    const view = FailingSplitView.create(
        'failing-split',
        /** @type {FailingSplitView['options']} */ ({
            context: { ...createTestAppOptions('ma').context, documents },
            ...state,
        }),
    );
    document.body.append(view);
    await view.contentComplete;
    return { view, appState: state.appState };
}

describe('MaLayoutViewBase', () => {
    /** @type {FailingSplitView|null} */
    let view = null;

    afterEach(() => {
        view?.remove();
        view = null;
        hostOptions.clear();
    });

    it('hands all three ring hosts the student and the chart-only ones the shared ring', async () => {
        // The hosts follow these signals themselves; the view forwards nothing later.
        let appState;
        ({ view, appState } = await placeView());

        const grid = hostOptions.get('ma-failing-itemRing');
        const chartOnlyGrid = hostOptions.get('ma-failing-itemRing-chartOnly');
        const focus = hostOptions.get('ma-failing-focus');
        expect([grid?.student, chartOnlyGrid?.student, focus?.student]).toEqual([
            student,
            student,
            student,
        ]);
        expect([grid?.ringId, chartOnlyGrid?.ringId, focus?.ringId]).toEqual([
            undefined,
            appState.chartOnlyRingId,
            appState.chartOnlyRingId,
        ]);
        expect([grid?.ringGrouping, focus?.ringGrouping]).toEqual([
            appState.itemRingGrouping,
            appState.itemRingGrouping,
        ]);
    });

    it('reports a panel that fails to fill on a switch instead of leaving it unhandled', async () => {
        const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
        let appState;
        ({ view, appState } = await placeView());

        appState.layoutMode.value = 'both';

        // Unreported, the rejection reaches the runner as an unhandled one.
        await vi.waitFor(() =>
            expect(errors).toHaveBeenCalledWith(
                'FailingSplitView: Error filling the both panel:',
                expect.objectContaining({ message: 'split fill failed' }),
            ),
        );
    });
});
