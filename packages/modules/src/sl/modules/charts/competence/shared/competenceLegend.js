/**
 * The key blocks the SL charts share (`ChartRenderer.chartKey`): the Kompetenzstufen
 * swatch pills, the rating-band swatches and the Vergleich pills.
 */

import { PILLS, pillSection } from './competencePills.js';
import { TERM_CONSTANTS } from '../../../../../common/domain/terms.js';
import { slugifyCompetenceToken } from '../../../../../common/services/competenceLevelPalette.js';
import { getCompetenceAppearance } from '../../../../../common/services/themeService.js';
import { GLOSSARY_KEYS } from '../../../../../common/glossary/glossaryKeys.js';
import {
    RATING_CATEGORIES,
    formatRatingCategoryLabel,
} from '../../../../utils/slRatingDistribution.js';
import { ratingColor } from '../../../../utils/slRatingAppearance.js';
import {
    averageRoleGlossaryKey,
    buildLegendLabelSegments,
    ordinalShortLabelsByRole,
    SHORT_LABEL_PREFIX_BY_ROLE,
} from '../../../../../common/domain/comparisonGroupLabels.js';

/**
 * The token the Kompetenzstufen pills and their toggles are keyed on: the palette's
 * canonical name of the level, so two spellings of one level share a pill.
 * @param {import('../../../../../common/services/competenceLevelPalette.js').CompetenceLevelPalette} palette
 * @param {string} level - The competence level, in any input vocabulary
 * @param {string} [scaleId] - The ladder the level sits on; see `getCompetenceLevelEntry`
 * @returns {string} Slugified group token (e.g. 'ia', 'ib', 'a1')
 */
function getCompetenceLevelGroup(palette, level, scaleId) {
    return slugifyCompetenceToken(palette.getCompetenceLevelEntry(level, scaleId)?.name ?? level);
}

/**
 * The default when a caller knows no ladder: a bare name resolves as the palette does.
 * @returns {undefined} No scale.
 */
const noScale = () => undefined;

/**
 * Legend entries for the competence levels, one per level (see `getCompetenceLevelGroup`);
 * a name the palette reads as an earlier one's (another spelling) joins that entry.
 * @param {import('../../../../../common/services/competenceLevelPalette.js').CompetenceLevelPalette} palette
 * @param {string[]} competenceLevelNames
 * @param {(level: string) => string|undefined} scaleIdForLevel - The ladder a level resolves on
 * @returns {Array<{group: string, scaleId: string|undefined, label: string, appearance: import('../../../../../common/services/competenceLevelPaint.js').CompetenceAppearance | null}>} One entry per level, in scale order.
 */
function buildCompetenceLegendData(palette, competenceLevelNames, scaleIdForLevel) {
    /** @type {Map<string, LegendEntry & {label: string}>} */
    const entries = new Map();
    for (const level of competenceLevelNames) {
        const scaleId = scaleIdForLevel(level);
        const group = getCompetenceLevelGroup(palette, level, scaleId);
        if (entries.has(group)) continue;
        entries.set(group, {
            group,
            scaleId,
            appearance: getCompetenceAppearance(palette, level, scaleId),
            label: level,
        });
    }
    const legendData = [...entries.values()];

    // One ladder after the other, in the order the levels bring them in: positions on two
    // ladders do not compare, and interleaved they pair a competence level with a GER level
    // in the grid. Within a ladder, scale order (Ia before Ib).
    /** @type {Map<string|undefined, number>} */
    const scaleRank = new Map();
    for (const level of competenceLevelNames) {
        const scale = palette.getCompetenceLevelEntry(level, scaleIdForLevel(level))?.scaleId;
        if (!scaleRank.has(scale)) scaleRank.set(scale, scaleRank.size);
    }
    const rankOf = (/** @type {LegendEntry} */ entry) =>
        scaleRank.get(legendEntryScale(palette, entry)) ?? scaleRank.size;
    legendData.sort(
        (a, b) => rankOf(a) - rankOf(b) || legendSortKey(palette, a) - legendSortKey(palette, b),
    );
    return legendData;
}

/**
 * @typedef {{appearance: import('../../../../../common/services/competenceLevelPaint.js').CompetenceAppearance | null, group: string, scaleId: string|undefined}} LegendEntry
 */

/**
 * @param {import('../../../../../common/services/competenceLevelPalette.js').CompetenceLevelPalette} palette
 * @param {LegendEntry} entry
 * @returns {string|undefined} The ladder it sits on.
 */
function legendEntryScale(palette, entry) {
    return palette.getCompetenceLevelEntry(
        entry.appearance?.normalizedLevel ?? entry.group,
        entry.scaleId,
    )?.scaleId;
}

/**
 * @param {import('../../../../../common/services/competenceLevelPalette.js').CompetenceLevelPalette} palette
 * @param {LegendEntry} entry
 * @returns {number} Its position on its scale, so entries sort in scale order rather than alphabetically.
 */
function legendSortKey(palette, entry) {
    return palette.getCompetenceLevelOrdinal(
        entry.appearance?.normalizedLevel ?? entry.group,
        entry.scaleId,
    );
}

