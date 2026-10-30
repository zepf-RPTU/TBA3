/**
 * Fitting free-text group labels into band-scale slots.
 *
 * API group names are free text (`D_E_08a_ABCD`, `Landesschnitt HSA-GK`), where the
 * chart layouts are sized for `8a`. The policy:
 * show the full name over at most two lines; a line that still cannot fit its slot gets
 * a middle ellipsis, because head and tail tell two such labels apart (`D_E_08a_ABCD`
 * vs `D_G_08a_ABCD`). The tooltip or legend beside the mark keeps the name in full.
 */

import * as d3 from 'd3';
import { fontWeightToken } from '../utils/fontTokens.js';

/**
 * What the fitting functions need of a renderer: its batched text measurement.
 * @typedef {{measureTexts: (texts: string[], options?: import('./chartAxisUtils.js').TextMeasureOptions) => {maxWidth: number, sizes: Array<{width: number}>}}} LabelMeasurer
 */

/** Where a label may be broken. The separator stays on the line it ends. */
const LABEL_SEPARATORS = new Set([' ', '_', '-']);
export const MAX_LABEL_LINES = 2;
/**
 * Line height between a broken label's lines, as a factor of the font size; measuring
 * and drawing share it.
 */
export const LABEL_LINE_HEIGHT_EM = 1.1;

/**
 * Break one label over at most two lines.
 *
 * The break makes the longer line as short as possible, since that line is what the
 * slot must fit. Deterministic: a renderer and a layout estimate sizing the same label
 * must agree on where the break falls.
 * @param {string|null|undefined} label - None has no lines.
 * @returns {string[]} One or two lines; never empty for a non-empty label.
 */
export function splitLabelLines(label) {
    const text = String(label ?? '');
    if (!text) return [];

    /** @type {{longest: number, lines: string[]}|null} */
    let best = null;
    // A break after the last character would leave an empty second line.
    for (let index = 0; index < text.length - 1; index += 1) {
        if (!LABEL_SEPARATORS.has(text[index])) continue;

        const head = text.slice(0, index + 1).trimEnd();
        const tail = text.slice(index + 1);
        // Trimming can empty the head (a label that opens on a space): a blank first
        // line saves no width but still costs a two-line band.
        if (!head) continue;

        const longest = Math.max(head.length, tail.length);
        if (!best || longest < best.longest) {
            best = { longest, lines: [head, tail] };
        }
    }

    // No separator, or every break leaves a line as long as the whole label.
    if (!best || best.longest >= text.length) return [text];
    return best.lines.slice(0, MAX_LABEL_LINES);
}

/** Breathing room between two neighbouring band labels. */
export const BAND_LABEL_GAP_PX = 8;

/**
 * Height a row of free-text labels takes once broken over their lines: the tallest
 * line plus one line step per extra line. What an axis reserve adds for labels drawn
 * through `wrapBandAxisTickLabels` or `appendFittedLabelLines`.
 * @param {import('./renderers/chartRenderer.js').ChartRenderer} chart
 * @param {ReadonlyArray<string>} labels
 * @param {import('./chartAxisUtils.js').TextMeasureOptions} [measureOptions] - The size and weight they are drawn at.
 * @returns {number} In px; 0 for no labels.
 */
export function measureLabelBlockHeight(chart, labels, measureOptions = {}) {
    if (labels.length === 0) return 0;
    const measured = chart.measureTexts(labels.flatMap(splitLabelLines), measureOptions);
    const maxLines = Math.max(1, ...labels.map((label) => splitLabelLines(label).length));
    const fontSize =
        measureOptions.fontSizePx ?? chart.resolveChartTextSize(measureOptions.textSize);
    return measured.maxHeight + (maxLines - 1) * fontSize * LABEL_LINE_HEIGHT_EM;
}

/**
 * Re-draw a d3 band axis's tick labels wrapped and fitted: each tick label whose name
 * splits or overflows becomes `tspan` lines, stacked down from the tick on a bottom
 * axis, centred on it on a side axis. Other tick labels stay as d3 drew them.
 * @param {LabelMeasurer & Pick<import('./renderers/chartRenderer.js').ChartRenderer, 'resolveChartTextSize'>} chart
 * @template D
 * @param {d3.Selection<SVGGElement, D, any, any>} axisGroup - The rendered axis group holding `.tick text` nodes.
 * @param {number} slotPx - Width each label line may take: a bottom axis's band step less `BAND_LABEL_GAP_PX`, a side axis's label space.
 * @param {{ stack?: 'down'|'center' }} [options] - `center` for a left or right axis.
 */
