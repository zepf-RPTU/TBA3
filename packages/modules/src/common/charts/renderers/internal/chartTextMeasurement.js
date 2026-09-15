/**
 * SVG text measurement helpers.
 *
 * ChartRenderer owns the pooled offscreen SVG lifecycle. This module owns the
 * mechanics of rendering temporary measurement nodes and reading getBBox(), and the
 * one word-wrap both drawing and measuring go through.
 */

/**
 * Break one label into `<tspan>` lines that fit `width`, greedily by word.
 *
 * The single wrapping rule for the chart: `ChartRenderer.wrapText` draws with it and
 * `measureWrappedSvgTexts` measures with it, so the height reserved for a label is the
 * height it is drawn at. A word wider than the slot stays on its line (it cannot be
 * broken, and starting a new line for it would only add an empty first line); a
 * non-positive width wraps nothing.
 * @param {d3.Selection} text - The `<text>` element, emptied and refilled.
 * @param {string} label - The words to lay out.
 * @param {object} geometry - Where the lines go.
 * @param {string|number} geometry.x - The `x` every line starts at.
 * @param {string|number|null} geometry.y - The `y` every line shares.
 * @param {number} geometry.firstDyEm - Baseline offset of the first line, in ems.
 * @param {number} geometry.lineHeightEm - Distance between lines, in ems.
 * @param {number} [geometry.width] - The width a line may take; omitted or non-positive means no wrapping.
 * @returns {number} How many lines were laid out.
 */
export function appendWrappedTspans(text, label, { x, y, firstDyEm, lineHeightEm, width }) {
    const wordsRightToLeft = String(label ?? '')
        .split(/\s+/)
        .filter(Boolean)
        .reverse();
    const maxWidth =
        typeof width === 'number' && Number.isFinite(width) && width > 0 ? width : null;
    let line = [];
    let lineNumber = 0;
    let tspan = text
        .text(null)
        .append('tspan')
        .attr('x', x)
        .attr('y', y)
        .attr('dy', `${firstDyEm}em`);

    if (wordsRightToLeft.length === 0) {
        tspan.text('');
        return 1;
    }

    let word;
    while ((word = wordsRightToLeft.pop())) {
        line.push(word);
        tspan.text(line.join(' '));
        if (
            maxWidth !== null &&
            /** @type {SVGTextContentElement} */ (tspan.node()).getComputedTextLength() >
                maxWidth &&
            line.length > 1
        ) {
            line.pop();
            tspan.text(line.join(' '));
            line = [word];
            lineNumber += 1;
            tspan = text
                .append('tspan')
                .attr('x', x)
                .attr('y', y)
                .attr('dy', `${firstDyEm + lineNumber * lineHeightEm}em`)
                .text(word);
        }
    }
    return lineNumber + 1;
}

const EMPTY_MEASUREMENT = { maxWidth: 0, maxHeight: 0, totalWidth: 0, totalHeight: 0 };

/**
 * The zero measurement, as a fresh object.
 * Copied rather than shared so a caller mutating a result cannot corrupt the constant.
 * @returns {{ maxWidth: number, maxHeight: number, totalWidth: number, totalHeight: number }} All dimensions zero.
 */
function emptyMeasurement() {
    return { ...EMPTY_MEASUREMENT };
}

/**
 * Normalise the measurement input to an array.
 * A bare string is one label, not a list of characters — the distinction the callers rely on.
 * @param {string|Array<any>|null|undefined} values - One label, a list of them, or nothing.
 * @returns {Array<any>} The labels as an array; empty when there were none.
 */
function toMeasurementList(values) {
    if (!values) return [];
    if (typeof values === 'string') return [values];
    return Array.from(values);
}

/**
 * Measure rendered SVG text dimensions using an existing offscreen SVG.
 * @param {d3.Selection} offscreen - Pooled offscreen SVG selection - Pooled offscreen SVG selection.
 * @param {string[]} texts - Text values to measure
 * @param {object} [options] - Typography and offsets to measure with.
 * @param {number} options.fontSize - Font size in px
 * @param {string} options.fontFamily - Font family
 * @param {string|number|null} [options.fontWeight] - Weight to measure at.
 * @param {number} [options.rotation=0] - Rotation in degrees
 * @param {string|number|null} [options.dx] - Horizontal offset applied before measuring.
 * @param {string|number|null} [options.dy] - Vertical offset applied before measuring.
 * @returns {{ maxWidth: number, maxHeight: number, totalWidth: number, totalHeight: number }} Largest and summed dimensions across all measured labels.
 */
