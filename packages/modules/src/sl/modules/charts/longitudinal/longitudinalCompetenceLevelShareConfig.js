/**
 * longitudinalCompetenceLevelShareConfig — ChartHostModule descriptor for the longitudinal
 * Kompetenzstufen distribution, a line chart in every mode.
 */

import { getCompetenceColor } from '../../../../common/services/themeService.js';
import {
    lineChartConfig,
    selectedDomainTimeline,
    selectedSubjectDomain,
} from './longitudinalConfigHelpers.js';

/**
 * The selected Bereich's Kompetenzstufen on its ladder (`competenceLevelNames`), the
 * current year's, in order: of it, the levels some year lists are drawn, a level a year
 * does not list at 0 % that year. ASSUMPTION-SL-HISTORY-SAME-LADDER: earlier years use that ladder too; a level
 * outside it is not drawn. Painted on the ladder's own ramp (`scaleId`), so a level name
 * another Fach on the page shares is painted with this Fach's ramp. No labels: the
 * categories are the scale's level names.
 * @param {import('./longitudinalConfigHelpers.js').LongitudinalHost<import('./longitudinalLineChart.js').LongitudinalLineChart>} host
 * @returns {Omit<import('./longitudinalLineChart.js').LineSeries, 'years'>}
 */
function competenceLevelSeries(host) {
    const subjectDomain = selectedSubjectDomain(host);
    const { palette } = host.options.context;
    return {
        timeline: selectedDomainTimeline(host, 'competenceLevelShares'),
        colorOf: (level) => getCompetenceColor(palette, level, subjectDomain?.scaleId),
        categoryOrder: subjectDomain?.competenceLevelNames ?? [],
    };
}

// ============================================================================
// CONFIG DESCRIPTOR
// ============================================================================

export const longitudinalCompetenceLevelShareConfig = lineChartConfig({
    glossaryPath: 'sl.longitudinal.lines.competence-level-distribution',
    seriesOf: competenceLevelSeries,
    followsBereich: true,
});
