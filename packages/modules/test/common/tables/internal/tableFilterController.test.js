/**
 * The table-side behaviour of the filter controller: one row filter while a value is
 * set and none otherwise, and its values survive a column swap unless their column
 * disappeared.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { TableFilterController } from '../../../../src/common/tables/internal/tableFilterController.js';
import { createCompetenceLevelColumn } from '../../../../src/common/tables/columnFactories.js';
import { CompetenceLevelPalette } from '../../../../src/common/context/index.js';
import { required } from '../../../support/required.js';

const competenceLevelColumn = createCompetenceLevelColumn(new CompetenceLevelPalette(), {
    headerFilter: true,
});
/** @type {import('../../../../src/common/tables/columnFactories.js').TableColumnDefinition[]} */
const columnsWithCompetenceLevel = [
    { title: 'Name', field: 'lastName', headerFilter: 'input' },
    competenceLevelColumn,
];
const columnsWithoutCompetenceLevel = [{ title: 'Name', field: 'lastName', headerFilter: 'input' }];

describe('TableFilterController', () => {
    /** @type {TableFilterController} */
    let controller;

    beforeEach(() => {
        controller = new TableFilterController();
        controller.reset(columnsWithCompetenceLevel);
    });

    it('offers one filter over every set value, and none while no value is set', () => {
        expect(controller.filter).toBeNull();
        controller.setValue('lastName', 'b');
        const filterFunction = required(controller.filter);
        controller.setValue('competenceLevelName', ['I']);

        expect(controller.filter).toBe(filterFunction);
        expect(filterFunction({ lastName: 'Bauer', competenceLevelName: 'I' })).toBe(true);
        expect(filterFunction({ lastName: 'Bauer', competenceLevelName: 'II' })).toBe(false);
        expect(filterFunction({ lastName: 'Meyer', competenceLevelName: 'I' })).toBe(false);
    });

    it('drops only the values whose column disappeared on a column swap', () => {
        // MA's pool switch removes the Kompetenzstufe column; the other
        // columns must keep filtering.
        controller.setValue('lastName', 'b');
        controller.setValue('competenceLevelName', ['I']);
        const filterFunction = required(controller.filter);

        expect(controller.setDescriptors(columnsWithoutCompetenceLevel)).toBe(true);

        expect(controller.getValue('lastName')).toBe('b');
        expect(controller.getValue('competenceLevelName')).toBe('');
        expect(filterFunction({ lastName: 'Bauer', competenceLevelName: 'II' })).toBe(true);
        expect(controller.activeCount).toBe(1);
    });

    it('reports no change when the swapped column set keeps every value', () => {
        controller.setValue('lastName', 'b');
        expect(controller.setDescriptors(columnsWithCompetenceLevel)).toBe(false);
    });

    it('offers no filter after a swap that removes the last filterable column', () => {
        // The swap reports the drop so the owner's refilter takes the filter
        // off; no menu is left to clear the value.
        controller.setValue('lastName', 'b');

        expect(controller.setDescriptors([{ title: 'Richtig', field: 'correctCount' }])).toBe(true);
        expect(controller.filter).toBeNull();
    });

    it('reads an unset field as the empty form of its type', () => {
        expect(controller.getValue('competenceLevelName')).toEqual([]);
        expect(controller.getValue('lastName')).toBe('');
        expect(controller.getValue('unknown')).toBe('');
    });

    it('reports no change when a list is set to the same members again', () => {
        // A reported change re-filters and drops the active preset, so writing
        // the selection the field already holds must stay a no-op.
        expect(controller.setValue('competenceLevelName', ['I', 'II'])).toBe(true);

        expect(controller.setValue('competenceLevelName', ['II', 'I'])).toBe(false);
        expect(controller.getValue('competenceLevelName')).toEqual(['I', 'II']);
        expect(controller.setValue('competenceLevelName', ['I'])).toBe(true);
        expect(controller.setValue('competenceLevelName', [])).toBe(true);
        expect(controller.setValue('competenceLevelName', [])).toBe(false);
        expect(controller.activeCount).toBe(0);
    });

    it('reports no change when an unset field is cleared with either empty form', () => {
        // '' and `[]` both clear; clearing an unset list with '' must not
        // re-filter and drop the active preset.
        expect(controller.setValue('competenceLevelName', '')).toBe(false);
        expect(controller.setValue('lastName', [])).toBe(false);
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

        controller.setValue('competenceLevelName', ['I']);
        controller.reset(columnsWithCompetenceLevel);
        expect(controller.activeCount).toBe(0);
    });
});
