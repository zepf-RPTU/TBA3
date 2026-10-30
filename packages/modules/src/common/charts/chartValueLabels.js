/**
 * Value labels: the number or level printed on or beside a mark.
 * - A label inside a mark shows the longest tier of its text that fits the mark's box
 *   less `VALUE_LABEL.padPx` a side, measured at the size it is drawn; nothing fits, no label.
 * - Its ink is white or dark, whichever contrasts more with the fill as it is seen.
 * - A label outside a mark sits `VALUE_LABEL.gapPx` from it in the chart's text ink.
 * - A label over a mixed background (a gridline, a neighbouring mark) takes a halo of the
 *   card surface, so it reads on whatever passes under it.
 */

import { chartTextSizeCssValue } from './chartTypography.js';
import { fontWeightToken } from '../utils/fontTokens.js';
import { LABEL_LINE_HEIGHT_EM, appendLabelLines } from './chartLabelFit.js';
import { valueLabelInk } from '../services/paletteTokens.js';

/** Air a side between an inside label and its mark's edge (`padPx`), and between an outside label and its mark (`gapPx`). */
export const VALUE_LABEL = Object.freeze({ padPx: 3, gapPx: 4 });

/**
 * The text size and weight a label is drawn at, per placement, as `measureTexts`
 * options.
 * @param {'inside'|'outside'} placement
 * @returns {{textSize: 'sm'|'base', fontWeight: string|null}}
 */
export function valueLabelFont(placement) {
    return placement === 'inside'
        ? { textSize: 'base', fontWeight: fontWeightToken('bold') }
        : { textSize: 'sm', fontWeight: null };
}

/**
 * The first tier of an inside label that fits its mark: its widest line within the box's
 * width and its lines within the box's height, each less `VALUE_LABEL.padPx` a side.
 * @param {{measureTexts: import('./renderers/chartRenderer.js').ChartRenderer['measureTexts'], resolveChartTextSize: (size?: 'sm'|'base') => number}} chart
 * @param {Array<string|string[]>} tiers - The label forms, longest first; a `string[]` is one form over several lines.
 * @param {{width: number, height: number}} box - The mark's box, px.
 * @returns {string|string[]|null} Null when none fits.
 */
export function fitValueLabel(chart, tiers, box) {
    const font = valueLabelFont('inside');
    const width = box.width - 2 * VALUE_LABEL.padPx;
    const height = box.height - 2 * VALUE_LABEL.padPx;
    const lineStep = chart.resolveChartTextSize(font.textSize) * LABEL_LINE_HEIGHT_EM;
    return (
        tiers.find((tier) => {
            const lines = typeof tier === 'string' ? [tier] : tier;
            if (lines.length === 0 || lines.some((line) => !line)) return false;
            const measured = chart.measureTexts(lines, font);
            return (
                measured.maxWidth <= width &&
                measured.maxHeight + (lines.length - 1) * lineStep <= height
            );
        }) ?? null
    );
}

/**
 * Write a label's text into a text node: one line as its text, several as `tspan`s
 * centred on its `y`, one `LABEL_LINE_HEIGHT_EM` apart.
 * @template {import('d3').BaseType} E
 * @template D
 * @param {import('d3').Selection<E, D, any, any>} label
 * @param {string|string[]} text - The label, or its lines.
 */
export function setValueLabelText(label, text) {
    label.text(null);
    if (typeof text === 'string') {
        label.text(text);
        return;
    }
    appendLabelLines(label, text, { x: label.attr('x'), stack: 'center' });
}

/**
 * Style value label text nodes a chart joins itself: size and weight by placement, the
 * ink, the halo, and no pointer events. `appendValueLabel` draws through it.
 * @template {import('d3').BaseType} E
 * @template D
 * @param {import('d3').Selection<E, D, any, any>} labels
 * @param {object} [options]
 * @param {'inside'|'outside'} [options.placement='inside'] - Inside a mark (`base`, bold) or beside it (`sm`, regular).
 * @param {string|((d: D) => string)} [options.fill] - The ink, or one per datum; defaults to `valueLabelInk()`, the text ink.
 * @param {boolean} [options.halo=false] - Ring the glyphs in the card surface (`.value-label--halo`).
 * @returns {import('d3').Selection<E, D, any, any>} The same selection.
 */
export function styleValueLabels(labels, { placement = 'inside', fill, halo = false } = {}) {
    const font = valueLabelFont(placement);
    const ink = fill ?? valueLabelInk();
    // Value functions, because d3's `style` overloads take a constant or null, never a
    // union of them; a function returning null removes the property, as null does.
    return labels
        .classed('value-label--halo', halo)
        .style('font-size', chartTextSizeCssValue(font.textSize))
        .style('font-weight', () => font.fontWeight)
        .style('fill', typeof ink === 'function' ? ink : () => ink)
        .style('pointer-events', 'none');
}

/**
 * Append one value label.
 * @template {SVGElement} P
 * @template D
 * @param {import('d3').Selection<P, D, any, any>} parent
 * @param {object} options
 * @param {number} options.x - Anchor x.
 * @param {number} options.y - Anchor y; a multi-line label is centred on it.
 * @param {string|string[]} options.text - The label, or its lines.
 * @param {'start'|'middle'|'end'} [options.anchor='middle'] - `text-anchor`.
 * @param {string} [options.baseline='middle'] - `dominant-baseline`.
 * @param {string} [options.fill] - The label's ink; defaults to `valueLabelInk()`, the text ink.
 * @param {'inside'|'outside'} [options.placement='inside'] - Inside a mark (`base`, bold) or beside it (`sm`, regular).
 * @param {boolean} [options.halo=false] - Ring the glyphs in the card surface (`.value-label--halo`).
 * @returns {import('d3').Selection<SVGTextElement, D, P, any>}
 */
export function appendValueLabel(
    parent,
    {
        x,
        y,
        text,
        anchor = 'middle',
        baseline = 'middle',
        fill,
        placement = 'inside',
        halo = false,
    },
) {
    const label = parent
        .append('text')
        .attr('class', 'value-label')
        .attr('x', x)
        .attr('y', y)
        .attr('text-anchor', anchor)
        .attr('dominant-baseline', baseline);
    styleValueLabels(label, { placement, fill, halo });
    setValueLabelText(label, text);
    return label;
}
