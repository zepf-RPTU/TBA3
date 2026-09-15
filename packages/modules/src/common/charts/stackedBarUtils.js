/**
 * Stacked Bar Utilities — shared segment processing and DOM stacked bar creation.
 *
 * This module is the canonical home for `processSegments()` (pure data transform)
 * and the DOM-based stacked bar factory (`createDOMStackedBar`, `createStackedBarFormatter`).
 *
 * Used by both:
 * - **Charts** (SVG) — `BarChartRenderer` imports `buildStackedSegments`,
 *   `computeStackedBarRects`, `insetStackedSegment` and `SVG_BAR_CONFIG`
 * - **Tables** (DOM) — the SL tables (`slClassTableModule`, `slDomainTableModule`,
 *   `slRatingStackedBar`) import `processSegments` and the DOM stacked bar API
 * @module stackedBarUtils
 */

import { getCompetencyAppearance, getThemeColors } from '../services/themeService.js';
import { applyCompetencyBandPaint, getCompetencyLevelClassToken } from './chartUtils.js';

/**
 * Default configuration for SVG-based stacked bars in D3 charts.
 * Used as the base spread when processing segments.
 */
export const SVG_BAR_CONFIG = {
    // Layout
    width: 100,
    height: 24,

    // Segments
    normalize: true,

    // Styling
    defaultColor: '#ccc', // Overridden at runtime via getThemeColors().chrome.defaultBarColor
    fillOpacity: 0.9,
    stroke: 'none',
    strokeWidth: 0,
    // Surface gap (px) shown between adjacent stacked fills, replacing the old 1px
    // divider stroke.
    segmentGap: 2,

    // Labels
    showLabels: false,
    minWidthForLabel: 30,
    labelFormatter: (segment) => segment.label || segment.field,
    labelColor: '#fff',
    labelFontWeight: 'bold',

    // Colors and labels
    colors: {},
    labels: {},
    fields: [],
};

/**
 * A segment's share of its bar as whole percent, `32 %`. Reads `percentage`
 * (canonical segments) and falls back to `normalizedValue`.
 * @param {{percentage?: number, normalizedValue?: number}} segment - A processed segment.
 * @returns {string} The share text.
 */
export function formatSegmentShare(segment) {
    const share = segment.percentage ?? segment.normalizedValue ?? 0;
    return `${Math.round(share)}\u00a0%`;
}

/**
 * The tiered segment label every stacked competence bar uses: `A2 · 32 %` when the
 * renderer has room for it on one line, `['A2', '32 %']` for a tall vertical
 * segment that only holds it on two, the level alone otherwise. `createSVGStackedBar`
 * asks for the long form first and measures it against the segment; a formatter
 * that ignores the flag simply keeps its one label.
 * @param {{label?: string, field?: string, percentage?: number, normalizedValue?: number}} segment - A processed segment.
 * @param {{withShare?: boolean, lines?: boolean}} [tier] - Whether the share goes beside the level, and whether as separate lines.
 * @returns {string | string[]} The label text, or its two lines.
 */
export function levelShareLabelFormatter(segment, { withShare = false, lines = false } = {}) {
    const level = segment.label || segment.field || '';
    if (!withShare) return level;
    const share = formatSegmentShare(segment);
    return lines ? [level, share] : `${level} \u00b7 ${share}`;
}

/**
 * Inset a stacked segment along the stacking axis so a `gap`-px strip of the
 * surface shows between adjacent fills (replaces the old 1px divider stroke).
 *
 * The inset is symmetric, so segment centers — and thus labels — stay put. A
 * segment thinner than the gap is left alone so it doesn't vanish.
 *
 * This lives here rather than inline in a renderer because *every* code path that
 * positions stacked segments has to agree on it. It previously existed only in
 * barChartRenderer's initial-render closure, so the SL competency legend-toggle
 * path re-stacked segments without it and silently dropped the surface gaps — a
 * hide/show round-trip left every segment `gap` px larger than it started.
 * @param {number} base Position along the stacking axis before insetting.
 * @param {number} size Extent along the stacking axis before insetting.
 * @param {number} [gap] Surface gap in px; defaults to the shared bar config.
 * @returns {{ pos: number, size: number }} The inset position and extent; unchanged when the segment is thinner than the gap.
 */
