/**
 * Kompetenzstufen legend section — builds and writes the HTML legend panel.
 *
 * The only DOM writer among the shared competency-chart helpers.
 */

import {
    applyCompetencyBandPaint,
    sortCompetencyLevels,
} from '../../../../../common/charts/chartUtils.js';
import {
    createHtmlLegendPill,
    createHtmlLegendPillGroup,
    createHtmlLegendSection,
} from '../../../../../common/charts/legend/htmlLegendPanel.js';
import { TERM_CONSTANTS } from '../../../../../common/domain/terms.js';
import {
    getCompetencyBand,
    getCompetencyLevelOrdinal,
    getScaleLevelNames,
    slugifyCompetencyToken,
} from '../../../../../common/services/competenceLevelPalette.js';
import { glossaryAnnotator } from '../../../../../common/glossary/glossaryAnnotator.js';
import { getCompetencyAppearance } from '../../../../../common/services/themeService.js';
import { GLOSSARY_KEYS } from '../../../../../common/glossary/glossaryKeys.js';
import {
    buildLegendLabelSegments,
    ordinalShortLabel,
} from '../../../../../common/domain/comparisonGroupLabels.js';
import './competencyLegendRender.css';

/**
 * Group name for levels that render identically — the key legends and visibility
 * toggles are keyed on. Every level now resolves to its own color (levels sharing a
 * band are separated by lightness), so each one is its own group.
 * @param {string} level - The competence level, in any input vocabulary
 * @param {string} [scaleId] - The ladder the level sits on; see `getCompetencyBand`
 * @returns {string} Slugified group token (e.g. 'ia', 'ib', 'a1')
 */
function getCompetencyLevelGroup(level, scaleId) {
    return slugifyCompetencyToken(getCompetencyBand(level, scaleId)?.name ?? level);
}

/**
 * The default when a caller knows no ladder: a bare name resolves as the palette does.
 * @returns {undefined} No scale.
 */
const noScale = () => undefined;

/**
 * Level names a group covers. With `useAllPossibleLevels` the names come from the
 * registered scale rather than from what this class happens to have, so the overview
 * legend reads "Stufe I, Ib" even when only one of them occurred. The scale is data-
 * driven, so there is no per-notation table to keep in sync.
 * @param {string} group - The colour group whose levels are being listed.
 * @param {Set<string>} actualLevels - The levels this class actually has.
 * @param {boolean} useAllPossibleLevels - Prefer the registered scale's names over the observed ones.
 * @param {(level: string) => string|undefined} scaleIdForLevel - The ladder a level resolves on.
 * @returns {string[]} The level names for this group, in scale order.
 */
function getLegendDisplayLevels(group, actualLevels, useAllPossibleLevels, scaleIdForLevel) {
    const sortedActualLevels = sortCompetencyLevels(Array.from(actualLevels), scaleIdForLevel);
    if (!useAllPossibleLevels || sortedActualLevels.length === 0) {
        return sortedActualLevels;
    }

    const scaleId = scaleIdForLevel(sortedActualLevels[0]);
    const scaleLevels = getScaleLevelNames(sortedActualLevels[0], scaleId).filter(
        (name) => getCompetencyLevelGroup(name, scaleId) === group,
    );

    return scaleLevels.length > 0 ? scaleLevels : sortedActualLevels;
}

/**
 * Build legend data for competency levels grouped by visual style. Every level owns a
 * distinct color — levels sharing a band differ in lightness — so each gets its own
 * legend entry.
 * @param {string[]} competencyLevels - Array of competency level identifiers
 * @param {Function} colorScale - Function mapping level to color
 * @param {object} [options={}] - Options
 * @param {boolean} [options.useAllPossibleLevels=true] - Show all possible level names vs only actual
 * @param {(level: string) => string|undefined} [options.scaleIdForLevel] - The ladder a level resolves on
 * @returns {Array<{group: string, color: string, displayText: string, appearance: object | null}>} One entry per level, in scale order.
 */
function buildCompetencyLegendData(
    competencyLevels,
    colorScale,
    { useAllPossibleLevels = true, scaleIdForLevel = noScale } = {},
) {
    const colorGroups = new Map();
    competencyLevels.forEach((level) => {
        const group = getCompetencyLevelGroup(level, scaleIdForLevel(level));
        if (!colorGroups.has(group)) {
            colorGroups.set(group, {
                color: colorScale(level),
                // Any member paints the group, so the first one represents it. Read the
                // appearance off a real level — the group token is not itself a level.
                representativeLevel: level,
                actualLevels: new Set(),
            });
        }
        colorGroups.get(group).actualLevels.add(level);
    });

    const legendData = Array.from(colorGroups.entries()).map(([group, data]) => {
        const displayLevels = getLegendDisplayLevels(
            group,
            data.actualLevels,
            useAllPossibleLevels,
            scaleIdForLevel,
        );
        const scaleId = scaleIdForLevel(data.representativeLevel);
        const appearance = getCompetencyAppearance(data.representativeLevel, scaleId);
        return {
            group,
            scaleId,
            color: appearance?.baseColor || data.color,
            appearance,
            displayText: `Stufe ${displayLevels.join(', ')}`,
        };
    });

    // Scale order: band position first, sub-band position within it — so Ia precedes Ib.
    legendData.sort((a, b) => legendSortKey(a) - legendSortKey(b));
    return legendData;
}

