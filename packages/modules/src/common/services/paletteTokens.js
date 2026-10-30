/**
 * The colours JS has to compute, published as custom properties so the page repaints
 * through the cascade.
 *
 * A competence level's colour comes from the loaded scale, a comparison series' shade
 * and a label's ink are derived from other colours, so none of them can be written in
 * a stylesheet. Each is registered once under a name, computed for both colour schemes,
 * written onto `<html>` as `--<name>: light-dark(<light>, <dark>)`, and painted as
 * `var(--<name>)`. Like the stylesheet tokens, every element resolves it by its own
 * `color-scheme`, so a scheme switch and a subtree painting in one scheme (paper) need no
 * publish. When the palette changes (a competence-level theme, a newly registered
 * scale), `publishPaletteTokens()` recomputes every registered token, and every mark
 * painted from one follows without a redraw.
 *
 * SVG presentation attributes do not resolve `var()`: a mark takes a token through
 * `.style('fill', …)` or a class, never `.attr('fill', …)`, and not inside a d3
 * transition, which would interpolate the digits in the property name.
 */

import { color as parseColor } from 'd3-color';
import { inkOn } from './colorRamp.js';

/**
 * How a token's value is computed in one colour scheme.
 * @typedef {(scheme: 'light'|'dark') => (string|null)} TokenComputer
 */

/** @type {ReadonlyArray<'light'|'dark'>} */
const SCHEMES = ['light', 'dark'];

/** @type {Map<string, TokenComputer>} Token name → how its value is computed. */
const computers = new Map();

/**
 * Register a computed colour and return the `var()` that paints it. The first call
 * for a name writes it; a later call only replaces how it is computed, so the next
 * publish reads the palette the latest caller holds (an app's palette is its own, not
 * the module's).
 * @param {string} name - The custom property, `--…`; the same name always computes the same colour.
 * @param {TokenComputer} compute - Its value under the palette in effect, per scheme; null unsets it.
 * @returns {string} `var(--<name>)`.
 */
export function paletteToken(name, compute) {
    const known = computers.has(name);
    computers.set(name, compute);
    if (!known) write(name, bothSchemes(compute));
    return `var(${name})`;
}

/**
 * Recompute every registered token, after any change to the palette.
 */
export function publishPaletteTokens() {
    // All reads before any write: a computer reading a stylesheet token after a write
    // would force a style recalc per token.
    /** @type {[string, string|null][]} */
    const values = [...computers].map(([name, compute]) => [name, bothSchemes(compute)]);
    for (const [name, value] of values) write(name, value);
}

/**
 * A token's value in both schemes, as one declaration.
 * @param {TokenComputer} compute
 * @returns {string|null} `light-dark(<light>, <dark>)`, the value alone where both are
 *   equal, or null when either scheme has none.
 */
function bothSchemes(compute) {
    const [light, dark] = SCHEMES.map(compute);
    if (!light || !dark) return null;
    return light === dark ? light : `light-dark(${light}, ${dark})`;
}

/** `var(--<name>)`, capturing `--<name>`; a fallback value makes it not a token reference. */
const TOKEN_REFERENCE = /^var\((--[\w-]+)\)$/;

/**
 * Whether a colour is a token reference, the form `inkToken` and `shadeToken` take.
 * @param {string} color
 * @returns {boolean} True for `var(--<name>)`.
 */
export function isTokenReference(color) {
    return TOKEN_REFERENCE.test(color);
}

/**
 * The literal a colour paints as in a colour scheme: a registered token computed afresh,
 * a stylesheet token resolved by a probe in that scheme (a `light-dark()` value only
 * resolves where it is painted), anything else as given.
 * @param {string} color - A colour, or a `var(--…)` reference to one.
 * @param {'light'|'dark'} scheme
 * @returns {string} '' for a token nothing declares.
 */
function resolveColor(color, scheme) {
    const name = TOKEN_REFERENCE.exec(color)?.[1];
    if (!name) return color;
    const compute = computers.get(name);
    if (compute) return compute(scheme) ?? '';
    const probe = probeFor(scheme);
    const style = getComputedStyle(probe);
    if (!style.getPropertyValue(name)) return '';
    probe.style.color = color;
    return style.color;
}

/** @type {Map<'light'|'dark', HTMLElement>} One hidden element per scheme that resolves stylesheet tokens. */
const probes = new Map();

/**
 * @param {'light'|'dark'} scheme - The scheme the probe paints in.
 * @returns {HTMLElement} A hidden element in the document, in that scheme.
 */
function probeFor(scheme) {
    let probe = probes.get(scheme);
    if (!probe) {
        probe = document.createElement('i');
        probe.hidden = true;
        probe.dataset.colorScheme = scheme;
        probes.set(scheme, probe);
    }
    // Under <body>, so it sees what every element of the page sees.
    if (!probe.isConnected) (document.body ?? document.documentElement).append(probe);
    return probe;
}

/**
 * The colour of the `index`-th mark sharing one base colour (a comparison group within
 * its type, a style row within its domain), stepping away from the page surface so the
 * ramp keeps contrast on both schemes. Index 0 is the base colour itself.
 * @param {string} base - A `var(--…)` reference to the base colour.
 * @param {number} index - Position among the marks sharing it, 0-based.
 * @param {number} step - How far each index moves, in d3 `darker`/`brighter` steps.
 * @returns {string} `base` for index 0, else the shade's `var()`.
 */
export function shadeToken(base, index, step) {
    if (!index) return base;
    return paletteToken(`${tokenName(base)}-shade-${index}`, (scheme) => {
        const color = parseColor(resolveColor(base, scheme));
        if (!color) return null;
        return scheme === 'light'
            ? color.darker(index * step).formatHex()
            : color.brighter(index * step).formatHex();
    });
}

/**
 * The ink a label takes on a fill (see `inkOn`), as a token.
 * @param {string} fill - A `var(--…)` reference to the fill.
 * @param {number} [opacity=1]
 * @returns {string} The ink's `var()`.
 */
export function inkToken(fill, opacity = 1) {
    const suffix = opacity === 1 ? '' : `-${Math.round(opacity * 100)}`;
    return paletteToken(`${tokenName(fill)}-ink${suffix}`, (scheme) =>
        inkOn(resolveColor(fill, scheme), { opacity, scheme }),
    );
}

/**
 * The ink of a value label: on a fill, its `inkToken`; with no fill beneath, the chart
 * text ink.
 * @param {string|null} [fill] - The fill the label sits on, a `var()` token.
 * @param {{opacity?: number}} [options]
 * @returns {string} The ink's `var()`, which follows a theme or scheme switch.
 */
export function valueLabelInk(fill, { opacity = 1 } = {}) {
    if (!fill) return 'var(--text-color)';
    return inkToken(fill, opacity);
}

/**
 * @param {string} reference - `var(--<name>)`.
 * @returns {string} `--name`.
 */
function tokenName(reference) {
    const name = TOKEN_REFERENCE.exec(reference)?.[1];
    if (!name) throw new Error(`paletteTokens: "${reference}" is not a var() reference`);
    return name;
}

/**
 * @param {string} name - The custom property.
 * @param {string|null} value - Its value; null removes it.
 */
function write(name, value) {
    if (value) document.documentElement.style.setProperty(name, value);
    else document.documentElement.style.removeProperty(name);
}
