/**
 * The side-panel key of the competence detail chart (`chartKey`). The pills' state lives
 * in the renderer base; which bars a toggle then leaves on is decided by
 * `competenceDetailVisibility.js`. Pure.
 */

import { buildLegendLabelSegments } from '../../../../../common/domain/comparisonGroupLabels.js';
import { deriveGroupNames } from '../../../../slCompetenceLevelIndex.js';
import {
    collectComparisonTrackRows,
    payloadOrder,
    rowsInPayloadOrder,
} from './competenceDetailData.js';
import {
    PILLS,
    pillSection,
    rowSubjectDomainKey,
    TEACHING_QUALITY_KEY,
} from '../shared/competencePills.js';
import { boxPlotKey } from '../../shared/boxPlotKey.js';
import {
    buildComparisonLegendItems,
    buildCompetenceLevelKeyBlock,
    buildRatingKeyBlock,
    buildSubjectLegendSection,
} from '../shared/competenceLegend.js';
import { TERM_CONSTANTS } from '../../../../../common/domain/terms.js';
import { TEACHING_QUALITY_TAG } from './competenceTeachingQuality.js';

/** @typedef {import('../../../../../common/charts/legend/htmlLegendPanel.js').ChartKeyItem} ChartKeyItem */
/** @typedef {import('../../../../../common/charts/legend/htmlLegendPanel.js').ChartKey} ChartKey */

const TEACHING_QUALITY_ITEM = Object.freeze({
    key: TEACHING_QUALITY_KEY,
    label: `${TEACHING_QUALITY_TAG} = ${TERM_CONSTANTS.TEACHING_QUALITY}`,
    labelSegments: buildLegendLabelSegments(
        TEACHING_QUALITY_TAG,
        TERM_CONSTANTS.TEACHING_QUALITY,
        'unterrichtsqualität',
    ),
});

/**
 * The Fach/Domäne pills, in payload order like the axis. With two Fächer that both carry
 * several Domänen, each such Fach's Domänen sit under a clickable heading of its own;
 * every other pill is flat. A Domäne's name links the entry for that Domäne of that
 * Fach, never a term the name would match.
 * @param {import('./competenceDetailData.js').CompetenceChartRow[]} chartData
 * @param {import('../../../../../common/glossary/glossaryAnnotator.js').GlossaryAnnotator} glossary
 * @returns {{headings: Array<{title: string, items: ChartKeyItem[]}>, flatItems: ChartKeyItem[], flatTitle: string, pillCount: number}} The headed and the flat pills, the flat pills' heading, and how many pills there are in all.
 */
function buildDomainLegendItems(chartData, glossary) {
    /** @type {Map<string, Map<string, import('./competenceDetailData.js').CompetenceChartRow>>} Fach → Domäne label → its first row */
    const domainsBySubject = new Map();
    for (const row of rowsInPayloadOrder(chartData)) {
        let domains = domainsBySubject.get(row.subject);
        if (!domains) domainsBySubject.set(row.subject, (domains = new Map()));
        if (!domains.has(row.domainLabel)) domains.set(row.domainLabel, row);
    }
    const needsHeadings =
        [...domainsBySubject.values()].filter((domains) => domains.size > 1).length > 1;

    const headings = [];
    /** @type {ChartKeyItem[]} */
    const flatItems = [];
    let pillCount = 0;
    // What the flat pills name: a Fach with one Domäne is a Fach pill, a Fach's several
    // Domänen are Domäne pills, and the heading says which — or `Bereiche` for both.
    let hasSubjectPill = false;
    let hasDomainPill = false;
    for (const [subject, domains] of domainsBySubject) {
        const rows = [...domains.values()];
        pillCount += rows.length;
        if (rows.length === 1) {
            hasSubjectPill = true;
            const abbrev = subject.charAt(0);
            flatItems.push({
                key: rowSubjectDomainKey(rows[0]),
                label: `${abbrev} = ${subject}`,
                labelSegments: buildLegendLabelSegments(abbrev, subject),
                isChild: false,
            });
            continue;
        }
        const items = rows.map((row) => ({
            key: rowSubjectDomainKey(row),
            label: `${row.displayDomainLabel} = ${row.domainLabel}`,
            labelSegments: buildLegendLabelSegments(
                row.displayDomainLabel,
                row.domainLabel,
                glossary.resolveDomainEntryKey(row.domain, row.subject),
            ),
            isChild: needsHeadings,
        }));
        if (needsHeadings) {
            headings.push({ title: subject, items });
        } else {
            hasDomainPill = true;
            flatItems.push(...items);
        }
    }
    let flatTitle = TERM_CONSTANTS.AREAS;
    if (!hasDomainPill) flatTitle = TERM_CONSTANTS.SUBJECTS;
    else if (!hasSubjectPill) flatTitle = TERM_CONSTANTS.DOMAINS;
    return { headings, flatItems, flatTitle, pillCount };
}

