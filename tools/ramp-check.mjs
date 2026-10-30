/**
 * The competence-level ramp gates, measured rather than eyeballed.
 *
 *   node tools/ramp-check.mjs                                  # the shipped ramps
 *   node tools/ramp-check.mjs --scheme dark --stops "#a,#b,…"  # any odd-length path, e.g. an old ramp
 *
 * Prints one row per check and exits 1 when a gate fails. The gates follow the dataviz
 * method for an ordered ramp:
 * - the default ramp's nine-stop path (a nine-level scale centred on its middle), per colour scheme: each arm
 *   steps at least 0.06 in OKLab lightness away from the centre (and from the surface),
 *   every stop clears 3:1 on the card surface, and adjacent stops stay ΔE ≥ 8 apart under
 *   protan, deutan and tritan simulation. Every scale with at most four levels on either
 *   side of its centre paints a contiguous window of this path, so the gate covers every
 *   such scale at any level count and centre;
 * - the SL rating bands (`--sl-rating-*`, the ramp's arms from `getRatingStops`): 3:1
 *   and the same CVD gate;
 * - the grayscale ramp sampled to three to seven levels, per colour scheme: each level
 *   steps at least 0.06 in OKLab lightness from the one below, in one direction;
 * - the light grayscale ramp's light end: 3:1.
 * Everything else — normal-vision ΔE, the closest non-neighbouring pair of the default
 * path under each deficiency, and the dark grayscale ramp's light end — is reported, not
 * gated: there the `Level · share` segment labels are the secondary encoding. On dark both
 * arms lighten towards near-white, so a scale reaching three or more levels out on both
 * sides paints its two ends alike; no hue-coherent path avoids that.
 *
 * ΔE is the Euclidean distance in OKLab ×100. The CVD simulation is Machado, Oliveira &
 * Fernandes (2009) at severity 1.0, applied in linear sRGB — the model the CVD
 * thresholds are calibrated to. Contrast is WCAG 2, measured by the palette's own
 * `contrastWithSurface`, against the palette's `SURFACES`. That the stylesheets declare
 * the same surfaces is pinned by `colorRampCssParity.test.js`.
 */
import { parseArgs } from 'node:util';
import {
    SURFACES,
    contrastWithSurface,
    getLevelColors,
    getRampStops,
    getRatingStops,
} from '../packages/modules/src/common/services/colorRamp.js';

/** @typedef {'light'|'dark'} Scheme */
/** @typedef {'protan'|'deutan'|'tritan'} Deficiency */
/**
 * A colour as `#rrggbb`.
 * @typedef {string} HexColor
 */

/**
 * One measured check. `gate` is null for a report-only row.
 * @typedef {object} RampCheckRow
 * @property {string} ramp - What was measured, e.g. `default light`.
 * @property {string} check - The measure, e.g. `min contrast`.
 * @property {number} value
 * @property {number|null} gate - The minimum the value must reach, or null when only reported.
 * @property {boolean} pass - Whether the value reaches the gate (true for a report-only row).
 */

/** In-arm OKLab lightness step a band must keep from its neighbour towards the centre. */
const MIN_ARM_STEP = 0.06;
/** WCAG contrast every band must clear against the card surface. */
const MIN_SURFACE_CONTRAST = 3;
/** OKLab ΔE ×100 adjacent bands must keep under each simulated deficiency. */
const MIN_CVD_DELTA_E = 8;
/** The level counts the grayscale ramp is gated at. */
export const GRAYSCALE_COUNTS = Object.freeze([3, 4, 5, 6, 7]);
/** The default ramp's full path: a nine-level scale centred on its middle level. */
const FULL_PATH_LEVELS = 9;
const FULL_PATH_CENTRE = (FULL_PATH_LEVELS - 1) / 2;

/**
 * Machado, Oliveira & Fernandes (2009), severity 1.0, on linear sRGB.
 * @type {Readonly<Record<Deficiency, number[][]>>}
 */
const MACHADO = Object.freeze({
    protan: [
        [0.152286, 1.052583, -0.204868],
        [0.114503, 0.786281, 0.099216],
        [-0.003882, -0.048116, 1.051998],
    ],
    deutan: [
        [0.367322, 0.860646, -0.227968],
        [0.280085, 0.672501, 0.047413],
        [-0.01182, 0.04294, 0.968881],
    ],
    tritan: [
        [1.255528, -0.076749, -0.178779],
        [-0.078411, 0.930809, 0.147602],
        [0.004733, 0.691367, 0.3039],
    ],
});

/** @type {Deficiency[]} */
const DEFICIENCIES = ['protan', 'deutan', 'tritan'];