export function measureSvgTexts(offscreen, texts, options = /** @type {any} */ ({})) {
    const textList = toMeasurementList(texts);
    if (textList.length === 0) return emptyMeasurement();

    const { fontSize, fontFamily, fontWeight = null, rotation = 0, dx = null, dy = null } = options;

    const measureGroup = offscreen.append('g');
    try {
        const textEls = measureGroup
            .selectAll('text')
            .data(textList)
            .enter()
            .append('text')
            .style('font-size', `${fontSize}px`)
            .style('font-family', fontFamily)
            .style('font-weight', /** @type {any} */ (fontWeight))
            .attr('dx', dx)
            .attr('dy', dy)
            .attr('transform', rotation ? `rotate(${rotation})` : null)
            .text((d) => d);

        const rad = rotation ? (rotation * Math.PI) / 180 : 0;
        const cosA = rad ? Math.abs(Math.cos(rad)) : 1;
        const sinA = rad ? Math.abs(Math.sin(rad)) : 0;

        let maxWidth = 0;
        let maxHeight = 0;
        let totalWidth = 0;
        let totalHeight = 0;

        textEls.each(function () {
            const bbox = this.getBBox();
            const width = rad ? bbox.width * cosA + bbox.height * sinA : bbox.width;
            const height = rad ? bbox.width * sinA + bbox.height * cosA : bbox.height;
            maxWidth = Math.max(maxWidth, width);
            maxHeight = Math.max(maxHeight, height);
            totalWidth += width;
            totalHeight += height;
        });

        return { maxWidth, maxHeight, totalWidth, totalHeight };
    } finally {
        measureGroup.remove();
    }
}

/**
 * Measure wrapped SVG text dimensions using ChartRenderer's wrapping strategy.
 * @param {d3.Selection} offscreen - Pooled offscreen SVG selection - Pooled offscreen SVG selection.
 * @param {Array<string|{text: string, width?: number}>} texts - Labels to measure
 * @param {object} [options] - Typography and wrap widths to measure with.
 * @param {number} options.fontSize - Font size in px
 * @param {string} options.fontFamily - Font family
 * @param {string|number|null} [options.fontWeight] - Weight to measure at.
 * @param {number} [options.lineHeightEm=1.1] - Line height between wrapped lines, in ems.
 * @param {number} [options.width] - Default wrap width
 * @param {number[]} [options.widths] - Per-label wrap widths
 * @returns {{ maxWidth: number, maxHeight: number, totalWidth: number, totalHeight: number }} Largest and summed dimensions across all measured labels.
 */
export function measureWrappedSvgTexts(offscreen, texts, options = /** @type {any} */ ({})) {
    const textList = toMeasurementList(texts);
    if (textList.length === 0) return emptyMeasurement();

    const {
        fontSize,
        fontFamily,
        fontWeight = null,
        lineHeightEm = 1.1,
        width: defaultWidth,
        widths = null,
    } = options;
    const widthList = Array.isArray(widths) ? widths : null;
    const measureGroup = offscreen.append('g');
    try {
        let maxWidth = 0;
        let maxHeight = 0;
        let totalWidth = 0;
        let totalHeight = 0;

        textList.forEach((entry, index) => {
            const item =
                entry && typeof entry === 'object' && !Array.isArray(entry)
                    ? entry
                    : { text: entry, width: undefined };
            const width = item.width ?? widthList?.[index] ?? defaultWidth;
            const label = String(item.text ?? '');

            const textEl = measureGroup
                .append('text')
                .style('font-size', `${fontSize}px`)
                .style('font-family', fontFamily)
                .style('font-weight', /** @type {any} */ (fontWeight))
                .attr('x', 0)
                .attr('y', 0);

            appendWrappedTspans(textEl, label, { x: 0, y: 0, firstDyEm: 0, lineHeightEm, width });

            const bbox = /** @type {SVGGraphicsElement} */ (textEl.node()).getBBox();
            maxWidth = Math.max(maxWidth, bbox.width);
            maxHeight = Math.max(maxHeight, bbox.height);
            totalWidth += bbox.width;
            totalHeight += bbox.height;
        });

        return { maxWidth, maxHeight, totalWidth, totalHeight };
    } finally {
        measureGroup.remove();
    }
}
