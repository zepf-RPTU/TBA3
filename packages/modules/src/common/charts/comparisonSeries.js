/**
 * How one comparison population (a delivered Vergleichsgruppe) is drawn and named: the
 * role table and the legend-entry construction every chart shares. Callers keep the
 * symbol size, the legend class names and their hidden-state opacity.
 *
 * A group has no colour field: the role's token is the paint. Every colour here is a
 * `var()` (see `paletteTokens.js`), so marks follow a theme or scheme switch without a
 * redraw.
 */

import {
    averageRoleGlossaryKey,
    buildLegendLabelSegments,
    resolveAverageRole,
} from '../domain/comparisonGroupLabels.js';
import { shadeToken } from '../services/paletteTokens.js';
import { AVERAGE_MARKER } from './chartDefaults.js';
import { formatPercent, isFiniteNumber } from '../utils/numberFormat.js';

/**
 * Step per index for the shade ramp, in d3 `darker()`/`brighter()` units. Small
 * enough that four tracks stay recognisably the same population, large enough to
 * separate adjacent ones. Verified against the grayscale competence-level theme, where the
 * state base colour is itself a grey.
 */
const SHADE_STEP = 0.8;

/** @type {Readonly<{[role: string]: string}>} */
const ROLE_COLORS = Object.freeze({
    school: 'var(--school-average-color)',
    state: 'var(--state-average-color)',
    other: 'var(--other-average-color)',
});

/**
 * Mark shape per role, the same on every chart that draws marks; the catch-all cross
 * must stay distinct from the other two.
 * @type {Readonly<{[role: string]: 'diamond'|'square'|'cross'}>}
 */
const SERIES_SYMBOL_BY_ROLE = Object.freeze({
    school: 'diamond',
    state: 'square',
    other: 'cross',
});

/**
 * @typedef {object} ComparisonSeriesGroup
 * @property {string} id - The value group's own payload key
 * @property {string} type - The payload's own value-group type
 * @property {string} name - Display name (`Schulschnitt`, `Landesschnitt GY`, …)
 * @property {string|null} shortLabel - `L1`/`L2`/… when several groups share this role, `null` when it is the only one
 * @property {number} roleIndex - Position among the groups sharing this role, 0-based
 */

/**
 * The shape and glossary term this group draws with.
 * @param {ComparisonSeriesGroup} group
 * @returns {{symbol: 'diamond'|'square'|'cross', glossaryKey: string|null}}
 */
export function comparisonSeriesVisual(group) {
    return {
        symbol: SERIES_SYMBOL_BY_ROLE[resolveAverageRole(group.type)],
        glossaryKey: averageRoleGlossaryKey(group.type),
    };
}

/**
 * The colour of this group's marks: the role's theme colour, stepped once per group
 * sharing that role (see `shadeForIndex`), so several Landesschnitte are told apart by
 * shade as well as by their ordinal tag.
 * @param {ComparisonSeriesGroup} group
 * @returns {string} The colour's `var()`.
 */
export function comparisonSeriesColor(group) {
    return shadeForIndex(ROLE_COLORS[resolveAverageRole(group.type)], group.roleIndex);
}

/**
 * How a marker at `roleIndex` among the groups of one role is painted: four forms of
 * fill mode and centre dot, the non-colour channel that tells `L1…L4` apart at item
 * density where no per-mark tag fits (a state export may ship four Landesschnitt
 * tracks): 0 filled, 1 hollow (surface inside, the colour as a heavier outline),
 * 2 hollow with a dot in the colour, 3 filled with a dot in the surface colour. A
 * fifth group cycles back to the first form, told apart by its shade alone.
 * @param {string} baseColor - The role's theme colour, a `var()`.
 * @param {number} roleIndex - Position among the groups sharing that role, 0-based.
 * @returns {{fill: string, stroke: string, strokeWidth: number, hollow: boolean, dotFill: string|null}} `dotFill` is null for no centre dot.
 */
export function markerPaintForIndex(baseColor, roleIndex) {
    const color = shadeForIndex(baseColor, roleIndex);
    const surface = 'var(--color-card-background)';
    const mode = roleIndex % 4;
    const hollow = mode === 1 || mode === 2;
    const dotFill = mode === 2 ? color : mode === 3 ? surface : null;
    const fill = hollow ? surface : color;
    const stroke = hollow ? color : surface;
    const strokeWidth = AVERAGE_MARKER.strokeWidthPx[hollow ? 'hollow' : 'filled'];
    return { fill, stroke, strokeWidth, hollow, dotFill };
}

/**
 * The paint for this group's marks — see {@link markerPaintForIndex}.
 * @param {Pick<ComparisonSeriesGroup, 'type'|'roleIndex'>} group
 * @returns {{fill: string, stroke: string, strokeWidth: number, hollow: boolean, dotFill: string|null}}
 */
export function comparisonSeriesPaint(group) {
    return markerPaintForIndex(ROLE_COLORS[resolveAverageRole(group.type)], group.roleIndex);
}