/**
 * The detail chart's key: a Fach pill each when the bars group by Fach, otherwise
 * Fach/Domäne pills (grouped under a clickable Fach heading when two Fächer both carry
 * several Domänen), the comparison pills (comparison tracks, Schulschnitt; with
 * `averagesHidden` they start off, the Schulschnitt only beside group bars), the
 * Unterrichtsqualität pill beside the slots it shares a group
 * with (the Domänen grouped by group, the tracks otherwise), group pills when the bars
 * group by Fach or by group, the Kompetenzstufen swatch pills, and with the Unterrichtsqualität boxes the
 * reading key every SL box plot shows, with its bars the rating bands they stack.
 * @param {import('../../../../../common/services/competenceLevelPalette.js').CompetenceLevelPalette} palette
 * @param {import('../../../../../common/glossary/glossaryAnnotator.js').GlossaryAnnotator} glossary - Links each Domäne pill to its entry.
 * @param {import('./competenceDetailRenderer.js').DetailModel} model
 * @param {{boxPlot: boolean, averagesHidden: boolean}} display - Whether the Unterrichtsqualität draws as boxes, and whether the averages start off.
 * @returns {ChartKey}
 */
export function buildDetailKey(palette, glossary, model, { boxPlot, averagesHidden }) {
    const { chartData, groupingConfig, hasTeachingQuality } = model;
    const groupRows = chartData.filter((d) => d.type === 'group');
    const trackItems = buildComparisonLegendItems(
        collectComparisonTrackRows(chartData).map((entry) => ({
            key: entry.renderKey,
            name: entry.name,
            // Every comparison row carries it, set from the payload.
            type: /** @type {string} */ (entry.comparisonType),
        })),
        // Without group rows the school is what the chart shows, not an average beside it.
        { tracksHidden: averagesHidden, schoolHidden: averagesHidden && groupRows.length > 0 },
    );
    const qualityItems = hasTeachingQuality ? [TEACHING_QUALITY_ITEM] : [];

    /** @type {ChartKey} */
    const sections = [];
    if (groupingConfig.groupBySubject) {
        // Grouped by Fach, one pill per Fach: Domäne pills for
        // every Fach would outgrow the panel. Q is a slot beside the tracks, and the
        // Schulschnitt pill is always among them.
        sections.push(
            buildSubjectLegendSection(payloadOrder(chartData, (d) => d.subject)),
            pillSection(PILLS.comparison, TERM_CONSTANTS.COMPARISON, [
                ...trackItems,
                ...qualityItems,
            ]),
        );
    } else {
        const { headings, flatItems, flatTitle, pillCount } = buildDomainLegendItems(
            chartData,
            glossary,
        );
        // Grouped by group, the school and each comparison are x-axis groups of their
        // own, and Q is a slot beside the Domänen inside each group. Grouped by Domäne,
        // the school, each comparison and Q are slots beside the group's bars. Either way
        // each has its pill, in the block the bar visibility reads it from.
        const qualityPill = groupingConfig.pills.quality;
        const slotQualityItems = qualityPill === PILLS.area ? qualityItems : [];
        const comparisonItems = [
            ...trackItems,
            ...(qualityPill === PILLS.comparison ? qualityItems : []),
        ];
        for (const heading of headings) {
            sections.push(
                pillSection(PILLS.area, heading.title, heading.items, { toggleAll: true }),
            );
        }
        // A single Domäne cannot be meaningfully hidden, so it gets no pill, unless
        // Q stays beside it.
        const slotItems =
            pillCount + slotQualityItems.length > 1 ? [...flatItems, ...slotQualityItems] : [];
        if (slotItems.length > 0) {
            sections.push(
                pillSection(
                    PILLS.area,
                    flatItems.length > 0 ? flatTitle : TERM_CONSTANTS.AREAS,
                    slotItems,
                ),
            );
        }
        if (comparisonItems.length > 0) {
            sections.push(
                pillSection(PILLS.comparison, TERM_CONSTANTS.COMPARISON, comparisonItems),
            );
        }
    }

    const groupNames = deriveGroupNames(groupRows);
    if (!groupingConfig.groupByDomain && groupNames.length > 1) {
        sections.push(
            pillSection(
                PILLS.learners,
                TERM_CONSTANTS.GROUPS,
                groupNames.map((groupName) => ({
                    key: groupName,
                    label: groupName,
                    isChild: true,
                })),
                { columns: 2 },
            ),
        );
    }
    sections.push(
        buildCompetenceLevelKeyBlock(palette, model.levels.competenceLevelNames, {
            scaleIdForLevel: model.levels.scaleIdForLevel,
        }),
    );
    // As bars, the Q columns stack rating bands in the Kompetenzstufen hues: their own
    // block says which scale a band belongs to.
    if (hasTeachingQuality && !boxPlot) {
        sections.push(
            buildRatingKeyBlock(`${TERM_CONSTANTS.TEACHING_QUALITY} (${TEACHING_QUALITY_TAG})`),
        );
    }
    if (boxPlot) sections.push(...boxPlotKey());
    return sections;
}
