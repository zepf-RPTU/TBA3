/**
 * Pure data preparation common to the SL Kompetenzstufen charts:
 * the row shapes, the comparison and school lookups, tooltip rows and the level list.
 * The rows themselves are built in each chart's own data module. No D3, no DOM.
 */

import { sortCompetenceLevels } from '../../../../../common/services/competenceLevelPaint.js';
import { TERM_CONSTANTS } from '../../../../../common/domain/terms.js';
import {
    hasAnyShare,
    readDistribution,
} from '../../../../../common/domain/competenceLevelShare.js';
import { shareRows } from '../../../../../common/charts/shareRows.js';
import { figureCell, shareCountCell } from '../../../../../common/charts/dataTableCells.js';
import { formatCount } from '../../../../../common/utils/numberFormat.js';

/** @typedef {{[level: string]: number}} LevelFigures */

/**
 * A `competence-levels.json` value group as the competence charts read it: one with a Fach.
 * @typedef {import('../../../../../common/data/schemas/competenceLevels.js').CurrentCompetenceLevelsValueGroup & {
 *     subject: {name: string},
 * }} SubjectCompetenceLevelsValueGroup
 */

/**
 * A persisted comparison distribution for one Fach/Domäne, one per comparison value group.
 * @typedef {object} ComparisonDistribution
 * @property {import('../../../../../common/data/schemas/competenceLevels.js').CompetenceLevelsValueGroup} entry
 * @property {LevelFigures} percentages - Share per band in percent.
 * @property {LevelFigures} counts - Headcount per band.
 * @property {number} total - Headcount the shares are of.
 * @property {string|undefined} scaleId - The registered ladder the comparison value group's levels sit on.
 */

/**
 * Who a competence bar counts, as both competence charts' tooltips name it: `Schule`,
 * `Lerngruppe <name>`, or a comparison population's own name.
 * @param {string|undefined} type - The row's type: `school`, `group`, or a comparison.
 * @param {string} name - The row's name: the group, or the comparison population.
 * @returns {string}
 */
export function populationLabel(type, name) {
    if (type === 'school') return 'Schule';
    if (type === 'group') return `${TERM_CONSTANTS.GROUP} ${name}`;
    return name;
}

/**
 * The school-wide distribution of one Fach/Domäne, read off the payload's own school value group.
 * Every competence row reads it, so every competence chart shows the same Schulschnitt.
 *
 * A payload without that value group has no Schulschnitt: the bar stays empty (its tooltip says
 * "keine Daten"). Summing the groups instead
 * would pass off a different population as the school — every student not in a listed
 * group, or in a group that did not sit this Fach, would be missing from it.
 * The index that hands out the value group reports a missing one, once per dataset.
 * @param {import('../../../../../common/data/schemas/competenceLevels.js').CompetenceLevelsValueGroup|null} schoolEntry - The school's value group of the Fach/Domäne (`CompetenceLevelIndex.schoolFor`), or `null`.
 * @returns {{total: number, percentages: LevelFigures, counts: LevelFigures}} The headcount, the share per band in percent, and the count per band; all empty without a school value group.
 */
export function resolveSchoolDistribution(schoolEntry) {
    return schoolEntry
        ? readDistribution(schoolEntry.competenceLevels)
        : { total: 0, percentages: {}, counts: {} };
}

/**
 * A competence bar's own row, as its tooltip and its table row read it.
 * @typedef {{percentages: LevelFigures, counts?: LevelFigures|null, total?: number|null}} CompetenceFiguresRow
 */

/**
 * Whether a bar counts anybody: it has a headcount, or — a Landesschnitt may deliver the
 * shares alone (`readLevelShare`) — a share. A counted value group of nobody and a
 * missing Schulschnitt have neither.
 * @param {CompetenceFiguresRow|null|undefined} barRow
 * @returns {barRow is CompetenceFiguresRow}
 */
function isMeasured(barRow) {
    return Boolean(barRow && (barRow.total || hasAnyShare(barRow.percentages)));
}

/**
 * The bar's headcount per band, where its row counts one: `null` for a row without counts
 * or without a `total`, whose figures are shares alone.
 * @param {CompetenceFiguresRow} barRow
 * @param {string} level
 * @returns {number|null}
 */
function countOf(barRow, level) {
    return barRow.counts && barRow.total ? (barRow.counts[level] ?? 0) : null;
}

/**
 * The rows of a competence bar tooltip.
 *
 * Every figure is read off the bar's own row — its share, its `frequency` per band and
 * its `total` — never estimated from the share and never taken from the slot the bar
 * stands in: an overview group bar sits in its Fach's slot, whose headcount is the
 * school's.
 * @param {CompetenceFiguresRow|null|undefined} barRow - The bar's own row.
 * @param {string} level
 * @returns {Array<import('../../../../../common/services/cursorTooltip.js').TooltipRow|false>|null} The tooltip rows, no count row for a row that carries no counts or no headcount; `null` for a bar with no students, whose tooltip is `competenceNoDataTooltip()`.
 */