/**
 * The legend entry of a chart that draws this group as a marker: the swatch is
 * painted exactly like the mark, hollow included, and fades with the group's
 * visibility key.
 *
 * On a tagged label the glossary key sits on the term half, not on the whole string:
 * the glossary defines `Landesschnitt`, not `L1 = Landesschnitt`.
 * @param {ComparisonSeriesGroup} group
 * @returns {import('./legend/htmlLegendPanel.js').ChartKeyItem}
 */
export function comparisonMarkerLegendItem(group) {
    const paint = comparisonSeriesPaint(group);
    const { symbol, glossaryKey } = comparisonSeriesVisual(group);
    return {
        label: comparisonSeriesLabel(group),
        labelSegments: group.shortLabel
            ? buildLegendLabelSegments(group.shortLabel, group.name, glossaryKey)
            : null,
        glossaryKey: group.shortLabel ? null : glossaryKey,
        symbol,
        color: paint.fill,
        hollow: paint.hollow,
        stroke: paint.stroke,
        strokeWidth: paint.strokeWidth,
        dotFill: paint.dotFill,
        key: group.id,
    };
}

/**
 * The key a tooltip row that names this group draws before its label: the group's
 * marker, shape and paint as on the chart.
 * @param {ComparisonSeriesGroup} group
 * @returns {import('../services/cursorTooltip.js').TooltipRowKey}
 */
export function comparisonTooltipKey(group) {
    return { symbol: comparisonSeriesVisual(group).symbol, paint: comparisonSeriesPaint(group) };
}

/**
 * A comparison group as a chart declares it: its mode id and the name its ⌀ menu entry shows.
 * @typedef {{id: string, name: string}} ComparisonGroupEntry
 */

/**
 * The ⌀ menu entries for a chart's comparison groups: one toggle per group, named as
 * the payload names it.
 * @param {ReadonlyArray<ComparisonGroupEntry>} groups
 * @returns {Array<{id: string, label: string}>}
 */
export function comparisonModeEntries(groups) {
    return groups.map(({ id, name }) => ({ id, label: name }));
}

/**
 * The class every mark of one comparison group carries, by the group's position among
 * the chart's declared groups: payload ids need not be valid CSS identifiers. A
 * comparison toggle fades what carries it.
 * @param {number} index
 * @returns {string}
 */
export function comparisonSeriesClass(index) {
    return `comparison-series-${index}`;
}

/**
 * The group's name as text, carrying its ordinal tag when it has one, for tooltip and
 * legend rows: the reader matches `L2` on the plot to the population it names.
 * @param {ComparisonSeriesGroup} group
 * @returns {string} `L1 = Landesschnitt GY` for a group that needs disambiguating, the bare name otherwise.
 */
export function comparisonSeriesLabel(group) {
    return group.shortLabel ? `${group.shortLabel} = ${group.name}` : group.name;
}

/**
 * The comparison groups shown now (their ⌀ toggle on), in declared order: the markers
 * drawn, the tooltip rows and a data table's comparison columns.
 * @template {ComparisonSeriesGroup} TGroup
 * @param {ReadonlyArray<TGroup>} groups - In declared order.
 * @param {{[id: string]: boolean}} visibility - Which groups are shown (`visibilityState`).
 * @returns {TGroup[]}
 */
export function visibleComparisonGroups(groups, visibility) {
    return groups.filter((group) => visibility[group.id]);
}

/**
 * The tooltip rows of the comparison markers under a hovered mark: each shown group's
 * value as a percentage. A group without a value says nothing rather than a dash: it
 * draws no marker there either.
 * @template {ComparisonSeriesGroup} TGroup
 * @param {ReadonlyArray<TGroup>} groups - In declared order.
 * @param {{[id: string]: boolean}} visibility - Which groups are shown (`visibilityState`).
 * @param {(group: TGroup) => number|null|undefined} valueOf - The group's value for the hovered mark.
 * @returns {import('../services/cursorTooltip.js').TooltipRow[]}
 */
export function comparisonTooltipRows(groups, visibility, valueOf) {
    return visibleComparisonGroups(groups, visibility).flatMap((group) => {
        const value = valueOf(group);
        if (!isFiniteNumber(value)) return [];
        return [
            {
                label: comparisonSeriesLabel(group),
                value: formatPercent(value),
                key: comparisonTooltipKey(group),
            },
        ];
    });
}

/**
 * The colour of the `index`-th comparison group sharing its type's base colour,
 * stepping away from the page surface so the ramp keeps contrast in both light and
 * dark themes. Index 0 is the base colour itself.
 * @param {string} baseColor - The theme colour, a `var()`.
 * @param {number} index - Position among the marks sharing that colour, 0-based
 * @returns {string} The shade's `var()`.
 */
function shadeForIndex(baseColor, index) {
    return shadeToken(baseColor, index, SHADE_STEP);
}
