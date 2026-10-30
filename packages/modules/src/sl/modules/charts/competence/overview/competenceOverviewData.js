/**
 * The data side of the competence overview chart: the row shapes, and how the detail
 * chart's rows for the whole school become one row per Fach/Domäne whose bars — the
 * comparison tracks, the Schulschnitt and every group — each carry their own figures.
 * Pure.
 */

import { group } from 'd3-array';
import { formatChartSubjectDomainLabel } from '../../../../../common/charts/domainLabelFormatter.js';
import { compareText } from '../../../../../common/utils/compare.js';
import {
    ordinalShortLabelsByRole,
    SHORT_LABEL_PREFIX_BY_ROLE,
} from '../../../../../common/domain/comparisonGroupLabels.js';
import { populationLabel } from '../shared/competenceChartData.js';
import { prepareCompetenceDetailChartData } from '../detail/competenceDetailData.js';
import { selectCompetenceSlice } from '../../../../slCompetenceSlices.js';
import { domainsOfSubject } from '../../../../slCompetenceLevelIndex.js';
import { comparisonAverageId } from '../../../../utils/slQueryPrimitives.js';

/** @typedef {import('../shared/competenceLegend.js').ComparisonTrack} ComparisonTrack */

/**
 * One bar slot on the inner band scale, the same in every Fach/Domäne.
 * @typedef {object} OverviewSlot
 * @property {string} key - The slot's key: the track's `comparison:<id>`, `school`, or `group:<name>` — prefixed, so a group called "school" cannot collide.
 * @property {'comparison'|'school'|'group'} kind - What the bar stands for.
 * @property {string} label - The text above the bar: the track's short label, `S`, or the group name.
 * @property {string} subtitle - The tooltip's subtitle, the bar's `populationLabel`.
 */

/**
 * The figures one overview bar draws, and the Fach/Domäne its tooltip is titled with.
 * @typedef {import('../shared/competenceBar.js').CompetenceBarRow & {domain: string}} OverviewBarRow
 */

/**
 * One bar in a Fach/Domäne: its slot and its figures. `row` is `null` for a group
 * that did not sit this Fach, which shows its no-participation note instead.
 * @typedef {OverviewSlot & {row: OverviewBarRow|null}} OverviewBar
 */

/**
 * One Fach/Domäne of the overview.
 * @typedef {object} CompetenceOverviewRow
 * @property {string} domain - Slot key and tooltip title, `Fach` or `Fach: Domäne`.
 * @property {string} displayDomain - The label as drawn on the axis.
 * @property {string} subject
 * @property {string[]} competenceLevelNames - The scale's bands, in scale order.
 * @property {string|undefined} scaleId - The ladder those bands sit on.
 * @property {OverviewBar[]} bars - Its bars in draw order. A track this Fach has no value group for has no bar; its slot stays reserved.
 */

/**
 * @typedef {object} CompetenceOverviewData
 * @property {CompetenceOverviewRow[]} rows - One per Fach/Domäne, in draw order.
 * @property {OverviewSlot[]} slots - Every bar slot in draw order: the tracks, the Schulschnitt, the groups.
 * @property {ComparisonTrack[]} tracks - The delivered comparison tracks, in first-seen order.
 * @property {string[]} groupNames - The groups with results in any Fach, sorted.
 * @property {string[]} subjects - The Fächer, in first-seen order.
 */

/**
 * Prepares the overview from the competence-level index: one row per Fach/Domäne, each
 * bar with its own share, counts and headcount. The bars are the detail chart's rows for
 * the whole school, so both charts show the same figures.
 * @param {import('../../../../../common/services/competenceLevelPalette.js').CompetenceLevelPalette} palette
 * @param {import('../../../../slCompetenceLevelIndex.js').CompetenceLevelIndex} index
 * @returns {CompetenceOverviewData}
 */
export function prepareCompetenceOverviewData(palette, index) {
    const buckets = selectCompetenceSlice(index) ?? [];
    const rowsByDomain = group(
        prepareCompetenceDetailChartData(palette, buckets, { index }),
        (row) => row.domainIndex,
    );

    const drafts = [];
    for (const [domainIndex, bucket] of buckets.entries()) {
        const rows = rowsByDomain.get(domainIndex) ?? [];
        const school = rows.find((row) => row.type === 'school');
        if (!school?.competenceLevelNames.length) continue;

        const { subject, competenceLevelNames, scaleId } = school;
        const domainName = bucket[0].domain?.name;
        const hasSingleDomain = domainsOfSubject(index, subject).length === 1;
        const named = !hasSingleDomain && !!domainName;
        const domain = formatChartSubjectDomainLabel(subject, hasSingleDomain ? null : domainName, {
            abbreviate: false,
        });
        /**
         * @param {import('../detail/competenceDetailData.js').CompetenceChartRow} row - A detail row of this Fach/Domäne.
         * @returns {OverviewBarRow} Its figures, titled with the Fach/Domäne.
         */
        const barOf = (row) => ({
            domain,
            percentages: row.percentages,
            counts: row.counts,
            total: row.total,
            scaleId: row.scaleId,
        });

        drafts.push({
            domain,
            displayDomain: named ? formatChartSubjectDomainLabel(subject, domainName) : subject,
            subject,
            competenceLevelNames,
            scaleId,
            school: barOf(school),
            comparisons: new Map(
                rows
                    .filter((row) => row.type === 'comparison')
                    .map((row) => [row.renderKey, barOf(row)]),
            ),
            groups: new Map(
                rows
                    .filter((row) => row.type === 'group' && row.total)
                    .map((row) => [row.name, barOf(row)]),
            ),
        });
    }

    const delivered = new Set(drafts.flatMap((draft) => [...draft.comparisons.keys()]));
    /** @type {ComparisonTrack[]} */
    const tracks = index.comparisonTracks
        .map((track) => ({
            key: comparisonAverageId(track.id),
            name: track.name,
            type: track.type,
        }))
        .filter((track) => delivered.has(track.key));
    const groupNames = [...new Set(drafts.flatMap((draft) => [...draft.groups.keys()]))].sort(
        compareText,
    );
    const shortLabels = ordinalShortLabelsByRole(tracks.map((track) => track.type));

    /** @type {OverviewSlot[]} */
    const slots = [
        ...tracks.map((track, i) => ({
            key: track.key,
            kind: /** @type {const} */ ('comparison'),
            label: shortLabels[i],
            subtitle: populationLabel(track.type, track.name),
        })),
        {
            key: 'school',
            kind: 'school',
            label: SHORT_LABEL_PREFIX_BY_ROLE.school,
            subtitle: populationLabel('school', ''),
        },
        ...groupNames.map((name) => ({
            key: `group:${name}`,
            kind: /** @type {const} */ ('group'),
            label: name,
            subtitle: populationLabel('group', name),
        })),
    ];

    const rows = drafts.map(({ school, comparisons, groups, ...row }) => ({
        ...row,
        bars: slots.flatMap((slot) => {
            if (slot.kind === 'school') return [{ ...slot, row: school }];
            if (slot.kind === 'group') return [{ ...slot, row: groups.get(slot.label) ?? null }];
            const comparison = comparisons.get(slot.key);
            return comparison ? [{ ...slot, row: comparison }] : [];
        }),
    }));

    return {
        rows,
        slots,
        tracks,
        groupNames,
        subjects: [...new Set(rows.map((row) => row.subject))],
    };
}
