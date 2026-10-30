/**
 * TeachingQualityConfig — ChartHostModule descriptor for the longitudinal
 * Unterrichtsqualität chart: the selected Bereich's rating bands across the years.
 */

import { RATING_SERIES } from '../../../utils/slRatingAppearance.js';
import { lineChartConfig, selectedDomainTimeline } from './longitudinalConfigHelpers.js';

// ============================================================================
// CONFIG DESCRIPTOR
// ============================================================================

export const teachingQualityConfig = lineChartConfig({
    glossaryPath: 'sl.longitudinal.lines.teaching-quality',
    seriesOf: (host) => ({
        timeline: selectedDomainTimeline(host, 'teachingQuality'),
        ...RATING_SERIES,
    }),
    followsBereich: true,
});
