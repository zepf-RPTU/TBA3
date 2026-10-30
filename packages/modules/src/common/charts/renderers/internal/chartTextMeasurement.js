/**
 * SVG text measurement: one hidden offscreen SVG and one cache of measured boxes for
 * every chart on the page. Axis labels, group names and titles repeat across charts and
 * across every resize's re-render, and each miss is a forced layout.
 */

import { SVG_NAMESPACE } from '../../selectOrAppend.js';

/**
 * The typography a text is measured at, every field resolved.
 * @typedef {object} MeasureFont
 * @property {number} fontSizePx
 * @property {string} fontFamily
 * @property {string|number|null} fontWeight - Null for the inherited one.
 * @property {number} rotationDeg - The box returned is the rotated text's.
 */

/** @type {SVGSVGElement|null} */
let offscreen = null;

/**
 * Measured boxes by font and string. The key carries every input a box depends on (the
 * resolved px size and family among them), so a root font-size or theme change misses
 * on its own. Chart text is set in the system stack, so no late web font can stale it.
 * @type {Map<string, {width: number, height: number}>}
 */
const boxes = new Map();

/**
 * Entries the cache holds before it starts over: the root font size follows the viewport
 * width, so every width a window is dragged through adds a set of keys.
 */
const MAX_BOXES = 5000;

/**
 * The offscreen SVG, created on first use and again when something removed it from the
 * document (a detached SVG measures every box as empty).
 * @returns {SVGSVGElement}
 */
function offscreenSvg() {
    if (offscreen?.isConnected) return offscreen;
    offscreen = document.createElementNS(SVG_NAMESPACE, 'svg');
    offscreen.setAttribute('width', '0');
    offscreen.setAttribute('height', '0');
    offscreen.setAttribute('aria-hidden', 'true');
    Object.assign(offscreen.style, {
        position: 'absolute',
        top: '0',
        left: '0',
        visibility: 'hidden',
        pointerEvents: 'none',
        // The digits every chart draws with (`.chart-container` in chartRenderer.css): a
        // font whose own digits are proportional would otherwise measure them narrower.
        fontVariantNumeric: 'tabular-nums',
    });
    document.body.append(offscreen);
    return offscreen;
}

/**
 * Render the strings into the offscreen SVG in one batch and read their boxes.
 * @param {string[]} texts - Distinct, non-empty.
 * @param {MeasureFont} font
 * @returns {Array<{width: number, height: number}>} In input order.
 */
function measureUncached(texts, font) {
    const group = document.createElementNS(SVG_NAMESPACE, 'g');
    const elements = texts.map((text) => {
        const element = document.createElementNS(SVG_NAMESPACE, 'text');
        element.style.fontSize = `${font.fontSizePx}px`;
        element.style.fontFamily = font.fontFamily;
        if (font.fontWeight !== null) element.style.fontWeight = String(font.fontWeight);
        element.textContent = text;
        return element;
    });
    group.append(...elements);
    offscreenSvg().append(group);
    try {
        // `getBBox()` is the box in the text's own space, before any offset or rotation,
        // so the rotated extent is computed from it.
        const rad = (font.rotationDeg * Math.PI) / 180;
        const cosA = Math.abs(Math.cos(rad));
        const sinA = Math.abs(Math.sin(rad));
        return elements.map((element) => {
            const bbox = element.getBBox();
            return font.rotationDeg
                ? {
                      width: bbox.width * cosA + bbox.height * sinA,
                      height: bbox.width * sinA + bbox.height * cosA,
                  }
                : { width: bbox.width, height: bbox.height };
        });
    } finally {
        group.remove();
    }
}

/**
 * Each string's rendered box at `font`, measured once per font and string for the page.
 * @param {string[]} texts
 * @param {MeasureFont} font
 * @returns {Array<{width: number, height: number}>} In input order.
 */
export function measureTexts(texts, font) {
    const fontKey = [font.fontSizePx, font.fontFamily, font.fontWeight, font.rotationDeg].join('|');
    const keys = texts.map((text) => `${fontKey}|${text}`);
    if (boxes.size > MAX_BOXES) boxes.clear();

    const misses = [...new Set(texts.filter((_, i) => !boxes.has(keys[i])))];
    if (misses.length > 0) {
        const sizes = measureUncached(misses, font);
        misses.forEach((text, i) => boxes.set(`${fontKey}|${text}`, sizes[i]));
    }
    return keys.map((key) => /** @type {{width: number, height: number}} */ (boxes.get(key)));
}
