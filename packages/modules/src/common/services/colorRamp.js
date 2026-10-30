/**
 * The colour arithmetic behind the competence-level palette: the ramp stops per colour
 * scheme and theme, the colours of a scale's levels, the WCAG contrast a shipped colour
 * is measured by, and the ink a label takes on a fill. The
 * resolver in `competenceLevelColors.js` decides which level gets which sample.
 */

import { color as parseColor, rgb as toRgb } from 'd3-color';
import { interpolateLab } from 'd3-interpolate';

/**
 * The chart surface each colour scheme paints on: the value of `--color-card-background`
 * in `packages/module-base/src/styles/tokens.css` for that scheme, which it must follow. Every
 * contrast decision in the palette (ramp validation, the Landesvorgabe gate) is made
 * against this colour.
 * @type {Readonly<{light: string, dark: string}>}
 */
export const SURFACES = Object.freeze({ light: '#ffffff', dark: '#1e2430' });

/** The theme whose stops are the diverging, centred ramp; every other theme is sampled. */
export const DEFAULT_THEME_ID = 'default';

/**
 * The default ramp's full path per colour scheme, warm end to cool end: a diverging ramp
 * with a warm arm below the centre (amber, then reds), a green centre, and a cool arm
 * above it (teal, then blues). Each arm steps about 0.09 (light) / 0.085 (dark) in
 * OKLab lightness away from the centre, so the levels are ordered by lightness as well as
 * by hue. The centre is the stop nearest the surface (the lightest stop on white, the
 * darkest on the dark surface), and the arms move away from the surface towards the ends.
 *
 * These nine stops are the path `tools/ramp-check.mjs` gates: in-arm ΔL ≥ 0.06, ≥ 3:1 on
 * the surface and adjacent protan/deutan/tritan ΔE ≥ 8. Every scale with at most four
 * levels on either side of its centre paints a contiguous window of that path, so the
 * gate covers it. Pairs that are not neighbours are only reported: on dark both arms
 * lighten towards near-white, so a scale reaching three or more levels out on both sides
 * paints its two ends alike and leaves them to their labels.
 */
const DEFAULT_PATHS = Object.freeze({
    light: Object.freeze([
        '#54030e',
        '#7a0036',
        '#a8022a',
        '#9d6402',
        '#08a759',
        '#098380',
        '#164dc2',
        '#26368a',
        '#252154',
    ]),
    dark: Object.freeze([
        '#fcf4f9',
        '#facecd',
        '#fea39b',
        '#c5980a',
        '#099f70',
        '#1fb2c9',
        '#a0beff',
        '#cbdafc',
        '#f0f7fc',
    ]),
});

/**
 * `default` is the inner five stops of `DEFAULT_PATHS`.
 *
 * `grayscale` is a linear ramp whose five samples are the `--gray-1…5` of
 * `competence-levels.css`; on white its light end clears 3:1. It is sequential, not
 * centred: sampled to the scale's level count (`sampleRamp`), it steps ≥ 0.06 in OKLab
 * lightness up to seven levels.
 *
 * The `dark` set is its own validated set of steps, not a runtime inversion. The
 * grayscale ramp runs dim to bright with rising level.
 */
const RAMP_STOPS = Object.freeze({
    light: Object.freeze({
        default: Object.freeze(DEFAULT_PATHS.light.slice(2, -2)),
        grayscale: Object.freeze(['#909090', '#747474', '#595959', '#3f3f3f', '#272727']),
    }),
    dark: Object.freeze({
        default: Object.freeze(DEFAULT_PATHS.dark.slice(2, -2)),
        grayscale: Object.freeze(['#5c6270', '#7d8390', '#9fa4ae', '#c2c5cc', '#e6e8ec']),
    }),
});

/**
 * The default ramp's full path on a colour scheme, warm end to cool end.
 * @param {'light'|'dark'} scheme
 * @returns {ReadonlyArray<string>} The stops, the centre in the middle.
 */
