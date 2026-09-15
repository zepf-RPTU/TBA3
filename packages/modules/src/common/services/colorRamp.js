/**
 * The colour arithmetic behind the competence-level palette: the ramp stops per colour
 * scheme and theme, sampling a ramp for a band count, shading split bands, and the WCAG
 * contrast a shipped colour is measured by. Pure functions over hex literals; the
 * resolver in `competenceLevelColors.js` decides which level gets which sample.
 */

/**
 * The chart surface each colour scheme paints on — the value of `--color-card-background`
 * in `src/styles/foundation/variables.css` for that scheme. Every contrast decision in the
 * palette (ramp validation, the Landesvorgabe gate, sub-band shading direction) is made
 * against this colour, so the two must move together.
 * @type {Readonly<{light: string, dark: string}>}
 */
export const SURFACES = Object.freeze({ light: '#ffffff', dark: '#1e2430' });

/**
 * Interpolation stops per colour scheme and theme.
 *
 * `light.default` is the diverging semantic-heat ramp (warm below target, green at
 * target, cool above); `light.colorblind` is Okabe-Ito; `light.grayscale` is a linear
 * ramp whose five samples are the five historical grays.
 *
 * The `dark` set is **its own validated set of steps, not a runtime inversion**: each
 * chromatic stop is the light stop lifted in OKLCH lightness with hue and chroma kept,
 * then measured with the dataviz validator (`--mode dark --surface "#1e2430"`) until
 * every stop clears 3:1 on the dark surface and sits inside the dark lightness band,
 * with band separation no worse than the light ramp's. Okabe-Ito keeps its
 * published hues and only lifts the one blue that fell to 3.0:1. The grayscale ramp is
 * re-lit for a dark ground — dim to bright with rising level — and these five are also
 * the dark `--gray-1…5` in `foundation/competence-levels.css`.
 */
export const RAMP_STOPS = Object.freeze({
    light: Object.freeze({
        default: Object.freeze(['#d64550', '#c67f14', '#2f9e44', '#0c9ea3', '#3b5bd0']),
        grayscale: Object.freeze(['#cccccc', '#a6a6a6', '#808080', '#595959', '#333333']),
        colorblind: Object.freeze(['#d55e00', '#e69f00', '#009e73', '#56b4e9', '#0072b2']),
    }),
    dark: Object.freeze({
        default: Object.freeze(['#e8565f', '#c47d10', '#3ca84e', '#19a2a7', '#5f85fe']),
        grayscale: Object.freeze(['#5c6270', '#7d8390', '#9fa4ae', '#c2c5cc', '#e6e8ec']),
        colorblind: Object.freeze(['#d55e00', '#e69f00', '#009e73', '#56b4e9', '#1a7fc0']),
    }),
});

/**
 * The stops for a theme on a colour scheme; an unknown theme falls back to `default`.
 * @param {string} themeId - KS theme id (`default`, `grayscale`, `colorblind`).
 * @param {'light'|'dark'} scheme - The colour scheme in effect.
 * @returns {ReadonlyArray<string>} The authored stops.
 */
export function getRampStops(themeId, scheme) {
    const stops = RAMP_STOPS[scheme] ?? RAMP_STOPS.light;
    return stops[themeId] ?? stops.default;
}

/**
 * How far each step down a split band moves its color, as a blend fraction toward the
 * surface's opposite pole. Sized to separate two adjacent segments of the same band
 * while still reading as one family.
 *
 * Stepping *away* from the surface is deliberate: it can only *raise* contrast against
 * it, so the ≥3:1 floor the ramps are validated against survives. On white that means
 * darkening (lightening `#d64550` by this much lands at ≈2.8:1 and would break it); on
 * the dark surface, lightening.
 */
const SUB_BAND_STEP = 0.28;

/**
 * Separate the levels sharing one band by lightness. The **highest** sub-band keeps the
 * band's color untouched and each step down moves by `SUB_BAND_STEP` away from the
 * surface, so an unsplit band — which is every band of every scale except SL's Roman
 * `Ia`/`Ib` — comes back byte-for-byte as the ramp produced it.
 * @param {string} bandBase - The band's color from the sampled ramp
 * @param {{subBandCount: number, subBandIndex: number}} entry - The level whose sub-band position sets the shading.
 * @param {'light'|'dark'} [scheme='light'] - The colour scheme, which decides the shading direction.
 * @returns {string} The band color, shaded one step per position below the top sub-band.
 */
export function shadeSubBand(bandBase, entry, scheme = 'light') {
    if (entry.subBandCount <= 1) return bandBase;

    const stepsDown = entry.subBandCount - 1 - entry.subBandIndex;
    const pole = scheme === 'dark' ? '#ffffff' : '#000000';
    return mixHex(bandBase, pole, stepsDown * SUB_BAND_STEP);
}

