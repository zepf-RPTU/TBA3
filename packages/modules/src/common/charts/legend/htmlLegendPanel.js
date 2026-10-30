/**
 * The legend panel's sections, pill groups, pills and swatch lists as lit-html
 * templates, and a chart's whole key (`chartKeyTemplate`). The templates keep no
 * visibility state: the renderer does, and hands it in with what a click does.
 */

import { createElement, cssVars } from '@tba3/module-base';
import { GLOSSARY_TERM_TAB_STOP } from '@tba3/module-base/glossary';
import * as d3 from 'd3';
import { html, nothing } from 'lit';
import { guard } from 'lit/directives/guard.js';
import { applyCompetenceBandPaint } from '../../services/competenceLevelPaint.js';
import { legendSymbolBox, renderLegendSymbol } from '../markerSymbols.js';
import { DATA_MARK_CLASS } from '../../services/dataMark.js';

/**
 * The colour a legend entry stands for: a plain colour, or a competence level's paint.
 * @typedef {object} HtmlLegendSwatch
 * @property {string} [color] - Fill of a categorical swatch.
 * @property {import('../../services/competenceLevelPaint.js').CompetenceAppearance|null} [appearance] - A competence level's paint; wins over `color`.
 */

let panelIdCounter = 0;

/**
 * A prefix unique to one panel, for its headings' ids: a list names itself after its heading.
 * @returns {string}
 */
export function nextLegendIdPrefix() {
    panelIdCounter += 1;
    return `legend-${panelIdCounter}`;
}

/**
 * A legend section: its heading, then its body (a pill group or a swatch list).
 * @param {object} heading
 * @param {string} heading.title
 * @param {string|null} [heading.glossaryKey] - Glossary entry the heading's text opens.
 * @param {string} [heading.id] - Id of the heading, for a body that names itself after it.
 * @param {(() => void)|null} [heading.onToggleAll] - Makes the heading a button that toggles every item in the section.
 * @param {boolean} [heading.pressed] - Whether that button reads as on (any item of the section is).
 * @param {unknown} body - The section's pills or swatches.
 * @returns {import('lit').TemplateResult}
 */
function legendSectionTemplate(
    { title, glossaryKey = null, id, onToggleAll = null, pressed = false },
    body,
) {
    // A button's text is no place for a second focus target: its glossary run stays
    // unfocusable, and the button's own keyboard focus opens the run's popup instead.
    const headingTemplate = onToggleAll
        ? html`<button
              type="button"
              class="legend-section-title legend-section-title--clickable interactive-subtle"
              id=${id ?? nothing}
              data-glossary-focus=${glossaryKey ? '' : nothing}
              aria-pressed=${String(pressed)}
              @click=${onToggleAll}
          >
              ${labelTemplate(title, null, glossaryKey, { focusable: false })}
          </button>`
        : html`<div class="legend-section-title" id=${id ?? nothing}>
              ${labelTemplate(title, null, glossaryKey)}
          </div>`;
    // An untitled section has no heading, so no empty row or gap sits above its body.
    return html`<div class="legend-section">${title ? headingTemplate : nothing}${body}</div>`;
}

/**
 * @param {unknown} pills
 * @param {number} [columns] - Lay the pills out in this many equal columns instead of one stack.
 * @returns {import('lit').TemplateResult}
 */
function legendPillGroupTemplate(pills, columns) {
    const className = columns
        ? 'btn-group legend-pill-group legend-pill-group--grid'
        : 'btn-group legend-pill-group';
    return html`<div
        class=${className}
        ${cssVars({ '--legend-pill-columns': columns ? String(columns) : null })}
    >
        ${pills}
    </div>`;
}

/**
 * The colour chip a pill or a swatch list entry leads with: a live element, because a
 * competence level's chip carries its own paint, set through CSSOM.
 * @param {HtmlLegendSwatch} swatch
 * @returns {HTMLSpanElement} Decorative to assistive technology: the label beside it names the entry.
 */
function createHtmlLegendSwatch({ color, appearance = null }) {
    const chip = /** @type {HTMLSpanElement} */ (
        createElement('span', {
            className: `legend-swatch ${DATA_MARK_CLASS}${appearance ? ' competence-level' : ''}`,
            attributes: { 'aria-hidden': 'true' },
        })
    );
    if (appearance) applyCompetenceBandPaint(chip, appearance);
    else if (color) chip.style.backgroundColor = color;
    return chip;
}

/**
 * A chip that is built once per paint: a re-render with the same colours keeps it.
 * @param {HtmlLegendSwatch|null|undefined} swatch - None renders nothing.
 * @returns {unknown}
 */