function getDefaultRampPath(scheme) {
    return DEFAULT_PATHS[scheme] ?? DEFAULT_PATHS.light;
}

/**
 * The stops for a theme on a colour scheme; an unknown theme falls back to `default`.
 * @param {string} themeId - competence-level theme id (`default`, `grayscale`).
 * @param {'light'|'dark'} scheme
 * @returns {ReadonlyArray<string>} The authored stops.
 */
export function getRampStops(themeId, scheme) {
    /** @type {Readonly<{[themeId: string]: ReadonlyArray<string>, default: ReadonlyArray<string>}>} */
    const stops = RAMP_STOPS[scheme] ?? RAMP_STOPS.light;
    return stops[themeId] ?? stops.default;
}

/** The ramp stops the rating bands take, low → excellent: every stop but the centre. */
const RATING_STOP_INDEXES = Object.freeze([0, 1, 3, 4]);

/**
 * The rating bands' colours for a theme on a colour scheme. A rating has no neutral
 * band (its split at 3.0 falls between medium and good), so it takes the ramp's arms:
 * the same hues in the same low→high order as the competence-level bands it is drawn beside.
 * @param {string} themeId - competence-level theme id; an unknown one falls back to `default`.
 * @param {'light'|'dark'} scheme
 * @returns {string[]} Four colours, low → excellent.
 */
export function getRatingStops(themeId, scheme) {
    const stops = getRampStops(themeId, scheme);
    return RATING_STOP_INDEXES.map((index) => stops[index]);
}

/**
 * The colours of one scale's levels, low to high.
 *
 * Under the default ramp (and any theme falling back to it) the scale is centred on its
 * `medium` level, or on its middle level when it tags none, and each level takes the path
 * stop at its distance from the centre: one level below is the first warm stop, whatever
 * the ladder's length, as long as that arm has at most four levels. An arm longer than
 * the path's four stops is sampled along that arm instead, which no gate covers. The
 * grayscale theme is sampled to the level count.
 * @param {string} themeId - competence-level theme id; an unknown one falls back to `default`.
 * @param {'light'|'dark'} scheme
 * @param {number} levelCount
 * @param {number|null} mediumIndex - Position of its lowest `medium` level, or null.
 * @returns {string[]} One colour per level.
 */
export function getLevelColors(themeId, scheme, levelCount, mediumIndex) {
    const stops = getRampStops(themeId, scheme);
    if (stops !== getRampStops(DEFAULT_THEME_ID, scheme)) return sampleRamp(stops, levelCount);

    const path = getDefaultRampPath(scheme);
    const pathCentre = (path.length - 1) / 2;
    const centre = mediumIndex ?? Math.floor(levelCount / 2);
    const below = armColors(path.slice(0, pathCentre + 1).reverse(), centre);
    const above = armColors(path.slice(pathCentre), levelCount - 1 - centre);
    return [...below.reverse(), path[pathCentre], ...above];
}

/**
 * The first `length` colours of an arm, outwards from the centre.
 * @param {string[]} arm - The centre, then the arm's stops outwards.
 * @param {number} length - How many levels sit on this side of the centre.
 * @returns {string[]} `length` colours, nearest the centre first.
 */
function armColors(arm, length) {
    if (length < arm.length) return arm.slice(1, length + 1);
    return sampleRamp(arm, length + 1).slice(1);
}

/**
 * Sample `count` evenly spaced colors from a stop list, interpolating in CIELAB between
 * neighbouring stops so a sample sits perceptually between them. When `count` equals
 * the number of stops every sample lands exactly on a stop and is returned unchanged.
 * @param {ReadonlyArray<string>} stops
 * @param {number} count
 * @returns {string[]}
 */
function sampleRamp(stops, count) {
    if (count <= 0) return [];
    if (count === 1) return [stops[stops.length - 1]];

    const lastStop = stops.length - 1;
    const samples = [];
    for (let i = 0; i < count; i++) {
        const position = (i / (count - 1)) * lastStop;
        const lower = Math.floor(position);
        samples.push(mixHex(stops[lower], stops[Math.min(lower + 1, lastStop)], position - lower));
    }
    return samples;
}