/**
 * Sample `count` evenly spaced colors from a stop list. When `count` equals the number
 * of stops every sample lands exactly on a stop and is returned unchanged.
 * @param {ReadonlyArray<string>} stops - The ramp to sample.
 * @param {number} count - How many colors to draw, one per band.
 * @returns {string[]} Evenly spaced samples; exact stop hits are returned verbatim.
 */
export function sampleRamp(stops, count) {
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
 * Linear sRGB blend of two hex colors. `fraction === 0` returns `from` verbatim so
 * exact-hit samples keep their authored literal.
 * @param {string} from - Colour returned verbatim at `fraction` 0.
 * @param {string} to - Colour returned verbatim at `fraction` 1.
 * @param {number} fraction - 0…1
 * @returns {string} The blended hex literal.
 */
function mixHex(from, to, fraction) {
    if (fraction <= 0) return from;
    if (fraction >= 1) return to;

    const a = parseHex(from);
    const b = parseHex(to);
    const channel = (i) => Math.round(a[i] + (b[i] - a[i]) * fraction);

    return (
        '#' +
        [channel(0), channel(1), channel(2)]
            .map((value) => value.toString(16).padStart(2, '0'))
            .join('')
    );
}

/**
 * WCAG contrast ratio of a color against a chart surface.
 *
 * Alpha is composited against that surface first: `HEX_COLOR_PATTERN` accepts
 * `#rrggbbaa`, and `#00000000` measured on its RGB alone scores 21:1 on white while
 * painting nothing at all — the exact "segment is not light, it is absent" case
 * `MIN_SURFACE_CONTRAST` exists to reject.
 *
 * Exported so the palette's own tests measure contrast the same way the palette does,
 * rather than carrying a second copy that could drift from it.
 * @param {string} hex - `#rgb`, `#rrggbb` or `#rrggbbaa`
 * @param {string} [surface=SURFACES.light] - Opaque `#rrggbb` the color is painted on.
 * @returns {number} 1 (indistinguishable from the surface) … 21
 */
export function contrastWithSurface(hex, surface = SURFACES.light) {
    const alpha = parseAlpha(hex);
    const ground = parseHex(surface);
    const composited = parseHex(hex).map((value, i) => value * alpha + ground[i] * (1 - alpha));
    const [lighter, darker] = [relativeLuminance(composited), relativeLuminance(ground)].sort(
        (a, b) => b - a,
    );

    return (lighter + 0.05) / (darker + 0.05);
}

/** Contrast a white label must clear on its fill before the ink switches to dark. */
const WHITE_INK_FLOOR = 3;

/** The dark label ink, the near-black the SVG text chips (`addSvgTextChip`) use. */
const DARK_INK = '#111827';

/**
 * The ink for a label sitting *on* a fill: white for as long as it clears the 3:1 floor
 * on that fill, otherwise dark. Not "the better of the two" — that would repaint every
 * mid-lightness band whose white label already reads — but the floor under which white
 * stops reading: the light end of the grayscale ramps, Okabe-Ito's amber and sky blue,
 * and most of the re-lit dark grayscale ramp. Every fill a band label sits on is
 * stamped from the palette, so this is decided once per band, not per scheme.
 * @param {string} fill - The fill the label is drawn on.
 * @returns {string} `#ffffff` or the dark ink.
 */
export function inkOn(fill) {
    return contrastWithSurface('#ffffff', fill) >= WHITE_INK_FLOOR ? '#ffffff' : DARK_INK;
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

/**
 * Opacity of a hex literal, 0…1. Anything without an alpha pair is fully opaque.
 * @param {string} hex - A hex color literal, with or without an alpha pair.
 * @returns {number} Alpha 0…1; 1 for any literal without an alpha pair.
 */
function parseAlpha(hex) {
    const digits = hex.slice(1);
    return digits.length === 8 ? parseInt(digits.slice(6, 8), 16) / 255 : 1;
}

/**
 * @param {string} hex - `#rgb`, `#rrggbb` or `#rrggbbaa`
 * @returns {[number, number, number]} Red, green and blue channels, 0…255.
 */
function parseHex(hex) {
    let digits = hex.slice(1);
    if (digits.length === 3) {
        digits = digits
            .split('')
            .map((d) => d + d)
            .join('');
    }
    return [
        parseInt(digits.slice(0, 2), 16),
        parseInt(digits.slice(2, 4), 16),
        parseInt(digits.slice(4, 6), 16),
    ];
}