/**
 * The "Kompetenzstufen" key block both competence charts share: one swatch pill per
 * level.
 *
 * Entries stay keyed by level name — the toggles hide a level by name across every
 * row — so on a page holding two ladders that share a name, that name gets the swatch
 * of whichever ladder `scaleIdForLevel` names for it.
 * @param {import('../../../../../common/services/competenceLevelPalette.js').CompetenceLevelPalette} palette
 * @param {string[]} competenceLevelNames - Sorted.
 * @param {object} [options]
 * @param {(level: string) => string|undefined} [options.scaleIdForLevel] - The ladder a level resolves on; omitted, a name resolves to the scale that registered it last.
 * @returns {import('../../../../../common/charts/legend/htmlLegendPanel.js').ChartKeyBlock}
 */
export function buildCompetenceLevelKeyBlock(
    palette,
    competenceLevelNames,
    { scaleIdForLevel = noScale } = {},
) {
    const legendData = buildCompetenceLegendData(palette, competenceLevelNames, scaleIdForLevel);
    return {
        title: TERM_CONSTANTS.COMP_LEVELS,
        // Legend headings are set as textContent, so free-text annotation never reaches
        // them: the `kompetenzstufe` popup (whose body describes the loaded scales) is
        // stamped explicitly.
        titleGlossaryKey: GLOSSARY_KEYS.COMPETENCE_LEVEL,
        group: 'competence-level',
        columns: 2,
        items: legendData.map(({ group, label, appearance }) => ({
            key: group,
            label,
            swatch: { appearance },
        })),
    };
}

/**
 * The rating bands a survey bar stacks, one swatch each. They take the arms of the
 * competence-level ramp, so a chart that draws both needs this block beside the
 * Kompetenzstufen one, or the two scales read as one.
 * @param {string} title - What is rated, as the block's heading.
 * @returns {import('../../../../../common/charts/legend/htmlLegendPanel.js').ChartKeyBlock}
 */
export function buildRatingKeyBlock(title) {
    return {
        title,
        items: RATING_CATEGORIES.map((category) => ({
            key: category.key,
            label: formatRatingCategoryLabel(category),
            color: ratingColor(category.key),
        })),
    };
}

/**
 * One comparison population the competence charts draw a bar and a pill for.
 * @typedef {{key: string, name: string, type: string}} ComparisonTrack
 */

/**
 * The 'Vergleich' pills both competence charts draw: one per comparison track, tagged
 * by role (`L` for a Landesschnitt, `V` for a population the client has no term for) and
 * numbered when a role has several, then the Schulschnitt. The glossary key sits on the
 * term half of the label — the glossary defines *Landesschnitt*, not `L1 = Landesschnitt`
 * — and only a role the glossary has a term for gets one.
 * @param {ComparisonTrack[]} comparisonTracks - The comparison tracks, in draw order.
 * @param {{tracksHidden?: boolean, schoolHidden?: boolean}} [start] - Which pills start off.
 * @returns {Array<{key: string, label: string, labelSegments: Array<{text: string, glossaryKey: string|null}>, initiallyHidden: boolean}>} The pills, in draw order.
 */
export function buildComparisonLegendItems(
    comparisonTracks,
    { tracksHidden = false, schoolHidden = false } = {},
) {
    const prefixes = ordinalShortLabelsByRole(comparisonTracks.map((track) => track.type));
    return [
        ...comparisonTracks.map((track, index) => ({
            key: track.key,
            label: `${prefixes[index]} = ${track.name}`,
            labelSegments: buildLegendLabelSegments(
                prefixes[index],
                track.name,
                averageRoleGlossaryKey(track.type),
            ),
            initiallyHidden: tracksHidden,
        })),
        {
            key: 'school',
            label: `${SHORT_LABEL_PREFIX_BY_ROLE.school} = ${TERM_CONSTANTS.SCHOOL_AVERAGE}`,
            labelSegments: buildLegendLabelSegments(
                SHORT_LABEL_PREFIX_BY_ROLE.school,
                TERM_CONSTANTS.SCHOOL_AVERAGE,
                GLOSSARY_KEYS.SCHULSCHNITT,
            ),
            initiallyHidden: schoolHidden,
        },
    ];
}

/**
 * The 'Fächer' section both competence charts draw when their bars group by Fach: one
 * pill per Fach.
 * @param {string[]} subjects - The Fächer, in draw order.
 * @returns {import('../../../../../common/charts/legend/htmlLegendPanel.js').ChartKeyBlock}
 */
export function buildSubjectLegendSection(subjects) {
    return pillSection(
        PILLS.subject,
        TERM_CONSTANTS.SUBJECTS,
        subjects.map((subject) => ({ key: subject, label: subject })),
    );
}

/**
 * Whether a pill of the chart's key is on: `ChartRenderer.isSeriesShown`.
 * @typedef {(key: string, group: string) => boolean} SeriesShown
 */

/**
 * Which Kompetenzstufen the bars stack: a level whose swatch is off leaves every bar,
 * and the levels above it close the gap.
 * @param {SeriesShown} isShown
 * @param {import('../../../../../common/services/competenceLevelPalette.js').CompetenceLevelPalette} palette
 * @param {(level: string) => string|undefined} scaleIdForLevel - The ladder a level resolves on.
 * @returns {(level: string) => boolean} Whether a level is shown; resolved once per level, so made anew for each draw.
 */
export function buildLevelVisibility(isShown, palette, scaleIdForLevel) {
    /** @type {Map<string, boolean>} */
    const shownByLevel = new Map();
    return (level) => {
        let shown = shownByLevel.get(level);
        if (shown === undefined) {
            shown = isShown(
                getCompetenceLevelGroup(palette, level, scaleIdForLevel(level)),
                'competence-level',
            );
            shownByLevel.set(level, shown);
        }
        return shown;
    };
}