export function insetStackedSegment(base, size, gap = SVG_BAR_CONFIG.segmentGap) {
    const safeGap = Math.max(0, gap ?? 0);
    return size > safeGap ? { pos: base + safeGap / 2, size: size - safeGap } : { pos: base, size };
}

/**
 * Default configuration for DOM-based stacked bars in tables / generic HTML.
 */
const DOM_BAR_CONFIG = {
    // Layout
    width: '100%',
    height: 24,
    borderRadius: 4,
    gap: 0,

    // Styling
    containerClass: 'stacked-bar-container',
    segmentClass: 'stacked-bar-segment',
    defaultColor: getThemeColors().chrome.defaultBarColor,

    // Labels
    showLabels: false,
    minWidthForLabel: 30,
    labelFormatter: (segment) => segment.label || segment.field,

    // Tooltips
    showTooltips: true,
    tooltipContentMode: 'text',
    tooltipFormatter: (segment) => {
        const percentage =
            segment.total > 0 ? ((segment.value / segment.total) * 100).toFixed(1) : 0;
        return `${segment.label || segment.field}: ${segment.value} (${percentage}%)`;
    },
};

// ============================================================================
// SEGMENT PROCESSING
// ============================================================================

/**
 * Processes raw data into normalized segment data.
 * Works with object keyed by field names, pre-built arrays, or
 * a `{ segments }` wrapper. Each output segment carries `total`,
 * `percentage`, and `normalizedValue`.
 * @param {object | Array} data - Raw data (object with field values, array of {field,value,…}, or {segments})
 * @param {object} [config={}] - Configuration merged over SVG_BAR_CONFIG defaults
 * @returns {Array<object>} Processed segments with total, percentage, normalizedValue
 */
export function processSegments(data, config = {}) {
    const {
        fields = [],
        colors = {},
        labels = {},
        normalize = true,
        defaultColor = getThemeColors().chrome.defaultBarColor,
        segments: configSegments = null,
    } = { ...SVG_BAR_CONFIG, ...config };

    let segments = [];

    if (Array.isArray(data)) {
        segments = data.map((item, index) => ({
            field: item.field || item.key || `segment_${index}`,
            value: item.value || 0,
            color: item.color || colors[item.field] || colors[item.key] || defaultColor,
            label: item.label || labels[item.field] || labels[item.key] || item.field || item.key,
            appearance:
                item.appearance || getCompetencyAppearance(item.field || item.key || item.label),
            classToken:
                item.classToken ||
                getCompetencyLevelClassToken(
                    null,
                    item.appearance ||
                        getCompetencyAppearance(item.field || item.key || item.label),
                ),
        }));
    } else if (typeof data === 'object' && fields.length > 0) {
        // A row that knows its ladder (`rowData.scaleId`, stamped by the SL tables) resolves
        // its bands on it; a page can hold two ladders sharing a level name.
        const scaleId = typeof data.scaleId === 'string' ? data.scaleId : undefined;
        segments = fields.map((field) => {
            const value = data[field] ?? data[`ks_${field}`] ?? 0;
            const colorKey =
                typeof colors === 'function'
                    ? colors(field)
                    : colors[field] || colors[`ks_${field}`] || defaultColor;
            const appearance = getCompetencyAppearance(field, scaleId);

            return {
                field,
                value: value,
                color: colorKey,
                label: labels[field] || labels[`ks_${field}`] || field,
                appearance,
                classToken: getCompetencyLevelClassToken(null, appearance),
            };
        });
    } else if (typeof data === 'object' && data.segments) {
        segments = data.segments;
    } else if (configSegments && Array.isArray(configSegments)) {
        segments = configSegments;
    }

    const preFilterCount = segments.length;
    segments = segments.filter((s) => s.value > 0);
    if (segments.length === 0 && preFilterCount > 0) {
        console.warn('[stackedBarUtils] All segments filtered out (all values ≤ 0)', {
            preFilterCount,
        });
    }
    const total = segments.reduce((sum, s) => sum + s.value, 0);

    return segments.map((segment) => ({
        ...segment,
        total,
        percentage: total > 0 ? (segment.value / total) * 100 : 0,
        normalizedValue: normalize && total > 0 ? (segment.value / total) * 100 : segment.value,
    }));
}

