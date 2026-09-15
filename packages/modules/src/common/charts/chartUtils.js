/**
 * Shared competency-level chart helpers: band paint/class tokens, level
 * ordering, and the SVG text-chip decoration. EN, MA and SL all register their
 * level scales through `registerCompetenceLevelScales` and stack, legend or
 * label levels through these.
 *
 * Marker/legend symbol shapes live in markerSymbols.js; SL-only helpers
 * (subject labels, box-plot stats) live under src/sl/utils/.
 */

import { getCompetencyAppearance } from '../services/themeService.js';
import { getCompetencyLevelOrdinal } from '../services/competenceLevelPalette.js';
import * as d3 from 'd3';

/**
 * @typedef {{normalizedLevel?: string, baseColor: string, ink?: string, patternKey: string, bandIndex?: number}} CompetencyAppearance
 */

/**
 * Stamp the competence-band paint contract onto a DOM element: the resolved color as
 * `--ks-band-color` (CSS paints from it — the band count is data-driven, so there is
 * no fixed variable to key on).
 * @param {HTMLElement} element - Element to paint.
 * @param {CompetencyAppearance} appearance - Resolved color for the band.
 */
export function applyCompetencyBandPaint(element, appearance) {
    element.style.setProperty('--ks-band-color', appearance.baseColor);
    // A label inside the element reads this (stacked-bar.css); it inherits like any
    // custom property, so the band decides its own label ink.
    if (appearance.ink) element.style.setProperty('--ks-band-ink', appearance.ink);
}

/**
 * CSS-class token for a competence level, in any input vocabulary — the level’s own
 * name slugified (`Ia` → 'ia', `A1.1` → 'a1-1'), since level names come from the data
 * rather than a fixed vocabulary. Used as a selector/test hook; paint comes from
 * `applyCompetencyBandPaint`. Non-competency fields (gender, richtig/falsch, …) are
 * returned with only the `ks-` prefix stripped.
 * @param {string|number|null|undefined} level - The level or field value to tokenise.
 * @param {CompetencyAppearance|null} [appearanceOverride] - Use this appearance instead of resolving one.
 * @returns {string|null} The class token, or null for a nullish level.
 */
export function getCompetencyLevelClassToken(level, appearanceOverride = null) {
    const appearance =
        appearanceOverride ||
        (level !== undefined && level !== null ? getCompetencyAppearance(level) : null);
    if (appearance) {
        return (
            appearance.patternKey || String(appearance.normalizedLevel || '').toLowerCase() || null
        );
    }

    if (level !== undefined && level !== null) {
        return String(level)
            .trim()
            .replace(/^ks[_-]/i, '');
    }

    return null;
}

/**
 * Draw a rounded background chip behind an SVG label, sized to the text it measures.
 * Appended before the label in the same parent, so the text keeps painting over it.
 * @param {d3.Selection} labelSelection - The label to back; a selection with no node is a no-op.
 * @param {object} [options] - Padding, radius, fill and the label's `ink` for the chip.
 * @returns {*} The chip selection, or null when the label could not be measured.
 */
export function addSvgTextChip(labelSelection, options = {}) {
    const labelNode = labelSelection?.node?.();
    if (!labelNode?.getBBox || !labelNode.parentNode) {
        return null;
    }

    // getBBox() throws on a node in an unrendered subtree in some engines (Firefox:
    // NS_ERROR_FAILURE); an unmeasurable label gets no chip rather than aborting the render.
    let bounds;
    try {
        bounds = labelNode.getBBox();
    } catch {
        return null;
    }

    if (!Number.isFinite(bounds.width) || !Number.isFinite(bounds.height)) {
        return null;
    }

    const {
        fill = 'rgba(255,255,255,0.92)',
        stroke = 'rgba(15,23,42,0.16)',
        // The chip is light in both colour schemes — it sits on the band colour, not
        // the surface — so the label's ink is the chip's, not the scheme's text colour.
        ink = '#111827',
        strokeWidth = 1,
        paddingX = 6,
        paddingY = 2,
        rx = 999,
        className = 'svg-label-chip',
    } = options;

    const height = bounds.height + paddingY * 2;

    d3.select(labelNode).style('fill', ink);

    return d3
        .select(labelNode.parentNode)
        .insert('rect', () => labelNode)
        .attr('class', className)
        .attr('x', bounds.x - paddingX)
        .attr('y', bounds.y - paddingY)
        .attr('width', bounds.width + paddingX * 2)
        .attr('height', height)
        .attr('rx', Math.min(rx, height / 2))
        .attr('ry', Math.min(rx, height / 2))
        .attr('fill', fill)
        .attr('stroke', stroke)
        .attr('stroke-width', strokeWidth)
        .attr('pointer-events', 'none');
}

/**
 * Sort competency levels lowest-first, following the scale the data registered.
 *
 * The order is the payload's own, read through the palette registry — there is no
 * notation to detect. Levels the registry does not know keep their relative input
 * order at the end rather than being sorted alphabetically, which on a scale like
 * `k.h.N., KS 1 … KS 5` would put the lowest level last and on Bremen's
 * `MiStd--, MiStd-, MiStd, ReStd, ReStd+, OptStd` would sort the highest level fourth.
 *
 * Shared rather than SL-local: EN, MA and SL all register their scales through
 * `registerCompetenceLevelScales`, and every one of them stacks or legends levels.
 * @param {Array} levels - Array of competency level strings
 * @param {(level: string) => string|undefined} [scaleIdForLevel] - Which ladder each level
 *   belongs to, for pages holding two ladders that share a name (SL); omitted, a name
 *   resolves to the scale that registered it last.
 * @returns {Array} Sorted array with lowest levels first
 */
export function sortCompetencyLevels(levels, scaleIdForLevel) {
    if (levels.length === 0) return levels;

    const ordinal = scaleIdForLevel
        ? (level) => getCompetencyLevelOrdinal(level, scaleIdForLevel(level))
        : (level) => getCompetencyLevelOrdinal(level);
    return levels.sort((a, b) => ordinal(a) - ordinal(b));
}
