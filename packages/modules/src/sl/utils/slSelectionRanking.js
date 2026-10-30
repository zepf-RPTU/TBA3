/**
 * Picking the best candidate: the min/max-with-tie-break arithmetic the info-box
 * queries select "the group with the highest share" and "the widest range" with.
 * Domain-free: a selection is whatever the caller built.
 */

import { extent } from 'd3-array';
import { compareText } from '../../common/utils/compare.js';
import { isFiniteNumber } from '../../common/utils/numberFormat.js';

/**
 * What a selection verb reports: a Lerngruppe, Fach or Fach/Domäne with the figures it was
 * picked by. Its fields differ per verb and are read by name from the template
 * (`field=groupName`, `target=selection:<id>`); the fields every verb names it by are typed.
 * @typedef {{
 *     type?: string,
 *     target?: import('./slQueryPrimitives.js').QueryTarget,
 *     groupName?: string|null,
 *     subjectName?: string,
 *     domainId?: string|null,
 *     domainName?: string|null,
 *     [field: string]: unknown,
 * }} InfoBoxSelection
 */

/**
 * @typedef {object} FiniteRange
 * @property {number} min
 * @property {number} max
 */

/**
 * @param {ReadonlyArray<unknown>} values - Anything not a finite number is skipped.
 * @returns {FiniteRange|null} `null` when nothing was measurable.
 */
export function finiteRange(values) {
    const [min, max] = extent(values.filter(isFiniteNumber));
    return min === undefined || max === undefined ? null : { min, max };
}

/**
 * Whether `selection` wins a tie against `best`: the lower Lerngruppe name; between
 * Fächer or Domänen, the one listed first, as they come in payload order.
 * @param {InfoBoxSelection} selection
 * @param {InfoBoxSelection} best
 * @returns {boolean}
 */
const winsTie = (selection, best) =>
    compareText(selection.groupName ?? '', best.groupName ?? '') < 0;

/**
 * The single best selection by `valueOf` in `mode`. Equal figures are broken by
 * `winsTie`, so a template's "die stärkste Lerngruppe" does not move between renders.
 * @template {InfoBoxSelection} T
 * @param {ReadonlyArray<T|null>} selections - What to rank; `null` entries are skipped.
 * @param {(selection: T) => number} valueOf - The figure a selection is ranked by; non-finite figures are skipped.
 * @param {'min'|'max'} mode - Whether the lowest or the highest wins.
 * @returns {T|null} `null` when nothing was rankable.
 */
export function pickSelection(selections, valueOf, mode) {
    const sign = mode === 'min' ? -1 : 1;
    /** @type {T|null} */
    let best = null;
    for (const selection of selections) {
        if (selection === null || !Number.isFinite(valueOf(selection))) continue;
        const delta = best === null ? 1 : sign * (valueOf(selection) - valueOf(best));
        if (delta > 0 || (delta === 0 && winsTie(selection, /** @type {T} */ (best)))) {
            best = selection;
        }
    }
    return best;
}