/**
 * Builds stacked-bar segments from a per-level entry, computing cumulative
 * `startPercent`/`endPercent` positions across `levels` in stacking order. The
 * per-level value is read from `entry[level]` (default) or
 * `entry[`${level}${valueKey}`]`. Used by the KS distribution renderer,
 * `createChartStackedBar`, and the simple KS bar — which previously each
 * open-coded this same cumulative math with slightly different field names.
 *
 * Output segments carry `startPercent/endPercent` plus `value/percentage/
 * normalizedValue` so either positioning path works — explicit `getX/getWidth`
 * accessors (which read `startPercent`) or the renderer's built-in fallback
 * (which reads `start ?? startPercent`).
 * An entry carrying a string `scaleId` (SL rows, whose page can hold two ladders sharing
 * a level name) gets its competence-band `appearance` resolved on that ladder here, so
 * the renderer's bare-name fallback never runs for it.
 * @param {object} entry - Per-level values (e.g. `{ I: 40, II: 60 }`, or with a `_value` suffix)
 * @param {Array} levels - Level keys in stacking order; objects with a `.stufe` are unwrapped
 * @param {function(string, object): string} getColor - Level → color; also handed the entry
 * @param {object} [options] - Where to read each level’s value from.
 * @param {string|null} [options.valueKey=null] - Suffix for the value key (e.g. `'_value'`); null reads `entry[level]`
 * @returns {Array<object>} Canonical stacked segments (unfiltered)
 */
export function buildStackedSegments(entry, levels, getColor, { valueKey = null } = {}) {
    let cumulative = 0;
    const scaleId = typeof entry?.scaleId === 'string' ? entry.scaleId : undefined;

    return levels.map((level) => {
        const levelKey = (level && level.stufe) || level;
        const value = (valueKey ? entry[`${levelKey}${valueKey}`] : entry[levelKey]) ?? 0;
        const start = cumulative;
        cumulative += value;

        const segment = {
            field: levelKey,
            label: levelKey,
            value,
            percentage: value,
            normalizedValue: value,
            startPercent: start,
            endPercent: cumulative,
            total: 100,
            color: getColor(levelKey, entry),
        };
        if (scaleId !== undefined) {
            const appearance = getCompetencyAppearance(levelKey, scaleId);
            if (appearance) segment.appearance = appearance;
        }
        return segment;
    });
}

/**
 * Single geometry authority for stacked-bar rects: applies the position scale,
 * the orientation flip and the surface-gap inset in one place, so the initial
 * render (createSVGStackedBar's fallback path) and the SL legend-toggle
 * re-stack cannot drift apart again.
 *
 * Two modes:
 *  - Default: trusts each segment's `start`/`startPercent` and
 *    `end`/`endPercent` (deriving `end` from `value`/`percentage` when absent).
 *  - `isVisible` given: re-stacks visible segments contiguously from their
 *    values; hidden or zero-value segments collapse to a zero-size rect at the
 *    baseline (the legend-toggle contract).
 *
 * Without a `positionScale`, positions fall back to percent-of-extent
 * arithmetic — ascending for horizontal bars, inverted for vertical ones,
 * mirroring a d3 linear scale with a [extent, 0] range.
 * @param {Array<object>} segments - Canonical stacked segments
 * @param {object} options - The scale, extents and orientation the rects are computed against.
 * @param {(function(number): number)|null} [options.positionScale] - Percent → px along the stacking axis
 * @param {number} [options.extent] - Stacking-axis px extent for the percent fallback
 * @param {number} [options.bandSize] - Thickness along the cross axis (px)
 * @param {number} [options.crossOffset] - Offset along the cross axis (px)
 * @param {boolean} [options.isHorizontal] - Stack along x rather than y.
 * @param {number} [options.gap] - Surface gap; see insetStackedSegment
 * @param {(function(object): boolean) | null} [options.isVisible] - Re-stack mode predicate
 * @returns {Array<{x: number, y: number, width: number, height: number,
 *   preInset: {pos: number, size: number}, segment: object}>} One rect per
 *   segment, in order. `preInset` carries the stacking-axis geometry before the
 *   gap inset, for callers that mix in injected accessors.
 */
