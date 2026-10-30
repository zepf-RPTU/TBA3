/**
 * The "Leistung" section of a stats card, over one item or several pooled, so every card
 * reads the same figures under the same heading and labels: Lösungsquote, Richtig, Falsch, Unbearbeitet, Gesamt and Pilotierung
 * with its difference, in the one spelling of `pilotDiff.js`.
 */

import { escapeHtml, trusted } from '@tba3/module-base';
import { html } from 'lit';
import { formatCount, formatPercent } from './numberFormat.js';
import { pilotDiffHtml } from './pilotDiff.js';

/**
 * One label/value line of the section.
 * @typedef {object} DetailRow
 * @property {string} label - Plain-text label; the colon is added.
 * @property {string} valueHtml - The value as markup, escaped by the caller.
 * @property {'highlight'|'success'|'error'} [tone] - Emphasis for a value that stands out.
 */

/**
 * @typedef {object} ResultFigures
 * @property {number|null} rate - Lösungsquote, 0–100; `null` (nobody answered) prints the dash.
 * @property {{label: string, rate: number|null}} [selection] - A second Lösungsquote right below the first (the selected students', say).
 * @property {number} correct - Correct responses.
 * @property {number} incorrect - Incorrect responses.
 * @property {number} notAttempted - Unanswered responses.
 * @property {number} total - What the counts are of.
 * @property {'students'|'responses'} totalUnit - An item counts students; pooled items count responses, one per student and item.
 * @property {number|null} pilotRate - The Pilotierung's expected rate, 0–100; `null` leaves the row out.
 * @property {number|null} pilotDiffPP - The rate minus the pilot rate.
 */

/**
 * @param {import('../glossary/glossaryAnnotator.js').GlossaryAnnotator} glossary
 * @param {ResultFigures} figures
 * @returns {import('lit').TemplateResult}
 */
export function resultSectionTemplate(glossary, figures) {
    const label = (/** @type {string} */ key) =>
        glossary.getRequiredEntryText(`general.result-rows.${key}`);
    /** @type {DetailRow[]} */
    const rows = [
        { label: label('rate'), valueHtml: formatPercent(figures.rate), tone: 'highlight' },
    ];
    if (figures.selection) {
        rows.push({
            label: figures.selection.label,
            valueHtml: formatPercent(figures.selection.rate),
            tone: 'highlight',
        });
    }
    rows.push(
        { label: label('correct'), valueHtml: formatCount(figures.correct), tone: 'success' },
        { label: label('incorrect'), valueHtml: formatCount(figures.incorrect), tone: 'error' },
        { label: label('not-attempted'), valueHtml: formatCount(figures.notAttempted) },
        { label: label(`total-${figures.totalUnit}`), valueHtml: formatCount(figures.total) },
    );
    if (figures.pilotRate !== null) {
        const diff = figures.pilotDiffPP === null ? '' : ` ${pilotDiffHtml(figures.pilotDiffPP)}`;
        rows.push({ label: label('pilot'), valueHtml: formatPercent(figures.pilotRate, 0) + diff });
    }
    // The labels carry glossary terms (Lösungsquote, Pilotierung), linked as in the rest
    // of the card.
    const heading = `<h4>${escapeHtml(label('title'))}</h4>`;
    return html`<div class="detail-section">
        ${trusted(glossary.annotateHTML(heading + detailRowsHtml(rows)))}
    </div>`;
}

/**
 * @param {ReadonlyArray<DetailRow>} rows
 * @returns {string} One `.detail-row` per row.
 */
function detailRowsHtml(rows) {
    return rows
        .map(
            ({ label, valueHtml, tone }) => `
            <div class="detail-row">
                <span class="detail-label">${escapeHtml(label)}:</span>
                <span class="detail-value${tone ? ` ${tone}` : ''}">${valueHtml}</span>
            </div>`,
        )
        .join('');
}
