/**
 * The toggle pills of the SL competence charts' keys, and the rows they switch: one
 * vocabulary for the key a chart draws and the visibility it reads back, so no chart asks
 * for a pill under a block or key the key draws it by another. Pure.
 */

/**
 * A row a pill switches: a bar, or the fields a pill reads off an overview slot.
 * @typedef {{subject: string, domainLabel: string, type: string, name: string, renderKey: string}} CompetencePillRow
 */

/**
 * A kind of pill: the key block (`group`) its pills sit in, and the key a row is
 * switched by.
 * @typedef {object} CompetencePill
 * @property {string} group - The toggle block, as `ChartRenderer.isSeriesShown` reads it.
 * @property {(row: CompetencePillRow) => string} keyOf - The pill a row is switched by.
 */

/**
 * The key a Fach/Domäne pair goes by — its legend pill, its visibility and its bar slot
 * when grouped by group. Two Fächer can carry a Domäne of the same name, so neither half
 * alone identifies it.
 * @param {{subject: string, domainLabel: string}} row
 * @returns {string}
 */
export function rowSubjectDomainKey(row) {
    return `${row.subject}|${row.domainLabel}`;
}

/** The key of the Unterrichtsqualität's pill and of its bar slot in the detail chart. */
export const TEACHING_QUALITY_KEY = 'teachingQuality';

/**
 * The pills of a competence chart's key.
 * @type {Readonly<{subject: CompetencePill, area: CompetencePill, comparison: CompetencePill, learners: CompetencePill}>}
 */
export const PILLS = Object.freeze({
    /** One per Fach. */
    subject: Object.freeze({
        group: 'subject',
        keyOf: (/** @type {CompetencePillRow} */ row) => row.subject,
    }),
    /** One per Fach/Domäne pair (`Bereiche`). */
    area: Object.freeze({ group: 'domain', keyOf: rowSubjectDomainKey }),
    /** The Schulschnitt and each comparison track. */
    comparison: Object.freeze({
        group: 'comparison',
        keyOf: (/** @type {CompetencePillRow} */ row) =>
            row.type === 'school' ? 'school' : row.renderKey,
    }),
    /** One per Lerngruppe. */
    learners: Object.freeze({
        group: 'individual-group',
        keyOf: (/** @type {CompetencePillRow} */ row) => row.name,
    }),
});

/**
 * The pill a row's track goes by: its Lerngruppe's, or the comparison block's for the
 * school and a comparison track.
 * @param {CompetencePillRow} row
 * @returns {CompetencePill}
 */
export function trackPill(row) {
    return row.type === 'group' ? PILLS.learners : PILLS.comparison;
}

/**
 * Whether a pill is on.
 * @param {import('./competenceLegend.js').SeriesShown} isShown
 * @param {CompetencePill} pill
 * @param {string} key - The pill's key: `pill.keyOf(row)`, or a key the caller holds.
 * @returns {boolean} A pill the key does not draw is on.
 */
export function pillShown(isShown, pill, key) {
    return isShown(key, pill.group);
}

/**
 * A key block of one kind of pill.
 * @param {CompetencePill} pill
 * @param {string} title
 * @param {Array<import('../../../../../common/charts/legend/htmlLegendPanel.js').ChartKeyItem>} items
 * @param {Omit<Partial<import('../../../../../common/charts/legend/htmlLegendPanel.js').ChartKeyBlock>, 'title'|'group'|'items'>} [extra] - The block's other settings.
 * @returns {import('../../../../../common/charts/legend/htmlLegendPanel.js').ChartKeyBlock}
 */
export function pillSection(pill, title, items, extra = {}) {
    return { title, group: pill.group, ...extra, items };
}