function swatchTemplate(swatch) {
    if (!swatch) return nothing;
    return guard([swatch.color, swatch.appearance?.baseColor, swatch.appearance?.ink], () =>
        createHtmlLegendSwatch(swatch),
    );
}

/**
 * The mark a key entry leads with, as a chart draws it: the colour chip, or the chart's
 * own mark in miniature.
 * @typedef {object} LegendSymbol
 * @property {string} [symbol] - Symbol type: `rect` (the colour chip, the default; `legendMarkTemplate` draws it as the HTML swatch), `circle`, `pill`, `diamond`, `square`, `triangle`, `cross`, `line` or `lollipop`.
 * @property {string} [color]
 * @property {boolean} [hollow] - The symbol is the surface inside, outlined in its colour; that outline survives forced colours.
 * @property {string|null} [dotFill] - Centre dot fill of a marker symbol.
 * @property {string} [stroke]
 * @property {number} [strokeWidth]
 */

/**
 * One entry of a chart's key: its label and the mark before it.
 * @typedef {LegendSymbol & {
 *     label?: string,
 *     labelSegments?: Array<{text: string, glossaryKey?: string|null}>|null,
 *     glossaryKey?: string|null,
 *     key?: string,
 *     swatch?: HtmlLegendSwatch,
 *     isChild?: boolean,
 *     initiallyHidden?: boolean,
 * }} ChartKeyItem
 * `labelSegments` put the glossary link on the run that names the term, `glossaryKey`
 * on the whole label; `key` names the series the entry stands for, so the entry fades
 * with it (a comparison) or, in a toggle block, is the series its pill shows or hides.
 * An entry with neither a symbol nor a colour is a line of text. In a toggle block,
 * `swatch` is the colour chip its pill leads with (a competence level's paint),
 * `isChild` indents the pill and `initiallyHidden` starts its series off the first time
 * it appears.
 */

/**
 * One block of a chart's key: a list of entries under an optional title. A block with a
 * `group` is a block of toggle pills: each entry's pill shows or hides the series its
 * `key` names, and `group` names the kind of series.
 * @typedef {object} ChartKeyBlock
 * @property {ChartKeyItem[]} items - In order.
 * @property {string} [title]
 * @property {string} [titleGlossaryKey] - Glossary entry the heading opens.
 * @property {string} [group] - Makes the block toggle pills, of this kind of series.
 * @property {number} [columns] - Lay the pills out in this many equal columns.
 * @property {string} [masterLabel] - A derived pill under this label toggling every entry.
 * @property {boolean} [toggleAll] - Make the heading toggle every entry.
 */

/**
 * A chart's key: its blocks. A toggle entry's key is unique within its group.
 * @typedef {ChartKeyBlock[]} ChartKey
 */

/** Room a side of a legend mark for the outline every symbol is drawn with. */
const LEGEND_MARK_PAD_PX = 2;

/**
 * The width a symbol's legend mark takes: its drawn extent plus the outline room.
 * @param {string} symbol
 * @returns {number} In px.
 */
function legendMarkWidthPx(symbol) {
    const box = legendSymbolBox(symbol);
    return box.right - box.left + 2 * LEGEND_MARK_PAD_PX;
}

/**
 * A chart's mark in miniature, as a live SVG sized to the symbol's own extent.
 * @param {LegendSymbol} item
 * @returns {SVGSVGElement} Decorative to assistive technology.
 */
function createLegendMark({ symbol = 'circle', color, hollow, dotFill, stroke, strokeWidth }) {
    const box = legendSymbolBox(symbol);
    const width = legendMarkWidthPx(symbol);
    const height = box.height + 2 * LEGEND_MARK_PAD_PX;
    const svg = d3
        .create('svg')
        .attr('class', 'legend-mark')
        .attr('aria-hidden', 'true')
        .attr('width', width)
        .attr('height', height)
        .attr('viewBox', `${box.left - LEGEND_MARK_PAD_PX} ${-height / 2} ${width} ${height}`);
    const group = svg.append('g').attr('class', `legend-symbol ${DATA_MARK_CLASS}`);
    group.classed('legend-symbol--hollow', hollow === true);
    // An absent field is `undefined`, which the symbol's own defaults fill in.
    renderLegendSymbol(group, symbol, { color, dotFill, stroke, strokeWidth });
    return /** @type {SVGSVGElement} */ (svg.node());
}

/**
 * The width of a key's widest drawn mark, px, so a key laid out in one column centres
 * every mark on one line and starts every label at one edge (`--legend-mark-slot`). The
 * colour chip is sized in rem by the stylesheet, which takes the larger of the two.
 * @param {ChartKey} key
 * @returns {number} 0 for a key with no drawn mark.
 */