export function wrapBandAxisTickLabels(chart, axisGroup, slotPx, { stack = 'down' } = {}) {
    const fontSize = chart.resolveChartTextSize('base');

    axisGroup.selectAll('.tick text').each(function () {
        const text = d3.select(this);
        // The text the axis printed, its `tickFormat` applied — never the tick's datum,
        // which may be an internal band key (`group:8a`) rather than the name to show.
        const label = text.text();
        const lines = splitLabelLines(label);

        if (lines.length === 1 && fitLabelLine(chart, lines[0], slotPx) === label) return;

        // A tspan's own `dy` replaces the text node's for its characters, so the
        // axis's baseline shift (`0.71em` below, `0.32em` beside) is folded into an
        // explicit `y`. The node keeps its attributes, so a repeat call reads the
        // same baseline — a d3 axis re-sets `dy` only on entering tick text.
        const baseline =
            (Number(text.attr('y')) || 0) + (parseFloat(text.attr('dy')) || 0) * fontSize;
        text.text(null);
        appendFittedLabelLines(chart, text, label, {
            x: text.attr('x') ?? 0,
            y: baseline,
            slotPx,
            stack,
        });
    });
}

/**
 * Draw one label split (`splitLabelLines`) and fitted to `slotPx` (`fitLabelLine`), as
 * `tspan` lines appended to `text` and stacked as `appendLabelLines` does. The caller
 * positions and styles the text node.
 * @template {d3.BaseType} TextNode
 * @template D
 * @param {LabelMeasurer} chart
 * @param {d3.Selection<TextNode, D, any, any>} text
 * @param {string} label
 * @param {object} options
 * @param {number|string} options.x - Every line's `x`.
 * @param {number|string} [options.y] - Every line's `y`; left out, the lines inherit the text node's own baseline.
 * @param {number} options.slotPx - Width available to each line.
 * @param {'down'|'up'|'center'} options.stack - Where the lines sit against the baseline.
 */
export function appendFittedLabelLines(chart, text, label, { x, y, slotPx, stack }) {
    appendLabelLines(text, fitLabelLines(chart, label, slotPx), { x, y, stack });
}

/**
 * The measuring half of `appendFittedLabelLines`: the label split and each line fitted to
 * `slotPx`. For a chart that draws the same label in many slots of one width, so it is
 * measured once rather than once per slot.
 * @param {LabelMeasurer} chart
 * @param {string} label
 * @param {number} slotPx - Width available to each line.
 * @param {import('./chartAxisUtils.js').TextMeasureOptions} [measureOptions] - Forwarded to `fitLabelLine`.
 * @returns {string[]}
 */
export function fitLabelLines(chart, label, slotPx, measureOptions = {}) {
    return splitLabelLines(label).map((line) => fitLabelLine(chart, line, slotPx, measureOptions));
}

/**
 * The drawing half of `appendFittedLabelLines`: already fitted lines appended to `text`
 * as `tspan`s, stacked `down` from the baseline (the first line keeps the single-line
 * position), `up` to it (the last line does), or centred on it, one `LABEL_LINE_HEIGHT_EM`
 * apart, so the step follows the size the text is drawn at.
 * @template {d3.BaseType} TextNode
 * @template D
 * @param {d3.Selection<TextNode, D, any, any>} text
 * @param {string[]} lines - Already fitted (`fitLabelLines`).
 * @param {object} options
 * @param {number|string} options.x - Every line's `x`.
 * @param {number|string} [options.y] - Every line's `y`; left out, the lines inherit the text node's own baseline.
 * @param {'down'|'up'|'center'} options.stack - Where the lines sit against the baseline.
 */
export function appendLabelLines(text, lines, { x, y, stack }) {
    const first =
        stack === 'up' ? -(lines.length - 1) : stack === 'center' ? -(lines.length - 1) / 2 : 0;
    lines.forEach((line, lineIndex) => {
        const tspan = text.append('tspan').attr('x', x);
        if (y !== undefined) tspan.attr('y', y);
        // With a `y` each line is offset from it; without one, `dy` runs on from the
        // line before, so after the first line each step is one line.
        const step = y !== undefined || lineIndex === 0 ? first + lineIndex : 1;
        tspan.attr('dy', `${step * LABEL_LINE_HEIGHT_EM}em`).text(line);
    });
}

