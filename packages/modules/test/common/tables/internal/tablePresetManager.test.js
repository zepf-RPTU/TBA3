// @vitest-browser

/**
 * TablePresetManager: the preset button row reflects the preset list.
 *
 * updatePresets() re-renders the row when the preset set changes, and leaves it alone
 * when the labels are unchanged: EN/SL only re-target a preset's sort column, and
 * rebuilt buttons would flicker. A preset the table's mode rules out (the MA
 * Stufengrenze preset on a Leitidee) keeps its button, greyed out.
 */

import { describe, it, expect, vi } from 'vitest';
import { render } from 'lit';
import { effect } from '@preact/signals-core';
import { TablePresetManager } from '../../../../src/common/tables/internal/tablePresetManager.js';
import { required } from '../../../support/required.js';

/** @typedef {import('../../../../src/common/tables/preset.js').Preset} Preset */

/**
 * The stub: the Tabulator members the manager drives, spied.
 * @typedef {import('../../../../src/common/tables/internal/tablePresetManager.js').PresetTable & {setFilter: import('vitest').Mock, setSort: import('vitest').Mock}} StubTable
 */

/**
 * @param {string} label
 * @returns {Preset} A preset sorting by the summed result.
 */
const preset = (label) => ({ label, sort: { column: 'correctCount', dir: 'desc' } });

/** @returns {StubTable} */
function createTableStub() {
    const table = {
        element: document.createElement('div'),
        initialized: true,
        destroyed: false,
        on: vi.fn(),
        getColumn: () => undefined,
        blockRedraw: vi.fn(),
        restoreRedraw: vi.fn(),
        clearSort: vi.fn(),
        setFilter: vi.fn(),
        setSort: vi.fn(),
        getRows: vi.fn(() => []),
        redraw: vi.fn(),
    };
    return table;
}

/**
 * Labels of the rendered preset buttons.
 * @param {HTMLElement} container - The button row.
 * @returns {Array<string|undefined>}
 */
const renderedLabels = (container) =>
    [...container.querySelectorAll('[data-preset-index]')].map((b) => b.textContent?.trim());

/**
 * One button of the row, asserted present.
 * @param {HTMLElement} container - The button row.
 * @param {string} selector
 * @returns {HTMLButtonElement}
 */
const buttonIn = (container, selector) =>
    required(container.querySelector(/** @type {'button'} */ (selector)), selector);

/**
 * @param {Preset[]} presets
 * @returns {{manager: TablePresetManager, table: StubTable, container: HTMLElement}} The bound manager.
 */
function setup(presets) {
    const table = createTableStub();
    const manager = new TablePresetManager(() => table.setFilter(manager.filters));
    const container = document.createElement('div');
    document.body.appendChild(container);
    // The owner's toolbar, rendered again whenever the buttons' state changes.
    effect(() => {
        render(manager.template(), container);
    });
    manager.bind(table, presets);
    return { manager, table, container };
}

describe('TablePresetManager preset button row', () => {
    it('exposes the selected preset via aria-pressed, and holds only the presets', () => {
        const { manager, container } = setup([preset('Stärkste 5'), preset('Schwächste 5')]);

        buttonIn(container, '[data-preset-index="1"]').click();
        expect(buttonIn(container, '[data-preset-index="1"]').getAttribute('aria-pressed')).toBe(
            'true',
        );
        expect(buttonIn(container, '[data-preset-index="0"]').getAttribute('aria-pressed')).toBe(
            'false',
        );
        // Reset is the table's action, not one of the choices.
        expect(container.querySelectorAll('.table-preset-container > button')).toHaveLength(2);

        manager.resetActivePreset();
        expect(buttonIn(container, '[data-preset-index="1"]').getAttribute('aria-pressed')).toBe(
            'false',
        );
    });

    it('keeps an unavailable preset in place, greyed out with its reason, and applies nothing on its click', () => {
        const { table, container } = setup([
            preset('Stärkste 5'),
            { ...preset('Knapp an der Stufengrenze'), unavailableReason: 'Nur für Gesamt' },
        ]);
        const unavailable = buttonIn(container, '[data-preset-index="1"]');

        expect(unavailable.getAttribute('aria-disabled')).toBe('true');
        expect(unavailable.dataset.tooltipText).toBe('Nur für Gesamt');
        expect(buttonIn(container, '[data-preset-index="0"]').hasAttribute('aria-disabled')).toBe(
            false,
        );

        unavailable.click();
        expect(table.setSort).not.toHaveBeenCalled();
        expect(unavailable.getAttribute('aria-pressed')).toBe('false');
    });

    it('drops an active preset that becomes unavailable, and its filters with it', () => {
        /** @type {Preset} */
        const nearBoundary = { ...preset('Knapp'), filters: [() => true] };
        const { manager, table, container } = setup([preset('Stärkste 5'), nearBoundary]);
        buttonIn(container, '[data-preset-index="1"]').click();
        table.setFilter.mockClear();
        table.setSort.mockClear();

        manager.updatePresets([preset('Stärkste 5'), { ...nearBoundary, unavailableReason: 'x' }]);

        expect(table.setFilter).toHaveBeenCalledExactlyOnceWith([]);
        expect(table.setSort).not.toHaveBeenCalled();
        expect(buttonIn(container, '[data-preset-index="1"]').getAttribute('aria-pressed')).toBe(
            'false',
        );
    });

    it('re-renders the buttons when the preset set shrinks (Gesamt 3 → Leitidee 2)', () => {
        const gesamt = [
            preset('Stärkste 5'),
            preset('Schwächste 5'),
            preset('Knapp an der Stufengrenze'),
        ];
        const { manager, container } = setup(gesamt);
        expect(renderedLabels(container)).toHaveLength(3);

        manager.updatePresets([preset('Stärkste 5'), preset('Schwächste 5')]);

        expect(renderedLabels(container)).toEqual(['Stärkste 5', 'Schwächste 5']);
    });

    it('re-renders when the set grows back (Leitidee 2 → Gesamt 3)', () => {
        const { manager, table, container } = setup([preset('Stärkste 5'), preset('Schwächste 5')]);

        manager.updatePresets([
            preset('Stärkste 5'),
            preset('Schwächste 5'),
            preset('Knapp an der Stufengrenze'),
        ]);

        expect(renderedLabels(container)).toHaveLength(3);
        // The regrown buttons are wired.
        buttonIn(container, '[data-preset-index="2"]').click();
        expect(table.setSort).toHaveBeenCalled();
    });

    it('does NOT re-render the buttons when the labels are unchanged', () => {
        const { manager, container } = setup([preset('Stärkste 5'), preset('Schwächste 5')]);
        const before = [...container.querySelectorAll('.table-preset-container > button')];

        manager.updatePresets([
            {
                label: 'Stärkste 5',
                sort: { column: 'd1CorrectCount', dir: 'desc' },
            },
            {
                label: 'Schwächste 5',
                sort: { column: 'd1CorrectCount', dir: 'asc' },
            },
        ]);

        const after = [...container.querySelectorAll('.table-preset-container > button')];
        expect(after).toHaveLength(before.length);
        // Same DOM nodes: nothing was rebuilt.
        after.forEach((node, i) => expect(node).toBe(before[i]));
    });
});
