/**
 * The side-panel key of the competence overview chart (`chartKey`), and which bar slot
 * each pill toggles. What a toggle does to the SVG lives in `competenceOverviewLayout.js`.
 */

import {
    buildComparisonLegendItems,
    buildCompetenceLevelKeyBlock,
    buildSubjectLegendSection,
} from '../shared/competenceLegend.js';
import { TERM_CONSTANTS } from '../../../../../common/domain/terms.js';
import { PILLS, pillSection, pillShown } from '../shared/competencePills.js';

/**
 * The key: Fächer, Vergleich (one pill per delivered comparison plus the Schulschnitt),
 * Lerngruppen behind a derived master pill where any group has results, and the shared
 * Kompetenzstufen block. Only the Schulschnitt bar starts on: the comparisons and
 * Lerngruppen are pills a viewer switches on.
 * @param {import('../../../../../common/services/competenceLevelPalette.js').CompetenceLevelPalette} palette
 * @param {import('./competenceOverviewData.js').CompetenceOverviewData} overview
 * @param {string[]} competenceLevelNames - The scale's bands, in scale order.
 * @param {(level: string) => string|undefined} scaleIdForLevel - The ladder a bare level name resolves on.
 * @returns {import('../../../../../common/charts/legend/htmlLegendPanel.js').ChartKey}
 */
export function buildOverviewKey(palette, overview, competenceLevelNames, scaleIdForLevel) {
    return [
        buildSubjectLegendSection(overview.subjects),
        pillSection(
            PILLS.comparison,
            TERM_CONSTANTS.COMPARISON,
            buildComparisonLegendItems(overview.tracks, { tracksHidden: true }),
        ),
        // Without a group there is nothing for the master pill to switch.
        ...(overview.groupNames.length > 0
            ? [
                  pillSection(
                      PILLS.learners,
                      TERM_CONSTANTS.GROUPS,
                      overview.groupNames.map((groupName) => ({
                          key: groupName,
                          label: groupName,
                          isChild: true,
                          initiallyHidden: true,
                      })),
                      { masterLabel: TERM_CONSTANTS.GROUPS, columns: 2 },
                  ),
              ]
            : []),
        buildCompetenceLevelKeyBlock(palette, competenceLevelNames, { scaleIdForLevel }),
    ];
}

/**
 * Whether a bar slot's pill is on: a group's in Lerngruppen (keyed by its name), a
 * comparison track's or the Schulschnitt's in Vergleich (keyed by the slot key).
 * @param {import('./competenceOverviewData.js').OverviewSlot} slot
 * @param {import('../shared/competenceLegend.js').SeriesShown} isShown
 * @returns {boolean}
 */
export function isSlotShown(slot, isShown) {
    return slot.kind === 'group'
        ? pillShown(isShown, PILLS.learners, slot.label)
        : pillShown(isShown, PILLS.comparison, slot.key);
}