export function computeStackedBarRects(
    segments,
    {
        positionScale = null,
        extent = 100,
        bandSize = 0,
        crossOffset = 0,
        isHorizontal = false,
        gap = SVG_BAR_CONFIG.segmentGap,
        isVisible = null,
    } = {},
) {
    const scale =
        positionScale ??
        (isHorizontal
            ? (value) => (value / 100) * extent
            : (value) => ((100 - value) / 100) * extent);

    const toRect = (pos, size) => ({
        x: isHorizontal ? pos : crossOffset,
        y: isHorizontal ? crossOffset : pos,
        width: isHorizontal ? size : bandSize,
        height: isHorizontal ? bandSize : size,
    });

    let cumulative = 0;
    return segments.map((segment) => {
        let start, end;
        if (isVisible) {
            const value = segment.value ?? segment.percentage ?? 0;
            if (!isVisible(segment) || value <= 0) {
                return { ...toRect(scale(0), 0), preInset: { pos: scale(0), size: 0 }, segment };
            }
            start = cumulative;
            end = cumulative + value;
            cumulative = end;
        } else {
            start = segment.start ?? segment.startPercent ?? 0;
            end =
                segment.end ??
                segment.endPercent ??
                start + (segment.value || segment.percentage || 0);
        }

        const pos = isHorizontal ? scale(start) : scale(end);
        const size = isHorizontal
            ? Math.max(0, scale(end) - scale(start))
            : Math.max(0, scale(start) - scale(end));
        const inset = insetStackedSegment(pos, size, gap);

        return { ...toRect(inset.pos, inset.size), preInset: { pos, size }, segment };
    });
}

// ============================================================================
// DOM-BASED STACKED BAR
// ============================================================================

/**
 * Creates a DOM-based stacked bar container with segments.
 * Suitable for Tabulator cells, HTML tables, or any DOM context.
 *
 * Structural layout is handled by CSS classes defined in
 * `@tba3/modules/styles/stacked-bar.css`.
 * @param {Array<object>} segments - Processed segment data from processSegments
 * @param {object} [options={}] - Configuration merged over DOM_BAR_CONFIG defaults
 * @returns {HTMLElement} The stacked bar container element
 */
