/**
 * Data colour opts itself out of forced colours. An element that carries the colour a
 * reader tells the data by (a band, a head, a point, a swatch) takes `DATA_MARK_CLASS`
 * where it is made, and `dataMark.css` keeps its authored colours under forced colours
 * and in print, which would otherwise leave the levels and groups indistinguishable.
 * The properties inherit, so on a group the class covers every mark in it. The edge in
 * the system text colour that keeps neighbouring marks apart stays with each family's
 * own sheet.
 */

import './dataMark.css';

export const DATA_MARK_CLASS = 'data-mark';

/**
 * Mark a layer whose shapes carry data colour; an `onCreate` for `selectOrAppend`.
 * @param {import('d3').Selection<SVGGElement, any, any, any>} layer
 */
export function asDataMark(layer) {
    layer.classed(DATA_MARK_CLASS, true);
}
