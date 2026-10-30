/**
 * Stacked bars in table cells and other HTML: a row's fields turned into segments
 * (`processSegments`) and drawn as DOM (`createDOMStackedBar`), with the Tabulator
 * formatter and field presets. The segment shape and the gap
 * come from `../utils/stackedBarUtils.js`.
 */

import { getCompetenceAppearance } from '../services/themeService.js';
import { isTokenReference, valueLabelInk } from '../services/paletteTokens.js';
import { applyCompetenceBandPaint } from '../services/competenceLevelPaint.js';
import { GENDER_LABELS } from '../domain/apiValueMaps.js';
import { cursorTooltip, setTooltipContent } from '../services/cursorTooltip.js';
import { percentOf } from '../domain/itemResultCounts.js';
import { SEGMENT_GAP_PX, formatSegmentShare } from '../utils/stackedBarUtils.js';
import { sum } from 'd3-array';
import { DATA_MARK_CLASS } from '../services/dataMark.js';

/** @typedef {import('../utils/stackedBarUtils.js').StackedSegment} StackedSegment */

/**
 * How `processSegments` reads a row: which fields become segments, their colours and labels.
 * @typedef {object} SegmentProcessingConfig
 * @property {string[]} [fields] - Row fields to turn into segments, in stacking order.
 * @property {{[field: string]: string}} [colors] - Colour per field; a competence band paints from its appearance instead, and a field with neither takes the default bar colour.
 * @property {{[field: string]: string}} [labels]
 */

/**
 * `createDOMStackedBar` options, merged over its defaults.
 * @typedef {object} DOMStackedBarOptions
 * @property {((segment: StackedSegment) => string|null)|null} [labelFormatter] - A segment's label text, printed inside it, or null for none; it shows where it fits whole (stacked-bar.css). A segment outside a competence band takes it in the ink of its `color`, which must then be a `var()` token.
 * @property {((segment: StackedSegment) => import('../services/cursorTooltip.js').TooltipContent)|null} [getTooltipContent] - A segment's tooltip, as a chart's; none without it.
 * @property {{at: number, tooltip: import('../services/cursorTooltip.js').TooltipContent}|null} [marker] - A benchmark line at `at` percent of the bar, with its tooltip; the labelled segment it crosses keeps its label clear of it, and the bar's name ends with the tooltip's text.
 * @property {string|null} [labelPrefix] - What the bar shows, leading its name ("Lesen: Ia 3 %, …"), for a cell that holds more than one bar.
 */

const DOM_BAR_CONFIG = {
    getTooltipContent: null,
    labelFormatter: null,
};

/**
 * Processes a row into segment data: one segment per `fields` entry read off the row.
 * Zero values drop out; each segment left carries its `value`, the `total` of all of
 * them and its `percentage` of it.
 * @param {import('../services/competenceLevelPalette.js').CompetenceLevelPalette} palette
 * @param {{[key: string]: any}} data - The row, keyed by field.
 * @param {SegmentProcessingConfig & DOMStackedBarOptions} [config={}] - Bar options a shared preset carries are ignored.
 * @returns {Array<StackedSegment & {value: number, total: number}>}
 */
export function processSegments(palette, data, { fields = [], colors = {}, labels = {} } = {}) {
    const defaultColor = 'var(--default-bar-color)';
    // A row that carries `scaleId` resolves its bands on that ladder; a page can hold
    // two ladders sharing a level name.
    const scaleId = typeof data.scaleId === 'string' ? data.scaleId : undefined;
    let segments = fields.map((field) => ({
        field,
        value: data[field] ?? 0,
        color: colors[field] || defaultColor,
        label: labels[field] || field,
        appearance: getCompetenceAppearance(palette, levelOfField(field), scaleId),
    }));

    const preFilterCount = segments.length;
    segments = segments.filter((s) => s.value > 0);
    if (segments.length === 0 && preFilterCount > 0) {
        console.warn('[stackedBarCell] All segments filtered out (all values ≤ 0)', {
            preFilterCount,
        });
    }
    // Every segment left is positive, so the total is too.
    const total = sum(segments, (s) => s.value);

    return segments.map((segment) => ({
        ...segment,
        total,
        percentage: /** @type {number} */ (fieldShare(data, fields, segment.field)),
    }));
}

/**
 * The share of its bar one row field holds, in percent: the field's value over the sum
 * of the positive `fields` values, the rule `processSegments` stacks by, so an export
 * reading it states the share the bar draws.
 * @param {{[key: string]: any}} data - The row, keyed by field.
 * @param {string[]} fields - The bar's fields.
 * @param {string} field
 * @returns {number|null} The share in percent; `null` for a bar with nothing to stack.
 */