/**
 * @param {HexColor} hex
 * @returns {number[]} Linear sRGB channels, 0…1.
 */
function linearRgb(hex) {
    return [1, 3, 5].map((start) => {
        const value = Number.parseInt(hex.slice(start, start + 2), 16) / 255;
        return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    });
}

/**
 * Björn Ottosson's OKLab from linear sRGB.
 * @param {number[]} rgb - Linear sRGB channels, 0…1.
 * @returns {number[]} OKLab L, a, b.
 */
function oklab([r, g, b]) {
    const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
    const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
    const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
    return [
        0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
        1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
        0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
    ];
}

/**
 * @param {number[]} rgb - Linear sRGB channels, 0…1.
 * @param {Deficiency} deficiency - The colour vision deficiency to simulate.
 * @returns {number[]} The channels as that dichromat sees them, clamped to 0…1.
 */
function simulate(rgb, deficiency) {
    return MACHADO[deficiency].map((coefficients) =>
        Math.min(
            1,
            Math.max(
                0,
                coefficients[0] * rgb[0] + coefficients[1] * rgb[1] + coefficients[2] * rgb[2],
            ),
        ),
    );
}

/**
 * @param {HexColor} a
 * @param {HexColor} b
 * @param {Deficiency} [deficiency] - Simulate this deficiency first; normal vision without.
 * @returns {number} OKLab ΔE ×100.
 */
function deltaE(a, b, deficiency) {
    const [first, second] = [a, b].map((hex) => {
        const rgb = linearRgb(hex);
        return oklab(deficiency ? simulate(rgb, deficiency) : rgb);
    });
    return 100 * Math.hypot(...first.map((value, i) => value - second[i]));
}

/**
 * @param {HexColor} hex
 * @returns {number} OKLab lightness, 0…1.
 */
function lightness(hex) {
    return oklab(linearRgb(hex))[0];
}

/**
 * @param {string[]} colors - Bands in order.
 * @param {Deficiency} [deficiency] - Simulated deficiency; normal vision without.
 * @returns {number} The smallest ΔE between two neighbouring bands.
 */
function minAdjacentDeltaE(colors, deficiency) {
    return Math.min(...colors.slice(1).map((color, i) => deltaE(colors[i], color, deficiency)));
}

/**
 * @param {string[]} colors - Bands in order.
 * @param {Deficiency} deficiency - Simulated deficiency.
 * @returns {number} The smallest ΔE between two bands that are not neighbours.
 */
function minFarDeltaE(colors, deficiency) {
    return Math.min(
        ...colors.flatMap((color, i) =>
            colors.slice(i + 2).map((other) => deltaE(color, other, deficiency)),
        ),
    );
}

/**
 * @param {string[]} colors
 * @param {string} surface - The card surface.
 * @returns {number} The lowest contrast of any band against the surface.
 */
function minContrast(colors, surface) {
    return Math.min(...colors.map((color) => contrastWithSurface(color, surface)));
}

/**
 * The smallest lightness step inside the two arms of an odd-length diverging path,
 * counted positive when it moves away from the surface (darker on light, lighter on dark).
 * @param {readonly string[]} stops - The path, the centre in the middle.
 * @param {Scheme} scheme - Which way "away from the surface" is.
 * @returns {number} The smallest step, negative when an arm turns back.
 */
function minArmStep(stops, scheme) {
    const away = scheme === 'light' ? -1 : 1;
    const levels = stops.map(lightness);
    const centre = (stops.length - 1) / 2;
    // Each stop against its neighbour towards the centre.
    const steps = levels.flatMap((level, i) =>
        i === centre ? [] : [away * (level - levels[i < centre ? i + 1 : i - 1])],
    );
    return Math.min(...steps);
}

/**
 * The smallest lightness step between neighbours of a sequential ramp, counted positive
 * in the direction the ramp runs from its first step to its second.
 * @param {readonly string[]} stops - The ramp, low level first.
 * @returns {number} The smallest step, negative when the ramp turns back.
 */
function minSequentialStep(stops) {
    const levels = stops.map(lightness);
    const direction = Math.sign(levels[1] - levels[0]);
    return Math.min(...levels.slice(1).map((level, i) => direction * (level - levels[i])));
}

/**
 * @param {string} ramp
 * @param {string} check
 * @param {number} value
 * @param {number|null} [gate] - Minimum, or null to only report.
 * @returns {RampCheckRow}
 */
function row(ramp, check, value, gate = null) {
    return { ramp, check, value, gate, pass: gate === null || value >= gate };
}

