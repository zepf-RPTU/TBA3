import { EN_TERMS } from '../../enTerms.js';
import { createMultiValueListColumn } from '../../../common/tables/columnFactories.js';
import { styleOrder } from '../../utils/enStyleOrder.js';

/**
 * Creates the EN "Stile" column. The row's styles arrive priority-sorted. The list filter offers the styles present in the rows, in priority
 * order; sorting compares the rows' styles in that order, primary style first. Each style is one
 * word, so the column is as wide as the widest registered style (the factory floors to
 * `order`, whatever rows a table swaps in) or its header. A dataset
 * without style buckets gets no column, so the callers spread the result.
 * @param {Array<{value: string, fieldName: string, label: string}>} styleCategories - Style categories in priority order (from EnConfig)
 * @returns {import('../../../common/tables/columnFactories.js').TableColumnDefinition[]} The column, or none.
 */
export function createStylesColumn(styleCategories) {
    if (styleCategories.length === 0) return [];
    return [
        createMultiValueListColumn(EN_TERMS.STYLES, 'style', {
            order: styleOrder(styleCategories),
            tableMeta: { fitContent: true },
        }),
    ];
}
