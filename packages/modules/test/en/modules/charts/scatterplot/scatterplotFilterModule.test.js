// @vitest-browser

import { afterEach, describe, it, expect, vi } from 'vitest';
import { ScatterplotFilterModule } from '../../../../../src/en/modules/charts/scatterplot/scatterplotFilterModule.js';
import { signal } from '@preact/signals-core';
import { studentFields } from '../../../../support/competenceLevelGroups.js';
import { createSubjectContext } from '../../../../support/subjectContext.js';
import { queryHtml } from '../../../../support/dom.js';

/**
 * One students-aggregations.json value group of subject `en`.
 * @param {string} id
 * @param {string} domainId
 * @param {number|null} correctShare - The `Richtig` share, or `null` for a value group without one.
 * @returns {import('../../../../../src/common/data/schemas/aggregations.js').StudentAggregationsValueGroup}
 */
function aggregationValueGroup(id, domainId, correctShare) {
    return {
        id,
        type: 'student',
        name: id,
        subject: { name: 'Englisch' },
        domain: { id: domainId, name: domainId },
        ...studentFields('Lerngruppe', id),
        aggregations:
            correctShare === null
                ? []
                : [
                      {
                          type: 'result',
                          value: 'Richtig',
                          descriptiveStatistics: { mean: correctShare, frequency: 1 },
                      },
                  ],
    };
}

/**
 * The modal over one EN group with two plotted students, opened on `selected`.
 * @param {Iterable<string>} selected
 * @param {Partial<import('../../../../../src/en/modules/charts/scatterplot/scatterplotFilterModule.js').ScatterplotFilterOptions>} [options]
 */
async function openModal(selected, options = {}) {
    const modal = ScatterplotFilterModule.create('filter', {
        context: await createSubjectContext('en', {
            documents: {
                'students-aggregations.json': [
                    aggregationValueGroup('s1', 'ho', 0.5),
                    aggregationValueGroup('s1', 'le', 0.5),
                    aggregationValueGroup('s2', 'ho', 0.8),
                    aggregationValueGroup('s2', 'le', 0.2),
                ],
            },
        }),
        ...options,
    });
    await modal.open(selected);
    return modal;
}

/**
 * @param {HTMLElement} modal
 * @returns {string} The live count's text.
 */
const countText = (modal) => queryHtml(modal, '.scatterplot-selection-count').textContent.trim();

/**
 * @param {HTMLElement} modal
 * @param {string} action - A sidebar button's `data-scatterplot-filter-action`.
 */
const press = (modal, action) =>
    queryHtml(modal, `[data-scatterplot-filter-action="${action}"]`).click();

describe('ScatterplotFilterModule', () => {
    /** @type {ScatterplotFilterModule|null} */
    let modal = null;
    afterEach(() => {
        modal?.remove();
        modal = null;
    });

    it("hands its chart the page's comparison selection, read-only", async () => {
        // The descriptor reads `comparisonState` from its host's options. Passed as
        // render data it never arrives, and the dialog draws every comparison group
        // whatever the page shows.
        modal = await openModal([], {
            // A writable state, as the page's is.
            comparisonState:
                /** @type {import('../../../../../src/common/charts/comparisonState.js').ComparisonStateReader} */ ({
                    activeModes: signal(['state']),
                    isActive: (/** @type {string} */ id) => id === 'state',
                    setActive: () => {},
                }),
        });

        const chart =
            /** @type {import('../../../../../src/en/modules/charts/scatterplot/scatterplotConfig.js').ScatterplotHost} */ (
                queryHtml(modal, '.scatterplot-filter-chart')
            );
        const state = chart.options.comparisonState;
        expect(state?.activeModes.value).toEqual(['state']);
        expect(state?.isActive('school')).toBe(false);
        // Read-only: without `setActive` the chart builds no ⌀ menu of its own.
        expect(/** @type {{setActive?: unknown}} */ (state)?.setActive).toBeUndefined();
    });

    it('counts the selection it opened on and every change the chart or the sidebar makes', async () => {
        modal = await openModal(['s1']);
        expect(countText(modal)).toContain('1');

        press(modal, 'select-all');
        await modal.updateComplete;
        expect(countText(modal)).toContain('2');

        press(modal, 'clear-selection');
        await modal.updateComplete;
        expect(modal.querySelector('.scatterplot-selection-count.has-selection')).toBeNull();
    });

    it('keeps its selection when opened again while open', async () => {
        const onConfirm = vi.fn();
        modal = await openModal(['s1'], { onConfirm });

        await modal.open(['s2']);
        press(modal, 'confirm');

        expect(onConfirm).toHaveBeenCalledExactlyOnceWith(new Set(['s1']));
    });

    it('keeps the touch marquee armed for the chart of the next open', async () => {
        modal = await openModal([]);
        press(modal, 'arm-selection');
        press(modal, 'cancel');

        await modal.open([]);

        expect(
            queryHtml(modal, '[data-scatterplot-filter-action="arm-selection"]').getAttribute(
                'aria-pressed',
            ),
        ).toBe('true');
        const chart =
            /** @type {import('../../../../../src/en/modules/charts/scatterplot/scatterplotConfig.js').ScatterplotHost} */ (
                queryHtml(modal, '.scatterplot-filter-chart')
            );
        expect(chart.state.touchSelectionArmed.value).toBe(true);
    });
});