/**
 * @param {{appearance: object | null, group: string, scaleId: string|undefined}} entry - One legend entry.
 * @returns {number} Its position on the scale, so entries sort in scale order rather than alphabetically.
 */
function legendSortKey(entry) {
    return getCompetencyLevelOrdinal(
        entry.appearance?.normalizedLevel ?? entry.group,
        entry.scaleId,
    );
}

/**
 * Render the shared "Kompetenzstufen" legend section (swatch pills) into an HTML
 * legend panel. Both competency renderers render this identically; the only
 * caller-visible difference is whether all possible level names are shown
 * (overview) or just the actual ones (detail).
 *
 * Entries stay keyed by level name — the toggles hide a level by name across every
 * row — so on a page holding two ladders that share a name, that name gets the swatch
 * of whichever ladder `scaleIdForLevel` names for it.
 * @param {HTMLElement} panel - Legend panel container
 * @param {string[]} competencyLevels - Sorted competency level identifiers
 * @param {Function} colorScale - level -> color
 * @param {object} [options] - Which level names the section lists.
 * @param {boolean} [options.useAllPossibleLevels=true] - List the registered scale's names (overview) rather than only the observed ones (detail).
 * @param {(level: string) => string|undefined} [options.scaleIdForLevel] - The ladder a level resolves on; omitted, a name resolves to the scale that registered it last.
 * @returns {{ ksGroupOrder: string[], ksLevelToGroup: Map<string,string> }} The legend groups in draw order, and the level → group mapping the toggles work through.
 */
export function renderCompetencyLevelLegendSection(
    panel,
    competencyLevels,
    colorScale,
    { useAllPossibleLevels = true, scaleIdForLevel = noScale } = {},
) {
    const legendData = buildCompetencyLegendData(competencyLevels, colorScale, {
        useAllPossibleLevels,
        scaleIdForLevel,
    });
    const ksGroupOrder = legendData.map((d) => d.group);
    const ksLevelToGroup = new Map(
        competencyLevels.map((level) => [
            level,
            getCompetencyLevelGroup(level, scaleIdForLevel(level)),
        ]),
    );

    // Legend headings are set as textContent, so free-text annotation never reaches
    // them — the `KS` popup (whose body describes the loaded scales) is stamped
    // explicitly instead, via the option the panel already offers.
    const { section: ksSection } = createHtmlLegendSection(
        panel,
        TERM_CONSTANTS.COMP_LEVELS,
        glossaryAnnotator.isInitialized
            ? {
                  headingClassName: 'legend-section-title glossary-term',
                  headingAttributes: { 'data-glossary-key': 'KS' },
              }
            : {},
    );
    const ksGroup = createHtmlLegendPillGroup(ksSection);
    ksGroup.classList.add('ks-legend-pills');
    legendData.forEach(({ group, displayText, appearance }) => {
        const pill = createHtmlLegendPill(ksGroup, {
            label: displayText.replace(/^Stufe /, ''),
            dataType: 'competency-level',
            dataValue: group,
            active: true,
        });
        const swatch = document.createElement('span');
        swatch.className = `legend-pill-swatch niveaustufen-swatch competency-level level-${group}`;
        if (appearance) applyCompetencyBandPaint(swatch, appearance);
        pill.prepend(swatch);
    });

    return { ksGroupOrder, ksLevelToGroup };
}

/**
 * The 'Vergleich' pills both competency charts draw: one per state track, tagged
 * `L<n>` when there are several, then the Schulschnitt. The glossary key sits on
 * the term half of the label — the glossary defines *Landesschnitt*, not
 * `L1 = Landesschnitt`.
 * @param {Array<{key: string, name: string}>} stateTracks - The state tracks, in draw order.
 * @returns {Array<{key: string, label: string, labelSegments: Array<{text: string, glossaryKey: string|null}>}>} The pills, in draw order.
 */
export function buildComparisonLegendItems(stateTracks) {
    return [
        ...stateTracks.map((track, index) => {
            const prefix = ordinalShortLabel('L', index, stateTracks.length);
            return {
                key: track.key,
                label: `${prefix} = ${track.name}`,
                labelSegments: buildLegendLabelSegments(
                    prefix,
                    track.name,
                    GLOSSARY_KEYS.LANDESSCHNITT,
                ),
            };
        }),
        {
            key: 'school',
            label: 'S = Schulschnitt',
            labelSegments: buildLegendLabelSegments(
                'S',
                'Schulschnitt',
                GLOSSARY_KEYS.SCHULSCHNITT,
            ),
        },
    ];
}
