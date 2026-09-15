/**
 * How one comparison population is drawn and named, in one place.
 *
 * Four charts render the delivered Vergleichsgruppen — the EN scatterplot, the
 * item lollipop, and the two style charts — and each used to carry its own
 * private role table plus its own copy of the legend-entry construction. The
 * tables agreed on every value, so the rule "a second Landesschnitt gets shade 1,
 * its ordinal is the label prefix and the glossary key moves to the term half, and
 * an unknown type draws as the catch-all" was written four times and pinned only
 * by an e2e spec, once per chart.
 *
 * Callers keep what is genuinely theirs — the marker-shape function, the symbol
 * size, the legend class names, the hidden-state opacity constant, and (the spider
 * chart) the fill opacity and dash pattern it separates its areas with. What lives
 * here is the part that has to be the same everywhere for the marks to be readable
 * across screens.
 *
 * The colour key is deliberately not a field: it *is* the role, so
 * `theme.chart[role]` is the paint. `tests/unit/common/charts/comparisonRoleColors.test.js`
 * pins that every role resolves to a real colour.
 */

import { GLOSSARY_KEYS } from '../glossary/glossaryKeys.js';
import { buildLegendLabelSegments, resolveAverageRole } from '../domain/comparisonGroupLabels.js';
import { getThemeColors } from '../services/themeService.js';
import * as d3 from 'd3';

/**
 * Step per index for the shade ramp, in d3 `darker()`/`brighter()` units. Small
 * enough that four tracks stay recognisably the same population, large enough to
 * separate adjacent ones. Verified against the grayscale KS theme, where the
 * state base colour is itself a grey.
 */
const SHADE_STEP = 0.8;

/**
 * Relative luminance threshold above which the surface counts as light. Plain
 * sRGB weighting is enough here — the decision is only "darken or brighten".
 */
const LIGHT_SURFACE_LUMINANCE = 0.5;

/**
 * Mark shape and glossary term per role. The three shapes are a vocabulary: a
 * diamond is a Schulschnitt and a square a Landesschnitt on every chart that draws
 * marks, and the catch-all cross must stay distinct from both — two populations
 * under one silhouette is cardinality without identity.
 *
 * `other` carries no glossary key because the glossary has no term for a
 * population this client has never heard of; the group's own payload name is then
 * the whole label. Pointing it at a term it is not — the old `klassenschnitt`
 * fallback — defines a district average as the class's own.
 * @type {Readonly<{[role: string]: {symbol: 'diamond'|'square'|'cross', glossaryKey: string|null}}>}
 */
const SERIES_VISUAL_BY_ROLE = Object.freeze({
    school: Object.freeze({ symbol: 'diamond', glossaryKey: GLOSSARY_KEYS.SCHULSCHNITT }),
    state: Object.freeze({ symbol: 'square', glossaryKey: GLOSSARY_KEYS.LANDESSCHNITT }),
    other: Object.freeze({ symbol: 'cross', glossaryKey: null }),
});

/**
 * @typedef {object} ComparisonSeriesGroup
 * @property {string} id - The value group's own payload key
 * @property {string} type - The payload's own value-group type
 * @property {string} name - Display name (`Schulschnitt`, `Landesschnitt GY`, …)
 * @property {string|null} shortLabel - `L1`/`L2`/… when several groups share this role, `null` when it is the only one
 * @property {number} typeIndex - Position among the groups sharing this role, 0-based
 */

/**
 * The shape and glossary term this group draws with.
 * @param {ComparisonSeriesGroup} group - One delivered comparison population.
 * @returns {{symbol: 'diamond'|'square'|'cross', glossaryKey: string|null}} Shape and glossary term for the role its `type` resolves to.
 */
export function comparisonSeriesVisual(group) {
    return SERIES_VISUAL_BY_ROLE[resolveAverageRole(group.type)];
}

/**
 * The paint for this group's marks: the role's theme colour, stepped once per
 * group sharing that role so several Landesschnitte are told apart by shade as
 * well as by their ordinal tag. `typeIndex` 0 returns the base colour untouched,
 * so a payload delivering a single group of a type renders as it always did.
 * @param {ComparisonSeriesGroup} group - One delivered comparison population.
 * @param {import('../services/themeService.js').ThemeColors} theme - Resolved theme colours.
 * @returns {string} A CSS colour string.
 */
export function comparisonSeriesColor(group, theme) {
    return shadeForIndex(theme.chart[resolveAverageRole(group.type)], group.typeIndex);
}

/**
 * How a marker at `typeIndex` among the groups of one role is painted — a four-step
 * vocabulary of fill mode and centre dot, the non-colour channel that tells `L1…L4`
 * apart at item density where no per-mark tag fits (NW delivers four Landesschnitt
 * tracks): 0 filled, 1 hollow (surface inside, the colour as a heavier outline),
 * 2 hollow with a dot in the colour, 3 filled with a dot in the surface colour. A
 * fifth group cycles back to the first form with the shade step as its only extra cue.
 * The shade stays the secondary cue and the legend colour throughout.
 * @param {string} baseColor - The role's theme colour.
 * @param {number} typeIndex - Position among the groups sharing that role, 0-based.
 * @param {import('../services/themeService.js').ThemeColors} theme - Resolved theme colours.
 * @returns {{fill: string, stroke: string, strokeWidth: number, hollow: boolean, color: string, dotFill: string|null}} The marker paint, the shaded series colour it derives from, and the centre dot's fill (null for none).
 */
