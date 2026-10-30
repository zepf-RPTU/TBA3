import { describe, it, expect } from 'vitest';
import { createTraitColumns } from '../../../../src/sl/modules/tables/slColumnBuilders.js';
import { createModuleContext } from '../../../../src/common/context/index.js';
import { required } from '../../../support/required.js';
import { columnFunction, createFakeCell } from '../../../support/tabulatorFakes.js';

describe('createTraitColumns', () => {
    it("gives an unfamiliar code's header the app tooltip and leaves a known code to the glossary", () => {
        // The header of an unknown code is a bare abbreviation; its payload label is
        // the only explanation, and it goes through the app's tooltip service. A known
        // code keeps the default glossary titleFormatter, so it must get no formatter here.
        const context = createModuleContext({
            glossaryData: {
                sl: {
                    shared: {
                        element_texts: {
                            f: { title: 'Förderbedarf', aliases: [{ text: 'F', exact: true }] },
                        },
                    },
                },
            },
            namespace: 'sl',
        });
        const labels = new Map([
            ['f', 'Förderbedarf'],
            ['neu', 'Neues <Merkmal>'],
        ]);

        const [known, unknown] = required(
            createTraitColumns(context.glossary, labels, ['f', 'neu'], () => '')[0].columns,
        );

        expect('titleFormatter' in known).toBe(false);
        expect(columnFunction(unknown, 'titleFormatter')(createFakeCell('NEU'))).toBe(
            '<span data-tooltip-text="Neues &lt;Merkmal&gt;">NEU</span>',
        );
    });

    it('sizes a sub-column by the whole text its cells show, which its formatter prints', () => {
        // A fixed 64 px ran "39 (49,4 %)" into the next column's count; the cells do not
        // wrap, so the text is one word to the floor and to the cell alike.
        const context = createModuleContext({ glossaryData: { sl: {} }, namespace: 'sl' });
        const rows = [{ trait_f: 39 }, { trait_f: 4 }];
        const label = (/** @type {any} */ row, /** @type {string} */ field) =>
            `${row[field]} (x %)`;

        const [column] = required(
            createTraitColumns(context.glossary, new Map(), ['f'], label)[0].columns,
        );

        expect('minWidth' in column).toBe(false);
        expect(required(column.tableMeta?.cellWords)(rows)).toEqual([
            '39\u00a0(x\u00a0%)',
            '4\u00a0(x\u00a0%)',
        ]);
        expect(columnFunction(column, 'formatter')(createFakeCell(39, rows[0]))).toBe(
            '39\u00a0(x\u00a0%)',
        );
    });
});
