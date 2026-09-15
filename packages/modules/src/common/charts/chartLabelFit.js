/**
 * Fitting free-text group labels into band-scale slots.
 *
 * API group names are the school's own free-text names — `D_E_08a_ABCD`,
 * `Landesschnitt HSA-GK`, up to 16 free-text characters — where the chart
 * layouts were built for `8a`. These helpers implement the one policy every chart shares:
 * show the full name, broken over at most two lines, and only when a line still
 * cannot fit its slot shorten it with a *middle* ellipsis, because the head and
 * tail are what tell two such labels apart (`D_E_08a_ABCD` vs `D_G_08a_ABCD`).
 * The tooltip or legend beside the mark keeps the name in full.
 *
 * Every chart printing group names breaks and shortens them the same way.
 */

import * as d3 from 'd3';

/** Where a label may be broken. The separator stays on the line it ends. */
const LABEL_SEPARATORS = new Set([' ', '_', '-']);
/** The most lines one label is broken over. */
export const MAX_LABEL_LINES = 2;
/**
 * Line height between a broken label's lines, as a factor of the font size. One
 * value for measuring and drawing — a reserve for a different line step is the
 * wrong reserve.
 */
export const LABEL_LINE_HEIGHT = 1.1;

/**
 * Break one label over at most two lines.
 *
 * The break is chosen to make the *longer* line as short as possible, since that
 * line is what the slot must fit. Separators stay attached to the line they
 * end, so the label reads back character-for-character.
 *
 * Pure and deterministic: a renderer and any layout estimate sizing the same
 * label must agree on where the break falls — a width reserved for a different
 * split is the wrong width.
 * @param {string} label - The label.
 * @returns {string[]} One or two lines; never empty for a non-empty label.
 */
