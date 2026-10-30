// @vitest-browser
/**
 * The keyboard path to a selectable table's rows, against the real Tabulator: which rows
 * are active, how a click selects and when the row elements are rebuilt are Tabulator's,
 * and no fake models them.
 */

import { afterEach, describe, expect, it } from 'vitest';
import { userEvent } from 'vitest/browser';

import {
    applyBodyAria,
    applyRowSelectableAria,
    applyRowSelectionAria,
    installRowKeyboard,
} from '../../../../src/common/tables/internal/tabulatorAria.js';
import { buildRealTabulator, destroyRealTabulators } from '../../../support/realTabulator.js';

const ROWS = [
    { id: 1, name: 'Ada' },
    { id: 2, name: 'Ben' },
    { id: 3, name: 'Cem' },
];

/**
 * A built selectable table with the row keyboard installed, its body focused.
 * @param {import('tabulator-tables').Options} [options] - Over the defaults.
 * @returns {Promise<import('tabulator-tables').Tabulator>}
 */
async function buildSelectableTable(options = {}) {
    const built = await buildRealTabulator(
        {
            data: ROWS,
            columns: [{ title: 'Name', field: 'name' }],
            height: 'auto',
            selectableRows: true,
            ...options,
        },
        400,
    );
    applyBodyAria(built.element);
    installRowKeyboard(built, { activates: true });
    built.on('rowSelectionChanged', (_data, _rows, selected, deselected) =>
        applyRowSelectionAria(selected, deselected),
    );
    /** @type {HTMLElement} */ (built.element.querySelector('.tabulator-table')).focus();
    return built;
}

/** @returns {string|undefined} The name in the focused row. */
const focusedName = () => document.activeElement?.closest('.tabulator-row')?.textContent?.trim();

afterEach(destroyRealTabulators);

describe('row keyboard', () => {
    it('moves focus row by row with the arrow keys, from the body to the first row', async () => {
        await buildSelectableTable();

        await userEvent.keyboard('{ArrowDown}');
        expect(focusedName()).toBe('Ada');
        await userEvent.keyboard('{ArrowDown}{ArrowDown}{ArrowDown}');
        expect(focusedName()).toBe('Cem');
        await userEvent.keyboard('{ArrowUp}');
        expect(focusedName()).toBe('Ben');
    });

    it('selects a row on Space and marks it aria-selected, as a click does', async () => {
        const built = await buildSelectableTable();
        await userEvent.keyboard('{ArrowDown}');

        await userEvent.keyboard(' ');
        const row = built.getRows()[0];
        expect(row.isSelected()).toBe(true);
        expect(row.getElement().getAttribute('aria-selected')).toBe('true');

        await userEvent.keyboard(' ');
        expect(row.isSelected()).toBe(false);
        expect(row.getElement().getAttribute('aria-selected')).toBe('false');
    });

    it('runs rowClick on Enter', async () => {
        // The EN student table opens Aufgabendetails from rowClick.
        const built = await buildSelectableTable({ selectableRows: 1 });
        /** @type {string[]} */
        const clicked = [];
        built.on('rowClick', (_event, row) => clicked.push(row.getData().name));
        await userEvent.keyboard('{ArrowDown}{ArrowDown}');

        await userEvent.keyboard('{Enter}');

        expect(clicked).toEqual(['Ben']);
    });

    it('keeps aria-selected through a redraw', async () => {
        const built = await buildSelectableTable();
        built.getRows()[1].select();

        built.redraw(true);

        expect(built.getRows()[1].getElement().getAttribute('aria-selected')).toBe('true');
    });

    it('leaves a key from a control inside a cell to that control', async () => {
        const built = await buildSelectableTable({
            columns: [
                {
                    title: 'Name',
                    field: 'name',
                    formatter: (cell) => `<button type="button">${cell.getValue()}</button>`,
                },
            ],
        });
        const button = /** @type {HTMLButtonElement} */ (
            built.getRows()[0].getElement().querySelector('button')
        );
        let buttonClicks = 0;
        button.addEventListener('click', () => buttonClicks++);
        button.focus();

        await userEvent.keyboard(' ');

        expect(buttonClicks).toBe(1);
        expect(built.getSelectedRows()).toHaveLength(1);

        // An arrow from that control still walks the rows.
        await userEvent.keyboard('{ArrowDown}');
        expect(focusedName()).toBe('Ben');
    });

    it('says every row is selectable before the first change', async () => {
        const built = await buildSelectableTable();
        applyRowSelectableAria(built);

        expect(
            built.getRows().map((row) => row.getElement().getAttribute('aria-selected')),
        ).toEqual(['false', 'false', 'false']);
    });
});

describe('row keyboard into a row', () => {
    /**
     * A table of rows that are no controls, each with a link and a glossary term out of
     * the tab order, its body focused.
     * @returns {Promise<import('tabulator-tables').Tabulator>}
     */
    async function buildPlainTable() {
        const built = await buildRealTabulator(
            {
                data: ROWS,
                columns: [
                    {
                        title: 'Name',
                        field: 'name',
                        formatter: (cell) =>
                            `<button type="button" tabindex="-1">${cell.getValue()}</button> <span class="glossary-term" data-glossary-key="ger">A1</span>`,
                    },
                ],
                height: 'auto',
            },
            400,
        );
        applyBodyAria(built.element);
        installRowKeyboard(built, { activates: false });
        /** @type {HTMLElement} */ (built.element.querySelector('.tabulator-table')).focus();
        return built;
    }

    it('reaches the controls of a row from the row and comes back, one tab stop for all', async () => {
        const built = await buildPlainTable();
        const first = built.getRows()[0].getElement();
        await userEvent.keyboard('{ArrowDown}');
        expect(document.activeElement).toBe(first);

        // Enter moves in, where a selectable table's Enter would select.
        await userEvent.keyboard('{Enter}');
        expect(document.activeElement?.tagName).toBe('BUTTON');

        await userEvent.keyboard('{ArrowRight}');
        const term = /** @type {HTMLElement} */ (document.activeElement);
        expect(term.matches('.glossary-term')).toBe(true);
        // A cell term is the button its popup opens from, still no tab stop.
        expect(term.getAttribute('role')).toBe('button');
        expect(term.tabIndex).toBe(-1);

        await userEvent.keyboard('{ArrowLeft}');
        expect(document.activeElement?.tagName).toBe('BUTTON');
        await userEvent.keyboard('{Escape}');
        expect(document.activeElement).toBe(first);
        expect(built.getSelectedRows()).toHaveLength(0);
    });
});