export function keyMarkSlotPx(key) {
    const widths = key
        .filter((block) => block.group === undefined)
        .flatMap((block) => block.items)
        .flatMap((item) => (item.symbol && item.symbol !== 'rect' ? [item.symbol] : []))
        .map(legendMarkWidthPx);
    return Math.max(0, ...widths);
}

/**
 * A key entry's leading mark: the colour chip for `rect`, the chart's mark otherwise.
 * Built once per paint: a re-render with the same symbol keeps it.
 * @param {LegendSymbol} item
 * @returns {unknown}
 */
function legendMarkTemplate(item) {
    if (!item.symbol || item.symbol === 'rect') return swatchTemplate({ color: item.color });
    return guard(
        [item.symbol, item.color, item.hollow, item.dotFill, item.stroke, item.strokeWidth],
        () => createLegendMark(item),
    );
}

/**
 * A label, its glossary runs marked up when it carries any: pre-split `labelSegments`
 * put the link on the run that names the term, `glossaryKey` on the whole label.
 * @param {string} label
 * @param {Array<{text: string, glossaryKey?: string|null}>|null} [labelSegments]
 * @param {string|null} [glossaryKey]
 * @param {{focusable?: boolean}} [options] - `focusable: false` inside a control that takes focus itself.
 * @returns {unknown}
 */
function labelTemplate(label, labelSegments = null, glossaryKey = null, { focusable = true } = {}) {
    const hasSegments = Array.isArray(labelSegments) && labelSegments.length > 0;
    if (!hasSegments && !glossaryKey) return label;
    const segments = hasSegments ? labelSegments : [{ text: label, glossaryKey }];
    return segments.map((segment) => {
        const stop = segment.glossaryKey && focusable ? GLOSSARY_TERM_TAB_STOP : null;
        return html`<span
            class=${segment.glossaryKey ? 'glossary-term' : nothing}
            data-glossary-key=${segment.glossaryKey || nothing}
            tabindex=${stop?.tabindex ?? nothing}
            role=${stop?.role ?? nothing}
            aria-expanded=${stop?.['aria-expanded'] ?? nothing}
            >${segment.text}</span
        >`;
    });
}

/**
 * A single HTML legend pill button.
 * @param {object} options
 * @param {string} options.label
 * @param {Array<{ text: string, glossaryKey?: string|null }>|null} [options.labelSegments] - Pre-split glossary runs, when the label carries annotated terms.
 * @param {HtmlLegendSwatch|null} [options.swatch] - Colour chip leading the label.
 * @param {boolean} options.active
 * @param {boolean} [options.isChild=false] - Render as a nested pill, indented under its parent series.
 * @param {boolean} [options.isMaster=false] - The section's derived "all children" pill.
 * @param {() => void} options.onClick
 * @returns {import('lit').TemplateResult}
 */
function legendPillTemplate({
    label,
    labelSegments = null,
    swatch = null,
    active,
    isChild = false,
    isMaster = false,
    onClick,
}) {
    const className = [
        'btn btn--text legend-pill',
        active ? 'is-active' : 'is-inactive',
        isChild ? 'child' : '',
    ]
        .filter(Boolean)
        .join(' ');
    // Its glossary run cannot be a tab stop inside a button: the pill's own keyboard
    // focus opens the run's popup instead, after the hover delay (tooltipService).
    const carriesTerm = labelSegments?.some((segment) => segment.glossaryKey) === true;
    return html`<button
        type="button"
        class=${className}
        data-toggle-section=${isMaster ? '' : nothing}
        data-glossary-focus=${carriesTerm ? '' : nothing}
        aria-pressed=${String(active)}
        @click=${onClick}
    >
        ${swatchTemplate(swatch)}${labelTemplate(label, labelSegments, null, { focusable: false })}
    </button>`;
}

/**
 * One entry of a display-only list.
 * @typedef {object} LegendSwatchListItem
 * @property {string} label
 * @property {Array<{text: string, glossaryKey?: string|null}>|null} [labelSegments] - Pre-split glossary runs.
 * @property {string|null} [glossaryKey] - Glossary key of the whole label.
 * @property {unknown} [mark] - The mark leading the label: the chart's own, in miniature.
 * @property {boolean} [hidden] - The series it names is toggled off: the entry is faded.
 */

/**
 * A display-only list of marks, each beside its label (decorative: the label names the
 * entry); an entry without a mark is a line of text.
 * @param {LegendSwatchListItem[]} items - In display order.
 * @param {object} [options]
 * @param {boolean} [options.row] - Lay the entries out in one wrapping row, as a key over a plot or under a card title.
 * @param {string} [options.labelledBy] - Id of the heading that names the list.
 * @param {string} [options.hiddenNote] - Read after a hidden entry's label, which only the fade shows otherwise.
 * @returns {import('lit').TemplateResult}
 */