/** How far above a bar's top its label's baseline sits. */
export const BAR_TOP_LABEL_OFFSET_PX = 5;

/**
 * The label above a bar: bold, in secondary ink, centred on `x`, its last line on a
 * baseline `BAR_TOP_LABEL_OFFSET_PX` above the bar and the lines before it stacked upwards.
 * It lets the pointer through to the bar under it.
 * @template {d3.BaseType} G
 * @template D
 * @param {d3.Selection<G, D, any, any>} group - The bar's group; its origin is the bar's top left.
 * @param {object} label
 * @param {string} label.className
 * @param {number} label.x - Its centre in px.
 * @param {string[]} label.lines - Already fitted (`fitLabelLines`).
 * @returns {d3.Selection<SVGTextElement, D, G, any>}
 */
export function appendBarTopLabel(group, { className, x, lines }) {
    const text = group
        .append('text')
        .attr('class', className)
        .attr('x', x)
        .attr('y', -BAR_TOP_LABEL_OFFSET_PX)
        .attr('text-anchor', 'middle')
        .style('font-weight', fontWeightToken('bold'))
        .style('fill', 'var(--text-secondary)')
        .style('pointer-events', 'none');
    appendLabelLines(text, lines, { x, y: -BAR_TOP_LABEL_OFFSET_PX, stack: 'up' });
    return text;
}

/**
 * One label line, shortened with a middle ellipsis if it does not fit `slotPx`: the last
 * resort once the layout cannot be widened further.
 * @param {LabelMeasurer} chart
 * @param {string} line
 * @param {number} slotPx - Width available to it.
 * @param {import('./chartAxisUtils.js').TextMeasureOptions} [measureOptions] - Forwarded to `measureTexts` (`textSize`, `fontWeight`, …) so the fit is measured at the size the label is drawn.
 * @returns {string}
 */
export function fitLabelLine(chart, line, slotPx, measureOptions = {}) {
    if (slotPx <= 0 || chart.measureTexts([line], measureOptions).maxWidth <= slotPx) {
        return line;
    }

    // Keep the most characters that still fit, cut from the middle outwards, the head one
    // longer than the tail on an odd budget. All candidates go into one batched
    // measurement, longest first. They depend on the line alone, not the slot, so the
    // page's text cache serves a later fit at any slot.
    const candidates = [];
    for (let kept = line.length - 1; kept >= 2; kept--) {
        const head = line.slice(0, Math.ceil(kept / 2));
        const tail = line.slice(line.length - Math.floor(kept / 2));
        candidates.push(`${head}…${tail}`);
    }
    const { sizes } = chart.measureTexts(candidates, measureOptions);
    const best = candidates.find((_, i) => sizes[i].width <= slotPx);
    if (best !== undefined) return best;

    // One or two characters are no wider than the ellipsis replacing them: the fixed
    // tags the charts draw beside free-text names (`S`, `L1`, `Q`, a subject initial)
    // survive even a band too narrow for them.
    return line.length > 2 ? '…' : line;
}

/**
 * Push labels apart along one axis so none overlap, keeping them inside `[min, max]`.
 * Order is preserved; a label is only moved as far as its neighbours force it. Used
 * for the direct series labels at the right end of a line chart.
 * @template {{y: number}} T
 * @param {T[]} items - Labels with their preferred coordinate.
 * @param {{minGapPx: number, min: number, max: number}} options - The minimum distance
 *   between two labels and the bounds they must stay within.
 * @returns {T[]} New objects with the resolved coordinate, in the input order.
 */
export function spreadLabelPositions(items, { minGapPx, min, max }) {
    // Two series ending on the same value stack in the order they were passed.
    const order = items
        .map((item, index) => ({ index, y: item.y }))
        .sort((a, b) => a.y - b.y || a.index - b.index);

    // The first pass enforces `min` and the gap from the top down, which can push a
    // crowded set past `max`; the second pulls that overflow back under the ceiling.
    for (let i = 0; i < order.length; i++) {
        const floor = i === 0 ? min : order[i - 1].y + minGapPx;
        order[i].y = Math.max(order[i].y, floor);
    }
    for (let i = order.length - 1; i >= 0; i--) {
        const ceiling = i === order.length - 1 ? max : order[i + 1].y - minGapPx;
        order[i].y = Math.min(order[i].y, ceiling);
    }
    const resolved = items.map((item) => ({ ...item }));
    order.forEach(({ index, y }) => {
        resolved[index].y = y;
    });
    return resolved;
}