export function createDOMStackedBar(segments, options = {}) {
    const config = { ...DOM_BAR_CONFIG, ...options };
    const tooltipAttribute =
        config.tooltipContentMode === 'html' ? 'data-tooltip-html' : 'data-tooltip-text';

    // Create container
    const container = document.createElement('div');
    container.className = config.containerClass;

    // CSS-class driven layout — only set dynamic overrides
    if (config.height !== DOM_BAR_CONFIG.height) {
        container.style.height =
            typeof config.height === 'number' ? config.height + 'px' : config.height;
    }
    if (config.width !== DOM_BAR_CONFIG.width) {
        container.style.width =
            typeof config.width === 'number' ? config.width + 'px' : config.width;
    }
    if (config.borderRadius !== DOM_BAR_CONFIG.borderRadius) {
        container.style.borderRadius = config.borderRadius + 'px';
    }
    if (config.backgroundColor) {
        container.style.backgroundColor = config.backgroundColor;
    }

    // Create segments
    segments.forEach((segment, index) => {
        const segmentEl = document.createElement('div');
        const appearance = segment.appearance || getCompetencyAppearance(segment.field);
        const classToken =
            segment.classToken ||
            (appearance ? getCompetencyLevelClassToken(null, appearance) : segment.field);

        segmentEl.className = `${config.segmentClass} level-${classToken}`;
        segmentEl.dataset.field = segment.field;
        segmentEl.dataset.value = segment.value;

        // Competence bands paint from --ks-band-color (data-driven scale); everything
        // else keeps its own resolved color.
        if (appearance) {
            segmentEl.classList.add('competency-level');
            applyCompetencyBandPaint(segmentEl, appearance);
        } else {
            segmentEl.style.backgroundColor = segment.color;
        }
        segmentEl.style.width = `${segment.normalizedValue}%`;
        segmentEl.style.height = '100%';
        if (config.gap > 0 && index < segments.length - 1) {
            segmentEl.style.marginRight = `${config.gap}px`;
        }

        // Add label if configured
        if (config.showLabels && segment.normalizedValue >= config.minWidthForLabel) {
            const labelEl = document.createElement('span');
            labelEl.className = 'stacked-bar-label';
            labelEl.textContent = config.labelFormatter(segment);
            segmentEl.appendChild(labelEl);
        }

        // Add delegated tooltip attributes when tooltips are enabled.
        if (config.showTooltips) {
            const tooltipContent = config.tooltipFormatter(segment);
            if (tooltipContent != null && tooltipContent !== '') {
                segmentEl.setAttribute(tooltipAttribute, String(tooltipContent));
            }
        }

        container.appendChild(segmentEl);
    });

    return container;
}

/**
 * Creates a Tabulator formatter function for stacked bars.
 * Wraps segment processing + DOM stacked bar creation for easy Tabulator integration.
 * @param {object} [options={}] - Configuration options (same as createDOMStackedBar)
 * @returns {Function} Tabulator formatter function
 */
export function createStackedBarFormatter(options = {}) {
    return function (cell) {
        const rowData = cell.getRow().getData();
        const segments = processSegments(rowData, options);

        return createDOMStackedBar(segments, {
            height: 20,
            showTooltips: true,
            ...options,
        });
    };
}

// ============================================================================
// PRESET CONFIGURATIONS (for createStackedBarFormatter / processSegments)
// ============================================================================

/**
 * Preset for competency level (KS) distribution bars.
 * @param {Array<string|{stufe: string}>} competencyLevels - Levels in stacking order; objects with a `stufe` are unwrapped.
 * @param {function(string): string} getColorForLevel - Level to color mapping.
 * @returns {object} A stacked-bar preset naming the `ks_<level>` fields and their colors.
 */
export const ksDistributionPreset = (competencyLevels, getColorForLevel) => ({
    fields: competencyLevels.map((level) =>
        typeof level === 'object' ? `ks_${level.stufe}` : `ks_${level}`,
    ),
    colors: Object.fromEntries(
        competencyLevels.map((level) => {
            const key = typeof level === 'object' ? level.stufe : level;
            return [
                `ks_${key}`,
                getColorForLevel ? getColorForLevel(key) : getThemeColors().chrome.defaultBarColor,
            ];
        }),
    ),
    labels: Object.fromEntries(
        competencyLevels.map((level) => {
            const key = typeof level === 'object' ? level.stufe : level;
            return [`ks_${key}`, key];
        }),
    ),
    showLabels: true,
    minWidthForLabel: 25,
});

/**
 * Preset for gender distribution bars
 */
export const genderDistributionPreset = {
    fields: ['gender_male', 'gender_female', 'gender_diverse'],
    get colors() {
        const t = getThemeColors();
        return {
            gender_male: t.gender.male,
            gender_female: t.gender.female,
            gender_diverse: t.gender.diverse,
        };
    },
    labels: {
        gender_male: 'Männlich',
        gender_female: 'Weiblich',
        gender_diverse: 'Divers',
    },
};
