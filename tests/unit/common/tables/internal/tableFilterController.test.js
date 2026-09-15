/**
 * Locks the table-side behaviour of the filter facade: one Tabulator filter is
 * attached (never duplicated), its values survive a column swap unless their
 * column disappeared, and it is the filter the preset manager re-applies after
 * clearing. Those three rules are what let the filter menu replace Tabulator's
 * header filters without changing what the user sees after a pool switch,
 * a preset switch, or a reset.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { TableFilterController } from '@tba3/modules/common/tables/internal/tableFilterController.js';
import { createKsColumn } from '@tba3/modules/common/tables/columnFactories.js';

/** Minimal stand-in for the bits of Tabulator's filter API the controller uses. */
class FakeTable {
    filters = [];
    refreshCount = 0;

    addFilter(filterFunction) {
        this.filters.push(filterFunction);
    }

    getFilters() {
        return this.filters.map((filterFunction) => ({ field: filterFunction }));
    }

    refreshFilter() {
        this.refreshCount++;
    }

    /** What TablePresetManager does on a preset switch. */
    clearFilter() {
        this.filters = [];
    }
}

const ksColumn = createKsColumn({
    headerFilter: true,
    headerFilterParams: { values: { '': 'Alle', I: 'I', II: 'II' } },
});
const columnsWithKs = [{ title: 'Name', field: 'lastName', headerFilter: 'input' }, ksColumn];
const columnsWithoutKs = [{ title: 'Name', field: 'lastName', headerFilter: 'input' }];

describe('TableFilterController', () => {
    /** @type {FakeTable} */
    let table;
    /** @type {TableFilterController} */
    let controller;

    beforeEach(() => {
        table = new FakeTable();
        controller = new TableFilterController({ getTable: () => table });
        controller.reset(columnsWithKs);
    });

    it('attaches a single filter and refreshes on later changes', () => {
        controller.setValue('lastName', 'b');
        controller.apply();
        controller.setValue('ks', 'I');
        controller.apply();

        expect(table.filters).toHaveLength(1);
        expect(table.refreshCount).toBe(1);

        const [filterFunction] = table.filters;
        expect(filterFunction({ lastName: 'Bauer', ks: 'I' })).toBe(true);
        expect(filterFunction({ lastName: 'Bauer', ks: 'II' })).toBe(false);
        expect(filterFunction({ lastName: 'Meyer', ks: 'I' })).toBe(false);
    });

    it('drops only the values whose column disappeared on a column swap', () => {
        // WHY: MA's pool switch removes the Kompetenzstufe column. Name/Vorname/
        // Geschlecht/Merkmale must keep filtering exactly as before the switch.
        controller.setValue('lastName', 'b');
        controller.setValue('ks', 'I');
        controller.apply();
        const [filterFunction] = table.filters;

        expect(controller.setDescriptors(columnsWithoutKs)).toBe(true);

        expect(controller.getValue('lastName')).toBe('b');
        expect(controller.getValue('ks')).toBe('');
        expect(filterFunction({ lastName: 'Bauer', ks: 'II' })).toBe(true);
        expect(controller.activeCount).toBe(1);
    });

    it('reports no change when the swapped column set keeps every value', () => {
        controller.setValue('lastName', 'b');
        expect(controller.setDescriptors(columnsWithKs)).toBe(false);
    });

    it('re-attaches through the persistent filters a preset switch replays', () => {
        controller.setValue('lastName', 'b');
        controller.apply();

        table.clearFilter();
        controller.persistentFilters.forEach((filterFunction) => table.addFilter(filterFunction));

        expect(table.filters).toHaveLength(1);
        expect(table.filters[0]({ lastName: 'Bauer' })).toBe(true);
        // apply() must recognise the re-attached filter instead of adding a second one.
        controller.apply();
        expect(table.filters).toHaveLength(1);
    });

    it('re-filters after a swap that removes the last filterable column', () => {
        // WHY: the dropped value stops matching, but Tabulator only re-evaluates
        // an attached filter when it is told to — without the refresh the rows
        // the value hid stay hidden, with no filter menu left to clear them.
        controller.setValue('lastName', 'b');
        controller.apply();
        const refreshesBefore = table.refreshCount;

        expect(controller.setDescriptors([{ title: 'Richtig', field: 'summedResult' }])).toBe(true);
        controller.apply();

        expect(table.refreshCount).toBe(refreshesBefore + 1);
        expect(table.filters[0]({ lastName: 'Meyer' })).toBe(true);
    });

    it('offers no persistent filter for a table without filterable columns', () => {
        controller.reset([{ title: 'Richtig', field: 'summedResult' }]);

        expect(controller.persistentFilters).toEqual([]);
        controller.apply();
        expect(table.filters).toHaveLength(0);
    });

    it('ignores values for fields no column declares', () => {
        expect(controller.setValue('unknown', 'x')).toBe(false);
        expect(controller.activeCount).toBe(0);
    });

    it('clears every value on reset and on a fresh build', () => {
        controller.setValue('lastName', 'b');
        expect(controller.clearValues()).toBe(true);
        expect(controller.activeCount).toBe(0);
        expect(controller.clearValues()).toBe(false);

        controller.setValue('ks', 'I');
        controller.reset(columnsWithKs);
        expect(controller.activeCount).toBe(0);
    });
});
