/**
 * The one icon source for every dashboard: Google's Material Symbols, rendered
 * as inline SVG from the curated path registry (materialSymbols.js beside this file).
 *
 * Inline SVG rather than the icon font, deliberately: the glyph is in the DOM
 * before first paint (no font-load reflow), paints in `currentColor` so it
 * follows every theme, rasterizes into PDF/PNG exports without embedding a
 * font, and can be dropped straight into a d3 chart as a `<path>`. Only the
 * icons the app names ship — there is no build step to subset a font.
 *
 * Every name is Google's own (https://fonts.google.com/icons); an unknown name
 * throws, because a typo that silently renders nothing is the harder bug.
 */

import { MATERIAL_SYMBOL_PATHS } from './materialSymbols.js';
import './icons.css';

const SVG_NS = 'http://www.w3.org/2000/svg';
const VIEW_BOX = '0 -960 960 960';

/**
 * @typedef {object} IconOptions
 * @property {string} [className] - Extra classes beside the shared `icon` class (colour, size or role hooks).
 * @property {string|number} [size] - Rendered width and height; `1em` by default, so the icon scales with its text.
 */

/**
 * The raw path data of one icon. Internal: every caller goes through `iconSvg` or
 * `createIcon`, which is what keeps the viewBox and the ARIA attributes in one place.
 * @param {string} name - Material Symbols icon name (`close`, `chevron_right`, …).
 * @returns {string} The `d` attribute of the glyph on the `0 -960 960 960` viewBox.
 */
function iconPath(name) {
    const path = MATERIAL_SYMBOL_PATHS[name];
    if (!path)
        throw new Error(
            `[icons] Unknown icon "${name}" — add it to packages/module-base/src/utils/materialSymbols.js.`,
        );
    return path;
}

/**
 * Inline SVG markup for one icon, for template-literal call sites.
 * @param {string} name - Material Symbols icon name.
 * @param {IconOptions} [options] - Class and size.
 * @returns {string} A decorative (`aria-hidden`) `<svg class="icon …">` element.
 */
export function iconSvg(name, { className = '', size = '1em' } = {}) {
    const classes = className ? `icon ${className}` : 'icon';
    return `<svg class="${classes}" data-icon="${name}" viewBox="${VIEW_BOX}" width="${size}" height="${size}" fill="currentColor" aria-hidden="true" focusable="false"><path d="${iconPath(name)}"/></svg>`;
}

/**
 * The same icon as a live element, for `createElement`-style call sites.
 * @param {string} name - Material Symbols icon name.
 * @param {IconOptions} [options] - Class and size.
 * @returns {SVGSVGElement} A decorative `<svg class="icon …">` element.
 */
export function createIcon(name, { className = '', size = '1em' } = {}) {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('class', className ? `icon ${className}` : 'icon');
    svg.dataset.icon = name;
    svg.setAttribute('viewBox', VIEW_BOX);
    svg.setAttribute('width', String(size));
    svg.setAttribute('height', String(size));
    svg.setAttribute('fill', 'currentColor');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', iconPath(name));
    svg.appendChild(path);
    return svg;
}