export function fieldShare(data, fields, field) {
    const positive = (/** @type {string} */ key) => Math.max(0, data[key] ?? 0);
    return percentOf(positive(field), sum(fields, positive));
}

/**
 * The label an empty bar cell shows on its track: every table bar without data
 * (a distribution without shares, a rating or box plot without values) reads the same.
 * @param {import('../glossary/glossaryAnnotator.js').GlossaryAnnotator} glossary
 * @returns {HTMLSpanElement}
 */
export function createEmptyBarLabel(glossary) {
    const label = document.createElement('span');
    label.className = 'stacked-bar-empty';
    label.textContent = glossary.getRequiredEntryText('general.messages.no-data-short');
    return label;
}

/**
 * An empty bar cell: the bar's track with the no-data label on it.
 * @param {import('../glossary/glossaryAnnotator.js').GlossaryAnnotator} glossary
 * @returns {HTMLElement}
 */
export function createEmptyStackedBar(glossary) {
    const bar = createDOMStackedBar([]);
    bar.appendChild(createEmptyBarLabel(glossary));
    return bar;
}

/**
 * A labelled segment outside a competence band takes its label ink from its fill's
 * palette token, so a literal colour (a hex) has no ink to give: throw before any
 * segment is built. A segment the formatter leaves unlabelled needs no ink.
 * @param {StackedSegment[]} segments
 * @param {(segment: StackedSegment) => string|null} labelFormatter
 */
function assertLabelInkResolvable(segments, labelFormatter) {
    const literal = segments.find(
        (segment) =>
            !segment.appearance &&
            segment.color &&
            !isTokenReference(segment.color) &&
            labelFormatter(segment),
    );
    if (literal) {
        throw new Error(
            `createDOMStackedBar: segment '${literal.field}' has the literal colour '${literal.color}'; a labelled bar needs var() colours for its label ink.`,
        );
    }
}

/**
 * A DOM stacked bar, for a Tabulator cell or any other HTML. Its layout is
 * `@tba3/modules/styles/stacked-bar.css`.
 * @param {StackedSegment[]} segments - From `processSegments`.
 * @param {DOMStackedBarOptions} [options={}]
 * @returns {HTMLElement}
 */
export function createDOMStackedBar(segments, options = {}) {
    const config = { ...DOM_BAR_CONFIG, ...options };
    if (config.labelFormatter) assertLabelInkResolvable(segments, config.labelFormatter);

    const container = document.createElement('div');
    container.className = `stacked-bar-container ${DATA_MARK_CLASS}`;
    container.style.setProperty('--stacked-bar-segment-gap', `${SEGMENT_GAP_PX}px`);
    // One image to assistive tech, named by every segment's share: the labels inside
    // print one share at most, and the segment tooltips have no keyboard path.
    if (segments.length > 0) {
        const shares = segments
            .map((segment) => `${segment.label} ${formatSegmentShare(segment)}`)
            .join(', ');
        const marker = config.marker ? cursorTooltip.toPlainText(config.marker.tooltip) : '';
        container.setAttribute('role', 'img');
        container.setAttribute(
            'aria-label',
            [config.labelPrefix ? `${config.labelPrefix}: ${shares}` : shares, marker]
                .filter(Boolean)
                .join('. '),
        );
    }

    // Size, corners and clipping come from stacked-bar.css; only the shares are inline.
    let start = 0;
    segments.forEach((segment) => {
        const segmentEl = document.createElement('div');
        // The segment builders resolved the appearance on the row's own ladder; a segment
        // without one (gender, rating) keeps its field as the class token.
        const appearance = segment.appearance ?? null;
        const classToken = appearance?.patternKey ?? segment.field;

        segmentEl.className = `stacked-bar-segment level-${classToken}`;

        if (appearance) {
            segmentEl.classList.add('competence-level');
            applyCompetenceBandPaint(segmentEl, appearance);
        } else {
            segmentEl.style.backgroundColor = segment.color ?? '';
        }
        segmentEl.style.width = `${segment.percentage}%`;

        const labelText = config.labelFormatter?.(segment);
        if (labelText) {
            const labelEl = document.createElement('span');
            labelEl.className = 'stacked-bar-label';
            labelEl.textContent = labelText;
            // A band's ink comes with its paint; any other fill's from its contrast, as a
            // chart's inside value label, through the same --competence-level-band-ink the label reads.
            if (!appearance)
                segmentEl.style.setProperty(
                    '--competence-level-band-ink',
                    valueLabelInk(segment.color),
                );
            segmentEl.appendChild(labelEl);
            // The label of the segment the benchmark line crosses gives up the room past it.
            const at = config.marker?.at;
            if (at !== undefined && at >= start && at < start + segment.percentage) {
                segmentEl.classList.add('stacked-bar-segment--marked');
                segmentEl.style.setProperty('--label-room', `${start + segment.percentage - at}%`);
                segmentEl.style.setProperty('--segment-share', `${segment.percentage}%`);
            }
        }
        start += segment.percentage;

        if (config.getTooltipContent) {
            setTooltipContent(segmentEl, config.getTooltipContent(segment));
        }

        container.appendChild(segmentEl);
    });

    if (config.marker) {
        const marker = document.createElement('div');
        marker.className = 'bar-benchmark-marker';
        marker.style.left = `${Math.max(0, Math.min(100, config.marker.at))}%`;
        setTooltipContent(marker, config.marker.tooltip);
        container.appendChild(marker);
    }

    return container;
}