/**
 * CIELAB blend of two hex colors. At `fraction` 0 or 1 the end is returned verbatim, so
 * exact-hit samples keep their authored literal.
 * @param {string} from
 * @param {string} to
 * @param {number} fraction - 0…1
 * @returns {string} A hex literal.
 */
function mixHex(from, to, fraction) {
    if (fraction <= 0) return from;
    if (fraction >= 1) return to;
    return toRgb(interpolateLab(from, to)(fraction)).formatHex();
}

/**
 * WCAG contrast ratio of a color against a chart surface.
 *
 * Alpha is composited against that surface first: `HEX_COLOR_PATTERN` accepts
 * `#rrggbbaa`, and `#00000000` measured on its RGB alone scores 21:1 on white while
 * painting nothing, the case `MIN_SURFACE_CONTRAST` rejects.
 * @param {string} hex - `#rgb`, `#rrggbb` or `#rrggbbaa`
 * @param {string} surface - Opaque `#rrggbb` the color is painted on.
 * @returns {number} 1 (indistinguishable from the surface) … 21
 */
export function contrastWithSurface(hex, surface) {
    const color = toRgb(hex);
    const ground = rgbChannels(toRgb(surface));
    const composited = rgbChannels(color).map(
        (value, i) => value * color.opacity + ground[i] * (1 - color.opacity),
    );
    return contrastRatio(composited, ground);
}

const DARK_INK = '#111827';

/**
 * The ink for a label sitting on a fill: white or `DARK_INK`, whichever contrasts
 * more with the fill as it is seen, composited at `opacity` over the scheme's surface,
 * so a translucent fill on the dark surface is judged dark.
 * @param {string} fill - Any CSS colour d3 parses (`#hex`, `rgb()`, `rgba()`, a name);
 *   an unparsable one is treated as painting nothing, so the ink is judged on the surface.
 * @param {object} [options]
 * @param {number} [options.opacity=1] - The fill's opacity, on top of any alpha of its own.
 * @param {'light'|'dark'} [options.scheme='light'] - The colour scheme whose surface shows through.
 * @returns {string} `#ffffff` or `DARK_INK`.
 */
export function inkOn(fill, { opacity = 1, scheme = 'light' } = {}) {
    const ground = rgbChannels(toRgb(SURFACES[scheme]));
    const parsed = parseColor(fill)?.rgb();
    const alpha = parsed ? parsed.opacity * opacity : 0;
    const seen = parsed
        ? rgbChannels(parsed).map((value, i) => value * alpha + ground[i] * (1 - alpha))
        : ground;
    const onWhite = contrastRatio(seen, [255, 255, 255]);
    return onWhite >= contrastRatio(seen, rgbChannels(toRgb(DARK_INK))) ? '#ffffff' : DARK_INK;
}

/**
 * @param {import('d3-color').RGBColor} color
 * @returns {number[]} Its red, green and blue channels, 0…255. d3 parses a fully
 *   transparent colour with no channels (NaN); they count as 0, since nothing of them is seen.
 */
function rgbChannels(color) {
    return [color.r, color.g, color.b].map((value) => (Number.isNaN(value) ? 0 : value));
}

/**
 * @param {number[]} a - Red, green and blue channels, 0…255.
 * @param {number[]} b - As `a`.
 * @returns {number} WCAG contrast ratio, 1…21.
 */
function contrastRatio(a, b) {
    const [lighter, darker] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
    return (lighter + 0.05) / (darker + 0.05);
}

/**
 * @param {number[]} rgb - Red, green and blue channels, 0…255.
 * @returns {number} WCAG relative luminance, 0…1.
 */
function relativeLuminance(rgb) {
    const channels = rgb.map((value) => {
        const scaled = value / 255;
        return scaled <= 0.03928 ? scaled / 12.92 : ((scaled + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}