export function legendSwatchListTemplate(items, { row = false, labelledBy, hiddenNote } = {}) {
    const entries = items.map(
        (item) =>
            html`<div
                class=${item.hidden ? 'legend-swatch-item is-hidden' : 'legend-swatch-item'}
                role="listitem"
            >
                ${
                    item.mark ? html`<span class="legend-mark-slot">${item.mark}</span>` : nothing
                }<span
                    >${labelTemplate(item.label, item.labelSegments, item.glossaryKey)}${
                        item.hidden && hiddenNote
                            ? html`<span class="visually-hidden">, ${hiddenNote}</span>`
                            : nothing
                    }</span
                >
            </div>`,
    );
    const className = row ? 'legend-swatch-list legend-swatch-list--row' : 'legend-swatch-list';
    return html`<div class=${className} role="list" aria-labelledby=${labelledBy ?? nothing}>
        ${entries}
    </div>`;
}

/**
 * What a chart's key draws with besides its blocks: which series are on, what a click
 * asks, and how a display entry reads.
 * @typedef {object} ChartKeyPaint
 * @property {string} idPrefix - Prefixes the headings' ids (`nextLegendIdPrefix`), one per panel.
 * @property {string} hiddenNote - Read after the label of a display entry whose series is off.
 * @property {(group: string, key: string) => boolean} isShown - Whether a pill's series is on.
 * @property {(group: string, keys: string[]) => void} toggle - Flip a block's keys as one change: all off when any is on, else all on.
 * @property {(key: string) => boolean} entryShown - Whether the series a display entry names is on.
 * @property {(label: string) => Array<{text: string, glossaryKey?: string|null}>|null} textSegments - The glossary runs of a label that links none itself.
 */

/**
 * A chart's key as lit-html, for `render` into its panel: a change renders the panel
 * again, which patches the pills in place, so a resize neither rebuilds the pills nor
 * drops the keyboard focus sitting on one. A block with a `group` is a group of toggle
 * pills: a pill flips its key; a `masterLabel` adds a pill pressed while any entry is
 * on, which turns every entry off (or all on when none is); `toggleAll` makes the
 * heading that control. Any other block is a display-only list of marks.
 * @param {ChartKey} key
 * @param {ChartKeyPaint} paint
 * @returns {import('lit').TemplateResult[]}
 */
export function chartKeyTemplate(key, paint) {
    return key.map((block, index) => {
        const title = block.title ?? '';
        const glossaryKey = block.titleGlossaryKey ?? null;
        const id = title ? `${paint.idPrefix}-${index}` : undefined;
        const group = block.group;
        if (group === undefined) {
            const entries = block.items.map((item) => ({
                label: item.label ?? '',
                // A label without its own glossary link is annotated like any chart
                // text, so a term in it still opens its entry.
                labelSegments:
                    item.labelSegments ??
                    (item.glossaryKey ? null : paint.textSegments(item.label ?? '')),
                glossaryKey: item.glossaryKey,
                // An entry without a symbol or a colour is a line of text.
                mark: item.symbol || item.color ? legendMarkTemplate(item) : undefined,
                hidden: item.key != null && !paint.entryShown(item.key),
            }));
            return legendSectionTemplate(
                { title, glossaryKey, id },
                legendSwatchListTemplate(entries, { labelledBy: id, hiddenNote: paint.hiddenNote }),
            );
        }

        const keys = block.items.map((item) => /** @type {string} */ (item.key));
        const anyOn = keys.some((entry) => paint.isShown(group, entry));
        const toggleAll = () => paint.toggle(group, keys);
        const master = block.masterLabel
            ? legendPillTemplate({
                  label: block.masterLabel,
                  active: anyOn,
                  isMaster: true,
                  onClick: toggleAll,
              })
            : nothing;
        const pills = block.items.map((item) => {
            const entry = /** @type {string} */ (item.key);
            return legendPillTemplate({
                label: item.label ?? '',
                labelSegments: item.labelSegments,
                swatch: item.swatch,
                active: paint.isShown(group, entry),
                isChild: item.isChild === true,
                onClick: () => paint.toggle(group, [entry]),
            });
        });
        return legendSectionTemplate(
            {
                title,
                glossaryKey,
                id,
                onToggleAll: block.toggleAll ? toggleAll : null,
                pressed: anyOn,
            },
            legendPillGroupTemplate([master, pills], block.columns),
        );
    });
}