export function splitLabelLines(label) {
    const text = String(label ?? '');
    if (!text) return [];

    let best = null;
    // A break after the last character would leave an empty second line.
    for (let index = 0; index < text.length - 1; index += 1) {
        if (!LABEL_SEPARATORS.has(text[index])) continue;

        const head = text.slice(0, index + 1).trimEnd();
        const tail = text.slice(index + 1);
        // Trimming can empty the head (a label that opens on a space). That break
        // draws a blank first line and saves no width, but still costs the view
        // a two-line band — line counts count lines, not ink.
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

/**
 * Extra height the broken lines of free-text labels need beyond one line, in px.
 * Zero when every label stays on one line. An axis reserve adds this to the
 * space measured for the lines themselves.
 * @param {number} fontSize - Font size the labels are drawn at, in px.
 * @param {string[]} labels - The labels that will be drawn broken.
 * @returns {number} Additional reserve in px.
 */
export function measureExtraLabelLineSpace(fontSize, labels) {
    const maxLines = Math.max(1, ...labels.map((label) => splitLabelLines(label).length));
    return (maxLines - 1) * fontSize * LABEL_LINE_HEIGHT;
}

/**
 * Re-draw a d3 band axis's tick labels wrapped and fitted.
 *
 * The KS-distribution charts print group names through `d3.axisBottom`, whose
 * single-line tick text neither wraps nor shortens. This pass rewrites each
 * tick label whose name splits or overflows into `tspan` lines stacked
 * downwards — the first line keeps the axis's own baseline (`dy`), so short
 * names render exactly as before.
 * @param {object} chart - The renderer whose offscreen measurement is used.
 * @param {d3.Selection} axisGroup - The rendered axis group holding `.tick text` nodes.
 * @param {number} step - Centre-to-centre distance between neighbouring ticks, in px.
 * @param {object} [options] - Layout overrides.
 * @param {number} [options.gap=8] - Breathing room between two neighbouring labels, in px.
 * @param {number} [options.lineHeight] - Distance between a label's lines, in px; defaults to the chart's base text size × `LABEL_LINE_HEIGHT`.
 */
export function wrapBandAxisTickLabels(chart, axisGroup, step, { gap = 8, lineHeight } = {}) {
    const slot = Math.max(0, step - gap);
    const lineStep = lineHeight ?? chart.resolveChartTextSize('base') * LABEL_LINE_HEIGHT;

    axisGroup.selectAll('.tick text').each(function (tickValue) {
        const text = d3.select(this);
        const label = String(tickValue ?? '');
        const lines = splitLabelLines(label);
        const fitted = lines.map((line) => fitLabelLine(chart, line, slot));

        // A short name neither splits nor shortens — leave the axis's own node
        // untouched so nothing else about its rendering can drift.
        if (fitted.length === 1 && fitted[0] === label) return;

        // The axis's own baseline shift stays on the text node, so the first
        // tspan adds nothing to it and later lines shift down relative to the
        // one before. Leaving it in place keeps a repeat call idempotent —
        // `d3.axisBottom` re-sets `dy` only on entering tick text, so a helper
        // that moved it onto a tspan could never put it back.
        text.text(null);
        fitted.forEach((line, lineIndex) => {
            text.append('tspan')
                .attr('x', 0)
                .attr('dy', lineIndex === 0 ? 0 : `${lineStep}px`)
                .text(line);
        });
    });
}

/**
 * One label line, shortened to fit `slot` if it has to be.
 *
 * The last resort after the layout has already been widened as far as its
 * container allows: there is no more width to take, and a collision would be
 * worse than an abbreviation. The ellipsis goes in the middle, not at the end
 * (see the file doc).
 *
 * Takes the renderer rather than living on it (same convention as
 * `measureCategoryAxisSpace`): the measurement primitive is an instance method,
 * but the fitting policy is shared.
 * @param {{measureTexts: (texts: string[], options?: object) => {maxWidth: number}}} chart - The renderer whose offscreen measurement is used.
 * @param {string} line - The line to fit.
 * @param {number} slot - Width available to it, in px.
 * @param {object} [measureOptions] - Forwarded to `measureTexts` (`textSize`, `fontWeight`, …) so the fit is measured at the size the label is drawn.
 * @returns {string} The line, middle-ellipsed if it did not fit.
 */
export function fitLabelLine(chart, line, slot, measureOptions = {}) {
    if (slot <= 0 || chart.measureTexts([line], measureOptions).maxWidth <= slot) {
        return line;
    }

    // Drop one character per step from the middle outwards, keeping the head
    // one longer than the tail on an odd budget — the head disambiguates more.
    for (let kept = line.length - 1; kept >= 2; kept -= 1) {
        const head = line.slice(0, Math.ceil(kept / 2));
        const tail = line.slice(line.length - Math.floor(kept / 2));
        const candidate = `${head}…${tail}`;

        if (chart.measureTexts([candidate], measureOptions).maxWidth <= slot) {
            return candidate;
        }
    }

    // One or two characters are no wider than the ellipsis that would replace
    // them, so shortening buys nothing and costs the label: the fixed tags the
    // charts draw beside free-text names (`S`, `L1`, `Q`, a subject initial)
    // must survive even a band too narrow for them.
    return line.length > 2 ? '…' : line;
}

/**
 * Push labels apart along one axis so none overlap, keeping them inside `[min, max]`.
 * Order is preserved; a label is only moved as far as its neighbours force it. Used
 * for the direct series labels at the right end of a line chart.
 * @template {{y: number}} T
 * @param {T[]} items - Labels with their preferred coordinate.
 * @param {{minGap: number, min?: number, max?: number}} options - The minimum distance
 *   between two labels and the bounds they must stay within.
 * @returns {T[]} New objects with the resolved coordinate, in the input order.
 */
export function spreadLabelPositions(items, { minGap, min = -Infinity, max = Infinity }) {
    // Two series ending on the same value stack in the order they were passed, spelled out
    // rather than left to the sort's stability.
    const order = items
        .map((item, index) => ({ index, y: item.y }))
        .sort((a, b) => a.y - b.y || a.index - b.index);

    // Two passes: the first enforces `min` and the gap from the top down, but nothing bounds
    // it above, so a crowded set walks past `max`. The second pulls that overflow back under
    // the ceiling, gap by gap.
    for (let i = 0; i < order.length; i++) {
        const floor = i === 0 ? min : order[i - 1].y + minGap;
        order[i].y = Math.max(order[i].y, floor);
    }
    for (let i = order.length - 1; i >= 0; i--) {
        const ceiling = i === order.length - 1 ? max : order[i + 1].y - minGap;
        order[i].y = Math.min(order[i].y, ceiling);
    }
    const resolved = items.map((item) => ({ ...item }));
    order.forEach(({ index, y }) => {
        resolved[index].y = y;
    });
    return resolved;
}