/**
 * Creates a Tabulator formatter that draws each row as a DOM stacked bar.
 * @param {import('../services/competenceLevelPalette.js').CompetenceLevelPalette} palette
 * @param {SegmentProcessingConfig & Omit<DOMStackedBarOptions, 'getTooltipContent'> & {getTooltipContent?: (segment: StackedSegment, rowData: any) => import('../services/cursorTooltip.js').TooltipContent}} [options={}] - Segment processing plus bar options (same as createDOMStackedBar); the tooltip also gets the row, which says what its values are.
 * @returns {(cell: import('tabulator-tables').CellComponent) => HTMLElement}
 */
export function createStackedBarFormatter(palette, options = {}) {
    const { getTooltipContent, ...barOptions } = options;
    return function (cell) {
        const rowData = cell.getRow().getData();
        const segments = processSegments(palette, rowData, barOptions);

        return createDOMStackedBar(segments, {
            ...barOptions,
            getTooltipContent: getTooltipContent
                ? (segment) => getTooltipContent(segment, rowData)
                : null,
        });
    };
}

// ============================================================================
// PRESET CONFIGURATIONS (for createStackedBarFormatter / processSegments)
// ============================================================================

const LEVEL_FIELD_PREFIX = 'competenceLevel_';

/**
 * The row field holding one competence level's value. Prefixed so a level name never
 * collides with another field of the row, and so every table exports the same keys.
 * @param {string} level
 * @returns {string} The field, `competenceLevel_<level>`.
 */
export const competenceLevelField = (level) => `${LEVEL_FIELD_PREFIX}${level}`;

/**
 * The level a `competenceLevelField` names; any other field is returned unchanged.
 * @param {string} field
 * @returns {string}
 */
const levelOfField = (field) =>
    field.startsWith(LEVEL_FIELD_PREFIX) ? field.slice(LEVEL_FIELD_PREFIX.length) : field;

/**
 * Per-level values as row fields.
 * @param {{[level: string]: number}|null|undefined} valuesByLevel
 * @returns {{[field: string]: number}} The values keyed by `competenceLevelField`.
 */
export const toCompetenceLevelFields = (valuesByLevel) =>
    Object.fromEntries(
        Object.entries(valuesByLevel ?? {}).map(([level, value]) => [
            competenceLevelField(level),
            value,
        ]),
    );

/**
 * Preset for competence-level distribution bars over `competenceLevelField` row fields: the
 * fields and their labels. Each band paints from its appearance, resolved per render on
 * the row's ladder.
 * @param {ReadonlyArray<string>} levels - Level names in stacking order.
 * @returns {SegmentProcessingConfig}
 */
export const competenceLevelDistributionPreset = (levels) => ({
    fields: levels.map(competenceLevelField),
    labels: Object.fromEntries(levels.map((level) => [competenceLevelField(level), level])),
});

export const genderDistributionPreset = {
    fields: ['gender_male', 'gender_female', 'gender_diverse'],
    colors: {
        gender_male: 'var(--gender-male-color)',
        gender_female: 'var(--gender-female-color)',
        gender_diverse: 'var(--gender-diverse-color)',
    },
    labels: Object.fromEntries(
        Object.entries(GENDER_LABELS).map(([code, label]) => [`gender_${code}`, label]),
    ),
};