export function markerPaintForIndex(baseColor, typeIndex, theme) {
    const color = shadeForIndex(baseColor, typeIndex);
    const mode = typeIndex % 4;
    const hollow = mode === 1 || mode === 2;
    const dotFill = mode === 2 ? color : mode === 3 ? theme.chrome.surface : null;
    return hollow
        ? { fill: theme.chrome.surface, stroke: color, strokeWidth: 2, hollow, color, dotFill }
        : { fill: color, stroke: theme.chrome.chartStroke, strokeWidth: 1, hollow, color, dotFill };
}

/**
 * The paint for this group's marks — see {@link markerPaintForIndex}.
 * @param {ComparisonSeriesGroup} group - One delivered comparison population.
 * @param {import('../services/themeService.js').ThemeColors} theme - Resolved theme colours.
 * @returns {{fill: string, stroke: string, strokeWidth: number, hollow: boolean, color: string, dotFill: string|null}} The marker paint.
 */
export function comparisonSeriesPaint(group, theme) {
    return markerPaintForIndex(theme.chart[resolveAverageRole(group.type)], group.typeIndex, theme);
}

/**
 * The legend-symbol fields for a chart that draws this group as a marker: the
 * swatch is painted exactly like the mark, hollow included.
 * @param {ComparisonSeriesGroup} group - One delivered comparison population.
 * @param {import('../services/themeService.js').ThemeColors} theme - Resolved theme colours.
 * @returns {{color: string, stroke: string, strokeWidth: number, dotFill: string|null}} Fill, outline and centre dot for `renderLegendSymbol`.
 */
export function comparisonMarkerLegendPaint(group, theme) {
    const paint = comparisonSeriesPaint(group, theme);
    return {
        color: paint.fill,
        stroke: paint.stroke,
        strokeWidth: paint.strokeWidth,
        dotFill: paint.dotFill,
    };
}

/**
 * The group's name as text, carrying its ordinal tag when it has one. Used where
 * a mark cannot be labelled in place — tooltip rows and legend rows — so the
 * reader can match `L2` on the plot to the population it names.
 * @param {ComparisonSeriesGroup} group - One delivered comparison population.
 * @returns {string} `L1 = Landesschnitt GY` for a group that needs disambiguating, the bare name otherwise.
 */
export function comparisonSeriesLabel(group) {
    return group.shortLabel ? `${group.shortLabel} = ${group.name}` : group.name;
}

/**
 * The parts of a legend row that every comparison chart builds the same way.
 *
 * Callers add what is theirs: the class name the row is selected by, the symbol
 * (from {@link comparisonSeriesVisual}) where the chart draws marks, its symbol
 * size, and the opacity that reflects the group's visibility.
 *
 * The glossary key moves to the term half of a tagged label rather than sitting on
 * the whole string: the glossary defines *Landesschnitt*, not *L1 = Landesschnitt*.
 * @param {ComparisonSeriesGroup} group - One delivered comparison population.
 * @param {import('../services/themeService.js').ThemeColors} theme - Resolved theme colours.
 * @returns {{label: string, labelSegments: Array<{text: string, glossaryKey: string|null}>|null, glossaryKey: string|null, color: string}} The row's text, its two-part form when it carries an ordinal, the key to link, and its paint.
 */
export function comparisonLegendEntry(group, theme) {
    const { glossaryKey } = comparisonSeriesVisual(group);
    return {
        label: comparisonSeriesLabel(group),
        labelSegments: group.shortLabel
            ? buildLegendLabelSegments(group.shortLabel, group.name, glossaryKey)
            : null,
        glossaryKey: group.shortLabel ? null : glossaryKey,
        color: comparisonSeriesColor(group, theme),
    };
}

/**
 * Derive the mark colour for one group of a type, stepping away from the page
 * surface so the ramp keeps contrast in both light and dark themes.
 *
 * Index 0 returns the base colour untouched, so every dataset delivering a
 * single group of a type renders exactly as it did before this ramp existed.
 * @param {string} baseColor - The type's theme colour (resolved, not a CSS var)
 * @param {number} index - Position within the group's own type, 0-based
 * @returns {string} A CSS colour string
 */
function shadeForIndex(baseColor, index) {
    if (!index) return baseColor;

    const color = d3.color(baseColor);
    if (!color) return baseColor;

    return isLightSurface()
        ? color.darker(index * SHADE_STEP).toString()
        : color.brighter(index * SHADE_STEP).toString();
}

/**
 * Whether the chart surface is light, deciding which way the shade ramp steps.
 * `--state-average-color` has no dark-theme override, so a fixed "always darker"
 * ramp would lose contrast against a dark surface.
 * @returns {boolean} True when the chart surface is light, so the shade ramp should step darker.
 */
function isLightSurface() {
    const surface = d3.color(getThemeColors().chrome.surface);
    if (!surface) return true;

    const { r, g, b } = surface.rgb();
    const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    return luminance >= LIGHT_SURFACE_LUMINANCE;
}