export function buildCompetenceTooltipRows(barRow, level) {
    if (!isMeasured(barRow)) return null;

    return shareRows({
        label: TERM_CONSTANTS.COMP_LEVEL,
        value: level,
        share: barRow.percentages[level] ?? 0,
        count: countOf(barRow, level),
        total: barRow.total,
    });
}

/**
 * A competence bar's figures as data table cells, in `shareCountColumns(levels)` order, read
 * off the bar's own row as its tooltip is. A bar of nobody, and a level its ladder does
 * not have, are empty cells; a level of its ladder nobody reached is a measured 0. A row
 * of shares alone has no headcount cell and no counts.
 * @param {CompetenceFiguresRow|null|undefined} barRow - The bar's own row; `null` for a group that did not sit the Fach.
 * @param {string[]} levels - The Kompetenzstufen shown, in scale order.
 * @param {string[]} ladder - The bar's own Kompetenzstufen.
 * @returns {import('../../../../../common/charts/host/chartDataTable.js').ChartDataCell[]}
 */
export function competenceBarCells(barRow, levels, ladder) {
    const measured = isMeasured(barRow);
    return [
        figureCell(barRow?.total || null, formatCount),
        ...levels.map((level) =>
            measured && ladder.includes(level)
                ? shareCountCell(barRow.percentages[level] ?? 0, countOf(barRow, level))
                : shareCountCell(null),
        ),
    ];
}

/**
 * The rows can sit on several ladders (a chart may stack every Fach), and two ladders
 * can share a level name (`KS 2 … KS 5` in two Fächer). So a level is resolved on the
 * ladder of the row being painted, and where only a name is known (the union list, the
 * legend) on the ladder of the first row that carries it: a shared name gets one swatch.
 * @param {import('../../../../../common/services/competenceLevelPalette.js').CompetenceLevelPalette} palette
 * @param {Array<{competenceLevelNames?: string[], scaleId?: string}>} chartData
 * @returns {{competenceLevelNames: string[], scaleIdForLevel: (level: string) => string|undefined}} The union of bands in scale order, and the ladder a bare name resolves on.
 */
export function prepareCompetenceLevelNames(palette, chartData) {
    const allLevels = new Set();
    /** @type {Map<string, string|undefined>} level → ladder of the first row carrying it that names one */
    const scaleIdByLevel = new Map();
    chartData.forEach((data) => {
        if (data.competenceLevelNames) {
            data.competenceLevelNames.forEach((level) => {
                allLevels.add(level);
                if (scaleIdByLevel.get(level) === undefined)
                    scaleIdByLevel.set(level, data.scaleId);
            });
        }
    });
    /**
     * @param {string} level
     * @returns {string|undefined} The ladder of the first row carrying it.
     */
    const scaleIdForLevel = (level) => scaleIdByLevel.get(level);
    const competenceLevelNames = sortCompetenceLevels(
        palette,
        Array.from(allLevels),
        scaleIdForLevel,
    );
    return { competenceLevelNames, scaleIdForLevel };
}

/**
 * The persisted comparison distributions for one Fach/Domäne, one per comparison value group
 * that carries a share (a state split by track ships several); a value group of nobody, all
 * zeros, has no distribution to draw.
 * @param {import('../../../../../common/services/competenceLevelPalette.js').CompetenceLevelPalette} palette
 * @param {import('../../../../../common/data/schemas/competenceLevels.js').CompetenceLevelsValueGroup[]} comparisonEntries - The comparison value groups of the Fach/Domäne (`CompetenceLevelIndex.comparisonsFor`).
 * @returns {ComparisonDistribution[]} One item per usable value group, with the comparison value group's own counts and headcount.
 */
export function lookupComparisonDistributions(palette, comparisonEntries) {
    return comparisonEntries.flatMap((entry) => {
        const levels = entry.competenceLevels;
        const distribution = readDistribution(levels);
        if (!hasAnyShare(distribution.percentages)) return [];
        return { entry, ...distribution, scaleId: palette.scaleIdOf(entry) };
    });
}

/**
 * The tooltip of a bar with no students: the no-data message alone, as the chart says it.
 * @param {import('../../../../../common/glossary/glossaryAnnotator.js').GlossaryAnnotator} glossary
 * @returns {import('../../../../../common/services/cursorTooltip.js').TooltipContent} The message as the title.
 */
export function competenceNoDataTooltip(glossary) {
    return { title: glossary.getRequiredEntryText('general.messages.no-data-short') };
}