/**
 * The gated measures of a set of bands: contrast and adjacent CVD separation.
 * @param {string} ramp
 * @param {string[]} colors - Bands in order.
 * @param {string} surface - The card surface.
 * @returns {RampCheckRow[]} Contrast, CVD per deficiency and normal vision.
 */
function bandRows(ramp, colors, surface) {
    return [
        row(ramp, 'min contrast', minContrast(colors, surface), MIN_SURFACE_CONTRAST),
        ...DEFICIENCIES.map((deficiency) =>
            row(
                ramp,
                `adjacent ΔE ${deficiency}`,
                minAdjacentDeltaE(colors, deficiency),
                MIN_CVD_DELTA_E,
            ),
        ),
        row(ramp, 'adjacent ΔE normal', minAdjacentDeltaE(colors)),
    ];
}

/**
 * Every gate for an odd-length diverging path, plus normal vision and the closest
 * non-neighbouring pair per deficiency.
 * @param {readonly string[]} stops - The path, the centre in the middle.
 * @param {Scheme} scheme - The colour scheme the ramp is painted on.
 * @param {string} surface - That scheme's card surface.
 * @param {string} [label]
 * @returns {RampCheckRow[]}
 */
export function measureRamp(stops, scheme, surface, label = `default ${scheme}`) {
    return [
        row(label, 'in-arm ΔL', minArmStep(stops, scheme), MIN_ARM_STEP),
        ...bandRows(label, [...stops], surface),
        ...DEFICIENCIES.map((deficiency) =>
            row(label, `far-pair ΔE ${deficiency}`, minFarDeltaE([...stops], deficiency)),
        ),
    ];
}

/**
 * Measure the shipped ramps: the gates, then the report-only rows.
 * @returns {{rows: RampCheckRow[], ok: boolean}} Every row, and whether every gate passed.
 */
export function checkShippedRamps() {
    /** @type {RampCheckRow[]} */
    const rows = [];
    for (const scheme of /** @type {Scheme[]} */ (['light', 'dark'])) {
        const surface = SURFACES[scheme];
        rows.push(
            ...measureRamp(
                getLevelColors('default', scheme, FULL_PATH_LEVELS, FULL_PATH_CENTRE),
                scheme,
                surface,
            ),
        );
        rows.push(...bandRows(`sl-rating ${scheme}`, getRatingStops('default', scheme), surface));
        for (const count of GRAYSCALE_COUNTS) {
            const grays = getLevelColors('grayscale', scheme, count, null);
            rows.push(
                row(
                    `grayscale ${scheme} ×${count}`,
                    'step ΔL',
                    minSequentialStep(grays),
                    MIN_ARM_STEP,
                ),
            );
        }
        const grays = getRampStops('grayscale', scheme);
        rows.push(
            row(
                `grayscale ${scheme}`,
                'light-end contrast',
                contrastWithSurface(grays[0], surface),
                scheme === 'light' ? MIN_SURFACE_CONTRAST : null,
            ),
        );
    }
    return { rows, ok: rows.every((entry) => entry.pass) };
}

/**
 * @param {RampCheckRow[]} rows
 * @returns {string} A fixed-width table.
 */
function formatTable(rows) {
    const lines = rows.map((entry) => {
        const value = entry.check.includes('ΔL') ? entry.value.toFixed(3) : entry.value.toFixed(2);
        const gate = entry.gate === null ? '' : `≥ ${entry.gate}`;
        const result = entry.gate === null ? 'report' : entry.pass ? 'PASS' : 'FAIL';
        return `${entry.ramp.padEnd(22)} ${entry.check.padEnd(20)} ${value.padStart(7)}  ${gate.padEnd(6)} ${result}`;
    });
    return lines.join('\n');
}

if (import.meta.main) {
    const { values } = parseArgs({
        options: { stops: { type: 'string' }, scheme: { type: 'string', default: 'light' } },
    });
    if (values.scheme !== 'light' && values.scheme !== 'dark') {
        throw new Error(`--scheme must be light or dark, got ${values.scheme}`);
    }
    const scheme = values.scheme;
    let result;
    if (values.stops) {
        const stops = values.stops.split(',').map((stop) => stop.trim());
        // The arms are measured outwards from a single centre stop.
        if (stops.length % 2 === 0) {
            throw new Error(`--stops needs an odd-length path, got ${stops.length} stops`);
        }
        const rows = measureRamp(stops, scheme, SURFACES[scheme], `stops ${scheme}`);
        result = { rows, ok: rows.every((entry) => entry.pass) };
    } else {
        result = checkShippedRamps();
    }
    console.log(formatTable(result.rows));
    console.log(result.ok ? '\nAll gates pass.' : '\nA gate failed.');
    process.exitCode = result.ok ? 0 : 1;
}
