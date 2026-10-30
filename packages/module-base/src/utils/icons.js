/**
 * The one icon source: Google's Material Symbols, rendered
 * as inline SVG from the curated path registry (materialSymbols.js beside this file).
 *
 * Inline SVG rather than the icon font: the glyph is in the DOM before first
 * paint (no font-load reflow), paints in `currentColor` so it follows every
 * theme, rasterizes into PDF/PNG exports without embedding a font, and can be
 * dropped into a d3 chart as a `<path>`. Only registered icons ship.
 *
 * Every name is Google's own (https://fonts.google.com/icons); an unknown name
 * throws rather than rendering nothing.
 */

import { html } from 'lit';
import { guard } from 'lit/directives/guard.js';
import { MATERIAL_SYMBOL_PATHS } from './materialSymbols.js';
import { trustedFragment } from './trustedHtml.js';
import './icons.css';

const VIEW_BOX = '0 -960 960 960';

/** @type {Map<string, SVGSVGElement>} One parsed element per distinct markup; `createIcon` hands out clones. */
const parsedIcons = new Map();

/**
 * @typedef {object} IconOptions
 * @property {string} [className] - Extra classes beside the shared `icon` class (colour, size or role hooks).
 * @property {string|number} [size] - Rendered width and height; `1em` by default, so the icon scales with its text.
 */

/**
 * The raw path data of one icon. Every caller goes through `iconSvg` or `createIcon`,
 * which keeps the viewBox and the ARIA attributes in one place.
 * @param {string} name - Material Symbols icon name (`close`, `chevron_right`, …).
 * @returns {string} The `d` attribute of the glyph on the `0 -960 960 960` viewBox.
 */
function iconPath(name) {
    const path = /** @type {{[name: string]: string|undefined}} */ (MATERIAL_SYMBOL_PATHS)[name];
    if (!path)
        throw new Error(
            `[icons] Unknown icon "${name}" — add it to packages/module-base/src/utils/materialSymbols.js.`,
        );
    return path;
}

/**
 * Inline SVG markup for one icon, for template-literal call sites.
 * @param {string} name
 * @param {IconOptions} [options]
 * @returns {string} A decorative (`aria-hidden`) `<svg class="icon …">` element.
 */
export function iconSvg(name, { className = '', size = '1em' } = {}) {
    const classes = className ? `icon ${className}` : 'icon';
    return `<svg class="${classes}" viewBox="${VIEW_BOX}" width="${size}" height="${size}" fill="currentColor" aria-hidden="true" focusable="false"><path d="${iconPath(name)}"/></svg>`;
}

/**
 * The same icon as a live element, for `createElement`-style call sites.
 * @param {string} name
 * @param {IconOptions} [options]
 * @returns {SVGSVGElement} A decorative `<svg class="icon …">` element.
 */
export function createIcon(name, options = {}) {
    const markup = iconSvg(name, options);
    let icon = parsedIcons.get(markup);
    if (!icon) {
        icon = /** @type {SVGSVGElement} */ (trustedFragment(markup).firstElementChild);
        parsedIcons.set(markup, icon);
    }
    return /** @type {SVGSVGElement} */ (icon.cloneNode(true));
}

/**
 * The same icon for a lit template: the element is built once per name and options and
 * kept across re-renders (`guard`), rather than rebuilt or swapped on every pass.
 * @param {string} name
 * @param {IconOptions} [options]
 * @returns {unknown}
 */
export function renderIcon(name, options = {}) {
    return guard([name, options.className, options.size], () => createIcon(name, options));
}

/**
 * One glyph of a checkbox's icon swap, built once and kept across re-renders.
 * @param {string} name
 * @param {'on'|'off'} swap - The state it shows.
 * @returns {unknown}
 */
function swapGlyph(name, swap) {
    return guard([name], () => {
        const icon = createIcon(name);
        icon.dataset.swap = swap;
        return icon;
    });
}

/**
 * The one checkbox glyph: both boxes stay in the DOM and cross-fade on `data-state`
 * (`.icon-swap`, icons.css), so a toggle animates rather than snaps.
 * @param {boolean} checked
 * @returns {import('lit').TemplateResult}
 */
export function renderCheckboxIcon(checked) {
    return html`<span class="icon-swap" data-state=${checked ? 'on' : 'off'}
        >${swapGlyph('check_box_outline_blank', 'off')}${swapGlyph('check_box', 'on')}</span
    >`;
}
